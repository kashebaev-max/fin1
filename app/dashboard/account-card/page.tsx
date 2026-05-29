"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

const ACCOUNT_PLAN: Record<string, { name: string; type: "active" | "passive" | "active_passive" }> = {
  "1010": { name: "Денежные средства в кассе", type: "active" },
  "1030": { name: "Денежные средства на текущих банковских счетах", type: "active" },
  "1040": { name: "Денежные средства на сберегательных счетах", type: "active" },
  "1050": { name: "Прочие денежные средства", type: "active" },
  "1210": { name: "Дебиторская задолженность покупателей", type: "active" },
  "1250": { name: "Краткосрочная задолженность работников", type: "active" },
  "1280": { name: "Прочая краткосрочная дебиторская задолженность", type: "active" },
  "1310": { name: "Сырьё и материалы", type: "active" },
  "1320": { name: "Готовая продукция", type: "active" },
  "1330": { name: "Товары", type: "active" },
  "1350": { name: "Прочие запасы", type: "active" },
  "1410": { name: "Краткосрочная дебиторская задолженность по налогам", type: "active" },
  "1420": { name: "НДС к возмещению", type: "active" },
  "2410": { name: "Основные средства", type: "active" },
  "2420": { name: "Амортизация ОС", type: "passive" },
  "3110": { name: "КПН к уплате", type: "passive" },
  "3120": { name: "ИПН к уплате", type: "passive" },
  "3130": { name: "НДС к уплате", type: "passive" },
  "3150": { name: "Социальный налог к уплате", type: "passive" },
  "3210": { name: "Обязательства по социальному страхованию", type: "passive" },
  "3220": { name: "Обязательства по пенсионным отчислениям", type: "passive" },
  "3230": { name: "Прочие обязательства по социальным выплатам", type: "passive" },
  "3310": { name: "Кредиторская задолженность поставщикам", type: "passive" },
  "3350": { name: "Краткосрочная задолженность по оплате труда", type: "passive" },
  "3380": { name: "Прочая краткосрочная кредиторская задолженность", type: "passive" },
  "5010": { name: "Уставный капитал", type: "passive" },
  "5510": { name: "Нераспределённая прибыль", type: "passive" },
  "6010": { name: "Доход от реализации продукции и оказания услуг", type: "passive" },
  "6210": { name: "Доход от выбытия активов", type: "passive" },
  "6280": { name: "Прочие доходы", type: "passive" },
  "7010": { name: "Себестоимость реализованной продукции и услуг", type: "active" },
  "7110": { name: "Расходы по реализации продукции", type: "active" },
  "7210": { name: "Административные расходы", type: "active" },
  "7310": { name: "Расходы по финансированию", type: "active" },
  "7990": { name: "Прочие расходы", type: "active" },
  "8110": { name: "Основное производство", type: "active" },
};

type Tab = "card" | "analysis" | "corresp";

