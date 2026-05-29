// Движок прогнозирования кассового потока.
// Анализирует историю, учитывает запланированные платежи, дебиторку, налоги.

import { SupabaseClient } from "@supabase/supabase-js";

export interface ForecastDay {
  date: string;
  weekday: string;
  isWeekend: boolean;
  
  // Изменения за день
  inflow: number; // ожидаемые поступления
  outflow: number; // ожидаемые выплаты
  netChange: number;
  
  // Накопительный остаток
  balance: number;
  
  // Что повлияло (для подсказок)
  events: ForecastEvent[];
  
  // Флаги
  isCashGap: boolean; // отрицательный остаток
  isLowBalance: boolean; // ниже безопасного минимума
  isWarning: boolean; // приближается к критическому
}

export interface ForecastEvent {
  type: "scheduled_in" | "scheduled_out" | "tax" | "salary" | "recurring" | "predicted_revenue" | "predicted_expense" | "adjustment";
  description: string;
  amount: number; // + поступление, - выплата
  source: string; // откуда узнали (название документа/платежа)
  certainty: "high" | "medium" | "low"; // насколько уверены в этом
}

export interface ForecastResult {
  generatedAt: string;
  horizonDays: number;
  
  // Стартовые условия
  startingBalance: number;
  cash: number;
  bank: number;
  
  // Прогноз
  days: ForecastDay[];
  
  // Сводка
  totalInflows: number;
  totalOutflows: number;
  finalBalance: number;
  minBalance: number;
  minBalanceDate: string;
  maxBalance: number;
  maxBalanceDate: string;
  
  // Кассовый разрыв
  hasCashGap: boolean;
  gapStartDate: string | null;
  gapAmount: number; // на сколько денег не хватит в худший день
  daysUntilGap: number | null;
  
  // Метрики
  avgDailyBurn: number; // средний дневной "сжигание" денег
  daysOfRunway: number; // на сколько дней хватит денег
  
  // Параметры
  scenario: ForecastScenario;
}

export interface ForecastScenario {
  name: string;
  revenueMultiplier: number; // 1.0 = базовый
  expenseMultiplier: number;
  collectionSpeedDays: number; // сдвиг получения дебиторки
  paymentSpeedDays: number; // сдвиг наших выплат
  oneTimeInflows: { date: string; amount: number; description: string }[];
  oneTimeOutflows: { date: string; amount: number; description: string }[];
  safeBalance: number; // что считать "безопасным" минимумом
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const KZ_HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-01-02", "2026-01-07", "2026-03-08",
  "2026-03-21", "2026-03-22", "2026-03-23", "2026-05-01",
  "2026-05-07", "2026-05-09", "2026-07-06", "2026-08-30",
  "2026-10-25", "2026-12-16",
]);

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

// ═══ ГЛАВНАЯ ФУНКЦИЯ ═══

