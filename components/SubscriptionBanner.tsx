"use client";

// Баннер о состоянии подписки + проверка Read-Only.
// Вставляется в Dashboard layout — показывается на всех страницах.

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { getSubscriptionInfo, getWarningLevel, type SubscriptionInfo } from "@/lib/subscription";

const BANNER_COLORS = {
  none:     { bg: "transparent", text: "transparent", border: "transparent" },
  info:     { bg: "#A855F715",   text: "#A855F7",     border: "#A855F740" },
  warning:  { bg: "#F59E0B15",   text: "#D97706",     border: "#F59E0B40" },
  critical: { bg: "#EF444415",   text: "#DC2626",     border: "#EF444460" },
  expired:  { bg: "#EF444425",   text: "#991B1B",     border: "#EF4444" },
};

export default function SubscriptionBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { load(); }, [pathname]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoaded(true);
      return;
    }
    const subInfo = await getSubscriptionInfo(supabase, user.id);
    setInfo(subInfo);
    setLoaded(true);
  }

  if (!loaded || !info) return null;

  // На страницах подписки/оплаты не показываем
  if (pathname.startsWith("/dashboard/subscription") || pathname.startsWith("/dashboard/billing")) {
    return null;
  }

  const warning = getWarningLevel(info);
  if (warning.level === "none") return null;

  // Истёкшую подписку не закрыть
  const canDismiss = warning.level !== "expired" && warning.level !== "critical";
  if (dismissed && canDismiss) return null;

  const colors = BANNER_COLORS[warning.level];

  return (
    <div className="rounded-xl p-3 mb-3 flex items-center justify-between gap-3"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
      }}>
      <div className="flex-1 text-[12px] font-semibold">
        {warning.message}
        {info.is_read_only && (
          <div className="text-[11px] mt-0.5" style={{ fontWeight: 500, opacity: 0.85 }}>
            Доступ только для просмотра. Создание и редактирование заблокированы.
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => router.push("/dashboard/subscription")}
          className="cursor-pointer rounded-lg font-bold text-[11px]"
          style={{
            padding: "6px 12px",
            background: warning.level === "expired" || warning.level === "critical"
              ? colors.text
              : "transparent",
            border: `1px solid ${colors.text}`,
            color: warning.level === "expired" || warning.level === "critical" ? "#fff" : colors.text,
          }}>
          {info.is_read_only ? "Оформить подписку" : "Продлить"}
        </button>
        {canDismiss && (
          <button onClick={() => setDismissed(true)}
            className="cursor-pointer text-[14px]"
            style={{
              background: "transparent", border: "none",
              color: colors.text, opacity: 0.6,
              padding: "0 4px",
            }}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Hook для проверки Read-Only на любой странице
// ═══════════════════════════════════════════

export function useReadOnlyGuard() {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const subInfo = await getSubscriptionInfo(supabase, user.id);
        setInfo(subInfo);
      }
      setLoading(false);
    })();
  }, []);

  return {
    loading,
    info,
    isReadOnly: info?.is_read_only ?? false,
    isActive: info?.is_active ?? false,
  };
}

// ═══════════════════════════════════════════
// Компонент-обёртка кнопок действий (блокирует если read-only)
// ═══════════════════════════════════════════

interface ActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export function ActionGuardButton({ children, onClick, className, style, disabled }: ActionButtonProps) {
  const router = useRouter();
  const { isReadOnly, loading } = useReadOnlyGuard();

  function handleClick() {
    if (isReadOnly) {
      const ok = confirm(
        "⛔ Действие заблокировано\n\nВаша подписка истекла или закончился пробный период. Доступно только просмотр данных.\n\nХотите перейти к оформлению подписки?"
      );
      if (ok) router.push("/dashboard/subscription");
      return;
    }
    onClick();
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className={className}
      style={{ 
        ...style, 
        opacity: isReadOnly ? 0.6 : (style?.opacity ?? 1),
        cursor: isReadOnly ? "not-allowed" : "pointer",
      }}
      title={isReadOnly ? "Действие заблокировано — оформите подписку" : ""}
    >
      {isReadOnly && "🔒 "}{children}
    </button>
  );
}
