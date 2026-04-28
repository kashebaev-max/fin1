// AI-помощник Жанара с tool_use API.
// Чистый JavaScript для Netlify Functions (без TypeScript синтаксиса).

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

// ═══════════════════════════════════════════
// ОПИСАНИЯ ИНСТРУМЕНТОВ
// ═══════════════════════════════════════════

const TOOLS = [
  {
    name: "create_counterparty",
    description: "Создать контрагента (клиента или поставщика) в справочнике. Используй когда пользователь хочет добавить новую организацию.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Наименование организации" },
        bin: { type: "string", description: "БИН/ИИН (12 цифр)" },
        counterparty_type: { type: "string", enum: ["client", "supplier", "both"], description: "Тип" },
        address: { type: "string", description: "Адрес" },
        phone: { type: "string", description: "Телефон" },
        email: { type: "string", description: "Email" },
        director_name: { type: "string", description: "ФИО директора" }
      },
      required: ["name"]
    }
  },
  {
    name: "create_nomenclature",
    description: "Создать товар или услугу в номенклатуре. Используй когда пользователь хочет добавить новую позицию в каталог.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Наименование" },
        code: { type: "string", description: "Артикул" },
        unit: { type: "string", description: "Единица измерения" },
        purchase_price: { type: "number", description: "Цена закупки" },
        sale_price: { type: "number", description: "Цена продажи" },
        quantity: { type: "number", description: "Текущий остаток" },
        vat_rate: { type: "number", description: "Ставка НДС (%)" },
        category: { type: "string", description: "Категория" },
        min_stock: { type: "number", description: "Минимальный остаток" },
        type: { type: "string", enum: ["product", "service"], description: "Товар или услуга" }
      },
      required: ["name"]
    }
  },
  {
    name: "create_employee",
    description: "Принять сотрудника на работу. Используй когда пользователь хочет добавить нового работника в штат.",
    input_schema: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "ФИО" },
        iin: { type: "string", description: "ИИН (12 цифр)" },
        position: { type: "string", description: "Должность" },
        department: { type: "string", description: "Подразделение" },
        salary: { type: "number", description: "Оклад" },
        hire_date: { type: "string", description: "Дата приёма (YYYY-MM-DD)" },
        phone: { type: "string", description: "Телефон" },
        email: { type: "string", description: "Email" }
      },
      required: ["full_name"]
    }
  },
  {
    name: "create_journal_entry",
    description: "Создать бухгалтерскую проводку Дт/Кт. Используй счета НСФО РК (1010 касса, 1030 банк, 6010 выручка, 7010 себестоимость).",
    input_schema: {
      type: "object",
      properties: {
        entry_date: { type: "string", description: "Дата (YYYY-MM-DD)" },
        debit_account: { type: "string", description: "Счёт Дебет" },
        credit_account: { type: "string", description: "Счёт Кредит" },
        amount: { type: "number", description: "Сумма" },
        description: { type: "string", description: "Содержание операции" },
        doc_ref: { type: "string", description: "Номер документа" }
      },
      required: ["entry_date", "debit_account", "credit_account", "amount", "description"]
    }
  },
  {
    name: "create_order",
    description: "Создать заказ на продажу клиенту. Контрагент должен уже существовать в справочнике.",
    input_schema: {
      type: "object",
      properties: {
        counterparty_name: { type: "string", description: "Наименование клиента" },
        order_date: { type: "string", description: "Дата заказа" },
        total_amount: { type: "number", description: "Сумма с НДС" },
        vat_rate: { type: "number", description: "Ставка НДС" },
        description: { type: "string", description: "Описание" },
        order_number: { type: "string", description: "Номер заказа" }
      },
      required: ["counterparty_name", "total_amount"]
    }
  },
  {
    name: "create_fixed_asset",
    description: "Зарегистрировать основное средство. Группы амортизации: 1=здания (10%), 2=машины (25%), 3=компьютеры (40%), 4=прочее (15%).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Наименование" },
        initial_cost: { type: "number", description: "Первоначальная стоимость" },
        category: { type: "string", description: "Категория" },
        depreciation_group: { type: "number", description: "Группа 1-4" },
        depreciation_rate: { type: "number", description: "Норма амортизации (%)" },
        acquisition_date: { type: "string", description: "Дата приобретения" },
        tax_object_type: { type: "string", enum: ["property", "vehicle", "land", "none"], description: "Тип для налога" }
      },
      required: ["name", "initial_cost"]
    }
  },
  {
    name: "generate_document",
    description: "Создать деловой документ (счёт, акт, договор, накладная) для контрагента.",
    input_schema: {
      type: "object",
      properties: {
        document_type: { type: "string", enum: ["invoice", "act", "contract", "delivery_note"], description: "Тип" },
        counterparty_name: { type: "string", description: "Контрагент" },
        title: { type: "string", description: "Заголовок" },
        amount: { type: "number", description: "Сумма" },
        service_description: { type: "string", description: "Описание услуг" }
      },
      required: ["document_type", "counterparty_name"]
    }
  },
  {
    name: "record_payment",
    description: "Зарегистрировать платёж (входящий или исходящий) — автоматически создаёт проводку Дт/Кт.",
    input_schema: {
      type: "object",
      properties: {
        payment_type: { type: "string", enum: ["incoming", "outgoing"], description: "Тип платежа" },
        amount: { type: "number", description: "Сумма" },
        payment_date: { type: "string", description: "Дата" },
        counterparty_name: { type: "string", description: "Контрагент" },
        method: { type: "string", enum: ["bank", "cash"], description: "Через банк или кассу" },
        description: { type: "string", description: "Назначение" }
      },
      required: ["payment_type", "amount", "counterparty_name"]
    }
  }
];

