"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

// План счетов РК с группами
const ACCOUNT_PLAN: Record<string, { name: string; type: "active" | "passive" | "active_passive"; group: string }> = {
  // 1000 - Краткосрочные активы
  "1010": { name: "Денежные средства в кассе", type: "active", group: "1000 Денежные средства" },
  "1030": { name: "Денежные средства на текущих банковских счетах", type: "active", group: "1000 Денежные средства" },
  "1040": { name: "Денежные средства на сберегательных счетах", type: "active", group: "1000 Денежные средства" },
  "1050": { name: "Прочие денежные средства", type: "active", group: "1000 Денежные средства" },
  "1210": { name: "Краткосрочная дебиторская задолженность покупателей", type: "active", group: "1200 Дебиторская задолженность" },
  "1250": { name: "Краткосрочная задолженность работников", type: "active", group: "1200 Дебиторская задолженность" },
  "1280": { name: "Прочая краткосрочная дебиторская задолженность", type: "active", group: "1200 Дебиторская задолженность" },
  "1310": { name: "Сырьё и материалы", type: "active", group: "1300 Запасы" },
  "1320": { name: "Готовая продукция", type: "active", group: "1300 Запасы" },
  "1330": { name: "Товары", type: "active", group: "1300 Запасы" },
  "1350": { name: "Прочие запасы", type: "active", group: "1300 Запасы" },
  "1410": { name: "Краткосрочная дебиторская задолженность по налогам", type: "active", group: "1400 Текущие налоговые активы" },
  "1420": { name: "НДС к возмещению", type: "active", group: "1400 Текущие налоговые активы" },
  // 2000 - Долгосрочные активы
  "2410": { name: "Основные средства", type: "active", group: "2400 Основные средства" },
  "2420": { name: "Амортизация ОС", type: "passive", group: "2400 Основные средства" },
  // 3000 - Краткосрочные обязательства
  "3110": { name: "Корпоративный подоходный налог к уплате", type: "passive", group: "3100 Налоги к уплате" },
  "3120": { name: "Индивидуальный подоходный налог к уплате", type: "passive", group: "3100 Налоги к уплате" },
  "3130": { name: "НДС к уплате", type: "passive", group: "3100 Налоги к уплате" },
  "3150": { name: "Социальный налог к уплате", type: "passive", group: "3100 Налоги к уплате" },
  "3210": { name: "Обязательства по социальному страхованию", type: "passive", group: "3200 Обязательства по соцотчислениям" },
  "3220": { name: "Обязательства по пенсионным отчислениям", type: "passive", group: "3200 Обязательства по соцотчислениям" },
  "3230": { name: "Прочие обязательства по социальным выплатам", type: "passive", group: "3200 Обязательства по соцотчислениям" },
  "3310": { name: "Краткосрочная кредиторская задолженность поставщикам", type: "passive", group: "3300 Кредиторская задолженность" },
  "3350": { name: "Краткосрочная задолженность по оплате труда", type: "passive", group: "3300 Кредиторская задолженность" },
  "3380": { name: "Прочая краткосрочная кредиторская задолженность", type: "passive", group: "3300 Кредиторская задолженность" },
  // 5000 - Капитал
  "5010": { name: "Уставный капитал", type: "passive", group: "5000 Капитал" },
  "5510": { name: "Нераспределённая прибыль", type: "passive", group: "5000 Капитал" },
  // 6000 - Доходы
  "6010": { name: "Доход от реализации продукции и оказания услуг", type: "passive", group: "6000 Доходы" },
  "6210": { name: "Доход от выбытия активов", type: "passive", group: "6000 Доходы" },
  "6280": { name: "Прочие доходы", type: "passive", group: "6000 Доходы" },
  // 7000 - Расходы
  "7010": { name: "Себестоимость реализованной продукции и услуг", type: "active", group: "7000 Расходы" },
  "7110": { name: "Расходы по реализации продукции", type: "active", group: "7000 Расходы" },
  "7210": { name: "Административные расходы", type: "active", group: "7000 Расходы" },
  "7310": { name: "Расходы по финансированию", type: "active", group: "7000 Расходы" },
  "7990": { name: "Прочие расходы", type: "active", group: "7000 Расходы" },
  // 8000 - Производство
  "8110": { name: "Основное производство", type: "active", group: "8000 Производство" },
};

interface AccountRow {
  account: string;
  name: string;
  type: string;
  group: string;
  start_debit: number;
  start_credit: number;
  turnover_debit: number;
  turnover_credit: number;
  end_debit: number;
  end_credit: number;
}

