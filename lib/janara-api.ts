// Безопасный вызов AI-функций.
// Корректно обрабатывает 504/HTML-ошибки и возвращает понятные сообщения.

export interface JanaraResponse {
  reply?: string;
  tool_uses?: any[];
  stop_reason?: string;
  model_used?: string;
  attempts?: number;
  error?: string;
}

/**
 * Безопасный вызов Netlify-функции Жанары.
 * Не упадёт на HTML-ответе при 504, вернёт понятную ошибку.
 */
export async function callJanaraAPI(
  payload: {
    messages: any[];
    contextText?: string;
    enableTools?: boolean;
  }
): Promise<JanaraResponse> {
  try {
    const res = await fetch("/.netlify/functions/ai-zhanara", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Читаем как текст сначала чтобы понять что пришло
    const text = await res.text();

    // Если ответ — HTML (обычно 504 от Netlify), отдаём понятную ошибку
    if (text.trim().startsWith("<") || text.trim().toLowerCase().startsWith("<!doctype")) {
      if (res.status === 504 || res.status === 502 || res.status === 503) {
        return {
          error: "⏱ AI не успел ответить за отведённое время. Попробуйте задать вопрос покороче или повторите через минуту.",
        };
      }
      return {
        error: "Сервис временно недоступен. Попробуйте через минуту.",
      };
    }

    // Пытаемся распарсить JSON
    let data: JanaraResponse;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return {
        error: "Ошибка обработки ответа AI. Попробуйте ещё раз.",
      };
    }

    // Если есть error в ответе
    if (data.error) {
      return { error: data.error };
    }

    // HTTP ошибка но JSON корректный
    if (!res.ok) {
      return {
        error: data.error || `Ошибка ${res.status}: попробуйте ещё раз через минуту.`,
      };
    }

    return data;
  } catch (err: any) {
    // Сетевая ошибка
    const errMsg = err?.message || String(err);
    if (errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError")) {
      return {
        error: "Нет связи с сервером. Проверьте интернет и попробуйте снова.",
      };
    }
    return {
      error: "Ошибка: " + errMsg,
    };
  }
}
