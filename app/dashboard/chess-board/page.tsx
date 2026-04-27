"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

const ACC_NAMES: Record<string, string> = {
  "1010": "Касса", "1030": "Тек. счета", "1040": "Сберег. счета", "1050": "Прочие ден.",
  "1210": "Деб. покуп.", "1250": "Под отчёт", "1280": "Проч. деб.",
  "1310": "Материалы", "1320": "Гот. прод.", "1330": "Товары", "1350": "Проч. запасы",
  "1410": "Деб. налоги", "1420": "НДС к возмещ.",
  "2410": "ОС", "2420": "Аморт. ОС",
  "3110": "КПН", "3120": "ИПН", "3130": "НДС к упл.", "3150": "СН",
  "3210": "СО", "3220": "ОПВ", "3230": "ВОСМС/ООСМС",
  "3310": "Кред. пост.", "3350": "ЗП к выплате", "3380": "Проч. кред.",
  "5010": "Уст. кап.", "5510": "Нерасп. приб.",
  "6010": "Доход реализ.", "6210": "Доход выбытия", "6280": "Проч. доходы",
  "7010": "Себест.", "7110": "Расх. реализ.", "7210": "Адм. расх.", "7310": "Расх. финанс.", "7990": "Проч. расх.",
  "8110": "Производство",
};

interface CellData {
  amount: number;
  count: number;
}

