import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { PLATFORM_ADMIN_EMAIL } from "@/lib/platform-admin";
import { sendEmail, escapeHtml } from "@/lib/send-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["question", "problem", "suggestion", "billing", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  question: "Вопрос",
  problem: "Проблема",
  suggestion: "Предложение",
  billing: "Оплата / подписка",
  other: "Другое",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Войдите в систему, чтобы отправить обращение." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || "").trim();
    const rawCategory = String(body?.category || "question");
    const category: Category = (CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as Category)
      : "question";
    const pageUrl = String(body?.page_url || "").slice(0, 500);
    const contactEmail = String(body?.email || "").trim().slice(0, 200);

    if (message.length < 5) {
      return NextResponse.json({ error: "Опишите вопрос подробнее (минимум 5 символов)." }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: "Сообщение слишком длинное (максимум 5000 символов)." }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name, company_name")
      .eq("id", user.id)
      .maybeSingle();

    const email = contactEmail || profile?.email || user.email || null;
    const name = profile?.full_name || null;
    const companyName = profile?.company_name || null;

    // Запись от имени пользователя (RLS-политика support_messages_insert_own; работает и при истёкшей подписке)
    const { data: inserted, error: insertError } = await supabase
      .from("support_messages")
      .insert({
        user_id: user.id,
        email,
        name,
        company_name: companyName,
        category,
        message,
        page_url: pageUrl || null,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("[api/support] insert", insertError);
      return NextResponse.json({ error: "Не удалось сохранить обращение. Попробуйте позже." }, { status: 500 });
    }

    // Уведомление администратору на email (если настроен RESEND_API_KEY)
    const notifyTo = process.env.SUPPORT_NOTIFY_EMAIL?.trim() || PLATFORM_ADMIN_EMAIL;
    const subject = `🆘 Finstat: ${CATEGORY_LABELS[category]} от ${name || email || "пользователя"}`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1A1D26">
        <h2 style="color:#6366F1;margin:0 0 12px">Новое обращение в поддержку</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#5A6178;width:140px">Категория</td><td style="padding:6px 0"><b>${escapeHtml(CATEGORY_LABELS[category])}</b></td></tr>
          <tr><td style="padding:6px 0;color:#5A6178">Пользователь</td><td style="padding:6px 0">${escapeHtml(name || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#5A6178">Организация</td><td style="padding:6px 0">${escapeHtml(companyName || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#5A6178">E-mail</td><td style="padding:6px 0">${escapeHtml(email || "—")}</td></tr>
          <tr><td style="padding:6px 0;color:#5A6178">Страница</td><td style="padding:6px 0">${escapeHtml(pageUrl || "—")}</td></tr>
        </table>
        <div style="margin:16px 0;padding:14px 16px;background:#F5F6FA;border-radius:10px;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</div>
        <p style="font-size:12px;color:#8C93A8;margin:8px 0 0">
          Открыть в админке: <a href="https://finstat.kz/dashboard/admin/support" style="color:#6366F1">finstat.kz/dashboard/admin/support</a>
        </p>
      </div>`;

    const emailResult = await sendEmail({
      to: notifyTo,
      subject,
      html,
      replyTo: email || undefined,
    });

    if (emailResult.error) {
      console.warn("[api/support] email", emailResult.error);
    }

    return NextResponse.json({
      ok: true,
      id: inserted?.id,
      email_sent: emailResult.sent,
      email_configured: !emailResult.skipped,
    });
  } catch (e) {
    console.error("[api/support]", e);
    return NextResponse.json({ error: "Ошибка отправки. Попробуйте позже." }, { status: 500 });
  }
}
