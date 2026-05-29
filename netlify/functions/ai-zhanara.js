// AI-помощник Жанара с tool_use API.
// 11 инструментов + retry + fallback на Haiku при перегрузке.
// Уменьшенные таймауты чтобы успевать в лимит Netlify 26 сек.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

const PRIMARY_MODEL = "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";

// ═══════════════════════════════════════════
// 11 ИНСТРУМЕНТОВ
// ═══════════════════════════════════════════

const TOOLS = [
  {
    name: "create_counterparty",
    description: "Создать контрагента (клиента/поставщика) в справочнике.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Наименование" },
        bin: { type: "string", description: "БИН/ИИН" },
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
    description: "Принять сотрудника.",
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
    description: "Создать документ (счёт, акт, договор, накладная).",
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
  },
  {
    name: "create_warehouse",
    description: "Создать новый склад. Типы: main, transit, production, returns, consignment.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Наименование склада" },
        code: { type: "string", description: "Код склада" },
        warehouse_type: { type: "string", enum: ["main", "transit", "production", "returns", "consignment"] },
        address: { type: "string", description: "Адрес" },
        responsible_name: { type: "string", description: "ФИО ответственного" },
        responsible_iin: { type: "string", description: "ИИН ответственного" },
        is_main: { type: "boolean", description: "Главный склад" }
      },
      required: ["name"]
    }
  },
  {
    name: "create_warehouse_transfer",
    description: "Перемещение товара между складами с автообновлением остатков.",
    input_schema: {
      type: "object",
      properties: {
        from_warehouse_name: { type: "string", description: "Склад-источник" },
        to_warehouse_name: { type: "string", description: "Склад-получатель" },
        transfer_date: { type: "string" },
        product_name: { type: "string" },
        quantity: { type: "number" },
        notes: { type: "string" }
      },
      required: ["from_warehouse_name", "to_warehouse_name", "product_name", "quantity"]
    }
  },
  {
    name: "create_inventory_act",
    description: "Создать акт инвентаризации с автозагрузкой товаров.",
    input_schema: {
      type: "object",
      properties: {
        warehouse_name: { type: "string" },
        act_date: { type: "string" },
        responsible_name: { type: "string" },
        notes: { type: "string" }
      },
      required: ["warehouse_name"]
    }
  }
];

// ═══════════════════════════════════════════
// СИСТЕМНЫЙ ПРОМПТ (короче — для скорости)
// ═══════════════════════════════════════════

