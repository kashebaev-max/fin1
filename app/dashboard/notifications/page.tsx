"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { generateRuleBasedNotifications } from "@/lib/notification-engine";

interface Notification {
  id: string;
  category: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  message: string;
  action_label: string | null;
  action_url: string | null;
  related_module: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  source: string;
  created_at: string;
  read_at: string | null;
}

const SEVERITY_STYLES: Record<string, { color: string; icon: string; label: string }> = {
  critical: { color: "#EF4444", icon: "🔴", label: "Критично" },
  warning: { color: "#F59E0B", icon: "🟡", label: "Внимание" },
  info: { color: "#3B82F6", icon: "🔵", label: "К сведению" },
  success: { color: "#10B981", icon: "🟢", label: "Успех" },
};

const CATEGORY_NAMES: Record<string, string> = {
  tax_deadline: "📅 Налоги и ФНО",
  cashflow: "💰 Денежный поток",
  overdue_receivable: "⏰ Просрочки клиентов",
  overdue_payable: "⚠️ Наши просрочки",
  low_stock: "📉 Низкие остатки",
  expiring_batch: "⏳ Истекающие партии",
  expired_batch: "❌ Просроченные партии",
  unposted_doc: "📄 Непроведённые документы",
  salary_due: "💸 Зарплата",
  recommendation: "💡 Рекомендация",
  anomaly: "🔍 Аномалия",
  opportunity: "✨ Возможность",
  compliance_risk: "⚖ Риск нарушения",
  period_close: "🔒 Закрытие периода",
  system_event: "🔔 Система",
  general: "📋 Общее",
};

type FilterTab = "all" | "unread" | "critical" | "warning";

