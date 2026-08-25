export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

export function normalizePhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return "8" + digits.slice(1);
  if (digits.length === 11 && digits.startsWith("8")) return digits;
  if (digits.length === 10) return "8" + digits;
  return digits;
}

export function isValidKZPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return normalized.length === 11 && normalized.startsWith("8");
}

export function formatAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Произошла ошибка";
  if (/failed to fetch|networkerror|network request failed|load failed|timeout/i.test(message)) {
    return "Сервер авторизации не ответил вовремя. Подождите 2–3 секунды и нажмите «Войти» ещё раз.";
  }
  if (/invalid login credentials/i.test(message)) {
    return "Неверный email или пароль";
  }
  return message;
}

function isRetryableAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|network request failed|load failed|timeout|522|503|504/i.test(message);
}

import type { SupabaseClient } from "@supabase/supabase-js";

export async function signInWithRetry(
  supabase: SupabaseClient,
  email: string,
  password: string,
  attempts = 2
) {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return data;
    lastError = error;
    if (!isRetryableAuthError(error) || i === attempts - 1) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw lastError;
}
