// AI-генерация документов
// Принимает: { mode: 'freeform'|'improve', prompt, businessContext, baseTemplate? }
// Возвращает: { content, title, suggestions }

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `Ты — Жанара, AI-консультант системы Finstat.kz по бухгалтерии и юридическому документообороту Республики Казахстан.

ТВОЯ ЗАДАЧА — генерировать профессиональные деловые документы для Казахстана.

ПРАВИЛА:
1. Документы должны быть юридически грамотными для РК
2. Соблюдай официальный деловой стиль
3. Используй казахстанскую специфику: тенге (₸), БИН (12 цифр), НДС 16%, Казахстан как юрисдикция
4. Реквизиты компаний оформляй полностью
5. Возвращай ТОЛЬКО JSON

ЗНАНИЯ НК РК 2026:
- НДС: 16% (стандартная ставка)
- ИПН: 10% / 15%, вычет 14 МРП = 60 550 ₸
- КПН: 20%
- МРП 2026: 4 325 ₸, МЗП: 85 000 ₸
- Счета НСФО: 1010 касса, 1030 банк, 6010 выручка, 1210 деб., 3310 кред.

ФОРМАТ ОТВЕТА — СТРОГО JSON БЕЗ MARKDOWN:
{
  "title": "Краткое название документа (например, 'Договор оказания услуг с ТОО Альфа')",
  "content": "Полный текст документа с переносами строк \\n",
  "doc_type": "contract|act|invoice|official|internal|other",
  "suggestions": ["рекомендация по улучшению 1", "рекомендация 2"]
}

СТРУКТУРА ДОКУМЕНТА:
- Заголовок (НАЗВАНИЕ ДОКУМЕНТА № номер)
- Город и дата
- Преамбула (стороны)
- Пронумерованные пункты по разделам
- Подписи сторон с реквизитами

ВАЖНО:
- Если в запросе пользователя нет какого-то поля (номер, дата) — поставь placeholder вида "_____" или "[ВПИСАТЬ]"
- Никогда не выдумывай реквизиты компаний, оставляй placeholder
- Текст должен помещаться на 1-3 страницы максимум
- Только содержательные пункты, без воды
- НЕ ИСПОЛЬЗУЙ markdown (никаких **жирных**, ##заголовков), только обычный текст`;

const IMPROVE_SYSTEM_PROMPT = `Ты — Жанара, AI-консультант системы Finstat.kz. Твоя задача — улучшать существующие документы по запросу пользователя.

ВЕРНИ СТРОГО JSON:
{
  "title": "Название",
  "content": "Улучшенный текст",
  "changes": ["что было изменено 1", "что было изменено 2"]
}

ПРАВИЛА:
- Сохраняй структуру и формат документа
- Только обычный текст, без markdown
- Учитывай законодательство РК`;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders(), body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { mode = "freeform", prompt, businessContext = "", baseDocument = "" } = body;
  if (!prompt) return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Missing prompt" }) };

  let userMessage = prompt;
  let systemPrompt = SYSTEM_PROMPT;

  if (businessContext) {
    systemPrompt += `\n\n=== РЕКВИЗИТЫ НАШЕЙ КОМПАНИИ ===\n${businessContext}\n=== КОНЕЦ ===`;
  }

  if (mode === "improve" && baseDocument) {
    systemPrompt = IMPROVE_SYSTEM_PROMPT;
    userMessage = `ИСХОДНЫЙ ДОКУМЕНТ:\n${baseDocument}\n\n=== ЗАПРОС ПОЛЬЗОВАТЕЛЯ ===\n${prompt}`;
  }

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
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return { statusCode: claudeRes.status, headers: corsHeaders(), body: JSON.stringify({ error: "Claude API error: " + errText }) };
    }

    const data = await claudeRes.json();
    const reply = data.content?.[0]?.text || "";

    try {
      const cleaned = reply.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      };
    } catch {
      // Если JSON не распарсился — возвращаем как обычный документ
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Сгенерированный документ",
          content: reply,
          doc_type: "other",
          suggestions: [],
        }),
      };
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: String(err) }) };
  }
};
