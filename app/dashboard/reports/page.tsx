"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TAX, TAX_COMPUTED, fmtMoney, calcSalary } from "@/lib/tax2026";

type Tab = "list" | "balance" | "fno910" | "fno200" | "fno300" | "fno100";

export default function ReportsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("list");
  const [entries, setEntries] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [periodFrom, setPeriodFrom] = useState(new Date().getFullYear() + "-01-01");
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const [userId, setUserId] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [j, e, d, p] = await Promise.all([
      supabase.from("journal_entries").select("*").eq("user_id", user.id).order("entry_date"),
      supabase.from("employees").select("*").eq("user_id", user.id).eq("status", "active"),
      supabase.from("documents").select("*").eq("user_id", user.id).eq("status", "done"),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
    ]);
    setEntries(j.data || []);
    setEmployees(e.data || []);
    setDocs(d.data || []);
    if (p.data) setProfile(p.data);
  }

  function getAccountBalance(code: string, type: "A" | "P" = "A"): number {
    const filtered = entries.filter(e => e.entry_date >= periodFrom && e.entry_date <= periodTo);
    const debit = filtered.filter(e => e.debit_account === code).reduce((a: number, e: any) => a + Number(e.amount), 0);
    const credit = filtered.filter(e => e.credit_account === code).reduce((a: number, e: any) => a + Number(e.amount), 0);
    return type === "A" ? debit - credit : credit - debit;
  }

  function getRevenue(): number {
    return docs.filter(d => d.doc_date >= periodFrom && d.doc_date <= periodTo && ["invoice", "sf", "act", "waybill"].includes(d.doc_type))
      .reduce((a: number, d: any) => a + Number(d.total_sum), 0);
  }

  function getNDSCollected(): number {
    return docs.filter(d => d.doc_date >= periodFrom && d.doc_date <= periodTo && Number(d.nds_sum) > 0)
      .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
  }

  function getNDSPaid(): number {
    return docs.filter(d => d.doc_date >= periodFrom && d.doc_date <= periodTo && d.doc_type === "receipt")
      .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
  }

  function getTotalFOT(): number {
    return employees.reduce((a: number, e: any) => a + Number(e.salary), 0);
  }

  function printReport(title: string) {
    const content = document.getElementById("report-content");
    if (!content) return;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
        <style>body{font-family:'Times New Roman',serif;padding:40px;font-size:13px;line-height:1.6;color:#111}
        table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #333;padding:5px 8px;font-size:12px}
        th{background:#f0f0f0;font-weight:700}.r{text-align:right}.c{text-align:center}
        h2{text-align:center}h3{text-align:center;color:#555}
        @media print{body{padding:20px}}</style></head><body>${content.innerHTML}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  }

  const reportsList = [
    { key: "balance", name: "Бухгалтерский баланс", icon: "📊", color: "#6366F1", desc: "Активы и пассивы организации" },
    { key: "fno910", name: "ФНО 910.00", icon: "📋", color: "#10B981", desc: "Упрощённая декларация (ставка 4%)" },
    { key: "fno200", name: "ФНО 200.00", icon: "📋", color: "#F59E0B", desc: "Декларация по ИПН 10%/15% и СН 6%" },
    { key: "fno300", name: "ФНО 300.00", icon: "📋", color: "#EC4899", desc: "Декларация по НДС 16%" },
    { key: "fno100", name: "ФНО 100.00", icon: "📋", color: "#8B5CF6", desc: "Декларация по КПН 20%" },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: "list", label: "📋 Все отчёты" },
    { key: "balance", label: "📊 Баланс" },
    { key: "fno910", label: "910.00" },
    { key: "fno200", label: "200.00" },
    { key: "fno300", label: "300.00" },
    { key: "fno100", label: "100.00" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === t.key ? "var(--accent)" : "transparent", color: tab === t.key ? "#fff" : "var(--t3)", border: tab === t.key ? "none" : "1px solid var(--brd)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "list" && (
        <div className="flex gap-3 items-center">
          <label className="text-xs" style={{ color: "var(--t3)" }}>Период:</label>
          <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} style={{ width: 150 }} />
          <span className="text-xs" style={{ color: "var(--t3)" }}>—</span>
          <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} style={{ width: 150 }} />
          <button onClick={() => printReport(tabs.find(t => t.key === tab)?.label || "Отчёт")}
            className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer ml-auto" style={{ background: "var(--accent)" }}>
            🖨 Печать
          </button>
        </div>
      )}

      {/* ═══ СПИСОК ОТЧЁТОВ ═══ */}
      {tab === "list" && (
        <div className="grid grid-cols-3 gap-3">
          {reportsList.map((r, i) => (
            <button key={i} onClick={() => setTab(r.key as Tab)}
              className="rounded-xl p-5 text-left cursor-pointer transition-all hover:-translate-y-0.5"
              style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${r.color}` }}>
              <div className="flex items-center gap-2 mb-1"><span className="text-lg">{r.icon}</span><span className="text-[13px] font-bold">{r.name}</span></div>
              <div className="text-[11px]" style={{ color: "var(--t3)" }}>{r.desc}</div>
            </button>
          ))}
        </div>
      )}

      <div id="report-content">

      {/* ═══ БУХГАЛТЕРСКИЙ БАЛАНС ═══ */}
      {tab === "balance" && (() => {
        const assets = [
          { code: "I", name: "КРАТКОСРОЧНЫЕ АКТИВЫ", bold: true, amount: 0 },
          { code: "1010", name: "Денежные средства в кассе", bold: false, amount: Math.max(0, getAccountBalance("1010")) },
          { code: "1030", name: "Денежные средства на р/с", bold: false, amount: Math.max(0, getAccountBalance("1030")) },
          { code: "1210", name: "Краткосрочная ДЗ покупателей", bold: false, amount: Math.max(0, getAccountBalance("1210")) },
          { code: "1310", name: "Запасы (сырьё и материалы)", bold: false, amount: Math.max(0, getAccountBalance("1310")) },
          { code: "1330", name: "Товары", bold: false, amount: Math.max(0, getAccountBalance("1330")) },
          { code: "1420", name: "НДС к зачёту", bold: false, amount: Math.max(0, getAccountBalance("1420")) },
          { code: "II", name: "ДОЛГОСРОЧНЫЕ АКТИВЫ", bold: true, amount: 0 },
          { code: "2410", name: "Основные средства", bold: false, amount: Math.max(0, getAccountBalance("2410")) },
          { code: "2420", name: "Амортизация ОС (минус)", bold: false, amount: -Math.max(0, getAccountBalance("2420", "P")) },
        ];
        const shortTermAssets = assets.filter(a => a.code.startsWith("1")).reduce((s, a) => s + a.amount, 0);
        const longTermAssets = assets.filter(a => a.code.startsWith("2")).reduce((s, a) => s + a.amount, 0);
        const totalAssets = shortTermAssets + longTermAssets;
        assets[0].amount = shortTermAssets;
        assets[7].amount = longTermAssets;

        const liabilities = [
          { code: "III", name: "КРАТКОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА", bold: true, amount: 0 },
          { code: "3120", name: "Обязательства по ИПН", bold: false, amount: Math.max(0, getAccountBalance("3120", "P")) },
          { code: "3130", name: "НДС к уплате", bold: false, amount: Math.max(0, getAccountBalance("3130", "P")) },
          { code: "3150", name: "Социальный налог", bold: false, amount: Math.max(0, getAccountBalance("3150", "P")) },
          { code: "3220", name: "Обязательства по ОПВ", bold: false, amount: Math.max(0, getAccountBalance("3220", "P")) },
          { code: "3310", name: "КЗ поставщикам", bold: false, amount: Math.max(0, getAccountBalance("3310", "P")) },
          { code: "3350", name: "Задолженность по ЗП", bold: false, amount: Math.max(0, getAccountBalance("3350", "P")) },
          { code: "IV", name: "КАПИТАЛ", bold: true, amount: 0 },
          { code: "5110", name: "Уставный капитал", bold: false, amount: Math.max(0, getAccountBalance("5110", "P")) },
          { code: "5510", name: "Нераспределённая прибыль", bold: false, amount: Math.max(0, getAccountBalance("5510", "P") + getAccountBalance("6010", "P") - getAccountBalance("7010") - getAccountBalance("7110") - getAccountBalance("7210")) },
        ];
        const shortTermLiab = liabilities.filter(l => l.code.startsWith("3")).reduce((s, l) => s + l.amount, 0);
        const capital = liabilities.filter(l => l.code.startsWith("5")).reduce((s, l) => s + l.amount, 0);
        const totalLiab = shortTermLiab + capital;
        liabilities[0].amount = shortTermLiab;
        liabilities[7].amount = capital;

        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>БУХГАЛТЕРСКИЙ БАЛАНС</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>
              {profile?.company_name || "Организация"} • БИН: {profile?.company_bin || "—"} • на {periodTo}
            </p>
            <div className="grid grid-cols-2 gap-4">
              {/* АКТИВЫ */}
              <div>
                <table>
                  <thead><tr><th className="text-left p-2 text-[11px]" style={{ background: "#6366F120", color: "#6366F1" }} colSpan={2}>АКТИВ</th><th className="r p-2 text-[11px]" style={{ background: "#6366F120", color: "#6366F1" }}>Сумма, ₸</th></tr></thead>
                  <tbody>{assets.map((a, i) => (
                    <tr key={i}><td className="p-2 text-[12px]" style={{ fontWeight: a.bold ? 700 : 400, borderBottom: "1px solid var(--brd)", color: a.bold ? "var(--t1)" : "var(--t2)" }} colSpan={a.bold ? 2 : 1}>{a.bold ? "" : a.code}</td>{!a.bold && <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.name}</td>}<td className="p-2 text-[12px] r" style={{ fontWeight: a.bold ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>{a.amount !== 0 ? fmtMoney(a.amount) : ""}</td></tr>
                  ))}
                  <tr style={{ background: "var(--bg)" }}><td colSpan={2} className="p-2 text-[13px]" style={{ fontWeight: 700 }}>ИТОГО АКТИВ</td><td className="p-2 text-[13px] r" style={{ fontWeight: 700, color: "#6366F1" }}>{fmtMoney(totalAssets)}</td></tr>
                  </tbody>
                </table>
              </div>
              {/* ПАССИВЫ */}
              <div>
                <table>
                  <thead><tr><th className="text-left p-2 text-[11px]" style={{ background: "#10B98120", color: "#10B981" }} colSpan={2}>ПАССИВ</th><th className="r p-2 text-[11px]" style={{ background: "#10B98120", color: "#10B981" }}>Сумма, ₸</th></tr></thead>
                  <tbody>{liabilities.map((l, i) => (
                    <tr key={i}><td className="p-2 text-[12px]" style={{ fontWeight: l.bold ? 700 : 400, borderBottom: "1px solid var(--brd)", color: l.bold ? "var(--t1)" : "var(--t2)" }} colSpan={l.bold ? 2 : 1}>{l.bold ? "" : l.code}</td>{!l.bold && <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.name}</td>}<td className="p-2 text-[12px] r" style={{ fontWeight: l.bold ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>{l.amount !== 0 ? fmtMoney(l.amount) : ""}</td></tr>
                  ))}
                  <tr style={{ background: "var(--bg)" }}><td colSpan={2} className="p-2 text-[13px]" style={{ fontWeight: 700 }}>ИТОГО ПАССИВ</td><td className="p-2 text-[13px] r" style={{ fontWeight: 700, color: "#10B981" }}>{fmtMoney(totalLiab)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            {totalAssets !== totalLiab && <p className="text-xs mt-3" style={{ color: "#EF4444" }}>⚠ Баланс не сходится: разница {fmtMoney(Math.abs(totalAssets - totalLiab))} ₸</p>}
          </div>
        );
      })()}

      {/* ═══ ФНО 910.00 ═══ */}
      {tab === "fno910" && (() => {
        const revenue = getRevenue();
        const taxRate = TAX.SNR_RATE;
        const tax = Math.round(revenue * taxRate);
        const ipn = Math.round(tax * 0.5);
        const sn = Math.round(tax * 0.5);
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>ФОРМА 910.00 — УПРОЩЁННАЯ ДЕКЛАРАЦИЯ</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name} • БИН: {profile?.company_bin} • Период: {periodFrom} — {periodTo}</p>
            <table>
              <thead><tr><th className="text-left p-3 text-[12px]" style={{ background: "#10B98120" }}>Показатель</th><th className="r p-3 text-[12px]" style={{ background: "#10B98120", width: 200 }}>Сумма, ₸</th></tr></thead>
              <tbody>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.001 — Доход за налоговый период</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(revenue)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.002 — Среднесписочная численность работников</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{employees.length}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.004 — Сумма налогов ({(taxRate * 100)}%)</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(tax)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.005 — в т.ч. ИПН (1/2)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(ipn)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.006 — в т.ч. СН (1/2)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(sn)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.007 — ФОТ за период</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(getTotalFOT() * 6)}</td></tr>
              </tbody>
            </table>
            <p className="text-[10px] mt-3" style={{ color: "var(--t3)" }}>Ставка {taxRate * 100}% по НК РК 2026. Порог: {fmtMoney(TAX.SNR_THRESHOLD_MRP)} МРП ({fmtMoney(TAX.SNR_THRESHOLD_MRP * TAX.MRP)} ₸) в год.</p>
          </div>
        );
      })()}

      {/* ═══ ФНО 200.00 ═══ */}
      {tab === "fno200" && (() => {
        const fot = getTotalFOT();
        const totalIPN = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).ipn, 0);
        const totalOPV = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).opv, 0);
        const totalOPVR = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).opvr, 0);
        const totalSO = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).so, 0);
        const totalSN = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).sn, 0);
        const totalVOSMS = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).vosms, 0);
        const totalOOSMS = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).oosms, 0);
        const months = 3;
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>ФОРМА 200.00 — ДЕКЛАРАЦИЯ ПО ИПН И СН</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name} • за квартал</p>
            <table>
              <thead><tr><th className="text-left p-3 text-[12px]" style={{ background: "#F59E0B20" }}>Показатель</th><th className="r p-3 text-[12px]" style={{ background: "#F59E0B20" }}>За месяц</th><th className="r p-3 text-[12px]" style={{ background: "#F59E0B20" }}>За квартал</th></tr></thead>
              <tbody>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.01 — Численность работников</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{employees.length}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{employees.length}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.01 — ФОТ начисленный</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(fot)}</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(fot * months)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.01 — ИПН исчисленный (10%)</td><td className="p-3 text-[13px] r" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalIPN)}</td><td className="p-3 text-[13px] r" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalIPN * months)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.02 — ОПВ (10%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOPV)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOPV * months)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.02 — ОПВР (3.5%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOPVR)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOPVR * months)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.03 — СО (5%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalSO)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalSO * months)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.03 — СН (6%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalSN)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalSN * months)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.03 — ВОСМС (2%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalVOSMS)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalVOSMS * months)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>200.03 — ООСМС (3%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOOSMS)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOOSMS * months)}</td></tr>
              </tbody>
            </table>
            <p className="text-[10px] mt-3" style={{ color: "var(--t3)" }}>Расчёт по НК РК 2026: ИПН 10%, вычет 30 МРП, СН 6% (без вычета СО), ОПВР 3.5%.</p>
          </div>
        );
      })()}

      {/* ═══ ФНО 300.00 ═══ */}
      {tab === "fno300" && (() => {
        const ndsCollected = getNDSCollected();
        const ndsPaid = getNDSPaid();
        const ndsPayable = Math.max(0, ndsCollected - ndsPaid);
        const revenue = getRevenue();
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>ФОРМА 300.00 — ДЕКЛАРАЦИЯ ПО НДС</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name} • Ставка НДС: {TAX.NDS * 100}%</p>
            <table>
              <thead><tr><th className="text-left p-3 text-[12px]" style={{ background: "#EC489920" }}>Показатель</th><th className="r p-3 text-[12px]" style={{ background: "#EC489920" }}>Сумма, ₸</th></tr></thead>
              <tbody>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>300.00.001 — Оборот по реализации (без НДС)</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(revenue)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>300.00.002 — НДС начисленный ({TAX.NDS * 100}%)</td><td className="p-3 text-[13px] r" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(ndsCollected)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>300.00.013 — НДС относимый в зачёт</td><td className="p-3 text-[13px] r" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(ndsPaid)}</td></tr>
                <tr style={{ background: "var(--bg)" }}><td className="p-3 text-[14px] font-bold">300.00.024 — НДС к уплате в бюджет</td><td className="p-3 text-[14px] r font-bold" style={{ color: "#EC4899" }}>{fmtMoney(ndsPayable)}</td></tr>
              </tbody>
            </table>
            <p className="text-[10px] mt-3" style={{ color: "var(--t3)" }}>НДС {TAX.NDS * 100}% — НК РК 2026 (ЗРК 214-VIII). Порог: {fmtMoney(TAX_COMPUTED.NDS_THRESHOLD)} ₸.</p>
          </div>
        );
      })()}

      {/* ═══ ФНО 100.00 ═══ */}
      {tab === "fno100" && (() => {
        const revenue = getRevenue();
        const expenses = Math.abs(getAccountBalance("7010")) + Math.abs(getAccountBalance("7110")) + Math.abs(getAccountBalance("7210"));
        const taxableIncome = Math.max(0, revenue - expenses);
        const kpn = Math.round(taxableIncome * TAX.KPN);
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>ФОРМА 100.00 — ДЕКЛАРАЦИЯ ПО КПН</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name} • Ставка КПН: {TAX.KPN * 100}%</p>
            <table>
              <thead><tr><th className="text-left p-3 text-[12px]" style={{ background: "#8B5CF620" }}>Показатель</th><th className="r p-3 text-[12px]" style={{ background: "#8B5CF620" }}>Сумма, ₸</th></tr></thead>
              <tbody>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>100.00.001 — Совокупный годовой доход (СГД)</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(revenue)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>100.00.030 — Вычеты (расходы)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(expenses)}</td></tr>
                <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>100.00.038 — Налогооблагаемый доход</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(taxableIncome)}</td></tr>
                <tr style={{ background: "var(--bg)" }}><td className="p-3 text-[14px] font-bold">100.00.045 — КПН к уплате ({TAX.KPN * 100}%)</td><td className="p-3 text-[14px] r font-bold" style={{ color: "#8B5CF6" }}>{fmtMoney(kpn)}</td></tr>
              </tbody>
            </table>
            <p className="text-[10px] mt-3" style={{ color: "var(--t3)" }}>КПН {TAX.KPN * 100}% — НК РК 2026. Дифференцированные: банки 25%, с/х 3%, соцсфера 5%.</p>
          </div>
        );
      })()}

      </div>
    </div>
  );
}
