/**
 * Отправка письма через Resend REST API (без доп. зависимостей).
 * Если RESEND_API_KEY не задан — тихо пропускаем (письмо не критично, обращение уже сохранено в БД).
 * Ключ: https://resend.com → API Keys. Отправитель по умолчанию работает только на e-mail владельца аккаунта,
 * пока домен не подтверждён в Resend.
 */

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
};

export type SendEmailResult = {
  sent: boolean;
  skipped?: boolean;
  error?: string;
};

export async function sendEmail({ to, subject, html, replyTo }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, skipped: true };
  }

  const from = process.env.SUPPORT_EMAIL_FROM?.trim() || "Finstat.kz <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }

    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
