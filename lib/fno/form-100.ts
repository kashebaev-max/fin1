// Форма 100.00 — Декларация по корпоративному подоходному налогу (КПН).
// Сдаётся раз в год до 31 марта следующего года всеми ТОО на общем режиме.
// Стандартная ставка КПН по НК РК 2026: 20%.

import { SupabaseClient } from "@supabase/supabase-js";

export interface F100Data {
  // Реквизиты
  tin: string;
  taxpayer_name: string;
  
  // Период
  year: number;
  declaration_type: "initial" | "additional" | "corrective";
  
  // ═══ РАЗДЕЛ 1: СОВОКУПНЫЙ ГОДОВОЙ ДОХОД (СГД) ═══
  
  // 100.00.001 — Доход от реализации товаров, работ, услуг
  income_from_sales: number;
  
  // 100.00.002 — Доход от прироста стоимости (ОС, ценные бумаги)
  income_capital_gains: number;
  
  // 100.00.003 — Доход от списания обязательств
  income_writeoff: number;
  
  // 100.00.004 — Доход по сомнительным обязательствам
  income_doubtful: number;
  
  // 100.00.005 — Доход в виде безвозмездно полученного имущества
  income_free: number;
  
  // 100.00.006 — Дивиденды, проценты, прочие доходы
  income_dividends: number;
  income_interest: number;
  income_other: number;
  
  // 100.00.007 — Курсовая разница (положительная)
  income_currency_diff: number;
  
  // ИТОГО СГД
  total_annual_income: number;
  
  // ═══ РАЗДЕЛ 2: ВЫЧЕТЫ ═══
  
  // 100.00.019 — Себестоимость реализованных товаров и услуг
  deduction_cogs: number;
  
  // 100.00.020 — Расходы по реализации (коммерческие)
  deduction_selling: number;
  
  // 100.00.021 — Административные расходы
  deduction_admin: number;
  
  // 100.00.022 — Финансовые расходы
  deduction_financial: number;
  
  // 100.00.023 — Расходы на оплату труда
  deduction_payroll: number;
  
  // 100.00.024 — Социальные налоги и отчисления
  deduction_social: number;
  
  // 100.00.025 — Амортизация фиксированных активов
  deduction_depreciation: number;
  
  // 100.00.026 — Расходы на ремонт
  deduction_repairs: number;
  
  // 100.00.027 — Расходы по вознаграждению (проценты по займам)
  deduction_interest_expense: number;
  
  // 100.00.028 — Сомнительные требования
  deduction_doubtful: number;
  
  // 100.00.029 — Курсовая разница (отрицательная)
  deduction_currency_diff: number;
  
  // 100.00.030 — Прочие вычеты
  deduction_other: number;
  
  // ИТОГО вычеты
  total_deductions: number;
  
  // ═══ РАЗДЕЛ 3: НАЛОГООБЛАГАЕМЫЙ ДОХОД И КПН ═══
  
  // 100.00.032 — Налогооблагаемый доход (СГД - вычеты)
  taxable_income: number;
  
  // 100.00.033 — Уменьшение (благотворительность, льготы)
  taxable_reduction: number;
  
  // 100.00.034 — Налогооблагаемый доход с учётом корректировок
  final_taxable_income: number;
  
  // 100.00.035 — Перенос убытков прошлых лет
  loss_carryover: number;
  
  // 100.00.036 — Налогооблагаемый доход после переноса убытков
  income_after_loss: number;
  
  // 100.00.037 — Ставка КПН
  tax_rate: number; // 20 для стандарта
  
  // 100.00.038 — Сумма КПН
  cit_amount: number;
  
  // 100.00.039 — КПН удержанный у источника (если применимо)
  cit_withheld_at_source: number;
  
  // 100.00.040 — Авансовые платежи КПН за год
  cit_advance_payments: number;
  
  // 100.00.041 — КПН к уплате/возмещению по итогам года
  cit_to_pay: number;
  cit_to_refund: number;
  is_to_pay: boolean;
  
