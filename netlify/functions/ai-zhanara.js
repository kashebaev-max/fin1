// AI-помощник Жанара с tool_use API.
// Оптимизирован для Netlify (10-сек лимит).

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

// Таймаут для Claude API — 8 секунд (оставляем 2 секунды на ответ)
const CLAUDE_TIMEOUT_MS = 8000;

// ═══════════════════════════════════════════
// КОМПАКТНЫЕ ОПИСАНИЯ ИНСТРУМЕНТОВ (короче = быстрее)
// ═══════════════════════════════════════════

const TOOLS = [
  {
    name: "create_counterparty",
    description: "Создать контрагента (клиента/поставщика) в справочнике.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Наименование" },
        bin: { type: "string", description: "БИН/ИИН (12 цифр)" },
        counterparty_type: { type: "string", enum: ["client", "supplier", "both"] },
        address: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        director_name: { type: "string" }
      },
      required: ["name"]
    }
  },
  {
    name: "create_nomenclature",
    description: "Создать товар или услугу в номенклатуре.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        code: { type: "string", description: "Артикул" },
        unit: { type: "string", description: "Единица измерения" },
        purchase_price: { type: "number" },
        sale_price: { type: "number" },
        quantity: { type: "number" },
        vat_rate: { type: "number", description: "НДС %" },
        category: { type: "string" },
        min_stock: { type: "number" },
        type: { type: "string", enum: ["product", "service"] }
      },
      required: ["name"]
    }
  },
  {
    name: "create_employee",
    description: "Принять сотрудника на работу.",
    input_schema: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        iin: { type: "string", description: "ИИН (12 цифр)" },
        position: { type: "string" },
        department: { type: "string" },
        salary: { type: "number" },
        hire_date: { type: "string", description: "YYYY-MM-DD" },
        phone: { type: "string" },
        email: { type: "string" }
      },
      required: ["full_name"]
    }
  },
  {
    name: "create_journal_entry",
    description: "Создать бухгалтерскую проводку Дт/Кт. Счета НСФО РК (1010 касса, 1030 банк, 6010 выручка, 7010 себестоимость).",
    input_schema: {
      type: "object",
      properties: {
        entry_date: { type: "string", description: "YYYY-MM-DD" },
        debit_account: { type: "string" },
        credit_account: { type: "string" },
        amount: { type: "number" },
        description: { type: "string" },
        doc_ref: { type: "string" }
      },
      required: ["entry_date", "debit_account", "credit_account", "amount", "description"]
    }
  },
  {
    name: "create_order",
    description: "Создать заказ на продажу. Контрагент должен существовать.",
    input_schema: {
      type: "object",
      properties: {
        counterparty_name: { type: "string" },
        order_date: { type: "string" },
        total_amount: { type: "number", description: "Сумма с НДС" },
        vat_rate: { type: "number" },
        description: { type: "string" },
        order_number: { type: "string" }
      },
      required: ["counterparty_name", "total_amount"]
    }
  },
  {
    name: "create_fixed_asset",
    description: "Зарегистрировать ОС. Группы амортизации: 1=здания(10%), 2=машины(25%), 3=компьютеры(40%), 4=прочее(15%).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        initial_cost: { type: "number" },
        category: { type: "string" },
        depreciation_group: { type: "number", description: "1-4" },
        depreciation_rate: { type: "number" },
        acquisition_date: { type: "string" },
        tax_object_type: { type: "string", enum: ["property", "vehicle", "land", "none"] }
      },
      required: ["name", "initial_cost"]
    }
  },
  {
    name: "generate_document",
    description: "Создать документ (счёт, акт, договор, накладная) для контрагента.",
    input_schema: {
      type: "object",
      properties: {
        document_type: { type: "string", enum: ["invoice", "act", "contract", "delivery_note"] },
        counterparty_name: { type: "string" },
        title: { type: "string" },
        amount: { type: "number" },
        service_description: { type: "string" }
      },
      required: ["document_type", "counterparty_name"]
    }
  },
  {
    name: "record_payment",
    description: "Зарегистрировать платёж — автоматически создаёт проводку Дт/Кт.",
    input_schema: {
      type: "object",
      properties: {
        payment_type: { type: "string", enum: ["incoming", "outgoing"] },
        amount: { type: "number" },
        payment_date: { type: "string" },
        counterparty_name: { type: "string" },
        method: { type: "string", enum: ["bank", "cash"] },
        description: { type: "string" }
      },
      required: ["payment_type", "amount", "counterparty_name"]
    }
  }
];

