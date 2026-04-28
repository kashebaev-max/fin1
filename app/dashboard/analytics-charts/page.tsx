"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";
import {
  ChartCard, BarChart, BarChartLabels, LineChart, PieChart,
  HeatmapGrid, ProgressBar, KPICard,
} from "@/components/charts/Charts";

const MONTHS_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

type Tab = "overview" | "sales" | "finance" | "inventory" | "hr";

export default function AnalyticsChartsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  // Данные для графиков
  const [data, setData] = useState({
    monthlyRevenue: [] as { label: string; value: number }[],
    monthlyExpenses: [] as { label: string; value: number }[],
    revenueByCategory: [] as { label: string; value: number }[],
    topClients: [] as { label: string; value: number }[],
    cashflowTrend: [] as { label: string; value: number }[],
    accountsBalance: [] as { label: string; value: number; color: string }[],
    inventoryByCategory: [] as { label: string; value: number }[],
    topProducts: [] as { label: string; value: number }[],
    employeeSalaries: [] as { label: string; value: number }[],
    dailyActivity: [] as { date: string; value: number }[],
    taxBreakdown: [] as { label: string; value: number; color: string }[],
    paymentSchedule: [] as { label: string; value: number; color: string }[],
    kpi: {
      totalRevenue: 0, totalExpenses: 0, profit: 0, profitMargin: 0,
      avgCheck: 0, salesCount: 0, employees: 0, payroll: 0,
      inventoryValue: 0, lowStockCount: 0,
      revenueGrowth: 0, expenseGrowth: 0,
    },
  });

  useEffect(() => { loadData(); }, [year]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const prevYearStart = `${year - 1}-01-01`;
    const prevYearEnd = `${year - 1}-12-31`;
    const today = new Date().toISOString().slice(0, 10);

    const [entriesRes, ordersRes, nomenclatureRes, employeesRes, schedulesRes, prevEntriesRes] = await Promise.all([
      supabase.from("journal_entries").select("*").eq("user_id", user.id).gte("entry_date", yearStart).lte("entry_date", yearEnd),
      supabase.from("orders").select("*").eq("user_id", user.id).gte("order_date", yearStart).lte("order_date", yearEnd),
      supabase.from("nomenclature").select("*").eq("user_id", user.id),
      supabase.from("employees").select("*").eq("user_id", user.id),
      supabase.from("payment_schedules").select("*").eq("user_id", user.id).gte("scheduled_date", yearStart).lte("scheduled_date", `${year}-12-31`),
      supabase.from("journal_entries").select("*").eq("user_id", user.id).gte("entry_date", prevYearStart).lte("entry_date", prevYearEnd),
    ]);

    const entries = entriesRes.data || [];
    const orders = ordersRes.data || [];
    const nomenclature = nomenclatureRes.data || [];
    const employees = employeesRes.data || [];
    const schedules = schedulesRes.data || [];
    const prevEntries = prevEntriesRes.data || [];

    // ═══ Месячные обороты ═══
    const revByMonth = Array(12).fill(0);
    const expByMonth = Array(12).fill(0);
    entries.forEach(e => {
      const m = parseInt(e.entry_date.slice(5, 7)) - 1;
      const dr = String(e.debit_account || "");
      const cr = String(e.credit_account || "");
      const amt = Number(e.amount);
      if (cr === "6010") revByMonth[m] += amt;
      if (["7010", "7110", "7210", "7310", "7990"].includes(dr)) expByMonth[m] += amt;
    });

    const monthlyRevenue = revByMonth.map((v, i) => ({ label: MONTHS_RU[i], value: v }));
    const monthlyExpenses = expByMonth.map((v, i) => ({ label: MONTHS_RU[i], value: v }));

    // Кэшфлоу — кумулятивный остаток денег
    let runningCash = 0;
    const cashflowTrend = revByMonth.map((rev, i) => {
      runningCash += rev - expByMonth[i];
      return { label: MONTHS_RU[i], value: runningCash };
    });

    // ═══ Топ клиенты ═══
    const clientRev: Record<string, number> = {};
    orders.forEach(o => {
      const name = o.client_name || o.counterparty_name || "Без имени";
      clientRev[name] = (clientRev[name] || 0) + Number(o.total_amount || 0);
    });
    const topClients = Object.entries(clientRev)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));

    // ═══ Балансы счетов ═══
    function getBalance(account: string) {
      let b = 0;
      entries.forEach(e => {
        if (String(e.debit_account) === account) b += Number(e.amount);
        if (String(e.credit_account) === account) b -= Number(e.amount);
      });
      return Math.max(0, b);
    }
    const accountsBalance = [
      { label: "Касса (1010)", value: getBalance("1010"), color: "#10B981" },
      { label: "Банк (1030)", value: getBalance("1030"), color: "#3B82F6" },
      { label: "Дебиторка (1210)", value: getBalance("1210"), color: "#F59E0B" },
      { label: "Запасы (1310)", value: getBalance("1310"), color: "#A855F7" },
    ].filter(a => a.value > 0);

    // ═══ Категории номенклатуры ═══
    const catRev: Record<string, number> = {};
    nomenclature.forEach(n => {
      const cat = n.category || n.unit || "Без категории";
      const val = Number(n.quantity || 0) * Number(n.purchase_price || 0);
      catRev[cat] = (catRev[cat] || 0) + val;
    });
    const inventoryByCategory = Object.entries(catRev)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }));

    // ═══ Топ товары по остаткам ═══
    const topProducts = nomenclature
      .filter(n => Number(n.quantity || 0) > 0)
      .sort((a, b) => Number(b.quantity || 0) * Number(b.purchase_price || 0) - Number(a.quantity || 0) * Number(a.purchase_price || 0))
      .slice(0, 8)
      .map(n => ({ label: n.name, value: Number(n.quantity || 0) * Number(n.purchase_price || 0) }));

    // ═══ Зарплаты сотрудников ═══
    const employeeSalaries = employees
      .filter(e => e.is_active !== false && Number(e.salary || 0) > 0)
      .sort((a, b) => Number(b.salary) - Number(a.salary))
      .slice(0, 10)
      .map(e => ({ label: e.full_name, value: Number(e.salary) }));

    // ═══ Активность по дням (последние 60) ═══
    const dailyMap: Record<string, number> = {};
    for (let i = 59; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap[d.toISOString().slice(0, 10)] = 0;
    }
    entries.forEach(e => {
      if (e.entry_date in dailyMap) dailyMap[e.entry_date]++;
    });
    const dailyActivity = Object.entries(dailyMap).map(([date, value]) => ({ date, value }));

    // ═══ Налоги к уплате ═══
    const vatDue = Math.max(0, -getBalance("3130") < 0 ? getBalance("3130") * -1 : 0);
    function getNeg(account: string) { return Math.max(0, -getBalance(account) < 0 ? -getBalance(account) : 0); }
    let vat = 0, ipn = 0, cit = 0, soc = 0;
    entries.forEach(e => {
      const cr = String(e.credit_account || "");
      const dr = String(e.debit_account || "");
      if (cr === "3130") vat += Number(e.amount);
      if (dr === "3130") vat -= Number(e.amount);
      if (cr === "3120") ipn += Number(e.amount);
      if (dr === "3120") ipn -= Number(e.amount);
      if (cr === "3110") cit += Number(e.amount);
      if (dr === "3110") cit -= Number(e.amount);
      if (["3150", "3210", "3220", "3230"].includes(cr)) soc += Number(e.amount);
      if (["3150", "3210", "3220", "3230"].includes(dr)) soc -= Number(e.amount);
    });
    const taxBreakdown = [
      { label: "НДС (3130)", value: Math.max(0, vat), color: "#EF4444" },
      { label: "ИПН (3120)", value: Math.max(0, ipn), color: "#F59E0B" },
      { label: "КПН (3110)", value: Math.max(0, cit), color: "#A855F7" },
      { label: "Соц. налоги", value: Math.max(0, soc), color: "#3B82F6" },
    ].filter(t => t.value > 0);

    // ═══ График платежей (входящие vs исходящие) ═══
    const incomingByMonth = Array(12).fill(0);
    const outgoingByMonth = Array(12).fill(0);
    schedules.forEach(s => {
      const m = parseInt(s.scheduled_date.slice(5, 7)) - 1;
      const amt = Number(s.amount);
      if (s.payment_type === "incoming") incomingByMonth[m] += amt;
      else outgoingByMonth[m] += amt;
    });
    const paymentSchedule = MONTHS_RU.map((m, i) => ({
      label: m,
      value: incomingByMonth[i] - outgoingByMonth[i],
      color: incomingByMonth[i] >= outgoingByMonth[i] ? "#10B981" : "#EF4444",
    }));

    // ═══ KPI ═══
    const totalRevenue = revByMonth.reduce((a, v) => a + v, 0);
    const totalExpenses = expByMonth.reduce((a, v) => a + v, 0);
    const profit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const salesCount = orders.length;
    const avgCheck = salesCount > 0 ? totalRevenue / salesCount : 0;

    // Прошлый год для сравнения
    let prevRev = 0, prevExp = 0;
    prevEntries.forEach(e => {
      const cr = String(e.credit_account || "");
      const dr = String(e.debit_account || "");
      if (cr === "6010") prevRev += Number(e.amount);
      if (["7010", "7110", "7210", "7310", "7990"].includes(dr)) prevExp += Number(e.amount);
    });
    const revenueGrowth = prevRev > 0 ? ((totalRevenue - prevRev) / prevRev) * 100 : 0;
    const expenseGrowth = prevExp > 0 ? ((totalExpenses - prevExp) / prevExp) * 100 : 0;

    setData({
      monthlyRevenue, monthlyExpenses, cashflowTrend, accountsBalance,
      inventoryByCategory, topProducts, topClients, employeeSalaries,
      dailyActivity, taxBreakdown, paymentSchedule,
      revenueByCategory: [],
      kpi: {
        totalRevenue, totalExpenses, profit, profitMargin,
        avgCheck, salesCount,
        employees: employees.filter(e => e.is_active !== false).length,
        payroll: employees.filter(e => e.is_active !== false).reduce((a, e) => a + Number(e.salary || 0), 0),
        inventoryValue: nomenclature.reduce((a, n) => a + Number(n.quantity || 0) * Number(n.purchase_price || 0), 0),
        lowStockCount: nomenclature.filter(n => n.min_stock && Number(n.quantity || 0) < Number(n.min_stock)).length,
        revenueGrowth, expenseGrowth,
      },
    });

    setLoading(false);
  }

  if (loading) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка графиков...</div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Графики и визуализация ключевых показателей бизнеса. Все данные тянутся в реальном времени из ваших проводок, заказов, склада, кадров.
      </div>

      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          {([
            ["overview", "📊 Обзор"],
            ["sales", "💼 Продажи"],
            ["finance", "💰 Финансы"],
            ["inventory", "📦 Склад"],
            ["hr", "👥 Кадры"],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
              style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
              {label}
            </button>
          ))}
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 120 }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y} год</option>)}
        </select>
      </div>

      {/* ═══ ОБЗОР ═══ */}
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <KPICard label="Выручка YTD" value={fmtMoney(data.kpi.totalRevenue)} unit="₸"
              trend={data.kpi.revenueGrowth} trendLabel="vs прошлый год"
              sparkData={data.monthlyRevenue.map(d => d.value)} color="#10B981" icon="💰" />
            <KPICard label="Расходы YTD" value={fmtMoney(data.kpi.totalExpenses)} unit="₸"
              trend={data.kpi.expenseGrowth} trendLabel="vs прошлый год"
              sparkData={data.monthlyExpenses.map(d => d.value)} color="#EF4444" icon="💸" />
            <KPICard label="Прибыль YTD" value={fmtMoney(data.kpi.profit)} unit="₸"
              sparkData={data.cashflowTrend.map(d => d.value)} color={data.kpi.profit >= 0 ? "#10B981" : "#EF4444"} icon="📈" />
            <KPICard label="Маржа" value={data.kpi.profitMargin.toFixed(1)} unit="%"
              color="#6366F1" icon="🎯" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ChartCard title="Динамика выручки и расходов" subtitle={`По месяцам ${year}`}
              legend={[{ label: "Выручка", color: "#10B981" }, { label: "Расходы", color: "#EF4444" }]}>
              <LineChart data={data.monthlyRevenue} compareData={data.monthlyExpenses}
                color="#10B981" compareColor="#EF4444" />
              <BarChartLabels labels={data.monthlyRevenue.map(d => d.label)} />
            </ChartCard>

            <ChartCard title="Кэшфлоу нарастающим итогом" subtitle="Выручка минус расходы"
              badge={data.kpi.profit >= 0 ? { text: "✓ В плюсе", color: "#10B981" } : { text: "⚠ В минусе", color: "#EF4444" }}>
              <LineChart data={data.cashflowTrend} color="#6366F1" showArea />
              <BarChartLabels labels={data.cashflowTrend.map(d => d.label)} />
            </ChartCard>
          </div>

          {data.taxBreakdown.length > 0 && (
            <ChartCard title="Налоги к уплате" subtitle="Накопленные обязательства по основным налогам">
              <PieChart data={data.taxBreakdown} />
            </ChartCard>
          )}

          <ChartCard title="Активность за последние 60 дней" subtitle="Количество проводок в день" height={70}>
            <HeatmapGrid data={data.dailyActivity} daysCount={60} />
          </ChartCard>
        </>
      )}

      {/* ═══ ПРОДАЖИ ═══ */}
      {tab === "sales" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KPICard label="Заказов за год" value={data.kpi.salesCount} color="#3B82F6" icon="📋" />
            <KPICard label="Средний чек" value={fmtMoney(data.kpi.avgCheck)} unit="₸" color="#10B981" icon="🛒" />
            <KPICard label="Топ клиент" value={data.topClients[0]?.label || "—"} color="#A855F7" icon="🏆" />
          </div>

          <ChartCard title="Месячная выручка" subtitle={`Помесячная динамика ${year}`}>
            <LineChart data={data.monthlyRevenue} color="#10B981" showArea />
            <BarChartLabels labels={data.monthlyRevenue.map(d => d.label)} />
          </ChartCard>

          {data.topClients.length > 0 && (
            <ChartCard title="Топ клиенты по обороту" subtitle="Самые ценные клиенты года" height={Math.max(200, data.topClients.length * 32)}>
              <BarChart data={data.topClients} horizontal />
            </ChartCard>
          )}
        </>
      )}

      {/* ═══ ФИНАНСЫ ═══ */}
      {tab === "finance" && (
        <>
          {data.accountsBalance.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <ChartCard title="Структура активов" subtitle="Распределение средств">
                <PieChart data={data.accountsBalance} />
              </ChartCard>

              <ChartCard title="Балансы счетов" subtitle="Сальдо на текущий момент" height={Math.max(200, data.accountsBalance.length * 50)}>
                <BarChart data={data.accountsBalance} horizontal />
              </ChartCard>
            </div>
          )}

          <ChartCard title="План платежей по месяцам" subtitle="Зелёное = поступления > выплат">
            <BarChart data={data.paymentSchedule} />
            <BarChartLabels labels={data.paymentSchedule.map(d => d.label)} />
          </ChartCard>

          {data.taxBreakdown.length > 0 && (
            <ChartCard title="Структура налоговых обязательств" subtitle="Что должны бюджету">
              <PieChart data={data.taxBreakdown} />
            </ChartCard>
          )}
        </>
      )}

      {/* ═══ СКЛАД ═══ */}
      {tab === "inventory" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KPICard label="Стоимость остатков" value={fmtMoney(data.kpi.inventoryValue)} unit="₸" color="#3B82F6" icon="📦" />
            <KPICard label="Ниже минимума" value={data.kpi.lowStockCount} unit="позиций"
              color={data.kpi.lowStockCount > 0 ? "#EF4444" : "#10B981"} icon="📉" />
          </div>

          {data.inventoryByCategory.length > 0 && (
            <ChartCard title="Распределение по категориям" subtitle="Стоимость остатков">
              <PieChart data={data.inventoryByCategory} />
            </ChartCard>
          )}

          {data.topProducts.length > 0 && (
            <ChartCard title="Топ позиций по стоимости" subtitle="Что хранится на складе" height={Math.max(220, data.topProducts.length * 32)}>
              <BarChart data={data.topProducts} horizontal />
            </ChartCard>
          )}
        </>
      )}

      {/* ═══ КАДРЫ ═══ */}
      {tab === "hr" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KPICard label="Сотрудников" value={data.kpi.employees} color="#A855F7" icon="👥" />
            <KPICard label="Месячный ФОТ" value={fmtMoney(data.kpi.payroll)} unit="₸" color="#EC4899" icon="💼" />
          </div>

          {data.employeeSalaries.length > 0 && (
            <ChartCard title="Зарплаты сотрудников" subtitle="По размеру оклада" height={Math.max(220, data.employeeSalaries.length * 32)}>
              <BarChart data={data.employeeSalaries} horizontal />
            </ChartCard>
          )}
        </>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Все графики</b> — нативные SVG без внешних библиотек. Загрузка мгновенная, работают и в светлой и в тёмной теме.<br/>
        💡 <b>Тренды</b> в KPI считаются как % изменения относительно прошлого года.<br/>
        💡 Наведите курсор на элемент графика — увидите точное значение.
      </div>
    </div>
  );
}