  // ═══ ПРИЛОЖЕНИЕ 100.01 — ДОХОДЫ ИЗ ИСТОЧНИКОВ ВНЕ РК ═══
  foreign_income: {
    country: string;
    income_type: string;
    amount: number;
    tax_paid_abroad: number;
  }[];
  
  // ═══ ПРИЛОЖЕНИЕ 100.02 — РАСХОДЫ НА ОПЛАТУ ТРУДА И СОЦИАЛЬНЫЕ ОТЧИСЛЕНИЯ ═══
  payroll_breakdown: {
    salary_total: number;
    bonuses: number;
    vacations: number;
    other_payments: number;
    employees_count_avg: number;
  };
  
  // ═══ ПРИЛОЖЕНИЕ 100.03 — АМОРТИЗАЦИЯ ОС ═══
  depreciation_groups: {
    group_number: number;     // I, II, III, IV — группы фиксированных активов
    group_name: string;
    cost_at_start: number;    // стоимостной баланс на начало года
    additions: number;        // поступления за год
    disposals: number;        // выбытие
    depreciation_rate: number; // норма амортизации
    depreciation_amount: number; // начислено амортизации за год
    cost_at_end: number;
  }[];
}

const FORM_CODE = "100.00";
const FORM_NAME = "Декларация по корпоративному подоходному налогу";

const CIT_RATE = 20; // 20% стандартная ставка КПН по НК РК 2026

// Группы фиксированных активов и нормы амортизации (НК РК ст.271)
const FA_GROUPS = [
  { number: 1, name: "Здания, сооружения", rate: 10 },
  { number: 2, name: "Машины и оборудование (кроме нефтегазовых)", rate: 25 },
  { number: 3, name: "Канцелярское оборудование, компьютеры", rate: 40 },
  { number: 4, name: "Прочие фиксированные активы", rate: 15 },
];

// ═══ АВТОМАТИЧЕСКИЙ РАСЧЁТ из учётных данных ═══