const SYSTEM_PROMPT = "Ты — Жанара, AI-помощник Finstat.kz по бухгалтерии и налогам РК.\n\n" +
"🔴 ПРАВИЛО ДЛЯ ДЕЙСТВИЙ: НЕ ВРИ что выполнил действие.\n" +
"- Есть инструмент → вызови tool_use\n" +
"- Нет → честно скажи 'не могу, сделайте вручную'\n" +
"- НИКОГДА не пиши '✅ Создано' без tool_use\n\n" +
"ИНСТРУМЕНТЫ (11): create_counterparty, create_nomenclature, create_employee, create_journal_entry, " +
"create_order, create_fixed_asset, generate_document, record_payment, create_warehouse, create_warehouse_transfer, create_inventory_act\n\n" +
"НК РК 2026: НДС 16%, КПН 20%, ИПН 10% (вычет 14 МРП), ОПВ 10%, СН 6%, МРП 4325₸.\n" +
"Счета НСФО: 1010 касса, 1030 банк, 1210 деб., 1330 запасы, 3310 кред., 6010 выручка, 7010 себестоимость, 7110 расходы по ЗП.\n\n" +
"Отвечай на русском, КРАТКО (4-8 предложений), по делу. Длинные ответы — только если явно просят.";

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

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function callAnthropic(apiKey, model, requestBody, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(Object.assign({}, requestBody, { model: model })),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return { ok: res.ok, status: res.status, response: res };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// 3 попытки с УМЕНЬШЕННЫМИ таймаутами (14→10→8 сек)
// Общий бюджет: 14 + 0.5 + 10 + 1 + 8 = ~24 сек (укладываемся в 26 сек Netlify)
async function callWithRetryAndFallback(apiKey, requestBody) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const model = attempt < 3 ? PRIMARY_MODEL : FALLBACK_MODEL;
    
    // УМЕНЬШЕНЫ: 14 → 10 → 8 секунд (было 18 → 14 → 10)
    const timeoutMs = attempt === 1 ? 14000 : attempt === 2 ? 10000 : 8000;

    try {
      const result = await callAnthropic(apiKey, model, requestBody, timeoutMs);

      if (result.ok) {
        const data = await result.response.json();
        return { success: true, data: data, model_used: model, attempts: attempt };
      }

      if (result.status === 400 || result.status === 401 || result.status === 403) {
        const errText = await result.response.text();
        return {
          success: false,
          status: result.status,
          error: "Ошибка запроса: " + errText,
          permanent: true
        };
      }

      const errText = await result.response.text();
      lastError = { status: result.status, text: errText, model: model };

      if (attempt === maxAttempts) {
        return {
          success: false,
          status: result.status,
          error: "AI временно перегружен. Попробуйте через минуту или задайте короткий вопрос.",
          details: errText,
          attempts: attempt
        };
      }

      // Уменьшенные задержки между попытками: 500мс → 1сек (было 1сек → 3сек)
      const delayMs = attempt === 1 ? 500 : 1000;
      await sleep(delayMs);

    } catch (err) {
      lastError = { text: err && err.message ? err.message : String(err), model: model };

      if (err && err.name === "AbortError") {
        if (attempt === maxAttempts) {
          return {
            success: false,
            error: "⏱ AI не успевает ответить. Задайте вопрос короче или попробуйте позже.",
            attempts: attempt
          };
        }
      }

      if (attempt === maxAttempts) {
        return {
          success: false,
          error: "Ошибка связи с AI: " + lastError.text,
          attempts: attempt
        };
      }

      const delayMs = attempt === 1 ? 500 : 1000;
      await sleep(delayMs);
    }
  }

  return { success: false, error: "Не удалось получить ответ AI" };
}

// ═══════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY не задан" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { 
      statusCode: 400, 
      headers: { ...corsHeaders(), "Content-Type": "application/json" }, 
      body: JSON.stringify({ error: "Invalid JSON" }) 
    };
  }

  // Ограничиваем последние 10 сообщений и контекст
  const messages = (body.messages || []).slice(-10);
  const contextText = (body.contextText || "").slice(0, 1500);  // было 2000
  const enableTools = body.enableTools !== false;

  let finalSystem = SYSTEM_PROMPT;
  if (contextText) {
    finalSystem += "\n\n📊 КОНТЕКСТ:\n" + contextText;
  }

  // УМЕНЬШЕНО: 1500 токенов вместо 2000 → быстрее генерация
  const requestBody = {
    max_tokens: 1500,
    system: finalSystem,
    messages: messages
  };

  if (enableTools) {
    requestBody.tools = TOOLS;
  }

  const result = await callWithRetryAndFallback(apiKey, requestBody);

  if (!result.success) {
    // Всегда возвращаем JSON, даже при ошибке
    return {
      statusCode: result.status || 503,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        error: result.error,
        details: result.details,
        attempts: result.attempts
      })
    };
  }

  const data = result.data;
  const textBlocks = (data.content || []).filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; });
  const toolUses = (data.content || []).filter(function(b) { return b.type === "tool_use"; });

  let metaInfo = "";
  if (result.model_used === FALLBACK_MODEL) {
    metaInfo = "\n\n_(использована резервная AI-модель)_";
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      reply: textBlocks.join("\n\n") + metaInfo,
      tool_uses: toolUses.map(function(t) {
        return { id: t.id, name: t.name, input: t.input };
      }),
      stop_reason: data.stop_reason,
      model_used: result.model_used,
      attempts: result.attempts
    })
  };
};
