"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatNumber, formatPercent, formatRelativeTime } from "@/lib/analytics";

type Period = "today" | "week" | "month" | "all";

export default function AnalyticsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  
  const [pageViews, setPageViews] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => { check(); }, []);
  useEffect(() => { if (isAdmin) loadData(); }, [period, isAdmin]);

  async function check() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }
    
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    
    if (profile?.role !== "admin") {
      router.push("/dashboard");
      return;
    }
    setIsAdmin(true);
  }

  function getDateFilter(): string {
    const now = new Date();
    let start: Date;
    
    switch (period) {
      case "today":
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "all":
        start = new Date("2020-01-01");
        break;
    }
    
    return start.toISOString();
  }

  async function loadData() {
    setLoading(true);
    const since = getDateFilter();

    const [pvRes, sessRes, sumRes] = await Promise.all([
      supabase.from("page_views").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      supabase.from("user_sessions").select("*").gte("first_seen", since).order("first_seen", { ascending: false }).limit(200),
      supabase.rpc("get_analytics_summary", { p_start_date: since, p_end_date: new Date().toISOString() }),
    ]);

    setPageViews(pvRes.data || []);
    setSessions(sessRes.data || []);
    setSummary(sumRes.data?.[0] || null);
    setLoading(false);
  }

  // Графики по дням (для chart)
  const dailyChart = useMemo(() => {
    const map: Record<string, { views: number; uniques: Set<string> }> = {};
    pageViews.forEach(pv => {
      const day = pv.created_at.slice(0, 10);
      if (!map[day]) map[day] = { views: 0, uniques: new Set() };
      map[day].views++;
      map[day].uniques.add(pv.session_id);
    });
    return Object.entries(map)
      .map(([day, data]) => ({ day, views: data.views, uniques: data.uniques.size }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [pageViews]);

  // Топ страниц
  const topPages = useMemo(() => {
    const map: Record<string, number> = {};
    pageViews.forEach(pv => { map[pv.path] = (map[pv.path] || 0) + 1; });
    return Object.entries(map)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [pageViews]);

  // Устройства
  const devices = useMemo(() => {
    const map: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0, unknown: 0 };
    sessions.forEach(s => { map[s.device_type || "unknown"]++; });
    return map;
  }, [sessions]);

  // Браузеры
  const browsers = useMemo(() => {
    const map: Record<string, number> = {};
    sessions.forEach(s => { 
      const b = s.browser || "Unknown";
      map[b] = (map[b] || 0) + 1; 
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [sessions]);

  // Страны
  const countries = useMemo(() => {
    const map: Record<string, number> = {};
    sessions.forEach(s => { 
      const c = s.country || "Неизвестно";
      map[c] = (map[c] || 0) + 1; 
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [sessions]);

  // Источники трафика
  const sources = useMemo(() => {
    const map: Record<string, number> = {};
    sessions.forEach(s => {
      let source = "direct";
      if (s.landing_utm_source) source = s.landing_utm_source;
      else if (s.landing_referrer) {
        try {
          const url = new URL(s.landing_referrer);
          source = url.hostname.replace("www.", "");
        } catch { source = "direct"; }
      }
      map[source] = (map[source] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [sessions]);

  if (loading || !isAdmin) {
    return <div className="p-8 text-center" style={{ color: "var(--t3)" }}>Загрузка...</div>;
  }

  const maxChart = Math.max(...dailyChart.map(d => d.views), 1);

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">📊 Аналитика</h1>
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>
            Посещения, конверсии, источники трафика
          </p>
        </div>

        {/* Селектор периода */}
        <div className="flex gap-1">
          {([
            { key: "today", label: "Сегодня" },
            { key: "week", label: "7 дней" },
            { key: "month", label: "30 дней" },
            { key: "all", label: "Всё время" },
          ] as { key: Period; label: string }[]).map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="cursor-pointer rounded-lg text-[11px] font-semibold"
              style={{
                padding: "6px 12px",
                background: period === p.key ? "linear-gradient(135deg, #6366F1, #A855F7)" : "var(--card)",
                color: period === p.key ? "#fff" : "var(--t2)",
                border: period === p.key ? "none" : "1px solid var(--brd)",
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI карточки */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Просмотров", value: summary?.total_views || 0, color: "#6366F1", icon: "👁" },
          { label: "Уникальных", value: summary?.unique_visitors || 0, color: "#A855F7", icon: "👤" },
          { label: "Регистраций", value: summary?.registered_users || 0, color: "#10B981", icon: "✓" },
          { label: "Платежей", value: summary?.paying_users || 0, color: "#F59E0B", icon: "💰" },
          { label: "Конверсия", value: formatPercent(Number(summary?.conversion_rate || 0)), color: "#EC4899", icon: "📈", isText: true },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3"
            style={{ background: s.color + "15", border: `1px solid ${s.color}40` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ fontSize: 12 }}>{s.icon}</span>
              <span className="text-[10px] font-bold" style={{ color: s.color }}>{s.label.toUpperCase()}</span>
            </div>
            <div className="text-2xl font-extrabold" style={{ color: s.color }}>
              {s.isText ? s.value : formatNumber(Number(s.value))}
            </div>
          </div>
        ))}
      </div>

      {/* График по дням */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">📈 Просмотры по дням</h2>
          <div className="flex gap-3 text-[10px]">
            <span style={{ color: "#6366F1" }}>● Просмотры</span>
            <span style={{ color: "#A855F7" }}>● Уникальные</span>
          </div>
        </div>
        {dailyChart.length === 0 ? (
          <div className="text-center py-8 text-[12px]" style={{ color: "var(--t3)" }}>
            Нет данных за этот период
          </div>
        ) : (
          <div className="flex items-end gap-1" style={{ height: 180 }}>
            {dailyChart.map(d => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.views} просмотров`}>
                <div className="flex-1 flex flex-col justify-end w-full gap-0.5">
                  <div style={{
                    height: `${(d.views / maxChart) * 100}%`,
                    background: "linear-gradient(180deg, #6366F1, #A855F7)",
                    borderRadius: "4px 4px 0 0",
                    minHeight: 2,
                  }}/>
                </div>
                <div className="text-[8px]" style={{ color: "var(--t3)" }}>
                  {d.day.slice(8, 10)}.{d.day.slice(5, 7)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2 колонки: устройства + источники */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Устройства */}
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <h2 className="text-base font-bold mb-3">📱 Устройства</h2>
          <div className="flex flex-col gap-2">
            {Object.entries(devices).map(([type, count]) => {
              const total = Object.values(devices).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (count / total) * 100 : 0;
              const labels: Record<string, string> = { desktop: "🖥 Компьютер", mobile: "📱 Телефон", tablet: "📋 Планшет", unknown: "❔ Неизвестно" };
              if (count === 0) return null;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span>{labels[type]}</span>
                    <span className="font-bold">{count} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #6366F1, #A855F7)" }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Источники */}
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <h2 className="text-base font-bold mb-3">🌐 Источники трафика</h2>
          <div className="flex flex-col gap-2">
            {sources.length === 0 ? (
              <div className="text-center py-4 text-[11px]" style={{ color: "var(--t3)" }}>Нет данных</div>
            ) : sources.map((s, i) => {
              const max = sources[0].count;
              const pct = (s.count / max) * 100;
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold">{s.name}</span>
                    <span style={{ color: "var(--t3)" }}>{s.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#A855F7" }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2 колонки: топ страниц + браузеры */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Топ страниц */}
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <h2 className="text-base font-bold mb-3">📄 Топ страниц</h2>
          <div className="flex flex-col gap-1">
            {topPages.length === 0 ? (
              <div className="text-center py-4 text-[11px]" style={{ color: "var(--t3)" }}>Нет данных</div>
            ) : topPages.map((p, i) => (
              <div key={p.path} className="flex items-center justify-between p-2 rounded text-[11px]"
                style={{ background: i === 0 ? "#A855F715" : "transparent" }}>
                <span className="font-mono truncate flex-1" style={{ color: "var(--t1)" }}>{p.path}</span>
                <span className="font-bold ml-2" style={{ color: "#A855F7" }}>{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Браузеры */}
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <h2 className="text-base font-bold mb-3">🌍 Браузеры и страны</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold mb-2" style={{ color: "var(--t3)" }}>БРАУЗЕРЫ</div>
              {browsers.slice(0, 5).map(b => (
                <div key={b.name} className="flex items-center justify-between text-[11px] py-0.5">
                  <span>{b.name}</span>
                  <span className="font-bold" style={{ color: "#6366F1" }}>{b.count}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-bold mb-2" style={{ color: "var(--t3)" }}>СТРАНЫ</div>
              {countries.slice(0, 5).map(c => (
                <div key={c.name} className="flex items-center justify-between text-[11px] py-0.5">
                  <span>{c.name}</span>
                  <span className="font-bold" style={{ color: "#10B981" }}>{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Последние сессии */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">🕐 Последние посетители</h2>
          <button onClick={() => router.push("/dashboard/admin/users")}
            className="cursor-pointer rounded-lg text-[10px] font-semibold"
            style={{
              padding: "5px 10px", background: "var(--bg)",
              border: "1px solid var(--brd)", color: "var(--t2)",
            }}>
            Все пользователи →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--brd)" }}>
                <th className="text-left p-2" style={{ color: "var(--t3)" }}>Время</th>
                <th className="text-left p-2" style={{ color: "var(--t3)" }}>Устройство</th>
                <th className="text-left p-2" style={{ color: "var(--t3)" }}>Браузер</th>
                <th className="text-left p-2" style={{ color: "var(--t3)" }}>Страна</th>
                <th className="text-left p-2" style={{ color: "var(--t3)" }}>Откуда</th>
                <th className="text-left p-2" style={{ color: "var(--t3)" }}>Стр.</th>
                <th className="text-left p-2" style={{ color: "var(--t3)" }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 30).map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--brd)" }}>
                  <td className="p-2" style={{ color: "var(--t2)" }}>{formatRelativeTime(s.first_seen)}</td>
                  <td className="p-2">
                    {s.device_type === "mobile" ? "📱" : s.device_type === "tablet" ? "📋" : "🖥"} {s.device_type}
                  </td>
                  <td className="p-2">{s.browser || "—"}</td>
                  <td className="p-2">{s.country || "—"}</td>
                  <td className="p-2 truncate" style={{ maxWidth: 150 }}>{s.landing_utm_source || s.landing_referrer || "direct"}</td>
                  <td className="p-2 font-bold">{s.page_views_count}</td>
                  <td className="p-2">
                    {s.registered_at ? (
                      <span style={{ background: "#10B98115", color: "#10B981", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>✓ Регистрирован</span>
                    ) : (
                      <span style={{ background: "#6B728015", color: "#6B7280", padding: "2px 6px", borderRadius: 4, fontSize: 9 }}>Гость</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
