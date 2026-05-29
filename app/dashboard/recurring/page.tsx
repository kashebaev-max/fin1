"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "templates" | "schedule" | "history";

const PAYMENT_TYPES: Record<string, { name: string; icon: string; color: string }> = {
  rent: { name: "Аренда", icon: "🏠", color: "#6366F1" },
  subscription: { name: "Подписка / SaaS", icon: "💳", color: "#A855F7" },
  leasing: { name: "Лизинг", icon: "🚗", color: "#10B981" },
  utility: { name: "Коммунальные", icon: "💡", color: "#F59E0B" },
  salary: { name: "Зарплата", icon: "👤", color: "#3B82F6" },
  tax: { name: "Налог / сбор", icon: "⚖", color: "#EF4444" },
  loan: { name: "Кредит / займ", icon: "🏦", color: "#EC4899" },
  other: { name: "Прочее", icon: "📋", color: "#6B7280" },
};

const FREQ: Record<string, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
  quarterly: "Ежеквартально",
  yearly: "Ежегодно",
};

const STATUS: Record<string, { name: string; color: string }> = {
  pending: { name: "Ожидает", color: "#F59E0B" },
  created: { name: "Создан", color: "#3B82F6" },
  paid: { name: "Оплачен", color: "#10B981" },
  overdue: { name: "Просрочен", color: "#EF4444" },
  cancelled: { name: "Отменён", color: "#6B7280" },
};

