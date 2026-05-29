import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `Ты — система проверки контрагентов для бизнеса в Казахстане. 

Когда пользователь вводит БИН (12 цифр), ты должен:
1. Проверить формат БИН (12 цифр, начинается с определённых комбинаций)
2. По структуре БИН определить:
   - Тип: ТОО, АО, ИП, ГУ (5-6 цифры: 40-50 = ТОО, 60 = АО, 30 = ИП)
   - Дата регистрации (первые 6 цифр = ГГММДД)
   - Регион регистрации
3. Дать рекомендации по проверке благонадёжности

Отвечай в формате JSON (строго без markdown, без backticks):
{
  "bin": "введённый БИН",
  "valid": true/false,
  "type": "ТОО/АО/ИП/Прочее",
  "registration_date": "ДД.ММ.ГГГГ или неизвестно",
  "checks": [
    {"name": "Формат БИН", "status": "ok/warning/error", "detail": "описание"},
    {"name": "Тип организации", "status": "ok/warning/error", "detail": "описание"},
    {"name": "Дата регистрации", "status": "ok/warning/error", "detail": "описание"},
    {"name": "Рекомендация", "status": "info", "detail": "описание"}
  ],
  "risk_level": "low/medium/high/unknown",
  "links": [
    {"name": "КГД — Сведения по контрагентам", "url": "https://portal.kgd.gov.kz/ru/pages/info-services/find-information-for-ip-ul"},
    {"name": "КГД — Поиск налогоплательщика", "url": "https://kgd.gov.kz/ru/services/taxpayer_search/legal_entity"},
    {"name": "КГД — Лжепредприятия", "url": "https://kgd.gov.kz/ru/all/services"},
    {"name": "Стат. реестр — Поиск по БИН", "url": "https://stat.gov.kz/ru/juridical/by/bin/"},
    {"name": "Госзакупки", "url": "https://goszakup.gov.kz"}
  ]
}`;

export async function POST(req: NextRequest) {
  try {
    const { bin } = await req.json();

    if (!bin || bin.length !== 12 || !/^\d{12}$/.test(bin)) {
      return NextResponse.json({
        bin, valid: false, type: "Неизвестно", registration_date: "—",
        checks: [{ name: "Формат БИН", status: "error", detail: "БИН должен содержать ровно 12 цифр" }],
        risk_level: "unknown", links: [],
      });
    }

    // Попытка через Anthropic API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: `Проверь БИН: ${bin}` }],
          }),
        });
        if (response.ok) {
          const data = await response.json();
          const text = data.content?.[0]?.text || "";
          const clean = text.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(clean);
          return NextResponse.json(parsed);
        }
      } catch { /* fallback to local */ }
    }

    // Локальный анализ БИН
    return NextResponse.json(analyzeBINLocally(bin));
  } catch {
    return NextResponse.json({ error: "Ошибка проверки" }, { status: 500 });
  }
}

function analyzeBINLocally(bin: string) {
  const yy = bin.slice(0, 2);
  const mm = bin.slice(2, 4);
  const dd = bin.slice(4, 6);
  const typeDigit = bin.slice(4, 5);
  const subType = bin.slice(4, 6);

  let year = parseInt(yy);
  year = year > 50 ? 1900 + year : 2000 + year;
  const regDate = `${mm}.${year}`;

  let orgType = "Прочее";
  let typeDetail = "";
  if (["4", "5"].includes(typeDigit)) { orgType = "ТОО/ХТ"; typeDetail = "Товарищество с ограниченной ответственностью или хозяйственное товарищество"; }
  else if (typeDigit === "6") { orgType = "АО"; typeDetail = "Акционерное общество"; }
  else if (typeDigit === "3") { orgType = "ИП"; typeDetail = "Индивидуальный предприниматель"; }
  else if (["1", "2"].includes(typeDigit)) { orgType = "ГУ/ГП"; typeDetail = "Государственное учреждение или предприятие"; }

  const isOld = year < 2020;
  const isVeryNew = year >= 2025;

  const checks = [
    { name: "Формат БИН", status: "ok" as const, detail: `12 цифр, формат корректный` },
    { name: "Тип организации", status: "ok" as const, detail: `${orgType} — ${typeDetail}` },
    { name: "Дата регистрации", status: (isVeryNew ? "warning" : "ok") as "ok" | "warning", detail: `Ориентировочно ${regDate} г.${isVeryNew ? " (Новая компания — проверьте дополнительно!)" : ""}` },
    { name: "Учёт по НДС", status: "info" as const, detail: "Проверьте на портале КГД — является ли плательщиком НДС" },
    { name: "Лжепредприятие", status: "info" as const, detail: "Проверьте в реестре КГД — не включён ли в список лжепредприятий" },
    { name: "Ограничение ЭСФ", status: "info" as const, detail: "Проверьте наличие ограничений на выписку ЭСФ" },
    { name: "Задолженность", status: "info" as const, detail: "Проверьте наличие налоговой задолженности на портале КГД" },
    { name: "Ликвидация", status: "info" as const, detail: "Проверьте — не находится ли на стадии ликвидации" },
  ];

  let riskLevel = "unknown";
  if (isVeryNew) riskLevel = "medium";

  return {
    bin, valid: true, type: orgType, registration_date: regDate,
    checks,
    risk_level: riskLevel,
    recommendations: [
      "Обязательно проверьте контрагента на портале КГД (portal.kgd.gov.kz)",
      "Запросите учредительные документы и свидетельство о регистрации",
      "Проверьте наличие регистрации по НДС (порог 10 000 МРП = 43 250 000 ₸ с 2026 г.)",
      "Убедитесь в отсутствии ограничений по ЭСФ",
      isVeryNew ? "⚠ Компания зарегистрирована недавно — повышенный риск. Рекомендуется углублённая проверка." : "Компания зарегистрирована давно — положительный признак.",
    ],
    links: [
      { name: "📋 КГД — Сведения по контрагентам", url: "https://portal.kgd.gov.kz/ru/pages/info-services/find-information-for-ip-ul" },
      { name: "🔍 КГД — Поиск налогоплательщика", url: `https://kgd.gov.kz/ru/services/taxpayer_search/legal_entity` },
      { name: "⚠ КГД — Лжепредприятия и ограничения ЭСФ", url: "https://kgd.gov.kz/ru/all/services" },
      { name: "📊 Стат. реестр — Поиск по БИН", url: "https://stat.gov.kz/ru/juridical/by/bin/" },
      { name: "🏛 Госзакупки — Участие в тендерах", url: "https://goszakup.gov.kz" },
      { name: "⚖ Судебный кабинет", url: "https://office.sud.kz" },
    ],
  };
}
