"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

const ORDER_TYPES: Record<string, { name: string; form: string; icon: string; color: string }> = {
  hire: { name: "Приём на работу", form: "Т-1", icon: "🤝", color: "#10B981" },
  transfer: { name: "Перевод на другую работу", form: "Т-5", icon: "🔄", color: "#3B82F6" },
  vacation: { name: "Предоставление отпуска", form: "Т-6", icon: "🏖", color: "#A855F7" },
  dismissal: { name: "Прекращение трудового договора", form: "Т-8", icon: "🚪", color: "#EF4444" },
  bonus: { name: "Поощрение / премирование", form: "Т-11", icon: "🎁", color: "#F59E0B" },
  penalty: { name: "Дисциплинарное взыскание", form: "—", icon: "⚠", color: "#DC2626" },
  other: { name: "Прочий приказ", form: "—", icon: "📋", color: "#6B7280" },
};

const STATUS: Record<string, { name: string; color: string }> = {
  draft: { name: "Черновик", color: "#6B7280" },
  signed: { name: "Подписан", color: "#3B82F6" },
  executed: { name: "Исполнен", color: "#10B981" },
  cancelled: { name: "Отменён", color: "#EF4444" },
};

const DISMISSAL_ARTICLES = [
  { code: "ст. 49 п.1", name: "По соглашению сторон" },
  { code: "ст. 50", name: "По инициативе работника" },
  { code: "ст. 52 п.1", name: "По инициативе работодателя — ликвидация" },
  { code: "ст. 52 п.2", name: "Сокращение численности или штата" },
  { code: "ст. 52 п.3", name: "Несоответствие занимаемой должности" },
  { code: "ст. 52 п.6", name: "Неоднократное неисполнение трудовых обязанностей" },
  { code: "ст. 52 п.7", name: "Однократное грубое нарушение (прогул, появление в нетрезвом виде)" },
  { code: "ст. 53", name: "По обстоятельствам, не зависящим от воли сторон" },
  { code: "ст. 51", name: "По истечению срока трудового договора" },
  { code: "ст. 58", name: "Перевод к другому работодателю" },
];