function calcNextDate(currentDate: string, frequency: string, dayOfMonth?: number): string {
  const d = new Date(currentDate);
  switch (frequency) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      if (dayOfMonth) d.setDate(Math.min(dayOfMonth, 28));
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      if (dayOfMonth) d.setDate(Math.min(dayOfMonth, 28));
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

export default function RecurringPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("templates");
  const [templates, setTemplates] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const empty = {
    name: "", payment_type: "rent", direction: "outgoing",
    counterparty_id: "", counterparty_name: "", counterparty_bin: "",
    amount: "0", currency: "KZT", has_nds: true, nds_rate: "16",
    frequency: "monthly", day_of_month: "1",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    contract_id: "", contract_number: "",
    doc_type: "invoice",
    debit_account: "7210", credit_account: "3310",
    is_active: true, auto_create: true,
    description: "", notes: "",
  };
  const [form, setForm] = useState(empty);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [r, s, c, ct] = await Promise.all([
      supabase.from("recurring_payments").select("*").eq("user_id", user.id).order("name"),
      supabase.from("payment_schedules").select("*").eq("user_id", user.id).order("scheduled_date", { ascending: false }),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
      supabase.from("contracts").select("*").eq("user_id", user.id),
    ]);
    setTemplates(r.data || []);
    setSchedules(s.data || []);
    setCounterparties(c.data || []);
    setContracts(ct.data || []);
  }

  function startCreate() { setEditing(null); setForm(empty); setShowForm(true); }
  function startEdit(t: any) {
    setEditing(t);
    setForm({
      name: t.name, payment_type: t.payment_type, direction: t.direction || "outgoing",
      counterparty_id: t.counterparty_id || "",
      counterparty_name: t.counterparty_name,
      counterparty_bin: t.counterparty_bin || "",
      amount: String(t.amount), currency: t.currency || "KZT",
      has_nds: !!t.has_nds, nds_rate: String(t.nds_rate || 16),
      frequency: t.frequency, day_of_month: String(t.day_of_month || 1),
      start_date: t.start_date, end_date: t.end_date || "",
      contract_id: t.contract_id || "", contract_number: t.contract_number || "",
      doc_type: t.doc_type || "invoice",
      debit_account: t.debit_account || "7210",
      credit_account: t.credit_account || "3310",
      is_active: !!t.is_active,
      auto_create: !!t.auto_create,
      description: t.description || "",
      notes: t.notes || "",
    });
    setShowForm(true);
  }

  function selectCp(id: string) {
    const c = counterparties.find(x => x.id === id);
    if (c) setForm({ ...form, counterparty_id: id, counterparty_name: c.name, counterparty_bin: c.bin || "" });
    else setForm({ ...form, counterparty_id: "" });
  }

  function selectContract(id: string) {
    const c = contracts.find(x => x.id === id);
    if (c) setForm({ ...form, contract_id: id, contract_number: c.contract_number });
    else setForm({ ...form, contract_id: "", contract_number: "" });
  }

  async function saveTemplate() {
    if (!form.name || !form.counterparty_name) { setMsg("❌ Укажите название и контрагента"); setTimeout(() => setMsg(""), 3000); return; }
    const data = {
      user_id: userId,
      name: form.name,
      payment_type: form.payment_type,
      direction: form.direction,
      counterparty_id: form.counterparty_id || null,
      counterparty_name: form.counterparty_name,
      counterparty_bin: form.counterparty_bin || null,
      amount: Number(form.amount),
      currency: form.currency,
      has_nds: form.has_nds,
      nds_rate: Number(form.nds_rate),
      frequency: form.frequency,
      day_of_month: Number(form.day_of_month),
      start_date: form.start_date,
      end_date: form.end_date || null,
      next_payment_date: editing?.next_payment_date || form.start_date,
      contract_id: form.contract_id || null,
      contract_number: form.contract_number || null,
      doc_type: form.doc_type,
      debit_account: form.debit_account || null,
      credit_account: form.credit_account || null,
      is_active: form.is_active,
      auto_create: form.auto_create,
      description: form.description || null,
      notes: form.notes || null,
    };
    if (editing) await supabase.from("recurring_payments").update(data).eq("id", editing.id);
    else await supabase.from("recurring_payments").insert(data);
    setMsg(`✅ ${editing ? "Обновлено" : "Создано"}: ${form.name}`);
    setShowForm(false); setEditing(null); load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Удалить шаблон? Связанные записи в графике останутся, но потеряют связь.")) return;
    await supabase.from("recurring_payments").delete().eq("id", id);
    load();
  }

  async function toggleTemplate(t: any) {
    await supabase.from("recurring_payments").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  // Генерация графика на N периодов вперёд
  async function generateSchedule(t: any, periods: number) {
    if (!confirm(`Сгенерировать график на ${periods} периодов вперёд для «${t.name}»?`)) return;
    let date = t.next_payment_date || t.start_date;
    const inserts = [];
    for (let i = 0; i < periods; i++) {
      // Не добавляем за пределами end_date
      if (t.end_date && date > t.end_date) break;
      inserts.push({
        user_id: userId,
        recurring_id: t.id,
        scheduled_date: date,
        amount: Number(t.amount),
        status: "pending",
      });
      date = calcNextDate(date, t.frequency, t.day_of_month);
    }
    if (inserts.length > 0) {
      await supabase.from("payment_schedules").insert(inserts);
      // Обновляем next_payment_date
      await supabase.from("recurring_payments").update({ next_payment_date: date }).eq("id", t.id);
    }
    setMsg(`✅ Создано ${inserts.length} платежей в графике`);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  // Создание документа из планового платежа
  async function createDocFromSchedule(s: any) {
    const t = templates.find(x => x.id === s.recurring_id);
    if (!t) return;
    if (!confirm(`Создать ${t.doc_type === "invoice" ? "счёт" : "документ"} на сумму ${fmtMoney(Number(s.amount))} ₸ от ${s.scheduled_date}?`)) return;

    const docNumber = `${t.doc_type === "invoice" ? "СФ" : "ДОК"}-${new Date(s.scheduled_date).getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const ndsRate = Number(t.nds_rate || 16);
    const total = Number(s.amount);
    const ndsSum = t.has_nds ? Math.round(total * ndsRate / (100 + ndsRate)) : 0;
    const sumNoNds = total - ndsSum;

    const { data: doc } = await supabase.from("documents").insert({
      user_id: userId,
      doc_number: docNumber,
      doc_date: s.scheduled_date,
      doc_type: t.doc_type,
      counterparty_id: t.counterparty_id || null,
      counterparty_name: t.counterparty_name,
      counterparty_bin: t.counterparty_bin || null,
      contract_id: t.contract_id || null,
      contract_number: t.contract_number || null,
      total_amount: sumNoNds,
      nds_amount: ndsSum,
      total_with_nds: total,
      status: "draft",
      items: [{
        name: t.description || t.name,
        quantity: 1, unit: "услуга", price: sumNoNds,
        nds_rate: ndsRate, sum: sumNoNds, nds_sum: ndsSum, total,
      }],
      notes: t.notes,
    }).select().single();

    // Обновить статус планового платежа
    await supabase.from("payment_schedules").update({
      status: "created",
      doc_id: doc?.id,
      doc_number: docNumber,
    }).eq("id", s.id);

    setMsg(`✅ Создан ${t.doc_type === "invoice" ? "счёт" : "документ"} ${docNumber}`);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function markPaid(s: any) {
    const paidDate = new Date().toISOString().slice(0, 10);
    await supabase.from("payment_schedules").update({
      status: "paid",
      paid_date: paidDate,
      paid_amount: Number(s.amount),
    }).eq("id", s.id);

    // Обновить статистику шаблона
    const t = templates.find(x => x.id === s.recurring_id);
    if (t) {
      await supabase.from("recurring_payments").update({
        last_payment_date: paidDate,
        payments_count: Number(t.payments_count || 0) + 1,
        total_paid: Number(t.total_paid || 0) + Number(s.amount),
      }).eq("id", t.id);
    }

    setMsg("✅ Платёж отмечен как оплаченный");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function cancelSchedule(id: string) {
    if (!confirm("Отменить платёж?")) return;
    await supabase.from("payment_schedules").update({ status: "cancelled" }).eq("id", id);
    load();
  }

  async function deleteSchedule(id: string) {
    if (!confirm("Удалить запись из графика?")) return;
    await supabase.from("payment_schedules").delete().eq("id", id);
    load();
  }

  // KPI
  const today = new Date().toISOString().slice(0, 10);
  const activeCount = templates.filter(t => t.is_active).length;
  const monthAmount = templates.filter(t => t.is_active && t.frequency === "monthly").reduce((a, t) => a + Number(t.amount), 0);
  const pendingCount = schedules.filter(s => s.status === "pending").length;
  const overdueCount = schedules.filter(s => s.status === "pending" && s.scheduled_date < today).length;

  // Mark overdue
  useEffect(() => {
    schedules.forEach(s => {
      if (s.status === "pending" && s.scheduled_date < today) {
        supabase.from("payment_schedules").update({ status: "overdue" }).eq("id", s.id);
      }
    });
  }, [schedules.length]);

  // Predicted month total
  const next30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const next30Total = schedules.filter(s => (s.status === "pending" || s.status === "overdue") && s.scheduled_date <= next30).reduce((a, s) => a + Number(s.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Регулярные платежи и подписки. Шаблон → автоматическая генерация графика → создание документов в нужные даты.
      </div>

      {overdueCount > 0 && (
        <div className="rounded-xl p-3" style={{ background: "#EF444410", border: "1px solid #EF444430" }}>
          <div className="text-xs font-bold" style={{ color: "#EF4444" }}>⚠ Просроченных платежей: {overdueCount}</div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🔄 Активных шаблонов</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{activeCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {templates.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Месячная нагрузка</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(monthAmount)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Ежемесячных платежей</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📅 Запланировано</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{pendingCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>В графике</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 К оплате за 30 дней</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{fmtMoney(next30Total)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Прогноз</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["templates", `🔄 Шаблоны (${templates.length})`],
          ["schedule", `📅 График (${schedules.filter(s => ["pending", "overdue", "created"].includes(s.status)).length})`],
          ["history", `📋 История оплат`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ШАБЛОНЫ ═══ */}
      {tab === "templates" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Шаблоны для аренды, подписок, лизинга, коммунальных и др.</div>
            <button onClick={startCreate} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новый шаблон</button>
          </div>

          {showForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{editing ? "Редактирование шаблона" : "Новый регулярный платёж"}</div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📋 ОСНОВНОЕ</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Аренда офиса на Абая" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={form.payment_type} onChange={e => setForm({ ...form, payment_type: e.target.value })}>
                    {Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Направление</label>
                  <select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}>
                    <option value="outgoing">📤 Мы платим</option>
                    <option value="incoming">📥 Нам платят</option>
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Контрагент *</label>
                  <select value={form.counterparty_id} onChange={e => selectCp(e.target.value)}>
                    <option value="">— Выбрать —</option>
                    {counterparties.map(c => <option key={c.id} value={c.id}>{c.name} {c.bin ? `(${c.bin})` : ""}</option>)}
                  </select>
                </div>
                {form.counterparty_id && (
                  <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Связанный договор</label>
                    <select value={form.contract_id} onChange={e => selectContract(e.target.value)}>
                      <option value="">— Без договора —</option>
                      {contracts.filter(c => c.counterparty_id === form.counterparty_id).map(c => <option key={c.id} value={c.id}>{c.contract_number} от {c.contract_date}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "#10B981" }}>💰 СУММА</div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма *</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Валюта</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                    <option value="KZT">₸ KZT</option>
                    <option value="USD">$ USD</option>
                    <option value="EUR">€ EUR</option>
                    <option value="RUB">₽ RUB</option>
                  </select>
                </div>
                <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.has_nds} onChange={e => setForm({ ...form, has_nds: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">С НДС</span>
                  </label>
                </div>
                {form.has_nds && (
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ставка НДС</label>
                    <select value={form.nds_rate} onChange={e => setForm({ ...form, nds_rate: e.target.value })}>
                      <option value="16">16%</option>
                      <option value="10">10%</option>
                      <option value="5">5%</option>
                      <option value="0">0%</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "#F59E0B" }}>📅 РАСПИСАНИЕ</div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Периодичность</label>
                  <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                    {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {(form.frequency === "monthly" || form.frequency === "quarterly") && (
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>День месяца</label><input type="number" min="1" max="28" value={form.day_of_month} onChange={e => setForm({ ...form, day_of_month: e.target.value })} /></div>
                )}
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата начала *</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата окончания (опц.)</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "#A855F7" }}>📑 ДОКУМЕНТ И ПРОВОДКИ</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип документа</label>
                  <select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })}>
                    <option value="invoice">Счёт-фактура</option>
                    <option value="act">Акт выполненных работ</option>
                    <option value="receipt">Приходная накладная</option>
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дебет</label><input value={form.debit_account} onChange={e => setForm({ ...form, debit_account: e.target.value })} placeholder="7210" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Кредит</label><input value={form.credit_account} onChange={e => setForm({ ...form, credit_account: e.target.value })} placeholder="3310" /></div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex items-end gap-3" style={{ paddingBottom: 8 }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">Активен</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.auto_create} onChange={e => setForm({ ...form, auto_create: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">Авто-создание документов</span>
                  </label>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание (для документа)</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveTemplate} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Название", "Тип", "Контрагент", "Сумма", "Период", "Старт", "След. платёж", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет шаблонов. Создайте первый.</td></tr>
                ) : templates.map(t => {
                  const pt = PAYMENT_TYPES[t.payment_type] || PAYMENT_TYPES.other;
                  return (
                    <tr key={t.id}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{t.name}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: pt.color + "20", color: pt.color }}>{pt.icon} {pt.name}</span>
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{t.counterparty_name}</td>
                      <td className="p-2.5 text-[13px] text-right font-bold" style={{ color: t.direction === "incoming" ? "#10B981" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>
                        {t.direction === "incoming" ? "+" : "−"}{fmtMoney(Number(t.amount))} {t.currency}
                      </td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{FREQ[t.frequency]}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{t.start_date}{t.end_date ? ` → ${t.end_date}` : ""}</td>
                      <td className="p-2.5 text-[11px] font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{t.next_payment_date || "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => toggleTemplate(t)} className="text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer border-none" style={{ background: t.is_active ? "#10B98120" : "#6B728020", color: t.is_active ? "#10B981" : "#6B7280" }}>
                          {t.is_active ? "✓ Вкл" : "○ Выкл"}
                        </button>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => generateSchedule(t, 12)} title="Сгенерировать на 12 периодов вперёд" className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "#10B981" }}>📅</button>
                        <button onClick={() => startEdit(t)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>✏</button>
                        <button onClick={() => deleteTemplate(t.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ГРАФИК ═══ */}
      {tab === "schedule" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📅 Запланированные платежи</div>
          <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
            Кликните 📄 чтобы создать документ из планового платежа, ✓ чтобы пометить как оплаченный
          </div>
          <table>
            <thead><tr>{["Дата", "Шаблон", "Контрагент", "Сумма", "Документ", "Статус", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {schedules.filter(s => s.status !== "paid" && s.status !== "cancelled").length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет запланированных. Сгенерируйте график из шаблона (кнопка 📅).</td></tr>
              ) : schedules.filter(s => s.status !== "paid" && s.status !== "cancelled").sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)).map(s => {
                const t = templates.find(x => x.id === s.recurring_id);
                const st = STATUS[s.status] || STATUS.pending;
                const isOverdue = s.scheduled_date < today && s.status === "pending";
                return (
                  <tr key={s.id} style={{ background: isOverdue ? "#EF444410" : "transparent" }}>
                    <td className="p-2.5 text-[12px] font-bold" style={{ color: isOverdue ? "#EF4444" : "var(--t1)", borderBottom: "1px solid var(--brd)" }}>{s.scheduled_date}</td>
                    <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{t?.name || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{t?.counterparty_name || "—"}</td>
                    <td className="p-2.5 text-[13px] text-right font-bold" style={{ color: t?.direction === "incoming" ? "#10B981" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>
                      {t?.direction === "incoming" ? "+" : "−"}{fmtMoney(Number(s.amount))}
                    </td>
                    <td className="p-2.5 text-[11px] font-mono" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{s.doc_number || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: st.color + "20", color: st.color }}>{isOverdue ? "⚠ Просрочен" : st.name}</span>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      {s.status !== "created" && <button onClick={() => createDocFromSchedule(s)} title="Создать документ" className="text-[12px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "#3B82F6" }}>📄</button>}
                      <button onClick={() => markPaid(s)} title="Отметить оплаченным" className="text-[12px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "#10B981" }}>✓</button>
                      <button onClick={() => cancelSchedule(s.id)} title="Отменить" className="text-[12px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "#F59E0B" }}>○</button>
                      <button onClick={() => deleteSchedule(s.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "history" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📋 История оплаченных платежей</div>
          <table>
            <thead><tr>{["Дата плана", "Дата оплаты", "Шаблон", "Контрагент", "Сумма", "Документ"].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {schedules.filter(s => s.status === "paid").length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет оплаченных платежей</td></tr>
              ) : schedules.filter(s => s.status === "paid").map(s => {
                const t = templates.find(x => x.id === s.recurring_id);
                return (
                  <tr key={s.id}>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{s.scheduled_date}</td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{s.paid_date}</td>
                    <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{t?.name || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{t?.counterparty_name || "—"}</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(s.paid_amount || s.amount))} ₸</td>
                    <td className="p-2.5 text-[11px] font-mono" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{s.doc_number || "—"}</td>
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
