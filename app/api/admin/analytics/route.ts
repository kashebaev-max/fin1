import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createServiceSupabase } from "@/lib/supabase-admin";
import { isPlatformAdmin } from "@/lib/platform-admin";

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!isPlatformAdmin(profile)) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const admin = createServiceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY не настроен" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since") || new Date(Date.now() - 7 * 86400000).toISOString();

  const [pvRes, sessRes] = await Promise.all([
    admin
      .from("page_views")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
    admin
      .from("user_sessions")
      .select("*")
      .gte("first_seen", since)
      .order("first_seen", { ascending: false })
      .limit(500),
  ]);

  if (pvRes.error) {
    return NextResponse.json({ error: pvRes.error.message }, { status: 500 });
  }
  if (sessRes.error) {
    return NextResponse.json({ error: sessRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    page_views: pvRes.data || [],
    sessions: sessRes.data || [],
  });
}
