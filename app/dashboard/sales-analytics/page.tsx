"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "abc-customers" | "abc-products" | "xyz" | "profitability" | "managers" | "trends";

const ABC_CLASSES = {
  A: { name: "Класс A", color: "#10B981", desc: "ТОП клиенты — 80% выручки" },
  B: { name: "Класс B", color: "#F59E0B", desc: "Средние — 15% выручки" },
  C: { name: "Класс C", color: "#6B7280", desc: "Малые — 5% выручки" },
};

const XYZ_CLASSES = {
  X: { name: "Класс X", color: "#10B981", desc: "Стабильный спрос (CV < 10%)" },
  Y: { name: "Класс Y", color: "#F59E0B", desc: "Колеблющийся (CV 10-25%)" },
  Z: { name: "Класс Z", color: "#EF4444", desc: "Нерегулярный (CV > 25%)" },
};

export default function SalesAnalyticsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("abc-customers");
  const [year, setYear] = useState(new Date().getFullYear());
  const [docs, setDocs] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [nomenclature, setNomenclature] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { load(); }, [year]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [d, p, c, n] = await Promise.all([
      supabase.from("documents").select("*").eq("user_id", user.id).eq("status", "done").gte("doc_date", yearStart).lte("doc_date", yearEnd),
      supabase.from("pos_receipts").select("*").eq("user_id", user.id).gte("created_at", yearStart).lte("created_at", yearEnd + "T23:59:59"),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
      supabase.from("nomenclature").select("*").eq("user_id", user.id),
    ]);
    setDocs(d.data || []);
    setPos(p.data || []);
    setCounterparties(c.data || []);
    setNomenclature(n.data || []);
    setLoaded(true);
  }

  // Только продажи (СФ, счета, акты)
  const sales = docs.filter(d => ["invoice", "sf", "act"].includes(d.doc_type));

  // ═══ ABC АНАЛИЗ КЛИЕНТОВ ═══
  function getABCCustomers() {
    const byCustomer: Record<string, { name: string; bin?: string; revenue: number; orders: number }> = {};
    sales.forEach(d => {
      const key = d.counterparty_name || "Без имени";
      if (!byCustomer[key]) byCustomer[key] = { name: key, bin: d.counterparty_bin, revenue: 0, orders: 0 };
      byCustomer[key].revenue += Number(d.total_with_nds || 0);
      byCustomer[key].orders += 1;
    });

    const list = Object.values(byCustomer).sort((a, b) => b.revenue - a.revenue);
    const total = list.reduce((a, c) => a + c.revenue, 0);
    let cumulative = 0;
    return list.map(c => {
      cumulative += c.revenue;
      const cumPct = total > 0 ? (cumulative / total) * 100 : 0;
      const sharePct = total > 0 ? (c.revenue / total) * 100 : 0;
      let abcClass: "A" | "B" | "C" = "C";
      if (cumPct <= 80) abcClass = "A";
      else if (cumPct <= 95) abcClass = "B";
      return { ...c, share: sharePct, cumulative: cumPct, class: abcClass };
    });
  }

  // ═══ ABC АНАЛИЗ ТОВАРОВ ═══
  function getABCProducts() {
    const byProduct: Record<string, { name: string; revenue: number; quantity: number; cost: number }> = {};

    sales.forEach(d => {
      (d.items || []).forEach((it: any) => {
        const name = it.name || "Без имени";
        if (!byProduct[name]) byProduct[name] = { name, revenue: 0, quantity: 0, cost: 0 };
        byProduct[name].revenue += Number(it.total || 0);
        byProduct[name].quantity += Number(it.quantity || 0);
        const n = nomenclature.find(x => x.id === it.nomenclature_id || x.name === name);
        byProduct[name].cost += Number(it.quantity || 0) * Number(n?.purchase_price || 0);
      });
    });

    pos.forEach(r => {
      (r.items || []).forEach((it: any) => {
        const name = it.name || "Без имени";
        if (!byProduct[name]) byProduct[name] = { name, revenue: 0, quantity: 0, cost: 0 };
        byProduct[name].revenue += Number(it.total || it.price * it.quantity || 0);
        byProduct[name].quantity += Number(it.quantity || 0);
        const n = nomenclature.find(x => x.id === it.nomenclature_id || x.name === name);
        byProduct[name].cost += Number(it.quantity || 0) * Number(n?.purchase_price || 0);
      });
    });

    const list = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue);
    const total = list.reduce((a, p) => a + p.revenue, 0);
    let cumulative = 0;
    return list.map(p => {
      cumulative += p.revenue;
      const cumPct = total > 0 ? (cumulative / total) * 100 : 0;
      const sharePct = total > 0 ? (p.revenue / total) * 100 : 0;
      let abcClass: "A" | "B" | "C" = "C";
      if (cumPct <= 80) abcClass = "A";
      else if (cumPct <= 95) abcClass = "B";
      return { ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100) : 0, share: sharePct, cumulative: cumPct, class: abcClass };
    });
  }

  // ═══ XYZ АНАЛИЗ (стабильность спроса) ═══
  function getXYZ() {
    // Группируем по товарам по месяцам
    const byProductMonth: Record<string, Record<number, number>> = {};

    [...sales, ...pos].forEach(d => {
      const month = new Date(d.doc_date || d.created_at).getMonth();
      (d.items || []).forEach((it: any) => {
        const name = it.name || "Без имени";
        if (!byProductMonth[name]) byProductMonth[name] = {};
        byProductMonth[name][month] = (byProductMonth[name][month] || 0) + Number(it.quantity || 0);
      });
    });

    return Object.entries(byProductMonth).map(([name, months]) => {
      const values = Array.from({ length: 12 }, (_, i) => months[i] || 0);
      const sum = values.reduce((a, v) => a + v, 0);
      const avg = sum / 12;
      const variance = values.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / 12;
      const stdDev = Math.sqrt(variance);
      const cv = avg > 0 ? (stdDev / avg) * 100 : 0;

      let xyzClass: "X" | "Y" | "Z" = "Z";
      if (cv < 10) xyzClass = "X";
      else if (cv < 25) xyzClass = "Y";

      return { name, totalQty: sum, avgQty: avg, stdDev, cv, class: xyzClass, monthlyData: values };
    }).filter(p => p.totalQty > 0).sort((a, b) => b.totalQty - a.totalQty);
  }

  // ═══ ПРИБЫЛЬНОСТЬ ═══
  function getProfitability() {
    let totalRevenue = 0;
    let totalCost = 0;
    const byProduct: Record<string, { name: string; revenue: number; cost: number; quantity: number }> = {};

    sales.forEach(d => {
      (d.items || []).forEach((it: any) => {
        const name = it.name || "Без имени";
        if (!byProduct[name]) byProduct[name] = { name, revenue: 0, cost: 0, quantity: 0 };
        const rev = Number(it.total || 0);
        const n = nomenclature.find(x => x.id === it.nomenclature_id || x.name === name);
        const cost = Number(it.quantity || 0) * Number(n?.purchase_price || 0);
        byProduct[name].revenue += rev;
        byProduct[name].cost += cost;
        byProduct[name].quantity += Number(it.quantity || 0);
        totalRevenue += rev;
        totalCost += cost;
      });
    });

    const list = Object.values(byProduct).map(p => ({
      ...p,
      profit: p.revenue - p.cost,
      margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100) : 0,
    })).sort((a, b) => b.profit - a.profit);

    return { list, totalRevenue, totalCost, totalProfit: totalRevenue - totalCost };
  }

  // ═══ МЕНЕДЖЕРЫ ═══
  function getManagers() {
    const byMgr: Record<string, { name: string; revenue: number; orders: number; customers: Set<string> }> = {};
    sales.forEach(d => {
      const mgr = d.responsible_name || d.created_by_name || "Не указан";
      if (!byMgr[mgr]) byMgr[mgr] = { name: mgr, revenue: 0, orders: 0, customers: new Set() };
      byMgr[mgr].revenue += Number(d.total_with_nds || 0);
      byMgr[mgr].orders += 1;
      if (d.counterparty_name) byMgr[mgr].customers.add(d.counterparty_name);
    });
    return Object.values(byMgr).map(m => ({
      ...m,
      uniqueCustomers: m.customers.size,
      avgCheck: m.orders > 0 ? m.revenue / m.orders : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }

  // ═══ ТРЕНДЫ ПО МЕСЯЦАМ ═══
  function getMonthlyTrend() {
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, orders: 0 }));
    sales.forEach(d => {
      const m = new Date(d.doc_date).getMonth();
      months[m].revenue += Number(d.total_with_nds || 0);
      months[m].orders += 1;
    });
    pos.forEach(r => {
      const m = new Date(r.created_at).getMonth();
      months[m].revenue += Number(r.total_sum || 0);
      months[m].orders += 1;
    });
    return months;
  }

  if (!loaded) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка данных...</div>;

  const customers = getABCCustomers();
  const products = getABCProducts();
  const xyz = getXYZ();
  const profit = getProfitability();
  const managers = getManagers();
  const trend = getMonthlyTrend();

  // KPI
  const totalRevenue = profit.totalRevenue;
  const aClassCustomers = customers.filter(c => c.class === "A").length;
  const aClassProducts = products.filter(p => p.class === "A").length;
  const xClassProducts = xyz.filter(p => p.class === "X").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-center">
        <div className="text-xs" style={{ color: "var(--t3)" }}>
          ABC/XYZ-анализ, прибыльность товаров и клиентов, рейтинг менеджеров, помесячные тренды
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 120 }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y} год</option>)}
        </select>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Выручка</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalRevenue)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{sales.length + pos.length} продаж</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💎 Прибыль</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{fmtMoney(profit.totalProfit)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Маржа: {totalRevenue > 0 ? ((profit.totalProfit / totalRevenue) * 100).toFixed(1) : 0}%</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⭐ Класс A клиентов</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{aClassCustomers}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Из {customers.length} всего</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🎯 Стабильных товаров (X)</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{xClassProducts}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Из {xyz.length} всего</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          ["abc-customers", "🏆 ABC клиенты"],
          ["abc-products", "📦 ABC товары"],
          ["xyz", "📊 XYZ стабильность"],
          ["profitability", "💎 Прибыльность"],
          ["managers", "👥 Менеджеры"],
          ["trends", "📈 Тренды"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ABC КЛИЕНТЫ ═══ */}
      {tab === "abc-customers" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-2">🏆 ABC-анализ клиентов</div>
          <div className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>
            Принцип Парето: A-клиенты дают 80% выручки, B — следующие 15%, C — оставшиеся 5%. Концентрируйтесь на A.
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {(["A", "B", "C"] as const).map(cls => {
              const list = customers.filter(c => c.class === cls);
              const sum = list.reduce((a, c) => a + c.revenue, 0);
              const c = ABC_CLASSES[cls];
              return (
                <div key={cls} className="rounded-lg p-3" style={{ background: c.color + "10", border: `1px solid ${c.color}30` }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.name}</div>
                  <div className="text-base font-bold" style={{ color: c.color }}>{list.length} клиентов</div>
                  <div className="text-[11px]" style={{ color: c.color }}>{fmtMoney(sum)} ₸</div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.desc}</div>
                </div>
              );
            })}
          </div>

          <table>
            <thead><tr>{["#", "Клиент", "БИН", "Заказов", "Выручка", "Доля", "Накопит.", "Класс"].map(h => (
              <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет данных о продажах</td></tr>
              ) : customers.slice(0, 50).map((c, i) => {
                const cls = ABC_CLASSES[c.class];
                return (
                  <tr key={i}>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{i + 1}</td>
                    <td className="p-2 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{c.name}</td>
                    <td className="p-2 text-[11px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.bin || "—"}</td>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.orders}</td>
                    <td className="p-2 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.revenue)} ₸</td>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{c.share.toFixed(2)}%</td>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.cumulative.toFixed(1)}%</td>
                    <td className="p-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: cls.color + "20", color: cls.color }}>{c.class}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ABC ТОВАРЫ ═══ */}
      {tab === "abc-products" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-2">📦 ABC-анализ товаров</div>
          <div className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>
            Какие товары приносят основную выручку. A — нельзя допустить дефицита, C — можно сократить ассортимент.
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {(["A", "B", "C"] as const).map(cls => {
              const list = products.filter(p => p.class === cls);
              const sum = list.reduce((a, p) => a + p.revenue, 0);
              const c = ABC_CLASSES[cls];
              return (
                <div key={cls} className="rounded-lg p-3" style={{ background: c.color + "10", border: `1px solid ${c.color}30` }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.name}</div>
                  <div className="text-base font-bold" style={{ color: c.color }}>{list.length} товаров</div>
                  <div className="text-[11px]" style={{ color: c.color }}>{fmtMoney(sum)} ₸</div>
                </div>
              );
            })}
          </div>

          <table>
            <thead><tr>{["#", "Товар", "Кол-во", "Выручка", "Прибыль", "Маржа %", "Доля", "Класс"].map(h => (
              <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет данных</td></tr>
              ) : products.slice(0, 50).map((p, i) => {
                const cls = ABC_CLASSES[p.class];
                return (
                  <tr key={i}>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{i + 1}</td>
                    <td className="p-2 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{p.name}</td>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.quantity.toFixed(0)}</td>
                    <td className="p-2 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(p.revenue)} ₸</td>
                    <td className="p-2 text-[12px] text-right" style={{ color: p.profit >= 0 ? "#A855F7" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(p.profit)} ₸</td>
                    <td className="p-2 text-[11px]" style={{ color: p.margin >= 0 ? "#A855F7" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{p.margin.toFixed(1)}%</td>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{p.share.toFixed(2)}%</td>
                    <td className="p-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: cls.color + "20", color: cls.color }}>{p.class}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ XYZ ═══ */}
      {tab === "xyz" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-2">📊 XYZ-анализ стабильности спроса</div>
          <div className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>
            Коэффициент вариации (CV): X — стабильно (CV{"<"}10%), Y — колеблется (10–25%), Z — нерегулярно ({">"}25%). XX — товары с гарантированным спросом.
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {(["X", "Y", "Z"] as const).map(cls => {
              const list = xyz.filter(p => p.class === cls);
              const c = XYZ_CLASSES[cls];
              return (
                <div key={cls} className="rounded-lg p-3" style={{ background: c.color + "10", border: `1px solid ${c.color}30` }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.name}</div>
                  <div className="text-base font-bold" style={{ color: c.color }}>{list.length} товаров</div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.desc}</div>
                </div>
              );
            })}
          </div>

          <table>
            <thead><tr>{["#", "Товар", "Всего ед.", "Среднее/мес", "Откл. (σ)", "CV %", "Класс"].map(h => (
              <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {xyz.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет данных</td></tr>
              ) : xyz.slice(0, 50).map((p, i) => {
                const cls = XYZ_CLASSES[p.class];
                return (
                  <tr key={i}>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{i + 1}</td>
                    <td className="p-2 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{p.name}</td>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{p.totalQty.toFixed(0)}</td>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{p.avgQty.toFixed(2)}</td>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.stdDev.toFixed(2)}</td>
                    <td className="p-2 text-[11px] font-bold" style={{ color: cls.color, borderBottom: "1px solid var(--brd)" }}>{p.cv.toFixed(1)}%</td>
                    <td className="p-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: cls.color + "20", color: cls.color }}>{p.class}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ПРИБЫЛЬНОСТЬ ═══ */}
      {tab === "profitability" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">💎 Прибыльность товаров</div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg p-3" style={{ background: "#10B98110" }}>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Общая выручка</div>
              <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(profit.totalRevenue)} ₸</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "#EF444410" }}>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Себестоимость</div>
              <div className="text-base font-bold" style={{ color: "#EF4444" }}>{fmtMoney(profit.totalCost)} ₸</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "#A855F710" }}>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Прибыль</div>
              <div className="text-base font-bold" style={{ color: "#A855F7" }}>{fmtMoney(profit.totalProfit)} ₸</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Маржа: {profit.totalRevenue > 0 ? ((profit.totalProfit / profit.totalRevenue) * 100).toFixed(1) : 0}%</div>
            </div>
          </div>

          <table>
            <thead><tr>{["#", "Товар", "Кол-во", "Выручка", "Себестоимость", "Прибыль", "Маржа"].map(h => (
              <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {profit.list.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет данных</td></tr>
              ) : profit.list.slice(0, 50).map((p, i) => (
                <tr key={i}>
                  <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{i + 1}</td>
                  <td className="p-2 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{p.name}</td>
                  <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.quantity.toFixed(0)}</td>
                  <td className="p-2 text-[12px] text-right" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(p.revenue)} ₸</td>
                  <td className="p-2 text-[12px] text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(p.cost)} ₸</td>
                  <td className="p-2 text-[12px] text-right font-bold" style={{ color: p.profit >= 0 ? "#A855F7" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(p.profit)} ₸</td>
                  <td className="p-2 text-[12px]" style={{ color: p.margin >= 0 ? "#A855F7" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{p.margin.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ МЕНЕДЖЕРЫ ═══ */}
      {tab === "managers" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-2">👥 Рейтинг менеджеров по продажам</div>
          <div className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>
            Для группировки по менеджерам используется поле «Ответственный» в документах
          </div>

          {managers.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет данных. Заполните «Ответственный» в документах.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {managers.map((m, i) => {
                const max = Math.max(...managers.map(x => x.revenue), 1);
                const pct = (m.revenue / max) * 100;
                return (
                  <div key={i} className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <div className="text-sm font-bold">#{i + 1} {m.name}</div>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>{m.orders} продаж • {m.uniqueCustomers} уникальных клиентов • Средний чек: {fmtMoney(m.avgCheck)} ₸</div>
                      </div>
                      <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(m.revenue)} ₸</div>
                    </div>
                    <div style={{ height: 6, background: "var(--card)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#10B981" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ ТРЕНДЫ ═══ */}
      {tab === "trends" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📈 Тренды продаж по месяцам {year}</div>

          <div className="flex items-end gap-2 mb-4" style={{ height: 200 }}>
            {trend.map((m, i) => {
              const max = Math.max(...trend.map(x => x.revenue), 1);
              const h = (m.revenue / max) * 180;
              const monthName = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"][i];
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="text-[9px]" style={{ color: "var(--t3)" }}>{m.revenue > 0 ? Math.round(m.revenue / 1000) + "К" : ""}</div>
                  <div style={{ height: h, background: m.revenue > 0 ? "linear-gradient(to top, #6366F1, #A855F7)" : "var(--brd)", width: "100%", borderRadius: "4px 4px 0 0", minHeight: 2 }} />
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{monthName}</div>
                </div>
              );
            })}
          </div>

          <table>
            <thead><tr>{["Месяц", "Продаж", "Выручка", "Средний чек"].map(h => (
              <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {trend.map((m, i) => (
                <tr key={i}>
                  <td className="p-2 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"][i]}</td>
                  <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{m.orders}</td>
                  <td className="p-2 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(m.revenue)} ₸</td>
                  <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{m.orders > 0 ? fmtMoney(m.revenue / m.orders) + " ₸" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
