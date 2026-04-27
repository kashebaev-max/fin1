"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "budgets" | "items" | "cfo" | "plan-fact";

const CFO_TYPES = {
  profit_center: { name: "Центр прибыли", color: "#10B981", icon: "💰" },
  cost_center: { name: "Центр затрат", color: "#EF4444", icon: "📉" },
  revenue_center: { name: "Центр доходов", color: "#3B82F6", icon: "📈" },
  investment_center: { name: "Центр инвестиций", color: "#A855F7", icon: "🚀" },
};

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const DEFAULT_ITEMS = [
  { code: "I-100", name: "Выручка от реализации товаров", item_type: "income", account_code: "6010" },
  { code: "I-200", name: "Выручка от услуг", item_type: "income", account_code: "6020" },
  { code: "I-300", name: "Прочие доходы", item_type: "income", account_code: "6280" },
  { code: "E-100", name: "Себестоимость товаров и услуг", item_type: "expense", account_code: "7010" },
  { code: "E-200", name: "Заработная плата", item_type: "expense", account_code: "7110" },
  { code: "E-210", name: "Налоги на ФОТ", item_type: "expense", account_code: "7120" },
  { code: "E-300", name: "Аренда помещений", item_type: "expense", account_code: "7210" },
  { code: "E-310", name: "Коммунальные услуги", item_type: "expense", account_code: "7220" },
  { code: "E-320", name: "Связь и интернет", item_type: "expense", account_code: "7230" },
  { code: "E-400", name: "Реклама и маркетинг", item_type: "expense", account_code: "7310" },
  { code: "E-500", name: "Транспортные расходы", item_type: "expense", account_code: "7410" },
  { code: "E-600", name: "Канцелярия и хозтовары", item_type: "expense", account_code: "7510" },
  { code: "E-700", name: "Прочие расходы", item_type: "expense", account_code: "7990" },
];