export async function buildForecast(
  supabase: SupabaseClient,
  userId: string,
  horizonDays: number = 90,
  scenario?: Partial<ForecastScenario>
): Promise<ForecastResult> {
  const today = new Date().toISOString().slice(0, 10);
  const endDate = addDays(today, horizonDays);

  const sc: ForecastScenario = {
    name: scenario?.name || "Базовый сценарий",
    revenueMultiplier: scenario?.revenueMultiplier ?? 1.0,
    expenseMultiplier: scenario?.expenseMultiplier ?? 1.0,
    collectionSpeedDays: scenario?.collectionSpeedDays ?? 0,
    paymentSpeedDays: scenario?.paymentSpeedDays ?? 0,
    oneTimeInflows: scenario?.oneTimeInflows || [],
    oneTimeOutflows: scenario?.oneTimeOutflows || [],
    safeBalance: scenario?.safeBalance ?? 100000,
  };

  // ═══ 1. Загружаем все нужные данные ═══
  const [entriesRes, schedulesRes, employeesRes, ordersRes] = await Promise.all([
    supabase.from("journal_entries").select("*").eq("user_id", userId).order("entry_date", { ascending: false }).limit(1000),
    supabase.from("payment_schedules").select("*").eq("user_id", userId).eq("status", "pending").gte("scheduled_date", addDays(today, -30)).lte("scheduled_date", endDate),
    supabase.from("employees").select("*").eq("user_id", userId).eq("is_active", true),
    supabase.from("orders").select("*").eq("user_id", userId).order("order_date", { ascending: false }).limit(200),
  ]);

  const entries = entriesRes.data || [];
  const schedules = schedulesRes.data || [];
  const employees = employeesRes.data || [];
  const orders = ordersRes.data || [];

  // ═══ 2. Рассчитываем стартовые балансы ═══
  function getBalance(account: string): number {
    let bal = 0;
    entries.forEach(e => {
      if (String(e.debit_account) === account) bal += Number(e.amount);
      if (String(e.credit_account) === account) bal -= Number(e.amount);
    });
    return bal;
  }

  const cash = Math.max(0, getBalance("1010"));
  const bank = Math.max(0, getBalance("1030")) + Math.max(0, getBalance("1040"));
  const startingBalance = cash + bank;

  // ═══ 3. Считаем средние ежедневные показатели по последним 90 дням ═══
  const histStart = addDays(today, -90);
  const histEntries = entries.filter(e => e.entry_date >= histStart && e.entry_date <= today);

  let histRevenue = 0;
  let histExpenses = 0;
  histEntries.forEach(e => {
    const amt = Number(e.amount);
    const cr = String(e.credit_account || "");
    const dr = String(e.debit_account || "");
    if (cr === "6010") histRevenue += amt;
    if (["7010", "7110", "7210", "7310", "7990"].includes(dr)) histExpenses += amt;
  });
  const avgDailyRevenue = histRevenue / 90;
  const avgDailyExpenses = histExpenses / 90;

  // ═══ 4. Дебиторка с прогнозом её закрытия ═══
  // Смотрим неоплаченные заказы — предполагаем оплату в течение 30 дней
  const unpaidOrders = orders.filter(o => o.payment_status !== "paid" && Number(o.total_amount) > 0);
  const expectedReceivables: { date: string; amount: number; description: string }[] = [];
  unpaidOrders.forEach(o => {
    // Если есть due_date — используем его, иначе предполагаем 14 дней от даты заказа
    const dueDate = o.payment_due_date || o.due_date || addDays(o.order_date || today, 14);
    const adjustedDate = addDays(dueDate, sc.collectionSpeedDays);
    if (adjustedDate >= today && adjustedDate <= endDate) {
      expectedReceivables.push({
        date: adjustedDate,
        amount: Number(o.total_amount),
        description: `Оплата от ${o.client_name || o.counterparty_name || "клиента"}`,
      });
    }
  });

  // ═══ 5. Запланированные платежи (и наши, и нам) ═══
  const scheduledIn: { date: string; amount: number; description: string }[] = [];
  const scheduledOut: { date: string; amount: number; description: string }[] = [];
  schedules.forEach(s => {
    const adjustedDate = s.payment_type === "incoming"
      ? addDays(s.scheduled_date, sc.collectionSpeedDays)
      : addDays(s.scheduled_date, sc.paymentSpeedDays);
    if (adjustedDate >= today && adjustedDate <= endDate) {
      const item = {
        date: adjustedDate,
        amount: Number(s.amount),
        description: s.description || (s.payment_type === "incoming" ? "Поступление" : "Платёж"),
      };
      if (s.payment_type === "incoming") scheduledIn.push(item);
      else scheduledOut.push(item);
    }
  });

  // ═══ 6. Зарплаты — 5 и 15 числа каждого месяца ═══
  const payrollEvents: { date: string; amount: number; description: string }[] = [];
  const monthlyPayroll = employees.reduce((a, e) => a + Number(e.salary || 0), 0);
  const halfPayroll = monthlyPayroll / 2;

  if (monthlyPayroll > 0) {
    let cur = new Date(today);
    while (cur.toISOString().slice(0, 10) <= endDate) {
      const m = cur.getMonth();
      const y = cur.getFullYear();
      // 5-го числа — окончательная за прошлый месяц
      const day5 = new Date(y, m, 5).toISOString().slice(0, 10);
      // 15-го — аванс
      const day15 = new Date(y, m, 15).toISOString().slice(0, 10);

      if (day5 >= today && day5 <= endDate) {
        payrollEvents.push({
          date: addDays(day5, sc.paymentSpeedDays),
          amount: halfPayroll,
          description: `Окончательный расчёт ЗП (${employees.length} чел.)`,
        });
      }
      if (day15 >= today && day15 <= endDate) {
        payrollEvents.push({
          date: addDays(day15, sc.paymentSpeedDays),
          amount: halfPayroll,
          description: `Аванс ЗП (${employees.length} чел.)`,
        });
      }
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(1);
    }
  }

  // ═══ 7. Налоги — приблизительно 25 числа за прошлый месяц ═══
  const taxEvents: { date: string; amount: number; description: string }[] = [];
  // НДС — 16% от выручки (упрощённо)
  // ИПН с зарплат — 10% от ФОТ
  // ОПВ — 10% от ФОТ (за работника)
  const monthlyVAT = avgDailyRevenue * 30 * 0.16 * 0.5; // упрощённо: половина выручки облагается
  const monthlyIPN = monthlyPayroll * 0.10;
  const monthlySocial = monthlyPayroll * 0.20; // ОПВ + ОПВР + ВОСМС + СО

  let curMonth = new Date(today);
  while (curMonth.toISOString().slice(0, 10) <= endDate) {
    const m = curMonth.getMonth();
    const y = curMonth.getFullYear();
    const day25 = new Date(y, m, 25).toISOString().slice(0, 10);

    if (day25 >= today && day25 <= endDate) {
      if (monthlyVAT > 0) taxEvents.push({ date: day25, amount: monthlyVAT, description: "Уплата НДС (прогноз)" });
      if (monthlyIPN > 0) taxEvents.push({ date: day25, amount: monthlyIPN, description: "Уплата ИПН с ЗП" });
      if (monthlySocial > 0) taxEvents.push({ date: day25, amount: monthlySocial, description: "Социальные налоги" });
    }
    curMonth.setMonth(curMonth.getMonth() + 1);
    curMonth.setDate(1);
  }

  // ═══ 8. Прогнозные ежедневные доходы и расходы (помимо учтённых выше) ═══
  // Корректируем чтобы не дублировать с запланированными
  const dailyPredictedRevenue = avgDailyRevenue * sc.revenueMultiplier;
  const dailyPredictedExpense = avgDailyExpenses * sc.expenseMultiplier;

  // ═══ 9. Строим прогноз по дням ═══
  const days: ForecastDay[] = [];
  let runningBalance = startingBalance;

  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(today, i);
    const dateObj = new Date(date);
    const weekday = WEEKDAYS[dateObj.getDay()];
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const isHoliday = KZ_HOLIDAYS_2026.has(date);

    const events: ForecastEvent[] = [];
    let dayInflow = 0;
    let dayOutflow = 0;

    // Прогнозный доход (только в рабочие дни)
    if (!isWeekend && !isHoliday && i > 0) {
      const predRev = dailyPredictedRevenue;
      if (predRev > 100) {
        events.push({
          type: "predicted_revenue",
          description: "Прогноз продаж (среднее за 90 дн.)",
          amount: predRev,
          source: "history_avg",
          certainty: "medium",
        });
        dayInflow += predRev;
      }
      const predExp = dailyPredictedExpense * 0.7; // часть расходов уже в фиксированных платежах
      if (predExp > 100) {
        events.push({
          type: "predicted_expense",
          description: "Прогноз расходов (среднее за 90 дн.)",
          amount: -predExp,
          source: "history_avg",
          certainty: "medium",
        });
        dayOutflow += predExp;
      }
    }

    // Запланированные поступления
    scheduledIn.filter(s => s.date === date).forEach(s => {
      events.push({
        type: "scheduled_in",
        description: s.description,
        amount: s.amount,
        source: "payment_schedules",
        certainty: "high",
      });
      dayInflow += s.amount;
    });

    // Запланированные выплаты
    scheduledOut.filter(s => s.date === date).forEach(s => {
      events.push({
        type: "scheduled_out",
        description: s.description,
        amount: -s.amount,
        source: "payment_schedules",
        certainty: "high",
      });
      dayOutflow += s.amount;
    });

    // Ожидаемые поступления от клиентов
    expectedReceivables.filter(r => r.date === date).forEach(r => {
      events.push({
        type: "scheduled_in",
        description: r.description,
        amount: r.amount,
        source: "orders",
        certainty: "medium",
      });
      dayInflow += r.amount;
    });

    // Зарплаты
    payrollEvents.filter(p => p.date === date).forEach(p => {
      events.push({
        type: "salary",
        description: p.description,
        amount: -p.amount,
        source: "employees",
        certainty: "high",
      });
      dayOutflow += p.amount;
    });

    // Налоги
    taxEvents.filter(t => t.date === date).forEach(t => {
      events.push({
        type: "tax",
        description: t.description,
        amount: -t.amount,
        source: "taxes",
        certainty: "high",
      });
      dayOutflow += t.amount;
    });

    // Разовые поступления из сценария
    sc.oneTimeInflows.filter(o => o.date === date).forEach(o => {
      events.push({
        type: "adjustment",
        description: o.description,
        amount: o.amount,
        source: "scenario",
        certainty: "medium",
      });
      dayInflow += o.amount;
    });

    // Разовые выплаты из сценария
    sc.oneTimeOutflows.filter(o => o.date === date).forEach(o => {
      events.push({
        type: "adjustment",
        description: o.description,
        amount: -o.amount,
        source: "scenario",
        certainty: "medium",
      });
      dayOutflow += o.amount;
    });

    const netChange = dayInflow - dayOutflow;
    runningBalance += netChange;

    days.push({
      date,
      weekday,
      isWeekend: isWeekend || isHoliday,
      inflow: dayInflow,
      outflow: dayOutflow,
      netChange,
      balance: runningBalance,
      events,
      isCashGap: runningBalance < 0,
      isLowBalance: runningBalance >= 0 && runningBalance < sc.safeBalance,
      isWarning: runningBalance >= sc.safeBalance && runningBalance < sc.safeBalance * 2,
    });
  }

  // ═══ 10. Сводные метрики ═══
  const totalInflows = days.reduce((a, d) => a + d.inflow, 0);
  const totalOutflows = days.reduce((a, d) => a + d.outflow, 0);

  const minDay = days.reduce((min, d) => d.balance < min.balance ? d : min, days[0]);
  const maxDay = days.reduce((max, d) => d.balance > max.balance ? d : max, days[0]);

  const firstGap = days.find(d => d.isCashGap);
  const hasCashGap = !!firstGap;
  const gapStartDate = firstGap?.date || null;
  const gapAmount = hasCashGap ? Math.abs(minDay.balance) : 0;
  const daysUntilGap = firstGap ? daysBetween(today, firstGap.date) : null;

  const avgDailyBurn = totalOutflows / horizonDays;
  const daysOfRunway = avgDailyBurn > 0 ? Math.floor(startingBalance / avgDailyBurn) : 999;

  return {
    generatedAt: new Date().toISOString(),
    horizonDays,
    startingBalance,
    cash,
    bank,
    days,
    totalInflows,
    totalOutflows,
    finalBalance: days[days.length - 1]?.balance || startingBalance,
    minBalance: minDay.balance,
    minBalanceDate: minDay.date,
    maxBalance: maxDay.balance,
    maxBalanceDate: maxDay.date,
    hasCashGap,
    gapStartDate,
    gapAmount,
    daysUntilGap,
    avgDailyBurn,
    daysOfRunway,
    scenario: sc,
  };
}