// ═══════════════════════════════════════════
// СИСТЕМНЫЙ ПРОМПТ
// ═══════════════════════════════════════════

const SYSTEM_PROMPT = `Ты — Жанара, AI-помощник системы Finstat.kz по бухгалтерии и налогам РК.

═══════════════════════════════════════════
🔴 КРИТИЧЕСКИЕ ПРАВИЛА — НИКОГДА НЕ НАРУШАЙ:
═══════════════════════════════════════════

1. НИКОГДА НЕ ВРИ ЧТО ВЫПОЛНИЛ ДЕЙСТВИЕ.
   - Если у тебя есть инструмент (tool) — вызови его явно через tool_use
   - Если ты ТОЛЬКО написал текст "я создал..." без вызова tool_use — это ЛОЖЬ
   - Никогда не пиши "✅ Создано", "Готово", "Сделал" если ты не вызвал tool

2. ЕСЛИ ИНСТРУМЕНТА НЕТ — ЧЕСТНО ОБ ЭТОМ СКАЖИ.
   - "У меня нет действия для X. Вы можете сделать это вручную в разделе Y."
   - Не придумывай что ты "сделал" что-то чего не сделал

3. ВСЕГДА ИСПОЛЬЗУЙ tool_use ДЛЯ ИЗМЕНЕНИЯ ДАННЫХ.
   - Создание контрагента → tool create_counterparty
   - Создание товара → tool create_nomenclature
   - Создание сотрудника → tool create_employee
   - Создание проводки → tool create_journal_entry
   - И т.д.

4. ПОСЛЕ ВЫПОЛНЕНИЯ ИНСТРУМЕНТА — ДОЖДИСЬ РЕЗУЛЬТАТА.
   - Система покажет успех или ошибку
   - Не предполагай результат — сообщи фактический

═══════════════════════════════════════════

ДОСТУПНЫЕ ИНСТРУМЕНТЫ (используй их через tool_use):
- create_counterparty — добавить контрагента
- create_nomenclature — добавить товар или услугу
- create_employee — принять сотрудника
- create_journal_entry — создать проводку
- create_order — создать заказ на продажу
- create_fixed_asset — добавить основное средство
- generate_document — создать документ
- record_payment — зарегистрировать платёж

═══════════════════════════════════════════
ПРИМЕРЫ ПРАВИЛЬНОГО ПОВЕДЕНИЯ:
═══════════════════════════════════════════

❌ НЕПРАВИЛЬНО: 
Пользователь: "Создай 5 товаров"
Жанара: "✅ Готово! Создал 5 товаров..." (БЕЗ ВЫЗОВА TOOL — ЭТО ЛОЖЬ!)

✅ ПРАВИЛЬНО:
Пользователь: "Создай 5 товаров"
Жанара: [вызывает tool create_nomenclature 5 раз с разными параметрами]
Затем: "Создала 5 товаров: ..."

═══════════════════════════════════════════

ПРАВИЛА БУХУЧЁТА (НК РК 2026):
- НДС: 16% (стандартная)
- ИПН: 10% (с вычетом 14 МРП = 60 550 ₸)
- КПН: 20%
- ОПВ: 10%, ОПВР: 3.5%, ВОСМС: 2%, ООСМС: 3%, СО: 5%
- МРП 2026: 4 325 ₸, МЗП: 85 000 ₸
- Счета НСФО: 1010 касса, 1030 банк, 6010 выручка, 7010 себестоимость, 1210 деб., 3310 кред., 3350 ЗП

ПОВЕДЕНИЕ:
- Отвечай на русском
- Будь дружелюбной, но профессиональной
- Если что-то непонятно — переспрашивай
- Используй данные пользователя из context для персонализации`;

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
  const messages = body.messages || [];
  const contextText = body.contextText || "";
  const enableTools = body.enableTools !== false;

  // Строим финальный системный промпт с контекстом
  let finalSystem = SYSTEM_PROMPT;
  if (contextText) {
    finalSystem += "\n\n═══════════════════════════════════════════\nКОНТЕКСТ БИЗНЕСА ПОЛЬЗОВАТЕЛЯ:\n═══════════════════════════════════════════\n" + contextText;
  }

  try {
    const requestBody = {
      model: MODEL,
      max_tokens: 4000,
      system: finalSystem,
      messages: messages
    };

    if (mode === "chat" && enableTools) {
      requestBody.tools = TOOLS;
    }

    const claudeRes = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(requestBody)
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return {
        statusCode: claudeRes.status,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Claude API error: " + errText })
      };
    }

    const data = await claudeRes.json();

    // Парсим ответ
    const textBlocks = data.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; });
    const toolUses = data.content.filter(function(b) { return b.type === "tool_use"; });

    return {
      statusCode: 200,
      headers: Object.assign({}, corsHeaders(), { "Content-Type": "application/json" }),
      body: JSON.stringify({
        reply: textBlocks.join("\n\n"),
        tool_uses: toolUses.map(function(t) {
          return {
            id: t.id,
            name: t.name,
            input: t.input
          };
        }),
        stop_reason: data.stop_reason
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: String(err && err.message || err) })
    };
  }
};
