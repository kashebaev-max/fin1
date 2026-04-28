"use client";

import { useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";
import { HOME_MODULE, MODULE_GROUPS, ALL_MODULES, isModuleEnabled } from "@/lib/modules-config";
import NotificationBell from "@/components/NotificationBell";

const ADMIN_EMAIL = "kashebaev@gmail.com";
const STORAGE_EXPANDED = "finerp-sidebar-expanded";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [disabledModules, setDisabledModules] = useState<string[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const savedTheme = typeof window !== "undefined" ? window.localStorage.getItem("finerp-theme") : null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    const savedExp = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_EXPANDED) : null;
    if (savedExp) {
      try { setExpandedGroups(JSON.parse(savedExp)); } catch {}
    } else {
      const active = MODULE_GROUPS.find(g => g.items.some(i => pathname.startsWith(i.path) && i.path !== "/dashboard"));
      if (active) setExpandedGroups({ [active.key]: true });
    }

    loadProfile();
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    if (typeof window !== "undefined") window.localStorage.setItem("finerp-theme", next);
  }

  function toggleGroup(key: string) {
    const next = { ...expandedGroups, [key]: !expandedGroups[key] };
    setExpandedGroups(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_EXPANDED, JSON.stringify(next));
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    MODULE_GROUPS.forEach(g => { next[g.key] = true; });
    setExpandedGroups(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_EXPANDED, JSON.stringify(next));
  }

  function collapseAll() {
    setExpandedGroups({});
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_EXPANDED, "{}");
  }

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (data) {
      setProfile(data as Profile);
      setIsAdmin(data.email === ADMIN_EMAIL || data.role === "admin");
    }

    const { data: prefs } = await supabase.from("module_preferences").select("disabled_modules").eq("user_id", user.id).maybeSingle();
    if (prefs?.disabled_modules) {
      setDisabledModules(Array.isArray(prefs.disabled_modules) ? prefs.disabled_modules : []);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  const activeModule = ALL_MODULES.find(m => pathname === m.path)
    || ALL_MODULES.find(m => pathname.startsWith(m.path) && m.path !== "/dashboard")
    || HOME_MODULE;

  const activeGroup = MODULE_GROUPS.find(g => g.items.some(i => i.key === activeModule.key));

  const searchLower = search.trim().toLowerCase();
  const isSearching = searchLower.length > 0;
  const matches = (name: string) => name.toLowerCase().includes(searchLower);

  const visibleGroups = MODULE_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i =>
      (!i.adminOnly || isAdmin) &&
      isModuleEnabled(i.key, disabledModules)
    ),
  })).filter(g => g.items.length > 0);

  function isGroupExpanded(group: typeof MODULE_GROUPS[0]): boolean {
    if (isSearching) return group.items.some(i => matches(i.name));
    return !!expandedGroups[group.key];
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)", color: "var(--t1)", transition: "background 0.3s, color 0.3s" }}>
      <aside className="flex flex-col flex-shrink-0 transition-all duration-300" style={{ width: collapsed ? 56 : 240, background: "var(--sidebar)", borderRight: "1px solid var(--brd)" }}>

        <div className="flex items-center gap-2 cursor-pointer" style={{ padding: collapsed ? "14px 10px" : "14px 16px", borderBottom: "1px solid var(--brd)" }} onClick={() => setCollapsed(!collapsed)}>
          <div className="flex items-center justify-center font-extrabold text-white flex-shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366F1, #A855F7)", fontSize: 15 }}>F</div>
          {!collapsed && (
            <div>
              <div className="text-sm font-extrabold">Finstat.kz</div>
              <div className="text-[9px] tracking-widest" style={{ color: "var(--t3)" }}>НК РК 2026</div>
            </div>
          )}
        </div>

        {!collapsed && (
          <div style={{ padding: "8px 10px 4px", borderBottom: "1px solid var(--brd)" }}>
            <div style={{ position: "relative" }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Поиск модуля..."
                style={{
                  width: "100%",
                  padding: "6px 26px 6px 10px",
                  fontSize: 11,
                  background: "var(--bg)",
                  border: "1px solid var(--brd)",
                  borderRadius: 6,
                  color: "var(--t1)",
                }}
              />
              {search && (
                <button onClick={() => setSearch("")}
                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 14 }}>×</button>
              )}
            </div>
            {!isSearching && (
              <div className="flex justify-between mt-1.5" style={{ fontSize: 9 }}>
                <button onClick={expandAll} className="cursor-pointer border-none bg-transparent" style={{ color: "var(--t3)" }}>↧ Все</button>
                <button onClick={collapseAll} className="cursor-pointer border-none bg-transparent" style={{ color: "var(--t3)" }}>↥ Свернуть</button>
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 flex flex-col gap-0.5 p-1.5 overflow-y-auto">

          {(!isSearching || matches(HOME_MODULE.name)) && (
            <button
              onClick={() => router.push(HOME_MODULE.path)}
              className="flex items-center gap-2.5 rounded-lg border-none cursor-pointer transition-all text-left w-full"
              style={{
                padding: collapsed ? "8px" : "8px 10px",
                background: pathname === HOME_MODULE.path ? "var(--accent-dim)" : "transparent",
                color: pathname === HOME_MODULE.path ? "var(--accent)" : "var(--t2)",
                fontSize: 12,
                fontWeight: pathname === HOME_MODULE.path ? 600 : 500,
                justifyContent: collapsed ? "center" : "flex-start",
                marginBottom: 4,
              }}>
              <span style={{ fontSize: 14 }}>{HOME_MODULE.icon}</span>
              {!collapsed && <span>{HOME_MODULE.name}</span>}
            </button>
          )}

          {visibleGroups.map(group => {
            const visibleItems = isSearching ? group.items.filter(i => matches(i.name)) : group.items;
            if (isSearching && visibleItems.length === 0) return null;

            const expanded = isGroupExpanded(group);
            const hasActive = group.items.some(i => i.key === activeModule.key);

            if (collapsed) {
              return (
                <div key={group.key}>
                  {visibleItems.map(item => {
                    const active = item.key === activeModule.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => router.push(item.path)}
                        title={`${group.name} → ${item.name}`}
                        className="flex items-center justify-center rounded-lg border-none cursor-pointer transition-all w-full"
                        style={{
                          padding: "8px",
                          background: active ? (item.adminOnly ? "#F59E0B20" : "var(--accent-dim)") : "transparent",
                          color: active ? (item.adminOnly ? "#F59E0B" : "var(--accent)") : "var(--t3)",
                          fontSize: 13,
                          marginBottom: 1,
                        }}>
                        <span>{item.icon}</span>
                      </button>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={group.key} style={{ marginBottom: 2 }}>
                <button
                  onClick={() => !isSearching && toggleGroup(group.key)}
                  className="flex items-center gap-2 rounded-lg border-none cursor-pointer transition-all text-left w-full"
                  style={{
                    padding: "6px 10px",
                    background: hasActive ? group.color + "12" : "transparent",
                    color: hasActive ? group.color : "var(--t3)",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>
                  <span style={{ fontSize: 11 }}>{group.icon}</span>
                  <span style={{ flex: 1 }}>{group.name}</span>
                  {!isSearching && <span style={{ fontSize: 9, opacity: 0.7 }}>{expanded ? "▾" : "▸"}</span>}
                  {isSearching && <span style={{ fontSize: 9, color: "var(--accent)" }}>{visibleItems.length}</span>}
                </button>

                {expanded && (
                  <div style={{ paddingLeft: 6, marginTop: 1 }}>
                    {visibleItems.map(item => {
                      const active = item.key === activeModule.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => router.push(item.path)}
                          className="flex items-center gap-2 rounded-lg border-none cursor-pointer transition-all text-left w-full"
                          style={{
                            padding: "5px 10px 5px 12px",
                            background: active ? (item.adminOnly ? "#F59E0B20" : "var(--accent-dim)") : "transparent",
                            color: active ? (item.adminOnly ? "#F59E0B" : "var(--accent)") : "var(--t2)",
                            fontSize: 11.5,
                            fontWeight: active ? 600 : 400,
                            borderLeft: active ? `2px solid ${item.adminOnly ? "#F59E0B" : "var(--accent)"}` : `2px solid transparent`,
                          }}>
                          <span style={{ fontSize: 11, opacity: 0.85 }}>{item.icon}</span>
                          <span style={{ flex: 1 }}>{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {isSearching && visibleGroups.every(g => g.items.filter(i => matches(i.name)).length === 0) && !matches(HOME_MODULE.name) && (
            <div className="text-center py-4 text-[11px]" style={{ color: "var(--t3)" }}>Ничего не найдено</div>
          )}

          {!isSearching && !collapsed && disabledModules.length > 0 && (
            <button
              onClick={() => router.push("/dashboard/settings/modules")}
              className="rounded-lg border-none cursor-pointer text-left mt-2"
              style={{ padding: "8px 10px", background: "var(--bg)", color: "var(--t3)", fontSize: 10, fontStyle: "italic" }}>
              💡 Скрыто {disabledModules.length} модулей. Управление →
            </button>
          )}
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
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold truncate">{profile?.full_name || "Загрузка..."}</div>
                <div className="flex items-center gap-2">
                  {isAdmin && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>ADMIN</span>}
                  <button onClick={handleLogout} className="text-[10px] border-none bg-transparent cursor-pointer" style={{ color: "var(--t3)" }}>Выйти</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between" style={{ padding: "12px 28px", borderBottom: "1px solid var(--brd)" }}>
          <div>
            {activeGroup && (
              <div className="flex items-center gap-1.5 mb-0.5" style={{ fontSize: 10, color: "var(--t3)" }}>
                <span style={{ color: activeGroup.color }}>{activeGroup.icon}</span>
                <span>{activeGroup.name}</span>
                <span>›</span>
              </div>
            )}
            <h1 className="text-lg font-bold" style={{ letterSpacing: "-0.02em" }}>{activeModule.name}</h1>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>{profile?.company_name || "Организация"} • НДС 16% • МРП 4 325 ₸</div>
          </div>
          {/* Колокольчик уведомлений */}
          <NotificationBell />
        </header>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </div>
  );
}
