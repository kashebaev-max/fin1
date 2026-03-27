// ═══════════════════════════════════════════
// НАЛОГОВЫЕ СТАВКИ НК РК 2026
// ЗРК 214-VIII от 18 июля 2025 года
// ═══════════════════════════════════════════

export const TAX = {
  // НДС
  NDS: 0.16,           // Базовая ставка 16% (было 12%)
  NDS_5: 0.05,         // Льготная ставка 5%
  NDS_10: 0.10,        // Льготная ставка 10%

  // ИПН — прогрессивная шкала
  IPN: 0.10,           // 10% — доходы до 8500 МРП/год
  IPN_HIGH: 0.15,      // 15% — доходы свыше 8500 МРП/год

  // Пенсионные взносы
  OPV: 0.10,           // ОПВ — 10% (за счёт работника)
  OPVR: 0.035,         // ОПВР — 3.5% (за счёт работодателя, было 2.5%)

  // Медицинское страхование
  VOSMS: 0.02,         // ВОСМС — 2% (за счёт работника)
  OOSMS: 0.03,         // ООСМС — 3% (за счёт работодателя)

  // Социальные
  SO: 0.05,            // СО — 5% от (ЗП - ОПВ)
  SN: 0.06,            // СН — 6% (было 11%, без вычета СО)

  // Корпоративный подоходный налог
  KPN: 0.20,           // Базовая — 20%
  KPN_BANK: 0.25,      // Банки, игорный — 25%
  KPN_AGRO: 0.03,      // Сельхоз — 3%
  KPN_SOC_2026: 0.05,  // Соцсфера 2026 — 5%
  KPN_SOC_2027: 0.10,  // Соцсфера 2027 — 10%
  KPN_COOP: 0.06,      // С/х кооперативы — 6%

  // Показатели
  MRP: 4325,           // МРП на 2026 год
  MZP: 85000,          // МЗП на 2026 год

  // Вычеты
  BASE_DEDUCTION_MRP: 30,  // Базовый вычет — 30 МРП (было 14 МРП)
  IPN_THRESHOLD_MRP: 8500, // Порог прогрессивного ИПН — 8500 МРП/год
  NDS_THRESHOLD_MRP: 10000, // Порог НДС — 10000 МРП
  KPN_ADVANCE_MRP: 600000,  // Порог авансовых КПН — 600000 МРП

  // СНР Упрощённая декларация
  SNR_RATE: 0.04,      // Ставка 4% (±50% по регионам)
  SNR_THRESHOLD_MRP: 600000, // Порог — 600 000 МРП
} as const;

// Вычисляемые показатели
export const TAX_COMPUTED = {
  BASE_DEDUCTION: TAX.BASE_DEDUCTION_MRP * TAX.MRP,       // 129 750 ₸
  NDS_THRESHOLD: TAX.NDS_THRESHOLD_MRP * TAX.MRP,         // 43 250 000 ₸
  IPN_THRESHOLD_YEAR: TAX.IPN_THRESHOLD_MRP * TAX.MRP,    // 36 762 500 ₸
  KPN_ADVANCE_THRESHOLD: TAX.KPN_ADVANCE_MRP * TAX.MRP,   // 2 595 000 000 ₸
  SN_MIN_BASE: 14 * TAX.MRP,                              // 60 550 ₸
};

// Расчёт зарплаты по НК РК 2026
export interface SalaryCalc {
  gross: number;
  opv: number;
  vosms: number;
  baseDeduction: number;
  ipnBase: number;
  ipn: number;
  netSalary: number;
  // За счёт работодателя
  opvr: number;
  so: number;
  oosms: number;
  sn: number;
  employerTotal: number;
}

export function calcSalary(gross: number): SalaryCalc {
  // Удержания из зарплаты
  const opv = Math.round(gross * TAX.OPV);
  const vosms = Math.round(gross * TAX.VOSMS);
  const baseDeduction = TAX_COMPUTED.BASE_DEDUCTION;
  const ipnBase = Math.max(0, gross - opv - vosms - baseDeduction);
  const ipn = Math.round(ipnBase * TAX.IPN);
  const netSalary = gross - opv - vosms - ipn;

  // За счёт работодателя
  const opvr = Math.round(gross * TAX.OPVR);
  const so = Math.round(Math.max(0, gross - opv) * TAX.SO);
  const oosms = Math.round(gross * TAX.OOSMS);
  const snBase = Math.max(gross, TAX_COMPUTED.SN_MIN_BASE);
  const sn = Math.round(snBase * TAX.SN);

  return {
    gross, opv, vosms, baseDeduction, ipnBase, ipn, netSalary,
    opvr, so, oosms, sn,
    employerTotal: opvr + so + oosms + sn,
  };
}

// НДС расчёт
export function calcNDS(sumWithoutNDS: number, rate: number = TAX.NDS) {
  const nds = Math.round(sumWithoutNDS * rate);
  return { sumWithoutNDS, nds, total: sumWithoutNDS + nds, rate };
}

// Форматирование
export function fmtMoney(n: number): string {
  return Number(n).toLocaleString("ru-RU");
}

export function fmtMoneyTenge(n: number): string {
  return `${fmtMoney(n)} ₸`;
}