export default function HrOrdersPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [year, setYear] = useState(new Date().getFullYear());

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [orderType, setOrderType] = useState<string>("hire");
  const [viewing, setViewing] = useState<any>(null);

  // Common form
  const [form, setForm] = useState({
    order_number: "",
    order_date: new Date().toISOString().slice(0, 10),
    effective_date: new Date().toISOString().slice(0, 10),
    employee_id: "",
    employee_name: "",
    employee_iin: "",
    reason_text: "",
    notes: "",
  });

  // Type-specific details (universal JSONB)
  const [details, setDetails] = useState<any>({});

  useEffect(() => { load(); }, [year]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const [o, e] = await Promise.all([
      supabase.from("hr_orders").select("*").eq("user_id", user.id).gte("order_date", yearStart).lte("order_date", yearEnd).order("order_date", { ascending: false }),
      supabase.from("employees").select("*").eq("user_id", user.id).order("full_name"),
    ]);
    setOrders(o.data || []);
    setEmployees(e.data || []);
  }

  function startCreate(type: string) {
    const formCode = ORDER_TYPES[type].form;
    const num = `${formCode === "—" ? "ПР" : formCode}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setOrderType(type);
    setEditing(null);
    setForm({
      order_number: num,
      order_date: new Date().toISOString().slice(0, 10),
      effective_date: new Date().toISOString().slice(0, 10),
      employee_id: "", employee_name: "", employee_iin: "",
      reason_text: "", notes: "",
    });
    // Default details by type
    if (type === "hire") {
      setDetails({ position: "", department: "", salary: "0", contract_type: "indefinite", probation_months: "0", hire_reason: "" });
    } else if (type === "transfer") {
      setDetails({ from_position: "", to_position: "", from_department: "", to_department: "", from_salary: "0", to_salary: "0", transfer_reason: "" });
    } else if (type === "vacation") {
      setDetails({ vacation_type: "annual", days: "14", start_date: "", end_date: "", vacation_pay: "0" });
    } else if (type === "dismissal") {
      setDetails({ dismissal_article: DISMISSAL_ARTICLES[0].code, last_working_day: new Date().toISOString().slice(0, 10), compensation: "0", unused_vacation_days: "0", final_settlement: "0" });
    } else if (type === "bonus") {
      setDetails({ bonus_amount: "0", bonus_reason: "" });
    } else if (type === "penalty") {
      setDetails({ penalty_type: "remark", penalty_reason: "" });
    } else {
      setDetails({});
    }
    setShowForm(true);
  }

  function startEdit(order: any) {
    setOrderType(order.order_type);
    setEditing(order);
    setForm({
      order_number: order.order_number,
      order_date: order.order_date,
      effective_date: order.effective_date,
      employee_id: order.employee_id || "",
      employee_name: order.employee_name,
      employee_iin: order.employee_iin || "",
      reason_text: order.reason_text || "",
      notes: order.notes || "",
    });
    setDetails(order.details || {});
    setShowForm(true);
  }

  function selectEmployee(id: string) {
    const e = employees.find(x => x.id === id);
    if (e) {
      setForm(prev => ({ ...prev, employee_id: id, employee_name: e.full_name, employee_iin: e.iin || "" }));
      // Заполняем "from" поля для перевода
      if (orderType === "transfer") {
        setDetails({ ...details, from_position: e.position || "", from_salary: String(e.salary || 0) });
      }
    } else {
      setForm(prev => ({ ...prev, employee_id: "" }));
    }
  }

  async function saveOrder() {
    if (!form.employee_name || !form.order_number) {
      setMsg("❌ Заполните: сотрудник, № приказа"); setTimeout(() => setMsg(""), 3000); return;
    }
    const data = {
      user_id: userId,
      order_type: orderType,
      form_code: ORDER_TYPES[orderType].form,
      order_number: form.order_number,
      order_date: form.order_date,
      effective_date: form.effective_date,
      employee_id: form.employee_id || null,
      employee_name: form.employee_name,
      employee_iin: form.employee_iin || null,
      details,
      reason_text: form.reason_text || null,
      notes: form.notes || null,
    };
    if (editing) await supabase.from("hr_orders").update(data).eq("id", editing.id);
    else await supabase.from("hr_orders").insert({ ...data, status: "draft" });
    setMsg(`✅ ${editing ? "Обновлено" : "Создано"}: ${form.order_number}`);
    setShowForm(false);
    setEditing(null);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function signOrder(id: string) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    if (!confirm(`Подписать приказ ${o.order_number}? После подписания изменения будут заблокированы.`)) return;
    await supabase.from("hr_orders").update({
      status: "signed",
      signed_date: new Date().toISOString().slice(0, 10),
    }).eq("id", id);
    setMsg(`✅ Приказ ${o.order_number} подписан`);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function executeOrder(id: string) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    if (!confirm(`Исполнить приказ ${o.order_number}? Это применит изменения к карточке сотрудника.`)) return;

    // Применяем изменения к employees в зависимости от типа
    if (o.employee_id) {
      if (o.order_type === "hire") {
        const d = o.details || {};
        await supabase.from("employees").update({
          position: d.position,
          department: d.department,
          salary: Number(d.salary || 0),
          hire_date: o.effective_date,
          is_active: true,
        }).eq("id", o.employee_id);
      } else if (o.order_type === "transfer") {
        const d = o.details || {};
        await supabase.from("employees").update({
          position: d.to_position,
          department: d.to_department,
          salary: Number(d.to_salary || 0),
        }).eq("id", o.employee_id);
      } else if (o.order_type === "dismissal") {
        await supabase.from("employees").update({
          is_active: false,
          dismissal_date: o.effective_date,
        }).eq("id", o.employee_id);
      }
    }

    await supabase.from("hr_orders").update({ status: "executed" }).eq("id", id);
    setMsg(`✅ Приказ исполнен, карточка сотрудника обновлена`);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function cancelOrder(id: string) {
    if (!confirm("Отменить приказ? Если он уже был исполнен, изменения в карточке сотрудника НЕ откатятся автоматически.")) return;
    await supabase.from("hr_orders").update({ status: "cancelled" }).eq("id", id);
    load();
  }

  async function deleteOrder(id: string) {
    if (!confirm("Удалить приказ?")) return;
    await supabase.from("hr_orders").delete().eq("id", id);
    load();
  }

  // Filter
  const filteredOrders = filter === "all" ? orders : orders.filter(o => o.order_type === filter);

  // KPI
  const total = orders.length;
  const draftCount = orders.filter(o => o.status === "draft").length;
  const signedCount = orders.filter(o => o.status === "signed").length;
  const executedCount = orders.filter(o => o.status === "executed").length;
  const hiresCount = orders.filter(o => o.order_type === "hire").length;
  const dismissalsCount = orders.filter(o => o.order_type === "dismissal").length;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Унифицированные кадровые приказы по формам Т-1 (приём), Т-5 (перевод), Т-6 (отпуск), Т-8 (увольнение). При исполнении приказа карточка сотрудника обновляется автоматически.
      </div>

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-3 items-center">
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 120 }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y} год</option>)}
          </select>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 220 }}>
            <option value="all">Все типы</option>
            {Object.entries(ORDER_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => startCreate("hire")} className="px-3 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: ORDER_TYPES.hire.color }}>🤝 Приём (Т-1)</button>
          <button onClick={() => startCreate("transfer")} className="px-3 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: ORDER_TYPES.transfer.color }}>🔄 Перевод (Т-5)</button>
          <button onClick={() => startCreate("vacation")} className="px-3 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: ORDER_TYPES.vacation.color }}>🏖 Отпуск (Т-6)</button>
          <button onClick={() => startCreate("dismissal")} className="px-3 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: ORDER_TYPES.dismissal.color }}>🚪 Увольнение (Т-8)</button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Всего за год</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{total}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6B7280" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📝 Черновиков</div>
          <div className="text-xl font-bold" style={{ color: "#6B7280" }}>{draftCount}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✓ Исполнено</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{executedCount}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🤝 Принято</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{hiresCount}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🚪 Уволено</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{dismissalsCount}</div>
        </div>
      </div>

      {/* ═══ ФОРМА ═══ */}
      {showForm && (() => {
        const ot = ORDER_TYPES[orderType];
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3 flex items-center gap-2">
              <span style={{ color: ot.color }}>{ot.icon}</span>
              {editing ? "Редактирование" : "Новый"} приказ {ot.form !== "—" && `(${ot.form})`}: {ot.name}
            </div>

            {/* Common fields */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ приказа *</label><input value={form.order_number} onChange={e => setForm({ ...form, order_number: e.target.value })} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата приказа</label><input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата вступления в силу</label><input type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} /></div>
              <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сотрудник *</label>
                <select value={form.employee_id} onChange={e => selectEmployee(e.target.value)}>
                  <option value="">— Выбрать или ввести вручную ниже —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} {e.position ? `(${e.position})` : ""}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО *</label><input value={form.employee_name} onChange={e => setForm({ ...form, employee_name: e.target.value })} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН</label><input value={form.employee_iin} maxLength={12} onChange={e => setForm({ ...form, employee_iin: e.target.value.replace(/\D/g, "") })} /></div>
            </div>

            {/* === T-1 ПРИЁМ === */}
            {orderType === "hire" && (
              <>
                <div className="text-[11px] font-bold mb-2" style={{ color: "#10B981" }}>🤝 ДАННЫЕ О ПРИЁМЕ</div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Должность *</label><input value={details.position || ""} onChange={e => setDetails({ ...details, position: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Подразделение</label><input value={details.department || ""} onChange={e => setDetails({ ...details, department: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Оклад, ₸ *</label><input type="number" value={details.salary || "0"} onChange={e => setDetails({ ...details, salary: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип договора</label>
                    <select value={details.contract_type || "indefinite"} onChange={e => setDetails({ ...details, contract_type: e.target.value })}>
                      <option value="indefinite">Бессрочный</option>
                      <option value="fixed_term">Срочный</option>
                      <option value="seasonal">Сезонный</option>
                    </select>
                  </div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Испытательный срок (мес.)</label><input type="number" min="0" max="3" value={details.probation_months || "0"} onChange={e => setDetails({ ...details, probation_months: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Основание</label><input value={details.hire_reason || ""} onChange={e => setDetails({ ...details, hire_reason: e.target.value })} placeholder="Заявление от ___" /></div>
                </div>
              </>
            )}

            {/* === T-5 ПЕРЕВОД === */}
            {orderType === "transfer" && (
              <>
                <div className="text-[11px] font-bold mb-2" style={{ color: "#3B82F6" }}>🔄 ДАННЫЕ О ПЕРЕВОДЕ</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                    <div className="text-[10px] font-bold mb-2" style={{ color: "var(--t3)" }}>СТАРОЕ МЕСТО</div>
                    <div className="grid grid-cols-1 gap-2">
                      <div><label className="block text-[9px] mb-1" style={{ color: "var(--t3)" }}>Должность</label><input value={details.from_position || ""} onChange={e => setDetails({ ...details, from_position: e.target.value })} /></div>
                      <div><label className="block text-[9px] mb-1" style={{ color: "var(--t3)" }}>Подразделение</label><input value={details.from_department || ""} onChange={e => setDetails({ ...details, from_department: e.target.value })} /></div>
                      <div><label className="block text-[9px] mb-1" style={{ color: "var(--t3)" }}>Оклад, ₸</label><input type="number" value={details.from_salary || "0"} onChange={e => setDetails({ ...details, from_salary: e.target.value })} /></div>
                    </div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "#3B82F610" }}>
                    <div className="text-[10px] font-bold mb-2" style={{ color: "#3B82F6" }}>НОВОЕ МЕСТО →</div>
                    <div className="grid grid-cols-1 gap-2">
                      <div><label className="block text-[9px] mb-1" style={{ color: "var(--t3)" }}>Должность *</label><input value={details.to_position || ""} onChange={e => setDetails({ ...details, to_position: e.target.value })} /></div>
                      <div><label className="block text-[9px] mb-1" style={{ color: "var(--t3)" }}>Подразделение</label><input value={details.to_department || ""} onChange={e => setDetails({ ...details, to_department: e.target.value })} /></div>
                      <div><label className="block text-[9px] mb-1" style={{ color: "var(--t3)" }}>Оклад, ₸ *</label><input type="number" value={details.to_salary || "0"} onChange={e => setDetails({ ...details, to_salary: e.target.value })} /></div>
                    </div>
                  </div>
                </div>
                <div className="mb-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Причина перевода</label><input value={details.transfer_reason || ""} onChange={e => setDetails({ ...details, transfer_reason: e.target.value })} placeholder="Производственная необходимость / по заявлению работника" /></div>
              </>
            )}

            {/* === T-6 ОТПУСК === */}
            {orderType === "vacation" && (
              <>
                <div className="text-[11px] font-bold mb-2" style={{ color: "#A855F7" }}>🏖 ДАННЫЕ ОБ ОТПУСКЕ</div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип отпуска</label>
                    <select value={details.vacation_type || "annual"} onChange={e => setDetails({ ...details, vacation_type: e.target.value })}>
                      <option value="annual">Ежегодный оплачиваемый</option>
                      <option value="unpaid">Без сохранения ЗП</option>
                      <option value="maternity">По беременности/уходу</option>
                      <option value="study">Учебный</option>
                    </select>
                  </div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата начала *</label><input type="date" value={details.start_date || ""} onChange={e => setDetails({ ...details, start_date: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата окончания *</label><input type="date" value={details.end_date || ""} onChange={e => setDetails({ ...details, end_date: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Календарных дней</label><input type="number" value={details.days || "0"} onChange={e => setDetails({ ...details, days: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма к выплате, ₸</label><input type="number" value={details.vacation_pay || "0"} onChange={e => setDetails({ ...details, vacation_pay: e.target.value })} /></div>
                </div>
              </>
            )}

            {/* === T-8 УВОЛЬНЕНИЕ === */}
            {orderType === "dismissal" && (
              <>
                <div className="text-[11px] font-bold mb-2" style={{ color: "#EF4444" }}>🚪 ДАННЫЕ ОБ УВОЛЬНЕНИИ</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Статья ТК РК *</label>
                    <select value={details.dismissal_article || DISMISSAL_ARTICLES[0].code} onChange={e => setDetails({ ...details, dismissal_article: e.target.value })}>
                      {DISMISSAL_ARTICLES.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Последний рабочий день *</label><input type="date" value={details.last_working_day || ""} onChange={e => setDetails({ ...details, last_working_day: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Неисп. дней отпуска</label><input type="number" value={details.unused_vacation_days || "0"} onChange={e => setDetails({ ...details, unused_vacation_days: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Компенсация за отпуск, ₸</label><input type="number" value={details.compensation || "0"} onChange={e => setDetails({ ...details, compensation: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Окончательный расчёт, ₸</label><input type="number" value={details.final_settlement || "0"} onChange={e => setDetails({ ...details, final_settlement: e.target.value })} /></div>
                </div>
              </>
            )}

            {/* === T-11 ПРЕМИЯ === */}
            {orderType === "bonus" && (
              <>
                <div className="text-[11px] font-bold mb-2" style={{ color: "#F59E0B" }}>🎁 ДАННЫЕ О ПРЕМИИ</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма, ₸ *</label><input type="number" value={details.bonus_amount || "0"} onChange={e => setDetails({ ...details, bonus_amount: e.target.value })} /></div>
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Основание</label><input value={details.bonus_reason || ""} onChange={e => setDetails({ ...details, bonus_reason: e.target.value })} placeholder="За высокие результаты в Q4 2025" /></div>
                </div>
              </>
            )}

            {/* === ВЗЫСКАНИЕ === */}
            {orderType === "penalty" && (
              <>
                <div className="text-[11px] font-bold mb-2" style={{ color: "#DC2626" }}>⚠ ВЗЫСКАНИЕ</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Вид взыскания</label>
                    <select value={details.penalty_type || "remark"} onChange={e => setDetails({ ...details, penalty_type: e.target.value })}>
                      <option value="remark">Замечание</option>
                      <option value="reprimand">Выговор</option>
                      <option value="dismissal">Увольнение</option>
                    </select>
                  </div>
                  <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Причина</label><input value={details.penalty_reason || ""} onChange={e => setDetails({ ...details, penalty_reason: e.target.value })} placeholder="За опоздание на работу 10.04.2026" /></div>
                </div>
              </>
            )}

            {/* Common bottom fields */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Основание (документ)</label><input value={form.reason_text} onChange={e => setForm({ ...form, reason_text: e.target.value })} placeholder="Заявление от 01.04.2026" /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>

            <div className="flex gap-2">
              <button onClick={saveOrder} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
            </div>
          </div>
        );
      })()}

      {/* ═══ СПИСОК ═══ */}
      {!showForm && !viewing && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["№ приказа", "Дата", "Тип", "Форма", "Сотрудник", "Действует с", "Статус", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет приказов</td></tr>
              ) : filteredOrders.map(o => {
                const t = ORDER_TYPES[o.order_type] || ORDER_TYPES.other;
                const s = STATUS[o.status] || STATUS.draft;
                return (
                  <tr key={o.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{o.order_number}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.order_date}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.icon} {t.name}</span>
                    </td>
                    <td className="p-2.5 text-[11px] font-mono font-bold" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.form_code}</td>
                    <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{o.employee_name}</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.effective_date}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: s.color + "20", color: s.color }}>{s.name}</span>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => setViewing(o)} title="Просмотр / Печать" className="text-[12px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "var(--accent)" }}>👁</button>
                      {o.status === "draft" && <>
                        <button onClick={() => signOrder(o.id)} title="Подписать" className="text-[12px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "#3B82F6" }}>✍</button>
                        <button onClick={() => startEdit(o)} className="text-[11px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "var(--accent)" }}>✏</button>
                      </>}
                      {o.status === "signed" && <button onClick={() => executeOrder(o.id)} title="Исполнить" className="text-[12px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "#10B981" }}>✓</button>}
                      {o.status !== "cancelled" && o.status !== "executed" && <button onClick={() => cancelOrder(o.id)} title="Отменить" className="text-[12px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "#F59E0B" }}>○</button>}
                      <button onClick={() => deleteOrder(o.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ПЕЧАТНАЯ ФОРМА ═══ */}
      {viewing && (() => {
        const t = ORDER_TYPES[viewing.order_type] || ORDER_TYPES.other;
        const d = viewing.details || {};
        return (
          <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="flex justify-between mb-3">
              <button onClick={() => setViewing(null)} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>← К списку</button>
              <button onClick={() => window.print()} className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" style={{ background: "#6366F120", color: "#6366F1" }}>🖨 Печать</button>
            </div>

            <div className="text-center mb-5">
              <div className="text-xs" style={{ color: "var(--t3)" }}>{t.form !== "—" && `Форма ${t.form}`}</div>
              <div className="text-base font-bold mt-2 uppercase">ПРИКАЗ № {viewing.order_number}</div>
              <div className="text-sm mt-1">от {viewing.order_date}</div>
              <div className="text-base font-bold mt-3 uppercase">{t.name}</div>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm" style={{ lineHeight: 1.6 }}>
              <div>
                Принять / перевести / уволить / предоставить отпуск / премировать (нужное подчеркнуть):<br/>
                <b>{viewing.employee_name}</b>{viewing.employee_iin && ` (ИИН ${viewing.employee_iin})`}
              </div>

              {viewing.order_type === "hire" && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                  Принять на работу с {viewing.effective_date}<br/>
                  <b>Должность:</b> {d.position || "—"}<br/>
                  {d.department && <><b>Подразделение:</b> {d.department}<br/></>}
                  <b>Оклад:</b> {fmtMoney(Number(d.salary || 0))} ₸<br/>
                  <b>Тип договора:</b> {d.contract_type === "indefinite" ? "Бессрочный" : d.contract_type === "fixed_term" ? "Срочный" : "Сезонный"}<br/>
                  {Number(d.probation_months || 0) > 0 && <><b>Испытательный срок:</b> {d.probation_months} мес.<br/></>}
                </div>
              )}

              {viewing.order_type === "transfer" && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                  Перевести с {viewing.effective_date}<br/>
                  <b>Откуда:</b> {d.from_position}{d.from_department && ` (${d.from_department})`}, оклад {fmtMoney(Number(d.from_salary || 0))} ₸<br/>
                  <b>Куда:</b> {d.to_position}{d.to_department && ` (${d.to_department})`}, оклад {fmtMoney(Number(d.to_salary || 0))} ₸<br/>
                  {d.transfer_reason && <><b>Причина:</b> {d.transfer_reason}<br/></>}
                </div>
              )}

              {viewing.order_type === "vacation" && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                  Предоставить {d.vacation_type === "annual" ? "ежегодный оплачиваемый" : d.vacation_type === "unpaid" ? "без сохранения ЗП" : d.vacation_type === "maternity" ? "по беременности/уходу" : "учебный"} отпуск<br/>
                  <b>Период:</b> с {d.start_date} по {d.end_date} ({d.days} календарных дней)<br/>
                  {Number(d.vacation_pay || 0) > 0 && <><b>К выплате:</b> {fmtMoney(Number(d.vacation_pay))} ₸<br/></>}
                </div>
              )}

              {viewing.order_type === "dismissal" && (
                <div className="rounded-lg p-3" style={{ background: "#EF444410" }}>
                  Прекратить трудовой договор с {viewing.effective_date}<br/>
                  <b>Основание:</b> {d.dismissal_article} ТК РК — {DISMISSAL_ARTICLES.find(a => a.code === d.dismissal_article)?.name}<br/>
                  <b>Последний рабочий день:</b> {d.last_working_day}<br/>
                  {Number(d.unused_vacation_days || 0) > 0 && <><b>Компенсация за {d.unused_vacation_days} дней неисп. отпуска:</b> {fmtMoney(Number(d.compensation || 0))} ₸<br/></>}
                  {Number(d.final_settlement || 0) > 0 && <><b>Окончательный расчёт:</b> {fmtMoney(Number(d.final_settlement))} ₸<br/></>}
                </div>
              )}

              {viewing.order_type === "bonus" && (
                <div className="rounded-lg p-3" style={{ background: "#F59E0B10" }}>
                  Премировать на сумму <b>{fmtMoney(Number(d.bonus_amount || 0))} ₸</b><br/>
                  {d.bonus_reason && <><b>Основание:</b> {d.bonus_reason}<br/></>}
                </div>
              )}

              {viewing.order_type === "penalty" && (
                <div className="rounded-lg p-3" style={{ background: "#DC262610" }}>
                  Применить дисциплинарное взыскание: <b>{d.penalty_type === "remark" ? "ЗАМЕЧАНИЕ" : d.penalty_type === "reprimand" ? "ВЫГОВОР" : "УВОЛЬНЕНИЕ"}</b><br/>
                  {d.penalty_reason && <><b>Причина:</b> {d.penalty_reason}<br/></>}
                </div>
              )}

              {viewing.reason_text && <div><b>Основание:</b> {viewing.reason_text}</div>}
              {viewing.notes && <div><b>Примечание:</b> {viewing.notes}</div>}
            </div>

            <div className="grid grid-cols-2 gap-8 mt-8 text-[11px]">
              <div>
                <div className="border-b mb-1 pb-4" style={{ borderColor: "var(--brd)" }}></div>
                <div style={{ color: "var(--t3)" }}>Руководитель _____________________</div>
              </div>
              <div>
                <div className="border-b mb-1 pb-4" style={{ borderColor: "var(--brd)" }}></div>
                <div style={{ color: "var(--t3)" }}>С приказом ознакомлен(а): {viewing.employee_name} _____________________</div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 Жизненный цикл приказа: <b>Черновик</b> → ✍ <b>Подписан</b> → ✓ <b>Исполнен</b> (изменения применятся к карточке сотрудника).<br/>
        💡 При исполнении приказа Т-1 — сотрудник становится активным; Т-5 — обновляется должность/оклад; Т-8 — деактивируется с датой увольнения.<br/>
        💡 Печатная форма содержит правильную структуру и подписи руководителя/работника по ТК РК.
      </div>
    </div>
  );
}
