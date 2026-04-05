"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "journal" | "osv" | "analysis" | "reconciliation";

const PLAN_ACCOUNTS = [
  { code: "1010", name: "Денежные средства в кассе", type: "A" },
  { code: "1030", name: "Денежные средства на р/с", type: "A" },
  { code: "1210", name: "Задолженность покупателей", type: "A" },
  { code: "1250", name: "Задолженность работников", type: "A" },
  { code: "1310", name: "Сырьё и материалы", type: "A" },
  { code: "1330", name: "Товары", type: "A" },
  { code: "1420", name: "НДС к зачёту", type: "A" },
  { code: "2410", name: "Основные средства", type: "A" },
  { code: "2420", name: "Амортизация ОС", type: "A" },
  { code: "3110", name: "Банковские займы", type: "P" },
  { code: "3120", name: "Обязательства по ИПН", type: "P" },
  { code: "3130", name: "НДС к уплате", type: "P" },
  { code: "3150", name: "Социальный налог", type: "P" },
  { code: "3220", name: "Обязательства по ОПВ", type: "P" },
  { code: "3310", name: "Задолженность поставщикам", type: "P" },
  { code: "3350", name: "Задолженность по ЗП", type: "P" },
  { code: "5110", name: "Уставный капитал", type: "P" },
  { code: "5510", name: "Нераспределённая прибыль", type: "P" },
  { code: "6010", name: "Доход от реализации", type: "P" },
  { code: "6280", name: "Прочие доходы", type: "P" },
  { code: "7010", name: "Себестоимость реализации", type: "A" },
  { code: "7110", name: "Расходы по реализации", type: "A" },
  { code: "7210", name: "Административные расходы", type: "A" },
];

