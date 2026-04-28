"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";
import { buildForecast, forecastToText, type ForecastResult, type ForecastScenario } from "@/lib/forecast-engine";
import { ChartCard, KPICard, LineChart, BarChartLabels } from "@/components/charts/Charts";

type Tab = "chart" | "calendar" | "events" | "ai-advice" | "scenarios";

export default function ForecastPage() {
  const supabase = createClient();
  const router = useRouter();
  const [horizon, setHorizon] = useState(90);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("chart");
  const [userId, setUserId] = useState("");

  // Сценарий "Что если"
  const [scenario, setScenario] = useState({
    name: "Базовый",
    revenueMultiplier: 1.0,
    expenseMultiplier: 1.0,
    collectionSpeedDays: 0,
    paymentSpeedDays: 0,
    safeBalance: 100000,
    oneTimeInflows: [] as { date: string; amount: number; description: string }[],
    oneTimeOutflows: [] as { date: string; amount: number; description: string }[],
  });

  // AI-совет
  const [aiAdvice, setAiAdvice] = useState("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  // Форма добавления разового события
  const [newEvent, setNewEvent] = useState({
    type: "inflow" as "inflow" | "outflow",
    date: new Date().toISOString().slice(0, 10),
    amount: "0",
    description: "",
  });

  useEffect(() => { init(); }, []);
  useEffect(() => { if (userId) recalculate(); }, [horizon, scenario]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    setLoading(false);
  }

  async function recalculate() {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await buildForecast(supabase, userId, horizon, scenario);
      setForecast(result);
    } catch (err) {
      console.error("Forecast error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function getAIAdvice() {
    if (!forecast) return;
    setLoadingAdvice(true);
    setAiAdvice("");
    try {
      const ctxText = forecastToText(forecast);
      const userMsg = forecast.hasCashGap
        ? `На основе прогноза кассового потока: у меня будет кассовый разрыв ${forecast.gapAmount.toLocaleString("ru-RU")} ₸ через ${forecast.daysUntilGap} дней. Что делать?`
        : `Проанализируй мой прогноз кассового потока. Какие риски и что улучшить?`;

      const res = await fetch("/.netlify/functions/ai-zhanara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          messages: [{ role: "user", content: userMsg }],
          contextText: ctxText,
        }),
      });
      if (!res.ok) throw new Error(`AI error ${res.status}`);
      const data = await res.json();
      setAiAdvice(data.reply || "Не получила ответ");
    } catch (err: any) {
      setAiAdvice(`❌ Ошибка: ${err.message || err}`);
    } finally {
      setLoadingAdvice(false);
    }
  }

  function applyScenarioPreset(preset: "base" | "growth" | "crisis" | "delayed") {
    if (preset === "base") {
      setScenario({ ...scenario, name: "Базовый", revenueMultiplier: 1.0, expenseMultiplier: 1.0, collectionSpeedDays: 0, paymentSpeedDays: 0 });
    } else if (preset === "growth") {
      setScenario({ ...scenario, name: "Рост +20%", revenueMultiplier: 1.2, expenseMultiplier: 1.05, collectionSpeedDays: 0, paymentSpeedDays: 0 });
    } else if (preset === "crisis") {
      setScenario({ ...scenario, name: "Кризис -30%", revenueMultiplier: 0.7, expenseMultiplier: 0.95, collectionSpeedDays: 14, paymentSpeedDays: 0 });
    } else if (preset === "delayed") {
      setScenario({ ...scenario, name: "Клиенты задерживают", revenueMultiplier: 1.0, expenseMultiplier: 1.0, collectionSpeedDays: 21, paymentSpeedDays: 0 });
    }
  }

  function addOneTimeEvent() {
    const amount = Number(newEvent.amount);
    if (!amount || !newEvent.description) return;
    if (newEvent.type === "inflow") {
      setScenario({ ...scenario, oneTimeInflows: [...scenario.oneTimeInflows, { date: newEvent.date, amount, description: newEvent.description }] });
    } else {
      setScenario({ ...scenario, oneTimeOutflows: [...scenario.oneTimeOutflows, { date: newEvent.date, amount, description: newEvent.description }] });
    }
    setNewEvent({ ...newEvent, amount: "0", description: "" });
  }

  function removeOneTimeEvent(type: "inflow" | "outflow", idx: number) {
    if (type === "inflow") {
      setScenario({ ...scenario, oneTimeInflows: scenario.oneTimeInflows.filter((_, i) => i !== idx) });
    } else {
      setScenario({ ...scenario, oneTimeOutflows: scenario.oneTimeOutflows.filter((_, i) => i !== idx) });
    }
  }

  if (loading && !forecast) {
    return <div className="text-center py-12 text-sm" style={{ color: "var(--t3)" }}>🔮 Строю прогноз...</div>;
  }
  if (!forecast) return <div className="text-center py-12 text-sm" style={{ color: "var(--t3)" }}>Прогноз не построен</div>;

  // Подготовка данных для графиков
  const chartData = forecast.days.map(d => ({
    label: d.date.slice(5),
    value: d.balance,
  }));
  const inflowData = forecast.days.map(d => ({ label: d.date.slice(5), value: d.inflow }));
  const outflowData = forecast.days.map(d => ({ label: d.date.slice(5), value: d.outflow }));

  // События — только дни с реальными событиями (не прогноз)
  const significantEvents = forecast.days.flatMap(d =>
    d.events.filter(e => e.certainty === "high" || e.type === "adjustment")
      .map(e => ({ ...e, date: d.date }))
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Заголовок */}
      <div className="rounded-xl p-4" style={{ background: forecast.hasCashGap ? "#EF444415" : "#10B98115", border: `1px solid ${forecast.hasCashGap ? "#EF444440" : "#10B98140"}` }}>
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontSize: 22 }}>🔮</span>
          <div className="text-sm font-bold" style={{ color: forecast.hasCashGap ? "#EF4444" : "#10B981" }}>
            {forecast.hasCashGap
              ? `⚠ Кассовый разрыв через ${forecast.daysUntilGap} дн.`
              : `✓ Кассовых разрывов не предвидится`}
          </div>
        </div>
        <div className="text-[11px]" style={{ color: "var(--t3)" }}>
          Сценарий «{forecast.scenario.name}» · Прогноз на {horizon} дней · Денег хватит на ~{forecast.daysOfRunway} дней
        </div>
      </div>

      {/* Управление */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex gap-2 items-center">
          <span className="text-xs" style={{ color: "var(--t3)" }}>Горизонт:</span>
          {([30, 60, 90, 180, 365] as const).map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              style={{ background: horizon === h ? "var(--accent)" : "transparent", color: horizon === h ? "#fff" : "var(--t3)", border: horizon === h ? "none" : "1px solid var(--brd)" }}>
              {h} дн.
            </button>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard label="Стартовый баланс" value={fmtMoney(forecast.startingBalance)} unit="₸" color="#3B82F6" icon="💰" />
        <KPICard label="Минимум" value={fmtMoney(forecast.minBalance)} unit="₸"
          color={forecast.minBalance < 0 ? "#EF4444" : forecast.minBalance < forecast.scenario.safeBalance ? "#F59E0B" : "#10B981"}
          icon={forecast.minBalance < 0 ? "🔴" : "📉"} />
        <KPICard label="Конечный баланс" value={fmtMoney(forecast.finalBalance)} unit="₸"
          color={forecast.finalBalance > forecast.startingBalance ? "#10B981" : "#F59E0B"}
          trend={forecast.startingBalance > 0 ? ((forecast.finalBalance - forecast.startingBalance) / forecast.startingBalance) * 100 : 0}
          trendLabel="vs старт" icon="🎯" />
        <KPICard label="Хватит на" value={forecast.daysOfRunway > 365 ? "365+" : forecast.daysOfRunway} unit="дней"
          color={forecast.daysOfRunway > 90 ? "#10B981" : forecast.daysOfRunway > 30 ? "#F59E0B" : "#EF4444"}
          icon="⏱" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          ["chart", "📈 График баланса"],
          ["events", "📅 Ключевые события"],
          ["scenarios", "🎮 Что если..."],
          ["ai-advice", "✦ Совет Жанары"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ГРАФИК БАЛАНСА ═══ */}
      {tab === "chart" && (
        <>
          <ChartCard title="Прогноз баланса по дням"
            subtitle={`Линия = ваш баланс на каждый день. Красная зона = кассовый разрыв.`}
            badge={forecast.hasCashGap
              ? { text: `⚠ Разрыв ${forecast.gapStartDate}`, color: "#EF4444" }
              : { text: "✓ Стабильно", color: "#10B981" }
            }
            height={320}>
            <LineChart
              data={chartData}
              color={forecast.hasCashGap ? "#EF4444" : "#10B981"}
              showArea
            />
            <BarChartLabels labels={chartData.filter((_, i) => i % Math.max(1, Math.floor(chartData.length / 8)) === 0).map(d => d.label)} />
          </ChartCard>

          <div className="grid grid-cols-2 gap-4">
            <ChartCard title="Поступления по дням" subtitle="Деньги к нам">
              <LineChart data={inflowData} color="#10B981" showArea />
            </ChartCard>
            <ChartCard title="Выплаты по дням" subtitle="Наши платежи">
              <LineChart data={outflowData} color="#EF4444" showArea />
            </ChartCard>
          </div>

          <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-2">📊 Сводка прогноза</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div style={{ color: "var(--t3)" }}>Всего поступит</div>
                <div className="font-bold" style={{ color: "#10B981" }}>+{fmtMoney(forecast.totalInflows)} ₸</div>
              </div>
              <div>
                <div style={{ color: "var(--t3)" }}>Всего уйдёт</div>
                <div className="font-bold" style={{ color: "#EF4444" }}>−{fmtMoney(forecast.totalOutflows)} ₸</div>
              </div>
              <div>
                <div style={{ color: "var(--t3)" }}>Чистый поток</div>
                <div className="font-bold" style={{ color: forecast.totalInflows >= forecast.totalOutflows ? "#10B981" : "#EF4444" }}>
                  {forecast.totalInflows >= forecast.totalOutflows ? "+" : ""}{fmtMoney(forecast.totalInflows - forecast.totalOutflows)} ₸
                </div>
              </div>
              <div>
                <div style={{ color: "var(--t3)" }}>Сжигание в день</div>
                <div className="font-bold">{fmtMoney(forecast.avgDailyBurn)} ₸</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ КЛЮЧЕВЫЕ СОБЫТИЯ ═══ */}
      {tab === "events" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📅 Что повлияет на баланс</div>
          <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
            Точно известные события: запланированные платежи, зарплаты, налоги. Прогноз на ежедневные продажи здесь не показан.
          </div>

          {significantEvents.length === 0 ? (
            <div className="text-center py-8 text-xs" style={{ color: "var(--t3)" }}>Нет точно известных событий в прогнозе</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {significantEvents.map((e, i) => {
                const isInflow = e.amount > 0;
                const eventTypeIcons: Record<string, string> = {
                  scheduled_in: "💰", scheduled_out: "💸", tax: "📑",
                  salary: "👥", recurring: "🔄", adjustment: "✨",
                };
                const icon = eventTypeIcons[e.type] || (isInflow ? "+" : "−");
                return (
                  <div key={i} className="rounded-lg flex items-center gap-3 p-2.5" style={{ background: "var(--bg)", border: "1px solid var(--brd)" }}>
                    <span style={{ fontSize: 16 }}>{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px]">{e.description}</div>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                        {(e as any).date} · {e.source === "payment_schedules" ? "из регулярных платежей" : e.source === "orders" ? "ожидаемая оплата заказа" : e.source === "employees" ? "зарплаты" : e.source === "taxes" ? "налоги (прогноз)" : e.source === "scenario" ? "ваш сценарий" : e.source}
                      </div>
                    </div>
                    <div className="text-[12px] font-bold" style={{ color: isInflow ? "#10B981" : "#EF4444" }}>
                      {isInflow ? "+" : ""}{fmtMoney(e.amount)} ₸
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ ЧТО ЕСЛИ ═══ */}
      {tab === "scenarios" && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">🎮 Готовые сценарии</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {([
                ["base", "📊 Базовый", "Текущая динамика"],
                ["growth", "📈 Рост +20%", "Удачный сценарий"],
                ["crisis", "📉 Кризис −30%", "Худший случай"],
                ["delayed", "⏰ Долги", "Клиенты задерживают на 21 дн"],
              ] as const).map(([key, label, desc]) => (
                <button key={key} onClick={() => applyScenarioPreset(key)}
                  className="rounded-lg p-3 text-left cursor-pointer"
                  style={{ background: scenario.name === label.split(" ")[1] ? "var(--accent-dim)" : "var(--bg)", border: "1px solid var(--brd)" }}>
                  <div className="text-[12px] font-bold">{label}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>{desc}</div>
                </button>
              ))}
            </div>

            <div className="text-sm font-bold mb-3">🎚 Тонкая настройка</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>
                  Множитель выручки: {scenario.revenueMultiplier.toFixed(2)}x
                </label>
                <input type="range" min="0.3" max="2.0" step="0.05"
                  value={scenario.revenueMultiplier}
                  onChange={e => setScenario({ ...scenario, revenueMultiplier: Number(e.target.value), name: "Свой" })}
                  style={{ width: "100%" }} />
                <div className="flex justify-between text-[9px]" style={{ color: "var(--t3)" }}>
                  <span>−70%</span><span>0</span><span>+100%</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>
                  Множитель расходов: {scenario.expenseMultiplier.toFixed(2)}x
                </label>
                <input type="range" min="0.5" max="1.5" step="0.05"
                  value={scenario.expenseMultiplier}
                  onChange={e => setScenario({ ...scenario, expenseMultiplier: Number(e.target.value), name: "Свой" })}
                  style={{ width: "100%" }} />
                <div className="flex justify-between text-[9px]" style={{ color: "var(--t3)" }}>
                  <span>−50%</span><span>0</span><span>+50%</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>
                  Сдвиг получения денег: {scenario.collectionSpeedDays > 0 ? "+" : ""}{scenario.collectionSpeedDays} дн.
                </label>
                <input type="range" min="-14" max="60" step="1"
                  value={scenario.collectionSpeedDays}
                  onChange={e => setScenario({ ...scenario, collectionSpeedDays: Number(e.target.value), name: "Свой" })}
                  style={{ width: "100%" }} />
                <div className="text-[9px]" style={{ color: "var(--t3)" }}>+ = клиенты платят медленнее, − = быстрее</div>
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>
                  Безопасный минимум: {fmtMoney(scenario.safeBalance)} ₸
                </label>
                <input type="range" min="0" max="5000000" step="50000"
                  value={scenario.safeBalance}
                  onChange={e => setScenario({ ...scenario, safeBalance: Number(e.target.value) })}
                  style={{ width: "100%" }} />
              </div>
            </div>
          </div>

          {/* Разовые события */}
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">✨ Разовые события</div>
            <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
              Добавьте крупное поступление (например, инвестиции) или выплату (покупка ОС) — увидите как это повлияет.
            </div>

            <div className="grid grid-cols-4 gap-2 mb-3">
              <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value as any })}>
                <option value="inflow">+ Поступление</option>
                <option value="outflow">− Выплата</option>
              </select>
              <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
              <input type="number" placeholder="Сумма ₸" value={newEvent.amount} onChange={e => setNewEvent({ ...newEvent, amount: e.target.value })} />
              <input placeholder="Описание" value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} />
            </div>
            <button onClick={addOneTimeEvent} className="px-3 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Добавить событие
            </button>

            {(scenario.oneTimeInflows.length > 0 || scenario.oneTimeOutflows.length > 0) && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
                {scenario.oneTimeInflows.map((e, i) => (
                  <div key={`in-${i}`} className="flex items-center justify-between text-[11px] py-1">
                    <div>+ {e.description} ({e.date})</div>
                    <div className="flex gap-2">
                      <span className="font-bold" style={{ color: "#10B981" }}>+{fmtMoney(e.amount)} ₸</span>
                      <button onClick={() => removeOneTimeEvent("inflow", i)} className="cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </div>
                  </div>
                ))}
                {scenario.oneTimeOutflows.map((e, i) => (
                  <div key={`out-${i}`} className="flex items-center justify-between text-[11px] py-1">
                    <div>− {e.description} ({e.date})</div>
                    <div className="flex gap-2">
                      <span className="font-bold" style={{ color: "#EF4444" }}>−{fmtMoney(e.amount)} ₸</span>
                      <button onClick={() => removeOneTimeEvent("outflow", i)} className="cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ AI СОВЕТ ═══ */}
      {tab === "ai-advice" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 22 }}>✦</span>
            <div>
              <div className="text-sm font-bold" style={{ color: "#A855F7" }}>Жанара анализирует прогноз</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                Получит весь прогноз и даст рекомендации
              </div>
            </div>
          </div>

          {!aiAdvice && !loadingAdvice && (
            <button onClick={getAIAdvice}
              className="px-4 py-2.5 rounded-lg text-white font-semibold text-sm border-none cursor-pointer"
              style={{ background: "linear-gradient(135deg, #A855F7, #6366F1)" }}>
              ✦ Получить совет Жанары
            </button>
          )}

          {loadingAdvice && (
            <div className="text-center py-8 text-sm" style={{ color: "#A855F7" }}>
              ✦ Жанара анализирует прогноз...
            </div>
          )}

          {aiAdvice && (
            <>
              <div className="rounded-lg p-4 text-[12px]" style={{ background: "#A855F710", border: "1px solid #A855F730", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {aiAdvice}
              </div>
              <button onClick={getAIAdvice} className="mt-3 px-3 py-1.5 rounded-lg text-xs cursor-pointer" style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                🔄 Обновить совет
              </button>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Прогноз учитывает:</b> исторический средний доход/расход за 90 дней + запланированные платежи + ожидаемые оплаты от клиентов + зарплаты + прогноз налогов.<br/>
        💡 <b>Не учитывает:</b> случайные крупные сделки. Для них используйте «Разовые события» в Что если.<br/>
        💡 <b>Кассовый разрыв</b> — момент когда баланс уходит в минус. Жанара предупредит за {forecast?.daysUntilGap || "N"} дней.
      </div>
    </div>
  );
}
