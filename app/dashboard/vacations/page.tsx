"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "schedule" | "balances" | "calendar" | "history";

const VACATION_TYPES: Record<string, { name: string; color: string; icon: string; paid: boolean }> = {
  annual: { name: "Ежегодный оплачиваемый", color: "#3B82F6", icon: "🏖", paid: true },
  unpaid: { name: "Без сохранения ЗП", color: "#6B7280", icon: "📅", paid: false },
  maternity: { name: "По беременности/уходу", color: "#EC4899", icon: "👶", paid: true },
  study: { name: "Учебный", color: "#0EA5E9", icon: "📚", paid: true },
  sick: { name: "Больничный", color: "#EF4444", icon: "🏥", paid: true },
  family: { name: "По семейным обстоятельствам", color: "#A855F7", icon: "👨‍👩‍👧", paid: false },
};

const STATUS: Record<string, { name: string; color: string }> = {
  planned: { name: "В плане", color: "#6B7280" },
  approved: { name: "Утверждён", color: "#3B82F6" },
  in_progress: { name: "В отпуске", color: "#F59E0B" },
  completed: { name: "Завершён", color: "#10B981" },
  cancelled: { name: "Отменён", color: "#EF4444" },
  transferred: { name: "Перенесён", color: "#A855F7" },
};

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const KZ_HOLIDAYS_2026 = [
  "2026-01-01", "2026-01-02", "2026-01-07", "2026-03-08",
  "2026-03-21", "2026-03-22", "2026-03-23", "2026-05-01",
  "2026-05-07", "2026-05-09", "2026-07-06", "2026-08-30",
  "2026-10-25", "2026-12-16",
];

