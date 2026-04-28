// Форма 200.00 — Декларация по индивидуальному подоходному и социальному налогам.
// Сдаётся ежеквартально всеми работодателями.

import { SupabaseClient } from "@supabase/supabase-js";

export interface F200Data {
  // Реквизиты
  tin: string;
  taxpayer_name: string;
  
  // Период
  year: number;
  quarter: 1 | 2 | 3 | 4;
  
  declaration_type: "initial" | "additional" | "corrective";
  
  // ОСНОВНЫЕ ДАННЫЕ ПО МЕСЯЦАМ КВАРТАЛА
  // 200.00 разбивается на 3 месяца квартала
  monthly_data: {
    month: number; // 1-12
    employees_count: number;
    payroll_total: number; // ФОТ за месяц
    payroll_taxable: number; // налогооблагаемая база
    
    ipn_amount: number;       // ИПН — 10%
    social_tax: number;       // СН — 6%
    opv_amount: number;       // ОПВ — 10%
    opvr_amount: number;      // ОПВР — 3.5%
    vosms_amount: number;     // ВОСМС — 2%
    oosms_amount: number;     // ООСМС — 3%
    so_amount: number;        // СО — 5%
  }[];
  
  // ИТОГО
  total_ipn: number;
  total_social_tax: number;
  total_opv: number;
  total_opvr: number;
  total_vosms: number;
  total_oosms: number;
  total_so: number;
  total_to_pay: number;
}

const FORM_CODE = "200.00";
const FORM_NAME = "Декларация по индивидуальному подоходному и социальному налогам";

const MRP_2026 = 4325;
const IPN_DEDUCTION = 14 * MRP_2026; // 14 МРП = 60 550 ₸

// ═══ АВТОМАТИЧЕСКИЙ РАСЧЁТ ═══

export async function calculate200(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4
): Promise<F200Data> {
  const startMonth = (quarter - 1) * 3;
  const endMonth = quarter * 3 - 1;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();

  // Получаем сотрудников
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", userId);

  const monthly_data: F200Data["monthly_data"] = [];

  for (let m = startMonth; m <= endMonth; m++) {
    const monthNum = m + 1; // 1-12
    
    // Активные на этот месяц сотрудники
    const monthStart = new Date(year, m, 1);
    const monthEnd = new Date(year, m + 1, 0);
    
    const activeEmployees = (employees || []).filter(e => {
      const hireDate = e.hire_date ? new Date(e.hire_date) : new Date("2000-01-01");
      const fireDate = e.is_active === false && e.fire_date ? new Date(e.fire_date) : null;
      return hireDate <= monthEnd && (!fireDate || fireDate >= monthStart);
    });

    let payrollTotal = 0;
    let payrollTaxable = 0;
    let ipn = 0;
    let socialTax = 0;
    let opv = 0;
    let opvr = 0;
    let vosms = 0;
    let oosms = 0;
    let so = 0;

    activeEmployees.forEach(e => {
      const salary = Number(e.salary || 0);
      payrollTotal += salary;
      
      // Расчёт ИПН: (ЗП - ОПВ - ВОСМС - 14МРП) × 10%
      const opvIndividual = salary * 0.10;
      const vosmsIndividual = salary * 0.02;
      const ipnBase = Math.max(0, salary - opvIndividual - vosmsIndividual - IPN_DEDUCTION);
      const ipnAmount = ipnBase * 0.10;
      
      payrollTaxable += ipnBase;
      ipn += ipnAmount;
      
      // Социальные платежи
      opv += opvIndividual;
      opvr += salary * 0.035; // ОПВР
      vosms += vosmsIndividual;
      oosms += salary * 0.03; // ООСМС
      
      // Социальный налог: 6% от (ФОТ - ОПВ)
      const stBase = Math.max(0, salary - opvIndividual);
      socialTax += stBase * 0.06;
      
      // Социальные отчисления: 5% от (ФОТ - ОПВ)
      so += stBase * 0.05;
    });

    monthly_data.push({
      month: monthNum,
      employees_count: activeEmployees.length,
      payroll_total: Math.round(payrollTotal),
      payroll_taxable: Math.round(payrollTaxable),
      ipn_amount: Math.round(ipn),
      social_tax: Math.round(socialTax),
      opv_amount: Math.round(opv),
      opvr_amount: Math.round(opvr),
      vosms_amount: Math.round(vosms),
      oosms_amount: Math.round(oosms),
      so_amount: Math.round(so),
    });
  }

  const sum = (key: keyof F200Data["monthly_data"][0]) =>
    monthly_data.reduce((a, m) => a + Number(m[key] || 0), 0);

  const total_ipn = sum("ipn_amount");
  const total_social_tax = sum("social_tax");
  const total_opv = sum("opv_amount");
  const total_opvr = sum("opvr_amount");
  const total_vosms = sum("vosms_amount");
  const total_oosms = sum("oosms_amount");
  const total_so = sum("so_amount");

  return {
    tin: profile?.bin || "",
    taxpayer_name: profile?.company_name || profile?.full_name || "",
    year,
    quarter,
    declaration_type: "initial",
    monthly_data,
    total_ipn,
    total_social_tax,
    total_opv,
    total_opvr,
    total_vosms,
    total_oosms,
    total_so,
    total_to_pay: total_ipn + total_social_tax + total_opv + total_opvr + total_vosms + total_oosms + total_so,
  };
}