export default function BudgetingPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("budgets");
  const [budgets, setBudgets] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [cfos, setCfos] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [journal, setJournal] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [activeBudget, setActiveBudget] = useState<any>(null);

  // Forms
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ budget_name: "", year: new Date().getFullYear(), period_type: "monthly", description: "" });

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({ code: "", name: "", item_type: "expense", account_code: "", category: "", description: "" });

  const [showCfoForm, setShowCfoForm] = useState(false);
  const [cfoForm, setCfoForm] = useState({ code: "", name: "", cfo_type: "cost_center", manager_name: "", description: "" });

  // Plan-fact filter
  const [plYear, setPlYear] = useState(new Date().getFullYear());
  const [plBudgetId, setPlBudgetId] = useState("");

  // Inline editing of budget lines
  const [editingLine, setEditingLine] = useState<{ itemId: string; cfoId: string; month: number } | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [b, i, c, l, j] = await Promise.all([
      supabase.from("budgets").select("*").eq("user_id", user.id).order("year", { ascending: false }),
      supabase.from("budget_items").select("*").eq("user_id", user.id).order("code"),
      supabase.from("cfo_units").select("*").eq("user_id", user.id).order("code"),
      supabase.from("budget_lines").select("*").eq("user_id", user.id),
      supabase.from("journal_entries").select("*").eq("user_id", user.id),
    ]);

    setBudgets(b.data || []);
    setItems(i.data || []);
    setCfos(c.data || []);
    setLines(l.data || []);
    setJournal(j.data || []);

    if (b.data && b.data.length > 0 && !plBudgetId) {
      setPlBudgetId(b.data[0].id);
      setActiveBudget(b.data[0]);
      setPlYear(b.data[0].year);
    }
  }

  // ═══ БЮДЖЕТЫ ═══
  async function createBudget() {
    if (!budgetForm.budget_name) { setMsg("❌ Укажите название"); setTimeout(() => setMsg(""), 3000); return; }
    const { data } = await supabase.from("budgets").insert({
      user_id: userId,
      budget_name: budgetForm.budget_name,
      year: budgetForm.year,
      period_type: budgetForm.period_type,
      description: budgetForm.description,
      status: "draft",
    }).select().single();

    setMsg(`✅ Бюджет «${budgetForm.budget_name}» создан`);
    setBudgetForm({ budget_name: "", year: new Date().getFullYear(), period_type: "monthly", description: "" });
    setShowBudgetForm(false);
    if (data) {
      setPlBudgetId(data.id);
      setActiveBudget(data);
      setPlYear(data.year);
    }
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteBudget(id: string) {
    if (!confirm("Удалить бюджет и все его строки?")) return;
    await supabase.from("budget_lines").delete().eq("budget_id", id);
    await supabase.from("budgets").delete().eq("id", id);
    if (plBudgetId === id) { setPlBudgetId(""); setActiveBudget(null); }
    load();
  }

  async function changeBudgetStatus(id: string, status: string) {
    await supabase.from("budgets").update({ status }).eq("id", id);
    load();
  }

  // ═══ СТАТЬИ ═══
  async function loadDefaultItems() {
    if (items.length > 0) {
      if (!confirm("Уже есть статьи. Добавить стандартные сверху?")) return;
    }
    const toInsert = DEFAULT_ITEMS.map(it => ({ ...it, user_id: userId }));
    await supabase.from("budget_items").insert(toInsert);
    setMsg(`✅ Добавлено ${toInsert.length} стандартных статей`);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function addItem() {
    if (!itemForm.name || !itemForm.code) { setMsg("❌ Заполните код и название"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("budget_items").insert({ user_id: userId, ...itemForm });
    setItemForm({ code: "", name: "", item_type: "expense", account_code: "", category: "", description: "" });
    setShowItemForm(false);
    load();
  }

  async function deleteItem(id: string) {
    if (!confirm("Удалить статью?")) return;
    await supabase.from("budget_items").delete().eq("id", id);
    load();
  }

  // ═══ ЦФО ═══
  async function addCfo() {
    if (!cfoForm.name || !cfoForm.code) { setMsg("❌ Заполните код и название"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("cfo_units").insert({ user_id: userId, ...cfoForm });
    setCfoForm({ code: "", name: "", cfo_type: "cost_center", manager_name: "", description: "" });
    setShowCfoForm(false);
    load();
  }

  async function deleteCfo(id: string) {
    if (!confirm("Удалить ЦФО?")) return;
    await supabase.from("cfo_units").delete().eq("id", id);
    load();
  }

  // ═══ PLAN-FACT ═══
  function getPlannedAmount(itemId: string, cfoId: string, month: number): number {
    const line = lines.find(l =>
      l.budget_id === plBudgetId &&
      l.item_id === itemId &&
      (cfoId === "all" || l.cfo_id === cfoId || (cfoId === "no-cfo" && !l.cfo_id)) &&
      l.period_year === plYear &&
      l.period_month === month
    );
    return line ? Number(line.planned_amount) : 0;
  }

  function getActualAmount(itemAccountCode: string, month: number): number {
    if (!itemAccountCode) return 0;
    const monthStr = `${plYear}-${String(month).padStart(2, "0")}`;
    return journal.filter(e =>
      e.entry_date?.startsWith(monthStr) &&
      (e.debit_account === itemAccountCode || e.credit_account === itemAccountCode)
    ).reduce((a, e) => a + Number(e.amount), 0);
  }

  async function savePlanLine(itemId: string, cfoId: string, month: number, amount: number) {
    const item = items.find(i => i.id === itemId);
    const cfo = cfoId !== "no-cfo" ? cfos.find(c => c.id === cfoId) : null;
    if (!item) return;

    const existing = lines.find(l =>
      l.budget_id === plBudgetId &&
      l.item_id === itemId &&
      (l.cfo_id === cfoId || (cfoId === "no-cfo" && !l.cfo_id)) &&
      l.period_year === plYear &&
      l.period_month === month
    );

    if (existing) {
      if (amount === 0) {
        await supabase.from("budget_lines").delete().eq("id", existing.id);
      } else {
        await supabase.from("budget_lines").update({ planned_amount: amount }).eq("id", existing.id);
      }
    } else if (amount > 0) {
      await supabase.from("budget_lines").insert({
        user_id: userId,
        budget_id: plBudgetId,
        item_id: itemId,
        cfo_id: cfoId === "no-cfo" ? null : cfoId,
        item_name: item.name,
        item_type: item.item_type,
        cfo_name: cfo?.name || null,
        period_year: plYear,
        period_month: month,
        planned_amount: amount,
      });
    }
    load();
  }

  function startEditLine(itemId: string, cfoId: string, month: number) {
    const current = getPlannedAmount(itemId, cfoId, month);
    setEditingLine({ itemId, cfoId, month });
    setEditValue(current ? String(current) : "");
  }

  function commitEdit() {
    if (!editingLine) return;
    const amount = Number(editValue) || 0;
    savePlanLine(editingLine.itemId, editingLine.cfoId, editingLine.month, amount);
    setEditingLine(null);
    setEditValue("");
  }

  // KPI
  const activeBudgets = budgets.filter(b => b.status === "active" || b.status === "approved").length;
  const totalIncome = lines.filter(l => l.budget_id === plBudgetId && l.item_type === "income").reduce((a, l) => a + Number(l.planned_amount), 0);
  const totalExpense = lines.filter(l => l.budget_id === plBudgetId && l.item_type === "expense").reduce((a, l) => a + Number(l.planned_amount), 0);
  const planProfit = totalIncome - totalExpense;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Бюджетов</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{budgets.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Активных: {activeBudgets}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 План доходов</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalIncome)}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За {plYear} год</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📉 План расходов</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{fmtMoney(totalExpense)}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За {plYear} год</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${planProfit >= 0 ? "#A855F7" : "#EF4444"}` }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💎 Плановая прибыль</div>
          <div className="text-xl font-bold" style={{ color: planProfit >= 0 ? "#A855F7" : "#EF4444" }}>{fmtMoney(planProfit)}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Доходы − расходы</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          ["budgets", "📊 Бюджеты"],
          ["plan-fact", "📈 План / Факт"],
          ["items", "📋 Статьи бюджета"],
          ["cfo", "🏢 ЦФО"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ БЮДЖЕТЫ ═══ */}
      {tab === "budgets" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Бюджет — финансовый план на год. Создайте бюджет, затем заполните план в разделе «План / Факт».
            </div>
            <button onClick={() => setShowBudgetForm(!showBudgetForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новый бюджет
            </button>
          </div>

          {showBudgetForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Новый бюджет</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название</label><input value={budgetForm.budget_name} onChange={e => setBudgetForm({ ...budgetForm, budget_name: e.target.value })} placeholder="Бюджет 2026" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Год</label><input type="number" value={budgetForm.year} onChange={e => setBudgetForm({ ...budgetForm, year: Number(e.target.value) })} /></div>
                <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={budgetForm.description} onChange={e => setBudgetForm({ ...budgetForm, description: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={createBudget} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Создать</button>
                <button onClick={() => setShowBudgetForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Бюджет", "Год", "Период", "Статус", "План доходов", "План расходов", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {budgets.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет бюджетов. Создайте первый.</td></tr>
                ) : budgets.map(b => {
                  const income = lines.filter(l => l.budget_id === b.id && l.item_type === "income").reduce((a, l) => a + Number(l.planned_amount), 0);
                  const expense = lines.filter(l => l.budget_id === b.id && l.item_type === "expense").reduce((a, l) => a + Number(l.planned_amount), 0);
                  const statusColors: Record<string, string> = { draft: "#6B7280", approved: "#3B82F6", active: "#10B981", closed: "#A855F7" };
                  const statusNames: Record<string, string> = { draft: "Черновик", approved: "Утверждён", active: "Активен", closed: "Закрыт" };
                  return (
                    <tr key={b.id}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{b.budget_name}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{b.year}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{b.period_type === "monthly" ? "Месячный" : b.period_type === "quarterly" ? "Квартальный" : "Годовой"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <select value={b.status} onChange={e => changeBudgetStatus(b.id, e.target.value)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: statusColors[b.status] + "20", color: statusColors[b.status], border: "none" }}>
                          {Object.entries(statusNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="p-2.5 text-[12px] text-right" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(income)} ₸</td>
                      <td className="p-2.5 text-[12px] text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(expense)} ₸</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => { setPlBudgetId(b.id); setActiveBudget(b); setPlYear(b.year); setTab("plan-fact"); }} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>Открыть</button>
                        <button onClick={() => deleteBudget(b.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ PLAN-FACT ═══ */}
      {tab === "plan-fact" && (
        <>
          {budgets.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-3xl mb-2">📊</div>
              <div className="text-sm font-bold mb-2">Нет бюджетов</div>
              <div className="text-xs mb-4" style={{ color: "var(--t3)" }}>Создайте бюджет на вкладке «Бюджеты»</div>
              <button onClick={() => setTab("budgets")} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
                Создать бюджет
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-3xl mb-2">📋</div>
              <div className="text-sm font-bold mb-2">Нет статей бюджета</div>
              <div className="text-xs mb-4" style={{ color: "var(--t3)" }}>Загрузите стандартные статьи или создайте свои</div>
              <button onClick={loadDefaultItems} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
                Загрузить стандартные статьи
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-3 items-center">
                <select value={plBudgetId} onChange={e => { setPlBudgetId(e.target.value); const b = budgets.find(x => x.id === e.target.value); if (b) { setActiveBudget(b); setPlYear(b.year); } }}
                  style={{ maxWidth: 300 }}>
                  {budgets.map(b => <option key={b.id} value={b.id}>{b.budget_name} ({b.year})</option>)}
                </select>
                <div className="text-xs" style={{ color: "var(--t3)" }}>
                  💡 Кликните по ячейке, чтобы ввести план. Факт берётся из проводок журнала.
                </div>
              </div>

              {/* План/факт по статьям */}
              {(["income", "expense"] as const).map(typ => {
                const typItems = items.filter(i => i.item_type === typ);
                if (typItems.length === 0) return null;
                const typTitle = typ === "income" ? "📈 ДОХОДЫ" : "📉 РАСХОДЫ";
                const typColor = typ === "income" ? "#10B981" : "#EF4444";

                const typTotalsByMonth: number[] = MONTHS.map((_, m) =>
                  typItems.reduce((a, it) => a + getPlannedAmount(it.id, "no-cfo", m + 1), 0)
                );
                const typActualByMonth: number[] = MONTHS.map((_, m) =>
                  typItems.reduce((a, it) => a + getActualAmount(it.account_code, m + 1), 0)
                );
                const typTotalPlan = typTotalsByMonth.reduce((a, v) => a + v, 0);
                const typTotalFact = typActualByMonth.reduce((a, v) => a + v, 0);

                return (
                  <div key={typ} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                    <div className="text-sm font-bold mb-3" style={{ color: typColor }}>{typTitle}</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ minWidth: 1100 }}>
                        <thead><tr>
                          <th className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 200, position: "sticky", left: 0, background: "var(--card)" }}>Статья</th>
                          <th className="text-center p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", width: 60 }}>Тип</th>
                          {MONTHS.map((m, i) => (
                            <th key={i} className="text-center p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 70 }}>{m}</th>
                          ))}
                          <th className="text-right p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 100 }}>Год</th>
                        </tr></thead>
                        <tbody>
                          {typItems.map(it => {
                            const yearPlan = MONTHS.reduce((a, _, m) => a + getPlannedAmount(it.id, "no-cfo", m + 1), 0);
                            return (
                              <>
                                <tr key={it.id + "-plan"}>
                                  <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)" }}>
                                    <div className="font-semibold">{it.name}</div>
                                    <div className="text-[9px]" style={{ color: "var(--t3)" }}>{it.code} {it.account_code && `• сч. ${it.account_code}`}</div>
                                  </td>
                                  <td className="text-center p-2 text-[10px]" style={{ borderBottom: "1px solid var(--brd)", color: "var(--t3)" }}>План</td>
                                  {MONTHS.map((_, m) => {
                                    const month = m + 1;
                                    const plan = getPlannedAmount(it.id, "no-cfo", month);
                                    const isEditing = editingLine?.itemId === it.id && editingLine?.month === month;
                                    return (
                                      <td key={m} className="text-center p-1" style={{ borderBottom: "1px solid var(--brd)", cursor: "pointer" }}
                                        onClick={() => !isEditing && startEditLine(it.id, "no-cfo", month)}>
                                        {isEditing ? (
                                          <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)}
                                            onBlur={commitEdit} onKeyDown={e => e.key === "Enter" && commitEdit()} autoFocus
                                            style={{ padding: "2px 4px", fontSize: 10, width: 65, textAlign: "right" }} />
                                        ) : (
                                          <span className="text-[10px]" style={{ color: plan ? "var(--t1)" : "var(--t3)" }}>
                                            {plan ? fmtMoney(plan) : "—"}
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="text-right p-2 text-[11px] font-bold" style={{ color: typColor, borderBottom: "1px solid var(--brd)" }}>{fmtMoney(yearPlan)}</td>
                                </tr>
                                <tr key={it.id + "-fact"}>
                                  <td className="p-2" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)" }}></td>
                                  <td className="text-center p-2 text-[10px] font-semibold" style={{ borderBottom: "1px solid var(--brd)", color: "#3B82F6" }}>Факт</td>
                                  {MONTHS.map((_, m) => {
                                    const month = m + 1;
                                    const fact = getActualAmount(it.account_code, month);
                                    const plan = getPlannedAmount(it.id, "no-cfo", month);
                                    const diff = fact - plan;
                                    return (
                                      <td key={m} className="text-center p-1 text-[10px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                                        <div style={{ color: "#3B82F6" }}>{fact ? fmtMoney(fact) : "—"}</div>
                                        {plan > 0 && fact > 0 && (
                                          <div className="text-[9px]" style={{ color: (typ === "income" ? diff >= 0 : diff <= 0) ? "#10B981" : "#EF4444" }}>
                                            {diff > 0 ? "+" : ""}{fmtMoney(diff)}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="text-right p-2 text-[11px] font-bold" style={{ color: "#3B82F6", borderBottom: "1px solid var(--brd)" }}>
                                    {fmtMoney(MONTHS.reduce((a, _, m) => a + getActualAmount(it.account_code, m + 1), 0))}
                                  </td>
                                </tr>
                              </>
                            );
                          })}
                          <tr style={{ background: "var(--bg)" }}>
                            <td className="p-2 text-[12px] font-bold" style={{ position: "sticky", left: 0, background: "var(--bg)" }}>ИТОГО</td>
                            <td className="text-center p-2 text-[10px] font-bold" style={{ color: "var(--t3)" }}>План / Факт</td>
                            {typTotalsByMonth.map((plan, m) => {
                              const fact = typActualByMonth[m];
                              return (
                                <td key={m} className="text-center p-2 text-[10px]">
                                  <div className="font-bold" style={{ color: typColor }}>{plan ? fmtMoney(plan) : "—"}</div>
                                  <div style={{ color: "#3B82F6" }}>{fact ? fmtMoney(fact) : "—"}</div>
                                </td>
                              );
                            })}
                            <td className="text-right p-2 text-[12px] font-bold">
                              <div style={{ color: typColor }}>{fmtMoney(typTotalPlan)}</div>
                              <div className="text-[10px]" style={{ color: "#3B82F6" }}>{fmtMoney(typTotalFact)}</div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {/* Прибыль */}
              {(() => {
                const totalIncomePlan = items.filter(i => i.item_type === "income").reduce((a, it) =>
                  a + MONTHS.reduce((b, _, m) => b + getPlannedAmount(it.id, "no-cfo", m + 1), 0), 0);
                const totalExpensePlan = items.filter(i => i.item_type === "expense").reduce((a, it) =>
                  a + MONTHS.reduce((b, _, m) => b + getPlannedAmount(it.id, "no-cfo", m + 1), 0), 0);
                const totalIncomeFact = items.filter(i => i.item_type === "income").reduce((a, it) =>
                  a + MONTHS.reduce((b, _, m) => b + getActualAmount(it.account_code, m + 1), 0), 0);
                const totalExpenseFact = items.filter(i => i.item_type === "expense").reduce((a, it) =>
                  a + MONTHS.reduce((b, _, m) => b + getActualAmount(it.account_code, m + 1), 0), 0);
                const profitPlan = totalIncomePlan - totalExpensePlan;
                const profitFact = totalIncomeFact - totalExpenseFact;
                return (
                  <div className="rounded-xl p-5" style={{ background: profitPlan >= 0 ? "#A855F710" : "#EF444410", border: `1px solid ${profitPlan >= 0 ? "#A855F730" : "#EF444430"}` }}>
                    <div className="text-sm font-bold mb-3">💎 Финансовый результат за {plYear} год</div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>План:</div>
                        <div className="text-lg font-bold" style={{ color: profitPlan >= 0 ? "#A855F7" : "#EF4444" }}>{fmtMoney(profitPlan)} ₸</div>
                      </div>
                      <div>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>Факт:</div>
                        <div className="text-lg font-bold" style={{ color: profitFact >= 0 ? "#10B981" : "#EF4444" }}>{fmtMoney(profitFact)} ₸</div>
                      </div>
                      <div>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>Отклонение:</div>
                        <div className="text-lg font-bold" style={{ color: profitFact - profitPlan >= 0 ? "#10B981" : "#EF4444" }}>
                          {profitFact - profitPlan >= 0 ? "+" : ""}{fmtMoney(profitFact - profitPlan)} ₸
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}

      {/* ═══ СТАТЬИ ═══ */}
      {tab === "items" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Статьи бюджета — категории доходов и расходов. Привязка к счетам бухучёта позволяет автоматически считать факт.
            </div>
            <div className="flex gap-2">
              {items.length === 0 && (
                <button onClick={loadDefaultItems} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)" }}>
                  📥 Загрузить стандартные
                </button>
              )}
              <button onClick={() => setShowItemForm(!showItemForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
                + Новая статья
              </button>
            </div>
          </div>

          {showItemForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label><input value={itemForm.code} onChange={e => setItemForm({ ...itemForm, code: e.target.value })} placeholder="E-100" /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название</label><input value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} placeholder="Заработная плата" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={itemForm.item_type} onChange={e => setItemForm({ ...itemForm, item_type: e.target.value })}>
                    <option value="income">📈 Доход</option>
                    <option value="expense">📉 Расход</option>
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Счёт бухучёта</label><input value={itemForm.account_code} onChange={e => setItemForm({ ...itemForm, account_code: e.target.value })} placeholder="7110" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Категория</label><input value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addItem} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowItemForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Код", "Название", "Тип", "Счёт", "Категория", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет статей. Загрузите стандартные или создайте свои.</td></tr>
                ) : items.map(it => (
                  <tr key={it.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{it.code}</td>
                    <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{it.name}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: it.item_type === "income" ? "#10B98120" : "#EF444420", color: it.item_type === "income" ? "#10B981" : "#EF4444" }}>
                        {it.item_type === "income" ? "📈 Доход" : "📉 Расход"}
                      </span>
                    </td>
                    <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{it.account_code || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{it.category || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteItem(it.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ЦФО ═══ */}
      {tab === "cfo" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Центры финансовой ответственности — подразделения с собственными бюджетами и ответственными
            </div>
            <button onClick={() => setShowCfoForm(!showCfoForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новый ЦФО
            </button>
          </div>

          {showCfoForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label><input value={cfoForm.code} onChange={e => setCfoForm({ ...cfoForm, code: e.target.value })} placeholder="ЦФО-01" /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название</label><input value={cfoForm.name} onChange={e => setCfoForm({ ...cfoForm, name: e.target.value })} placeholder="Отдел продаж" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={cfoForm.cfo_type} onChange={e => setCfoForm({ ...cfoForm, cfo_type: e.target.value })}>
                    {Object.entries(CFO_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Руководитель</label><input value={cfoForm.manager_name} onChange={e => setCfoForm({ ...cfoForm, manager_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={cfoForm.description} onChange={e => setCfoForm({ ...cfoForm, description: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addCfo} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Создать</button>
                <button onClick={() => setShowCfoForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Код", "Название", "Тип", "Руководитель", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {cfos.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет ЦФО</td></tr>
                ) : cfos.map(c => {
                  const t = CFO_TYPES[c.cfo_type as keyof typeof CFO_TYPES];
                  return (
                    <tr key={c.id}>
                      <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{c.code}</td>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{c.name}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>
                          {t.icon} {t.name}
                        </span>
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{c.manager_name || "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteCfo(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
