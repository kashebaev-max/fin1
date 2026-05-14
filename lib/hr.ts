// Хелперы для табеля, отпусков, больничных по НК/ТК РК 2026

// ═══════════════════════════════════════════
// КОДЫ ТАБЕЛЯ
// ═══════════════════════════════════════════

export const TIMESHEET_CODES: Record<string, { name: string; color: string; isWorking: boolean }> = {
  "Я":  { name: "Явка",         color: "#10B981", isWorking: true },
  "В":  { name: "Выходной",     color: "#6B7280", isWorking: false },
  "П":  { name: "Праздник",     color: "#F59E0B", isWorking: false },
  "О":  { name: "Отпуск",       color: "#A855F7", isWorking: false },
  "Б":  { name: "Больничный",   color: "#EF4444", isWorking: false },
  "ОТ": { name: "Отгул",        color: "#6366F1", isWorking: false },
  "ПР": { name: "Прогул",       color: "#DC2626", isWorking: false },
  "К":  { name: "Командировка", color: "#06B6D4", isWorking: true },
};

// ═══════════════════════════════════════════
// ПРАЗДНИКИ РК 2026
// ═══════════════════════════════════════════

export const KZ_HOLIDAYS_2026 = [
  "2026-01-01", "2026-01-02",  // НГ
  "2026-01-07",                 // Рождество
  "2026-03-08",                 // 8 марта
  "2026-03-21", "2026-03-22", "2026-03-23",  // Наурыз
  "2026-05-01",                 // Праздник единства
  "2026-05-07",                 // День Защитника Отечества
  "2026-05-09",                 // День Победы
  "2026-07-06",                 // День Столицы
  "2026-08-30",                 // День Конституции
  "2026-10-25",                 // День Республики
  "2026-12-16",                 // День Независимости
];

// ═══════════════════════════════════════════
// АВТОЗАПОЛНЕНИЕ ТАБЕЛЯ
// ═══════════════════════════════════════════

export function generateTimesheetDays(
  year: number,
  month: number,
  workSchedule: "5x2" | "6x1" | "shift" = "5x2",
  hoursPerDay: number = 8
): Record<string, { code: string; hours: number }> {
  const result: Record<string, { code: string; hours: number }> = {};
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    let code = "Я";
    let hours = hoursPerDay;

    if (KZ_HOLIDAYS_2026.indexOf(dateStr) !== -1) {
      code = "П";
      hours = 0;
    } else if (workSchedule === "5x2" && (dayOfWeek === 0 || dayOfWeek === 6)) {
      code = "В";
      hours = 0;
    } else if (workSchedule === "6x1" && dayOfWeek === 0) {
      code = "В";
      hours = 0;
    }

    result[day.toString()] = { code, hours };
  }

  return result;
}

// ═══════════════════════════════════════════
// ПОДСЧЁТ ИТОГОВ ТАБЕЛЯ
// ═══════════════════════════════════════════

export function calculateTimesheetTotals(days: Record<string, { code: string; hours: number }>) {
  const totals = {
    worked_days: 0,
    worked_hours: 0,
    vacation_days: 0,
    sick_days: 0,
    weekend_days: 0,
    holiday_days: 0,
    absent_days: 0,
  };

  Object.values(days).forEach(d => {
    switch (d.code) {
      case "Я":
      case "К":
        totals.worked_days++;
        totals.worked_hours += d.hours || 0;
        break;
      case "О": totals.vacation_days++; break;
      case "Б": totals.sick_days++; break;
      case "В": totals.weekend_days++; break;
      case "П": totals.holiday_days++; break;
      case "ПР":
      case "ОТ":
        totals.absent_days++;
        break;
    }
  });

  return totals;
}

// ═══════════════════════════════════════════
// СТАЖ РАБОТЫ
// ═══════════════════════════════════════════

export function calculateWorkExperience(startDate: string | null): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  const years = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, years);
}

// ═══════════════════════════════════════════
// КОЭФФИЦИЕНТ БОЛЬНИЧНОГО ПО СТАЖУ
// ═══════════════════════════════════════════

export function sickLeaveRate(experienceYears: number): number {
  if (experienceYears < 1) return 60;
  if (experienceYears < 5) return 80;
  return 100;
}

// ═══════════════════════════════════════════
// РАСЧЁТ БОЛЬНИЧНОГО ПО НК/ТК РК
// ═══════════════════════════════════════════

