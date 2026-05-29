/**
 * Клиент Open Data API v4 (data.egov.kz)
 * @see официальная инструкция: GET /api/v4/{dataset}/{version}?source={JSON}
 * Ключ: кабинет разработчика на портале → query-параметр apiKey
 */

const BASE = "https://data.egov.kz";

export type EgovSearchSource = {
  size?: number;
  from?: number;
  query?: Record<string, unknown>;
  sort?: unknown[];
};

export function getDataEgovApiKey(): string | null {
  return process.env.DATA_EGOV_KZ_API_KEY?.trim() || null;
}

/** URL запроса v4 по инструкции */
export function buildEgovV4Url(dataset: string, version: string, source: EgovSearchSource): string | null {
  const apiKey = getDataEgovApiKey();
  if (!apiKey) return null;
  const q = encodeURIComponent(JSON.stringify(source));
  return `${BASE}/api/v4/${dataset}/${version}?source=${q}&apiKey=${encodeURIComponent(apiKey)}`;
}

function parseRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["data", "items", "results", "hits"]) {
      const v = o[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
      if (v && typeof v === "object" && Array.isArray((v as { hits?: unknown }).hits)) {
        return ((v as { hits: Record<string, unknown>[] }).hits || []).map((h) =>
          h._source && typeof h._source === "object" ? (h._source as Record<string, unknown>) : h
        );
      }
    }
  }
  return [];
}

/** Поиск по набору (пример 5 инструкции: bool → must → match) */
export async function egovV4Search(
  dataset: string,
  version: string,
  source: EgovSearchSource
): Promise<Record<string, unknown>[]> {
  const apiKey = getDataEgovApiKey();
  const url = buildEgovV4Url(dataset, version, source);
  if (!apiKey || !url) return [];

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.warn(`[data.egov] ${dataset}/${version} ${res.status}`, err.slice(0, 200));
    return [];
  }

  const data = await res.json();
  return parseRows(data);
}

/** Запрос source для точного поиска ЮЛ по БИН (ГБД ЮЛ) */
export function buildBinSearchSource(bin: string): EgovSearchSource {
  return {
    size: 1,
    query: {
      bool: {
        should: [
          { match: { bin } },
          { term: { bin } },
          { term: { "bin.keyword": bin } },
          { match_phrase: { bin } },
          { query_string: { query: bin, fields: ["bin", "bin_iin", "iin_bin", "iin"] } },
        ],
        minimum_should_match: 1,
      },
    },
  };
}

/** Набор «Регистрационные данные юридических лиц» (Минюст) */
export const GBD_UL_DATASET = "gbd_ul";

export async function searchLegalEntityByBin(bin: string): Promise<Record<string, unknown>[]> {
  const source = buildBinSearchSource(bin);
  const versions = ["v1"];

  for (const version of versions) {
    const rows = await egovV4Search(GBD_UL_DATASET, version, source);
    if (rows.length > 0) return rows;
  }

  // Расширенный набор (detailed API из документации портала)
  const detailedUrl = (() => {
    const apiKey = getDataEgovApiKey();
    if (!apiKey) return null;
    const q = encodeURIComponent(JSON.stringify(source));
    return `${BASE}/api/detailed/${GBD_UL_DATASET}/v1?source=${q}&apiKey=${encodeURIComponent(apiKey)}`;
  })();

  if (detailedUrl) {
    try {
      const res = await fetch(detailedUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return parseRows(await res.json());
    } catch {
      /* fallback */
    }
  }

  return [];
}
