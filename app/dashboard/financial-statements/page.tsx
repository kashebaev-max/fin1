"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "balance" | "pnl";

// ═══ СТРУКТУРА БАЛАНСА (ф.1) ═══
const BALANCE_STRUCTURE = {
  assets: [
    {
      section: "I. Краткосрочные активы",
      items: [
        { code: "010", name: "Денежные средства и их эквиваленты", accounts: ["1010", "1030", "1040", "1050"], type: "active" },
        { code: "011", name: "Краткосрочная дебиторская задолженность", accounts: ["1210", "1250", "1280"], type: "active" },
        { code: "012", name: "Запасы", accounts: ["1310", "1320", "1330", "1350"], type: "active" },
        { code: "013", name: "Текущие налоговые активы", accounts: ["1410", "1420"], type: "active" },
      ],
      totalCode: "100", totalName: "Итого краткосрочных активов",
    },
    {
      section: "II. Долгосрочные активы",
      items: [
        { code: "014", name: "Основные средства (по остаточной стоимости)", accounts: ["2410"], minusAccounts: ["2420"], type: "active" },
      ],
      totalCode: "200", totalName: "Итого долгосрочных активов",
    },
  ],
  liabilities: [
    {
      section: "III. Краткосрочные обязательства",
      items: [
        { code: "210", name: "Краткосрочная кредиторская задолженность поставщикам", accounts: ["3310", "3380"], type: "passive" },
        { code: "211", name: "Краткосрочные обязательства по налогам", accounts: ["3110", "3120", "3130", "3150"], type: "passive" },
        { code: "212", name: "Обязательства по социальным отчислениям", accounts: ["3210", "3220", "3230"], type: "passive" },
        { code: "213", name: "Краткосрочная задолженность по оплате труда", accounts: ["3350"], type: "passive" },
      ],
      totalCode: "300", totalName: "Итого краткосрочных обязательств",
    },
  ],
  capital: [
    {
      section: "V. Капитал",
      items: [
        { code: "410", name: "Уставный капитал", accounts: ["5010"], type: "passive" },
        { code: "411", name: "Нераспределённая прибыль (непокрытый убыток)", accounts: ["5510"], type: "passive", calculatedFromPnL: true },
      ],
      totalCode: "500", totalName: "Итого капитал",
    },
  ],
};

// ═══ СТРУКТУРА ОПУ (ф.2) ═══
const PNL_STRUCTURE = [
  { code: "010", name: "Доход от реализации продукции и оказания услуг", accounts: ["6010"], sign: "+" },
  { code: "020", name: "Себестоимость реализованной продукции и услуг", accounts: ["7010"], sign: "−" },
  { code: "030", name: "Валовая прибыль (010 − 020)", calculate: "gross", isCalculated: true },
  { code: "040", name: "Расходы по реализации", accounts: ["7110"], sign: "−" },
  { code: "050", name: "Административные расходы", accounts: ["7210"], sign: "−" },
  { code: "060", name: "Прочие расходы", accounts: ["7990"], sign: "−" },
  { code: "070", name: "Прочие доходы", accounts: ["6210", "6280"], sign: "+" },
  { code: "080", name: "Итого операционная прибыль (030 − 040 − 050 − 060 + 070)", calculate: "operating", isCalculated: true },
  { code: "090", name: "Доходы по финансированию", accounts: [], sign: "+" },
  { code: "100", name: "Расходы по финансированию", accounts: ["7310"], sign: "−" },
  { code: "110", name: "Прибыль до налогообложения (080 + 090 − 100)", calculate: "before_tax", isCalculated: true },
  { code: "120", name: "Расходы по корпоративному подоходному налогу (20%)", calculate: "tax", isCalculated: true },
  { code: "130", name: "Чистая прибыль (110 − 120)", calculate: "net", isCalculated: true },
];