export default function AccountingPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("journal");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), doc_ref: "", debit_account: "", credit_account: "", amount: "", description: "" });
  const [selectedAccount, setSelectedAccount] = useState("");
  const [reconCP, setReconCP] = useState("");
  const [periodFrom, setPeriodFrom] = useState(new Date().getFullYear() + "-01-01");
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const [userId, setUserId] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase.from("journal_entries").select("*").eq("user_id", user.id).order("entry_date", { ascending: false }).limit(200);
    setEntries(data || []);
  }

  async function addEntry() {
    await supabase.from("journal_entries").insert({ user_id: userId, ...form, amount: Number(form.amount) });
    setForm({ entry_date: new Date().toISOString().slice(0, 10), doc_ref: "", debit_account: "", credit_account: "", amount: "", description: "" });
    setShowAdd(false); load();
  }

  // ═══ ОСВ — Оборотно-сальдовая ведомость ═══
  function calcOSV() {
    const filtered = entries.filter(e => e.entry_date >= periodFrom && e.entry_date <= periodTo);
    const accounts: Record<string, { debit: number; credit: number }> = {};
    for (const e of filtered) {
      if (!accounts[e.debit_account]) accounts[e.debit_account] = { debit: 0, credit: 0 };
      if (!accounts[e.credit_account]) accounts[e.credit_account] = { debit: 0, credit: 0 };
      accounts[e.debit_account].debit += Number(e.amount);
      accounts[e.credit_account].credit += Number(e.amount);
    }
    return PLAN_ACCOUNTS.filter(a => accounts[a.code]).map(a => ({
      code: a.code, name: a.name, type: a.type,
      debitTurn: accounts[a.code]?.debit || 0,
      creditTurn: accounts[a.code]?.credit || 0,
      debitEnd: a.type === "A" ? Math.max(0, (accounts[a.code]?.debit || 0) - (accounts[a.code]?.credit || 0)) : 0,
      creditEnd: a.type === "P" ? Math.max(0, (accounts[a.code]?.credit || 0) - (accounts[a.code]?.debit || 0)) : 0,
    }));
  }

  // ═══ Анализ счёта ═══
  function getAccountEntries(accCode: string) {
    return entries.filter(e => e.debit_account === accCode || e.credit_account === accCode)
      .filter(e => e.entry_date >= periodFrom && e.entry_date <= periodTo);
  }

  // ═══ Акт сверки ═══
  function getReconciliation() {
    const docs = entries.filter(e => e.description?.toLowerCase().includes(reconCP.toLowerCase()))
      .filter(e => e.entry_date >= periodFrom && e.entry_date <= periodTo);
    const weOwe = docs.filter(e => e.debit_account === "3310").reduce((a: number, e: any) => a + Number(e.amount), 0);
    const theyOwe = docs.filter(e => e.credit_account === "1210" || e.debit_account === "1210").reduce((a: number, e: any) => a + Number(e.amount), 0);
    return { docs, weOwe, theyOwe };
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "journal", label: "📝 Журнал проводок" },
    { key: "osv", label: "📊 ОСВ" },
    { key: "analysis", label: "🔍 Анализ счёта" },
    { key: "reconciliation", label: "🤝 Акт сверки" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === t.key ? "var(--accent)" : "transparent", color: tab === t.key ? "#fff" : "var(--t3)", border: tab === t.key ? "none" : "1px solid var(--brd)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Period selector */}
      {(tab === "osv" || tab === "analysis" || tab === "reconciliation") && (
        <div className="flex gap-3 items-center">
          <label className="text-xs" style={{ color: "var(--t3)" }}>Период:</label>
          <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} style={{ width: 150 }} />
          <span className="text-xs" style={{ color: "var(--t3)" }}>—</span>
          <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} style={{ width: 150 }} />
        </div>
      )}

      {/* ═══ ЖУРНАЛ ПРОВОДОК ═══ */}
      {tab === "journal" && (
        <>
          <div className="flex justify-between items-center">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Всего проводок: {entries.length}</div>
            <button onClick={() => setShowAdd(!showAdd)} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Проводка</button>
          </div>
          {showAdd && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-6 gap-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Документ</label><input value={form.doc_ref} onChange={e => setForm({ ...form, doc_ref: e.target.value })} placeholder="ПКО-42" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дебет</label><select value={form.debit_account} onChange={e => setForm({ ...form, debit_account: e.target.value })}><option value="">—</option>{PLAN_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Кредит</label><select value={form.credit_account} onChange={e => setForm({ ...form, credit_account: e.target.value })}><option value="">—</option>{PLAN_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={addEntry} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Дата", "Документ", "Дебет", "Кредит", "Сумма (₸)", "Описание"].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
              <tbody>{entries.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет проводок</td></tr> : entries.slice(0, 50).map((r: any, i: number) => (
                <tr key={r.id || i}><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.entry_date}</td><td className="p-2.5 text-[13px] font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{r.doc_ref}</td><td className="p-2.5 text-[13px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{r.debit_account}</td><td className="p-2.5 text-[13px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{r.credit_account}</td><td className="p-2.5 text-[13px] font-semibold text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(r.amount)}</td><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.description}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ОСВ ═══ */}
      {tab === "osv" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Оборотно-сальдовая ведомость</div>
          <table>
            <thead><tr>
              <th className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Счёт</th>
              <th className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Наименование</th>
              <th className="text-right p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Оборот Дт</th>
              <th className="text-right p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Оборот Кт</th>
              <th className="text-right p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Сальдо Дт</th>
              <th className="text-right p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Сальдо Кт</th>
            </tr></thead>
            <tbody>
              {calcOSV().length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет данных за период</td></tr> : calcOSV().map(row => (
                <tr key={row.code}>
                  <td className="p-2.5 text-[13px] font-mono font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{row.code}</td>
                  <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{row.name}</td>
                  <td className="p-2.5 text-[13px] text-right" style={{ color: row.debitTurn > 0 ? "#10B981" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{row.debitTurn > 0 ? fmtMoney(row.debitTurn) : ""}</td>
                  <td className="p-2.5 text-[13px] text-right" style={{ color: row.creditTurn > 0 ? "#EF4444" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{row.creditTurn > 0 ? fmtMoney(row.creditTurn) : ""}</td>
                  <td className="p-2.5 text-[13px] text-right font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{row.debitEnd > 0 ? fmtMoney(row.debitEnd) : ""}</td>
                  <td className="p-2.5 text-[13px] text-right font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{row.creditEnd > 0 ? fmtMoney(row.creditEnd) : ""}</td>
                </tr>
              ))}
              <tr style={{ background: "var(--bg)" }}>
                <td colSpan={2} className="p-2.5 text-[13px] font-bold">ИТОГО</td>
                <td className="p-2.5 text-[13px] text-right font-bold">{fmtMoney(calcOSV().reduce((a, r) => a + r.debitTurn, 0))}</td>
                <td className="p-2.5 text-[13px] text-right font-bold">{fmtMoney(calcOSV().reduce((a, r) => a + r.creditTurn, 0))}</td>
                <td className="p-2.5 text-[13px] text-right font-bold">{fmtMoney(calcOSV().reduce((a, r) => a + r.debitEnd, 0))}</td>
                <td className="p-2.5 text-[13px] text-right font-bold">{fmtMoney(calcOSV().reduce((a, r) => a + r.creditEnd, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ АНАЛИЗ СЧЁТА ═══ */}
      {tab === "analysis" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Анализ счёта / Карточка счёта</div>
          <div className="mb-4">
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Выберите счёт</label>
            <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} style={{ width: 400 }}>
              <option value="">— Выберите счёт —</option>
              {PLAN_ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          {selectedAccount && (
            <table>
              <thead><tr>{["Дата", "Документ", "Кор. счёт", "Дебет", "Кредит", "Описание"].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
              <tbody>
                {getAccountEntries(selectedAccount).length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет операций по счёту {selectedAccount}</td></tr> : getAccountEntries(selectedAccount).map((e: any, i: number) => {
                  const isDebit = e.debit_account === selectedAccount;
                  const corr = isDebit ? e.credit_account : e.debit_account;
                  return (
                    <tr key={i}><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.entry_date}</td><td className="p-2.5 text-[13px] font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{e.doc_ref}</td><td className="p-2.5 text-[13px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{corr}</td><td className="p-2.5 text-[13px] text-right font-semibold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{isDebit ? fmtMoney(e.amount) : ""}</td><td className="p-2.5 text-[13px] text-right font-semibold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{!isDebit ? fmtMoney(e.amount) : ""}</td><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.description}</td></tr>
                  );
                })}
                <tr style={{ background: "var(--bg)" }}>
                  <td colSpan={3} className="p-2.5 text-[13px] font-bold">Итого по счёту {selectedAccount}</td>
                  <td className="p-2.5 text-[13px] text-right font-bold" style={{ color: "#10B981" }}>{fmtMoney(getAccountEntries(selectedAccount).filter((e: any) => e.debit_account === selectedAccount).reduce((a: number, e: any) => a + Number(e.amount), 0))}</td>
                  <td className="p-2.5 text-[13px] text-right font-bold" style={{ color: "#EF4444" }}>{fmtMoney(getAccountEntries(selectedAccount).filter((e: any) => e.credit_account === selectedAccount).reduce((a: number, e: any) => a + Number(e.amount), 0))}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ═══ АКТ СВЕРКИ ═══ */}
      {tab === "reconciliation" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Акт сверки взаиморасчётов</div>
          <div className="mb-4">
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Контрагент (название или часть)</label>
            <input value={reconCP} onChange={e => setReconCP(e.target.value)} placeholder="Введите название контрагента" style={{ width: 400 }} />
          </div>
          {reconCP && (() => {
            const r = getReconciliation();
            return (
              <>
                <table>
                  <thead><tr>{["Дата", "Документ", "Описание", "Дебет", "Кредит", "Сумма"].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {r.docs.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет операций с «{reconCP}»</td></tr> : r.docs.map((e: any, i: number) => (
                      <tr key={i}><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.entry_date}</td><td className="p-2.5 text-[13px] font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{e.doc_ref}</td><td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{e.description}</td><td className="p-2.5 text-[13px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{e.debit_account}</td><td className="p-2.5 text-[13px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{e.credit_account}</td><td className="p-2.5 text-[13px] font-bold text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(e.amount)} ₸</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 p-4 rounded-lg" style={{ background: "var(--bg)" }}>
                  <div className="text-sm"><b>Итого операций:</b> {r.docs.length}</div>
                  <div className="text-sm mt-1"><b>Общая сумма:</b> {fmtMoney(r.docs.reduce((a: number, e: any) => a + Number(e.amount), 0))} ₸</div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