export async function calculate100(
  supabase: SupabaseClient,
  userId: string,
  year: number
): Promise<F100Data> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();

  // Все проводки за год
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", userId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  // ═══ ДОХОДЫ (СГД) ═══
  let income_from_sales = 0;       // 6010
  let income_capital_gains = 0;    // 6210, 6220
  let income_writeoff = 0;          // 6230
  let income_doubtful = 0;          // 6240
  let income_free = 0;              // 6260
  let income_dividends = 0;         // 6110 - дивиденды
  let income_interest = 0;          // 6120 - проценты
  let income_other = 0;             // прочие 6xxx
  let income_currency_diff = 0;     // 6250 - курсовая разница положительная

  // ═══ ВЫЧЕТЫ ═══
  let deduction_cogs = 0;           // 7010 - себестоимость
  let deduction_selling = 0;        // 7110 - расходы по реализации
  let deduction_admin = 0;          // 7210 - адм. расходы
  let deduction_financial = 0;      // 7310 - финансовые
  let deduction_payroll = 0;        // 7212, 7112 - расходы на ЗП
  let deduction_social = 0;         // 7213, 3150 - соц. налоги/отчисления
  let deduction_depreciation = 0;   // 7214 - амортизация
  let deduction_repairs = 0;        // 7215 - ремонт
  let deduction_interest_expense = 0; // 7320 - проценты по займам
  let deduction_doubtful = 0;       // 7440 - сомнительные требования
  let deduction_currency_diff = 0;  // 7430 - курсовая отрицательная
  let deduction_other = 0;          // 7990 - прочие

  (entries || []).forEach(e => {
    const dr = String(e.debit_account || "");
    const cr = String(e.credit_account || "");
    const amt = Number(e.amount || 0);

    // ДОХОДЫ — кредит счетов 6xxx
    if (cr === "6010") income_from_sales += amt;
    else if (cr === "6210" || cr === "6220") income_capital_gains += amt;
    else if (cr === "6230") income_writeoff += amt;
    else if (cr === "6240") income_doubtful += amt;
    else if (cr === "6260") income_free += amt;
    else if (cr === "6110") income_dividends += amt;
    else if (cr === "6120") income_interest += amt;
    else if (cr === "6250") income_currency_diff += amt;
    else if (cr.startsWith("6")) income_other += amt;

    // ВЫЧЕТЫ — дебет счетов 7xxx
    if (dr === "7010") deduction_cogs += amt;
    else if (dr === "7110") deduction_selling += amt;
    else if (dr === "7210") {
      // 7210 общая адм. — но часть может быть зарплата, часть — амортизация
      deduction_admin += amt;
    }
    else if (dr === "7310") deduction_financial += amt;
    else if (dr === "7320") deduction_interest_expense += amt;
    else if (dr === "7440") deduction_doubtful += amt;
    else if (dr === "7430") deduction_currency_diff += amt;
    else if (dr === "7990") deduction_other += amt;
  });

  // Расчёт зарплат и амортизации из специальных проводок
  // ЗП: Дт 7212/7112 Кт 3350 (начислена ЗП)
  (entries || []).forEach(e => {
    const dr = String(e.debit_account || "");
    const cr = String(e.credit_account || "");
    const amt = Number(e.amount || 0);
    if ((dr === "7212" || dr === "7112") && cr === "3350") {
      deduction_payroll += amt;
    }
    // Амортизация: Дт 7214 (или субсчёт 7210) Кт 2420
    if (cr === "2420") {
      deduction_depreciation += amt;
    }
    // Соц. налоги и отчисления: Дт 7213 Кт 3120-3230
    if (dr === "7213" || (cr.startsWith("31") && (dr.startsWith("72") || dr.startsWith("71")))) {
      deduction_social += amt;
    }
  });

  const total_annual_income = income_from_sales + income_capital_gains + income_writeoff +
    income_doubtful + income_free + income_dividends + income_interest +
    income_other + income_currency_diff;

  const total_deductions = deduction_cogs + deduction_selling + deduction_admin +
    deduction_financial + deduction_payroll + deduction_social + deduction_depreciation +
    deduction_repairs + deduction_interest_expense + deduction_doubtful + 
    deduction_currency_diff + deduction_other;

  const taxable_income = Math.max(0, total_annual_income - total_deductions);
  const final_taxable_income = taxable_income; // без льгот по умолчанию
  
  // Перенос убытков (берём из настроек или из прошлых деклараций — пока 0)
  const loss_carryover = 0;
  
  const income_after_loss = Math.max(0, final_taxable_income - loss_carryover);
  const cit_amount = income_after_loss * CIT_RATE / 100;

  // КПН удержанный у источника и авансы (берём из проводок Дт 3110)
  let cit_withheld_at_source = 0;
  let cit_advance_payments = 0;
  (entries || []).forEach(e => {
    const dr = String(e.debit_account || "");
    const cr = String(e.credit_account || "");
    const amt = Number(e.amount || 0);
    if (dr === "3110") {
      // Уплата КПН (авансы или у источника)
      cit_advance_payments += amt;
    }
  });

  const cit_to_pay = Math.max(0, cit_amount - cit_withheld_at_source - cit_advance_payments);
  const cit_to_refund = Math.max(0, cit_withheld_at_source + cit_advance_payments - cit_amount);

  // ПРИЛОЖЕНИЕ 100.02 — Расходы на ЗП
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", userId);

  const employees_count_avg = (employees || []).filter(e => e.is_active !== false).length;

  // ПРИЛОЖЕНИЕ 100.03 — Амортизация
  const { data: assets } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("user_id", userId);

  const depreciation_groups = FA_GROUPS.map(g => {
    const groupAssets = (assets || []).filter(a => Number(a.depreciation_group || 4) === g.number);
    const cost_at_start = groupAssets.reduce((sum, a) => 
      sum + Number(a.initial_cost || 0) - Number(a.accumulated_depreciation_start_year || a.accumulated_depreciation || 0), 0);
    const additions = groupAssets.filter(a => 
      a.acquisition_date && new Date(a.acquisition_date).getFullYear() === year)
      .reduce((sum, a) => sum + Number(a.initial_cost || 0), 0);
    const disposals = groupAssets.filter(a => 
      a.disposal_date && new Date(a.disposal_date).getFullYear() === year)
      .reduce((sum, a) => sum + Number(a.initial_cost || 0), 0);
    
    // Налоговая амортизация = (cost_at_start + additions/2 - disposals) × rate
    const baseForDepreciation = cost_at_start + additions / 2 - disposals;
    const depreciation_amount = Math.max(0, baseForDepreciation * g.rate / 100);
    const cost_at_end = cost_at_start + additions - disposals - depreciation_amount;

    return {
      group_number: g.number,
      group_name: g.name,
      cost_at_start: Math.round(cost_at_start),
      additions: Math.round(additions),
      disposals: Math.round(disposals),
      depreciation_rate: g.rate,
      depreciation_amount: Math.round(depreciation_amount),
      cost_at_end: Math.round(cost_at_end),
    };
  });

  return {
    tin: profile?.bin || "",
    taxpayer_name: profile?.company_name || profile?.full_name || "",
    year,
    declaration_type: "initial",
    
    income_from_sales: Math.round(income_from_sales),
    income_capital_gains: Math.round(income_capital_gains),
    income_writeoff: Math.round(income_writeoff),
    income_doubtful: Math.round(income_doubtful),
    income_free: Math.round(income_free),
    income_dividends: Math.round(income_dividends),
    income_interest: Math.round(income_interest),
    income_other: Math.round(income_other),
    income_currency_diff: Math.round(income_currency_diff),
    total_annual_income: Math.round(total_annual_income),
    
    deduction_cogs: Math.round(deduction_cogs),
    deduction_selling: Math.round(deduction_selling),
    deduction_admin: Math.round(deduction_admin),
    deduction_financial: Math.round(deduction_financial),
    deduction_payroll: Math.round(deduction_payroll),
    deduction_social: Math.round(deduction_social),
    deduction_depreciation: Math.round(deduction_depreciation),
    deduction_repairs: Math.round(deduction_repairs),
    deduction_interest_expense: Math.round(deduction_interest_expense),
    deduction_doubtful: Math.round(deduction_doubtful),
    deduction_currency_diff: Math.round(deduction_currency_diff),
    deduction_other: Math.round(deduction_other),
    total_deductions: Math.round(total_deductions),
    
    taxable_income: Math.round(taxable_income),
    taxable_reduction: 0,
    final_taxable_income: Math.round(final_taxable_income),
    loss_carryover: Math.round(loss_carryover),
    income_after_loss: Math.round(income_after_loss),
    tax_rate: CIT_RATE,
    cit_amount: Math.round(cit_amount),
    cit_withheld_at_source: Math.round(cit_withheld_at_source),
    cit_advance_payments: Math.round(cit_advance_payments),
    cit_to_pay: Math.round(cit_to_pay),
    cit_to_refund: Math.round(cit_to_refund),
    is_to_pay: cit_to_pay > 0,
    
    foreign_income: [],
    payroll_breakdown: {
      salary_total: Math.round(deduction_payroll),
      bonuses: 0,
      vacations: 0,
      other_payments: 0,
      employees_count_avg,
    },
    depreciation_groups,
  };
}