// ═══ ВАЛИДАЦИЯ ═══

export function validate200(data: F200Data) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.tin || data.tin.length !== 12) {
    errors.push("БИН должен содержать 12 цифр");
  }
  if (!data.taxpayer_name) {
    errors.push("Не указано наименование организации");
  }

  // Проверка месячных данных
  data.monthly_data.forEach(m => {
    if (m.payroll_total > 0 && m.employees_count === 0) {
      warnings.push(`Месяц ${m.month}: есть ФОТ ${m.payroll_total.toLocaleString("ru-RU")} ₸, но нет сотрудников. Проверьте.`);
    }
    if (m.payroll_total < 0) {
      errors.push(`Месяц ${m.month}: ФОТ не может быть отрицательным`);
    }

    // Проверка ОПВ ≈ 10% от ФОТ
    const expectedOPV = m.payroll_total * 0.10;
    if (Math.abs(m.opv_amount - expectedOPV) > expectedOPV * 0.05 && m.payroll_total > 0) {
      warnings.push(`Месяц ${m.month}: ОПВ (${m.opv_amount.toLocaleString("ru-RU")}) сильно отклоняется от 10% ФОТ`);
    }
  });

  if (data.monthly_data.every(m => m.payroll_total === 0)) {
    warnings.push("За весь квартал ФОТ равен 0. Если сотрудники были — проверьте справочник кадров.");
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

export function generate200XML(data: F200Data): string {
  const periodCode = `Q${data.quarter}-${data.year}`;
  const declTypeCode = data.declaration_type === "initial" ? "1" : data.declaration_type === "additional" ? "2" : "3";

  const monthsXml = data.monthly_data.map(m => `
    <Month number="${m.month}">
      <EmployeesCount>${m.employees_count}</EmployeesCount>
      <PayrollTotal>${fmtNum(m.payroll_total)}</PayrollTotal>
      <PayrollTaxable>${fmtNum(m.payroll_taxable)}</PayrollTaxable>
      <IPN>${fmtNum(m.ipn_amount)}</IPN>
      <SocialTax>${fmtNum(m.social_tax)}</SocialTax>
      <OPV>${fmtNum(m.opv_amount)}</OPV>
      <OPVR>${fmtNum(m.opvr_amount)}</OPVR>
      <VOSMS>${fmtNum(m.vosms_amount)}</VOSMS>
      <OOSMS>${fmtNum(m.oosms_amount)}</OOSMS>
      <SocialContributions>${fmtNum(m.so_amount)}</SocialContributions>
    </Month>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Declaration xmlns="urn:kgd.gov.kz:fno:200:v8"
             FormCode="${FORM_CODE}"
             Period="${escapeXml(periodCode)}"
             DeclarationType="${declTypeCode}"
             Year="${data.year}"
             Quarter="${data.quarter}">
  
  <Taxpayer>
    <TIN>${escapeXml(data.tin)}</TIN>
    <Name>${escapeXml(data.taxpayer_name)}</Name>
  </Taxpayer>
  
  <Section1_MonthlyData>${monthsXml}
  </Section1_MonthlyData>
  
  <Section2_Totals>
    <TotalIPN>${fmtNum(data.total_ipn)}</TotalIPN>
    <TotalSocialTax>${fmtNum(data.total_social_tax)}</TotalSocialTax>
    <TotalOPV>${fmtNum(data.total_opv)}</TotalOPV>
    <TotalOPVR>${fmtNum(data.total_opvr)}</TotalOPVR>
    <TotalVOSMS>${fmtNum(data.total_vosms)}</TotalVOSMS>
    <TotalOOSMS>${fmtNum(data.total_oosms)}</TotalOOSMS>
    <TotalSocialContributions>${fmtNum(data.total_so)}</TotalSocialContributions>
    <TotalToPay>${fmtNum(data.total_to_pay)}</TotalToPay>
  </Section2_Totals>
  
  <Metadata>
    <GeneratedBy>Finstat.kz</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <Version>1.0</Version>
  </Metadata>
</Declaration>`;

  return xml;
}

export const F200_INFO = {
  code: FORM_CODE,
  name: FORM_NAME,
  description: "Декларация по ИПН и социальному налогу. Сдаётся ежеквартально всеми работодателями.",
  period_type: "quarter" as const,
  due_day: 15,
  due_month_offset: 2,
  rate_info: "ИПН 10% (с вычетом 14 МРП), СН 6%, ОПВ 10%, ОПВР 3.5%, ВОСМС 2%, ООСМС 3%, СО 5%",
};
