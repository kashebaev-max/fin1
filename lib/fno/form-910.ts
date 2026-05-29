// Форма 910.00 — Упрощённая декларация для субъектов малого бизнеса.
// Сдаётся раз в полугодие. Налог: 4% от дохода (с 2026 — может быть 6% или другая ставка).

import { SupabaseClient } from "@supabase/supabase-js";

export interface F910Data {
  // Реквизиты налогоплательщика
  tin: string; // БИН/ИИН
  taxpayer_name: string;
  ogrn: string; // ОКЭД
  
  // Период
  year: number;
  half_year: 1 | 2; // 1 = январь-июнь, 2 = июль-декабрь
  
  // Тип декларации
  declaration_type: "initial" | "additional" | "corrective";
  
  // ОСНОВНЫЕ ДАННЫЕ (Раздел "Сведения о доходах")
  income_total: number;      // 910.00.001 — Доход за полугодие
  income_employees_avg: number; // среднесписочная численность
  
  // Налоги к начислению
  tax_rate: number; // 4 для упрощёнки в РК
  tax_amount: number; // 910.00.005 — налог 4%
  
  // ИПН и СН с зарплат сотрудников (если есть)
  ipn_employees: number;
  social_tax_employees: number;
  
  // Социальные платежи
  opv_amount: number;        // ОПВ — 10% от ФОТ
  opvr_amount: number;       // ОПВР — 3.5%
  vosms_amount: number;      // ВОСМС — 2%
  oosms_amount: number;      // ООСМС — 3%
  social_contributions: number; // СО — 5%
  
  // ИТОГО
  total_to_pay: number;
}

const FORM_CODE = "910.00";
const FORM_NAME = "Упрощённая декларация для субъектов малого бизнеса";

// ═══ АВТОМАТИЧЕСКИЙ РАСЧЁТ из учётных данных ═══

