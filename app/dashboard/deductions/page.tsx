"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "active" | "calc" | "history" | "completed";

const DED_TYPES: Record<string, { name: string; icon: string; color: string; defaultPriority: number; defaultPercent: number }> = {
  alimony: { name: "Алименты", icon: "👨‍👩‍👧", color: "#EC4899", defaultPriority: 1, defaultPercent: 25 },
  enforcement: { name: "Исполнительный лист", icon: "⚖", color: "#EF4444", defaultPriority: 2, defaultPercent: 50 },
  tax_arrears: { name: "Налоговая задолженность", icon: "📑", color: "#DC2626", defaultPriority: 3, defaultPercent: 20 },
  loan: { name: "Кредит / займ работодателя", icon: "🏦", color: "#3B82F6", defaultPriority: 5, defaultPercent: 10 },
  damage: { name: "Возмещение ущерба", icon: "💥", color: "#F59E0B", defaultPriority: 6, defaultPercent: 20 },
  fine: { name: "Штраф", icon: "⚠", color: "#A855F7", defaultPriority: 7, defaultPercent: 0 },
  union_fee: { name: "Профсоюзный взнос", icon: "🤝", color: "#10B981", defaultPriority: 8, defaultPercent: 1 },
  other: { name: "Прочее", icon: "📋", color: "#6B7280", defaultPriority: 9, defaultPercent: 0 },
};

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export default function DeductionsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("active");
  const [deductions, setDeductions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const empty = {
    employee_id: "", employee_name: "", employee_iin: "",
    deduction_type: "alimony",
    calc_method: "percent" as "percent" | "fixed",
    percent_value: "25",
    fixed_amount: "0",
    max_total: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    recipient_name: "",
    recipient_iin: "",
    recipient_account: "",
    recipient_bank: "",
    doc_type: "",
    doc_number: "",
    doc_date: "",
    priority: "1",
    notes: "",
  };
  const [form, setForm] = useState(empty);

  // Calc form
  const [calcForm, setCalcForm] = useState({
    employee_id: "",
    period_year: new Date().getFullYear(),
    period_month: new Date().getMonth() + 1,
    gross_salary: "0",
    ipn: "0",
    opv: "0",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [d, h, e] = await Promise.all([
      supabase.from("salary_deductions").select("*").eq("user_id", user.id).order("priority"),
      supabase.from("deduction_history").select("*").eq("user_id", user.id).order("period_year", { ascending: false }).order("period_month", { ascending: false }).limit(200),
      supabase.from("employees").select("*").eq("user_id", user.id).order("full_name"),
    ]);
    setDeductions(d.data || []);
    setHistory(h.data || []);
    setEmployees(e.data || []);
  }

  function startCreate() {
    setEditing(null);
    setForm({ ...empty, percent_value: String(DED_TYPES.alimony.defaultPercent), priority: String(DED_TYPES.alimony.defaultPriority) });
    setShowForm(true);
  }

  function startEdit(d: any) {
    setEditing(d);
    setForm({
      employee_id: d.employee_id || "",
      employee_name: d.employee_name,
      employee_iin: d.employee_iin || "",
      deduction_type: d.deduction_type,
      calc_method: d.calc_method,
      percent_value: String(d.percent_value || 0),
      fixed_amount: String(d.fixed_amount || 0),
      max_total: d.max_total ? String(d.max_total) : "",
      start_date: d.start_date,
      end_date: d.end_date || "",
      recipient_name: d.recipient_name || "",
      recipient_iin: d.recipient_iin || "",
      recipient_account: d.recipient_account || "",
      recipient_bank: d.recipient_bank || "",
      doc_type: d.doc_type || "",
      doc_number: d.doc_number || "",
      doc_date: d.doc_date || "",
      priority: String(d.priority || 1),
      notes: d.notes || "",
    });
    setShowForm(true);
  }

  function selectEmployee(id: string) {
    const e = employees.find(x => x.id === id);
    if (e) setForm({ ...form, employee_id: id, employee_name: e.full_name, employee_iin: e.iin || "" });
    else setForm({ ...form, employee_id: "" });
  }

  function selectType(type: string) {
    const t = DED_TYPES[type];
    setForm({
      ...form,
      deduction_type: type,
      percent_value: String(t.defaultPercent),
      priority: String(t.defaultPriority),
    });
  }

  async function saveDeduction() {
    if (!form.employee_name || !form.start_date) {
      setMsg("❌ Заполните: сотрудник, дата начала"); setTimeout(() => setMsg(""), 3000); return;
    }
    if (form.calc_method === "percent" && Number(form.percent_value) <= 0) {
      setMsg("❌ Укажите процент удержания > 0"); setTimeout(() => setMsg(""), 3000); return;
    }
    if (form.calc_method === "fixed" && Number(form.fixed_amount) <= 0) {
      setMsg("❌ Укажите фиксированную сумму > 0"); setTimeout(() => setMsg(""), 3000); return;
    }
    const data = {
      user_id: userId,
      employee_id: form.employee_id || null,
      employee_name: form.employee_name,
      employee_iin: form.employee_iin || null,
      deduction_type: form.deduction_type,
      calc_method: form.calc_method,
      percent_value: form.calc_method === "percent" ? Number(form.percent_value) : null,
      fixed_amount: form.calc_method === "fixed" ? Number(form.fixed_amount) : null,
      max_total: form.max_total ? Number(form.max_total) : null,
      remaining_amount: form.max_total ? Number(form.max_total) - (editing?.total_deducted || 0) : null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      recipient_name: form.recipient_name || null,
      recipient_iin: form.recipient_iin || null,
      recipient_account: form.recipient_account || null,
      recipient_bank: form.recipient_bank || null,
      doc_type: form.doc_type || null,
      doc_number: form.doc_number || null,
      doc_date: form.doc_date || null,
      priority: Number(form.priority),
      notes: form.notes || null,
    };
    if (editing) await supabase.from("salary_deductions").update(data).eq("id", editing.id);
    else await supabase.from("salary_deductions").insert({ ...data, total_deducted: 0 });
    setMsg(`✅ ${editing ? "Обновлено" : "Создано"}: удержание для ${form.employee_name}`);
    setShowForm(false);
    setEditing(null);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function toggleDeduction(d: any) {
    await supabase.from("salary_deductions").update({ is_active: !d.is_active }).eq("id", d.id);
    load();
  }

  async function deleteDeduction(id: string) {
    if (!confirm("Удалить удержание? История останется, но потеряет связь с шаблоном.")) return;
    await supabase.from("salary_deductions").delete().eq("id", id);
    load();
  }

  // ═══ РАСЧЁТ УДЕРЖАНИЙ ЗА ПЕРИОД ═══
  function calcDeductions() {
    if (!calcForm.employee_id) return [];
    const empDeds = deductions.filter(d => d.employee_id === calcForm.employee_id && d.is_active);
    if (empDeds.length === 0) return [];

    const gross = Number(calcForm.gross_salary);
    const ipn = Number(calcForm.ipn);
    const opv = Number(calcForm.opv);
    // База для удержаний — после ИПН и ОПВ (сумма к выплате до удержаний)
    let base = Math.max(0, gross - ipn - opv);
    let availableBase = base;

    // Лимит удержаний по ТК РК: обычно не более 50% от ЗП к выплате (для алиментов до 70%)
    const hasAlimony = empDeds.some(d => d.deduction_type === "alimony");
    const maxLimit = hasAlimony ? base * 0.70 : base * 0.50;
    let totalLimit = maxLimit;

    const result: any[] = [];
    // Сортировка по приоритету
    const sorted = [...empDeds].sort((a, b) => (a.priority || 99) - (b.priority || 99));
    for (const d of sorted) {
      let amount = 0;
      if (d.calc_method === "percent") {
        amount = Math.round(base * Number(d.percent_value) / 100);
      } else {
        amount = Number(d.fixed_amount);
      }

      // Учитываем остаток лимита
      const allowed = Math.min(amount, totalLimit);

      // Учитываем потолок по сумме (max_total)
      let actualAmount = allowed;
      if (d.max_total) {
        const remaining = Number(d.max_total) - Number(d.total_deducted || 0);
        actualAmount = Math.min(allowed, remaining);
      }
      if (actualAmount < 0) actualAmount = 0;

      result.push({
        deduction: d,
        calculated: amount,
        applied: actualAmount,
        clipped: amount - actualAmount,
      });

      totalLimit -= actualAmount;
      availableBase -= actualAmount;
      if (totalLimit <= 0) break;
    }
    return result;
  }

  const calcResults = calcDeductions();
  const totalApplied = calcResults.reduce((a, r) => a + r.applied, 0);
  const finalNet = Math.max(0, Number(calcForm.gross_salary) - Number(calcForm.ipn) - Number(calcForm.opv) - totalApplied);

  async function executeDeductions() {
    if (calcResults.length === 0) { setMsg("❌ Нет применимых удержаний"); setTimeout(() => setMsg(""), 3000); return; }
    if (!confirm(`Применить удержания на сумму ${fmtMoney(totalApplied)} ₸ за ${MONTHS[calcForm.period_month - 1]} ${calcForm.period_year}?`)) return;

    const today = new Date().toISOString().slice(0, 10);
    const base = Math.max(0, Number(calcForm.gross_salary) - Number(calcForm.ipn) - Number(calcForm.opv));

    for (const r of calcResults) {
      if (r.applied <= 0) continue;
      // Запись в истории
      await supabase.from("deduction_history").insert({
        user_id: userId,
        deduction_id: r.deduction.id,
        employee_id: r.deduction.employee_id,
        employee_name: r.deduction.employee_name,
        period_year: calcForm.period_year,
        period_month: calcForm.period_month,
        base_amount: base,
        deducted_amount: r.applied,
        paid_date: today,
      });

      // Обновляем total_deducted и remaining_amount
      const newTotal = Number(r.deduction.total_deducted || 0) + r.applied;
      const newRemaining = r.deduction.max_total ? Number(r.deduction.max_total) - newTotal : null;
      await supabase.from("salary_deductions").update({
        total_deducted: newTotal,
        remaining_amount: newRemaining,
      }).eq("id", r.deduction.id);

      // Бух. проводки
      // Дт 3350 (ЗП к выплате) Кт 3380 (прочая кред. задолж — куда переводить получателю)
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: today,
        doc_ref: `Удержание ${MONTHS[calcForm.period_month - 1]} ${calcForm.period_year}`,
        debit_account: "3350",
        credit_account: "3380",
        amount: r.applied,
        description: `${DED_TYPES[r.deduction.deduction_type].name} ${r.deduction.employee_name}${r.deduction.recipient_name ? ` → ${r.deduction.recipient_name}` : ""}`,
      });
    }

    setMsg(`✅ Удержания применены: ${calcResults.filter(r => r.applied > 0).length} операций на ${fmtMoney(totalApplied)} ₸. Проводки: Дт 3350 Кт 3380`);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  // ═══ Список удержаний ═══
  const activeList = deductions.filter(d => d.is_active);
  const completedList = deductions.filter(d => !d.is_active || (d.max_total && Number(d.total_deducted) >= Number(d.max_total)));

  // KPI
  const totalActive = activeList.length;
  const monthDeducted = history.filter(h => h.period_year === new Date().getFullYear() && h.period_month === new Date().getMonth() + 1).reduce((a, h) => a + Number(h.deducted_amount), 0);
  const totalDeductedAll = history.reduce((a, h) => a + Number(h.deducted_amount), 0);
  const employeesWithDed = new Set(activeList.map(d => d.employee_id)).size;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Удержания из ЗП по ТК РК: алименты, кредиты, исполнительные листы, штрафы. Лимит: 50% ЗП (70% при алиментах). Проводка: Дт 3350 Кт 3380.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Активных удержаний</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{totalActive}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Из {deductions.length} всего</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EC4899" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>👥 Сотрудников с удержаниями</div>
          <div className="text-xl font-bold" style={{ color: "#EC4899" }}>{employeesWithDed}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Удержано в этом месяце</div>
          <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(monthDeducted)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Удержано всего</div>
          <div className="text-base font-bold" style={{ color: "#A855F7" }}>{fmtMoney(totalDeductedAll)} ₸</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["active", `📋 Активные (${activeList.length})`],
          ["calc", "🧮 Расчёт за период"],
          ["history", `📦 История (${history.length})`],
          ["completed", `✓ Завершённые (${completedList.length})`],
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
          <div className="text-sm font-bold mb-3">{editing ? "Редактирование удержания" : "Новое удержание"}</div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#3B82F6" }}>👤 СОТРУДНИК</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сотрудник *</label>
              <select value={form.employee_id} onChange={e => selectEmployee(e.target.value)}>
                <option value="">— Выбрать —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} {e.position ? `(${e.position})` : ""}</option>)}
              </select>
            </div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#EC4899" }}>📋 ТИП И РАСЧЁТ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип удержания</label>
              <select value={form.deduction_type} onChange={e => selectType(e.target.value)}>
                {Object.entries(DED_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Метод</label>
              <select value={form.calc_method} onChange={e => setForm({ ...form, calc_method: e.target.value as any })}>
                <option value="percent">% от ЗП</option>
                <option value="fixed">Фиксированная сумма</option>
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Приоритет (1=высший)</label><input type="number" min="1" max="9" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} /></div>
            {form.calc_method === "percent" ? (
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Процент удержания</label><input type="number" step="0.1" min="0" max="100" value={form.percent_value} onChange={e => setForm({ ...form, percent_value: e.target.value })} /></div>
            ) : (
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма ежемесячно, ₸</label><input type="number" value={form.fixed_amount} onChange={e => setForm({ ...form, fixed_amount: e.target.value })} /></div>
            )}
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Общий лимит, ₸ (опц.)</label><input type="number" value={form.max_total} onChange={e => setForm({ ...form, max_total: e.target.value })} placeholder="например, размер кредита" /></div>
            <div></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#F59E0B" }}>📅 СРОКИ</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата начала *</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата окончания (опц.)</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#10B981" }}>🏦 ПОЛУЧАТЕЛЬ</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО / Наименование</label><input value={form.recipient_name} onChange={e => setForm({ ...form, recipient_name: e.target.value })} placeholder="Алименты — на ребёнка / банк / ФССП" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН/БИН получателя</label><input value={form.recipient_iin} maxLength={12} onChange={e => setForm({ ...form, recipient_iin: e.target.value.replace(/\D/g, "") })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Расчётный счёт IBAN</label><input value={form.recipient_account} onChange={e => setForm({ ...form, recipient_account: e.target.value })} placeholder="KZ..." /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Банк</label><input value={form.recipient_bank} onChange={e => setForm({ ...form, recipient_bank: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#A855F7" }}>📄 ОСНОВАНИЕ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип документа</label>
              <select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })}>
                <option value="">—</option>
                <option value="court_order">Судебный приказ</option>
                <option value="enforcement_writ">Исполнительный лист</option>
                <option value="agreement">Соглашение об уплате алиментов</option>
                <option value="loan_agreement">Договор займа</option>
                <option value="employee_application">Заявление работника</option>
                <option value="penalty_order">Приказ о взыскании</option>
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ документа</label><input value={form.doc_number} onChange={e => setForm({ ...form, doc_number: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата документа</label><input type="date" value={form.doc_date} onChange={e => setForm({ ...form, doc_date: e.target.value })} /></div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div className="flex gap-2">
            <button onClick={saveDeduction} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* ═══ АКТИВНЫЕ ═══ */}
      {tab === "active" && !showForm && (
        <>
          <div className="flex justify-end">
            <button onClick={startCreate} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новое удержание</button>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Приор.", "Сотрудник", "Тип", "Расчёт", "Удержано", "Остаток", "Получатель", "Период", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {deductions.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет удержаний. Создайте первое.</td></tr>
                ) : deductions.map(d => {
                  const t = DED_TYPES[d.deduction_type] || DED_TYPES.other;
                  const totalDed = Number(d.total_deducted || 0);
                  const maxT = Number(d.max_total || 0);
                  const remaining = maxT > 0 ? maxT - totalDed : null;
                  const isCompleted = maxT > 0 && totalDed >= maxT;
                  return (
                    <tr key={d.id}>
                      <td className="p-2.5 text-[12px] font-bold text-center" style={{ color: t.color, borderBottom: "1px solid var(--brd)" }}>#{d.priority}</td>
                      <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{d.employee_name}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.icon} {t.name}</span>
                      </td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {d.calc_method === "percent" ? `${d.percent_value}%` : `${fmtMoney(Number(d.fixed_amount || 0))} ₸/мес`}
                      </td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalDed)}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: remaining && remaining > 0 ? "#F59E0B" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                        {remaining !== null ? fmtMoney(remaining) : "—"}
                      </td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{d.recipient_name || "—"}</td>
                      <td className="p-2.5 text-[10px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{d.start_date}{d.end_date ? ` → ${d.end_date}` : ""}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {isCompleted ? <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>✓ Закрыто</span> : (
                          <button onClick={() => toggleDeduction(d)} className="text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer border-none" style={{ background: d.is_active ? "#10B98120" : "#6B728020", color: d.is_active ? "#10B981" : "#6B7280" }}>
                            {d.is_active ? "✓ Активно" : "○ Пауза"}
                          </button>
                        )}
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => startEdit(d)} className="text-[11px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "var(--accent)" }}>✏</button>
                        <button onClick={() => deleteDeduction(d.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ РАСЧЁТ ═══ */}
      {tab === "calc" && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">🧮 Расчёт удержаний за период</div>
            <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
              Введите начисленную ЗП и удержанные налоги. Удержания применятся в порядке приоритета с учётом лимита 50% (70% при алиментах).
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сотрудник</label>
                <select value={calcForm.employee_id} onChange={e => setCalcForm({ ...calcForm, employee_id: e.target.value })}>
                  <option value="">— Выбрать —</option>
                  {employees.filter(e => deductions.some(d => d.employee_id === e.id && d.is_active)).map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Месяц</label>
                <select value={calcForm.period_month} onChange={e => setCalcForm({ ...calcForm, period_month: Number(e.target.value) })}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Год</label><input type="number" value={calcForm.period_year} onChange={e => setCalcForm({ ...calcForm, period_year: Number(e.target.value) })} /></div>
              <div></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Начислено (брутто), ₸</label><input type="number" value={calcForm.gross_salary} onChange={e => setCalcForm({ ...calcForm, gross_salary: e.target.value })} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Удержано ИПН, ₸</label><input type="number" value={calcForm.ipn} onChange={e => setCalcForm({ ...calcForm, ipn: e.target.value })} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Удержано ОПВ (10%), ₸</label><input type="number" value={calcForm.opv} onChange={e => setCalcForm({ ...calcForm, opv: e.target.value })} /></div>
            </div>

            {calcResults.length > 0 && (
              <>
                <div className="rounded-lg p-3 mb-3" style={{ background: "var(--bg)" }}>
                  <div className="grid grid-cols-4 gap-3">
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>База после ИПН и ОПВ</div><div className="text-base font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(Number(calcForm.gross_salary) - Number(calcForm.ipn) - Number(calcForm.opv))} ₸</div></div>
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Лимит {calcResults.some(r => r.deduction.deduction_type === "alimony") ? "(70%)" : "(50%)"}</div><div className="text-base font-bold" style={{ color: "#F59E0B" }}>{fmtMoney((Number(calcForm.gross_salary) - Number(calcForm.ipn) - Number(calcForm.opv)) * (calcResults.some(r => r.deduction.deduction_type === "alimony") ? 0.7 : 0.5))} ₸</div></div>
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>К удержанию</div><div className="text-base font-bold" style={{ color: "#EC4899" }}>{fmtMoney(totalApplied)} ₸</div></div>
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>На руки</div><div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(finalNet)} ₸</div></div>
                  </div>
                </div>

                <div className="text-[11px] font-bold mb-2" style={{ color: "var(--accent)" }}>📊 ПОРЯДОК ПРИМЕНЕНИЯ</div>
                <table>
                  <thead><tr>{["#", "Тип", "Расчёт", "По формуле", "Применено", "Обрезано", "Получатель"].map(h => (
                    <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {calcResults.map((r, i) => {
                      const t = DED_TYPES[r.deduction.deduction_type];
                      return (
                        <tr key={i}>
                          <td className="p-2 text-[11px] font-bold" style={{ color: t.color, borderBottom: "1px solid var(--brd)" }}>{r.deduction.priority}</td>
                          <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                            <span style={{ color: t.color }}>{t.icon} {t.name}</span>
                          </td>
                          <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                            {r.deduction.calc_method === "percent" ? `${r.deduction.percent_value}%` : `${fmtMoney(Number(r.deduction.fixed_amount))} ₸`}
                          </td>
                          <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(r.calculated)}</td>
                          <td className="p-2 text-[12px] font-bold" style={{ color: "#EC4899", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(r.applied)}</td>
                          <td className="p-2 text-[11px]" style={{ color: r.clipped > 0 ? "#F59E0B" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.clipped > 0 ? `−${fmtMoney(r.clipped)}` : "—"}</td>
                          <td className="p-2 text-[10px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.deduction.recipient_name || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <button onClick={executeDeductions} className="mt-3 px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>
                  ✓ Применить удержания и создать проводки
                </button>
              </>
            )}

            {calcResults.length === 0 && calcForm.employee_id && (
              <div className="text-xs py-3" style={{ color: "var(--t3)" }}>У этого сотрудника нет активных удержаний</div>
            )}
          </div>
        </>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "history" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📦 История удержаний (последние 200)</div>
          <table>
            <thead><tr>{["Период", "Сотрудник", "Тип", "База", "Удержано", "Дата операции"].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет операций</td></tr>
              ) : history.map(h => {
                const ded = deductions.find(d => d.id === h.deduction_id);
                const t = ded ? DED_TYPES[ded.deduction_type] : DED_TYPES.other;
                return (
                  <tr key={h.id}>
                    <td className="p-2.5 text-[11px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{MONTHS[h.period_month - 1]} {h.period_year}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{h.employee_name}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.icon} {t.name}</span>
                    </td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(h.base_amount))} ₸</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#EC4899", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(h.deducted_amount))} ₸</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{h.paid_date || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ЗАВЕРШЁННЫЕ ═══ */}
      {tab === "completed" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">✓ Завершённые / неактивные</div>
          <table>
            <thead><tr>{["Сотрудник", "Тип", "Удержано", "Лимит", "Период", "Статус"].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {completedList.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет завершённых удержаний</td></tr>
              ) : completedList.map(d => {
                const t = DED_TYPES[d.deduction_type];
                return (
                  <tr key={d.id}>
                    <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{d.employee_name}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.icon} {t.name}</span>
                    </td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(d.total_deducted || 0))} ₸</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{d.max_total ? fmtMoney(Number(d.max_total)) + " ₸" : "—"}</td>
                    <td className="p-2.5 text-[10px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{d.start_date}{d.end_date ? ` → ${d.end_date}` : ""}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>✓ Закрыто</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Лимит удержаний по ТК РК:</b> не более 50% от ЗП к выплате. При алиментах — до 70%.<br/>
        💡 <b>Приоритет применения:</b> 1=Алименты → 2=Исп. лист → 3=Налоги → 5=Кредит → 6=Ущерб → 7=Штраф.<br/>
        💡 <b>Бух. проводки:</b> Дт 3350 (ЗП к выплате) Кт 3380 (прочая кредиторка → перечислить получателю).
      </div>
    </div>
  );
}