export default function VacationsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("schedule");
  const [year, setYear] = useState(new Date().getFullYear());
  const [vacations, setVacations] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const empty = {
    employee_id: "", employee_name: "", employee_iin: "", employee_position: "",
    vacation_type: "annual",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    avg_daily_salary: "0",
    order_number: "",
    application_date: new Date().toISOString().slice(0, 10),
    notes: "",
  };
  const [form, setForm] = useState(empty);

  // Перенос
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferFrom, setTransferFrom] = useState<any>(null);
  const [transferForm, setTransferForm] = useState({ new_start: "", new_end: "", reason: "" });

  useEffect(() => { load(); }, [year]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const [v, b, e] = await Promise.all([
      supabase.from("vacations").select("*").eq("user_id", user.id).gte("start_date", yearStart).lte("start_date", yearEnd).order("start_date"),
      supabase.from("vacation_balances").select("*").eq("user_id", user.id).eq("year", year),
      supabase.from("employees").select("*").eq("user_id", user.id).order("full_name"),
    ]);
    setVacations(v.data || []);
    setBalances(b.data || []);
    setEmployees(e.data || []);
  }

  function calcDays(start: string, end: string): { total: number; working: number } {
    const s = new Date(start);
    const e = new Date(end);
    if (e < s) return { total: 0, working: 0 };
    let total = 0;
    let working = 0;
    const cur = new Date(s);
    while (cur <= e) {
      total += 1;
      const dayOfWeek = cur.getDay();
      const dateStr = cur.toISOString().slice(0, 10);
      const isHoliday = KZ_HOLIDAYS_2026.includes(dateStr);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (!isWeekend && !isHoliday) working += 1;
      cur.setDate(cur.getDate() + 1);
    }
    return { total, working };
  }

  // ═══ ФОРМА ═══
  function startCreate() {
    const num = `ОТП-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setEditing(null);
    setForm({ ...empty, order_number: num });
    setShowForm(true);
  }

  function startEdit(v: any) {
    setEditing(v);
    setForm({
      employee_id: v.employee_id || "",
      employee_name: v.employee_name,
      employee_iin: v.employee_iin || "",
      employee_position: v.employee_position || "",
      vacation_type: v.vacation_type,
      start_date: v.start_date,
      end_date: v.end_date,
      avg_daily_salary: String(v.avg_daily_salary || 0),
      order_number: v.order_number || "",
      application_date: v.application_date || "",
      notes: v.notes || "",
    });
    setShowForm(true);
  }

  function selectEmployee(id: string) {
    const e = employees.find(x => x.id === id);
    if (e) {
      // Расчёт средней зарплаты: оклад / 29.3 (среднее количество дней в месяце по ТК РК)
      const salary = Number(e.salary || 0);
      const avgDaily = Math.round(salary / 29.3);
      setForm({
        ...form,
        employee_id: id,
        employee_name: e.full_name,
        employee_iin: e.iin || "",
        employee_position: e.position || "",
        avg_daily_salary: String(avgDaily),
      });
    } else {
      setForm({ ...form, employee_id: "" });
    }
  }

  const periodInfo = calcDays(form.start_date, form.end_date);
  const avgDaily = Number(form.avg_daily_salary);
  const vacPay = avgDaily * periodInfo.total;
  // ИПН 10% после вычета 14 МРП (как обычная ЗП по ТК РК 2026)
  const MRP = 4325;
  const taxableBase = Math.max(0, vacPay - 14 * MRP);
  const ipn = Math.round(taxableBase * 0.10);
  const netPay = vacPay - ipn;
  const isPaid = VACATION_TYPES[form.vacation_type]?.paid;

  async function saveVacation() {
    if (!form.employee_name || !form.start_date || !form.end_date) {
      setMsg("❌ Заполните: сотрудник, даты"); setTimeout(() => setMsg(""), 3000); return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      setMsg("❌ Дата окончания раньше даты начала"); setTimeout(() => setMsg(""), 3000); return;
    }
    const data = {
      user_id: userId,
      employee_id: form.employee_id || null,
      employee_name: form.employee_name,
      employee_iin: form.employee_iin || null,
      employee_position: form.employee_position || null,
      vacation_type: form.vacation_type,
      start_date: form.start_date,
      end_date: form.end_date,
      days_count: periodInfo.total,
      working_days: periodInfo.working,
      avg_daily_salary: isPaid ? avgDaily : 0,
      vacation_pay: isPaid ? vacPay : 0,
      ipn_amount: isPaid ? ipn : 0,
      net_pay: isPaid ? netPay : 0,
      order_number: form.order_number || null,
      application_date: form.application_date || null,
      notes: form.notes || null,
    };
    if (editing) await supabase.from("vacations").update(data).eq("id", editing.id);
    else await supabase.from("vacations").insert({ ...data, status: "planned" });
    setMsg(`✅ ${editing ? "Обновлено" : "Создано"}: ${form.order_number}`);
    setShowForm(false);
    setEditing(null);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteVacation(id: string) {
    if (!confirm("Удалить отпуск? Если он был оплачен — проводки останутся.")) return;
    await supabase.from("vacations").delete().eq("id", id);
    load();
  }

  async function approveVacation(id: string) {
    const v = vacations.find(x => x.id === id);
    if (!v) return;
    if (!confirm(`Утвердить отпуск ${v.employee_name} (${v.start_date} — ${v.end_date})?`)) return;
    await supabase.from("vacations").update({
      status: "approved",
      order_date: new Date().toISOString().slice(0, 10),
    }).eq("id", id);
    setMsg("✅ Утверждено приказом");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function payVacation(method: string) {
    if (!editing) return;
    const v = editing;
    if (!isPaid && v.vacation_type !== "annual" && v.vacation_type !== "maternity" && v.vacation_type !== "study" && v.vacation_type !== "sick") {
      setMsg("❌ Этот вид отпуска не оплачивается"); setTimeout(() => setMsg(""), 3000); return;
    }
    if (!confirm(`Выплатить отпускные ${fmtMoney(Number(v.net_pay))} ₸ через ${method === "cash" ? "кассу" : "банк"}?`)) return;

    const today = new Date().toISOString().slice(0, 10);

    // Проводки:
    // Дт 7210 (адм. расходы) Кт 3350 (ЗП к выплате) — начисление отпускных (брутто)
    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: today,
      doc_ref: v.order_number,
      debit_account: "7210",
      credit_account: "3350",
      amount: Number(v.vacation_pay),
      description: `Начисление отпускных ${v.employee_name} (${v.days_count} дн.)`,
    });

    // Дт 3350 Кт 3120 — удержание ИПН
    if (Number(v.ipn_amount) > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: today,
        doc_ref: v.order_number,
        debit_account: "3350",
        credit_account: "3120",
        amount: Number(v.ipn_amount),
        description: `Удержание ИПН с отпускных ${v.employee_name}`,
      });
    }

    // Дт 3350 Кт 1010/1030 — выплата
    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: today,
      doc_ref: v.order_number,
      debit_account: "3350",
      credit_account: method === "cash" ? "1010" : "1030",
      amount: Number(v.net_pay),
      description: `Выплата отпускных ${v.employee_name}`,
    });

    await supabase.from("vacations").update({
      status: "completed",
      paid_date: today,
      payment_method: method,
    }).eq("id", v.id);

    setMsg(`✅ Отпускные выплачены, проводки созданы: Дт 7210/3350 Кт 3350/3120/${method === "cash" ? "1010" : "1030"}`);
    setShowForm(false);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  // ═══ ПЕРЕНОС ═══
  function startTransfer(v: any) {
    setTransferFrom(v);
    setTransferForm({
      new_start: v.start_date,
      new_end: v.end_date,
      reason: "",
    });
    setShowTransfer(true);
  }

  async function executeTransfer() {
    if (!transferFrom || !transferForm.new_start || !transferForm.new_end || !transferForm.reason) {
      setMsg("❌ Заполните новые даты и причину"); setTimeout(() => setMsg(""), 3000); return;
    }
    const period = calcDays(transferForm.new_start, transferForm.new_end);

    // Старый отпуск помечается как перенесённый
    await supabase.from("vacations").update({ status: "transferred" }).eq("id", transferFrom.id);

    // Создаём новый отпуск
    await supabase.from("vacations").insert({
      user_id: userId,
      employee_id: transferFrom.employee_id,
      employee_name: transferFrom.employee_name,
      employee_iin: transferFrom.employee_iin,
      employee_position: transferFrom.employee_position,
      vacation_type: transferFrom.vacation_type,
      start_date: transferForm.new_start,
      end_date: transferForm.new_end,
      days_count: period.total,
      working_days: period.working,
      avg_daily_salary: transferFrom.avg_daily_salary,
      vacation_pay: Number(transferFrom.avg_daily_salary) * period.total,
      ipn_amount: 0, // пересчитается
      net_pay: 0,
      order_number: `${transferFrom.order_number}-П`,
      transferred_from: transferFrom.id,
      transferred_reason: transferForm.reason,
      status: "planned",
    });

    setMsg(`✅ Отпуск перенесён на ${transferForm.new_start} — ${transferForm.new_end}`);
    setShowTransfer(false);
    setTransferFrom(null);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  // ═══ БАЛАНСЫ ═══
  async function setBalance(empId: string, entitled: number, used: number, carried: number) {
    const existing = balances.find(b => b.employee_id === empId);
    if (existing) {
      await supabase.from("vacation_balances").update({
        entitled_days: entitled,
        used_days: used,
        carried_over: carried,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("vacation_balances").insert({
        user_id: userId,
        employee_id: empId,
        year,
        entitled_days: entitled,
        used_days: used,
        carried_over: carried,
      });
    }
    load();
  }

  // KPI
  const total = vacations.length;
  const planned = vacations.filter(v => v.status === "planned").length;
  const inProgress = vacations.filter(v => v.status === "in_progress").length;
  const completed = vacations.filter(v => v.status === "completed").length;
  const totalPay = vacations.filter(v => v.status === "completed").reduce((a, v) => a + Number(v.vacation_pay || 0), 0);

  // Mark in_progress
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    vacations.forEach(v => {
      if (v.status === "approved" && v.start_date <= today && v.end_date >= today) {
        supabase.from("vacations").update({ status: "in_progress" }).eq("id", v.id);
      }
    });
  }, [vacations.length]);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Управление отпусками. По ТК РК: ежегодный оплачиваемый отпуск ≥ 24 календарных дня. Расчёт отпускных: средняя дневная ЗП × календарных дней. ИПН 10% после вычета 14 МРП.
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 120 }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y} год</option>)}
          </select>
        </div>
        <button onClick={startCreate} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новый отпуск</button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Всего</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{total}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6B7280" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📅 В плане</div>
          <div className="text-xl font-bold" style={{ color: "#6B7280" }}>{planned}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🏖 Сейчас в отпуске</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{inProgress}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✓ Завершено</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{completed}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Выплачено</div>
          <div className="text-base font-bold" style={{ color: "#A855F7" }}>{fmtMoney(totalPay)} ₸</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["schedule", `📋 Список отпусков`],
          ["balances", `💼 Балансы (${employees.length})`],
          ["calendar", `📅 Календарь по сотрудникам`],
          ["history", `📦 История`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ФОРМА ═══ */}
      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">{editing ? "Редактирование отпуска" : "Новый отпуск"}</div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#3B82F6" }}>👤 СОТРУДНИК</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сотрудник *</label>
              <select value={form.employee_id} onChange={e => selectEmployee(e.target.value)}>
                <option value="">— Выбрать —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} {e.position ? `(${e.position})` : ""} • Оклад {fmtMoney(Number(e.salary || 0))} ₸</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО</label><input value={form.employee_name} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН</label><input value={form.employee_iin} maxLength={12} onChange={e => setForm({ ...form, employee_iin: e.target.value.replace(/\D/g, "") })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Должность</label><input value={form.employee_position} onChange={e => setForm({ ...form, employee_position: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#10B981" }}>📅 ПЕРИОД И ТИП</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип отпуска</label>
              <select value={form.vacation_type} onChange={e => setForm({ ...form, vacation_type: e.target.value })}>
                {Object.entries(VACATION_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name} {v.paid ? "(оплач.)" : "(без сохр.)"}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата начала *</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата окончания *</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>

          <div className="rounded-lg p-3 mb-3" style={{ background: "var(--bg)" }}>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Календарных дней</div><div className="text-lg font-bold" style={{ color: "#3B82F6" }}>{periodInfo.total}</div></div>
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Рабочих дней</div><div className="text-lg font-bold" style={{ color: "#10B981" }}>{periodInfo.working}</div></div>
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Выходных/праздн.</div><div className="text-lg font-bold" style={{ color: "#6B7280" }}>{periodInfo.total - periodInfo.working}</div></div>
            </div>
          </div>

          {isPaid && (
            <>
              <div className="text-[11px] font-bold mb-2" style={{ color: "#A855F7" }}>💰 РАСЧЁТ ОТПУСКНЫХ</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Средняя дневная ЗП</label>
                  <input type="number" value={form.avg_daily_salary} onChange={e => setForm({ ...form, avg_daily_salary: e.target.value })} />
                  <div className="text-[9px] mt-1" style={{ color: "var(--t3)" }}>= оклад / 29.3 (ТК РК)</div>
                </div>
                <div className="col-span-2 rounded-lg p-3" style={{ background: "#A855F710" }}>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Брутто</div><div className="text-sm font-bold">{fmtMoney(vacPay)}</div></div>
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>ИПН (10%)</div><div className="text-sm font-bold" style={{ color: "#EF4444" }}>−{fmtMoney(ipn)}</div></div>
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>На руки</div><div className="text-sm font-bold" style={{ color: "#10B981" }}>{fmtMoney(netPay)}</div></div>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="text-[11px] font-bold mb-2" style={{ color: "#F59E0B" }}>📄 ДОКУМЕНТЫ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ приказа</label><input value={form.order_number} onChange={e => setForm({ ...form, order_number: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата заявления</label><input type="date" value={form.application_date} onChange={e => setForm({ ...form, application_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={saveVacation} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
            {editing && editing.status === "approved" && isPaid && (
              <>
                <button onClick={() => payVacation("cash")} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>💵 Выплатить через кассу</button>
                <button onClick={() => payVacation("bank")} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#3B82F6" }}>🏦 Выплатить через банк</button>
              </>
            )}
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* ═══ ПЕРЕНОС ═══ */}
      {showTransfer && transferFrom && (
        <div onClick={() => setShowTransfer(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", maxWidth: 500, width: "100%" }}>
            <div className="text-sm font-bold mb-3">Перенос отпуска</div>
            <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
              Сотрудник: <b>{transferFrom.employee_name}</b><br/>
              Текущий: {transferFrom.start_date} — {transferFrom.end_date}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Новая дата начала *</label><input type="date" value={transferForm.new_start} onChange={e => setTransferForm({ ...transferForm, new_start: e.target.value })} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Новая дата окончания *</label><input type="date" value={transferForm.new_end} onChange={e => setTransferForm({ ...transferForm, new_end: e.target.value })} /></div>
            </div>
            <div className="mb-3">
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Причина переноса *</label>
              <input value={transferForm.reason} onChange={e => setTransferForm({ ...transferForm, reason: e.target.value })} placeholder="Производственная необходимость" />
            </div>
            <div className="flex gap-2">
              <button onClick={executeTransfer} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Перенести</button>
              <button onClick={() => setShowTransfer(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ СПИСОК ═══ */}
      {tab === "schedule" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["№ приказа", "Сотрудник", "Тип", "Период", "Дней", "К выплате", "Статус", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {vacations.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет отпусков за {year}</td></tr>
              ) : vacations.map(v => {
                const t = VACATION_TYPES[v.vacation_type] || VACATION_TYPES.annual;
                const s = STATUS[v.status] || STATUS.planned;
                return (
                  <tr key={v.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{v.order_number || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <div className="font-semibold">{v.employee_name}</div>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>{v.employee_position || "—"}</div>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.icon} {t.name}</span>
                    </td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{v.start_date} — {v.end_date}</td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ color: "#3B82F6", borderBottom: "1px solid var(--brd)" }}>{v.days_count}</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{Number(v.net_pay) > 0 ? fmtMoney(Number(v.net_pay)) + " ₸" : "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: s.color + "20", color: s.color }}>{s.name}</span>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      {v.status === "planned" && <button onClick={() => approveVacation(v.id)} title="Утвердить приказом" className="text-[12px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "#10B981" }}>✓</button>}
                      <button onClick={() => startEdit(v)} className="text-[11px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "var(--accent)" }}>✏</button>
                      {v.status !== "completed" && v.status !== "transferred" && <button onClick={() => startTransfer(v)} title="Перенести" className="text-[11px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "#A855F7" }}>↪</button>}
                      <button onClick={() => deleteVacation(v.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ БАЛАНСЫ ═══ */}
      {tab === "balances" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">💼 Балансы отпусков {year}</div>
          <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>По ТК РК: минимум 24 календарных дня в год. Можно вручную указать индивидуальные нормы.</div>
          <table>
            <thead><tr>{["Сотрудник", "Положено", "Использовано", "Перенос с прошл. года", "Остаток"].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {employees.map(e => {
                const bal = balances.find(b => b.employee_id === e.id);
                const used = vacations.filter(v => v.employee_id === e.id && v.vacation_type === "annual" && (v.status === "approved" || v.status === "in_progress" || v.status === "completed")).reduce((a, v) => a + Number(v.days_count), 0);
                const entitled = bal?.entitled_days || 24;
                const carried = bal?.carried_over || 0;
                const remaining = entitled + carried - used;
                return (
                  <tr key={e.id}>
                    <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>
                      {e.full_name}
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>{e.position || "—"}</div>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <input type="number" defaultValue={entitled} onBlur={ev => setBalance(e.id, Number(ev.target.value), used, carried)} style={{ width: 70, fontSize: 11 }} />
                      <span className="text-[10px] ml-1" style={{ color: "var(--t3)" }}>дн.</span>
                    </td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{used} дн.</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <input type="number" defaultValue={carried} onBlur={ev => setBalance(e.id, entitled, used, Number(ev.target.value))} style={{ width: 70, fontSize: 11 }} />
                      <span className="text-[10px] ml-1" style={{ color: "var(--t3)" }}>дн.</span>
                    </td>
                    <td className="p-2.5 text-[14px] font-bold" style={{ color: remaining > 0 ? "#10B981" : remaining < 0 ? "#EF4444" : "#6B7280", borderBottom: "1px solid var(--brd)" }}>{remaining} дн.</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ КАЛЕНДАРЬ ═══ */}
      {tab === "calendar" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📅 График отпусков на {year} год</div>
          <div style={{ overflow: "auto" }}>
            <table style={{ fontSize: 10, minWidth: "100%" }}>
              <thead>
                <tr>
                  <th className="text-left p-2 sticky left-0 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", borderRight: "2px solid var(--brd)", background: "var(--card)", minWidth: 180, zIndex: 2 }}>Сотрудник</th>
                  {MONTHS.map(m => <th key={m} className="text-center p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 60 }}>{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {employees.map(e => {
                  const empVacs = vacations.filter(v => v.employee_id === e.id);
                  return (
                    <tr key={e.id}>
                      <td className="p-2 sticky left-0 font-semibold" style={{ background: "var(--card)", borderRight: "2px solid var(--brd)", borderBottom: "1px solid var(--brd)", zIndex: 1 }}>
                        {e.full_name}
                      </td>
                      {MONTHS.map((_, mIdx) => {
                        const monthVacs = empVacs.filter(v => {
                          const start = new Date(v.start_date);
                          const end = new Date(v.end_date);
                          return (start.getMonth() === mIdx && start.getFullYear() === year) ||
                                 (end.getMonth() === mIdx && end.getFullYear() === year) ||
                                 (start <= new Date(year, mIdx, 1) && end >= new Date(year, mIdx + 1, 0));
                        });
                        return (
                          <td key={mIdx} className="p-1 text-center" style={{ borderBottom: "1px solid var(--brd)" }}>
                            {monthVacs.map((v, i) => {
                              const t = VACATION_TYPES[v.vacation_type] || VACATION_TYPES.annual;
                              return (
                                <div key={i} className="text-[9px] font-bold rounded px-1 py-0.5 mb-0.5" style={{ background: t.color + "30", color: t.color }} title={`${v.start_date} — ${v.end_date}`}>
                                  {t.icon}{v.days_count}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "history" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📦 Завершённые и отменённые</div>
          <table>
            <thead><tr>{["№ приказа", "Сотрудник", "Тип", "Период", "Дней", "Выплачено", "Дата оплаты", "Статус"].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {vacations.filter(v => ["completed", "cancelled", "transferred"].includes(v.status)).length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет завершённых отпусков</td></tr>
              ) : vacations.filter(v => ["completed", "cancelled", "transferred"].includes(v.status)).map(v => {
                const t = VACATION_TYPES[v.vacation_type] || VACATION_TYPES.annual;
                const s = STATUS[v.status];
                return (
                  <tr key={v.id}>
                    <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{v.order_number || "—"}</td>
                    <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{v.employee_name}</td>
                    <td className="p-2.5 text-[11px]" style={{ color: t.color, borderBottom: "1px solid var(--brd)" }}>{t.icon} {t.name}</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{v.start_date} — {v.end_date}</td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{v.days_count}</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{v.net_pay > 0 ? fmtMoney(Number(v.net_pay)) + " ₸" : "—"}</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{v.paid_date || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: s.color + "20", color: s.color }}>{s.name}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
