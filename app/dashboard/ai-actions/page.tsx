"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

interface ActionLog {
  id: string;
  action_type: string;
  user_request: string;
  proposed_action: any;
  triggered_from_module: string | null;
  status: string;
  result_summary: string | null;
  error_message: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  proposed_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
}

const STATUS_STYLES: Record<string, { color: string; label: string; icon: string }> = {
  proposed: { color: "#3B82F6", label: "Предложено", icon: "💭" },
  confirmed: { color: "#F59E0B", label: "Подтверждено", icon: "✓" },
  executed: { color: "#10B981", label: "Выполнено", icon: "✅" },
  failed: { color: "#EF4444", label: "Ошибка", icon: "❌" },
  rejected: { color: "#6B7280", label: "Отклонено", icon: "✗" },
  cancelled: { color: "#6B7280", label: "Отменено", icon: "○" },
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  create_journal_entry: "📒 Бух. проводка",
  create_invoice: "🧾 Создание счёта",
  create_payment: "💸 Платёж",
  create_counterparty: "👥 Контрагент",
  create_employee_payment: "💰 Выплата ЗП",
  mark_paid: "✓ Отметка оплаты",
  dismiss_notification: "🔔 Скрыть уведомл.",
  run_depreciation: "🏗 Амортизация",
  create_recurring_payment: "🔄 Регул. платёж",
  other: "📋 Прочее",
};

type FilterTab = "all" | "executed" | "rejected" | "failed";

export default function AIActionsLogPage() {
  const supabase = createClient();
  const router = useRouter();
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("ai_actions_log")
      .select("*")
      .eq("user_id", user.id)
      .order("proposed_at", { ascending: false })
      .limit(200);
    setActions((data as ActionLog[]) || []);
    setLoading(false);
  }

  let filtered = actions;
  if (filter === "executed") filtered = filtered.filter(a => a.status === "executed");
  else if (filter === "rejected") filtered = filtered.filter(a => a.status === "rejected" || a.status === "cancelled");
  else if (filter === "failed") filtered = filtered.filter(a => a.status === "failed");

  // Stats
  const total = actions.length;
  const executedCount = actions.filter(a => a.status === "executed").length;
  const rejectedCount = actions.filter(a => a.status === "rejected" || a.status === "cancelled").length;
  const failedCount = actions.filter(a => a.status === "failed").length;

  // Группировка по типам действий
  const byType: Record<string, number> = {};
  actions.forEach(a => {
    if (a.status === "executed") byType[a.action_type] = (byType[a.action_type] || 0) + 1;
  });

  if (loading) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Полный аудит-журнал действий, выполненных Жанарой по вашему подтверждению. Каждая запись хранит исходный запрос пользователя, предложенное действие, результат и время выполнения.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Всего предложено</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{total}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✅ Выполнено</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{executedCount}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6B7280" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✗ Отклонено</div>
          <div className="text-xl font-bold" style={{ color: "#6B7280" }}>{rejectedCount}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>❌ Ошибок</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{failedCount}</div>
        </div>
      </div>

      {/* Топ типов */}
      {Object.keys(byType).length > 0 && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📊 Чаще всего Жанара делает</div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, count]) => (
              <div key={type} className="rounded-lg px-3 py-1.5" style={{ background: "var(--bg)", border: "1px solid var(--brd)" }}>
                <span className="text-[11px]">{ACTION_TYPE_LABELS[type] || type}</span>
                <span className="text-[12px] font-bold ml-2" style={{ color: "#A855F7" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          ["all", `Все (${total})`],
          ["executed", `✅ Выполненные (${executedCount})`],
          ["rejected", `✗ Отклонённые (${rejectedCount})`],
          ["failed", `❌ Ошибки (${failedCount})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: filter === key ? "var(--accent)" : "transparent", color: filter === key ? "#fff" : "var(--t3)", border: filter === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Список */}
      {filtered.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✦</div>
          <div className="text-sm font-semibold mb-1">Журнал пуст</div>
          <div className="text-[11px]" style={{ color: "var(--t3)" }}>
            Когда вы попросите Жанару что-то выполнить — здесь появятся записи.
          </div>
        </div>
      ) : (
        <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          {filtered.map((a, i) => {
            const status = STATUS_STYLES[a.status] || STATUS_STYLES.proposed;
            const typeLabel = ACTION_TYPE_LABELS[a.action_type] || a.action_type;
            const isExpanded = expanded === a.id;

            return (
              <div
                key={a.id}
                onClick={() => setExpanded(isExpanded ? null : a.id)}
                style={{
                  padding: "14px 18px",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--brd)" : "none",
                  cursor: "pointer",
                  borderLeft: `3px solid ${status.color}`,
                }}>
                <div className="flex items-start gap-3">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: status.color + "20", color: status.color }}>
                        {status.icon} {status.label}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: "var(--bg)", color: "var(--t3)" }}>
                        {typeLabel}
                      </span>
                      {a.triggered_from_module && (
                        <span className="text-[9px]" style={{ color: "var(--t3)" }}>
                          из /dashboard/{a.triggered_from_module}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] mb-1" style={{ color: "var(--t3)" }}>
                      Запрос пользователя:
                    </div>
                    <div className="text-[12px] mb-2" style={{ color: "var(--t1)" }}>
                      «{a.user_request}»
                    </div>

                    {a.proposed_action?.description && (
                      <div className="text-[11px]" style={{ color: "var(--t2)" }}>
                        <span style={{ color: "#A855F7", fontWeight: 700 }}>✦ Жанара:</span> {a.proposed_action.description}
                      </div>
                    )}

                    {a.result_summary && (
                      <div className="text-[11px] mt-1.5" style={{ color: a.status === "executed" ? "#10B981" : "#EF4444" }}>
                        → {a.result_summary}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-[10px] mt-2" style={{ color: "var(--t3)" }}>
                      <span>📅 {new Date(a.proposed_at).toLocaleString("ru-RU")}</span>
                      {a.executed_at && <span>✓ Выполнено: {new Date(a.executed_at).toLocaleString("ru-RU")}</span>}
                    </div>

                    {isExpanded && (
                      <div className="rounded-lg p-2 mt-3" style={{ background: "var(--bg)" }}>
                        <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>Полные данные:</div>
                        <pre className="text-[10px]" style={{ color: "var(--t2)", whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 300 }}>
{JSON.stringify(a.proposed_action, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--t3)" }}>
                    {isExpanded ? "▴" : "▾"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Безопасность:</b> Жанара никогда не выполняет действия автоматически — каждое требует вашего подтверждения.<br/>
        💡 <b>Аудит:</b> весь журнал хранится в БД с привязкой к пользователю — для проверки в любой момент.<br/>
        💡 <b>Действия с высоким риском</b> (большие суммы, амортизация) требуют двойного подтверждения.
      </div>
    </div>
  );
}
