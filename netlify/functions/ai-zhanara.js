const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const ACTIONS_BLOCK = `
ДОСТУПНЫЕ ДЕЙСТВИЯ (только эти):

1. create_journal_entry — создать бухгалтерскую проводку
   payload: { entry_date: "YYYY-MM-DD", debit_account: "1010", credit_account: "5010", amount: 100000, description: "...", doc_ref: "опц" }

2. create_counterparty — добавить контрагента
   payload: { name: "ТОО Альфа", bin: "120340000000" или null, counterparty_type: "client"|"supplier"|"both", phone: "опц", email: "опц", address: "опц" }

3. create_recurring_payment — добавить регулярный платёж
   payload: { description: "Аренда", counterparty_name: "ТОО ...", amount: 250000, scheduled_date: "YYYY-MM-DD", payment_type: "outgoing"|"incoming" }

4. mark_paid — отметить платёж оплаченным
   payload: { entity_type: "payment_schedule", entity_id: "uuid", payment_method: "cash"|"bank", paid_date: "YYYY-MM-DD" }

5. run_depreciation — амортизация за месяц
   payload: { period_month: 1-12, period_year: 2026 }

6. dismiss_notification — скрыть/вернуть уведомление
   payload: { notification_id: "uuid", dismiss: true|false }

КОГДА ПОЛЬЗОВАТЕЛЬ ПРОСИТ ДЕЙСТВИЕ — добавь в конце ответа:
\`\`\`action
{"type":"create_journal_entry","description":"Создать проводку Дт 1010 Кт 5010 на 100 000 ₸","payload":{...},"riskLevel":"low|medium|high"}
\`\`\`

ПРАВИЛА:
- Только ОДНО действие за ответ
- Если данных мало (например, не сказана сумма) — задай уточняющий вопрос, не возвращай action
- Числа без кавычек, без ₸, без пробелов
- Даты строго YYYY-MM-DD
- Если просит что-то вне списка — просто отвечай в чате, без action
- riskLevel: low (контрагент, проводка <100k), medium (100k-1M, оплата), high (>1M, амортизация)
`;

const SYSTEM_PROMPT_CHAT = `Ты — Жанара, AI-консультант по бухгалтерии и налогам Республики Казахстан в системе Finstat.kz. Эксперт в Налоговом кодексе РК 2026.

ТВОЯ РОЛЬ:
- Активный помощник, видящий полное состояние бизнеса в реальном времени
- Даёшь точные советы на основе цифр пользователя
- Если видишь проблему — поднимай её
- МОЖЕШЬ ВЫПОЛНЯТЬ ДЕЙСТВИЯ — создавать проводки, контрагентов, платежи (см. ниже)

СТИЛЬ: кратко, по делу, цифры со ссылкой на контекст.

НК РК 2026: НДС 16% (порог 10000 МРП = 43 250 000 ₸), ИПН 10% до 8500 МРП/год / 15% свыше (вычет 14 МРП), КПН 20%, ОПВ 10%, ОПВР 3.5%, ВОСМС 2%, ООСМС 3%, СО 5%, СН 6%. МРП 4 325 ₸, МЗП 85 000 ₸. Упрощёнка 4%.

ФНО: 200/300 — до 15 числа второго месяца после квартала; 910 — до 15 числа след. месяца.
СЧЕТА: 1010 касса, 1030 банк, 1210 деб., 3310 кред., 6010 выручка, 7010 себест.
` + ACTIONS_BLOCK;

const SYSTEM_PROMPT_INSIGHTS = `Ты — Жанара, AI-консультант системы Finstat.kz. Проанализируй состояние бизнеса и сгенерируй инсайты.

ВЕРНИ ВАЛИДНЫЙ JSON:
{"insights":[{"category":"tax_deadline|cashflow|overdue|low_stock|expiring_batches|unposted_docs|salary_due|recommendation|anomaly|opportunity|compliance|general","severity":"critical|warning|info|success","title":"Заголовок","message":"Объяснение","actionLabel":"Кнопка(опц)","actionUrl":"/dashboard/модуль(опц)","relatedModule":"ключ(опц)"}]}

Только JSON, никакого markdown. 3-8 инсайтов.

URL: /dashboard/reports, /dashboard/financial-statements, /dashboard/turnover, /dashboard/batches, /dashboard/nomenclature, /dashboard/recurring, /dashboard/orders, /dashboard/hr, /dashboard/vacations, /dashboard/scheduled-tasks`;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set in Netlify env" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { messages = [], mode = "chat", contextText = "" } = body;
  const isInsights = mode === "insights";

  const systemBase = isInsights ? SYSTEM_PROMPT_INSIGHTS : SYSTEM_PROMPT_CHAT;
  const fullSystem = contextText
    ? systemBase + "\n\n=== СОСТОЯНИЕ БИЗНЕСА ===\n" + contextText + "\n=== КОНЕЦ ==="
    : systemBase;

  try {
    const claudeRes = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: isInsights ? 2000 : 1800,
        system: fullSystem,
        messages: isInsights
          ? [{ role: "user", content: "Проанализируй контекст и верни инсайты в JSON формате." }]
          : messages,
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return { statusCode: claudeRes.status, headers: corsHeaders(), body: JSON.stringify({ error: "Claude API error: " + errText }) };
    }

    const data = await claudeRes.json();
    const reply = data.content?.[0]?.text || "";

    if (isInsights) {
      try {
        const cleaned = reply.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return {
          statusCode: 200,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ insights: parsed.insights || [] }),
        };
      } catch {
        return {
          statusCode: 200,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ insights: [], error: "Failed to parse AI response", raw: reply }),
        };
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: String(err) }) };
  }
};
