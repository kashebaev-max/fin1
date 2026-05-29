"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "approvals" | "routes" | "create";

const DOC_TYPE_NAMES: Record<string, string> = {
  invoice: "Счёт", sf: "Счёт-фактура", waybill: "Накладная", act: "Акт выполненных работ",
  contract: "Договор", pko: "ПКО", rko: "РКО", pp: "Платёжное поручение",
  receipt: "Поступление", advance: "Авансовый отчёт", power: "Доверенность",
  payroll: "Ведомость ЗП", ttn: "ТТН",
};

interface RouteStep {
  step_number: number;
  step_name: string;
  approver_name: string;
  approver_role: string;
  is_required: boolean;
}

export default function WorkflowPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("approvals");
  const [routes, setRoutes] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Route form
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any>(null);
  const [routeForm, setRouteForm] = useState({
    route_name: "", description: "",
    doc_types: [] as string[],
    amount_threshold: "0",
  });
  const [steps, setSteps] = useState<RouteStep[]>([]);

  // Create approval
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ document_id: "", route_id: "", initiator_name: "", notes: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [r, a, d, p] = await Promise.all([
      supabase.from("workflow_routes").select("*").eq("user_id", user.id),
      supabase.from("document_approvals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("documents").select("*").eq("user_id", user.id).order("doc_date", { ascending: false }).limit(100),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
    ]);
    setRoutes(r.data || []);
    setApprovals(a.data || []);
    setDocs(d.data || []);
    setProfile(p.data);
  }

  // ═══ МАРШРУТЫ ═══
  function startCreateRoute() {
    setEditingRoute(null);
    setRouteForm({ route_name: "", description: "", doc_types: [], amount_threshold: "0" });
    setSteps([{ step_number: 1, step_name: "Согласование", approver_name: "", approver_role: "Менеджер", is_required: true }]);
    setShowRouteForm(true);
  }

  function startEditRoute(r: any) {
    setEditingRoute(r);
    setRouteForm({
      route_name: r.route_name,
      description: r.description || "",
      doc_types: r.doc_types || [],
      amount_threshold: String(r.amount_threshold || 0),
    });
    setSteps(r.steps || []);
    setShowRouteForm(true);
  }

  function addStep() {
    setSteps([...steps, {
      step_number: steps.length + 1,
      step_name: "Шаг " + (steps.length + 1),
      approver_name: "", approver_role: "",
      is_required: true,
    }]);
  }

  function updStep(i: number, field: string, value: any) {
    const n = [...steps];
    n[i] = { ...n[i], [field]: value };
    setSteps(n);
  }

  function removeStep(i: number) {
    const n = steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_number: idx + 1 }));
    setSteps(n);
  }

  function toggleDocType(dt: string) {
    if (routeForm.doc_types.includes(dt)) {
      setRouteForm({ ...routeForm, doc_types: routeForm.doc_types.filter(x => x !== dt) });
    } else {
      setRouteForm({ ...routeForm, doc_types: [...routeForm.doc_types, dt] });
    }
  }

  async function saveRoute() {
    if (!routeForm.route_name) { setMsg("❌ Укажите название маршрута"); setTimeout(() => setMsg(""), 3000); return; }
    if (steps.length === 0) { setMsg("❌ Добавьте хотя бы один шаг"); setTimeout(() => setMsg(""), 3000); return; }

    const data = {
      user_id: userId,
      route_name: routeForm.route_name,
      description: routeForm.description,
      doc_types: routeForm.doc_types,
      amount_threshold: Number(routeForm.amount_threshold),
      steps,
      is_active: true,
    };

    if (editingRoute) {
      await supabase.from("workflow_routes").update(data).eq("id", editingRoute.id);
    } else {
      await supabase.from("workflow_routes").insert(data);
    }
    setMsg(`✅ Маршрут «${routeForm.route_name}» сохранён`);
    setShowRouteForm(false);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteRoute(id: string) {
    if (!confirm("Удалить маршрут?")) return;
    await supabase.from("workflow_routes").delete().eq("id", id);
    load();
  }

  // ═══ СОГЛАСОВАНИЯ ═══
  async function startApproval() {
    if (!createForm.document_id || !createForm.route_id) { setMsg("❌ Выберите документ и маршрут"); setTimeout(() => setMsg(""), 3000); return; }
    const doc = docs.find(d => d.id === createForm.document_id);
    const route = routes.find(r => r.id === createForm.route_id);
    if (!doc || !route) return;

    await supabase.from("document_approvals").insert({
      user_id: userId,
      document_id: doc.id,
      document_number: doc.doc_number,
      document_type: doc.doc_type,
      document_amount: doc.total_with_nds,
      route_id: route.id,
      route_name: route.route_name,
      total_steps: route.steps.length,
      current_step: 1,
      status: "in_progress",
      current_assignee: route.steps[0]?.approver_name || "—",
      initiator_name: createForm.initiator_name || profile?.full_name,
      notes: createForm.notes,
      steps_log: [{
        step: 0,
        action: "started",
        date: new Date().toISOString(),
        author: createForm.initiator_name || profile?.full_name,
        comment: "Документ отправлен на согласование",
      }],
    });
    setMsg(`✅ Документ ${doc.doc_number} отправлен на согласование`);
    setShowCreateForm(false);
    setCreateForm({ document_id: "", route_id: "", initiator_name: "", notes: "" });
    setTab("approvals");
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function approveStep(approval: any, comment = "") {
    const route = routes.find(r => r.id === approval.route_id);
    if (!route) return;

    const newStep = approval.current_step + 1;
    const isLast = newStep > approval.total_steps;
    const log = approval.steps_log || [];
    log.push({
      step: approval.current_step,
      action: "approved",
      date: new Date().toISOString(),
      author: route.steps[approval.current_step - 1]?.approver_name || "Согласующий",
      comment,
    });

    const update: any = {
      current_step: isLast ? approval.total_steps : newStep,
      status: isLast ? "approved" : "in_progress",
      steps_log: log,
      current_assignee: isLast ? null : (route.steps[newStep - 1]?.approver_name || "—"),
    };
    if (isLast) update.completed_at = new Date().toISOString();

    await supabase.from("document_approvals").update(update).eq("id", approval.id);
    setMsg(isLast ? "✅ Документ полностью согласован" : `✅ Шаг ${approval.current_step} согласован, передан дальше`);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function rejectApproval(approval: any, comment = "") {
    const log = approval.steps_log || [];
    log.push({
      step: approval.current_step,
      action: "rejected",
      date: new Date().toISOString(),
      author: "Согласующий",
      comment: comment || "Отклонено",
    });

    await supabase.from("document_approvals").update({
      status: "rejected",
      steps_log: log,
      completed_at: new Date().toISOString(),
    }).eq("id", approval.id);
    setMsg("Документ отклонён");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteApproval(id: string) {
    if (!confirm("Удалить согласование?")) return;
    await supabase.from("document_approvals").delete().eq("id", id);
    load();
  }

  // KPI
  const pending = approvals.filter(a => a.status === "in_progress" || a.status === "pending").length;
  const approved = approvals.filter(a => a.status === "approved").length;
  const rejected = approvals.filter(a => a.status === "rejected").length;
  const todayCount = approvals.filter(a => a.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⏳ В работе</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{pending}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Ожидают согласования</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✅ Согласовано</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{approved}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>❌ Отклонено</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{rejected}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Не прошли</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📅 За сегодня</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{todayCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Запущено</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        {([["approvals", "📋 Согласования"], ["routes", "🛤 Маршруты"], ["create", "+ Отправить документ"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ СОГЛАСОВАНИЯ ═══ */}
      {tab === "approvals" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          {approvals.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>
              Нет согласований. Перейдите в «Отправить документ», чтобы запустить процесс.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {approvals.map(a => {
                const route = routes.find(r => r.id === a.route_id);
                const statusColors: Record<string, string> = { in_progress: "#F59E0B", approved: "#10B981", rejected: "#EF4444", pending: "#6B7280", cancelled: "#A855F7" };
                const statusNames: Record<string, string> = { in_progress: "В работе", approved: "Согласовано", rejected: "Отклонено", pending: "Ожидает", cancelled: "Отменено" };
                const progress = a.status === "approved" ? 100 : a.status === "rejected" ? 0 : Math.round(((a.current_step - 1) / a.total_steps) * 100);
                return (
                  <div key={a.id} className="rounded-lg p-4" style={{ background: "var(--bg)", border: "1px solid var(--brd)", borderLeft: `3px solid ${statusColors[a.status]}` }}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{a.document_number}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: statusColors[a.status] + "20", color: statusColors[a.status] }}>
                            {statusNames[a.status]}
                          </span>
                          <span className="text-[11px]" style={{ color: "var(--t3)" }}>{DOC_TYPE_NAMES[a.document_type] || a.document_type}</span>
                        </div>
                        <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>
                          Маршрут: <b>{a.route_name}</b> • Сумма: <b>{fmtMoney(Number(a.document_amount))} ₸</b> • Инициатор: {a.initiator_name}
                        </div>
                      </div>
                      <button onClick={() => deleteApproval(a.id)} className="text-sm cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </div>

                    {/* Шаги */}
                    <div className="flex items-center gap-2 my-3">
                      {(route?.steps || []).map((s: any, i: number) => {
                        const isPast = i + 1 < a.current_step;
                        const isCurrent = i + 1 === a.current_step && a.status === "in_progress";
                        const isApproved = a.status === "approved";
                        const isFailed = a.status === "rejected" && i + 1 === a.current_step;
                        const c = isFailed ? "#EF4444" : (isPast || isApproved) ? "#10B981" : isCurrent ? "#F59E0B" : "#6B7280";
                        return (
                          <div key={i} className="flex items-center gap-1 flex-1">
                            <div className="rounded-full flex items-center justify-center text-[10px] font-bold" style={{ width: 22, height: 22, background: c, color: "#fff", flexShrink: 0 }}>
                              {isFailed ? "✗" : (isPast || isApproved) ? "✓" : i + 1}
                            </div>
                            <div className="flex-1">
                              <div className="text-[11px] font-semibold">{s.step_name}</div>
                              <div className="text-[9px]" style={{ color: "var(--t3)" }}>{s.approver_name || s.approver_role}</div>
                            </div>
                            {i < (route?.steps?.length || 0) - 1 && <div style={{ height: 1, background: "var(--brd)", flex: 1 }} />}
                          </div>
                        );
                      })}
                    </div>

                    {/* Прогресс-бар */}
                    <div style={{ width: "100%", height: 4, background: "var(--brd)", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
                      <div style={{ width: `${progress}%`, height: "100%", background: statusColors[a.status], borderRadius: 2, transition: "all 0.3s" }} />
                    </div>

                    {/* Кнопки */}
                    {a.status === "in_progress" && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => approveStep(a)} className="text-[11px] px-3 py-1.5 rounded-lg text-white font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>
                          ✓ Согласовать шаг {a.current_step}
                        </button>
                        <button onClick={() => rejectApproval(a)} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid #EF4444", color: "#EF4444" }}>
                          ✗ Отклонить
                        </button>
                      </div>
                    )}

                    {/* История */}
                    {(a.steps_log || []).length > 0 && (
                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
                        <div className="text-[10px] font-bold mb-1" style={{ color: "var(--t3)" }}>📜 История:</div>
                        <div className="flex flex-col gap-1">
                          {(a.steps_log || []).map((l: any, i: number) => (
                            <div key={i} className="text-[10px]" style={{ color: "var(--t3)" }}>
                              {new Date(l.date).toLocaleDateString("ru-RU")} {new Date(l.date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} • <b style={{ color: l.action === "approved" ? "#10B981" : l.action === "rejected" ? "#EF4444" : "var(--t1)" }}>{l.action === "started" ? "Запущено" : l.action === "approved" ? `Согласовано (шаг ${l.step})` : l.action === "rejected" ? `Отклонено (шаг ${l.step})` : l.action}</b> • {l.author}{l.comment ? ` — ${l.comment}` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ МАРШРУТЫ ═══ */}
      {tab === "routes" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Маршруты согласования — последовательность шагов, через которые проходит документ перед утверждением
            </div>
            <button onClick={startCreateRoute} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новый маршрут
            </button>
          </div>

          {showRouteForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{editingRoute ? "Редактирование маршрута" : "Новый маршрут согласования"}</div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название маршрута</label><input value={routeForm.route_name} onChange={e => setRouteForm({ ...routeForm, route_name: e.target.value })} placeholder="Согласование договоров" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма свыше (₸)</label><input type="number" value={routeForm.amount_threshold} onChange={e => setRouteForm({ ...routeForm, amount_threshold: e.target.value })} placeholder="0 = для всех сумм" /></div>
              </div>
              <div className="mb-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={routeForm.description} onChange={e => setRouteForm({ ...routeForm, description: e.target.value })} /></div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t3)" }}>📄 ТИПЫ ДОКУМЕНТОВ:</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(DOC_TYPE_NAMES).map(([k, v]) => (
                  <button key={k} onClick={() => toggleDocType(k)}
                    className="text-[11px] px-3 py-1 rounded-lg cursor-pointer"
                    style={{
                      background: routeForm.doc_types.includes(k) ? "var(--accent)" : "transparent",
                      color: routeForm.doc_types.includes(k) ? "#fff" : "var(--t3)",
                      border: routeForm.doc_types.includes(k) ? "none" : "1px solid var(--brd)",
                    }}>
                    {v}
                  </button>
                ))}
              </div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t3)" }}>🔢 ШАГИ СОГЛАСОВАНИЯ:</div>
              {steps.map((s, i) => (
                <div key={i} className="rounded-lg p-3 mb-2 flex gap-2 items-end" style={{ background: "var(--bg)" }}>
                  <div className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ width: 28, height: 28, background: "var(--accent)", color: "#fff" }}>{i + 1}</div>
                  <div className="flex-1"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название шага</label><input value={s.step_name} onChange={e => updStep(i, "step_name", e.target.value)} placeholder="Согласование с бухгалтером" /></div>
                  <div className="flex-1"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО согласующего</label><input value={s.approver_name} onChange={e => updStep(i, "approver_name", e.target.value)} /></div>
                  <div className="flex-1"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Должность / Роль</label><input value={s.approver_role} onChange={e => updStep(i, "approver_role", e.target.value)} placeholder="Гл. бухгалтер" /></div>
                  <button onClick={() => removeStep(i)} className="text-sm cursor-pointer border-none bg-transparent pb-2" style={{ color: "#EF4444" }}>×</button>
                </div>
              ))}
              <button onClick={addStep} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer mb-4" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить шаг</button>

              <div className="flex gap-2">
                <button onClick={saveRoute} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => setShowRouteForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {routes.length === 0 ? (
              <div className="col-span-2 rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-3xl mb-2">🛤</div>
                <div className="text-sm font-bold mb-2">Нет маршрутов</div>
                <div className="text-xs" style={{ color: "var(--t3)" }}>Создайте первый маршрут согласования</div>
              </div>
            ) : routes.map(r => (
              <div key={r.id} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-bold">{r.route_name}</div>
                  <div className="flex gap-2">
                    <button onClick={() => startEditRoute(r)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>✏</button>
                    <button onClick={() => deleteRoute(r.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                  </div>
                </div>
                {r.description && <div className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>{r.description}</div>}

                <div className="flex flex-wrap gap-1 mb-2">
                  {(r.doc_types || []).map((dt: string) => (
                    <span key={dt} className="text-[9px] px-2 py-0.5 rounded" style={{ background: "var(--bg)", color: "var(--t3)" }}>
                      {DOC_TYPE_NAMES[dt] || dt}
                    </span>
                  ))}
                  {Number(r.amount_threshold) > 0 && (
                    <span className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>
                      от {fmtMoney(Number(r.amount_threshold))} ₸
                    </span>
                  )}
                </div>

                <div className="text-[10px] font-bold mb-1" style={{ color: "var(--t3)" }}>{(r.steps || []).length} шагов:</div>
                <div className="flex flex-col gap-1">
                  {(r.steps || []).map((s: any, i: number) => (
                    <div key={i} className="text-[11px] flex items-center gap-2">
                      <div className="rounded-full flex items-center justify-center text-[9px] font-bold" style={{ width: 18, height: 18, background: "var(--accent)", color: "#fff", flexShrink: 0 }}>{i + 1}</div>
                      <span><b>{s.step_name}</b> — {s.approver_name || s.approver_role}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══ ОТПРАВИТЬ НА СОГЛАСОВАНИЕ ═══ */}
      {tab === "create" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Отправить документ на согласование</div>

          {routes.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-sm font-bold mb-2">Сначала создайте маршрут</div>
              <div className="text-xs mb-4" style={{ color: "var(--t3)" }}>Перейдите на вкладку «Маршруты» и создайте маршрут согласования</div>
              <button onClick={() => setTab("routes")} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
                Создать маршрут
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Документ</label>
                  <select value={createForm.document_id} onChange={e => setCreateForm({ ...createForm, document_id: e.target.value })}>
                    <option value="">— Выбрать документ —</option>
                    {docs.map(d => <option key={d.id} value={d.id}>{d.doc_number} • {DOC_TYPE_NAMES[d.doc_type] || d.doc_type} • {d.counterparty_name} • {fmtMoney(d.total_with_nds)} ₸</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Маршрут согласования</label>
                  <select value={createForm.route_id} onChange={e => setCreateForm({ ...createForm, route_id: e.target.value })}>
                    <option value="">— Выбрать маршрут —</option>
                    {routes.map(r => <option key={r.id} value={r.id}>{r.route_name} ({(r.steps || []).length} шагов)</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Инициатор</label><input value={createForm.initiator_name} onChange={e => setCreateForm({ ...createForm, initiator_name: e.target.value })} placeholder={profile?.full_name || "Ваше ФИО"} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Комментарий</label><input value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="Прошу согласовать..." /></div>
              </div>

              <div className="flex gap-2">
                <button onClick={startApproval} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>
                  📤 Отправить на согласование
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
