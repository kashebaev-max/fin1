"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "pipeline" | "leads" | "tasks" | "events" | "analytics";

const STAGES = [
  { key: "new", name: "Новая", color: "#6B7280" },
  { key: "qualifying", name: "Квалификация", color: "#3B82F6" },
  { key: "proposal", name: "Предложение", color: "#A855F7" },
  { key: "negotiation", name: "Переговоры", color: "#F59E0B" },
  { key: "won", name: "Выиграна", color: "#10B981" },
  { key: "lost", name: "Проиграна", color: "#EF4444" },
];

const LEAD_STATUSES = [
  { key: "new", name: "Новый", color: "#6B7280" },
  { key: "contacted", name: "Связались", color: "#3B82F6" },
  { key: "qualified", name: "Квалифицирован", color: "#A855F7" },
  { key: "converted", name: "Сконвертирован", color: "#10B981" },
  { key: "lost", name: "Потерян", color: "#EF4444" },
];

const PRIORITIES = [
  { key: "low", name: "Низкий", color: "#6B7280" },
  { key: "medium", name: "Средний", color: "#3B82F6" },
  { key: "high", name: "Высокий", color: "#F59E0B" },
  { key: "urgent", name: "Срочный", color: "#EF4444" },
];

const EVENT_TYPES = [
  { key: "call", name: "Звонок", icon: "📞" },
  { key: "meeting", name: "Встреча", icon: "🤝" },
  { key: "email", name: "Email", icon: "📧" },
  { key: "note", name: "Заметка", icon: "📝" },
  { key: "sms", name: "SMS", icon: "💬" },
  { key: "visit", name: "Визит", icon: "🚶" },
];

