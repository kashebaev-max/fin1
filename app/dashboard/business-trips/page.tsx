"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "list" | "card";
type CardTab = "order" | "advance" | "report" | "settle";

const STATUS: Record<string, { name: string; color: string; icon: string }> = {
  order: { name: "Приказ создан", color: "#6B7280", icon: "📋" },
  advance_paid: { name: "Аванс выдан", color: "#3B82F6", icon: "💰" },
  in_progress: { name: "В командировке", color: "#F59E0B", icon: "✈" },
  report_pending: { name: "Ожидает отчёт", color: "#A855F7", icon: "📑" },
  completed: { name: "Закрыта", color: "#10B981", icon: "✓" },
  cancelled: { name: "Отменена", color: "#EF4444", icon: "✗" },
};

const MRP_2026 = 4325;

const EXPENSE_TYPES = ["Билеты (туда)", "Билеты (обратно)", "Гостиница", "Такси", "Бензин", "Командировочные расходы", "Представительские", "Проезд городской", "Прочее"];

export default function BusinessTripsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("list");
  const [cardTab, setCardTab] = useState<CardTab>("order");
  const [trips, setTrips] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<any>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const empty = {
    order_number: "",
    order_date: new Date().toISOString().slice(0, 10),
    employee_id: "",
    employee_name: "",
    employee_iin: "",
    employee_position: "",
    destination_country: "Казахстан",
    destination_city: "",
    organization_name: "",
    purpose: "",
    trip_start: new Date().toISOString().slice(0, 10),
    trip_end: new Date().toISOString().slice(0, 10),
    daily_allowance_mrp: "6",
    advance_travel: "0",
    advance_lodging: "0",
    advance_other: "0",
    notes: "",
  };
  const [form, setForm] = useState(empty);

  // Expense form
  const [expenseForm, setExpenseForm] = useState({ date: "", type: "Билеты (туда)", amount: "0", description: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [t, e] = await Promise.all([
      supabase.from("business_trips").select("*").eq("user_id", user.id).order("order_date", { ascending: false }),
      supabase.from("employees").select("*").eq("user_id", user.id),
    ]);
    setTrips(t.data || []);
    setEmployees(e.data || []);

    if (selected) {
      const updated = (t.data || []).find((x: any) => x.id === selected.id);
      if (updated) setSelected(updated);
    }
  }

  function startCreate() {
    const num = `КМ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setForm({ ...empty, order_number: num });
    setShowForm(true);
  }

  function selectEmployee(id: string) {
    const e = employees.find(x => x.id === id);
    if (e) setForm({
      ...form,
      employee_id: id,
      employee_name: e.full_name,
      employee_iin: e.iin || "",
      employee_position: e.position || "",
    });
    else setForm({ ...form, employee_id: "" });
  }

  function calcDays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff);
  }

  const tripDays = calcDays(form.trip_start, form.trip_end);
  const dailyAmount = Number(form.daily_allowance_mrp) * MRP_2026;
  const advanceDaily = dailyAmount * tripDays;
  const advanceTotal = advanceDaily + Number(form.advance_travel) + Number(form.advance_lodging) + Number(form.advance_other);

  async function saveTrip() {
    if (!form.employee_name || !form.destination_city || !form.purpose) {
      setMsg("❌ Заполните: сотрудник, город, цель"); setTimeout(() => setMsg(""), 3000); return;
    }
    const data = {
      user_id: userId,
      order_number: form.order_number,
      order_date: form.order_date,
      employee_id: form.employee_id || null,
      employee_name: form.employee_name,
      employee_iin: form.employee_iin || null,
      employee_position: form.employee_position || null,
      destination_country: form.destination_country,
      destination_city: form.destination_city,
      organization_name: form.organization_name || null,
      purpose: form.purpose,
      trip_start: form.trip_start,
      trip_end: form.trip_end,
      trip_days: tripDays,
      daily_allowance_mrp: Number(form.daily_allowance_mrp),
      daily_allowance: dailyAmount,
      advance_daily: advanceDaily,
      advance_travel: Number(form.advance_travel),
      advance_lodging: Number(form.advance_lodging),
      advance_other: Number(form.advance_other),
      advance_total: advanceTotal,
      status: "order",
      notes: form.notes || null,
    };
    await supabase.from("business_trips").insert(data);
    setMsg(`✅ Приказ ${form.order_number} создан`);
    setShowForm(false);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteTrip(id: string) {
    if (!confirm("Удалить командировку?")) return;
    await supabase.from("business_trips").delete().eq("id", id);
    if (selected?.id === id) { setSelected(null); setTab("list"); }
    load();
  }

  // ═══ ВЫДАЧА АВАНСА ═══
  async function payAdvance(method: string) {
    if (!selected) return;
    if (!confirm(`Выдать аванс ${fmtMoney(Number(selected.advance_total))} ₸ через ${method === "cash" ? "кассу" : "банк"}?`)) return;

    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("business_trips").update({
      status: "advance_paid",
      advance_paid_date: today,
      advance_paid_method: method,
    }).eq("id", selected.id);

    // Бух. проводка: Дт 1250 (под отчёт) Кт 1010/1030
    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: today,
      doc_ref: selected.order_number,
      debit_account: "1250",
      credit_account: method === "cash" ? "1010" : "1030",
      amount: Number(selected.advance_total),
      description: `Аванс на командировку ${selected.employee_name} в ${selected.destination_city}`,
    });

    setMsg(`✅ Аванс выдан, проводка: Дт 1250 Кт ${method === "cash" ? "1010" : "1030"}`);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  // ═══ ОТЧЁТ ═══
  function addExpense() {
    if (!selected) return;
    if (!expenseForm.date || !expenseForm.amount || Number(expenseForm.amount) <= 0) {
      setMsg("❌ Заполните дату и сумму"); setTimeout(() => setMsg(""), 3000); return;
    }
    const newExpense = {
      id: Date.now(),
      date: expenseForm.date,
      type: expenseForm.type,
      amount: Number(expenseForm.amount),
      description: expenseForm.description,
    };
    const expenses = [...(selected.expenses || []), newExpense];
    updateExpenses(expenses);
    setExpenseForm({ date: "", type: "Билеты (туда)", amount: "0", description: "" });
  }

  async function removeExpense(id: number) {
    if (!selected) return;
    const expenses = (selected.expenses || []).filter((x: any) => x.id !== id);
    updateExpenses(expenses);
  }

  async function updateExpenses(expenses: any[]) {
    if (!selected) return;
    // Категоризация
    let actualTravel = 0, actualLodging = 0, actualOther = 0;
    expenses.forEach((e: any) => {
      if (e.type.includes("Билет") || e.type.includes("такси") || e.type.includes("Бензин") || e.type.includes("Проезд")) actualTravel += Number(e.amount);
      else if (e.type.includes("Гостиница")) actualLodging += Number(e.amount);
      else actualOther += Number(e.amount);
    });
    const actualDaily = Number(selected.advance_daily); // суточные не меняются
    const actualTotal = actualDaily + actualTravel + actualLodging + actualOther;

    await supabase.from("business_trips").update({
      expenses,
      actual_daily: actualDaily,
      actual_travel: actualTravel,
      actual_lodging: actualLodging,
      actual_other: actualOther,
      actual_total: actualTotal,
      difference: Number(selected.advance_total) - actualTotal,
    }).eq("id", selected.id);
    load();
  }

  async function submitReport() {
    if (!selected) return;
    if ((selected.expenses || []).length === 0) {
      setMsg("❌ Добавьте хотя бы один чек"); setTimeout(() => setMsg(""), 3000); return;
    }
    await supabase.from("business_trips").update({
      status: "report_pending",
    }).eq("id", selected.id);
    setMsg("✅ Авансовый отчёт отправлен на проверку");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  // ═══ ЗАКРЫТИЕ ═══
  async function settleTrip(method: string) {
    if (!selected) return;
    const diff = Number(selected.difference);

    // Списание расходов: Дт 7210 Кт 1250
    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: new Date().toISOString().slice(0, 10),
      doc_ref: selected.order_number,
      debit_account: "7210",
      credit_account: "1250",
      amount: Number(selected.actual_total),
      description: `Списание командировочных расходов ${selected.employee_name}`,
    });

    if (Math.abs(diff) > 0.01) {
      if (diff > 0) {
        // Возврат остатка: Дт 1010/1030 Кт 1250
        await supabase.from("journal_entries").insert({
          user_id: userId,
          entry_date: new Date().toISOString().slice(0, 10),
          doc_ref: selected.order_number,
          debit_account: method === "cash" ? "1010" : "1030",
          credit_account: "1250",
          amount: diff,
          description: `Возврат неиспользованного аванса от ${selected.employee_name}`,
        });
      } else {
        // Доплата: Дт 1250 Кт 1010/1030
        await supabase.from("journal_entries").insert({
          user_id: userId,
          entry_date: new Date().toISOString().slice(0, 10),
          doc_ref: selected.order_number,
          debit_account: "1250",
          credit_account: method === "cash" ? "1010" : "1030",
          amount: Math.abs(diff),
          description: `Доплата по командировке ${selected.employee_name}`,
        });
        // И ещё списание этой доплаты на затраты
        await supabase.from("journal_entries").insert({
          user_id: userId,
          entry_date: new Date().toISOString().slice(0, 10),
          doc_ref: selected.order_number,
          debit_account: "7210",
          credit_account: "1250",
          amount: Math.abs(diff),
          description: `Доп. командировочные расходы ${selected.employee_name}`,
        });
      }
    }

    await supabase.from("business_trips").update({
      status: "completed",
      difference_resolved: true,
      difference_resolved_date: new Date().toISOString().slice(0, 10),
    }).eq("id", selected.id);

    setMsg(`✅ Командировка закрыта. ${diff > 0 ? `Возврат ${fmtMoney(diff)} ₸` : diff < 0 ? `Доплата ${fmtMoney(Math.abs(diff))} ₸` : "Без перерасчёта"}`);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  // KPI
  const total = trips.length;
  const inProgress = trips.filter(t => ["advance_paid", "in_progress", "report_pending"].includes(t.status)).length;
  const monthExpenses = trips.filter(t => t.order_date >= new Date().toISOString().slice(0, 7) + "-01").reduce((a, t) => a + Number(t.actual_total || t.advance_total || 0), 0);
  const totalExpenses = trips.reduce((a, t) => a + Number(t.actual_total || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Командировки — приказ → аванс (Дт 1250 Кт 1010) → авансовый отчёт → списание расходов (Дт 7210 Кт 1250) и возврат/доплата.
        Норматив суточных по РК: 6 МРП = {fmtMoney(6 * MRP_2026)} ₸.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Всего командировок</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{total}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>В работе: {inProgress}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✈ Активных</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{inProgress}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Не закрытых</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Расходы за месяц</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(monthExpenses)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Текущий месяц</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Всего расходов</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{fmtMoney(totalExpenses)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        <button onClick={() => { setTab("list"); setSelected(null); }}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "list" ? "var(--accent)" : "transparent", color: tab === "list" ? "#fff" : "var(--t3)", border: tab === "list" ? "none" : "1px solid var(--brd)" }}>
          📋 Список
        </button>
        {selected && (
          <button onClick={() => setTab("card")}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === "card" ? "var(--accent)" : "transparent", color: tab === "card" ? "#fff" : "var(--t3)", border: tab === "card" ? "none" : "1px solid var(--brd)" }}>
            ✈ {selected.order_number}
          </button>
        )}
        <button onClick={startCreate} className="ml-auto px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новая командировка</button>
      </div>

      {/* ═══ ФОРМА СОЗДАНИЯ ═══ */}
      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📋 Приказ о направлении в командировку</div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📋 ПРИКАЗ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ приказа</label><input value={form.order_number} onChange={e => setForm({ ...form, order_number: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата приказа</label><input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} /></div>
            <div></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#3B82F6" }}>👤 СОТРУДНИК</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сотрудник *</label>
              <select value={form.employee_id} onChange={e => selectEmployee(e.target.value)}>
                <option value="">— Выбрать или ввести вручную ниже —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} {e.position ? `(${e.position})` : ""}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО *</label><input value={form.employee_name} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН</label><input value={form.employee_iin} onChange={e => setForm({ ...form, employee_iin: e.target.value.replace(/\D/g, "").slice(0, 12) })} maxLength={12} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Должность</label><input value={form.employee_position} onChange={e => setForm({ ...form, employee_position: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#10B981" }}>📍 КУДА И ЗАЧЕМ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Страна</label><input value={form.destination_country} onChange={e => setForm({ ...form, destination_country: e.target.value })} /></div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Город *</label><input value={form.destination_city} onChange={e => setForm({ ...form, destination_city: e.target.value })} placeholder="Астана" /></div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Принимающая организация</label><input value={form.organization_name} onChange={e => setForm({ ...form, organization_name: e.target.value })} /></div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Цель командировки *</label><input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="Переговоры с заказчиком" /></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#F59E0B" }}>📅 СРОКИ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата начала</label><input type="date" value={form.trip_start} onChange={e => setForm({ ...form, trip_start: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата окончания</label><input type="date" value={form.trip_end} onChange={e => setForm({ ...form, trip_end: e.target.value })} /></div>
            <div className="flex items-end" style={{ paddingBottom: 8 }}>
              <div className="text-xs" style={{ color: "var(--t3)" }}>Дней: <b style={{ color: "var(--accent)" }}>{tripDays}</b></div>
            </div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#A855F7" }}>💰 РАСЧЁТ АВАНСА</div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Суточные (МРП/день)</label>
              <input type="number" step="0.5" value={form.daily_allowance_mrp} onChange={e => setForm({ ...form, daily_allowance_mrp: e.target.value })} />
              <div className="text-[9px] mt-1" style={{ color: "var(--t3)" }}>= {fmtMoney(dailyAmount)} ₸/день × {tripDays} = {fmtMoney(advanceDaily)} ₸</div>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Билеты (₸)</label><input type="number" value={form.advance_travel} onChange={e => setForm({ ...form, advance_travel: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Гостиница (₸)</label><input type="number" value={form.advance_lodging} onChange={e => setForm({ ...form, advance_lodging: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Прочее (₸)</label><input type="number" value={form.advance_other} onChange={e => setForm({ ...form, advance_other: e.target.value })} /></div>
          </div>

          <div className="rounded-lg p-3 mb-3" style={{ background: "#A855F710" }}>
            <div className="flex justify-between items-center">
              <div className="text-sm">Итого аванс к выдаче:</div>
              <div className="text-lg font-bold" style={{ color: "#A855F7" }}>{fmtMoney(advanceTotal)} ₸</div>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-2">
            <button onClick={saveTrip} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>📋 Создать приказ</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* ═══ СПИСОК ═══ */}
      {tab === "list" && !showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["№ приказа", "Дата", "Сотрудник", "Куда", "Период", "Дней", "Аванс", "Факт", "Статус", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {trips.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет командировок</td></tr>
              ) : trips.map(t => {
                const s = STATUS[t.status] || STATUS.order;
                return (
                  <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => { setSelected(t); setTab("card"); setCardTab("order"); }}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{t.order_number}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{t.order_date}</td>
                    <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{t.employee_name}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{t.destination_city}</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{t.trip_start} → {t.trip_end}</td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{t.trip_days}</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#3B82F6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(t.advance_total))} ₸</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(t.actual_total || 0))} ₸</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: s.color + "20", color: s.color }}>{s.icon} {s.name}</span>
                    </td>
                    <td className="p-2.5" onClick={e => e.stopPropagation()} style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteTrip(t.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ КАРТОЧКА ═══ */}
      {tab === "card" && selected && (() => {
        const s = STATUS[selected.status] || STATUS.order;
        const diff = Number(selected.difference || 0);

        return (
          <>
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-base font-bold flex items-center gap-2">
                    <span>{s.icon}</span>
                    Командировка {selected.order_number}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                    {selected.employee_name} → {selected.destination_city} • {selected.trip_start} − {selected.trip_end} ({selected.trip_days} дн.)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-3 py-1 rounded" style={{ background: s.color + "20", color: s.color }}>{s.name}</span>
                  <button onClick={() => { setSelected(null); setTab("list"); }} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>← К списку</button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mt-4">
                <div className="rounded-lg p-3" style={{ background: "#3B82F610" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>АВАНС</div>
                  <div className="text-base font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(Number(selected.advance_total))} ₸</div>
                </div>
                <div className="rounded-lg p-3" style={{ background: "#10B98110" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>ФАКТ</div>
                  <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(Number(selected.actual_total || 0))} ₸</div>
                </div>
                <div className="rounded-lg p-3" style={{ background: diff > 0 ? "#F59E0B10" : diff < 0 ? "#EF444410" : "#6B728010" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{diff > 0 ? "К ВОЗВРАТУ" : diff < 0 ? "К ДОПЛАТЕ" : "БАЛАНС"}</div>
                  <div className="text-base font-bold" style={{ color: diff > 0 ? "#F59E0B" : diff < 0 ? "#EF4444" : "#6B7280" }}>
                    {fmtMoney(Math.abs(diff))} ₸
                  </div>
                </div>
                <div className="rounded-lg p-3" style={{ background: "#A855F710" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>ЧЕКОВ</div>
                  <div className="text-base font-bold" style={{ color: "#A855F7" }}>{(selected.expenses || []).length}</div>
                </div>
              </div>
            </div>

            {/* Card tabs */}
            <div className="flex gap-2">
              {([
                ["order", "📋 Приказ"],
                ["advance", "💰 Аванс"],
                ["report", "📑 Отчёт"],
                ["settle", "✓ Закрытие"],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setCardTab(key)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{ background: cardTab === key ? "var(--accent)" : "transparent", color: cardTab === key ? "#fff" : "var(--t3)", border: cardTab === key ? "none" : "1px solid var(--brd)" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* === Вкладка: Приказ === */}
            {cardTab === "order" && (
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3">📋 Реквизиты приказа</div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>№ приказа:</span> <span className="font-bold">{selected.order_number}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Дата:</span> <span>{selected.order_date}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Сотрудник:</span> <span>{selected.employee_name}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>ИИН:</span> <span className="font-mono">{selected.employee_iin || "—"}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Должность:</span> <span>{selected.employee_position || "—"}</span></div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Страна:</span> <span>{selected.destination_country}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Город:</span> <span className="font-bold">{selected.destination_city}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Принимающая:</span> <span>{selected.organization_name || "—"}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Период:</span> <span className="font-bold">{selected.trip_start} − {selected.trip_end}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Дней:</span> <span className="font-bold" style={{ color: "var(--accent)" }}>{selected.trip_days}</span></div>
                  </div>
                </div>
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>ЦЕЛЬ КОМАНДИРОВКИ:</div>
                  <div className="text-sm">{selected.purpose}</div>
                </div>
                {selected.notes && (
                  <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>ПРИМЕЧАНИЕ:</div>
                    <div className="text-xs">{selected.notes}</div>
                  </div>
                )}
              </div>
            )}

            {/* === Вкладка: Аванс === */}
            {cardTab === "advance" && (
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3">💰 Расчёт и выдача аванса</div>

                <table>
                  <thead><tr>{["Статья", "Расчёт", "Сумма"].map(h => (
                    <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    <tr>
                      <td className="p-2 text-[12px]">Суточные</td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>{selected.daily_allowance_mrp} МРП × {fmtMoney(MRP_2026)} × {selected.trip_days} дн.</td>
                      <td className="p-2 text-[12px] text-right font-bold">{fmtMoney(Number(selected.advance_daily))} ₸</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-[12px]">Билеты (туда-обратно)</td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>—</td>
                      <td className="p-2 text-[12px] text-right">{fmtMoney(Number(selected.advance_travel))} ₸</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-[12px]">Проживание</td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>—</td>
                      <td className="p-2 text-[12px] text-right">{fmtMoney(Number(selected.advance_lodging))} ₸</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-[12px]">Прочее</td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>—</td>
                      <td className="p-2 text-[12px] text-right">{fmtMoney(Number(selected.advance_other))} ₸</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg)" }}>
                      <td colSpan={2} className="p-2 text-[13px] font-bold">ИТОГО АВАНС:</td>
                      <td className="p-2 text-[15px] text-right font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(Number(selected.advance_total))} ₸</td>
                    </tr>
                  </tfoot>
                </table>

                {selected.status === "order" && (
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => payAdvance("cash")} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>
                      💵 Выдать через кассу (Дт 1250 Кт 1010)
                    </button>
                    <button onClick={() => payAdvance("bank")} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#3B82F6" }}>
                      🏦 Перечислить на счёт (Дт 1250 Кт 1030)
                    </button>
                  </div>
                )}

                {selected.advance_paid_date && (
                  <div className="mt-4 rounded-lg p-3" style={{ background: "#10B98110" }}>
                    <div className="text-xs">
                      <span style={{ color: "var(--t3)" }}>Аванс выдан: </span>
                      <span className="font-bold">{selected.advance_paid_date}</span>
                      <span style={{ color: "var(--t3)" }}> через {selected.advance_paid_method === "cash" ? "кассу (1010)" : "банк (1030)"}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === Вкладка: Отчёт === */}
            {cardTab === "report" && (
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3">📑 Авансовый отчёт — чеки и расходы</div>
                <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>Добавьте все чеки и подтверждающие документы по командировке</div>

                <div className="grid items-end gap-2 mb-3" style={{ gridTemplateColumns: "120px 1fr 120px 1fr 80px" }}>
                  <input type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} placeholder="Дата" />
                  <select value={expenseForm.type} onChange={e => setExpenseForm({ ...expenseForm, type: e.target.value })}>
                    {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} placeholder="Сумма" />
                  <input value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="Описание" />
                  <button onClick={addExpense} className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Чек</button>
                </div>

                {(selected.expenses || []).length > 0 && (
                  <table>
                    <thead><tr>{["Дата", "Тип", "Сумма", "Описание", ""].map(h => (
                      <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                    ))}</tr></thead>
                    <tbody>
                      {(selected.expenses || []).map((e: any) => (
                        <tr key={e.id}>
                          <td className="p-2 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.date}</td>
                          <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{e.type}</td>
                          <td className="p-2 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(e.amount))} ₸</td>
                          <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.description || "—"}</td>
                          <td className="p-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                            <button onClick={() => removeExpense(e.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="grid grid-cols-4 gap-3 mt-4 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                  <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Суточные (фикс.)</div><div className="text-sm font-bold">{fmtMoney(Number(selected.actual_daily || selected.advance_daily))} ₸</div></div>
                  <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Транспорт</div><div className="text-sm font-bold">{fmtMoney(Number(selected.actual_travel || 0))} ₸</div></div>
                  <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Проживание</div><div className="text-sm font-bold">{fmtMoney(Number(selected.actual_lodging || 0))} ₸</div></div>
                  <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Прочее</div><div className="text-sm font-bold">{fmtMoney(Number(selected.actual_other || 0))} ₸</div></div>
                </div>

                <div className="rounded-lg p-3 mt-3" style={{ background: "#10B98110" }}>
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-bold">ИТОГО ПО ОТЧЁТУ:</div>
                    <div className="text-lg font-bold" style={{ color: "#10B981" }}>{fmtMoney(Number(selected.actual_total || 0))} ₸</div>
                  </div>
                </div>

                {selected.status === "advance_paid" && (selected.expenses || []).length > 0 && (
                  <button onClick={submitReport} className="mt-4 px-5 py-2 rounded-xl text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
                    📑 Утвердить отчёт
                  </button>
                )}
              </div>
            )}

            {/* === Вкладка: Закрытие === */}
            {cardTab === "settle" && (
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3">✓ Закрытие командировки</div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg p-3" style={{ background: "#3B82F610" }}>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>ВЫДАНО АВАНСОМ</div>
                    <div className="text-base font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(Number(selected.advance_total))} ₸</div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "#10B98110" }}>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>ИЗРАСХОДОВАНО</div>
                    <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(Number(selected.actual_total || 0))} ₸</div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: diff > 0 ? "#F59E0B10" : diff < 0 ? "#EF444410" : "#6B728010" }}>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>{diff > 0 ? "К ВОЗВРАТУ" : diff < 0 ? "К ДОПЛАТЕ" : "БАЛАНС"}</div>
                    <div className="text-base font-bold" style={{ color: diff > 0 ? "#F59E0B" : diff < 0 ? "#EF4444" : "#6B7280" }}>
                      {diff !== 0 ? (diff > 0 ? "+" : "−") : ""}{fmtMoney(Math.abs(diff))} ₸
                    </div>
                  </div>
                </div>

                <div className="rounded-lg p-3 mb-4" style={{ background: "#F59E0B10", border: "1px solid #F59E0B30" }}>
                  <div className="text-[11px] font-bold mb-2" style={{ color: "#F59E0B" }}>Будут созданы проводки:</div>
                  <div className="text-[11px] font-mono" style={{ color: "var(--t2)" }}>
                    1. Дт 7210 Кт 1250 — {fmtMoney(Number(selected.actual_total || 0))} ₸ (списание расходов)<br/>
                    {diff > 0 && `2. Дт 1010/1030 Кт 1250 — ${fmtMoney(diff)} ₸ (возврат остатка)`}
                    {diff < 0 && `2. Дт 1250 Кт 1010/1030 — ${fmtMoney(Math.abs(diff))} ₸ (доплата)`}
                  </div>
                </div>

                {selected.status === "report_pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => settleTrip("cash")} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>
                      💵 {diff > 0 ? "Принять возврат" : diff < 0 ? "Доплатить" : "Закрыть"} через кассу
                    </button>
                    <button onClick={() => settleTrip("bank")} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#3B82F6" }}>
                      🏦 {diff > 0 ? "Принять возврат" : diff < 0 ? "Перечислить" : "Закрыть"} через банк
                    </button>
                  </div>
                )}

                {selected.status === "completed" && (
                  <div className="rounded-lg p-3" style={{ background: "#10B98110" }}>
                    <div className="text-xs font-bold" style={{ color: "#10B981" }}>✅ Командировка закрыта {selected.difference_resolved_date}</div>
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
