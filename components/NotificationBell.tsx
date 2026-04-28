"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { generateRuleBasedNotifications, shouldRunCheck } from "@/lib/notification-engine";

interface Notification {
  id: string;
  category: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  message: string;
  action_label: string | null;
  action_url: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  source: string;
  created_at: string;
}

const SEVERITY_STYLES: Record<string, { color: string; icon: string; bg: string }> = {
  critical: { color: "#EF4444", icon: "🔴", bg: "#EF444415" },
  warning: { color: "#F59E0B", icon: "🟡", bg: "#F59E0B15" },
  info: { color: "#3B82F6", icon: "🔵", bg: "#3B82F615" },
  success: { color: "#10B981", icon: "🟢", bg: "#10B98115" },
};

const CATEGORY_ICONS: Record<string, string> = {
  tax_deadline: "📅",
  cashflow: "💰",
  overdue_receivable: "⏰",
  overdue_payable: "⚠️",
  low_stock: "📉",
  expiring_batch: "⏳",
  expired_batch: "❌",
  unposted_doc: "📄",
  salary_due: "💸",
  recommendation: "💡",
  anomaly: "🔍",
  opportunity: "✨",
  compliance_risk: "⚖",
  period_close: "🔒",
  system_event: "🔔",
  general: "📋",
};

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин. назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн. назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

export default function NotificationBell() {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [checking, setChecking] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    init();
  }, []);

  // Закрытие при клике вне
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    await loadNotifications(user.id);

    // Автоматическая проверка раз в час
    const should = await shouldRunCheck(supabase, user.id);
    if (should) {
      setChecking(true);
      try {
        await generateRuleBasedNotifications(supabase, user.id);
        await loadNotifications(user.id);
      } catch (err) {
        console.error("Notification check error:", err);
      } finally {
        setChecking(false);
      }
    }
  }

  async function loadNotifications(uid: string) {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .eq("is_dismissed", false)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as Notification[]) || []);
  }

  async function manualRefresh() {
    if (!userId || checking) return;
    setChecking(true);
    try {
      await generateRuleBasedNotifications(supabase, userId);
      await loadNotifications(userId);
    } finally {
      setChecking(false);
    }
  }

  async function markAsRead(id: string) {
    await supabase.from("notifications").update({
      is_read: true,
      read_at: new Date().toISOString(),
    }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({
      is_read: true,
      read_at: new Date().toISOString(),
    }).in("id", unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function dismiss(id: string) {
    await supabase.from("notifications").update({ is_dismissed: true }).eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  async function dismissAll() {
    if (!confirm("Скрыть все уведомления?")) return;
    const ids = notifications.map(n => n.id);
    await supabase.from("notifications").update({ is_dismissed: true }).in("id", ids);
    setNotifications([]);
  }

  function handleAction(n: Notification) {
    markAsRead(n.id);
    if (n.action_url) {
      router.push(n.action_url);
      setOpen(false);
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const criticalCount = notifications.filter(n => !n.is_read && n.severity === "critical").length;
  const warningCount = notifications.filter(n => !n.is_read && n.severity === "warning").length;

  // Цвет значка зависит от важности самого критичного
  const indicatorColor = criticalCount > 0 ? "#EF4444" : warningCount > 0 ? "#F59E0B" : "#3B82F6";

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Кнопка-колокольчик */}
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer border-none flex items-center justify-center transition-all"
        style={{
          width: 36,
          height: 36,
          background: open ? "var(--accent-dim)" : "var(--card)",
          border: "1px solid var(--brd)",
          borderRadius: 8,
          fontSize: 16,
          position: "relative",
        }}
        title="Уведомления">
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: indicatorColor,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            padding: "0 4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--bg)",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Выпадающий список */}
      {open && (
        <div style={{
          position: "absolute",
          top: 44,
          right: 0,
          width: 380,
          maxHeight: 540,
          background: "var(--card)",
          border: "1px solid var(--brd)",
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Шапка */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="text-sm font-bold">🔔 Уведомления</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                {unreadCount > 0 ? `${unreadCount} непрочитанных` : "Всё прочитано"}
                {checking && <span className="ml-2" style={{ color: "var(--accent)" }}>· проверяю...</span>}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={manualRefresh}
                disabled={checking}
                title="Проверить сейчас"
                className="text-[12px] cursor-pointer border-none bg-transparent"
                style={{ color: "var(--t3)", padding: "4px 6px" }}>
                🔄
              </button>
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllRead}
                    title="Отметить все прочитанными"
                    className="text-[10px] cursor-pointer border-none bg-transparent"
                    style={{ color: "var(--t3)", padding: "4px 6px" }}>
                    ✓
                  </button>
                  <button
                    onClick={dismissAll}
                    title="Скрыть все"
                    className="text-[12px] cursor-pointer border-none bg-transparent"
                    style={{ color: "#EF4444", padding: "4px 6px" }}>
                    🗑
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Список */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div className="text-[12px]" style={{ color: "var(--t3)" }}>
                  Нет активных уведомлений
                </div>
                <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                  Жанара проверяет автоматически раз в час
                </div>
              </div>
            ) : (
              notifications.map(n => {
                const sev = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
                const catIcon = CATEGORY_ICONS[n.category] || "🔔";
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && markAsRead(n.id)}
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--brd)",
                      background: n.is_read ? "transparent" : sev.bg,
                      cursor: "pointer",
                      borderLeft: `3px solid ${n.is_read ? "transparent" : sev.color}`,
                      position: "relative",
                    }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 18, lineHeight: "1.2", flexShrink: 0 }}>{catIcon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span style={{ fontSize: 11, fontWeight: 700, color: sev.color }}>{n.title}</span>
                          {!n.is_read && (
                            <span style={{ width: 6, height: 6, borderRadius: 3, background: sev.color, flexShrink: 0 }} />
                          )}
                        </div>
                        <div className="text-[10.5px]" style={{ color: "var(--t2)", lineHeight: 1.4, marginBottom: 4 }}>
                          {n.message}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-[9px]" style={{ color: "var(--t3)" }}>
                            {n.source === "janara" && <span style={{ color: "#A855F7", marginRight: 4 }}>✦ Жанара</span>}
                            {formatRelativeTime(n.created_at)}
                          </div>
                          {n.action_url && n.action_label && (
                            <button
                              onClick={e => { e.stopPropagation(); handleAction(n); }}
                              className="text-[10px] font-bold cursor-pointer border-none rounded"
                              style={{ background: sev.color, color: "#fff", padding: "3px 8px" }}>
                              {n.action_label} →
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                        className="text-[14px] cursor-pointer border-none bg-transparent"
                        style={{ color: "var(--t3)", padding: 0, lineHeight: 1, flexShrink: 0 }}
                        title="Скрыть">×</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Футер */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--brd)", textAlign: "center" }}>
            <button
              onClick={() => { setOpen(false); router.push("/dashboard/notifications"); }}
              className="text-[10px] cursor-pointer border-none bg-transparent"
              style={{ color: "var(--accent)" }}>
              Открыть все уведомления →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
