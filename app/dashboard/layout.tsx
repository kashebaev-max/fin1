"use client";

import { useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";

const MODULES = [
  { key: "dashboard", name: "Главная", icon: "⬡", path: "/dashboard" },
  { key: "documents", name: "Документы", icon: "◈", path: "/dashboard/documents" },
  { key: "accounting", name: "Бухгалтерия", icon: "▦", path: "/dashboard/accounting" },
  { key: "warehouse", name: "Склад", icon: "▣", path: "/dashboard/warehouse" },
  { key: "cashbox", name: "Касса", icon: "◉", path: "/dashboard/cashbox" },
  { key: "bank", name: "Банк", icon: "◆", path: "/dashboard/bank" },
  { key: "hr", name: "Кадры и ЗП", icon: "◎", path: "/dashboard/hr" },
  { key: "reports", name: "Отчёты", icon: "▤", path: "/dashboard/reports" },
  { key: "taxinfo", name: "НК РК 2026", icon: "⚖", path: "/dashboard/taxinfo" },
  { key: "ai", name: "AI Жанара", icon: "✦", path: "/dashboard/ai" },
  { key: "settings", name: "Настройки", icon: "⚙", path: "/dashboard/settings" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (data) setProfile(data as Profile);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  const activeModule = MODULES.find(m => pathname === m.path) || MODULES.find(m => pathname.startsWith(m.path) && m.path !== "/dashboard") || MODULES[0];

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)", color: "var(--t1)" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-300"
        style={{
          width: collapsed ? 56 : 210,
          background: "#0A0D12",
          borderRight: "1px solid var(--brd)",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          style={{ padding: collapsed ? "14px 10px" : "14px 16px", borderBottom: "1px solid var(--brd)" }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <div
            className="flex items-center justify-center font-extrabold text-white flex-shrink-0"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, #6366F1, #A855F7)",
              fontSize: 15,
            }}
          >F</div>
          {!collapsed && (
            <div>
              <div className="text-sm font-extrabold">FinERP</div>
              <div className="text-[9px] tracking-widest" style={{ color: "var(--t3)" }}>НК РК 2026</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-0.5 p-1.5 overflow-y-auto">
          {MODULES.map(mod => {
            const active = mod.key === activeModule.key;
            return (
              <button
                key={mod.key}
                onClick={() => router.push(mod.path)}
                className="flex items-center gap-2.5 rounded-lg border-none cursor-pointer transition-all text-left"
                style={{
                  padding: collapsed ? "8px" : "8px 10px",
                  background: active ? "var(--accent-dim)" : "transparent",
                  color: active ? "var(--accent)" : "var(--t3)",
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  justifyContent: collapsed ? "center" : "flex-start",
                }}
              >
                <span className="flex-shrink-0" style={{ fontSize: 14 }}>{mod.icon}</span>
                {!collapsed && <span>{mod.name}</span>}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div
          className="flex items-center gap-2"
          style={{ padding: collapsed ? "10px 8px" : "10px 12px", borderTop: "1px solid var(--brd)" }}
        >
          <div
            className="flex items-center justify-center font-bold text-white flex-shrink-0"
            style={{
              width: 28, height: 28, borderRadius: 7, fontSize: 10,
              background: "linear-gradient(135deg, #6366F1, #EC4899)",
            }}
          >
            {profile?.full_name?.split(" ").map(w => w[0]).join("").slice(0, 2) || "??"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold truncate">{profile?.full_name || "Загрузка..."}</div>
              <button onClick={handleLogout} className="text-[10px] border-none bg-transparent cursor-pointer" style={{ color: "var(--t3)" }}>
                Выйти
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center justify-between"
          style={{ padding: "12px 28px", borderBottom: "1px solid var(--brd)" }}
        >
          <div>
            <h1 className="text-lg font-bold" style={{ letterSpacing: "-0.02em" }}>
              {activeModule.name}
            </h1>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>
              {profile?.company_name || "Организация"} • НДС 16% • МРП 4 325 ₸
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 rounded-lg"
              style={{ padding: "6px 12px", border: "1px solid var(--brd)", background: "var(--bg)" }}
            >
              <span style={{ fontSize: 12 }}>🔍</span>
              <input
                placeholder="Поиск..."
                className="border-none bg-transparent outline-none"
                style={{ color: "var(--t1)", fontSize: 12, width: 120 }}
              />
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
