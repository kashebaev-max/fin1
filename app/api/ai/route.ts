import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `Ты — Жанара, AI-бухгалтер для казахстанского бизнеса. Все расчёты по НОВОМУ Налоговому Кодексу РК 2026 (ЗРК 214-VIII от 18 июля 2025 года).

КЛЮЧЕВЫЕ СТАВКИ НК РК 2026:
- НДС: 16% (было 12%). Льготные: 5%, 10%. Порог: 10 000 МРП (43 250 000 ₸)
- ИПН: 10% (до 8500 МРП/год), 15% (свыше). Базовый вычет: 30 МРП (129 750 ₸, было 14 МРП)
- КПН: 20% базовая, 25% банки, 3% с/х, 5% соцсфера
- ОПВ: 10% (работник), ОПВР: 3.5% (работодатель, было 2.5%)
- ВОСМС: 2% (работник), ООСМС: 3% (работодатель)
- СО: 5% от (ЗП - ОПВ)
- СН: 6% (было 11%, без вычета СО)
- МРП: 4 325 ₸, МЗП: 85 000 ₸

Формула расчёта ЗП:
1. ОПВ = оклад × 10%
2. ВОСМС = оклад × 2%
3. ИПН = (оклад - ОПВ - ВОСМС - 30×МРП) × 10%
4. К выдаче = оклад - ОПВ - ВОСМС - ИПН
Работодатель: ОПВР 3.5%, СО 5% от (оклад-ОПВ), ООСМС 3%, СН 6%

Отвечай на русском, кратко и по делу. Давай конкретные цифры и расчёты. Если спрашивают расчёт зарплаты — считай подробно.`;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Fallback: local responses without API
      return NextResponse.json({ reply: getLocalResponse(message) });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ reply: getLocalResponse(message) });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || getLocalResponse(message);

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ reply: "Ошибка AI. Попробуйте позже." }, { status: 500 });
  }
}

function getLocalResponse(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("ндс") || lower.includes("nds")) {
    return "📊 НДС с 2026 года:\n\n• Базовая ставка: 16% (было 12%)\n• Льготные: 5% и 10%\n• Порог: 10 000 МРП (43 250 000 ₸)\n• 3 вида регистрации\n• ЭСФ за нерезидента обязателен";
  }
  if (lower.includes("зарплат") || lower.includes("зп")) {
    return "💰 Расчёт ЗП по НК РК 2026:\n\nПример: оклад 400 000 ₸\n• ОПВ (10%): 40 000\n• ВОСМС (2%): 8 000\n• Вычет 30 МРП: 129 750\n• ИПН (10%): (400000-40000-8000-129750)×10% = 22 225\n• К выдаче: 329 775 ₸\n\nРаботодатель:\n• ОПВР (3.5%): 14 000\n• СО (5%): 18 000\n• ООСМС (3%): 12 000\n• СН (6%): 24 000";
  }
  if (lower.includes("налог") || lower.includes("ставк")) {
    return "⚖ Ставки НК РК 2026:\n\n• НДС: 16%\n• ИПН: 10%/15%\n• КПН: 20%\n• ОПВ: 10%, ОПВР: 3.5%\n• СН: 6%\n• СО: 5%\n• ВОСМС: 2%, ООСМС: 3%\n• МРП: 4 325 ₸\n• МЗП: 85 000 ₸";
  }
  if (lower.includes("мрп") || lower.includes("показател")) {
    return "📊 Показатели 2026:\n\n• МРП: 4 325 ₸\n• МЗП: 85 000 ₸\n• Порог НДС: 43 250 000 ₸\n• Базовый вычет: 129 750 ₸ (30 МРП)\n• Порог ИПН 15%: 36 762 500 ₸/год";
  }
  if (lower.includes("отчёт") || lower.includes("отчет") || lower.includes("срок")) {
    return "📅 Отчётность 2026:\n\n• ФНО 910.00 — раз в полугодие\n• ФНО 200.00 — ежеквартально\n• ФНО 300.00 (НДС 16%) — ежеквартально\n• ФНО 100.00 (КПН) — ежегодно";
  }
  return "Спросите меня о:\n• Налогах (НДС 16%, ИПН, КПН)\n• Расчёте зарплаты\n• МРП, МЗП, показателях\n• Отчётности и сроках";
}
