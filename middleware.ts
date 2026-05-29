import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const REQUIRE_EMAIL_CONFIRMATION =
  process.env.NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION === "true";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/dashboard")) {
    if (REQUIRE_EMAIL_CONFIRMATION && !user.email_confirmed_at) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      url.searchParams.set("confirm", "required");
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_blocked")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_blocked) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      url.searchParams.set("blocked", "1");
      return NextResponse.redirect(url);
    }
  }

  if (user && pathname === "/auth") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth"],
};
