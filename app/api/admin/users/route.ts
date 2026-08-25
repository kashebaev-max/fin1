import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase-server";
import { isPlatformAdmin } from "@/lib/platform-admin";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requirePlatformAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!isPlatformAdmin(profile)) {
    return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }) };
  }

  return { adminId: user.id, profile };
}

/** Продлевает доступ: от max(expires_at, now) + days. */
async function grantAccess(
  admin: SupabaseClient,
  userId: string,
  adminId: string,
  days: number,
  mode: "trial" | "active" = "active"
) {
  const { data: existing } = await admin
    .from("subscriptions")
    .select("expires_at, plan, status")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date();
  const currentExpiry = existing?.expires_at ? new Date(existing.expires_at) : now;
  const baseDate = currentExpiry > now ? currentExpiry : now;
  const expires = new Date(baseDate.getTime() + days * 86400000);

  const status = mode === "trial" ? "trial" : "active";
  const plan =
    mode === "trial"
      ? "trial"
      : existing?.plan && existing.plan !== "trial"
        ? existing.plan
        : "monthly_once";

  const row: Record<string, string> = {
    user_id: userId,
    status,
    plan,
    expires_at: expires.toISOString(),
    updated_at: now.toISOString(),
  };
  if (mode === "trial") row.trial_ends_at = expires.toISOString();

  await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });

  await admin.from("subscription_events").insert({
    user_id: userId,
    event_type: "admin_grant_access",
    payload: {
      days,
      mode,
      new_expires_at: expires.toISOString(),
      granted_by: adminId,
      previous_expires_at: existing?.expires_at ?? null,
    },
  });

  return expires;
}

function formatExpiry(date: Date) {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if (auth.error) return auth.error;

  const admin = serviceClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY не настроен на сервере" },
      { status: 500 }
    );
  }

  let body: { action?: string; userId?: string; days?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const { action, userId, days } = body;
  if (!userId || !action) {
    return NextResponse.json({ error: "Укажите action и userId" }, { status: 400 });
  }

  if (userId === auth.adminId) {
    return NextResponse.json({ error: "Нельзя применить действие к себе" }, { status: 400 });
  }

  const { data: target } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (isPlatformAdmin(target)) {
    return NextResponse.json({ error: "Нельзя изменить платформенного администратора" }, { status: 400 });
  }

  switch (action) {
    case "block": {
      await admin.from("profiles").update({ is_blocked: true }).eq("id", userId);
      return NextResponse.json({ ok: true, message: "Пользователь заблокирован" });
    }

    case "unblock": {
      await admin.from("profiles").update({ is_blocked: false }).eq("id", userId);
      return NextResponse.json({ ok: true, message: "Пользователь разблокирован" });
    }

    case "grant_access": {
      const addDays = typeof days === "number" && days > 0 ? days : 30;
      const expires = await grantAccess(admin, userId, auth.adminId!, addDays, "active");
      return NextResponse.json({
        ok: true,
        message: `Доступ выдан на ${addDays} дн. (до ${formatExpiry(expires)})`,
        expires_at: expires.toISOString(),
      });
    }

    case "extend_trial": {
      const addDays = typeof days === "number" && days > 0 ? days : 30;
      const expires = await grantAccess(admin, userId, auth.adminId!, addDays, "trial");
      return NextResponse.json({
        ok: true,
        message: `Триал продлён на ${addDays} дн. (до ${formatExpiry(expires)})`,
        expires_at: expires.toISOString(),
      });
    }

    case "activate": {
      const addDays = typeof days === "number" && days > 0 ? days : 30;
      const expires = await grantAccess(admin, userId, auth.adminId!, addDays, "active");
      return NextResponse.json({
        ok: true,
        message: `Подписка активирована на ${addDays} дн. (до ${formatExpiry(expires)})`,
        expires_at: expires.toISOString(),
      });
    }

    case "suspend": {
      await admin
        .from("subscriptions")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      return NextResponse.json({ ok: true, message: "Подписка приостановлена" });
    }

    case "delete": {
      const tables = [
        "subscription_events",
        "payments",
        "subscriptions",
        "documents",
        "employees",
        "products",
        "counterparties",
        "journal_entries",
        "cash_operations",
        "bank_operations",
        "doc_sequences",
        "module_preferences",
      ] as const;

      for (const table of tables) {
        await admin.from(table).delete().eq("user_id", userId);
      }

      await admin.from("profiles").delete().eq("id", userId);
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: "Пользователь удалён" });
    }

    default:
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }
}