export async function calculate910(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  halfYear: 1 | 2
): Promise<F910Data> {
  const startMonth = halfYear === 1 ? 0 : 6;
  const endMonth = halfYear === 1 ? 5 : 11;
  const startDate = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(endMonth + 1).padStart(2, "0")}-${endMonth === 5 ? 30 : 31}`;

  // Получаем профиль
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();

  // Получаем все доходные проводки за период
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", userId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  let income = 0;
  (entries || []).forEach(e => {
    const cr = String(e.credit_account || "");
    if (cr === "6010") income += Number(e.amount);
  });

  // Сотрудники для ФОТ и социальных
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  const monthlyPayroll = (employees || []).reduce((a, e) => a + Number(e.salary || 0), 0);
  const halfYearPayroll = monthlyPayroll * 6;
  const employeesCount = (employees || []).length;

  // Расчёт по НК РК 2026
  const TAX_RATE = 4; // 4% от дохода
  const taxAmount = income * TAX_RATE / 100;

  // Уменьшение налога на 1.5% за каждого работника (макс. 50%)
  // На упрощёнке: уменьшение возможно если ЗП работников >= 23 МРП = ~99 475 ₸
  // Упрощённо: считаем что все на нормальных ЗП
  const reductionRate = Math.min(employeesCount * 1.5, 50);
  const taxAfterReduction = taxAmount * (1 - reductionRate / 100);

  // ИПН с ЗП сотрудников: 10% (после вычетов)
  const MRP_2026 = 4325;
  const ipnDeductionPerEmployee = 14 * MRP_2026; // 14 МРП = 60 550 ₸
  const ipnEmployees = (employees || []).reduce((sum, e) => {
    const monthly = Number(e.salary || 0);
    const taxBase = Math.max(0, monthly - ipnDeductionPerEmployee - monthly * 0.10); // минус ОПВ 10%
    return sum + taxBase * 0.10 * 6; // 10% × 6 месяцев
  }, 0);

  // Социальный налог: 6% от ФОТ - ОПВ
  const socialTaxBase = Math.max(0, halfYearPayroll * 0.90); // минус ОПВ 10%
  const socialTax = socialTaxBase * 0.06; // 6%

  // ОПВ — 10% от ФОТ работника
  const opv = halfYearPayroll * 0.10;
  // ОПВР — 3.5% работодатель
  const opvr = halfYearPayroll * 0.035;
  // ВОСМС — 2% работник
  const vosms = halfYearPayroll * 0.02;
  // ООСМС — 3% работодатель
  const oosms = halfYearPayroll * 0.03;
  // СО — 5% от ФОТ-ОПВ
  const so = (halfYearPayroll - opv) * 0.05;

  const totalToPay = taxAfterReduction + ipnEmployees + socialTax;

  return {
    tin: profile?.bin || "",
    taxpayer_name: profile?.company_name || profile?.full_name || "",
    ogrn: profile?.oked || "",
    year,
    half_year: halfYear,
    declaration_type: "initial",
    income_total: Math.round(income),
    income_employees_avg: employeesCount,
    tax_rate: TAX_RATE,
    tax_amount: Math.round(taxAfterReduction),
    ipn_employees: Math.round(ipnEmployees),
    social_tax_employees: Math.round(socialTax),
    opv_amount: Math.round(opv),
    opvr_amount: Math.round(opvr),
    vosms_amount: Math.round(vosms),
    oosms_amount: Math.round(oosms),
    social_contributions: Math.round(so),
    total_to_pay: Math.round(totalToPay),
  };
}

// ═══ ВАЛИДАЦИЯ ═══

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validate910(data: F910Data): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Обязательные поля
  if (!data.tin || data.tin.length !== 12) {
    errors.push("БИН/ИИН должен содержать 12 цифр");
  }
  if (!data.taxpayer_name) {
    errors.push("Не указано наименование налогоплательщика");
  }
  if (data.year < 2020 || data.year > 2030) {
    errors.push(`Некорректный год: ${data.year}`);
  }

  // Лимиты упрощёнки 2026
  const SIMPLIFIED_LIMIT_2026 = 24038 * 4325; // ~104 млн ₸ за полугодие
  if (data.income_total > SIMPLIFIED_LIMIT_2026) {
    warnings.push(`Доход ${data.income_total.toLocaleString("ru-RU")} ₸ превышает лимит упрощёнки за полугодие (${SIMPLIFIED_LIMIT_2026.toLocaleString("ru-RU")} ₸). Возможно, вам нужно перейти на ОУР.`);
  }

  if (data.income_employees_avg > 30) {
    warnings.push("Среднесписочная численность работников превышает 30 — это лимит для упрощёнки.");
  }

  // Проверка расчёта налога
  const expectedTax = data.income_total * data.tax_rate / 100;
  if (Math.abs(data.tax_amount - expectedTax) > expectedTax * 0.6) {
    warnings.push(`Сумма налога (${data.tax_amount.toLocaleString("ru-RU")}) сильно отличается от ${data.tax_rate}% от дохода. Проверьте расчёт.`);
  }

  if (data.income_total === 0) {
    warnings.push("Доход за период равен нулю. Если деятельность была — проверьте проводки на счёте 6010.");
  }

  if (data.income_total < 0) {
    errors.push("Доход не может быть отрицательным");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ═══ ГЕНЕРАЦИЯ XML ═══

function escapeXml(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(n: number): string {
  return Math.round(n).toString();
}

export function generate910XML(data: F910Data): string {
  const periodCode = `${String(data.half_year).padStart(2, "0")}${data.year}`;
  const declTypeCode = data.declaration_type === "initial" ? "1" : data.declaration_type === "additional" ? "2" : "3";

  // Структура основана на стандартном формате СОНО для формы 910.00
  // Реальная схема может отличаться — пользователь сверится при загрузке в СОНО
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Declaration xmlns="urn:kgd.gov.kz:fno:910:v6"
             FormCode="${FORM_CODE}"
             Period="${escapeXml(periodCode)}"
             DeclarationType="${declTypeCode}"
             Year="${data.year}"
             HalfYear="${data.half_year}">
  
  <Taxpayer>
    <TIN>${escapeXml(data.tin)}</TIN>
    <Name>${escapeXml(data.taxpayer_name)}</Name>
    ${data.ogrn ? `<OGRN>${escapeXml(data.ogrn)}</OGRN>` : ""}
  </Taxpayer>
  
  <General>
    <Section1>
      <!-- 910.00.001 - Доход за налоговый период -->
      <Income910_00_001>${fmtNum(data.income_total)}</Income910_00_001>
      
      <!-- 910.00.002 - Среднесписочная численность работников -->
      <EmployeesAverageCount910_00_002>${data.income_employees_avg}</EmployeesAverageCount910_00_002>
      
      <!-- 910.00.003 - Сумма заработной платы работников -->
      <PayrollTotal910_00_003>${fmtNum(data.opv_amount * 10)}</PayrollTotal910_00_003>
      
      <!-- 910.00.004 - Ставка налога -->
      <TaxRate910_00_004>${data.tax_rate}</TaxRate910_00_004>
      
      <!-- 910.00.005 - Сумма налога к уплате -->
      <TaxAmount910_00_005>${fmtNum(data.tax_amount)}</TaxAmount910_00_005>
    </Section1>
    
    <Section2_Employees>
      <!-- ИПН с заработной платы -->
      <IPN_Employees>${fmtNum(data.ipn_employees)}</IPN_Employees>
      
      <!-- Социальный налог -->
      <SocialTax>${fmtNum(data.social_tax_employees)}</SocialTax>
      
      <!-- ОПВ работников -->
      <OPV>${fmtNum(data.opv_amount)}</OPV>
      
      <!-- ОПВР работодателя -->
      <OPVR>${fmtNum(data.opvr_amount)}</OPVR>
      
      <!-- ВОСМС работников -->
      <VOSMS>${fmtNum(data.vosms_amount)}</VOSMS>
      
      <!-- ООСМС работодателя -->
      <OOSMS>${fmtNum(data.oosms_amount)}</OOSMS>
      
      <!-- Социальные отчисления -->
      <SocialContributions>${fmtNum(data.social_contributions)}</SocialContributions>
    </Section2_Employees>
    
    <Total>
      <TotalToPay>${fmtNum(data.total_to_pay)}</TotalToPay>
    </Total>
  </General>
  
  <Metadata>
    <GeneratedBy>Finstat.kz</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <Version>1.0</Version>
  </Metadata>
</Declaration>`;

  return xml;
}

// ═══ ОПИСАНИЯ ПОЛЕЙ (для UI) ═══

export const F910_FIELDS = [
  { code: "910.00.001", label: "Доход за полугодие", value: (d: F910Data) => d.income_total, format: "money" },
  { code: "910.00.002", label: "Среднесписочная численность работников", value: (d: F910Data) => d.income_employees_avg, format: "number" },
  { code: "910.00.004", label: "Ставка налога (%)", value: (d: F910Data) => d.tax_rate, format: "percent" },
  { code: "910.00.005", label: "Сумма налога к уплате", value: (d: F910Data) => d.tax_amount, format: "money" },
];

export const F910_INFO = {
  code: FORM_CODE,
  name: FORM_NAME,
  description: "Упрощённая декларация для ИП и ТОО на упрощённом режиме налогообложения. Сдаётся 2 раза в год.",
  period_type: "half_year" as const,
  due_day: 15,
  due_month_offset: 2,
  rate_info: "4% от валового дохода. Уменьшается на 1.5% за каждого работника (до 50%).",
};
