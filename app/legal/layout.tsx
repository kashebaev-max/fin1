import type { ReactNode } from "react";
import Link from "next/link";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg, #0f1117)", color: "var(--t1, #e5e7eb)" }}>
      <header className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="text-sm font-bold no-underline" style={{ color: "#818CF8" }}>
          ← Finstat.kz
        </Link>
        <div className="flex gap-4 text-xs">
          <Link href="/legal/terms" className="no-underline" style={{ color: "var(--t2, #9ca3af)" }}>
            Оферта
          </Link>
          <Link href="/legal/privacy" className="no-underline" style={{ color: "var(--t2, #9ca3af)" }}>
            Конфиденциальность
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 pb-16 prose-legal">{children}</main>
    </div>
  );
}