export default function CRMPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("pipeline");
  const [leads, setLeads] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Forms
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);

  const [leadForm, setLeadForm] = useState({ name: "", company: "", phone: "", email: "", source: "", notes: "" });
  const [dealForm, setDealForm] = useState({ title: "", counterparty_name: "", amount: "", stage: "new", probability: "50", expected_close_date: "", description: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", due_date: new Date().toISOString().slice(0, 10), priority: "medium" });
  const [eventForm, setEventForm] = useState({ event_type: "call", title: "", description: "", outcome: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [l, d, t, e, c] = await Promise.all([
      supabase.from("crm_leads").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("crm_deals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("crm_tasks").select("*").eq("user_id", user.id).order("due_date"),
      supabase.from("crm_events").select("*").eq("user_id", user.id).order("event_date", { ascending: false }).limit(50),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
    ]);
    setLeads(l.data || []);
    setDeals(d.data || []);
    setTasks(t.data || []);
    setEvents(e.data || []);
    setCounterparties(c.data || []);
  }

  async function addLead() {
    await supabase.from("crm_leads").insert({ user_id: userId, ...leadForm, status: "new" });
    setLeadForm({ name: "", company: "", phone: "", email: "", source: "", notes: "" });
    setShowLeadForm(false);
    setMsg("✅ Лид добавлен");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function addDeal() {
    await supabase.from("crm_deals").insert({
      user_id: userId,
      ...dealForm,
      amount: Number(dealForm.amount),
      probability: Number(dealForm.probability),
    });
    setDealForm({ title: "", counterparty_name: "", amount: "", stage: "new", probability: "50", expected_close_date: "", description: "" });
    setShowDealForm(false);
    setMsg("✅ Сделка создана");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function moveDealStage(dealId: string, newStage: string) {
    const update: any = { stage: newStage, updated_at: new Date().toISOString() };
    if (newStage === "won" || newStage === "lost") update.actual_close_date = new Date().toISOString().slice(0, 10);
    if (newStage === "won") update.probability = 100;
    if (newStage === "lost") update.probability = 0;
    await supabase.from("crm_deals").update(update).eq("id", dealId);
    load();
  }

  async function deleteDeal(id: string) {
    if (!confirm("Удалить сделку?")) return;
    await supabase.from("crm_deals").delete().eq("id", id);
    load();
  }

  async function deleteLead(id: string) {
    if (!confirm("Удалить лида?")) return;
    await supabase.from("crm_leads").delete().eq("id", id);
    load();
  }

  async function addTask() {
    await supabase.from("crm_tasks").insert({ user_id: userId, ...taskForm, status: "open" });
    setTaskForm({ title: "", description: "", due_date: new Date().toISOString().slice(0, 10), priority: "medium" });
    setShowTaskForm(false);
    setMsg("✅ Задача создана");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function toggleTaskDone(task: any) {
    await supabase.from("crm_tasks").update({
      status: task.status === "done" ? "open" : "done",
      completed_at: task.status === "done" ? null : new Date().toISOString(),
    }).eq("id", task.id);
    load();
  }

  async function deleteTask(id: string) {
    await supabase.from("crm_tasks").delete().eq("id", id);
    load();
  }

  async function addEvent() {
    await supabase.from("crm_events").insert({
      user_id: userId,
      ...eventForm,
      event_date: new Date().toISOString(),
    });
    setEventForm({ event_type: "call", title: "", description: "", outcome: "" });
    setShowEventForm(false);
    setMsg("✅ Событие записано");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteEvent(id: string) {
    await supabase.from("crm_events").delete().eq("id", id);
    load();
  }

  // KPI
  const totalDealAmount = deals.filter(d => !["won", "lost"].includes(d.stage)).reduce((a, d) => a + Number(d.amount), 0);
  const wonAmount = deals.filter(d => d.stage === "won").reduce((a, d) => a + Number(d.amount), 0);
  const newLeadsCount = leads.filter(l => l.status === "new").length;
  const overdueTasks = tasks.filter(t => t.status !== "done" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10)).length;
  const todayTasks = tasks.filter(t => t.status !== "done" && t.due_date === new Date().toISOString().slice(0, 10)).length;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: "#10B98120", color: "#10B981" }}>{msg}</div>}

      {/* KPI */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>В работе</div>
          <div className="text-lg font-bold" style={{ color: "#6366F1" }}>{fmtMoney(totalDealAmount)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{deals.filter(d => !["won", "lost"].includes(d.stage)).length} сделок</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>✓ Выиграно</div>
          <div className="text-lg font-bold" style={{ color: "#10B981" }}>{fmtMoney(wonAmount)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{deals.filter(d => d.stage === "won").length} сделок</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>🆕 Новых лидов</div>
          <div className="text-lg font-bold" style={{ color: "#F59E0B" }}>{newLeadsCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {leads.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #3B82F6" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>📅 На сегодня</div>
          <div className="text-lg font-bold" style={{ color: "#3B82F6" }}>{todayTasks}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>задач</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>⚠ Просрочено</div>
          <div className="text-lg font-bold" style={{ color: "#EF4444" }}>{overdueTasks}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>задач</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          ["pipeline", "💼 Воронка продаж"],
          ["leads", "🆕 Лиды"],
          ["tasks", "📅 Задачи"],
          ["events", "📞 История взаимодействий"],
          ["analytics", "📊 Аналитика"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ВОРОНКА ПРОДАЖ ═══ */}
      {tab === "pipeline" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              {deals.length} сделок • Перетащите карточку или нажмите кнопку этапа для перевода
            </div>
            <button onClick={() => setShowDealForm(!showDealForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новая сделка
            </button>
          </div>

          {showDealForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Новая сделка</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название сделки</label>
                  <input value={dealForm.title} onChange={e => setDealForm({ ...dealForm, title: e.target.value })} placeholder="Поставка оборудования..." />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Этап</label>
                  <select value={dealForm.stage} onChange={e => setDealForm({ ...dealForm, stage: e.target.value })}>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Контрагент</label>
                  <input value={dealForm.counterparty_name} onChange={e => setDealForm({ ...dealForm, counterparty_name: e.target.value })} placeholder='ТОО «Покупатель»' list="cp-list" />
                  <datalist id="cp-list">
                    {counterparties.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма (₸)</label>
                  <input type="number" value={dealForm.amount} onChange={e => setDealForm({ ...dealForm, amount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Вероятность %</label>
                  <input type="number" min={0} max={100} value={dealForm.probability} onChange={e => setDealForm({ ...dealForm, probability: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ожидаемое закрытие</label>
                  <input type="date" value={dealForm.expected_close_date} onChange={e => setDealForm({ ...dealForm, expected_close_date: e.target.value })} />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label>
                <input value={dealForm.description} onChange={e => setDealForm({ ...dealForm, description: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button onClick={addDeal} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Создать</button>
                <button onClick={() => setShowDealForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          {/* Kanban */}
          <div className="grid gap-3 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))` }}>
            {STAGES.map(stage => {
              const stageDeals = deals.filter(d => d.stage === stage.key);
              const stageTotal = stageDeals.reduce((a, d) => a + Number(d.amount), 0);
              return (
                <div key={stage.key} className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: `3px solid ${stage.color}`, minHeight: 400 }}>
                  <div>
                    <div className="text-xs font-bold" style={{ color: stage.color }}>{stage.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>{stageDeals.length} • {fmtMoney(stageTotal)} ₸</div>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 overflow-y-auto" style={{ maxHeight: 600 }}>
                    {stageDeals.map(d => (
                      <div key={d.id} className="rounded-lg p-3" style={{ background: "var(--bg)", border: "1px solid var(--brd)" }}>
                        <div className="text-xs font-bold mb-1">{d.title}</div>
                        <div className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>{d.counterparty_name}</div>
                        <div className="text-sm font-bold mb-2" style={{ color: stage.color }}>{fmtMoney(d.amount)} ₸</div>
                        {d.expected_close_date && <div className="text-[10px] mb-2" style={{ color: "var(--t3)" }}>📅 До {d.expected_close_date}</div>}
                        <div className="flex flex-wrap gap-1">
                          {STAGES.filter(s => s.key !== d.stage).map(s => (
                            <button key={s.key} onClick={() => moveDealStage(d.id, s.key)}
                              className="text-[9px] px-2 py-0.5 rounded cursor-pointer border-none"
                              style={{ background: s.color + "15", color: s.color }}>
                              → {s.name}
                            </button>
                          ))}
                          <button onClick={() => deleteDeal(d.id)} className="text-[10px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ ЛИДЫ ═══ */}
      {tab === "leads" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>{leads.length} лидов</div>
            <button onClick={() => setShowLeadForm(!showLeadForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новый лид
            </button>
          </div>

          {showLeadForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Имя контакта *</label><input value={leadForm.name} onChange={e => setLeadForm({ ...leadForm, name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Компания</label><input value={leadForm.company} onChange={e => setLeadForm({ ...leadForm, company: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Источник</label><input value={leadForm.source} onChange={e => setLeadForm({ ...leadForm, source: e.target.value })} placeholder="Сайт, рекомендация..." /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Телефон</label><input value={leadForm.phone} onChange={e => setLeadForm({ ...leadForm, phone: e.target.value })} placeholder="+7 XXX XXX XX XX" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Email</label><input type="email" value={leadForm.email} onChange={e => setLeadForm({ ...leadForm, email: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Заметки</label><input value={leadForm.notes} onChange={e => setLeadForm({ ...leadForm, notes: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addLead} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowLeadForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Имя", "Компания", "Контакты", "Источник", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет лидов. Создайте первого.</td></tr>
                ) : leads.map(l => {
                  const status = LEAD_STATUSES.find(s => s.key === l.status) || LEAD_STATUSES[0];
                  return (
                    <tr key={l.id}>
                      <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{l.name}</td>
                      <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.company || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                        {l.phone && <div>📞 {l.phone}</div>}
                        {l.email && <div>📧 {l.email}</div>}
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{l.source || "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <select value={l.status} onChange={e => supabase.from("crm_leads").update({ status: e.target.value }).eq("id", l.id).then(load)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: status.color + "20", color: status.color, border: "none", padding: "2px 8px" }}>
                          {LEAD_STATUSES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                        </select>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteLead(l.id)} className="text-xs cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ЗАДАЧИ ═══ */}
      {tab === "tasks" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Открыто: {tasks.filter(t => t.status !== "done").length} • Готово: {tasks.filter(t => t.status === "done").length}
            </div>
            <button onClick={() => setShowTaskForm(!showTaskForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новая задача
            </button>
          </div>

          {showTaskForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Что нужно сделать</label>
                  <input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Перезвонить клиенту..." />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Приоритет</label>
                  <select value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}>
                    {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label>
                  <input value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Срок</label>
                  <input type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addTask} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowTaskForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет задач</div>
            ) : (
              <div className="flex flex-col gap-2">
                {tasks.map(t => {
                  const priority = PRIORITIES.find(p => p.key === t.priority) || PRIORITIES[1];
                  const isOverdue = t.status !== "done" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--bg)", border: "1px solid var(--brd)", borderLeft: `3px solid ${priority.color}` }}>
                      <input type="checkbox" checked={t.status === "done"} onChange={() => toggleTaskDone(t)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                      <div className="flex-1">
                        <div className="text-sm font-semibold" style={{ textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--t3)" : "var(--t1)" }}>{t.title}</div>
                        {t.description && <div className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>{t.description}</div>}
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: priority.color + "20", color: priority.color }}>{priority.name}</span>
                      <span className="text-[11px]" style={{ color: isOverdue ? "#EF4444" : "var(--t3)", fontWeight: isOverdue ? 700 : 400 }}>
                        {t.due_date} {isOverdue && "⚠"}
                      </span>
                      <button onClick={() => deleteTask(t.id)} className="text-sm cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ СОБЫТИЯ ═══ */}
      {tab === "events" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>{events.length} событий</div>
            <button onClick={() => setShowEventForm(!showEventForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Записать событие
            </button>
          </div>

          {showEventForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={eventForm.event_type} onChange={e => setEventForm({ ...eventForm, event_type: e.target.value })}>
                    {EVENT_TYPES.map(et => <option key={et.key} value={et.key}>{et.icon} {et.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Заголовок</label>
                  <input value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} placeholder="Звонок клиенту..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label>
                  <input value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Результат</label>
                  <input value={eventForm.outcome} onChange={e => setEventForm({ ...eventForm, outcome: e.target.value })} placeholder="Договорились о встрече..." />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addEvent} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Записать</button>
                <button onClick={() => setShowEventForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {events.length === 0 ? (
              <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>Нет событий</div>
            ) : events.map(e => {
              const et = EVENT_TYPES.find(t => t.key === e.event_type) || EVENT_TYPES[0];
              return (
                <div key={e.id} className="rounded-lg p-3 flex items-start gap-3" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <span className="text-xl">{et.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-bold">{e.title}</div>
                    {e.description && <div className="text-xs mt-1" style={{ color: "var(--t2)" }}>{e.description}</div>}
                    {e.outcome && <div className="text-xs mt-1 italic" style={{ color: "#10B981" }}>→ {e.outcome}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>{new Date(e.event_date).toLocaleDateString("ru-RU")}</div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>{new Date(e.event_date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <button onClick={() => deleteEvent(e.id)} className="text-sm cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ АНАЛИТИКА ═══ */}
      {tab === "analytics" && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-4">Сделки по этапам</div>
            <div className="flex flex-col gap-2">
              {STAGES.map(s => {
                const stageDeals = deals.filter(d => d.stage === s.key);
                const stageTotal = stageDeals.reduce((a, d) => a + Number(d.amount), 0);
                const maxTotal = Math.max(1, ...STAGES.map(st => deals.filter(d => d.stage === st.key).reduce((a, d) => a + Number(d.amount), 0)));
                const pct = (stageTotal / maxTotal) * 100;
                return (
                  <div key={s.key} className="flex items-center gap-3 py-2">
                    <span className="text-xs font-semibold" style={{ color: s.color, width: 130 }}>{s.name}</span>
                    <span className="text-[10px]" style={{ color: "var(--t3)", width: 60, textAlign: "right" }}>{stageDeals.length} шт.</span>
                    <div style={{ flex: 1, height: 14, background: "var(--bg)", borderRadius: 7, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: s.color, borderRadius: 7, transition: "all 0.3s" }} />
                    </div>
                    <span className="text-xs font-bold" style={{ minWidth: 130, textAlign: "right" }}>{fmtMoney(stageTotal)} ₸</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Конверсия лидов</div>
              <div className="flex flex-col gap-2">
                {LEAD_STATUSES.map(s => {
                  const count = leads.filter(l => l.status === s.key).length;
                  const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                  return (
                    <div key={s.key} className="flex items-center gap-3 py-1">
                      <span className="text-xs" style={{ color: s.color, width: 130 }}>{s.name}</span>
                      <div style={{ flex: 1, height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: s.color, borderRadius: 3 }} />
                      </div>
                      <span className="text-xs font-bold" style={{ minWidth: 50, textAlign: "right" }}>{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Продуктивность</div>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Всего сделок</span><span className="text-xs font-bold">{deals.length}</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Win rate</span><span className="text-xs font-bold" style={{ color: "#10B981" }}>{deals.length > 0 ? Math.round((deals.filter(d => d.stage === "won").length / deals.length) * 100) : 0}%</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Средний чек</span><span className="text-xs font-bold">{fmtMoney(deals.length > 0 ? Math.round(deals.reduce((a, d) => a + Number(d.amount), 0) / deals.length) : 0)} ₸</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Задач закрыто</span><span className="text-xs font-bold">{tasks.filter(t => t.status === "done").length} / {tasks.length}</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Событий за месяц</span><span className="text-xs font-bold">{events.filter(e => new Date(e.event_date) > new Date(Date.now() - 30 * 86400000)).length}</span></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
