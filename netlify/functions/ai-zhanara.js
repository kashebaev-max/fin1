// AI-помощник Жанара со СТРИМИНГОМ через Server-Sent Events (SSE).
// Решает проблему таймаута: Claude отвечает по кусочкам, Netlify не падает.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

// ═══════════════════════════════════════════
// ОПИСАНИЯ ИНСТРУМЕНТОВ
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
    description: "Создать товар или услугу.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        code: { type: "string" },
        unit: { type: "string" },
        purchase_price: { type: "number" },
        sale_price: { type: "number" },
        quantity: { type: "number" },
        vat_rate: { type: "number" },
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
        iin: { type: "string" },
        position: { type: "string" },
        department: { type: "string" },
        salary: { type: "number" },
        hire_date: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" }
      },
      required: ["full_name"]
    }
  },
  {
    name: "create_journal_entry",
    description: "Создать бухпроводку Дт/Кт. Счета НСФО РК.",
    input_schema: {
      type: "object",
      properties: {
        entry_date: { type: "string" },
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
    description: "Создать заказ на продажу.",
    input_schema: {
      type: "object",
      properties: {
        counterparty_name: { type: "string" },
        order_date: { type: "string" },
        total_amount: { type: "number" },
        vat_rate: { type: "number" },
        description: { type: "string" },
        order_number: { type: "string" }
      },
      required: ["counterparty_name", "total_amount"]
    }
  },
  {
    name: "create_fixed_asset",
    description: "Зарегистрировать ОС.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        initial_cost: { type: "number" },
        category: { type: "string" },
        depreciation_group: { type: "number" },
        depreciation_rate: { type: "number" },
        acquisition_date: { type: "string" },
        tax_object_type: { type: "string", enum: ["property", "vehicle", "land", "none"] }
      },
      required: ["name", "initial_cost"]
    }
  },
  {
    name: "generate_document",
    description: "Создать документ для контрагента.",
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
    description: "Зарегистрировать платёж + автопроводка.",
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

const SYSTEM_PROMPT = "Ты — Жанара, AI-помощник Finstat.kz.\n\n" +
"🔴 КРИТИЧНО: НИКОГДА НЕ ВРИ. Если есть инструмент — вызови tool_use. Если нет — честно скажи 'не могу'.\n" +
"НИКОГДА не пиши '✅ Создано' без вызова tool_use.\n\n" +
"Инструменты: create_counterparty, create_nomenclature, create_employee, create_journal_entry, create_order, create_fixed_asset, generate_document, record_payment.\n\n" +
"НК РК 2026: НДС 16%, КПН 20%, ИПН 10% (вычет 14 МРП), ОПВ 10%, СН 6%, МРП 4325₸.\n" +
"Счета: 1010 касса, 1030 банк, 6010 выручка, 7010 себестоимость, 1210 деб., 3310 кред.\n\n" +
"Отвечай на русском, кратко.";

// ═══════════════════════════════════════════
// HANDLER (используем Netlify Streaming API)
// ═══════════════════════════════════════════

// Netlify Functions поддерживают streaming через ReadableStream
exports.handler = async function(event) {
  // CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: ""
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY не задан" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON" })
    };
  }

  const messages = (body.messages || []).slice(-10);
  const contextText = (body.contextText || "").slice(0, 2000);
  const enableTools = body.enableTools !== false;

  let finalSystem = SYSTEM_PROMPT;
  if (contextText) {
    finalSystem += "\n\n📊 КОНТЕКСТ:\n" + contextText;
  }

  // Запрос к Claude (БЕЗ stream, ждём полный ответ)
  // Стриминг тут не нужен — мы возвращаем JSON клиенту, а не SSE
  // Цель — просто избежать Netlify-таймаута
  
  try {
    const requestBody = {
      model: MODEL,
      max_tokens: 2000,
      system: finalSystem,
      messages: messages
    };

    if (enableTools) {
      requestBody.tools = TOOLS;
    }

    // Запрос с увеличенным таймаутом 25 секунд (на Pro plan можно)
    const controller = new AbortController();
    const timeoutId = setTimeout(function() { controller.abort(); }, 24000);

    const claudeRes = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      let errMessage = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && parsed.error.message) errMessage = parsed.error.message;
      } catch (e) { /* keep raw */ }

      return {
        statusCode: claudeRes.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Claude API: " + errMessage })
      };
    }

    const data = await claudeRes.json();

    const textBlocks = (data.content || []).filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; });
    const toolUses = (data.content || []).filter(function(b) { return b.type === "tool_use"; });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
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

    if (err && err.name === "AbortError") {
      userMessage = "⏱ Запрос превысил 24 секунды. Попробуйте более короткий вопрос или нажмите ещё раз.";
    } else if (errMessage.indexOf("fetch") !== -1) {
      userMessage = "Ошибка сети при обращении к Claude API";
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: userMessage })
    };
  }
};
