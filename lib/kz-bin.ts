/** Парсинг и проверка БИН РК (12 цифр) по правилам НК/реестра */

export type BinParseResult = {
  valid: boolean;
  checksumOk: boolean;
  registrationYear: number;
  registrationMonth: number;
  registrationDate: string;
  entityType: string;
  entityTypeCode: string;
  unitType: string;
  unitTypeCode: string;
  isRecent: boolean;
  isVeryNew: boolean;
};

const ENTITY_TYPES: Record<string, string> = {
  "4": "Резидент (юр. лицо)",
  "5": "Нерезидент (юр. лицо)",
  "6": "ИП (совместное предпринимательство)",
};

const UNIT_TYPES: Record<string, string> = {
  "0": "Головная организация",
  "1": "Филиал",
  "2": "Представительство",
  "3": "КФХ (совместное предпринимательство)",
};

/** Контрольная цифра БИН/ИИН РК (mod 11) */
export function validateKzIdChecksum(value: string): boolean {
  if (!/^\d{12}$/.test(value)) return false;
  const calc = (weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < 11; i++) sum += parseInt(value[i], 10) * weights[i];
    let r = sum % 11;
    if (r === 10) return null;
    return r;
  };
  let check = calc([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  if (check === null) check = calc([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]);
  if (check === null) check = 0;
  return parseInt(value[11], 10) === check;
}

export function parseKzBin(bin: string): BinParseResult | null {
  const clean = bin.replace(/\D/g, "");
  if (clean.length !== 12) return null;

  const yy = parseInt(clean.slice(0, 2), 10);
  const mm = parseInt(clean.slice(2, 4), 10);
  const entityCode = clean[4];
  const unitCode = clean[5];

  const registrationYear = yy >= 50 ? 1900 + yy : 2000 + yy;
  const monthValid = mm >= 1 && mm <= 12;
  const registrationDate = monthValid
    ? `${String(mm).padStart(2, "0")}.${registrationYear}`
    : `— (${clean.slice(2, 4)} — неверный месяц)`;

  const now = new Date();
  const ageYears = now.getFullYear() - registrationYear;
  const isVeryNew = registrationYear >= now.getFullYear() - 1;
  const isRecent = ageYears <= 2;

  const entityType = ENTITY_TYPES[entityCode] || `Неизвестный тип (цифра ${entityCode})`;
  const unitType = UNIT_TYPES[unitCode] || `Прочее (цифра ${unitCode})`;

  const checksumOk = validateKzIdChecksum(clean);
  const knownEntity = entityCode in ENTITY_TYPES;

  return {
    valid: monthValid && knownEntity && checksumOk,
    checksumOk,
    registrationYear,
    registrationMonth: mm,
    registrationDate,
    entityType,
    entityTypeCode: entityCode,
    unitType,
    unitTypeCode: unitCode,
    isRecent,
    isVeryNew,
  };
}

export function buildOfficialLinks(bin: string) {
  return [
    {
      name: "📋 КГД — Сведения по контрагентам",
      url: "https://portal.kgd.gov.kz/ru/pages/info-services/find-information-for-ip-ul",
    },
    {
      name: "🔍 КГД — Поиск налогоплательщика",
      url: "https://kgd.gov.kz/ru/services/taxpayer_search/legal_entity",
    },
    {
      name: "⚠ КГД — Лжепредприятия и ограничения ЭСФ",
      url: "https://kgd.gov.kz/ru/all/services",
    },
    {
      name: "📊 Стат. реестр — поиск по БИН",
      url: `https://stat.gov.kz/ru/juridical/by/bin/${bin}`,
    },
    {
      name: "🏛 Госзакупки",
      url: "https://goszakup.gov.kz",
    },
    {
      name: "⚖ Судебный кабинет",
      url: "https://office.sud.kz",
    },
  ];
}

export type CheckItem = {
  name: string;
  status: "ok" | "warning" | "error" | "info";
  detail: string;
};

export type BinCheckResult = {
  bin: string;
  valid: boolean;
  type: string;
  registration_date: string;
  organization_name: string | null;
  name_source: string | null;
  address: string | null;
  director: string | null;
  checks: CheckItem[];
  risk_level: string;
  recommendations: string[];
  links: { name: string; url: string }[];
};

export function analyzeBinLocally(bin: string): BinCheckResult {
  const parsed = parseKzBin(bin);
  if (!parsed) {
    return {
      bin,
      valid: false,
      type: "Неизвестно",
      registration_date: "—",
      organization_name: null,
      name_source: null,
      address: null,
      director: null,
      checks: [{ name: "Формат БИН", status: "error", detail: "БИН должен содержать ровно 12 цифр" }] satisfies CheckItem[],
      risk_level: "unknown",
      recommendations: [] as string[],
      links: buildOfficialLinks(bin),
    };
  }

  const orgLabel =
    parsed.entityTypeCode === "6"
      ? "ИП"
      : parsed.entityTypeCode === "4" || parsed.entityTypeCode === "5"
        ? parsed.entityTypeCode === "5"
          ? "Нерезидент"
          : "ТОО/АО"
        : "Прочее";

  const checks: CheckItem[] = [
    {
      name: "Формат БИН",
      status: "ok",
      detail: "12 цифр, структура соответствует БИН РК",
    },
    {
      name: "Контрольная цифра",
      status: parsed.checksumOk ? "ok" : "error",
      detail: parsed.checksumOk
        ? "Контрольная цифра верна"
        : "Контрольная цифра не сходится — возможна опечатка в БИН",
    },
    {
      name: "Тип организации",
      status: parsed.entityTypeCode in ENTITY_TYPES ? "ok" : "warning",
      detail: `${parsed.entityType}. ${parsed.unitType}`,
    },
    {
      name: "Дата регистрации",
      status: parsed.isVeryNew ? "warning" : "ok",
      detail: `По БИН: ${parsed.registrationDate}${parsed.isVeryNew ? " (недавняя регистрация — проверьте дополнительно)" : ""}`,
    },
    { name: "Учёт по НДС", status: "info", detail: "Проверьте на портале КГД — статус плательщика НДС" },
    { name: "Лжепредприятие", status: "info", detail: "Сверьте с реестром лжепредприятий КГД" },
    { name: "Ограничение ЭСФ", status: "info", detail: "Проверьте ограничения на выписку ЭСФ" },
    { name: "Задолженность", status: "info", detail: "Проверьте налоговую задолженность на portal.kgd.gov.kz" },
  ];

  let riskLevel: "low" | "medium" | "high" | "unknown" = "low";
  if (!parsed.checksumOk) riskLevel = "high";
  else if (parsed.isVeryNew) riskLevel = "medium";

  return {
    bin,
    valid: parsed.valid,
    type: orgLabel,
    registration_date: parsed.registrationDate,
    organization_name: null as string | null,
    name_source: null as string | null,
    address: null as string | null,
    director: null as string | null,
    checks,
    risk_level: riskLevel,
    recommendations: [
      "Обязательно проверьте контрагента на портале КГД (portal.kgd.gov.kz)",
      "Сверьте наименование и статус в статистическом реестре (stat.gov.kz)",
      "Запросите учредительные документы и свидетельство о регистрации",
      "Проверьте регистрацию по НДС и ограничения по ЭСФ",
      parsed.isVeryNew
        ? "Компания зарегистрирована недавно — рекомендуется углублённая проверка."
        : "Дата регистрации по БИН выглядит типичной — дополнительно сверьте в реестрах.",
    ],
    links: buildOfficialLinks(bin),
  };
}
