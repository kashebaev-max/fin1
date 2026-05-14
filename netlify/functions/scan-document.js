// OCR сканер документов через Claude Vision API.
// Принимает: { file_data (base64), file_type (mime) }
// Возвращает: распознанные данные с подтверждениями для tool_use

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const PRIMARY_MODEL = "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";

// ═══════════════════════════════════════════
// СИСТЕМНЫЙ ПРОМПТ ДЛЯ OCR
// ═══════════════════════════════════════════

const OCR_SYSTEM_PROMPT = `Ты — AI-помощник Жанара по распознаванию бухгалтерских документов в Казахстане.

🎯 ЗАДАЧА: Извлеки структурированные данные из документа на фото/PDF.

🔍 ОПРЕДЕЛИ ТИП документа:
- "invoice" — счёт-фактура, ЭСФ
- "receipt" — кассовый чек (магазин, АЗС, ресторан)
- "delivery_note" — накладная
- "act" — акт выполненных работ
- "contract" — договор
- "payment_order" — платёжное поручение
- "other" — другое

🔍 ИЗВЛЕКИ ДАННЫЕ:
- Стороны сделки: наименование, БИН/ИИН, адрес
- Дата документа (формат YYYY-MM-DD)
- Номер документа
- Позиции: наименование, количество, единица, цена, сумма
- Ставка и сумма НДС (16% по НК РК 2026)
- Итоговая сумма

🇰🇿 КОНТЕКСТ КАЗАХСТАНА:
- БИН/ИИН — 12 цифр
- Тенге (₸) — основная валюта
- НДС 16% (с 2026)
- Документы могут быть на русском, казахском или английском

📋 ФОРМАТ ОТВЕТА — СТРОГО JSON:
{
  "document_type": "invoice|receipt|...",
  "confidence": 0.95,
  "supplier": {
    "name": "ТОО ...",
    "bin": "123456789012",
    "address": "..."
  },
  "buyer": {
    "name": "...",
    "bin": "...",
    "address": "..."
  },
  "document_date": "2026-04-28",
  "document_number": "001",
  "items": [
    {
      "name": "Ноутбук Lenovo",
      "quantity": 2,
      "unit": "шт",
      "price": 350000,
      "amount": 700000
    }
  ],
  "vat_rate": 16,
  "vat_amount": 100000,
  "total_amount": 725000,
  "currency": "KZT",
  "raw_observation": "Краткое описание что видно на документе"
}

⚠ ВАЖНО:
- Если поле НЕ ВИДНО — ставь null
- Не выдумывай данные!
- confidence — твоя уверенность (0.00-1.00)
- Все суммы — в числах БЕЗ пробелов и валюты
- Ответ ТОЛЬКО JSON, без markdown тегов!`;

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

// Извлекает JSON из ответа AI (на случай если оно обернёт в markdown)
function extractJSON(text) {
  if (!text) return null;
  
  // Убираем markdown теги
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  
  // Ищем первый { и последний }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  
  if (firstBrace === -1 || lastBrace === -1) return null;
  
  const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

// Один вызов API с таймаутом
async function callAnthropicVision(apiKey, model, fileData, fileType, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);

  // Очищаем base64 префикс если он есть
  let cleanData = fileData;
  if (fileData.indexOf("data:") === 0) {
    const commaIdx = fileData.indexOf(",");
    if (commaIdx !== -1) {
      cleanData = fileData.substring(commaIdx + 1);
    }
  }

  // Определяем тип контента для Claude API
  let contentBlock;
  if (fileType === "application/pdf") {
    contentBlock = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: cleanData
      }
    };
  } else {
    contentBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: fileType,
        data: cleanData
      }
    };
  }

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 4000,
        system: OCR_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: "Распознай этот документ и верни данные в JSON формате согласно инструкции."
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return { ok: res.ok, status: res.status, response: res };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Главная функция: 2 попытки с retry и fallback
async function callWithRetryAndFallback(apiKey, fileData, fileType) {
  const maxAttempts = 2;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const model = attempt === 1 ? PRIMARY_MODEL : FALLBACK_MODEL;
    const timeoutMs = attempt === 1 ? 22000 : 12000;

    try {
      const result = await callAnthropicVision(apiKey, model, fileData, fileType, timeoutMs);

      if (result.ok) {
        const data = await result.response.json();
        return {
          success: true,
          data: data,
          model_used: model,
          processing_time_ms: Date.now() - startTime
        };
      }

      // Ошибки которые НЕ нужно повторять
      if (result.status === 400 || result.status === 401 || result.status === 403) {
        const errText = await result.response.text();
        return {
          success: false,
          status: result.status,
          error: "Ошибка запроса: " + errText,
          permanent: true
        };
      }

      // Overloaded — пробуем fallback
      if (attempt === maxAttempts) {
        const errText = await result.response.text();
        return {
          success: false,
          status: result.status,
          error: "AI временно перегружен. Попробуйте через минуту.",
          details: errText
        };
      }

      await sleep(1500);
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);

      if (err && err.name === "AbortError" && attempt === maxAttempts) {
        return {
          success: false,
          error: "⏱ AI не успел распознать документ. Попробуйте более чёткое фото."
        };
      }

      if (attempt === maxAttempts) {
        return {
          success: false,
          error: "Ошибка связи: " + errMsg
        };
      }

      await sleep(1500);
    }
  }

  return { success: false, error: "Не удалось распознать документ" };
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
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY не задан" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { file_data, file_type, file_name } = body;

  if (!file_data || !file_type) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "file_data и file_type обязательны" })
    };
  }

  // Проверка типа файла
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
  if (allowedTypes.indexOf(file_type) === -1) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Поддерживаются только JPG, PNG, WebP, PDF" })
    };
  }

  // Проверка размера (примерная, base64 +33%)
  const sizeBytes = Math.ceil(file_data.length * 0.75);
  const maxSize = 5 * 1024 * 1024; // 5 MB
  if (sizeBytes > maxSize) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Файл слишком большой. Максимум 5 МБ." })
    };
  }

  // Вызываем Claude Vision
  const result = await callWithRetryAndFallback(apiKey, file_data, file_type);

  if (!result.success) {
    return {
      statusCode: result.status || 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        error: result.error,
        details: result.details
      })
    };
  }

  // Извлекаем текст из ответа Claude
  const data = result.data;
  const textBlocks = (data.content || []).filter(function(b) { return b.type === "text"; });
  const rawText = textBlocks.map(function(b) { return b.text; }).join("\n");

  // Парсим JSON
  const parsedData = extractJSON(rawText);

  if (!parsedData) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        parsed: false,
        raw_text: rawText,
        model_used: result.model_used,
        processing_time_ms: result.processing_time_ms,
        warning: "Не удалось извлечь структурированные данные. Возвращён сырой текст."
      })
    };
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      parsed: true,
      data: parsedData,
      raw_text: rawText,
      model_used: result.model_used,
      processing_time_ms: result.processing_time_ms
    })
  };
};
