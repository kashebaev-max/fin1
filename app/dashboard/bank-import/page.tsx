"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "upload" | "history" | "review";

interface ParsedLine {
  op_date: string;
  op_type: "in" | "out";
  amount: number;
  counterparty_name: string;
  counterparty_bin: string;
  description: string;
  ref_number: string;
}

const BANK_FORMATS = {
  kaspi: {
    name: "Kaspi Business",
    detect: ["Kaspi", "Каспи", "kaspi.kz"],
    columns: { date: 0, description: 1, amount: 2, counterparty: 3 },
    color: "#F14635",
  },
  halyk: {
    name: "Halyk Bank",
    detect: ["Halyk", "Народный", "halykbank"],
    columns: { date: 0, ref: 1, description: 2, amount: 3, counterparty: 4 },
    color: "#00875A",
  },
  forte: {
    name: "ForteBank",
    detect: ["Forte", "ForteBank"],
    columns: { date: 0, ref: 1, description: 2, amount: 3, counterparty: 4 },
    color: "#0066B2",
  },
  bcc: {
    name: "Банк ЦентрКредит",
    detect: ["BCC", "ЦентрКредит"],
    columns: { date: 0, description: 1, amount: 2, counterparty: 3 },
    color: "#1E3A8A",
  },
  generic: {
    name: "Универсальный CSV",
    detect: [],
    columns: { date: 0, description: 1, amount: 2, counterparty: 3 },
    color: "#6B7280",
  },
};