export default function TurnoverPage() {
  const supabase = createClient();
  const [periodStart, setPeriodStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [showGroups, setShowGroups] = useState(true);

  useEffect(() => { load(); }, [periodStart, periodEnd]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoaded(false);
    // Берём все проводки до конца периода (для расчёта остатков нужны все исторические)
    const { data } = await supabase.from("journal_entries").select("*").eq("user_id", user.id).lte("entry_date", periodEnd).order("entry_date");
    setEntries(data || []);
    setLoaded(true);
  }

  function calcOSV(): AccountRow[] {
    const accounts = new Map<string, AccountRow>();

    // Инициализируем все известные счета
    Object.entries(ACCOUNT_PLAN).forEach(([acc, info]) => {
      accounts.set(acc, {
        account: acc,
        name: info.name,
        type: info.type,
        group: info.group,
        start_debit: 0,
        start_credit: 0,
        turnover_debit: 0,
        turnover_credit: 0,
        end_debit: 0,
        end_credit: 0,
      });
    });

    // Все проводки делим на: до периода (для начального сальдо) и за период (для оборотов)
    entries.forEach(e => {
      const debit = String(e.debit_account);
      const credit = String(e.credit_account);
      const amt = Number(e.amount);
      const beforePeriod = e.entry_date < periodStart;
      const inPeriod = e.entry_date >= periodStart && e.entry_date <= periodEnd;

      // Создаём счёт если его нет в плане
      [debit, credit].forEach(acc => {
        if (!accounts.has(acc)) {
          accounts.set(acc, {
            account: acc,
            name: `Счёт ${acc}`,
            type: "active",
            group: "Прочее",
            start_debit: 0, start_credit: 0,
            turnover_debit: 0, turnover_credit: 0,
            end_debit: 0, end_credit: 0,
          });
        }
      });

      const debitAcc = accounts.get(debit)!;
      const creditAcc = accounts.get(credit)!;

      if (beforePeriod) {
        // Накапливаем для начального сальдо (как сальдированная разница Дт-Кт)
        debitAcc.start_debit += amt;
        creditAcc.start_credit += amt;
      } else if (inPeriod) {
        // Обороты за период
        debitAcc.turnover_debit += amt;
        creditAcc.turnover_credit += amt;
      }
    });

    // Вычисляем сальдо в зависимости от типа счёта
    accounts.forEach(a => {
      // Начальное сальдо
      const startBalance = a.start_debit - a.start_credit;
      if (a.type === "active") {
        a.start_debit = Math.max(0, startBalance);
        a.start_credit = 0;
      } else if (a.type === "passive") {
        a.start_debit = 0;
        a.start_credit = Math.max(0, -startBalance);
      } else {
        // active_passive: показываем как есть
        a.start_debit = Math.max(0, startBalance);
        a.start_credit = Math.max(0, -startBalance);
      }

      // Конечное сальдо = начальное + обороты
      const fullDt = a.start_debit + a.turnover_debit;
      const fullKt = a.start_credit + a.turnover_credit;
      const endBalance = fullDt - fullKt;
      if (a.type === "active") {
        a.end_debit = Math.max(0, endBalance);
        a.end_credit = 0;
      } else if (a.type === "passive") {
        a.end_debit = 0;
        a.end_credit = Math.max(0, -endBalance);
      } else {
        a.end_debit = Math.max(0, endBalance);
        a.end_credit = Math.max(0, -endBalance);
      }
    });

    let result = Array.from(accounts.values()).sort((a, b) => a.account.localeCompare(b.account));
    if (showOnlyActive) {
      result = result.filter(a => a.start_debit > 0 || a.start_credit > 0 || a.turnover_debit > 0 || a.turnover_credit > 0 || a.end_debit > 0 || a.end_credit > 0);
    }
    return result;
  }

  const osv = calcOSV();

  // Группировка
  const grouped: Record<string, AccountRow[]> = {};
  osv.forEach(a => {
    if (!grouped[a.group]) grouped[a.group] = [];
    grouped[a.group].push(a);
  });

  // Итоги
  const totals = osv.reduce((t, a) => ({
    start_debit: t.start_debit + a.start_debit,
    start_credit: t.start_credit + a.start_credit,
    turnover_debit: t.turnover_debit + a.turnover_debit,
    turnover_credit: t.turnover_credit + a.turnover_credit,
    end_debit: t.end_debit + a.end_debit,
    end_credit: t.end_credit + a.end_credit,
  }), { start_debit: 0, start_credit: 0, turnover_debit: 0, turnover_credit: 0, end_debit: 0, end_credit: 0 });

  // Проверка баланса
  const startBalanced = Math.abs(totals.start_debit - totals.start_credit) < 0.01;
  const turnoverBalanced = Math.abs(totals.turnover_debit - totals.turnover_credit) < 0.01;
  const endBalanced = Math.abs(totals.end_debit - totals.end_credit) < 0.01;

  function exportCSV() {
    const rows = [
      ["Счёт", "Наименование", "Сальдо нач. Дт", "Сальдо нач. Кт", "Оборот Дт", "Оборот Кт", "Сальдо кон. Дт", "Сальдо кон. Кт"],
      ...osv.map(a => [a.account, a.name, a.start_debit.toFixed(2), a.start_credit.toFixed(2), a.turnover_debit.toFixed(2), a.turnover_credit.toFixed(2), a.end_debit.toFixed(2), a.end_credit.toFixed(2)]),
      ["", "ИТОГО:", totals.start_debit.toFixed(2), totals.start_credit.toFixed(2), totals.turnover_debit.toFixed(2), totals.turnover_credit.toFixed(2), totals.end_debit.toFixed(2), totals.end_credit.toFixed(2)],
    ];
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ОСВ_${periodStart}_${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printOSV() {
    window.print();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Оборотно-сальдовая ведомость — основной отчёт бухгалтера. Показывает по каждому счёту: остаток на начало, обороты Дт/Кт, остаток на конец.
      </div>

      {/* Period and filters */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="grid grid-cols-5 gap-3 items-end">
          <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Период с</label><input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></div>
          <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>по</label><input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></div>
          <div className="flex items-end gap-3" style={{ paddingBottom: 8 }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
              <span className="text-xs">Только с движением</span>
            </label>
          </div>
          <div className="flex items-end gap-3" style={{ paddingBottom: 8 }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showGroups} onChange={e => setShowGroups(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
              <span className="text-xs">По группам</span>
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={exportCSV} className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" style={{ background: "#10B98120", color: "#10B981" }}>📊 CSV</button>
            <button onClick={printOSV} className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" style={{ background: "#6366F120", color: "#6366F1" }}>🖨 Печать</button>
          </div>
        </div>
      </div>

      {/* Balance check indicators */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg p-3" style={{ background: startBalanced ? "#10B98110" : "#EF444410", border: `1px solid ${startBalanced ? "#10B98130" : "#EF444430"}` }}>
          <div className="flex items-center gap-2">
            <span className="text-base">{startBalanced ? "✓" : "⚠"}</span>
            <div>
              <div className="text-xs font-bold" style={{ color: startBalanced ? "#10B981" : "#EF4444" }}>Начальное сальдо</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>{startBalanced ? "Баланс сходится" : `Расхождение: ${fmtMoney(Math.abs(totals.start_debit - totals.start_credit))} ₸`}</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg p-3" style={{ background: turnoverBalanced ? "#10B98110" : "#EF444410", border: `1px solid ${turnoverBalanced ? "#10B98130" : "#EF444430"}` }}>
          <div className="flex items-center gap-2">
            <span className="text-base">{turnoverBalanced ? "✓" : "⚠"}</span>
            <div>
              <div className="text-xs font-bold" style={{ color: turnoverBalanced ? "#10B981" : "#EF4444" }}>Обороты за период</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>{turnoverBalanced ? "Дт = Кт" : `Расхождение: ${fmtMoney(Math.abs(totals.turnover_debit - totals.turnover_credit))} ₸`}</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg p-3" style={{ background: endBalanced ? "#10B98110" : "#EF444410", border: `1px solid ${endBalanced ? "#10B98130" : "#EF444430"}` }}>
          <div className="flex items-center gap-2">
            <span className="text-base">{endBalanced ? "✓" : "⚠"}</span>
            <div>
              <div className="text-xs font-bold" style={{ color: endBalanced ? "#10B981" : "#EF4444" }}>Конечное сальдо</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>{endBalanced ? "Баланс сходится" : `Расхождение: ${fmtMoney(Math.abs(totals.end_debit - totals.end_credit))} ₸`}</div>
            </div>
          </div>
        </div>
      </div>

      {/* OSV Table */}
      {!loaded ? (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>Загрузка...</div>
      ) : osv.length === 0 ? (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
          Нет проводок за период {periodStart} — {periodEnd}
        </div>
      ) : (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3 text-center">
            ОБОРОТНО-САЛЬДОВАЯ ВЕДОМОСТЬ<br/>
            <span className="text-xs font-normal" style={{ color: "var(--t3)" }}>за период с {periodStart} по {periodEnd}</span>
          </div>

          <table style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th rowSpan={2} className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", verticalAlign: "bottom" }}>Счёт</th>
                <th rowSpan={2} className="text-left p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", verticalAlign: "bottom" }}>Наименование</th>
                <th colSpan={2} className="text-center p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>Сальдо на начало</th>
                <th colSpan={2} className="text-center p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>Обороты за период</th>
                <th colSpan={2} className="text-center p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>Сальдо на конец</th>
              </tr>
              <tr>
                <th className="text-right p-1.5 font-semibold" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", fontSize: 10 }}>Дебет</th>
                <th className="text-right p-1.5 font-semibold" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", fontSize: 10 }}>Кредит</th>
                <th className="text-right p-1.5 font-semibold" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", fontSize: 10 }}>Дебет</th>
                <th className="text-right p-1.5 font-semibold" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", fontSize: 10 }}>Кредит</th>
                <th className="text-right p-1.5 font-semibold" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", fontSize: 10 }}>Дебет</th>
                <th className="text-right p-1.5 font-semibold" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", fontSize: 10 }}>Кредит</th>
              </tr>
            </thead>
            <tbody>
              {showGroups ? (
                Object.entries(grouped).map(([group, accs]) => (
                  <>
                    <tr key={group}><td colSpan={8} className="p-2 font-bold text-[11px]" style={{ background: "var(--bg)", color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{group}</td></tr>
                    {accs.map(a => (
                      <tr key={a.account}>
                        <td className="p-1.5 font-mono font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{a.account}</td>
                        <td className="p-1.5" style={{ borderBottom: "1px solid var(--brd)" }}>{a.name}</td>
                        <td className="p-1.5 text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{a.start_debit > 0 ? fmtMoney(a.start_debit) : ""}</td>
                        <td className="p-1.5 text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{a.start_credit > 0 ? fmtMoney(a.start_credit) : ""}</td>
                        <td className="p-1.5 text-right" style={{ color: a.turnover_debit > 0 ? "#10B981" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{a.turnover_debit > 0 ? fmtMoney(a.turnover_debit) : ""}</td>
                        <td className="p-1.5 text-right" style={{ color: a.turnover_credit > 0 ? "#3B82F6" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{a.turnover_credit > 0 ? fmtMoney(a.turnover_credit) : ""}</td>
                        <td className="p-1.5 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{a.end_debit > 0 ? fmtMoney(a.end_debit) : ""}</td>
                        <td className="p-1.5 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{a.end_credit > 0 ? fmtMoney(a.end_credit) : ""}</td>
                      </tr>
                    ))}
                  </>
                ))
              ) : (
                osv.map(a => (
                  <tr key={a.account}>
                    <td className="p-1.5 font-mono font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{a.account}</td>
                    <td className="p-1.5" style={{ borderBottom: "1px solid var(--brd)" }}>{a.name}</td>
                    <td className="p-1.5 text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{a.start_debit > 0 ? fmtMoney(a.start_debit) : ""}</td>
                    <td className="p-1.5 text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{a.start_credit > 0 ? fmtMoney(a.start_credit) : ""}</td>
                    <td className="p-1.5 text-right" style={{ color: a.turnover_debit > 0 ? "#10B981" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{a.turnover_debit > 0 ? fmtMoney(a.turnover_debit) : ""}</td>
                    <td className="p-1.5 text-right" style={{ color: a.turnover_credit > 0 ? "#3B82F6" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{a.turnover_credit > 0 ? fmtMoney(a.turnover_credit) : ""}</td>
                    <td className="p-1.5 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{a.end_debit > 0 ? fmtMoney(a.end_debit) : ""}</td>
                    <td className="p-1.5 text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{a.end_credit > 0 ? fmtMoney(a.end_credit) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--bg)" }}>
                <td colSpan={2} className="p-2 font-bold uppercase text-[12px]">ИТОГО:</td>
                <td className="p-2 text-right font-bold text-[12px]">{fmtMoney(totals.start_debit)}</td>
                <td className="p-2 text-right font-bold text-[12px]">{fmtMoney(totals.start_credit)}</td>
                <td className="p-2 text-right font-bold text-[12px]" style={{ color: "#10B981" }}>{fmtMoney(totals.turnover_debit)}</td>
                <td className="p-2 text-right font-bold text-[12px]" style={{ color: "#3B82F6" }}>{fmtMoney(totals.turnover_credit)}</td>
                <td className="p-2 text-right font-bold text-[12px]">{fmtMoney(totals.end_debit)}</td>
                <td className="p-2 text-right font-bold text-[12px]">{fmtMoney(totals.end_credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Как читать ОСВ:</b><br/>
        • <b>Активные счета</b> (1010, 1330, 7210...) имеют дебетовое сальдо: сколько у нас денег/товаров/расходов<br/>
        • <b>Пассивные счета</b> (3310, 3130, 6010...) имеют кредитовое сальдо: сколько мы должны / сколько заработали<br/>
        • <b>Дт оборот</b> = увеличение активных, уменьшение пассивных<br/>
        • <b>Кт оборот</b> = уменьшение активных, увеличение пассивных<br/>
        • <b>Итого Дт = Итого Кт</b> — основной принцип двойной записи. Если расходится — есть несбалансированные проводки.
      </div>
    </div>
  );
}