export default function AccountCardPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("card");
  const [account, setAccount] = useState("1330");
  const [periodStart, setPeriodStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { load(); }, [periodEnd]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoaded(false);
    const { data } = await supabase.from("journal_entries").select("*").eq("user_id", user.id).lte("entry_date", periodEnd).order("entry_date").order("created_at");
    setEntries(data || []);
    setLoaded(true);
  }

  // Все проводки, где участвует выбранный счёт
  const accInfo = ACCOUNT_PLAN[account] || { name: `Счёт ${account}`, type: "active" as const };
  const isActive = accInfo.type === "active";

  // Начальное сальдо (всё что было до периода)
  const beforePeriod = entries.filter(e => e.entry_date < periodStart && (String(e.debit_account) === account || String(e.credit_account) === account));
  let startBalance = 0;
  beforePeriod.forEach(e => {
    if (String(e.debit_account) === account) startBalance += Number(e.amount);
    if (String(e.credit_account) === account) startBalance -= Number(e.amount);
  });

  // Проводки за период
  const inPeriod = entries.filter(e => e.entry_date >= periodStart && e.entry_date <= periodEnd && (String(e.debit_account) === account || String(e.credit_account) === account));

  // Карточка счёта с накопительным сальдо
  let runningBalance = startBalance;
  const cardRows = inPeriod.map(e => {
    const isDebit = String(e.debit_account) === account;
    const amount = Number(e.amount);
    const debit = isDebit ? amount : 0;
    const credit = !isDebit ? amount : 0;
    const corrAccount = isDebit ? e.credit_account : e.debit_account;
    runningBalance += debit - credit;
    return {
      id: e.id,
      date: e.entry_date,
      doc: e.doc_ref,
      description: e.description,
      corrAccount: String(corrAccount),
      debit,
      credit,
      balance: runningBalance,
    };
  });

  // Итоги
  const totalDebit = cardRows.reduce((a, r) => a + r.debit, 0);
  const totalCredit = cardRows.reduce((a, r) => a + r.credit, 0);
  const endBalance = startBalance + totalDebit - totalCredit;

  // Корреспонденция (анализ субсчётов)
  const correspMap: Record<string, { debit: number; credit: number; count: number }> = {};
  inPeriod.forEach(e => {
    const isDebit = String(e.debit_account) === account;
    const corr = isDebit ? String(e.credit_account) : String(e.debit_account);
    if (!correspMap[corr]) correspMap[corr] = { debit: 0, credit: 0, count: 0 };
    correspMap[corr].count += 1;
    if (isDebit) correspMap[corr].debit += Number(e.amount);
    else correspMap[corr].credit += Number(e.amount);
  });

  const correspList = Object.entries(correspMap).map(([acc, data]) => ({
    account: acc,
    name: ACCOUNT_PLAN[acc]?.name || `Счёт ${acc}`,
    ...data,
  })).sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit));

  function fmtSaldo(amt: number): string {
    if (Math.abs(amt) < 0.01) return "0";
    if (isActive) return amt > 0 ? `Дт ${fmtMoney(amt)}` : `Кт ${fmtMoney(-amt)}`;
    return amt < 0 ? `Кт ${fmtMoney(-amt)}` : `Дт ${fmtMoney(amt)}`;
  }

  function exportCSV() {
    const rows = [
      ["Дата", "Документ", "Описание", "Корр. счёт", "Дебет", "Кредит", "Сальдо"],
      ...cardRows.map(r => [r.date, r.doc || "", r.description || "", r.corrAccount, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)]),
      ["", "", "ИТОГО:", "", totalDebit.toFixed(2), totalCredit.toFixed(2), endBalance.toFixed(2)],
    ];
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Карточка_счёта_${account}_${periodStart}_${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Карточка счёта показывает все проводки по выбранному счёту с накопительным сальдо. Анализ счёта — итоги в разрезе корреспондирующих счетов.
      </div>

      {/* Period and account */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="grid grid-cols-4 gap-3 items-end">
          <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Счёт</label>
            <select value={account} onChange={e => setAccount(e.target.value)}>
              {Object.entries(ACCOUNT_PLAN).map(([acc, info]) => (
                <option key={acc} value={acc}>{acc} — {info.name} ({info.type === "active" ? "Активный" : "Пассивный"})</option>
              ))}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Период с</label><input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></div>
          <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>по</label><input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>Сальдо начало</div>
          <div className="text-base font-bold" style={{ color: "#6366F1" }}>{fmtSaldo(startBalance)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>Оборот Дт</div>
          <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalDebit)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #3B82F6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>Оборот Кт</div>
          <div className="text-base font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(totalCredit)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>Сальдо конец</div>
          <div className="text-base font-bold" style={{ color: "#A855F7" }}>{fmtSaldo(endBalance)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        {([
          ["card", `📒 Карточка счёта (${cardRows.length})`],
          ["analysis", "📊 Анализ счёта"],
          ["corresp", `🔄 Корреспонденция (${correspList.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
        <button onClick={exportCSV} className="ml-auto px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" style={{ background: "#10B98120", color: "#10B981" }}>📊 Экспорт CSV</button>
      </div>

      {!loaded ? (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>Загрузка...</div>
      ) : (
        <>
          {/* ═══ КАРТОЧКА СЧЁТА ═══ */}
          {tab === "card" && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-1 text-center">Карточка счёта {account} «{accInfo.name}»</div>
              <div className="text-xs text-center mb-4" style={{ color: "var(--t3)" }}>Период: {periodStart} — {periodEnd}</div>

              <table style={{ fontSize: 11 }}>
                <thead>
                  <tr>{["Дата", "Документ", "Описание", "Корр. счёт", "Дебет", "Кредит", "Сальдо"].map(h => (
                    <th key={h} className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  <tr style={{ background: "var(--bg)" }}>
                    <td colSpan={6} className="p-2 font-bold text-[11px]">Сальдо на начало периода</td>
                    <td className="p-2 text-right font-bold text-[11px]" style={{ color: "#6366F1" }}>{fmtSaldo(startBalance)}</td>
                  </tr>
                  {cardRows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет проводок за период</td></tr>
                  ) : cardRows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="p-1.5" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.date}</td>
                      <td className="p-1.5 font-mono text-[10px]" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{r.doc || "—"}</td>
                      <td className="p-1.5 text-[10px]" style={{ borderBottom: "1px solid var(--brd)" }}>{r.description || "—"}</td>
                      <td className="p-1.5 font-mono font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{r.corrAccount}</td>
                      <td className="p-1.5 text-right font-bold" style={{ color: r.debit > 0 ? "#10B981" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.debit > 0 ? fmtMoney(r.debit) : ""}</td>
                      <td className="p-1.5 text-right font-bold" style={{ color: r.credit > 0 ? "#3B82F6" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.credit > 0 ? fmtMoney(r.credit) : ""}</td>
                      <td className="p-1.5 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtSaldo(r.balance)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "var(--bg)" }}>
                    <td colSpan={4} className="p-2 font-bold text-[11px]">Обороты за период:</td>
                    <td className="p-2 text-right font-bold text-[11px]" style={{ color: "#10B981" }}>{fmtMoney(totalDebit)}</td>
                    <td className="p-2 text-right font-bold text-[11px]" style={{ color: "#3B82F6" }}>{fmtMoney(totalCredit)}</td>
                    <td></td>
                  </tr>
                  <tr style={{ background: "var(--bg)" }}>
                    <td colSpan={6} className="p-2 font-bold text-[11px]">Сальдо на конец периода</td>
                    <td className="p-2 text-right font-bold text-[12px]" style={{ color: "#A855F7" }}>{fmtSaldo(endBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ АНАЛИЗ СЧЁТА ═══ */}
          {tab === "analysis" && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-1 text-center">Анализ счёта {account} «{accInfo.name}»</div>
              <div className="text-xs text-center mb-4" style={{ color: "var(--t3)" }}>Период: {periodStart} — {periodEnd}</div>

              <table>
                <thead>
                  <tr>{["Корр. счёт", "Наименование", "С кредита счетов в дебет", "С дебета счёта в кредит", "Кол-во операций"].map(h => (
                    <th key={h} className="text-left p-2 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {correspList.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет данных</td></tr>
                  ) : correspList.map(c => (
                    <tr key={c.account}>
                      <td className="p-2 text-[12px] font-mono font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{c.account}</td>
                      <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{c.name}</td>
                      <td className="p-2 text-[12px] text-right font-bold" style={{ color: c.debit > 0 ? "#10B981" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.debit > 0 ? fmtMoney(c.debit) + " ₸" : "—"}</td>
                      <td className="p-2 text-[12px] text-right font-bold" style={{ color: c.credit > 0 ? "#3B82F6" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.credit > 0 ? fmtMoney(c.credit) + " ₸" : "—"}</td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--bg)" }}>
                    <td colSpan={2} className="p-2 font-bold text-[12px]">ИТОГО ОБОРОТЫ:</td>
                    <td className="p-2 text-[12px] text-right font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalDebit)} ₸</td>
                    <td className="p-2 text-[12px] text-right font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(totalCredit)} ₸</td>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>{inPeriod.length} операций</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ═══ КОРРЕСПОНДЕНЦИЯ С ВИЗУАЛИЗАЦИЕЙ ═══ */}
          {tab === "corresp" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3" style={{ color: "#10B981" }}>📥 С кредита счетов в дебет {account}</div>
                <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>{isActive ? "Поступление / увеличение актива" : "Уменьшение пассива"}</div>
                {(() => {
                  const incoming = correspList.filter(c => c.debit > 0).sort((a, b) => b.debit - a.debit);
                  if (incoming.length === 0) return <div className="text-xs py-3 text-center" style={{ color: "var(--t3)" }}>Нет операций</div>;
                  const max = incoming[0].debit;
                  return incoming.map(c => {
                    const pct = (c.debit / max) * 100;
                    return (
                      <div key={c.account} className="py-1.5">
                        <div className="flex justify-between mb-1">
                          <span className="text-xs"><span className="font-mono font-bold" style={{ color: "var(--accent)" }}>{c.account}</span> {c.name}</span>
                          <span className="text-xs font-bold" style={{ color: "#10B981" }}>{fmtMoney(c.debit)} ₸</span>
                        </div>
                        <div style={{ height: 4, background: "var(--bg)", borderRadius: 2 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#10B981", borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3" style={{ color: "#3B82F6" }}>📤 С дебета {account} в кредит счетов</div>
                <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>{isActive ? "Списание / уменьшение актива" : "Увеличение пассива"}</div>
                {(() => {
                  const outgoing = correspList.filter(c => c.credit > 0).sort((a, b) => b.credit - a.credit);
                  if (outgoing.length === 0) return <div className="text-xs py-3 text-center" style={{ color: "var(--t3)" }}>Нет операций</div>;
                  const max = outgoing[0].credit;
                  return outgoing.map(c => {
                    const pct = (c.credit / max) * 100;
                    return (
                      <div key={c.account} className="py-1.5">
                        <div className="flex justify-between mb-1">
                          <span className="text-xs"><span className="font-mono font-bold" style={{ color: "var(--accent)" }}>{c.account}</span> {c.name}</span>
                          <span className="text-xs font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(c.credit)} ₸</span>
                        </div>
                        <div style={{ height: 4, background: "var(--bg)", borderRadius: 2 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#3B82F6", borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Карточка счёта</b> — все движения с накопительным сальдо. Видно историю каждой суммы.<br/>
        💡 <b>Анализ счёта</b> — итоги в разрезе корреспондирующих счетов: с какими ещё счетами работал выбранный за период.<br/>
        💡 <b>Корреспонденция</b> — визуализация: откуда приходят деньги/товары и куда уходят.
      </div>
    </div>
  );
}