export default function BankImportPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("upload");
  const [statements, setStatements] = useState<any[]>([]);
  const [currentStmt, setCurrentStmt] = useState<any>(null);
  const [stmtLines, setStmtLines] = useState<any[]>([]);
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [selectedBank, setSelectedBank] = useState<keyof typeof BANK_FORMATS>("kaspi");
  const [accountNumber, setAccountNumber] = useState("");
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [counterparties, setCounterparties] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [s, c] = await Promise.all([
      supabase.from("bank_statements").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
    ]);
    setStatements(s.data || []);
    setCounterparties(c.data || []);
  }

  function parseDate(s: string): string {
    s = s.trim();
    // 01.04.2026 → 2026-04-01
    const m1 = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
    // 2026-04-01 → как есть
    const m2 = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
    // 01/04/2026 → 2026-04-01
    const m3 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m3) return `${m3[3]}-${m3[2].padStart(2, "0")}-${m3[1].padStart(2, "0")}`;
    return new Date().toISOString().slice(0, 10);
  }

  function parseAmount(s: string): { amount: number; type: "in" | "out" } {
    s = s.replace(/[^\d.,\-+]/g, "").replace(",", ".");
    const num = Number(s);
    if (isNaN(num)) return { amount: 0, type: "in" };
    return { amount: Math.abs(num), type: num >= 0 ? "in" : "out" };
  }

  function extractBIN(text: string): string {
    const m = text.match(/\b(\d{12})\b/);
    return m ? m[1] : "";
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if ((char === "," || char === ";" || char === "\t") && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else current += char;
    }
    result.push(current.trim());
    return result;
  }

  async function handleFileUpload(file: File) {
    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      const parsed: ParsedLine[] = [];

      // Skip header (assume first row is headers)
      const dataLines = lines.slice(1);

      for (const line of dataLines) {
        const cols = parseCSVLine(line);
        if (cols.length < 3) continue;

        // Универсальная попытка парсинга
        let dateStr = "", descr = "", amountStr = "", cpName = "";

        // Ищем дату в первых колонках
        for (let i = 0; i < Math.min(3, cols.length); i++) {
          if (/\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4}/.test(cols[i])) { dateStr = cols[i]; break; }
        }

        // Ищем сумму (число)
        let amountIdx = -1;
        for (let i = cols.length - 1; i >= 0; i--) {
          const cleaned = cols[i].replace(/[^\d.,\-+]/g, "");
          if (cleaned && !isNaN(Number(cleaned.replace(",", ".")))) {
            amountStr = cols[i];
            amountIdx = i;
            break;
          }
        }

        // Описание — самая длинная строковая колонка
        let maxLen = 0;
        for (let i = 0; i < cols.length; i++) {
          if (i !== amountIdx && cols[i].length > maxLen && !/^\d+[\.\/-]\d+/.test(cols[i])) {
            maxLen = cols[i].length;
            descr = cols[i];
          }
        }

        // Контрагент — следующая после описания или с БИН
        for (const col of cols) {
          if (extractBIN(col)) { cpName = col.replace(/\d{12}/, "").trim(); break; }
        }
        if (!cpName) cpName = descr.split(/[,;]/)[0].trim().slice(0, 100);

        if (!dateStr || !amountStr) continue;

        const { amount, type } = parseAmount(amountStr);
        if (amount === 0) continue;

        parsed.push({
          op_date: parseDate(dateStr),
          op_type: type,
          amount,
          counterparty_name: cpName.slice(0, 200),
          counterparty_bin: extractBIN(cols.join(" ")),
          description: descr.slice(0, 500),
          ref_number: "",
        });
      }

      if (parsed.length === 0) {
        setMsg("❌ Не удалось распознать операции. Проверьте формат файла.");
      } else {
        setParsedLines(parsed);
        setMsg(`✅ Распознано ${parsed.length} операций. Проверьте и сохраните.`);
      }
    } catch (err: any) {
      setMsg("❌ Ошибка чтения файла: " + err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 5000);
    }
  }

  async function saveStatement() {
    if (parsedLines.length === 0) return;

    const totalIn = parsedLines.filter(l => l.op_type === "in").reduce((a, l) => a + l.amount, 0);
    const totalOut = parsedLines.filter(l => l.op_type === "out").reduce((a, l) => a + l.amount, 0);
    const dates = parsedLines.map(l => l.op_date).sort();

    const { data: stmt } = await supabase.from("bank_statements").insert({
      user_id: userId,
      bank_name: BANK_FORMATS[selectedBank].name,
      account_number: accountNumber,
      statement_date: dates[dates.length - 1] || new Date().toISOString().slice(0, 10),
      total_in: totalIn,
      total_out: totalOut,
      operations_count: parsedLines.length,
      status: "imported",
    }).select().single();

    if (!stmt) {
      setMsg("❌ Ошибка сохранения выписки");
      return;
    }

    const lines = parsedLines.map(p => ({
      statement_id: stmt.id,
      user_id: userId,
      ...p,
    }));

    await supabase.from("bank_statement_lines").insert(lines);

    setMsg(`✅ Сохранено: ${parsedLines.length} операций. Приход: ${fmtMoney(totalIn)} ₸, Расход: ${fmtMoney(totalOut)} ₸`);
    setParsedLines([]);
    setTab("history");
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  async function viewStatement(stmt: any) {
    setCurrentStmt(stmt);
    const { data } = await supabase.from("bank_statement_lines").select("*").eq("statement_id", stmt.id).order("op_date");
    setStmtLines(data || []);
    setTab("review");
  }

  async function postLineToBank(line: any) {
    // Создать операцию в bank_operations
    await supabase.from("bank_operations").insert({
      user_id: userId,
      op_type: line.op_type,
      op_date: line.op_date,
      amount: line.amount,
      counterparty_name: line.counterparty_name,
      description: line.description,
      doc_number: line.ref_number || `BANK-${Date.now()}`,
    });

    // Создать проводку
    const debit = line.op_type === "in" ? "1030" : (line.counterparty_bin ? "3310" : "7210");
    const credit = line.op_type === "in" ? "1210" : "1030";

    const { data: je } = await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: line.op_date,
      doc_ref: `BANK-${line.id?.slice(0, 8) || Date.now()}`,
      debit_account: debit,
      credit_account: credit,
      amount: line.amount,
      description: `Банк: ${line.description}`.slice(0, 500),
    }).select().single();

    await supabase.from("bank_statement_lines").update({
      is_posted: true,
      matched_journal_id: je?.id,
    }).eq("id", line.id);

    setMsg(`✅ Операция проведена в банке и бухгалтерии`);
    if (currentStmt) viewStatement(currentStmt);
    setTimeout(() => setMsg(""), 3000);
  }

  async function postAllLines() {
    if (!confirm(`Провести ${stmtLines.filter(l => !l.is_posted).length} непроведённых операций?`)) return;
    for (const line of stmtLines.filter(l => !l.is_posted)) {
      await postLineToBank(line);
    }
    setMsg("✅ Все операции проведены");
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteStatement(id: string) {
    if (!confirm("Удалить выписку и все её операции?")) return;
    await supabase.from("bank_statement_lines").delete().eq("statement_id", id);
    await supabase.from("bank_statements").delete().eq("id", id);
    if (currentStmt?.id === id) { setCurrentStmt(null); setTab("history"); }
    load();
  }

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Импорт банковской выписки • Поддержка Kaspi Business, Halyk, ForteBank, BCC и других • Автоматическая категоризация операций и создание проводок
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([["upload", "📤 Загрузить выписку"], ["history", "📁 История импортов"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setCurrentStmt(null); }}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Загрузка */}
      {tab === "upload" && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-4">Шаг 1: Выберите банк</div>
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(BANK_FORMATS) as [keyof typeof BANK_FORMATS, any][]).map(([key, b]) => (
                <button key={key} onClick={() => setSelectedBank(key)}
                  className="rounded-lg p-3 cursor-pointer transition-all"
                  style={{
                    background: selectedBank === key ? b.color + "20" : "var(--bg)",
                    border: selectedBank === key ? `2px solid ${b.color}` : "1px solid var(--brd)",
                  }}>
                  <div className="text-xs font-bold" style={{ color: selectedBank === key ? b.color : "var(--t1)" }}>{b.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-4">Шаг 2: Загрузите CSV-файл</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Номер расчётного счёта</label>
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="KZ12345678901234567890" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Файл выписки (CSV)</label>
                <input type="file" accept=".csv,.txt" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
              </div>
            </div>
            <div className="text-[11px]" style={{ color: "var(--t3)" }}>
              💡 Где взять CSV: В личном кабинете банка → раздел «Выписка по счёту» → формат «CSV/Excel». Файл сохраняется на компьютер. Затем загрузите его сюда.
            </div>
          </div>

          {/* Превью распознанных операций */}
          {parsedLines.length > 0 && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm font-bold">Шаг 3: Проверьте операции ({parsedLines.length})</div>
                <button onClick={saveStatement} className="px-5 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>
                  ✓ Сохранить выписку
                </button>
              </div>
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                <table>
                  <thead><tr>
                    {["Дата", "Описание", "Контрагент", "БИН", "Тип", "Сумма"].map(h => (
                      <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", background: "var(--card)", position: "sticky", top: 0 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{parsedLines.map((p, i) => (
                    <tr key={i}>
                      <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)", color: "var(--t3)" }}>{p.op_date}</td>
                      <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{p.description.slice(0, 80)}</td>
                      <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{p.counterparty_name.slice(0, 50)}</td>
                      <td className="p-2 text-[11px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.counterparty_bin || "—"}</td>
                      <td className="p-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: p.op_type === "in" ? "#10B98120" : "#EF444420", color: p.op_type === "in" ? "#10B981" : "#EF4444" }}>
                          {p.op_type === "in" ? "Приход" : "Расход"}
                        </span>
                      </td>
                      <td className="p-2 text-[12px] text-right font-bold" style={{ color: p.op_type === "in" ? "#10B981" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>
                        {p.op_type === "in" ? "+" : "−"}{fmtMoney(p.amount)} ₸
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* История импортов */}
      {tab === "history" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>
              {["Дата импорта", "Банк", "Счёт", "Операций", "Приход", "Расход", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {statements.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет импортированных выписок</td></tr>
              ) : statements.map(s => (
                <tr key={s.id}>
                  <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{new Date(s.created_at).toLocaleDateString("ru-RU")}</td>
                  <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{s.bank_name}</td>
                  <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{s.account_number || "—"}</td>
                  <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{s.operations_count}</td>
                  <td className="p-2.5 text-[12px] text-right" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>+{fmtMoney(s.total_in)}</td>
                  <td className="p-2.5 text-[12px] text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>−{fmtMoney(s.total_out)}</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#3B82F620", color: "#3B82F6" }}>{s.status}</span>
                  </td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <button onClick={() => viewStatement(s)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>Открыть</button>
                    <button onClick={() => deleteStatement(s.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Просмотр конкретной выписки */}
      {tab === "review" && currentStmt && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="flex justify-between items-center mb-3">
              <div>
                <div className="text-sm font-bold">{currentStmt.bank_name} • {currentStmt.account_number}</div>
                <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                  Импортировано {new Date(currentStmt.created_at).toLocaleDateString("ru-RU")} • {currentStmt.operations_count} операций
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={postAllLines} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>
                  ✓ Провести все
                </button>
                <button onClick={() => setTab("history")} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                  ← Назад
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>
                {["Дата", "Описание", "Контрагент", "Сумма", "Статус", ""].map(h => (
                  <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {stmtLines.map(l => (
                  <tr key={l.id}>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)", color: "var(--t3)" }}>{l.op_date}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.description?.slice(0, 60)}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.counterparty_name?.slice(0, 40)}</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: l.op_type === "in" ? "#10B981" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>
                      {l.op_type === "in" ? "+" : "−"}{fmtMoney(l.amount)} ₸
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      {l.is_posted ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>✓ Проведено</span>
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>Не проведено</span>
                      )}
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      {!l.is_posted && (
                        <button onClick={() => postLineToBank(l)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>
                          Провести
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