export default function NotificationsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showDismissed, setShowDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { init(); }, [showDismissed]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    await load(user.id);
    setLoading(false);
  }

  async function load(uid: string) {
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!showDismissed) query = query.eq("is_dismissed", false);
    const { data } = await query;
    setNotifications((data as Notification[]) || []);
  }

  async function refreshNotifications() {
    if (!userId) return;
    setRefreshing(true);
    try {
      const { created } = await generateRuleBasedNotifications(supabase, userId);
      await load(userId);
      setMsg(created > 0 ? `✅ Создано ${created} новых уведомлений` : "ℹ Новых уведомлений нет");
    } catch (err: any) {
      setMsg(`❌ Ошибка: ${err.message}`);
    } finally {
      setRefreshing(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  async function markAsRead(id: string) {
    await supabase.from("notifications").update({
      is_read: true,
      read_at: new Date().toISOString(),
    }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function dismiss(id: string) {
    await supabase.from("notifications").update({ is_dismissed: true }).eq("id", id);
    if (showDismissed) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_dismissed: true } : n));
    } else {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }
  }

  async function restore(id: string) {
    await supabase.from("notifications").update({ is_dismissed: false }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_dismissed: false } : n));
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read && !n.is_dismissed).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({
      is_read: true,
      read_at: new Date().toISOString(),
    }).in("id", unreadIds);
    setNotifications(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, is_read: true } : n));
    setMsg("✅ Все отмечены прочитанными");
    setTimeout(() => setMsg(""), 2000);
  }

  // Фильтрация
  let filtered = notifications;
  if (filter === "unread") filtered = filtered.filter(n => !n.is_read && !n.is_dismissed);
  else if (filter === "critical") filtered = filtered.filter(n => n.severity === "critical" && !n.is_dismissed);
  else if (filter === "warning") filtered = filtered.filter(n => n.severity === "warning" && !n.is_dismissed);
  if (categoryFilter !== "all") filtered = filtered.filter(n => n.category === categoryFilter);

  // Категории, встречающиеся в уведомлениях (для дропдауна)
  const usedCategories = Array.from(new Set(notifications.map(n => n.category)));

  // Stats
  const total = notifications.filter(n => !n.is_dismissed).length;
  const unread = notifications.filter(n => !n.is_read && !n.is_dismissed).length;
  const critical = notifications.filter(n => n.severity === "critical" && !n.is_dismissed).length;
  const warnings = notifications.filter(n => n.severity === "warning" && !n.is_dismissed).length;

  if (loading) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : msg.startsWith("ℹ") ? "#3B82F620" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : msg.startsWith("ℹ") ? "#3B82F6" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Все уведомления и напоминания. Жанара автоматически проверяет состояние бизнеса раз в час и создаёт уведомления о важных событиях.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Всего активных</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{total}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #3B82F6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>👁 Непрочитанных</div>
          <div className="text-xl font-bold" style={{ color: "#3B82F6" }}>{unread}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🔴 Критичных</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{critical}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🟡 Предупреждений</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{warnings}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={refreshNotifications} disabled={refreshing} className="px-3 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)", opacity: refreshing ? 0.5 : 1 }}>
          {refreshing ? "🔄 Проверяю..." : "🔄 Запустить проверку сейчас"}
        </button>
        {unread > 0 && <button onClick={markAllRead} className="px-3 py-2 rounded-lg text-xs cursor-pointer border-none" style={{ background: "#10B98120", color: "#10B981" }}>✓ Отметить все прочитанными</button>}
        <label className="flex items-center gap-2 cursor-pointer text-xs ml-auto">
          <input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
          <span style={{ color: "var(--t3)" }}>Показать скрытые</span>
        </label>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap items-center">
        {([
          ["all", `Все (${total})`],
          ["unread", `Непрочитанные (${unread})`],
          ["critical", `🔴 Критичные (${critical})`],
          ["warning", `🟡 Внимание (${warnings})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: filter === key ? "var(--accent)" : "transparent", color: filter === key ? "#fff" : "var(--t3)", border: filter === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="ml-auto" style={{ width: 220, fontSize: 11 }}>
          <option value="all">Все категории</option>
          {usedCategories.map(c => <option key={c} value={c}>{CATEGORY_NAMES[c] || c}</option>)}
        </select>
      </div>

      {/* Список */}
      {filtered.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <div className="text-sm font-semibold mb-1">Нет уведомлений</div>
          <div className="text-[11px]" style={{ color: "var(--t3)" }}>
            {filter === "all" && "Жанара не нашла важных событий, требующих внимания."}
            {filter === "unread" && "Все уведомления прочитаны."}
            {filter === "critical" && "Критичных проблем нет 🎉"}
            {filter === "warning" && "Предупреждений нет."}
          </div>
        </div>
      ) : (
        <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          {filtered.map((n, i) => {
            const sev = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markAsRead(n.id)}
                style={{
                  padding: "16px 20px",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--brd)" : "none",
                  background: n.is_read ? "transparent" : sev.color + "08",
                  cursor: "pointer",
                  borderLeft: `3px solid ${n.is_dismissed ? "var(--brd)" : (n.is_read ? "transparent" : sev.color)}`,
                  opacity: n.is_dismissed ? 0.5 : 1,
                }}>
                <div className="flex items-start gap-3">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span style={{ fontSize: 13, fontWeight: 700, color: sev.color }}>{n.title}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: sev.color + "20", color: sev.color }}>
                        {sev.icon} {sev.label}
                      </span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", color: "var(--t3)" }}>
                        {CATEGORY_NAMES[n.category] || n.category}
                      </span>
                      {n.source === "janara" && (
                        <span className="text-[9px] font-bold" style={{ color: "#A855F7" }}>✦ ЖАНАРА</span>
                      )}
                      {!n.is_read && !n.is_dismissed && <span style={{ width: 6, height: 6, borderRadius: 3, background: sev.color }} />}
                    </div>
                    <div className="text-[12px] mb-2" style={{ color: "var(--t2)", lineHeight: 1.5 }}>{n.message}</div>
                    <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--t3)" }}>
                      <span>{new Date(n.created_at).toLocaleString("ru-RU")}</span>
                      {n.is_read && n.read_at && <span>✓ прочитано {new Date(n.read_at).toLocaleString("ru-RU")}</span>}
                      {n.is_dismissed && <span style={{ color: "#EF4444" }}>🗑 скрыто</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    {n.action_url && n.action_label && !n.is_dismissed && (
                      <button
                        onClick={e => { e.stopPropagation(); markAsRead(n.id); router.push(n.action_url!); }}
                        className="text-[11px] font-bold cursor-pointer border-none rounded"
                        style={{ background: sev.color, color: "#fff", padding: "5px 10px" }}>
                        {n.action_label} →
                      </button>
                    )}
                    {!n.is_dismissed ? (
                      <button
                        onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                        className="text-[10px] cursor-pointer border-none bg-transparent"
                        style={{ color: "var(--t3)" }}>
                        🗑 Скрыть
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); restore(n.id); }}
                        className="text-[10px] cursor-pointer border-none bg-transparent"
                        style={{ color: "var(--accent)" }}>
                        ↻ Вернуть
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 Уведомления генерируются автоматически каждый час. Для немедленной проверки нажмите «🔄 Запустить проверку сейчас».<br/>
        💡 Скрытые уведомления не показываются в колокольчике, но остаются в истории — можно вернуть.<br/>
        💡 Каждое уведомление имеет уникальный ключ дедупликации — повторные уведомления о той же проблеме не создаются.
      </div>
    </div>
  );
}