export interface SickLeaveCalculation {
  averageDailyWage: number;     // средний дневной заработок
  paymentRate: number;           // 60/80/100%
  employerDays: number;          // дни за счёт работодателя (макс 3)
  employerAmount: number;        // сумма работодателя
  gfssDays: number;              // дни за счёт ГФСС
  gfssAmount: number;            // сумма ГФСС
  totalAmount: number;           // всего начислено
  ipnAmount: number;             // ИПН 10%
  netAmount: number;             // на руки
}

export function calculateSickLeave(
  averageDailyWage: number,
  totalDays: number,
  experienceYears: number
): SickLeaveCalculation {
  const rate = sickLeaveRate(experienceYears);
  const dailyAmount = averageDailyWage * (rate / 100);
  
  const employerDays = Math.min(3, totalDays);
  const gfssDays = Math.max(0, totalDays - 3);
  
  const employerAmount = Math.round(dailyAmount * employerDays);
  const gfssAmount = Math.round(dailyAmount * gfssDays);
  const totalAmount = employerAmount + gfssAmount;
  
  // ИПН 10% с части работодателя (с ГФСС - не удерживается обычно, но зависит от учётной политики)
  const ipnAmount = Math.round(employerAmount * 0.10);
  const netAmount = totalAmount - ipnAmount;
  
  return {
    averageDailyWage,
    paymentRate: rate,
    employerDays,
    employerAmount,
    gfssDays,
    gfssAmount,
    totalAmount,
    ipnAmount,
    netAmount,
  };
}

// ═══════════════════════════════════════════
// РАСЧЁТ ОТПУСКНЫХ ПО ТК РК
// ═══════════════════════════════════════════

export interface VacationCalculation {
  calendarDays: number;
  workingDays: number;
  averageDailyWage: number;
  grossAmount: number;        // начислено
  ipnAmount: number;          // ИПН 10%
  opvAmount: number;          // ОПВ 10%
  vosmsAmount: number;        // ВОСМС 2%
  netAmount: number;          // на руки
}

export function calculateVacationPay(
  averageDailyWage: number,
  calendarDays: number,
  workingDays?: number
): VacationCalculation {
  // По ТК РК: отпускные = средний дневной заработок × календарные дни отпуска
  const days = workingDays || calendarDays;
  const grossAmount = Math.round(averageDailyWage * days);
  
  // ОПВ 10% сверху (до 50 МЗП = 4 250 000 ₸ в 2026)
  const opvBase = Math.min(grossAmount, 4250000);
  const opvAmount = Math.round(opvBase * 0.10);
  
  // ВОСМС 2% (с 2024)
  const vosmsAmount = Math.round(grossAmount * 0.02);
  
  // ИПН 10% (после вычета ОПВ и стандартного вычета 14 МРП)
  const MRP_2026 = 4325;
  const standardDeduction = 14 * MRP_2026;
  const ipnBase = Math.max(0, grossAmount - opvAmount - vosmsAmount - standardDeduction);
  const ipnAmount = Math.round(ipnBase * 0.10);
  
  const netAmount = grossAmount - ipnAmount - opvAmount - vosmsAmount;
  
  return {
    calendarDays,
    workingDays: days,
    averageDailyWage,
    grossAmount,
    ipnAmount,
    opvAmount,
    vosmsAmount,
    netAmount,
  };
}

// ═══════════════════════════════════════════
// КАЛЕНДАРНЫЕ И РАБОЧИЕ ДНИ В ПЕРИОДЕ
// ═══════════════════════════════════════════

export function countDaysInPeriod(startDate: string, endDate: string): {
  calendar: number;
  working: number;
} {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let calendar = 0;
  let working = 0;
  
  const current = new Date(start);
  while (current <= end) {
    calendar++;
    
    const dateStr = current.toISOString().slice(0, 10);
    const dow = current.getDay();
    
    if (dow !== 0 && dow !== 6 && KZ_HOLIDAYS_2026.indexOf(dateStr) === -1) {
      working++;
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return { calendar, working };
}

// ═══════════════════════════════════════════
// НАЗВАНИЯ МЕСЯЦЕВ
// ═══════════════════════════════════════════

export const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

export const MONTHS_RU_SHORT = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"
];

export const VACATION_TYPES: Record<string, { name: string; icon: string; color: string }> = {
  labor:      { name: "Трудовой основной",  icon: "🏖", color: "#A855F7" },
  additional: { name: "Дополнительный",     icon: "➕", color: "#6366F1" },
  unpaid:     { name: "Без сохранения",     icon: "❌", color: "#6B7280" },
  maternity:  { name: "Декретный",          icon: "👶", color: "#EC4899" },
  study:      { name: "Учебный",            icon: "📚", color: "#06B6D4" },
};