export default function FinancialStatementsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("balance");
  const [balanceDate, setBalanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [pnlStart, setPnlStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [pnlEnd, setPnlEnd] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoaded(false);
    const [j, p] = await Promise.all([
      supabase.from("journal_entries").select("*").eq("user_id", user.id).order("entry_date"),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
    ]);
    setEntries(j.data || []);
    setProfile(p.data);
    setLoaded(true);
  }

  // Сальдо по счёту на конкретную дату (Дт - Кт всех проводок до даты включительно)
  function getBalance(account: string, asOfDate: string): number {
    let bal = 0;
    entries.forEach(e => {
      if (e.entry_date > asOfDate) return;
      if (String(e.debit_account) === account) bal += Number(e.amount);
      if (String(e.credit_account) === account) bal -= Number(e.amount);
    });
    return bal;
  }

  // Обороты по счёту за период
  function getTurnover(account: string, start: string, end: string): { debit: number; credit: number } {
    let debit = 0, credit = 0;
    entries.forEach(e => {
      if (e.entry_date < start || e.entry_date > end) return;
      if (String(e.debit_account) === account) debit += Number(e.amount);
      if (String(e.credit_account) === account) credit += Number(e.amount);
    });
    return { debit, credit };
  }

  // ═══ РАСЧЁТ БАЛАНСА ═══
  function calcBalanceItem(item: any): number {
    let total = 0;
    (item.accounts || []).forEach((acc: string) => {
      const bal = getBalance(acc, balanceDate);
      // Активные счета: положительное Дт-Кт
      // Пассивные: положительное Кт-Дт
      if (item.type === "active") total += Math.max(0, bal);
      else total += Math.max(0, -bal);
    });
    (item.minusAccounts || []).forEach((acc: string) => {
      const bal = getBalance(acc, balanceDate);
      // Минусуется по противоположному типу (амортизация - пассивный счёт)
      total -= Math.max(0, -bal);
    });
    return total;
  }

  // Нераспределённая прибыль рассчитывается из ОПУ за весь период до balance date
  function calcRetainedEarnings(asOfDate: string): number {
    const start = `${new Date(asOfDate).getFullYear()}-01-01`;
    return calcNetProfit(start, asOfDate);
  }

  // ═══ РАСЧЁТ ОПУ ═══
  function calcPnLItem(item: any, start: string, end: string): number {
    if (!item.accounts || item.isCalculated) return 0;
    let total = 0;
    item.accounts.forEach((acc: string) => {
      const t = getTurnover(acc, start, end);
      // Доходы: оборот по Кт (поступление в пассив)
      // Расходы: оборот по Дт (поступление в актив)
      if (acc.startsWith("6")) total += t.credit;
      else if (acc.startsWith("7")) total += t.debit;
    });
    return total;
  }

  function calcGross(start: string, end: string): number {
    return calcPnLItem({ accounts: ["6010"] }, start, end) - calcPnLItem({ accounts: ["7010"] }, start, end);
  }

  function calcOperating(start: string, end: string): number {
    return calcGross(start, end)
      - calcPnLItem({ accounts: ["7110"] }, start, end)
      - calcPnLItem({ accounts: ["7210"] }, start, end)
      - calcPnLItem({ accounts: ["7990"] }, start, end)
      + calcPnLItem({ accounts: ["6210", "6280"] }, start, end);
  }

  function calcBeforeTax(start: string, end: string): number {
    return calcOperating(start, end) - calcPnLItem({ accounts: ["7310"] }, start, end);
  }

  function calcTax(start: string, end: string): number {
    return Math.max(0, calcBeforeTax(start, end) * 0.20); // КПН 20%
  }

  function calcNetProfit(start: string, end: string): number {
    return calcBeforeTax(start, end) - calcTax(start, end);
  }

  function getPnLValue(item: any, start: string, end: string): number {
    if (item.calculate === "gross") return calcGross(start, end);
    if (item.calculate === "operating") return calcOperating(start, end);
    if (item.calculate === "before_tax") return calcBeforeTax(start, end);
    if (item.calculate === "tax") return calcTax(start, end);
    if (item.calculate === "net") return calcNetProfit(start, end);
    return calcPnLItem(item, start, end);
  }

  // ═══ БАЛАНС: РАСЧЁТЫ ═══
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalCapital = 0;

  BALANCE_STRUCTURE.assets.forEach(s => {
    s.items.forEach(it => { totalAssets += calcBalanceItem(it); });
  });

  BALANCE_STRUCTURE.liabilities.forEach(s => {
    s.items.forEach(it => { totalLiabilities += calcBalanceItem(it); });
  });

  BALANCE_STRUCTURE.capital.forEach(s => {
    s.items.forEach(it => {
      if (it.calculatedFromPnL) totalCapital += calcRetainedEarnings(balanceDate);
      else totalCapital += calcBalanceItem(it);
    });
  });

  const totalLiabAndCap = totalLiabilities + totalCapital;
  const balanceDiff = totalAssets - totalLiabAndCap;
  const isBalanced = Math.abs(balanceDiff) < 1;

  function exportPrint() {
    window.print();
  }

  if (!loaded) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Финансовая отчётность по НСФО РК. Бухгалтерский баланс (форма 1) — на дату. Отчёт о прибылях и убытках (форма 2) — за период. КПН 2026 = 20%.
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        <button onClick={() => setTab("balance")}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "balance" ? "var(--accent)" : "transparent", color: tab === "balance" ? "#fff" : "var(--t3)", border: tab === "balance" ? "none" : "1px solid var(--brd)" }}>
          📋 Бухгалтерский баланс (ф.1)
        </button>
        <button onClick={() => setTab("pnl")}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "pnl" ? "var(--accent)" : "transparent", color: tab === "pnl" ? "#fff" : "var(--t3)", border: tab === "pnl" ? "none" : "1px solid var(--brd)" }}>
          📈 Отчёт о прибылях и убытках (ф.2)
        </button>
        <button onClick={exportPrint} className="ml-auto px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" style={{ background: "#6366F120", color: "#6366F1" }}>🖨 Печать</button>
      </div>

      {/* ═══ БАЛАНС ═══ */}
      {tab === "balance" && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Отчётная дата</label><input type="date" value={balanceDate} onChange={e => setBalanceDate(e.target.value)} /></div>
              <div className="text-xs" style={{ color: isBalanced ? "#10B981" : "#EF4444" }}>
                {isBalanced ? "✓ Баланс сходится" : `⚠ Расхождение: ${fmtMoney(Math.abs(balanceDiff))} ₸`}
              </div>
            </div>
          </div>

          <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-center mb-4">
              <div className="text-xs" style={{ color: "var(--t3)" }}>Приложение 2 к приказу Министра финансов РК</div>
              <div className="text-base font-bold mt-2">БУХГАЛТЕРСКИЙ БАЛАНС</div>
              <div className="text-sm mt-1">по состоянию на {balanceDate}</div>
              <div className="text-xs mt-2" style={{ color: "var(--t3)" }}>
                {profile?.company_name || "Организация"} • БИН: {profile?.bin || "—"}
              </div>
              <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>(в тенге)</div>
            </div>

            {/* АКТИВЫ */}
            <div className="text-xs font-bold mb-2" style={{ color: "#10B981" }}>АКТИВЫ</div>
            <table style={{ fontSize: 11, marginBottom: 20 }}>
              <thead>
                <tr>
                  <th className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", width: 80 }}>Код</th>
                  <th className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Наименование статей</th>
                  <th className="text-right p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", width: 180 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {BALANCE_STRUCTURE.assets.map(section => (
                  <>
                    <tr key={section.section} style={{ background: "#10B98110" }}>
                      <td colSpan={3} className="p-2 font-bold text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{section.section}</td>
                    </tr>
                    {section.items.map(item => {
                      const value = calcBalanceItem(item);
                      return (
                        <tr key={item.code}>
                          <td className="p-1.5 font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{item.code}</td>
                          <td className="p-1.5" style={{ borderBottom: "1px solid var(--brd)" }}>{item.name}</td>
                          <td className="p-1.5 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{value > 0 ? fmtMoney(value) : "—"}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "var(--bg)" }}>
                      <td className="p-2 font-mono font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{section.totalCode}</td>
                      <td className="p-2 font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{section.totalName}</td>
                      <td className="p-2 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)", color: "#10B981" }}>{fmtMoney(section.items.reduce((a, i) => a + calcBalanceItem(i), 0))}</td>
                    </tr>
                  </>
                ))}
                <tr style={{ background: "#10B98120" }}>
                  <td className="p-2 font-mono font-bold text-[12px]">БАЛАНС</td>
                  <td className="p-2 font-bold text-[12px]">ИТОГО АКТИВЫ</td>
                  <td className="p-2 text-right font-bold text-[14px]" style={{ color: "#10B981" }}>{fmtMoney(totalAssets)}</td>
                </tr>
              </tbody>
            </table>

            {/* ОБЯЗАТЕЛЬСТВА И КАПИТАЛ */}
            <div className="text-xs font-bold mb-2" style={{ color: "#3B82F6" }}>ОБЯЗАТЕЛЬСТВА И КАПИТАЛ</div>
            <table style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", width: 80 }}>Код</th>
                  <th className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Наименование статей</th>
                  <th className="text-right p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", width: 180 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {BALANCE_STRUCTURE.liabilities.map(section => (
                  <>
                    <tr key={section.section} style={{ background: "#3B82F610" }}>
                      <td colSpan={3} className="p-2 font-bold text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{section.section}</td>
                    </tr>
                    {section.items.map(item => {
                      const value = calcBalanceItem(item);
                      return (
                        <tr key={item.code}>
                          <td className="p-1.5 font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{item.code}</td>
                          <td className="p-1.5" style={{ borderBottom: "1px solid var(--brd)" }}>{item.name}</td>
                          <td className="p-1.5 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{value > 0 ? fmtMoney(value) : "—"}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "var(--bg)" }}>
                      <td className="p-2 font-mono font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{section.totalCode}</td>
                      <td className="p-2 font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{section.totalName}</td>
                      <td className="p-2 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)", color: "#3B82F6" }}>{fmtMoney(section.items.reduce((a, i) => a + calcBalanceItem(i), 0))}</td>
                    </tr>
                  </>
                ))}

                {BALANCE_STRUCTURE.capital.map(section => (
                  <>
                    <tr key={section.section} style={{ background: "#A855F710" }}>
                      <td colSpan={3} className="p-2 font-bold text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{section.section}</td>
                    </tr>
                    {section.items.map(item => {
                      const value = item.calculatedFromPnL ? calcRetainedEarnings(balanceDate) : calcBalanceItem(item);
                      return (
                        <tr key={item.code}>
                          <td className="p-1.5 font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{item.code}</td>
                          <td className="p-1.5" style={{ borderBottom: "1px solid var(--brd)" }}>{item.name}</td>
                          <td className="p-1.5 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)", color: value < 0 ? "#EF4444" : undefined }}>{value !== 0 ? fmtMoney(value) : "—"}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "var(--bg)" }}>
                      <td className="p-2 font-mono font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{section.totalCode}</td>
                      <td className="p-2 font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{section.totalName}</td>
                      <td className="p-2 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)", color: "#A855F7" }}>{fmtMoney(totalCapital)}</td>
                    </tr>
                  </>
                ))}

                <tr style={{ background: "#3B82F620" }}>
                  <td className="p-2 font-mono font-bold text-[12px]">БАЛАНС</td>
                  <td className="p-2 font-bold text-[12px]">ИТОГО ОБЯЗАТЕЛЬСТВА И КАПИТАЛ</td>
                  <td className="p-2 text-right font-bold text-[14px]" style={{ color: "#3B82F6" }}>{fmtMoney(totalLiabAndCap)}</td>
                </tr>
              </tbody>
            </table>

            {/* Подписи */}
            <div className="grid grid-cols-2 gap-8 mt-8 text-[11px]">
              <div>
                <div className="border-b mb-1 pb-4" style={{ borderColor: "var(--brd)" }}></div>
                <div style={{ color: "var(--t3)" }}>Руководитель _____________________</div>
              </div>
              <div>
                <div className="border-b mb-1 pb-4" style={{ borderColor: "var(--brd)" }}></div>
                <div style={{ color: "var(--t3)" }}>Главный бухгалтер _____________________</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ ОПУ ═══ */}
      {tab === "pnl" && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="grid grid-cols-3 gap-3 items-end">
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Период с</label><input type="date" value={pnlStart} onChange={e => setPnlStart(e.target.value)} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>по</label><input type="date" value={pnlEnd} onChange={e => setPnlEnd(e.target.value)} /></div>
              <div className="flex items-end" style={{ paddingBottom: 8 }}>
                <div className="text-xs">
                  Чистая прибыль: <b style={{ color: calcNetProfit(pnlStart, pnlEnd) >= 0 ? "#10B981" : "#EF4444" }}>{fmtMoney(calcNetProfit(pnlStart, pnlEnd))} ₸</b>
                </div>
              </div>
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Доход от реализации</div>
              <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(calcPnLItem({ accounts: ["6010"] }, pnlStart, pnlEnd))} ₸</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Валовая прибыль</div>
              <div className="text-base font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(calcGross(pnlStart, pnlEnd))} ₸</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 До налогообложения</div>
              <div className="text-base font-bold" style={{ color: "#6366F1" }}>{fmtMoney(calcBeforeTax(pnlStart, pnlEnd))} ₸</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💎 Чистая прибыль</div>
              <div className="text-base font-bold" style={{ color: calcNetProfit(pnlStart, pnlEnd) >= 0 ? "#A855F7" : "#EF4444" }}>{fmtMoney(calcNetProfit(pnlStart, pnlEnd))} ₸</div>
            </div>
          </div>

          <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-center mb-4">
              <div className="text-xs" style={{ color: "var(--t3)" }}>Приложение 3 к приказу Министра финансов РК</div>
              <div className="text-base font-bold mt-2">ОТЧЁТ О ПРИБЫЛЯХ И УБЫТКАХ</div>
              <div className="text-sm mt-1">за период с {pnlStart} по {pnlEnd}</div>
              <div className="text-xs mt-2" style={{ color: "var(--t3)" }}>
                {profile?.company_name || "Организация"} • БИН: {profile?.bin || "—"}
              </div>
              <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>(в тенге)</div>
            </div>

            <table style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", width: 80 }}>Код</th>
                  <th className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>Наименование статей</th>
                  <th className="text-right p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", width: 180 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {PNL_STRUCTURE.map(item => {
                  const value = getPnLValue(item, pnlStart, pnlEnd);
                  const isCalc = item.isCalculated;
                  return (
                    <tr key={item.code} style={{ background: isCalc ? "var(--bg)" : "transparent" }}>
                      <td className="p-2 font-mono" style={{ borderBottom: "1px solid var(--brd)", fontWeight: isCalc ? 700 : 400 }}>{item.code}</td>
                      <td className="p-2" style={{ borderBottom: "1px solid var(--brd)", fontWeight: isCalc ? 700 : 400 }}>
                        {item.sign && !isCalc ? <span style={{ color: item.sign === "+" ? "#10B981" : "#EF4444", marginRight: 4 }}>{item.sign}</span> : null}
                        {item.name}
                      </td>
                      <td className="p-2 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)", color: isCalc ? (value >= 0 ? "#10B981" : "#EF4444") : undefined }}>
                        {value !== 0 ? fmtMoney(value) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-8 mt-8 text-[11px]">
              <div>
                <div className="border-b mb-1 pb-4" style={{ borderColor: "var(--brd)" }}></div>
                <div style={{ color: "var(--t3)" }}>Руководитель _____________________</div>
              </div>
              <div>
                <div className="border-b mb-1 pb-4" style={{ borderColor: "var(--brd)" }}></div>
                <div style={{ color: "var(--t3)" }}>Главный бухгалтер _____________________</div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 Формы соответствуют требованиям НСФО РК. Расчёт чистой прибыли учитывает КПН 20% (2026 год).<br/>
        💡 Нераспределённая прибыль в Балансе автоматически равна чистой прибыли с начала года до отчётной даты.<br/>
        💡 Если баланс не сходится — проверьте проводки через ОСВ (Дт = Кт по всем счетам).
      </div>
    </div>
  );
}
