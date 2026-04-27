"use client";

import { useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";

const ADMIN_EMAIL = "kashebaev@gmail.com";

const MODULES = [
  { key: "dashboard", name: "Главная", icon: "⬡", path: "/dashboard", adminOnly: false },
  { key: "companies", name: "Организации", icon: "🏢", path: "/dashboard/companies", adminOnly: false },
  { key: "counterparties", name: "Контрагенты", icon: "👥", path: "/dashboard/counterparties", adminOnly: false },
  { key: "nomenclature", name: "Номенклатура", icon: "📚", path: "/dashboard/nomenclature", adminOnly: false },
  { key: "contracts", name: "Договоры", icon: "📑", path: "/dashboard/contracts", adminOnly: false },
  { key: "orders", name: "Заказы", icon: "📋", path: "/dashboard/orders", adminOnly: false },
  { key: "returns", name: "Возвраты", icon: "↩", path: "/dashboard/returns", adminOnly: false },
  { key: "crm", name: "CRM", icon: "💼", path: "/dashboard/crm", adminOnly: false },
  { key: "pos", name: "Касса POS", icon: "🛒", path: "/dashboard/pos", adminOnly: false },
  { key: "retail", name: "Розница", icon: "🏬", path: "/dashboard/retail", adminOnly: false },
  { key: "discounts", name: "Скидки и Промо", icon: "🎁", path: "/dashboard/discounts", adminOnly: false },
  { key: "sales-analytics", name: "Анализ продаж", icon: "🎯", path: "/dashboard/sales-analytics", adminOnly: false },
  { key: "production", name: "Производство", icon: "🏭", path: "/dashboard/production", adminOnly: false },
  { key: "assembly", name: "Комплектация", icon: "🔧", path: "/dashboard/assembly", adminOnly: false },
  { key: "budgeting", name: "Бюджет", icon: "📊", path: "/dashboard/budgeting", adminOnly: false },
  { key: "management-reports", name: "Упр. отчёты", icon: "📈", path: "/dashboard/management-reports", adminOnly: false },
  { key: "documents", name: "Документы", icon: "◈", path: "/dashboard/documents", adminOnly: false },
  { key: "workflow", name: "Документооборот", icon: "🛤", path: "/dashboard/workflow", adminOnly: false },
  { key: "edo", name: "ЭДО / ЭСФ", icon: "📨", path: "/dashboard/edo", adminOnly: false },
  { key: "industry", name: "Отрасли", icon: "🏥", path: "/dashboard/industry", adminOnly: false },
  { key: "transport", name: "Транспорт", icon: "🚗", path: "/dashboard/transport", adminOnly: false },
  { key: "accounting", name: "Бухгалтерия", icon: "▦", path: "/dashboard/accounting", adminOnly: false },
  { key: "warehouse", name: "Склад", icon: "▣", path: "/dashboard/warehouse", adminOnly: false },
  { key: "transfers", name: "Перемещения", icon: "🔁", path: "/dashboard/transfers", adminOnly: false },
  { key: "inventory", name: "Инвентаризация", icon: "📋", path: "/dashboard/inventory", adminOnly: false },
  { key: "assets", name: "Осн. средства", icon: "🏗", path: "/dashboard/assets", adminOnly: false },
  { key: "cashbox", name: "Касса", icon: "◉", path: "/dashboard/cashbox", adminOnly: false },
  { key: "bank", name: "Банк", icon: "◆", path: "/dashboard/bank", adminOnly: false },
  { key: "bank-import", name: "Импорт выписки", icon: "📥", path: "/dashboard/bank-import", adminOnly: false },
  { key: "currency", name: "Валюты", icon: "💱", path: "/dashboard/currency", adminOnly: false },
  { key: "hr", name: "Кадры и ЗП", icon: "◎", path: "/dashboard/hr", adminOnly: false },
  { key: "calendar", name: "Календарь", icon: "📅", path: "/dashboard/calendar", adminOnly: false },
  { key: "check", name: "Проверка БИН", icon: "🔍", path: "/dashboard/check", adminOnly: false },
  { key: "reports", name: "Отчёты ФНО", icon: "▤", path: "/dashboard/reports", adminOnly: false },
  { key: "taxinfo", name: "НК РК 2026", icon: "⚖", path: "/dashboard/taxinfo", adminOnly: false },
  { key: "ai", name: "AI Жанара", icon: "✦", path: "/dashboard/ai", adminOnly: false },
  { key: "settings", name: "Настройки", icon: "⚙", path: "/dashboard/settings", adminOnly: false },
  { key: "admin", name: "Админ-панель", icon: "🛡", path: "/dashboard/admin", adminOnly: true },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("finerp-theme") : null;
    if (saved === "light" || saved === "dark") { setTheme(saved); document.documentElement.setAttribute("data-theme", saved); }
    else { document.documentElement.setAttribute("data-theme", "dark"); }
    loadProfile();
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    if (typeof window !== "undefined") window.localStorage.setItem("finerp-theme", next);
  }

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (data) { setProfile(data as Profile); setIsAdmin(data.email === ADMIN_EMAIL || data.role === "admin"); }
  }

  async function handleLogout() { await supabase.auth.signOut(); router.push("/auth"); router.refresh(); }

  const visibleModules = MODULES.filter(m => !m.adminOnly || isAdmin);
  const activeModule = visibleModules.find(m => pathname === m.path) || visibleModules.find(m => pathname.startsWith(m.path) && m.path !== "/dashboard") || visibleModules[0];

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)", color: "var(--t1)", transition: "background 0.3s, color 0.3s" }}>
      <aside className="flex flex-col flex-shrink-0 transition-all duration-300" style={{ width: collapsed ? 56 : 220, background: "var(--sidebar)", borderRight: "1px solid var(--brd)" }}>
        <div className="flex items-center gap-2 cursor-pointer" style={{ padding: collapsed ? "14px 10px" : "14px 16px", borderBottom: "1px solid var(--brd)" }} onClick={() => setCollapsed(!collapsed)}>
          <div className="flex items-center justify-center font-extrabold text-white flex-shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366F1, #A855F7)", fontSize: 15 }}>F</div>
          {!collapsed && <div><div className="text-sm font-extrabold">Finstat.kz</div><div className="text-[9px] tracking-widest" style={{ color: "var(--t3)" }}>НК РК 2026</div></div>}
        </div>
        <nav className="flex-1 flex flex-col gap-0.5 p-1.5 overflow-y-auto">
          {visibleModules.map((mod, i) => {
            const active = mod.key === activeModule.key;
            const showDivider = mod.key === "admin" && i > 0;
            return (<div key={mod.key}>
              {showDivider && <div style={{ height: 1, background: "var(--brd)", margin: "6px 8px" }} />}
              <button onClick={() => router.push(mod.path)} className="flex items-center gap-2.5 rounded-lg border-none cursor-pointer transition-all text-left w-full"
                style={{ padding: collapsed ? "8px" : "7px 10px", background: active ? (mod.adminOnly ? "#F59E0B20" : "var(--accent-dim)") : "transparent", color: active ? (mod.adminOnly ? "#F59E0B" : "var(--accent)") : "var(--t3)", fontSize: 12, fontWeight: active ? 600 : 400, justifyContent: collapsed ? "center" : "flex-start" }}>
                <span className="flex-shrink-0" style={{ fontSize: 13 }}>{mod.icon}</span>
                {!collapsed && <span>{mod.name}</span>}
              </button>
            </div>);
          })}
        </nav>
        <div style={{ borderTop: "1px solid var(--brd)" }}>
          <div className="flex items-center justify-center" style={{ padding: collapsed ? "8px" : "8px 12px" }}>
            <button onClick={toggleTheme} className="flex items-center gap-2 rounded-lg border-none cursor-pointer w-full justify-center" style={{ padding: "6px 10px", background: "var(--hover)", color: "var(--t3)", fontSize: 12 }}>
              <span style={{ fontSize: 14 }}>{theme === "dark" ? "☀️" : "🌙"}</span>
              {!collapsed && <span>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span>}
            </button>
          </div>
          <div className="flex items-center gap-2" style={{ padding: collapsed ? "8px" : "8px 12px", borderTop: "1px solid var(--brd)" }}>
            <div className="flex items-center justify-center font-bold text-white flex-shrink-0" style={{ width: 28, height: 28, borderRadius: 7, fontSize: 10, background: isAdmin ? "linear-gradient(135deg, #F59E0B, #EF4444)" : "linear-gradient(135deg, #6366F1, #EC4899)" }}>
              {profile?.full_name?.split(" ").map(w => w[0]).join("").slice(0, 2) || "??"}
            </div>
            {!collapsed && <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold truncate">{profile?.full_name || "Загрузка..."}</div>
              <div className="flex items-center gap-2">
                {isAdmin && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>ADMIN</span>}
                <button onClick={handleLogout} className="text-[10px] border-none bg-transparent cursor-pointer" style={{ color: "var(--t3)" }}>Выйти</button>
              </div>
            </div>}
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between" style={{ padding: "12px 28px", borderBottom: "1px solid var(--brd)" }}>
          <div>
            <h1 className="text-lg font-bold" style={{ letterSpacing: "-0.02em" }}>{activeModule.name}</h1>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>{profile?.company_name || "Организация"} • НДС 16% • МРП 4 325 ₸</div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </div>
  );
}
