"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "rates" | "calculator" | "operations" | "history";

const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "Доллар США", flag: "🇺🇸" },
  { code: "EUR", name: "Евро", flag: "🇪🇺" },
  { code: "RUB", name: "Российский рубль", flag: "🇷🇺" },
  { code: "CNY", name: "Юань", flag: "🇨🇳" },
  { code: "GBP", name: "Фунт стерлингов", flag: "🇬🇧" },
  { code: "TRY", name: "Турецкая лира", flag: "🇹🇷" },
  { code: "JPY", name: "Японская иена", flag: "🇯🇵" },
  { code: "KRW", name: "Корейская вона", flag: "🇰🇷" },
  { code: "AED", name: "Дирхам ОАЭ", flag: "🇦🇪" },
];

export default function CurrencyPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("rates");
  const [rates, setRates] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [today] = useState(new Date().toISOString().slice(0, 10));

  // Manual rate form
  const [manualRate, setManualRate] = useState({
    date: today,
    code: "USD",
    rate: "",
  });

  // Calculator
  const [calc, setCalc] = useState({
    from_currency: "USD",
    to_currency: "KZT",
    amount: "100",
  });

  // Operation form
  const [showOpForm, setShowOpForm] = useState(false);
  const [opForm, setOpForm] = useState({
    op_date: today,
    op_type: "exchange",
    from_currency: "USD",
    to_currency: "KZT",
    from_amount: "",
    rate: "",
    description: "",
    doc_ref: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [r, o, d] = await Promise.all([
      supabase.from("currency_rates").select("*").eq("user_id", user.id).order("rate_date", { ascending: false }).order("currency_code"),
      supabase.from("currency_operations").select("*").eq("user_id", user.id).order("op_date", { ascending: false }),
      supabase.from("documents").select("id, doc_number, doc_date, currency, amount_in_currency, exchange_rate, total_with_nds").eq("user_id", user.id).neq("currency", "KZT"),
    ]);
    setRates(r.data || []);
    setOperations(o.data || []);
    setDocs(d.data || []);
  }

  async function fetchFromAPI() {
    setMsg("Загрузка курсов с open.er-api.com...");
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/KZT");
      const data = await res.json();
      if (!data.rates) {
        setMsg("❌ Не удалось получить курсы");
        setTimeout(() => setMsg(""), 3000);
        return;
      }
      // Курс — сколько KZT за 1 единицу валюты (инверсия от API)
      const toInsert = SUPPORTED_CURRENCIES.map(c => ({
        user_id: userId,
        rate_date: today,
        currency_code: c.code,
        rate: data.rates[c.code] ? Number((1 / data.rates[c.code]).toFixed(4)) : null,
        source: "open.er-api.com",
      })).filter(r => r.rate);

      // Удалить существующие на сегодня
      for (const r of toInsert) {
        await supabase.from("currency_rates").delete().eq("user_id", userId).eq("rate_date", today).eq("currency_code", r.currency_code);
      }
      await supabase.from("currency_rates").insert(toInsert);
      setMsg(`✅ Загружено ${toInsert.length} курсов на ${today}`);
      load();
      setTimeout(() => setMsg(""), 4000);
    } catch (e: any) {
      setMsg(`❌ Ошибка: ${e.message}`);
      setTimeout(() => setMsg(""), 4000);
    }
  }

  async function addManualRate() {
    if (!manualRate.rate) { setMsg("❌ Укажите курс"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("currency_rates").delete().eq("user_id", userId).eq("rate_date", manualRate.date).eq("currency_code", manualRate.code);
    await supabase.from("currency_rates").insert({
      user_id: userId,
      rate_date: manualRate.date,
      currency_code: manualRate.code,
      rate: Number(manualRate.rate),
      source: "manual",
    });
    setMsg(`✅ Курс ${manualRate.code} = ${manualRate.rate} ₸ на ${manualRate.date}`);
    setManualRate({ ...manualRate, rate: "" });
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteRate(id: string) {
    await supabase.from("currency_rates").delete().eq("id", id);
    load();
  }

  function getRate(code: string, date: string): number {
    if (code === "KZT") return 1;
    const exact = rates.find(r => r.currency_code === code && r.rate_date === date);
    if (exact) return Number(exact.rate);
    // Берём ближайший по дате
    const sorted = rates.filter(r => r.currency_code === code && r.rate_date <= date).sort((a, b) => b.rate_date.localeCompare(a.rate_date));
    return sorted[0] ? Number(sorted[0].rate) : 0;
  }

  function calculateAmount(): { result: number; rate: number; rateInfo: string } {
    const amount = Number(calc.amount) || 0;
    const today_str = today;

    if (calc.from_currency === calc.to_currency) {
      return { result: amount, rate: 1, rateInfo: "1 : 1" };
    }

    let result = 0;
    let rateText = "";

    if (calc.to_currency === "KZT") {
      const rate = getRate(calc.from_currency, today_str);
      result = amount * rate;
      rateText = `1 ${calc.from_currency} = ${rate.toFixed(4)} ₸`;
      return { result, rate, rateInfo: rateText };
    }

    if (calc.from_currency === "KZT") {
      const rate = getRate(calc.to_currency, today_str);
      result = rate > 0 ? amount / rate : 0;
      rateText = `1 ${calc.to_currency} = ${rate.toFixed(4)} ₸`;
      return { result, rate: 1 / rate, rateInfo: rateText };
    }

    // Через KZT
    const fromRate = getRate(calc.from_currency, today_str);
    const toRate = getRate(calc.to_currency, today_str);
    if (fromRate > 0 && toRate > 0) {
      const inKzt = amount * fromRate;
      result = inKzt / toRate;
      rateText = `Через ₸: 1 ${calc.from_currency} = ${(fromRate / toRate).toFixed(6)} ${calc.to_currency}`;
    }
    return { result, rate: fromRate / toRate, rateInfo: rateText };
  }

  async function saveOperation() {
    const fromAmt = Number(opForm.from_amount);
    const rate = Number(opForm.rate);
    if (!fromAmt || !rate) { setMsg("❌ Заполните сумму и курс"); setTimeout(() => setMsg(""), 3000); return; }

    let toAmount = 0;
    if (opForm.to_currency === "KZT") toAmount = fromAmt * rate;
    else if (opForm.from_currency === "KZT") toAmount = fromAmt / rate;
    else toAmount = fromAmt;

    await supabase.from("currency_operations").insert({
      user_id: userId,
      op_date: opForm.op_date,
      op_type: opForm.op_type,
      from_currency: opForm.from_currency,
      to_currency: opForm.to_currency,
      from_amount: fromAmt,
      to_amount: toAmount,
      rate,
      description: opForm.description,
      doc_ref: opForm.doc_ref,
    });

    // Проводка по конвертации (если KZT задействован)
    if (opForm.from_currency === "KZT" || opForm.to_currency === "KZT") {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: opForm.op_date,
        doc_ref: opForm.doc_ref || `КОНВ-${Date.now()}`,
        debit_account: opForm.to_currency === "KZT" ? "1030" : "1040",
        credit_account: opForm.from_currency === "KZT" ? "1030" : "1040",
        amount: opForm.to_currency === "KZT" ? toAmount : fromAmt,
        description: `Конвертация: ${fmtMoney(fromAmt)} ${opForm.from_currency} → ${fmtMoney(toAmount)} ${opForm.to_currency} по курсу ${rate}`,
      });
    }

    setMsg(`✅ Конвертация: ${fmtMoney(fromAmt)} ${opForm.from_currency} → ${fmtMoney(toAmount)} ${opForm.to_currency}`);
    setOpForm({ ...opForm, from_amount: "", rate: "", description: "", doc_ref: "" });
    setShowOpForm(false);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function deleteOperation(id: string) {
    if (!confirm("Удалить операцию?")) return;
    await supabase.from("currency_operations").delete().eq("id", id);
    load();
  }

  // Latest rates today
  const latestRates: Record<string, any> = {};
  rates.forEach(r => {
    if (!latestRates[r.currency_code] || r.rate_date > latestRates[r.currency_code].rate_date) {
      latestRates[r.currency_code] = r;
    }
  });

  // KPI
  const totalCurrenciesTracked = Object.keys(latestRates).length;
  const totalDocs = docs.length;
  const totalForeignAmount = docs.reduce((a, d) => a + Number(d.total_with_nds || 0), 0);
  const todayOps = operations.filter(o => o.op_date === today).length;

  const calcResult = calculateAmount();

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Многовалютный учёт — курсы валют, конвертер, валютные операции с автоматическими проводками
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💱 Валют отслеживается</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{totalCurrenciesTracked}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>На сегодня</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💵 USD сегодня</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{latestRates["USD"] ? Number(latestRates["USD"].rate).toFixed(2) : "—"} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{latestRates["USD"]?.rate_date || "Нет данных"}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💶 EUR сегодня</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{latestRates["EUR"] ? Number(latestRates["EUR"].rate).toFixed(2) : "—"} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{latestRates["EUR"]?.rate_date || "Нет данных"}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🇷🇺 RUB сегодня</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{latestRates["RUB"] ? Number(latestRates["RUB"].rate).toFixed(2) : "—"} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{latestRates["RUB"]?.rate_date || "Нет данных"}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["rates", "💱 Курсы валют"],
          ["calculator", "🧮 Калькулятор"],
          ["operations", "💼 Валютные операции"],
          ["history", "📊 История курсов"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ КУРСЫ ═══ */}
      {tab === "rates" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">🌐 Автоматическая загрузка</div>
              <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
                Загрузка курсов с open.er-api.com на сегодняшнюю дату ({today})
              </div>
              <button onClick={fetchFromAPI} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer w-full" style={{ background: "#10B981" }}>
                🌐 Загрузить курсы на {today}
              </button>
              <div className="text-[10px] mt-2" style={{ color: "var(--t3)" }}>
                ⚠ НБ РК API недоступен из-за CORS, поэтому используется open.er-api.com
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">✏ Ручной ввод курса</div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={manualRate.date} onChange={e => setManualRate({ ...manualRate, date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Валюта</label>
                  <select value={manualRate.code} onChange={e => setManualRate({ ...manualRate, code: e.target.value })}>
                    {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Курс к ₸</label><input type="number" step="0.0001" value={manualRate.rate} onChange={e => setManualRate({ ...manualRate, rate: e.target.value })} /></div>
              </div>
              <button onClick={addManualRate} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer w-full" style={{ background: "var(--accent)" }}>Добавить курс</button>
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">💱 Курсы на сегодня ({today})</div>
            <div className="grid grid-cols-3 gap-3">
              {SUPPORTED_CURRENCIES.map(c => {
                const r = latestRates[c.code];
                return (
                  <div key={c.code} className="rounded-lg p-3" style={{ background: "var(--bg)", borderLeft: r ? "3px solid #10B981" : "3px solid #6B7280" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: 22 }}>{c.flag}</span>
                      <div>
                        <div className="text-sm font-bold">{c.code}</div>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.name}</div>
                      </div>
                    </div>
                    {r ? (
                      <>
                        <div className="text-xl font-bold" style={{ color: "#10B981" }}>{Number(r.rate).toFixed(4)} ₸</div>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>от {r.rate_date} • {r.source}</div>
                      </>
                    ) : (
                      <div className="text-xs" style={{ color: "var(--t3)" }}>Нет курса</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ═══ КАЛЬКУЛЯТОР ═══ */}
      {tab === "calculator" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">🧮 Конвертер валют по текущим курсам</div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма</label>
              <input type="number" value={calc.amount} onChange={e => setCalc({ ...calc, amount: e.target.value })} style={{ fontSize: 18 }} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Из валюты</label>
              <select value={calc.from_currency} onChange={e => setCalc({ ...calc, from_currency: e.target.value })}>
                <option value="KZT">🇰🇿 KZT — Тенге</option>
                {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>В валюту</label>
              <select value={calc.to_currency} onChange={e => setCalc({ ...calc, to_currency: e.target.value })}>
                <option value="KZT">🇰🇿 KZT — Тенге</option>
                {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-xl p-5 text-center" style={{ background: "linear-gradient(135deg, #6366F110, #A855F710)", border: "1px solid var(--brd)" }}>
            <div className="text-xs mb-2" style={{ color: "var(--t3)" }}>Результат конвертации</div>
            <div className="text-3xl font-extrabold mb-1" style={{ color: "#A855F7" }}>
              {fmtMoney(Math.round(calcResult.result * 100) / 100)} {calc.to_currency}
            </div>
            <div className="text-[11px]" style={{ color: "var(--t3)" }}>{calcResult.rateInfo}</div>
          </div>

          {/* Quick buttons */}
          <div className="mt-4">
            <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t3)" }}>Быстрые суммы:</div>
            <div className="flex gap-2 flex-wrap">
              {[100, 500, 1000, 5000, 10000, 50000, 100000].map(v => (
                <button key={v} onClick={() => setCalc({ ...calc, amount: String(v) })} className="text-[11px] px-3 py-1 rounded-lg cursor-pointer" style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                  {v.toLocaleString("ru-RU")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ОПЕРАЦИИ ═══ */}
      {tab === "operations" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Конвертация валют между счетами с автоматическими бухгалтерскими проводками
            </div>
            <button onClick={() => setShowOpForm(!showOpForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новая операция</button>
          </div>

          {showOpForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Валютная операция</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={opForm.op_date} onChange={e => setOpForm({ ...opForm, op_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={opForm.op_type} onChange={e => setOpForm({ ...opForm, op_type: e.target.value })}>
                    <option value="exchange">Обмен валюты</option>
                    <option value="transfer">Перевод между счетами</option>
                    <option value="revaluation">Переоценка</option>
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ документа</label><input value={opForm.doc_ref} onChange={e => setOpForm({ ...opForm, doc_ref: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Из валюты</label>
                  <select value={opForm.from_currency} onChange={e => setOpForm({ ...opForm, from_currency: e.target.value })}>
                    <option value="KZT">🇰🇿 KZT</option>
                    {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма</label><input type="number" value={opForm.from_amount} onChange={e => setOpForm({ ...opForm, from_amount: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Курс операции</label><input type="number" step="0.0001" value={opForm.rate} onChange={e => setOpForm({ ...opForm, rate: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>В валюту</label>
                  <select value={opForm.to_currency} onChange={e => setOpForm({ ...opForm, to_currency: e.target.value })}>
                    <option value="KZT">🇰🇿 KZT</option>
                    {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={opForm.description} onChange={e => setOpForm({ ...opForm, description: e.target.value })} /></div>
              </div>

              {opForm.from_amount && opForm.rate && (
                <div className="rounded-lg p-3 mb-3" style={{ background: "var(--bg)" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>Получите:</div>
                  <div className="text-base font-bold" style={{ color: "#10B981" }}>
                    {fmtMoney(opForm.to_currency === "KZT" ? Number(opForm.from_amount) * Number(opForm.rate) : opForm.from_currency === "KZT" ? Number(opForm.from_amount) / Number(opForm.rate) : Number(opForm.from_amount))} {opForm.to_currency}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={saveOperation} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Провести операцию</button>
                <button onClick={() => setShowOpForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Дата", "Тип", "Откуда", "Курс", "Куда", "Описание", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {operations.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет операций</td></tr>
                ) : operations.map(o => (
                  <tr key={o.id}>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{o.op_date}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: "#6366F120", color: "#6366F1" }}>{o.op_type}</span>
                    </td>
                    <td className="p-2.5 text-[13px] font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.from_amount))} {o.from_currency}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{Number(o.rate).toFixed(4)}</td>
                    <td className="p-2.5 text-[13px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.to_amount))} {o.to_currency}</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.description || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteOperation(o.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "history" && (
        <>
          <div className="text-xs" style={{ color: "var(--t3)" }}>
            История курсов за всё время. Для каждой даты сохраняется свой курс.
          </div>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Дата", "Валюта", "Курс к ₸", "Источник", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {rates.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет курсов. Загрузите автоматически или добавьте вручную.</td></tr>
                ) : rates.map(r => {
                  const cur = SUPPORTED_CURRENCIES.find(c => c.code === r.currency_code);
                  return (
                    <tr key={r.id}>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.rate_date}</td>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{cur?.flag} {r.currency_code} {cur ? `— ${cur.name}` : ""}</td>
                      <td className="p-2.5 text-[13px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{Number(r.rate).toFixed(4)} ₸</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.source}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteRate(r.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
