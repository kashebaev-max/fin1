// Хелпер для работы с подписками и проверкой Read-Only режима.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled" | "suspended";
export type SubscriptionPlan = "trial" | "monthly_once" | "monthly_recurring" | "yearly_once";

export interface SubscriptionInfo {
  id: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  trial_ends_at: string | null;
  expires_at: string | null;
  is_active: boolean;        // can edit/create
  is_read_only: boolean;     // can only view
  days_left: number;
  is_trial: boolean;
  is_recurring: boolean;
}

// ═══════════════════════════════════════════
// Тарифы
// ═══════════════════════════════════════════

export const PLANS = {
  monthly_once: {
    key: "monthly_once",
    name: "Месячная — разовая оплата",
    description: "Доступ на 30 дней, без автосписания",
    amount: 10000,
    duration_days: 30,
    is_recurring: false,
    badge: null as string | null,
  },
  monthly_recurring: {
    key: "monthly_recurring",
    name: "Месячная подписка",
    description: "10 000 ₸ ежемесячно, автосписание через Kaspi",
    amount: 10000,
    duration_days: 30,
    is_recurring: true,
    badge: "Удобно" as string | null,
  },
  yearly_once: {
    key: "yearly_once",
    name: "Годовая",
    description: "Доступ на 365 дней. Экономия 20 000 ₸ (16.7%)",
    amount: 100000,
    duration_days: 365,
    is_recurring: false,
    badge: "Выгодно" as string | null,
  },
};

// ═══════════════════════════════════════════
// Получение информации о подписке
// ═══════════════════════════════════════════

export async function getSubscriptionInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionInfo | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const now = new Date();
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const isActive = (data.status === "trial" || data.status === "active") && (!expiresAt || expiresAt > now);
  const isReadOnly = !isActive;

  return {
    id: data.id,
    status: data.status,
    plan: data.plan,
    trial_ends_at: data.trial_ends_at,
    expires_at: data.expires_at,
    is_active: isActive,
    is_read_only: isReadOnly,
    days_left: daysLeft,
    is_trial: data.status === "trial",
    is_recurring: data.is_recurring || false,
  };
}

// ═══════════════════════════════════════════
// Проверка возможности действия
// ═══════════════════════════════════════════

export function canPerformAction(info: SubscriptionInfo | null): {
  allowed: boolean;
  reason?: string;
} {
  if (!info) {
    return { allowed: false, reason: "Подписка не найдена" };
  }
  if (info.is_read_only) {
    return {
      allowed: false,
      reason: info.status === "trial"
        ? "Тестовый период закончился. Оформите подписку чтобы продолжить."
        : "Подписка истекла. Продлите чтобы продолжить работу.",
    };
  }
  return { allowed: true };
}

// ═══════════════════════════════════════════
// Форматирование
// ═══════════════════════════════════════════

export function formatExpiryDate(dateStr: string | null): string {
  if (!dateStr) return "не указано";
  const date = new Date(dateStr);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatDaysLeft(days: number): string {
  if (days <= 0) return "истёк";
  if (days === 1) return "1 день";
  if (days < 5) return `${days} дня`;
  return `${days} дней`;
}

// ═══════════════════════════════════════════
// Уровень предупреждения (для баннера)
// ═══════════════════════════════════════════

export function getWarningLevel(info: SubscriptionInfo | null): {
  level: "none" | "info" | "warning" | "critical" | "expired";
  message: string;
} {
  if (!info) return { level: "expired", message: "Нет активной подписки" };

  if (info.is_read_only) {
    return {
      level: "expired",
      message: info.status === "trial"
        ? "⛔ Тестовый период закончился. Доступ только для просмотра."
        : "⛔ Подписка истекла. Доступ только для просмотра.",
    };
  }

  if (info.is_trial) {
    if (info.days_left <= 1) {
      return { level: "critical", message: `🔴 Триал заканчивается завтра!` };
    }
    if (info.days_left <= 3) {
      return { level: "critical", message: `🔴 Триал заканчивается через ${formatDaysLeft(info.days_left)}` };
    }
    if (info.days_left <= 7) {
      return { level: "warning", message: `🟡 Триал заканчивается через ${formatDaysLeft(info.days_left)}` };
    }
    return { level: "info", message: `Триал, осталось ${formatDaysLeft(info.days_left)}` };
  }

  // Активная подписка
  if (info.days_left <= 3) {
    return { level: "critical", message: `🔴 Подписка истекает через ${formatDaysLeft(info.days_left)}` };
  }
  if (info.days_left <= 7) {
    return { level: "warning", message: `🟡 Подписка истекает через ${formatDaysLeft(info.days_left)}` };
  }
  return { level: "none", message: "" };
}

// ═══════════════════════════════════════════
// Нормализация телефона в формат Apipay (87XXXXXXXXX)
// ═══════════════════════════════════════════

export function normalizePhone(phone: string): string {
  if (!phone) return "";
  
  // Убираем всё кроме цифр
  const digits = phone.replace(/\D/g, "");
  
  // Если 11 цифр и начинается с 7 → 87xxx
  if (digits.length === 11 && digits.startsWith("7")) {
    return "8" + digits.slice(1);
  }
  
  // Если 11 цифр и начинается с 8 → как есть
  if (digits.length === 11 && digits.startsWith("8")) {
    return digits;
  }
  
  // Если 10 цифр → добавляем 8
  if (digits.length === 10) {
    return "8" + digits;
  }
  
  return digits;
}

export function isValidKZPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return normalized.length === 11 && normalized.startsWith("8");
}