// ═══════════════════════════════════════════
// КОМПАКТНЫЙ СИСТЕМНЫЙ ПРОМПТ
// ═══════════════════════════════════════════

const SYSTEM_PROMPT = "Ты — Жанара, AI-помощник Finstat.kz по бухгалтерии и налогам РК.\n\n" +
"🔴 КРИТИЧНО: НИКОГДА НЕ ВРИ ЧТО ВЫПОЛНИЛ ДЕЙСТВИЕ.\n" +
"- Если есть инструмент → вызови через tool_use\n" +
"- Если нет инструмента → честно скажи 'не могу, сделайте вручную'\n" +
"- НИКОГДА не пиши '✅ Создано' без вызова tool_use — это ЛОЖЬ\n\n" +
"ИНСТРУМЕНТЫ для изменения данных:\n" +
"- create_counterparty — контрагенты\n" +
"- create_nomenclature — товары/услуги\n" +
"- create_employee — сотрудники\n" +
"- create_journal_entry — проводки\n" +
"- create_order — заказы\n" +
"- create_fixed_asset — основные средства\n" +
"- generate_document — документы\n" +
"- record_payment — платежи\n\n" +
"НК РК 2026: НДС 16%, КПН 20%, ИПН 10% (вычет 14 МРП), ОПВ 10%, СН 6%, МРП 4325₸.\n" +
"Счета: 1010 касса, 1030 банк, 6010 выручка, 7010 себестоимость, 1210 деб., 3310 кред.\n\n" +
"Отвечай на русском, кратко и по делу.";

// ═══════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

// Fetch с таймаутом через AbortController
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);

  try {
    const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Запрос превысил таймаут " + (timeoutMs / 1000) + " сек");
    }
    throw err;
  }
}

// Обрезаем длинную историю сообщений (оставляем только последние)
function truncateMessages(messages, maxMessages) {
  if (!messages || messages.length <= maxMessages) return messages;
  // Оставляем последние N сообщений
  return messages.slice(-maxMessages);
}

// Обрезаем контекст если слишком длинный
function truncateContext(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

// ═══════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY не задан в Netlify Environment Variables" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const mode = body.mode || "chat";
  // Ограничиваем количество сообщений чтобы не было таймаута
  const messages = truncateMessages(body.messages || [], 10);
  // Ограничиваем длину контекста
  const contextText = truncateContext(body.contextText || "", 2000);
  const enableTools = body.enableTools !== false;

  let finalSystem = SYSTEM_PROMPT;
  if (contextText) {
    finalSystem += "\n\n📊 КОНТЕКСТ ПОЛЬЗОВАТЕЛЯ:\n" + contextText;
  }

  try {
    const requestBody = {
      model: MODEL,
      max_tokens: 2000, // Уменьшено с 4000 чтобы быстрее отвечать
      system: finalSystem,
      messages: messages
    };

    if (mode === "chat" && enableTools) {
      requestBody.tools = TOOLS;
    }

    // Запрос с таймаутом
    const claudeRes = await fetchWithTimeout(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(requestBody)
    }, CLAUDE_TIMEOUT_MS);

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      // Парсим JSON ошибки если возможно
      let errMessage = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && parsed.error.message) errMessage = parsed.error.message;
      } catch (e) { /* keep raw */ }

      return {
        statusCode: claudeRes.status,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Claude API: " + errMessage })
      };
    }

    const data = await claudeRes.json();

    const textBlocks = (data.content || []).filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; });
    const toolUses = (data.content || []).filter(function(b) { return b.type === "tool_use"; });

    return {
      statusCode: 200,
      headers: Object.assign({}, corsHeaders(), { "Content-Type": "application/json" }),
      body: JSON.stringify({
        reply: textBlocks.join("\n\n"),
        tool_uses: toolUses.map(function(t) {
          return { id: t.id, name: t.name, input: t.input };
        }),
        stop_reason: data.stop_reason
      })
    };
  } catch (err) {
    const errMessage = err && err.message ? err.message : String(err);
    let userMessage = errMessage;

    // Понятные сообщения для типичных ошибок
    if (errMessage.indexOf("таймаут") !== -1 || errMessage.indexOf("timeout") !== -1) {
      userMessage = "⏱ Превышен таймаут (8 сек). Попробуйте задать более короткий вопрос.";
    } else if (errMessage.indexOf("fetch") !== -1) {
      userMessage = "Ошибка сети при обращении к Claude API";
    }

    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: userMessage })
    };
  }
};