export default function ChessBoardPage() {
  const supabase = createClient();
  const [periodStart, setPeriodStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ debit: string; credit: string } | null>(null);

  useEffect(() => { load(); }, [periodStart, periodEnd]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoaded(false);
    const { data } = await supabase.from("journal_entries").select("*").eq("user_id", user.id)
      .gte("entry_date", periodStart).lte("entry_date", periodEnd).order("entry_date");
    setEntries(data || []);
    setLoaded(true);
  }

  // Строим шахматку: матрица Дт × Кт
  const matrix: Record<string, Record<string, CellData>> = {};
  const usedDebits = new Set<string>();
  const usedCredits = new Set<string>();
  const debitTotals: Record<string, number> = {};
  const creditTotals: Record<string, number> = {};

  entries.forEach(e => {
    const dt = String(e.debit_account);
    const kt = String(e.credit_account);
    const amt = Number(e.amount);

    usedDebits.add(dt);
    usedCredits.add(kt);

    if (!matrix[dt]) matrix[dt] = {};
    if (!matrix[dt][kt]) matrix[dt][kt] = { amount: 0, count: 0 };
    matrix[dt][kt].amount += amt;
    matrix[dt][kt].count += 1;

    debitTotals[dt] = (debitTotals[dt] || 0) + amt;
    creditTotals[kt] = (creditTotals[kt] || 0) + amt;
  });

  const debits = Array.from(usedDebits).sort();
  const credits = Array.from(usedCredits).sort();
  const total = entries.reduce((a, e) => a + Number(e.amount), 0);

  // Самые крупные операции
  const topCombos: { debit: string; credit: string; amount: number; count: number }[] = [];
  Object.entries(matrix).forEach(([dt, row]) => {
    Object.entries(row).forEach(([kt, data]) => {
      topCombos.push({ debit: dt, credit: kt, ...data });
    });
  });
  topCombos.sort((a, b) => b.amount - a.amount);

  // Отфильтрованные проводки для модалки
  const cellEntries = selectedCell
    ? entries.filter(e => String(e.debit_account) === selectedCell.debit && String(e.credit_account) === selectedCell.credit)
    : [];
  const cellTotal = cellEntries.reduce((a, e) => a + Number(e.amount), 0);

  function cellColor(amount: number): string {
    if (amount === 0) return "transparent";
    const max = Math.max(...topCombos.map(t => t.amount), 1);
    const intensity = Math.min(1, (amount / max) * 1.2);
    return `rgba(99, 102, 241, ${0.1 + intensity * 0.5})`;
  }

  function exportCSV() {
    const rows: string[][] = [];
    const header = ["Дт \\ Кт", ...credits.map(k => k), "Итого Дт"];
    rows.push(header);
    debits.forEach(dt => {
      const row = [dt];
      credits.forEach(kt => {
        const cell = matrix[dt]?.[kt];
        row.push(cell ? cell.amount.toFixed(2) : "");
      });
      row.push(debitTotals[dt]?.toFixed(2) || "0");
      rows.push(row);
    });
    const totalRow = ["Итого Кт", ...credits.map(kt => (creditTotals[kt] || 0).toFixed(2)), total.toFixed(2)];
    rows.push(totalRow);
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Шахматка_${periodStart}_${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Шахматка проводок — матрица Дт × Кт. По строкам — счета по дебету, по столбцам — по кредиту. На пересечении — суммарный оборот. Кликните на ячейку для деталей.
      </div>

      {/* Period */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="grid grid-cols-4 gap-3 items-end">
          <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Период с</label><input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></div>
          <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>по</label><input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></div>
          <div className="flex items-end" style={{ paddingBottom: 8 }}>
            <div className="text-xs"><span style={{ color: "var(--t3)" }}>Проводок: </span><b>{entries.length}</b></div>
          </div>
          <button onClick={exportCSV} className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" style={{ background: "#10B98120", color: "#10B981" }}>📊 Экспорт CSV</button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Всего проводок</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{entries.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Общий оборот</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(total)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🔢 Уник. корреспонденций</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{topCombos.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 Счетов задействовано</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{new Set([...usedDebits, ...usedCredits]).size}</div>
        </div>
      </div>

      {/* Top correspondences */}
      {topCombos.length > 0 && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">🏆 Топ-10 корреспонденций по сумме</div>
          <div className="grid grid-cols-2 gap-2">
            {topCombos.slice(0, 10).map((c, i) => {
              const max = topCombos[0].amount;
              const pct = (c.amount / max) * 100;
              return (
                <div key={i} className="rounded-lg p-3" style={{ background: "var(--bg)", cursor: "pointer" }} onClick={() => setSelectedCell({ debit: c.debit, credit: c.credit })}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs">
                      <span className="font-mono font-bold" style={{ color: "#10B981" }}>Дт {c.debit}</span>
                      <span style={{ color: "var(--t3)" }}> → </span>
                      <span className="font-mono font-bold" style={{ color: "#3B82F6" }}>Кт {c.credit}</span>
                    </span>
                    <span className="text-xs font-bold">{fmtMoney(c.amount)} ₸</span>
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                    {ACC_NAMES[c.debit] || c.debit} → {ACC_NAMES[c.credit] || c.credit} • {c.count} опер.
                  </div>
                  <div className="mt-1" style={{ height: 3, background: "var(--card)", borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chess matrix */}
      {!loaded ? (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>Загрузка...</div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
          Нет проводок за период {periodStart} — {periodEnd}
        </div>
      ) : (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-1 text-center">ШАХМАТКА ПРОВОДОК</div>
          <div className="text-xs text-center mb-4" style={{ color: "var(--t3)" }}>Период: {periodStart} — {periodEnd}</div>

          <div style={{ overflow: "auto" }}>
            <table style={{ fontSize: 10, minWidth: "100%" }}>
              <thead>
                <tr>
                  <th rowSpan={2} className="text-left p-2 font-bold uppercase sticky left-0" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", borderRight: "2px solid var(--brd)", background: "var(--card)", verticalAlign: "bottom", minWidth: 120, zIndex: 2 }}>
                    Дт ↓ \ Кт →
                  </th>
                  <th colSpan={credits.length} className="text-center p-2 font-bold uppercase" style={{ color: "#3B82F6", borderBottom: "1px solid var(--brd)" }}>
                    КРЕДИТ СЧЕТА
                  </th>
                  <th rowSpan={2} className="text-right p-2 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", borderLeft: "2px solid var(--brd)", verticalAlign: "bottom", background: "var(--card)" }}>
                    Итого Дт
                  </th>
                </tr>
                <tr>
                  {credits.map(kt => (
                    <th key={kt} className="text-center p-1.5 font-mono font-bold" style={{ borderBottom: "2px solid var(--brd)", color: "#3B82F6", minWidth: 90 }}>
                      <div>{kt}</div>
                      <div className="text-[8px] font-normal" style={{ color: "var(--t3)" }}>{ACC_NAMES[kt] || ""}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {debits.map(dt => (
                  <tr key={dt}>
                    <td className="p-2 font-mono font-bold sticky left-0" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)", borderRight: "2px solid var(--brd)", background: "var(--card)", zIndex: 1 }}>
                      <div>{dt}</div>
                      <div className="text-[8px] font-normal" style={{ color: "var(--t3)" }}>{ACC_NAMES[dt] || ""}</div>
                    </td>
                    {credits.map(kt => {
                      const cell = matrix[dt]?.[kt];
                      const hasData = cell && cell.amount > 0;
                      return (
                        <td key={kt} className="text-right p-1.5 font-bold cursor-pointer transition-all"
                          style={{
                            background: hasData ? cellColor(cell.amount) : "transparent",
                            borderBottom: "1px solid var(--brd)",
                            borderRight: "1px solid var(--brd)",
                            cursor: hasData ? "pointer" : "default",
                          }}
                          onClick={() => hasData && setSelectedCell({ debit: dt, credit: kt })}
                          title={hasData ? `Дт ${dt} Кт ${kt}: ${cell.count} операций` : ""}>
                          {hasData ? (
                            <>
                              <div>{fmtMoney(cell.amount)}</div>
                              <div className="text-[8px] font-normal" style={{ color: "var(--t3)" }}>{cell.count} опер.</div>
                            </>
                          ) : ""}
                        </td>
                      );
                    })}
                    <td className="text-right p-2 font-bold" style={{ borderBottom: "1px solid var(--brd)", borderLeft: "2px solid var(--brd)", color: "#10B981" }}>
                      {fmtMoney(debitTotals[dt] || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--bg)" }}>
                  <td className="p-2 font-bold uppercase sticky left-0" style={{ background: "var(--bg)", borderTop: "2px solid var(--brd)", borderRight: "2px solid var(--brd)" }}>
                    Итого Кт
                  </td>
                  {credits.map(kt => (
                    <td key={kt} className="text-right p-2 font-bold" style={{ borderTop: "2px solid var(--brd)", color: "#3B82F6" }}>
                      {fmtMoney(creditTotals[kt] || 0)}
                    </td>
                  ))}
                  <td className="text-right p-2 font-bold text-[12px]" style={{ borderTop: "2px solid var(--brd)", borderLeft: "2px solid var(--brd)", color: "var(--accent)" }}>
                    {fmtMoney(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modal: cell details */}
      {selectedCell && (
        <div onClick={() => setSelectedCell(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", maxWidth: 900, width: "100%", maxHeight: "85vh", overflow: "auto" }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-base font-bold">
                  Дт <span className="font-mono" style={{ color: "#10B981" }}>{selectedCell.debit}</span>
                  <span style={{ color: "var(--t3)" }}> → </span>
                  Кт <span className="font-mono" style={{ color: "#3B82F6" }}>{selectedCell.credit}</span>
                </div>
                <div className="text-xs" style={{ color: "var(--t3)" }}>
                  {ACC_NAMES[selectedCell.debit] || selectedCell.debit} → {ACC_NAMES[selectedCell.credit] || selectedCell.credit}
                </div>
                <div className="text-sm mt-2"><b style={{ color: "var(--accent)" }}>{cellEntries.length} операций</b> на сумму <b>{fmtMoney(cellTotal)} ₸</b></div>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>✕ Закрыть</button>
            </div>

            <table>
              <thead><tr>{["Дата", "Документ", "Описание", "Сумма"].map(h => (
                <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {cellEntries.map((e, i) => (
                  <tr key={i}>
                    <td className="p-2 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.entry_date}</td>
                    <td className="p-2 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{e.doc_ref || "—"}</td>
                    <td className="p-2 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{e.description || "—"}</td>
                    <td className="p-2 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(e.amount))} ₸</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--bg)" }}>
                  <td colSpan={3} className="p-2 font-bold text-[12px]">ИТОГО:</td>
                  <td className="p-2 text-right font-bold text-[14px]" style={{ color: "var(--accent)" }}>{fmtMoney(cellTotal)} ₸</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Как читать шахматку:</b> ячейка [Дт 1330, Кт 3310] = сколько товаров получено от поставщиков.<br/>
        💡 Чем темнее ячейка — тем больше оборот. Кликните для просмотра всех проводок этой корреспонденции.<br/>
        💡 Колонка «Итого Дт» = что начислено по дебету счёта. Строка «Итого Кт» = что начислено по кредиту.
      </div>
    </div>
  );
}
