"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "cashflow" | "pnl" | "ar-ap" | "kpi";

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

// Категории счетов для P&L и Cash Flow
const INCOME_ACCOUNTS = ["6010", "6020", "6030", "6280", "6290"]; // доходы
const EXPENSE_ACCOUNTS = ["7010", "7110", "7120", "7210", "7220", "7230", "7310", "7410", "7510", "7990"]; // расходы
const CASH_ACCOUNTS = ["1010", "1030", "1040"]; // деньги (касса, банк, валюта)

export default function ManagementReportsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("cashflow");
  const [year, setYear] = useState(new Date().getFullYear());
  const [journal, setJournal] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { load(); }, [year]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const [j, d, o, c, cp] = await Promise.all([
      supabase.from("journal_entries").select("*").eq("user_id", user.id).gte("entry_date", yearStart).lte("entry_date", yearEnd),
      supabase.from("documents").select("*").eq("user_id", user.id).gte("doc_date", yearStart).lte("doc_date", yearEnd),
      supabase.from("orders").select("*").eq("user_id", user.id),
      supabase.from("contracts").select("*").eq("user_id", user.id),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
    ]);
    setJournal(j.data || []);
    setDocs(d.data || []);
    setOrders(o.data || []);
    setContracts(c.data || []);
    setCounterparties(cp.data || []);
    setLoaded(true);
  }

  // ═══ ДВИЖЕНИЕ ДЕНЕЖНЫХ СРЕДСТВ (Cash Flow) ═══
  function getCashFlowByMonth() {
    const months = MONTHS.map((_, i) => ({
      month: i + 1,
      inflow: 0,
      outflow: 0,
      operating_in: 0,
      operating_out: 0,
      investing: 0,
      financing: 0,
      net: 0,
    }));

    journal.forEach(e => {
      const m = new Date(e.entry_date).getMonth();
      const debit = String(e.debit_account || "");
      const credit = String(e.credit_account || "");
      const amount = Number(e.amount || 0);

      // Поступление денег: Дт 1010/1030/1040 = приход
      if (CASH_ACCOUNTS.some(a => debit.startsWith(a))) {
        months[m].inflow += amount;
        if (credit.startsWith("6") || credit.startsWith("12")) months[m].operating_in += amount;
        else if (credit.startsWith("3")) months[m].operating_in += amount;
        else if (credit.startsWith("23")) months[m].financing += amount;
      }

      // Списание денег: Кт 1010/1030/1040 = расход
      if (CASH_ACCOUNTS.some(a => credit.startsWith(a))) {
        months[m].outflow += amount;
        if (debit.startsWith("7") || debit.startsWith("8")) months[m].operating_out -= amount;
        else if (debit.startsWith("3")) months[m].operating_out -= amount;
        else if (debit.startsWith("2") && !debit.startsWith("23")) months[m].investing -= amount;
        else if (debit.startsWith("23")) months[m].financing -= amount;
      }
    });

    months.forEach(m => { m.net = m.inflow - m.outflow; });
    return months;
  }

  // ═══ ОТЧЁТ О ПРИБЫЛЯХ И УБЫТКАХ (P&L) ═══
  function getPnlByMonth() {
    const months = MONTHS.map((_, i) => ({
      month: i + 1,
      revenue: 0,
      cogs: 0,
      gross: 0,
      opex: 0,
      operating: 0,
      other_in: 0,
      other_out: 0,
      ebt: 0,
      tax: 0,
      net: 0,
    }));

    journal.forEach(e => {
      const m = new Date(e.entry_date).getMonth();
      const debit = String(e.debit_account || "");
      const credit = String(e.credit_account || "");
      const amount = Number(e.amount || 0);

      // Выручка: Кт 6010, 6020, 6030
      if (credit.startsWith("601") || credit.startsWith("602") || credit.startsWith("603")) {
        months[m].revenue += amount;
      }
      // Прочие доходы: Кт 628, 629
      if (credit.startsWith("628") || credit.startsWith("629")) {
        months[m].other_in += amount;
      }
      // Себестоимость: Дт 7010
      if (debit.startsWith("701")) {
        months[m].cogs += amount;
      }
      // Операционные расходы: Дт 711-751
      if (debit.startsWith("711") || debit.startsWith("712") || debit.startsWith("721") ||
          debit.startsWith("722") || debit.startsWith("723") || debit.startsWith("731") ||
          debit.startsWith("741") || debit.startsWith("751")) {
        months[m].opex += amount;
      }
      // Прочие расходы: Дт 799
      if (debit.startsWith("799")) {
        months[m].other_out += amount;
      }
      // КПН: Дт 7710
      if (debit.startsWith("771")) {
        months[m].tax += amount;
      }
    });

    months.forEach(m => {
      m.gross = m.revenue - m.cogs;
      m.operating = m.gross - m.opex;
      m.ebt = m.operating + m.other_in - m.other_out;
      m.net = m.ebt - m.tax;
    });
    return months;
  }

  // ═══ ДЕБИТОРСКАЯ И КРЕДИТОРСКАЯ ЗАДОЛЖЕННОСТЬ ═══
  function getReceivablesPayables() {
    const byCp: Record<string, { id?: string; name: string; bin?: string; ar: number; ap: number; docs: any[] }> = {};

    docs.forEach(d => {
      const name = d.counterparty_name || "Не указан";
      if (!byCp[name]) byCp[name] = { id: d.counterparty_id, name, bin: d.counterparty_bin, ar: 0, ap: 0, docs: [] };

      const total = Number(d.total_with_nds || 0);
      const isPaid = d.status === "done";

      // Дебиторка — нам должны (счета и СФ покупателям)
      if (d.doc_type === "invoice" || d.doc_type === "sf" || d.doc_type === "act") {
        if (!isPaid) {
          byCp[name].ar += total;
          byCp[name].docs.push({ ...d, debt_type: "ar" });
        }
      }
      // Кредиторка — мы должны (поступления, акты от поставщиков)
      if (d.doc_type === "receipt" || d.doc_type === "purchase" || d.doc_type === "waybill") {
        if (!isPaid) {
          byCp[name].ap += total;
          byCp[name].docs.push({ ...d, debt_type: "ap" });
        }
      }
    });

    return Object.values(byCp).filter(c => c.ar > 0 || c.ap > 0).sort((a, b) => (b.ar + b.ap) - (a.ar + a.ap));
  }

  // ═══ KPI ═══
  function getKpi() {
    const pnl = getPnlByMonth();
    const cf = getCashFlowByMonth();
    const arAp = getReceivablesPayables();

    const totalRevenue = pnl.reduce((a, m) => a + m.revenue, 0);
    const totalCogs = pnl.reduce((a, m) => a + m.cogs, 0);
    const totalOpex = pnl.reduce((a, m) => a + m.opex, 0);
    const totalNet = pnl.reduce((a, m) => a + m.net, 0);
    const totalCashIn = cf.reduce((a, m) => a + m.inflow, 0);
    const totalCashOut = cf.reduce((a, m) => a + m.outflow, 0);

    const grossMargin = totalRevenue > 0 ? (totalRevenue - totalCogs) / totalRevenue * 100 : 0;
    const netMargin = totalRevenue > 0 ? totalNet / totalRevenue * 100 : 0;
    const totalAR = arAp.reduce((a, c) => a + c.ar, 0);
    const totalAP = arAp.reduce((a, c) => a + c.ap, 0);

    return {
      totalRevenue, totalCogs, totalOpex, totalNet,
      totalCashIn, totalCashOut, cashBalance: totalCashIn - totalCashOut,
      grossMargin, netMargin,
      totalAR, totalAP,
      activeContracts: contracts.filter(c => c.status === "active").length,
      activeOrders: orders.filter(o => !["delivered", "cancelled", "closed"].includes(o.status)).length,
    };
  }

  if (!loaded) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка данных...</div>;

  const kpi = getKpi();
  const cashFlow = getCashFlowByMonth();
  const pnl = getPnlByMonth();
  const arAp = getReceivablesPayables();

  // Total row helper
  const cfTotal = cashFlow.reduce((a, m) => ({
    inflow: a.inflow + m.inflow, outflow: a.outflow + m.outflow,
    operating_in: a.operating_in + m.operating_in, operating_out: a.operating_out + m.operating_out,
    investing: a.investing + m.investing, financing: a.financing + m.financing, net: a.net + m.net,
  }), { inflow: 0, outflow: 0, operating_in: 0, operating_out: 0, investing: 0, financing: 0, net: 0 });

  const pnlTotal = pnl.reduce((a, m) => ({
    revenue: a.revenue + m.revenue, cogs: a.cogs + m.cogs, gross: a.gross + m.gross,
    opex: a.opex + m.opex, operating: a.operating + m.operating,
    other_in: a.other_in + m.other_in, other_out: a.other_out + m.other_out,
    ebt: a.ebt + m.ebt, tax: a.tax + m.tax, net: a.net + m.net,
  }), { revenue: 0, cogs: 0, gross: 0, opex: 0, operating: 0, other_in: 0, other_out: 0, ebt: 0, tax: 0, net: 0 });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-center">
        <div className="text-xs" style={{ color: "var(--t3)" }}>
          Управленческие отчёты — Cash Flow, P&L, дебиторка/кредиторка, ключевые показатели
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 120 }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y} год</option>)}
        </select>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 Выручка</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(kpi.totalRevenue)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За {year} год</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${kpi.totalNet >= 0 ? "#A855F7" : "#EF4444"}` }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💎 Чистая прибыль</div>
          <div className="text-xl font-bold" style={{ color: kpi.totalNet >= 0 ? "#A855F7" : "#EF4444" }}>{fmtMoney(kpi.totalNet)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Маржа: {kpi.netMargin.toFixed(1)}%</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📥 Дебиторка</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(kpi.totalAR)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Нам должны</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📤 Кредиторка</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{fmtMoney(kpi.totalAP)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Мы должны</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["cashflow", "💰 ОДДС (Cash Flow)"],
          ["pnl", "📊 Прибыли и убытки (P&L)"],
          ["ar-ap", "💳 Дебиторка / Кредиторка"],
          ["kpi", "🎯 Ключевые показатели"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ CASH FLOW ═══ */}
      {tab === "cashflow" && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">💰 Движение денежных средств за {year} год</div>
            <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
              Расчёт автоматический по проводкам бухучёта (счета 1010, 1030, 1040). Операционная деятельность — поступления от клиентов, платежи поставщикам, ЗП, налоги. Инвестиционная — покупка/продажа ОС. Финансовая — кредиты и займы.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 1100 }}>
                <thead><tr>
                  <th className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 200, position: "sticky", left: 0, background: "var(--card)" }}>Статья</th>
                  {MONTHS.map((m, i) => (
                    <th key={i} className="text-right p-2 text-[10px] font-bold" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 80 }}>{m}</th>
                  ))}
                  <th className="text-right p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 110 }}>Итого</th>
                </tr></thead>
                <tbody>
                  <tr style={{ background: "#10B98110" }}>
                    <td className="p-2 text-[12px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "#10B98110" }}>📥 ПОСТУПЛЕНИЯ</td>
                    {cashFlow.map((m, i) => <td key={i} className="text-right p-2 text-[11px] font-semibold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{m.inflow ? fmtMoney(m.inflow) : "—"}</td>)}
                    <td className="text-right p-2 text-[12px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(cfTotal.inflow)}</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)", paddingLeft: 24 }}>Операционная деятельность</td>
                    {cashFlow.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "var(--t2)", borderBottom: "1px solid var(--brd)" }}>{m.operating_in ? fmtMoney(m.operating_in) : "—"}</td>)}
                    <td className="text-right p-2 text-[11px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(cfTotal.operating_in)}</td>
                  </tr>

                  <tr style={{ background: "#EF444410" }}>
                    <td className="p-2 text-[12px] font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "#EF444410" }}>📤 ВЫПЛАТЫ</td>
                    {cashFlow.map((m, i) => <td key={i} className="text-right p-2 text-[11px] font-semibold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{m.outflow ? fmtMoney(m.outflow) : "—"}</td>)}
                    <td className="text-right p-2 text-[12px] font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(cfTotal.outflow)}</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)", paddingLeft: 24 }}>Операционная деятельность</td>
                    {cashFlow.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "var(--t2)", borderBottom: "1px solid var(--brd)" }}>{m.operating_out ? fmtMoney(Math.abs(m.operating_out)) : "—"}</td>)}
                    <td className="text-right p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Math.abs(cfTotal.operating_out))}</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)", paddingLeft: 24 }}>Инвестиционная деятельность</td>
                    {cashFlow.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "var(--t2)", borderBottom: "1px solid var(--brd)" }}>{m.investing ? fmtMoney(Math.abs(m.investing)) : "—"}</td>)}
                    <td className="text-right p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Math.abs(cfTotal.investing))}</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)", paddingLeft: 24 }}>Финансовая деятельность</td>
                    {cashFlow.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "var(--t2)", borderBottom: "1px solid var(--brd)" }}>{m.financing ? fmtMoney(Math.abs(m.financing)) : "—"}</td>)}
                    <td className="text-right p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Math.abs(cfTotal.financing))}</td>
                  </tr>

                  <tr style={{ background: cfTotal.net >= 0 ? "#A855F710" : "#EF444410" }}>
                    <td className="p-2 text-[12px] font-bold" style={{ color: cfTotal.net >= 0 ? "#A855F7" : "#EF4444", borderTop: "2px solid var(--brd)", position: "sticky", left: 0, background: cfTotal.net >= 0 ? "#A855F710" : "#EF444410" }}>
                      💎 ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК
                    </td>
                    {cashFlow.map((m, i) => (
                      <td key={i} className="text-right p-2 text-[11px] font-bold" style={{ color: m.net >= 0 ? "#A855F7" : "#EF4444", borderTop: "2px solid var(--brd)" }}>
                        {m.net !== 0 ? (m.net > 0 ? "+" : "") + fmtMoney(m.net) : "—"}
                      </td>
                    ))}
                    <td className="text-right p-2 text-[13px] font-bold" style={{ color: cfTotal.net >= 0 ? "#A855F7" : "#EF4444", borderTop: "2px solid var(--brd)" }}>
                      {cfTotal.net > 0 ? "+" : ""}{fmtMoney(cfTotal.net)} ₸
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══ P&L ═══ */}
      {tab === "pnl" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📊 Отчёт о прибылях и убытках за {year} год</div>
          <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
            Расчёт по правилу начисления (когда документы проведены, не когда деньги пришли). Выручка с 6-й группы, себестоимость и расходы с 7-й и 8-й.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 1100 }}>
              <thead><tr>
                <th className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 220, position: "sticky", left: 0, background: "var(--card)" }}>Статья</th>
                {MONTHS.map((m, i) => (
                  <th key={i} className="text-right p-2 text-[10px] font-bold" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 80 }}>{m}</th>
                ))}
                <th className="text-right p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", minWidth: 110 }}>Итого</th>
              </tr></thead>
              <tbody>
                <tr style={{ background: "#10B98110" }}>
                  <td className="p-2 text-[12px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "#10B98110" }}>Выручка</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[11px] font-semibold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{m.revenue ? fmtMoney(m.revenue) : "—"}</td>)}
                  <td className="text-right p-2 text-[12px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(pnlTotal.revenue)}</td>
                </tr>
                <tr>
                  <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)" }}>− Себестоимость</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{m.cogs ? `(${fmtMoney(m.cogs)})` : "—"}</td>)}
                  <td className="text-right p-2 text-[11px]" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>({fmtMoney(pnlTotal.cogs)})</td>
                </tr>
                <tr style={{ background: "#3B82F610" }}>
                  <td className="p-2 text-[11px] font-bold" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "#3B82F610" }}>= Валовая прибыль</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[11px] font-bold" style={{ color: m.gross >= 0 ? "#3B82F6" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{m.gross !== 0 ? fmtMoney(m.gross) : "—"}</td>)}
                  <td className="text-right p-2 text-[12px] font-bold" style={{ color: pnlTotal.gross >= 0 ? "#3B82F6" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(pnlTotal.gross)}</td>
                </tr>
                <tr>
                  <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)" }}>− Операционные расходы</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{m.opex ? `(${fmtMoney(m.opex)})` : "—"}</td>)}
                  <td className="text-right p-2 text-[11px]" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>({fmtMoney(pnlTotal.opex)})</td>
                </tr>
                <tr style={{ background: "#6366F110" }}>
                  <td className="p-2 text-[11px] font-bold" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "#6366F110" }}>= Операционная прибыль (EBIT)</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[11px] font-bold" style={{ color: m.operating >= 0 ? "#6366F1" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{m.operating !== 0 ? fmtMoney(m.operating) : "—"}</td>)}
                  <td className="text-right p-2 text-[12px] font-bold" style={{ color: pnlTotal.operating >= 0 ? "#6366F1" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(pnlTotal.operating)}</td>
                </tr>
                <tr>
                  <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)" }}>+ Прочие доходы</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{m.other_in ? fmtMoney(m.other_in) : "—"}</td>)}
                  <td className="text-right p-2 text-[11px]" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(pnlTotal.other_in)}</td>
                </tr>
                <tr>
                  <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)" }}>− Прочие расходы</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{m.other_out ? `(${fmtMoney(m.other_out)})` : "—"}</td>)}
                  <td className="text-right p-2 text-[11px]" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>({fmtMoney(pnlTotal.other_out)})</td>
                </tr>
                <tr style={{ background: "#F59E0B10" }}>
                  <td className="p-2 text-[11px] font-bold" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "#F59E0B10" }}>= Прибыль до налогов</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[11px] font-bold" style={{ color: m.ebt >= 0 ? "#F59E0B" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{m.ebt !== 0 ? fmtMoney(m.ebt) : "—"}</td>)}
                  <td className="text-right p-2 text-[12px] font-bold" style={{ color: pnlTotal.ebt >= 0 ? "#F59E0B" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(pnlTotal.ebt)}</td>
                </tr>
                <tr>
                  <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)", position: "sticky", left: 0, background: "var(--card)" }}>− КПН (20%)</td>
                  {pnl.map((m, i) => <td key={i} className="text-right p-2 text-[10px]" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{m.tax ? `(${fmtMoney(m.tax)})` : "—"}</td>)}
                  <td className="text-right p-2 text-[11px]" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>({fmtMoney(pnlTotal.tax)})</td>
                </tr>
                <tr style={{ background: pnlTotal.net >= 0 ? "#A855F710" : "#EF444410" }}>
                  <td className="p-2 text-[12px] font-bold" style={{ color: pnlTotal.net >= 0 ? "#A855F7" : "#EF4444", borderTop: "2px solid var(--brd)", position: "sticky", left: 0, background: pnlTotal.net >= 0 ? "#A855F710" : "#EF444410" }}>💎 ЧИСТАЯ ПРИБЫЛЬ</td>
                  {pnl.map((m, i) => (
                    <td key={i} className="text-right p-2 text-[11px] font-bold" style={{ color: m.net >= 0 ? "#A855F7" : "#EF4444", borderTop: "2px solid var(--brd)" }}>
                      {m.net !== 0 ? (m.net > 0 ? "+" : "") + fmtMoney(m.net) : "—"}
                    </td>
                  ))}
                  <td className="text-right p-2 text-[13px] font-bold" style={{ color: pnlTotal.net >= 0 ? "#A855F7" : "#EF4444", borderTop: "2px solid var(--brd)" }}>
                    {pnlTotal.net > 0 ? "+" : ""}{fmtMoney(pnlTotal.net)} ₸
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Margins */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Валовая маржа</div>
              <div className="text-base font-bold" style={{ color: "#3B82F6" }}>{kpi.grossMargin.toFixed(1)}%</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Прибыль / Выручка</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Чистая маржа</div>
              <div className="text-base font-bold" style={{ color: kpi.netMargin >= 0 ? "#A855F7" : "#EF4444" }}>{kpi.netMargin.toFixed(1)}%</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Чистая прибыль / Выручка</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>Доля расходов</div>
              <div className="text-base font-bold" style={{ color: "#F59E0B" }}>{pnlTotal.revenue > 0 ? (pnlTotal.opex / pnlTotal.revenue * 100).toFixed(1) : "0"}%</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>OpEx / Выручка</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AR/AP ═══ */}
      {tab === "ar-ap" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: "3px solid #F59E0B" }}>
              <div className="text-sm font-bold mb-2" style={{ color: "#F59E0B" }}>📥 Дебиторская задолженность (нам должны)</div>
              <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>Непроведённые счета и СФ от наших покупателей</div>
              <div className="text-2xl font-bold mb-3" style={{ color: "#F59E0B" }}>{fmtMoney(kpi.totalAR)} ₸</div>
              <div className="flex flex-col gap-2">
                {arAp.filter(c => c.ar > 0).slice(0, 8).map(c => (
                  <div key={c.name} className="flex justify-between items-center p-2 rounded" style={{ background: "var(--bg)" }}>
                    <div>
                      <div className="text-xs font-semibold">{c.name}</div>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.docs.filter(d => d.debt_type === "ar").length} документов</div>
                    </div>
                    <div className="text-sm font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(c.ar)} ₸</div>
                  </div>
                ))}
                {arAp.filter(c => c.ar > 0).length === 0 && <div className="text-xs text-center py-3" style={{ color: "var(--t3)" }}>Нет дебиторов ✅</div>}
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: "3px solid #EF4444" }}>
              <div className="text-sm font-bold mb-2" style={{ color: "#EF4444" }}>📤 Кредиторская задолженность (мы должны)</div>
              <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>Непроведённые поступления и акты от поставщиков</div>
              <div className="text-2xl font-bold mb-3" style={{ color: "#EF4444" }}>{fmtMoney(kpi.totalAP)} ₸</div>
              <div className="flex flex-col gap-2">
                {arAp.filter(c => c.ap > 0).slice(0, 8).map(c => (
                  <div key={c.name} className="flex justify-between items-center p-2 rounded" style={{ background: "var(--bg)" }}>
                    <div>
                      <div className="text-xs font-semibold">{c.name}</div>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.docs.filter(d => d.debt_type === "ap").length} документов</div>
                    </div>
                    <div className="text-sm font-bold" style={{ color: "#EF4444" }}>{fmtMoney(c.ap)} ₸</div>
                  </div>
                ))}
                {arAp.filter(c => c.ap > 0).length === 0 && <div className="text-xs text-center py-3" style={{ color: "var(--t3)" }}>Нет кредиторов ✅</div>}
              </div>
            </div>
          </div>

          {/* Чистая позиция */}
          <div className="rounded-xl p-4" style={{ background: kpi.totalAR - kpi.totalAP >= 0 ? "#10B98110" : "#EF444410", border: `1px solid ${kpi.totalAR - kpi.totalAP >= 0 ? "#10B98130" : "#EF444430"}` }}>
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs font-bold mb-1">Чистая денежная позиция</div>
                <div className="text-[11px]" style={{ color: "var(--t3)" }}>Дебиторка минус кредиторка</div>
              </div>
              <div className="text-xl font-bold" style={{ color: kpi.totalAR - kpi.totalAP >= 0 ? "#10B981" : "#EF4444" }}>
                {kpi.totalAR - kpi.totalAP > 0 ? "+" : ""}{fmtMoney(kpi.totalAR - kpi.totalAP)} ₸
              </div>
            </div>
          </div>

          {/* Все контрагенты */}
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">📋 Полная таблица расчётов</div>
            <table>
              <thead><tr>{["Контрагент", "БИН", "Дебиторка", "Кредиторка", "Сальдо", "Документов"].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {arAp.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет задолженностей</td></tr>
                ) : arAp.map(c => {
                  const balance = c.ar - c.ap;
                  return (
                    <tr key={c.name}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{c.name}</td>
                      <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.bin || "—"}</td>
                      <td className="p-2.5 text-[12px] text-right" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{c.ar > 0 ? fmtMoney(c.ar) : "—"}</td>
                      <td className="p-2.5 text-[12px] text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{c.ap > 0 ? fmtMoney(c.ap) : "—"}</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: balance >= 0 ? "#10B981" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{balance > 0 ? "+" : ""}{fmtMoney(balance)}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.docs.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ KPI ═══ */}
      {tab === "kpi" && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: "3px solid #10B981" }}>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 Финансовые</div>
              <div className="flex flex-col gap-3 mt-3">
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Выручка</div><div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(kpi.totalRevenue)} ₸</div></div>
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Чистая прибыль</div><div className="text-base font-bold" style={{ color: kpi.totalNet >= 0 ? "#A855F7" : "#EF4444" }}>{fmtMoney(kpi.totalNet)} ₸</div></div>
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Валовая маржа</div><div className="text-base font-bold" style={{ color: "#3B82F6" }}>{kpi.grossMargin.toFixed(1)}%</div></div>
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Чистая маржа</div><div className="text-base font-bold" style={{ color: kpi.netMargin >= 0 ? "#A855F7" : "#EF4444" }}>{kpi.netMargin.toFixed(1)}%</div></div>
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: "3px solid #6366F1" }}>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Денежный поток</div>
              <div className="flex flex-col gap-3 mt-3">
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Поступления</div><div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(kpi.totalCashIn)} ₸</div></div>
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Выплаты</div><div className="text-base font-bold" style={{ color: "#EF4444" }}>{fmtMoney(kpi.totalCashOut)} ₸</div></div>
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Чистый поток</div><div className="text-base font-bold" style={{ color: kpi.cashBalance >= 0 ? "#A855F7" : "#EF4444" }}>{kpi.cashBalance > 0 ? "+" : ""}{fmtMoney(kpi.cashBalance)} ₸</div></div>
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: "3px solid #F59E0B" }}>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Операции</div>
              <div className="flex flex-col gap-3 mt-3">
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Активных договоров</div><div className="text-base font-bold" style={{ color: "#10B981" }}>{kpi.activeContracts}</div></div>
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Активных заказов</div><div className="text-base font-bold" style={{ color: "#F59E0B" }}>{kpi.activeOrders}</div></div>
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Контрагентов</div><div className="text-base font-bold" style={{ color: "#6366F1" }}>{counterparties.length}</div></div>
                <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Дебиторов / Кредиторов</div><div className="text-base font-bold">{arAp.filter(c => c.ar > 0).length} / {arAp.filter(c => c.ap > 0).length}</div></div>
              </div>
            </div>
          </div>

          {/* Top customers */}
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">🏆 Топ покупателей по обороту</div>
            {(() => {
              const byCustomer: Record<string, number> = {};
              docs.forEach(d => {
                if ((d.doc_type === "invoice" || d.doc_type === "sf" || d.doc_type === "act") && d.status === "done") {
                  byCustomer[d.counterparty_name] = (byCustomer[d.counterparty_name] || 0) + Number(d.total_with_nds);
                }
              });
              const top = Object.entries(byCustomer).sort(([, a], [, b]) => b - a).slice(0, 5);
              if (top.length === 0) return <div className="text-xs py-3" style={{ color: "var(--t3)" }}>Нет данных</div>;
              const max = top[0][1];
              return top.map(([name, amount], i) => {
                const pct = (amount / max) * 100;
                return (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="text-xs font-semibold" style={{ width: 30, color: "var(--t3)" }}>#{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div className="text-xs font-semibold mb-1">{name}</div>
                      <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#10B981", borderRadius: 3 }} />
                      </div>
                    </div>
                    <div className="text-sm font-bold" style={{ color: "#10B981", minWidth: 130, textAlign: "right" }}>{fmtMoney(amount)} ₸</div>
                  </div>
                );
              });
            })()}
          </div>
        </>
      )}
    </div>
  );
}