// ═══ ВАЛИДАЦИЯ ═══

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validate100(data: F100Data): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.tin || data.tin.length !== 12) {
    errors.push("БИН должен содержать 12 цифр");
  }
  if (!data.taxpayer_name) {
    errors.push("Не указано наименование организации");
  }

  // Проверка соотношения
  if (data.total_annual_income === 0) {
    warnings.push("СГД равен нулю. Если деятельность была — проверьте, что доходы отражены на счетах 6010-6260.");
  }

  if (data.total_deductions === 0 && data.total_annual_income > 0) {
    warnings.push("Вычеты равны нулю при наличии доходов. Это означает 20% налога со всего дохода. Проверьте проводки расходов на счетах 7010-7990.");
  }

  // КПН необычно большой
  if (data.cit_amount > data.total_annual_income * 0.20) {
    errors.push(`КПН (${data.cit_amount.toLocaleString("ru-RU")}) больше 20% от СГД — это математически невозможно. Проверьте расчёт.`);
  }

  // Если убыток — налог не платится
  if (data.taxable_income === 0 && data.total_annual_income > 0) {
    warnings.push("По итогам года получен убыток или нулевой результат. КПН не начисляется. Убыток можно перенести на 10 будущих лет.");
  }

  // Проверка вычета на ЗП
  if (data.deduction_payroll > 0 && data.deduction_social === 0) {
    warnings.push("Есть расходы на ЗП, но нет соц. налогов и отчислений. Это нелогично — обычно соц. налоги ~25% от ЗП.");
  }

  // Проверка амортизации
  const totalDepFromGroups = data.depreciation_groups.reduce((sum, g) => sum + g.depreciation_amount, 0);
  if (totalDepFromGroups > 0 && data.deduction_depreciation === 0) {
    warnings.push(`По налоговым группам ОС начислено ${totalDepFromGroups.toLocaleString("ru-RU")} ₸ амортизации, но в проводках (Кт 2420) — 0 ₸. Возможно, амортизация не начислена в учёте.`);
  }

  // Подозрительно большие прочие вычеты
  if (data.deduction_other > data.total_deductions * 0.30) {
    warnings.push(`«Прочие вычеты» составляют ${(data.deduction_other / data.total_deductions * 100).toFixed(0)}% от всех вычетов. Налоговая обращает внимание на такие суммы — детализируйте по более подходящим счетам.`);
  }

  // Перенос убытков
  if (data.loss_carryover > 0) {
    warnings.push(`Используется перенос убытков ${data.loss_carryover.toLocaleString("ru-RU")} ₸. Убедитесь, что убытки документально подтверждены.`);
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

export function generate100XML(data: F100Data): string {
  const declTypeCode = data.declaration_type === "initial" ? "1" : data.declaration_type === "additional" ? "2" : "3";

  const depreciationGroupsXml = data.depreciation_groups.map(g => `
    <Group number="${g.group_number}">
      <Name>${escapeXml(g.group_name)}</Name>
      <CostAtStart>${fmtNum(g.cost_at_start)}</CostAtStart>
      <Additions>${fmtNum(g.additions)}</Additions>
      <Disposals>${fmtNum(g.disposals)}</Disposals>
      <Rate>${g.depreciation_rate}</Rate>
      <DepreciationAmount>${fmtNum(g.depreciation_amount)}</DepreciationAmount>
      <CostAtEnd>${fmtNum(g.cost_at_end)}</CostAtEnd>
    </Group>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Declaration xmlns="urn:kgd.gov.kz:fno:100:v8"
             FormCode="${FORM_CODE}"
             Year="${data.year}"
             DeclarationType="${declTypeCode}">
  
  <Taxpayer>
    <TIN>${escapeXml(data.tin)}</TIN>
    <Name>${escapeXml(data.taxpayer_name)}</Name>
  </Taxpayer>
  
  <!-- Раздел 1: Совокупный годовой доход -->
  <Section1_AnnualIncome>
    <IncomeFromSales code="100.00.001">${fmtNum(data.income_from_sales)}</IncomeFromSales>
    <IncomeCapitalGains code="100.00.002">${fmtNum(data.income_capital_gains)}</IncomeCapitalGains>
    <IncomeWriteoff code="100.00.003">${fmtNum(data.income_writeoff)}</IncomeWriteoff>
    <IncomeDoubtful code="100.00.004">${fmtNum(data.income_doubtful)}</IncomeDoubtful>
    <IncomeFree code="100.00.005">${fmtNum(data.income_free)}</IncomeFree>
    <IncomeDividends>${fmtNum(data.income_dividends)}</IncomeDividends>
    <IncomeInterest>${fmtNum(data.income_interest)}</IncomeInterest>
    <IncomeOther code="100.00.006">${fmtNum(data.income_other)}</IncomeOther>
    <IncomeCurrencyDiff code="100.00.007">${fmtNum(data.income_currency_diff)}</IncomeCurrencyDiff>
    
    <TotalAnnualIncome>${fmtNum(data.total_annual_income)}</TotalAnnualIncome>
  </Section1_AnnualIncome>
  
  <!-- Раздел 2: Вычеты -->
  <Section2_Deductions>
    <COGS code="100.00.019">${fmtNum(data.deduction_cogs)}</COGS>
    <SellingExpenses code="100.00.020">${fmtNum(data.deduction_selling)}</SellingExpenses>
    <AdminExpenses code="100.00.021">${fmtNum(data.deduction_admin)}</AdminExpenses>
    <FinancialExpenses code="100.00.022">${fmtNum(data.deduction_financial)}</FinancialExpenses>
    <PayrollExpenses code="100.00.023">${fmtNum(data.deduction_payroll)}</PayrollExpenses>
    <SocialContributions code="100.00.024">${fmtNum(data.deduction_social)}</SocialContributions>
    <Depreciation code="100.00.025">${fmtNum(data.deduction_depreciation)}</Depreciation>
    <Repairs code="100.00.026">${fmtNum(data.deduction_repairs)}</Repairs>
    <InterestExpenses code="100.00.027">${fmtNum(data.deduction_interest_expense)}</InterestExpenses>
    <DoubtfulDebts code="100.00.028">${fmtNum(data.deduction_doubtful)}</DoubtfulDebts>
    <CurrencyDiff code="100.00.029">${fmtNum(data.deduction_currency_diff)}</CurrencyDiff>
    <OtherDeductions code="100.00.030">${fmtNum(data.deduction_other)}</OtherDeductions>
    
    <TotalDeductions>${fmtNum(data.total_deductions)}</TotalDeductions>
  </Section2_Deductions>
  
  <!-- Раздел 3: Расчёт КПН -->
  <Section3_CITCalculation>
    <TaxableIncome code="100.00.032">${fmtNum(data.taxable_income)}</TaxableIncome>
    <TaxableReduction code="100.00.033">${fmtNum(data.taxable_reduction)}</TaxableReduction>
    <FinalTaxableIncome code="100.00.034">${fmtNum(data.final_taxable_income)}</FinalTaxableIncome>
    <LossCarryover code="100.00.035">${fmtNum(data.loss_carryover)}</LossCarryover>
    <IncomeAfterLoss code="100.00.036">${fmtNum(data.income_after_loss)}</IncomeAfterLoss>
    <TaxRate code="100.00.037">${data.tax_rate}</TaxRate>
    <CITAmount code="100.00.038">${fmtNum(data.cit_amount)}</CITAmount>
    <CITWithheld code="100.00.039">${fmtNum(data.cit_withheld_at_source)}</CITWithheld>
    <CITAdvance code="100.00.040">${fmtNum(data.cit_advance_payments)}</CITAdvance>
    <CITToPay code="100.00.041" IsToPay="${data.is_to_pay}">${fmtNum(data.is_to_pay ? data.cit_to_pay : data.cit_to_refund)}</CITToPay>
  </Section3_CITCalculation>
  
  <!-- Приложение 100.02 — Расходы на оплату труда -->
  <Appendix100_02_Payroll>
    <SalaryTotal>${fmtNum(data.payroll_breakdown.salary_total)}</SalaryTotal>
    <Bonuses>${fmtNum(data.payroll_breakdown.bonuses)}</Bonuses>
    <Vacations>${fmtNum(data.payroll_breakdown.vacations)}</Vacations>
    <OtherPayments>${fmtNum(data.payroll_breakdown.other_payments)}</OtherPayments>
    <EmployeesCountAverage>${data.payroll_breakdown.employees_count_avg}</EmployeesCountAverage>
  </Appendix100_02_Payroll>
  
  <!-- Приложение 100.03 — Амортизация ОС по группам -->
  <Appendix100_03_Depreciation>${depreciationGroupsXml}
  </Appendix100_03_Depreciation>
  
  <Metadata>
    <GeneratedBy>Finstat.kz</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <Version>1.0</Version>
  </Metadata>
</Declaration>`;

  return xml;
}

export const F100_INFO = {
  code: FORM_CODE,
  name: FORM_NAME,
  description: "Декларация по корпоративному подоходному налогу. Сдаётся раз в год до 31 марта всеми ТОО на ОУР.",
  period_type: "year" as const,
  due_day: 31,
  due_month_offset: 3,
  rate_info: "Стандартная ставка КПН 20%. Уменьшается на убытки прошлых лет (до 10 лет вперёд).",
};
