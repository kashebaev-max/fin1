// Netlify Function: Распознавание документов через Claude
// Принимает base64 файла (PDF или изображение) → возвращает структурированные данные

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const RECOGNITION_PROMPT = `Ты — Жанара, AI-консультант системы Finstat.kz по бухгалтерии РК. Твоя задача — распознать загруженный финансовый документ.

ПРАВИЛА:
1. Внимательно прочитай документ
2. Определи его тип (счёт-фактура / акт / накладная / счёт / товарный чек / договор / другое)
3. Извлеки максимум данных
4. Верни СТРОГО JSON без markdown-обёрток

ФОРМАТ ОТВЕТА:
{
  "doc_type": "invoice" | "act" | "bill" | "waybill" | "receipt" | "contract" | "other",
  "doc_type_label": "Счёт-фактура" / "Акт выполненных работ" / "Счёт на оплату" / "Накладная" / "Товарный чек" / "Договор" / "Прочее",
  "confidence": 0-100,
  "summary": "Краткая характеристика документа в 1-2 предложениях",
  "data": {
    "doc_number": "номер документа или null",
    "doc_date": "YYYY-MM-DD или null",
    
    "seller": {
      "name": "ТОО ... или ИП ... или null",
      "bin": "12 цифр БИН/ИИН или null",
      "address": "адрес или null",
      "iik": "счёт IBAN или null",
      "bank": "название банка или null"
    },
    "buyer": {
      "name": "...",
      "bin": "...",
      "address": "..."
    },
    
    "items": [
      {
        "name": "наименование позиции",
        "unit": "шт/кг/услуга/...",
        "quantity": число или null,
        "price": число (за единицу) или null,
        "total": число (всего) или null,
        "vat_rate": 16 / 12 / 10 / 0 / null,
        "vat_amount": число или null
      }
    ],
    
    "total_without_vat": число или null,
    "vat_amount": число (общая сумма НДС),
    "total_with_vat": число (итого с НДС),
    
    "currency": "KZT" / "USD" / "EUR" / "RUB",
    
    "payment_terms": "Условия оплаты или null",
    "purpose": "Назначение платежа / основание или null",
    
    "notes": "Любая полезная информация которую заметил"
  },
  "suggested_action": {
    "type": "create_journal_entry" | "create_counterparty_and_entry" | "create_payment" | "none",
    "description": "Что предлагаешь сделать в системе",
    "debit_account": "номер счёта по НСФО РК",
    "credit_account": "номер счёта",
    "amount": число
  }
}

СПЕЦИФИКА КАЗАХСТАНА:
- НДС 16% (с 2026 года)
- БИН — 12 цифр
- Счета НСФО: 1010 касса, 1030 банк, 1210 деб., 3310 кред., 1310 запасы, 6010 выручка, 7010-7990 расходы, 1420 НДС к зачёту, 3130 НДС к уплате
- Если документ от продавца к нам (мы покупатели) — типичная проводка Дт 1310/7210 + Дт 1420 (НДС) Кт 3310
- Если документ от нас (мы продавцы) — Дт 1210 Кт 6010 + Дт 1210 Кт 3130 (НДС)

ВАЖНО:
- Числа без кавычек, без пробелов, без символа ₸
- Даты строго YYYY-MM-DD
- Если поле не нашёл — null, не выдумывай
- confidence: 90+ если всё чётко видно, 70-89 если частично, ниже 70 если плохо распознаётся
- ТОЛЬКО JSON, без markdown ${"```"}, без преамбул`;

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
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { fileBase64, fileType } = body;
  // fileType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp"

  if (!fileBase64 || !fileType) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Missing fileBase64 or fileType" }) };
  }

  // Подготавливаем content для Claude
  let contentItem;
  if (fileType === "application/pdf") {
    contentItem = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: fileBase64,
      },
    };
  } else if (fileType.startsWith("image/")) {
    contentItem = {
      type: "image",
      source: {
        type: "base64",
        media_type: fileType,
        data: fileBase64,
      },
    };
  } else {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: `Unsupported file type: ${fileType}` }) };
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
        system: RECOGNITION_PROMPT,
        messages: [{
          role: "user",
          content: [
            contentItem,
            {
              type: "text",
              text: "Распознай этот документ и верни JSON по указанной структуре."
            }
          ]
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return {
        statusCode: claudeRes.status,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Claude API error: " + errText }),
      };
    }

    const data = await claudeRes.json();
    const reply = data.content?.[0]?.text || "";

    // Парсим JSON ответа
    try {
      const cleaned = reply.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      };
    } catch (parseErr) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          error: "Failed to parse AI response",
          raw: reply,
          confidence: 0,
        }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