// ═══ Краткое текстовое описание для AI ═══

export function forecastToText(f: ForecastResult): string {
  const lines: string[] = [];
  lines.push(`ПРОГНОЗ КАССОВОГО ПОТОКА на ${f.horizonDays} дней:`);
  lines.push(`Сценарий: ${f.scenario.name}`);
  lines.push(`Стартовый баланс: ${f.startingBalance.toLocaleString("ru-RU")} ₸ (касса ${f.cash.toLocaleString("ru-RU")} + банк ${f.bank.toLocaleString("ru-RU")})`);
  lines.push(`Конечный баланс: ${f.finalBalance.toLocaleString("ru-RU")} ₸`);
  lines.push(`Поступлений ожидается: ${f.totalInflows.toLocaleString("ru-RU")} ₸`);
  lines.push(`Выплат ожидается: ${f.totalOutflows.toLocaleString("ru-RU")} ₸`);
  lines.push(`Минимальный баланс: ${f.minBalance.toLocaleString("ru-RU")} ₸ (${f.minBalanceDate})`);
  lines.push(`Средний "burn" в день: ${Math.round(f.avgDailyBurn).toLocaleString("ru-RU")} ₸`);
  lines.push(`Денег хватит на: ~${f.daysOfRunway} дней при текущем темпе расхода`);

  if (f.hasCashGap) {
    lines.push(``);
    lines.push(`⚠ ВНИМАНИЕ: КАССОВЫЙ РАЗРЫВ`);
    lines.push(`Отрицательный баланс начнётся ${f.gapStartDate} (через ${f.daysUntilGap} дней)`);
    lines.push(`Глубина разрыва: ${f.gapAmount.toLocaleString("ru-RU")} ₸`);
  } else {
    lines.push(`✓ Кассовых разрывов в прогнозе не обнаружено`);
  }

  return lines.join("\n");
}
