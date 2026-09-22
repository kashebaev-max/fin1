import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Вход и регистрация — Finstat.kz",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://finstat.kz/auth" },
};

export default async function AuthPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "var(--bg)" }}>
      <AuthForm mode={typeof params.mode === "string" ? params.mode : undefined}
        blocked={params.blocked === "1"} confirmationRequired={params.confirm === "required"} />
    </main>
  );
}
