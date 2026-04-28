// AI-помощник Жанара с tool_use API.
// 11 инструментов (Pack 62: +3 новых для склада)

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

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
  // ═══ НОВОЕ В Pack 62 ═══
  {
    name: "create_warehouse",
    description: "Создать новый склад. Типы: main (основной), transit (транзитный), production (производственный), returns (возвратный), consignment (комиссионный).",
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
    description: "Создать перемещение товара между складами. Автоматически уменьшает остаток на складе-источнике и увеличивает на получателе. Использует для конкретного товара (один товар на одно перемещение).",
    input_schema: {
      type: "object",
      properties: {
        from_warehouse_name: { type: "string", description: "Склад-источник (откуда)" },
        to_warehouse_name: { type: "string", description: "Склад-получатель (куда)" },
        transfer_date: { type: "string", description: "Дата перемещения" },
        product_name: { type: "string", description: "Наименование товара" },
        quantity: { type: "number", description: "Количество" },
        notes: { type: "string", description: "Примечание" }
      },
      required: ["from_warehouse_name", "to_warehouse_name", "product_name", "quantity"]
    }
  },
  {
    name: "create_inventory_act",
    description: "Создать акт инвентаризации для склада. Автоматически загружает все товары из номенклатуры с текущими остатками для проверки. После создания пользователь должен зайти в /dashboard/inventory и внести фактические количества.",
    input_schema: {
      type: "object",
      properties: {
        warehouse_name: { type: "string", description: "Наименование склада" },
        act_date: { type: "string", description: "Дата инвентаризации" },
        responsible_name: { type: "string", description: "ФИО ответственного" },
        notes: { type: "string", description: "Примечание" }
      },
      required: ["warehouse_name"]
    }
  }
];

// ═══════════════════════════════════════════
// СИСТЕМНЫЙ ПРОМПТ
// ═══════════════════════════════════════════

const SYSTEM_PROMPT = "Ты — Жанара, AI-помощник Finstat.kz по бухгалтерии и налогам РК.\n\n" +
"🔴 КРИТИЧНО: НИКОГДА НЕ ВРИ ЧТО ВЫПОЛНИЛ ДЕЙСТВИЕ.\n" +
"- Если есть инструмент → вызови tool_use\n" +
"- Если нет → честно скажи 'не могу, сделайте вручную'\n" +
"- НИКОГДА не пиши '✅ Создано' без вызова tool_use — это ЛОЖЬ\n\n" +
"ИНСТРУМЕНТЫ (11 шт):\n" +
"- create_counterparty — контрагенты\n" +
"- create_nomenclature — товары/услуги\n" +
"- create_employee — сотрудники\n" +
"- create_journal_entry — проводки\n" +
"- create_order — заказы\n" +
"- create_fixed_asset — основные средства\n" +
"- generate_document — документы\n" +
"- record_payment — платежи\n" +
"- create_warehouse — склады (Pack 62)\n" +
"- create_warehouse_transfer — перемещения между складами (Pack 62)\n" +
"- create_inventory_act — инвентаризация склада (Pack 62)\n\n" +
"НК РК 2026: НДС 16%, КПН 20%, ИПН 10% (вычет 14 МРП), ОПВ 10%, СН 6%, МРП 4325₸.\n" +
"Счета: 1010 касса, 1030 банк, 6010 выручка, 7010 себестоимость, 1210 деб., 3310 кред., 1330 запасы.\n" +
"Типы складов: main, transit, production, returns, consignment.\n\n" +
"Отвечай на русском, кратко.";

// ═══════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY не задан" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const messages = (body.messages || []).slice(-10);
  const contextText = (body.contextText || "").slice(0, 2000);
  const enableTools = body.enableTools !== false;

  let finalSystem = SYSTEM_PROMPT;
  if (contextText) {
    finalSystem += "\n\n📊 КОНТЕКСТ:\n" + contextText;
  }

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
      } catch (e) {}

      return {
        statusCode: claudeRes.status,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Claude API: " + errMessage })
      };
    }

    const data = await claudeRes.json();

    const textBlocks = (data.content || []).filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; });
    const toolUses = (data.content || []).filter(function(b) { return b.type === "tool_use"; });

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
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
      userMessage = "⏱ Превышен таймаут (24 сек). Попробуйте более короткий запрос.";
    }

    return {
      statusCode: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ error: userMessage })
    };
  }
};
