"use client";

import { useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";

const ADMIN_EMAIL = "kashebaev@gmail.com";

interface ModuleItem {
  key: string;
  name: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
}

interface ModuleGroup {
  key: string;
  name: string;
  icon: string;
  color: string;
  items: ModuleItem[];
}

// Главная — отдельно, не в группе
const HOME_MODULE: ModuleItem = { key: "dashboard", name: "Главная", icon: "⬡", path: "/dashboard" };

const MODULE_GROUPS: ModuleGroup[] = [
  {
    key: "sales",
    name: "Продажи и CRM",
    icon: "💼",
    color: "#10B981",
    items: [
      { key: "crm", name: "CRM", icon: "💼", path: "/dashboard/crm" },
      { key: "counterparties", name: "Контрагенты", icon: "👥", path: "/dashboard/counterparties" },
      { key: "contracts", name: "Договоры", icon: "📑", path: "/dashboard/contracts" },
      { key: "orders", name: "Заказы", icon: "📋", path: "/dashboard/orders" },
      { key: "returns", name: "Возвраты", icon: "↩", path: "/dashboard/returns" },
      { key: "discounts", name: "Скидки и промо", icon: "🎁", path: "/dashboard/discounts" },
      { key: "sales-analytics", name: "Анализ продаж", icon: "🎯", path: "/dashboard/sales-analytics" },
    ],
  },
  {
    key: "retail",
    name: "Торговля",
    icon: "🛒",
    color: "#EC4899",
    items: [
      { key: "pos", name: "Касса POS", icon: "🛒", path: "/dashboard/pos" },
      { key: "retail", name: "Розница", icon: "🏬", path: "/dashboard/retail" },
    ],
  },
  {
    key: "warehouse",
    name: "Склад и номенклатура",
    icon: "▣",
    color: "#3B82F6",
    items: [
      { key: "nomenclature", name: "Номенклатура", icon: "📚", path: "/dashboard/nomenclature" },
      { key: "warehouse", name: "Склад", icon: "▣", path: "/dashboard/warehouse" },
      { key: "transfers", name: "Перемещения", icon: "🔁", path: "/dashboard/transfers" },
      { key: "inventory", name: "Инвентаризация", icon: "📋", path: "/dashboard/inventory" },
      { key: "batches", name: "Партионный учёт", icon: "📦", path: "/dashboard/batches" },
      { key: "assembly", name: "Комплектация", icon: "🔧", path: "/dashboard/assembly" },
      { key: "production", name: "Производство", icon: "🏭", path: "/dashboard/production" },
    ],
  },
  {
    key: "finance",
    name: "Деньги и банк",
    icon: "◆",
    color: "#F59E0B",
    items: [
      { key: "cashbox", name: "Касса", icon: "◉", path: "/dashboard/cashbox" },
      { key: "bank", name: "Банк", icon: "◆", path: "/dashboard/bank" },
      { key: "bank-import", name: "Импорт выписки", icon: "📥", path: "/dashboard/bank-import" },
      { key: "currency", name: "Валюты", icon: "💱", path: "/dashboard/currency" },
      { key: "recurring", name: "Регулярные платежи", icon: "🔄", path: "/dashboard/recurring" },
      { key: "business-trips", name: "Командировки", icon: "✈", path: "/dashboard/business-trips" },
    ],
  },
  {
    key: "accounting",
    name: "Бухгалтерия",
    icon: "▦",
    color: "#6366F1",
    items: [
      { key: "accounting", name: "Журнал проводок", icon: "▦", path: "/dashboard/accounting" },
      { key: "turnover", name: "ОСВ", icon: "📒", path: "/dashboard/turnover" },
      { key: "account-card", name: "Карточка счёта", icon: "📇", path: "/dashboard/account-card" },
      { key: "chess-board", name: "Шахматка", icon: "♟", path: "/dashboard/chess-board" },
      { key: "financial-statements", name: "Баланс и ОПУ", icon: "📊", path: "/dashboard/financial-statements" },
      { key: "assets", name: "Основные средства", icon: "🏗", path: "/dashboard/assets" },
    ],
  },
  {
    key: "hr",
    name: "Кадры и зарплата",
    icon: "◎",
    color: "#A855F7",
    items: [
      { key: "hr", name: "Сотрудники и ЗП", icon: "◎", path: "/dashboard/hr" },
      { key: "timesheet", name: "Табель Т-13", icon: "🗓", path: "/dashboard/timesheet" },
      { key: "vacations", name: "Отпуска", icon: "🏖", path: "/dashboard/vacations" },
      { key: "hr-orders", name: "Кадровые приказы", icon: "📜", path: "/dashboard/hr-orders" },
      { key: "deductions", name: "Удержания из ЗП", icon: "💸", path: "/dashboard/deductions" },
    ],
  },
  {
    key: "tax",
    name: "Налоги и отчётность",
    icon: "⚖",
    color: "#EF4444",
    items: [
      { key: "reports", name: "Отчёты ФНО", icon: "▤", path: "/dashboard/reports" },
      { key: "taxinfo", name: "НК РК 2026", icon: "⚖", path: "/dashboard/taxinfo" },
      { key: "edo", name: "ЭДО / ЭСФ", icon: "📨", path: "/dashboard/edo" },
      { key: "check", name: "Проверка БИН", icon: "🔍", path: "/dashboard/check" },
    ],
  },
  {
    key: "documents",
    name: "Документы",
    icon: "◈",
    color: "#0EA5E9",
    items: [
      { key: "documents", name: "Документы", icon: "◈", path: "/dashboard/documents" },
      { key: "workflow", name: "Документооборот", icon: "🛤", path: "/dashboard/workflow" },
    ],
  },
  {
    key: "analytics",
    name: "Аналитика и планирование",
    icon: "📈",
    color: "#14B8A6",
    items: [
      { key: "budgeting", name: "Бюджет", icon: "📊", path: "/dashboard/budgeting" },
      { key: "management-reports", name: "Управленческие отчёты", icon: "📈", path: "/dashboard/management-reports" },
      { key: "calendar", name: "Календарь", icon: "📅", path: "/dashboard/calendar" },
    ],
  },
  {
    key: "automation",
    name: "Автоматизация и AI",
    icon: "✦",
    color: "#8B5CF6",
    items: [
      { key: "ai", name: "AI Жанара", icon: "✦", path: "/dashboard/ai" },
      { key: "scheduled-tasks", name: "Регламентные задания", icon: "⏱", path: "/dashboard/scheduled-tasks" },
    ],
  },
  {
    key: "specifics",
    name: "Отраслевое",
    icon: "🏥",
    color: "#84CC16",
    items: [
      { key: "industry", name: "Отрасли", icon: "🏥", path: "/dashboard/industry" },
      { key: "transport", name: "Транспорт", icon: "🚗", path: "/dashboard/transport" },
    ],
  },
  {
    key: "system",
    name: "Настройки",
    icon: "⚙",
    color: "#6B7280",
    items: [
      { key: "companies", name: "Организации", icon: "🏢", path: "/dashboard/companies" },
      { key: "settings", name: "Настройки", icon: "⚙", path: "/dashboard/settings" },
      { key: "admin", name: "Админ-панель", icon: "🛡", path: "/dashboard/admin", adminOnly: true },
    ],
  },
];

// Уплощённый список всех модулей для активного определения и поиска
const ALL_MODULES: ModuleItem[] = [HOME_MODULE, ...MODULE_GROUPS.flatMap(g => g.items)];

const STORAGE_EXPANDED = "finerp-sidebar-expanded";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
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

    // Load expanded state
    const savedExp = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_EXPANDED) : null;
    if (savedExp) {
      try { setExpandedGroups(JSON.parse(savedExp)); } catch {}
    } else {
      // По умолчанию — раскрываем группу с активным модулем
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
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  // Определяем активный модуль
  const activeModule = ALL_MODULES.find(m => pathname === m.path)
    || ALL_MODULES.find(m => pathname.startsWith(m.path) && m.path !== "/dashboard")
    || HOME_MODULE;

  // Группа активного модуля
  const activeGroup = MODULE_GROUPS.find(g => g.items.some(i => i.key === activeModule.key));

  // Поиск
  const searchLower = search.trim().toLowerCase();
  const isSearching = searchLower.length > 0;

  function matches(name: string): boolean {
    return name.toLowerCase().includes(searchLower);
  }

  // Filter visible groups for non-admin
  const visibleGroups = MODULE_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i => !i.adminOnly || isAdmin),
  })).filter(g => g.items.length > 0);

  // При поиске показываем все совпадения раскрытыми
  function isGroupExpanded(group: ModuleGroup): boolean {
    if (isSearching) {
      return group.items.some(i => matches(i.name));
    }
    return !!expandedGroups[group.key];
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg)", color: "var(--t1)", transition: "background 0.3s, color 0.3s" }}>
      <aside className="flex flex-col flex-shrink-0 transition-all duration-300" style={{ width: collapsed ? 56 : 240, background: "var(--sidebar)", borderRight: "1px solid var(--brd)" }}>

        {/* ЛОГО */}
        <div className="flex items-center gap-2 cursor-pointer" style={{ padding: collapsed ? "14px 10px" : "14px 16px", borderBottom: "1px solid var(--brd)" }} onClick={() => setCollapsed(!collapsed)}>
          <div className="flex items-center justify-center font-extrabold text-white flex-shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366F1, #A855F7)", fontSize: 15 }}>F</div>
          {!collapsed && (
            <div>
              <div className="text-sm font-extrabold">Finstat.kz</div>
              <div className="text-[9px] tracking-widest" style={{ color: "var(--t3)" }}>НК РК 2026</div>
            </div>
          )}
        </div>

        {/* ПОИСК */}
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
                <button
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: "var(--t3)",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >×</button>
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

        {/* НАВИГАЦИЯ */}
        <nav className="flex-1 flex flex-col gap-0.5 p-1.5 overflow-y-auto">

          {/* ГЛАВНАЯ — всегда сверху */}
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

          {/* ГРУППЫ */}
          {visibleGroups.map(group => {
            // При поиске фильтруем элементы группы
            const visibleItems = isSearching
              ? group.items.filter(i => matches(i.name))
              : group.items;

            // При поиске группа показывается, только если есть совпадения
            if (isSearching && visibleItems.length === 0) return null;

            const expanded = isGroupExpanded(group);
            const hasActive = group.items.some(i => i.key === activeModule.key);

            // В свёрнутом сайдбаре — показываем только иконки модулей без заголовков групп
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
                {/* Заголовок группы */}
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
                  {!isSearching && (
                    <span style={{ fontSize: 9, opacity: 0.7 }}>{expanded ? "▾" : "▸"}</span>
                  )}
                  {isSearching && (
                    <span style={{ fontSize: 9, color: "var(--accent)" }}>{visibleItems.length}</span>
                  )}
                </button>

                {/* Модули группы */}
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

          {/* Пустой результат поиска */}
          {isSearching && visibleGroups.every(g => g.items.filter(i => matches(i.name)).length === 0) && !matches(HOME_MODULE.name) && (
            <div className="text-center py-4 text-[11px]" style={{ color: "var(--t3)" }}>
              Ничего не найдено
            </div>
          )}
        </nav>

        {/* НИЖНЯЯ ПАНЕЛЬ */}
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

      {/* ОСНОВНОЙ КОНТЕНТ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between" style={{ padding: "12px 28px", borderBottom: "1px solid var(--brd)" }}>
          <div>
            {/* Хлебные крошки */}
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
        </header>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </div>
  );
}
