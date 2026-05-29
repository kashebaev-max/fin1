import { createServerSupabase } from "@/lib/supabase-server";
import { createServiceSupabase } from "@/lib/supabase-admin";
import { getDataEgovApiKey, searchLegalEntityByBin } from "@/lib/data-egov-kz";

export type BinNameLookup = {
  organization_name: string | null;
  name_source: string | null;
  address: string | null;
  director: string | null;
};

const EMPTY: BinNameLookup = {
  organization_name: null,
  name_source: null,
  address: null,
  director: null,
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseGbdUlRecord(row: Record<string, unknown>): BinNameLookup {
  const organization_name = pickString(row, [
    "nameru",
    "name_ru",
    "nameRu",
    "fullname",
    "full_name_ru",
    "name",
    "organization_name",
    "name_kz",
    "namekz",
    "namekz_full",
  ]);
  const address = pickString(row, [
    "addressru",
    "address_ru",
    "address",
    "legal_address",
    "jur_address",
    "addresskz",
  ]);
  const director = pickString(row, [
    "director",
    "head_name",
    "chairman",
    "fio_head",
    "head_fio",
    "fio",
    "rukovoditel",
  ]);
  if (!organization_name) return EMPTY;
  return {
    organization_name,
    name_source: "Гос. реестр (data.egov.kz / gbd_ul)",
    address,
    director,
  };
}

async function lookupFromCache(bin: string): Promise<BinNameLookup> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("bin_registry_cache")
      .select("organization_name, name_source, address, director")
      .eq("bin", bin)
      .maybeSingle();

    if (data?.organization_name) {
      return {
        organization_name: data.organization_name,
        name_source: data.name_source || "Кэш реестра Finstat",
        address: data.address || null,
        director: data.director || null,
      };
    }
  } catch {
    /* таблица ещё не создана */
  }
  return EMPTY;
}

async function saveToCache(bin: string, info: BinNameLookup): Promise<void> {
  if (!info.organization_name) return;
  const admin = createServiceSupabase();
  if (!admin) return;
  try {
    await admin.from("bin_registry_cache").upsert({
      bin,
      organization_name: info.organization_name,
      name_source: info.name_source,
      address: info.address,
      director: info.director,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* не критично */
  }
}

/** ГБД ЮЛ через Open Data API v4 (ключ: data.egov.kz → Разработчикам → Кабинет) */
async function lookupFromDataEgov(bin: string): Promise<BinNameLookup> {
  if (!getDataEgovApiKey()) return EMPTY;

  try {
    const rows = await searchLegalEntityByBin(bin);
    for (const row of rows) {
      const parsed = parseGbdUlRecord(row);
      if (parsed.organization_name) return parsed;
    }
  } catch (e) {
    console.warn("[bin-name-lookup] data.egov.kz", e);
  }
  return EMPTY;
}

async function lookupFromUchetPk(bin: string): Promise<BinNameLookup> {
  const token = process.env.UCHET_PK_API_TOKEN?.trim();
  if (!token) return EMPTY;

  try {
    const url = `https://pk.uchet.kz/api/v2/get_bin_info/?token=${encodeURIComponent(token)}&bin=${bin}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Record<string, unknown>;
    if (data.detail && typeof data.detail === "object") return EMPTY;

    const organization_name = pickString(data, ["name_ru", "name_kz", "full_name_ru"]);
    if (!organization_name) return EMPTY;

    return {
      organization_name,
      name_source: "Реестр (Учёт.ПК)",
      address: pickString(data, ["address_ru", "address_kz"]),
      director: pickString(data, ["head_fullname", "head_name"]),
    };
  } catch {
    return EMPTY;
  }
}

async function lookupFromUserDatabase(bin: string, userId: string): Promise<BinNameLookup> {
  const supabase = await createServerSupabase();

  const { data: cp } = await supabase
    .from("counterparties")
    .select("name, legal_address, director_name")
    .eq("user_id", userId)
    .eq("bin", bin)
    .limit(1)
    .maybeSingle();

  if (cp?.name) {
    return {
      organization_name: cp.name,
      name_source: "Ваш справочник контрагентов",
      address: cp.legal_address || null,
      director: cp.director_name || null,
    };
  }

  const { data: company } = await supabase
    .from("user_companies")
    .select("company_name, legal_address, director_name")
    .eq("user_id", userId)
    .eq("bin", bin)
    .limit(1)
    .maybeSingle();

  if (company?.company_name) {
    return {
      organization_name: company.company_name,
      name_source: "Ваша организация в Finstat",
      address: company.legal_address || null,
      director: company.director_name || null,
    };
  }

  return EMPTY;
}

export async function lookupOrganizationByBin(bin: string, userId?: string | null): Promise<BinNameLookup> {
  if (userId) {
    const local = await lookupFromUserDatabase(bin, userId);
    if (local.organization_name) return local;
  }

  const cached = await lookupFromCache(bin);
  if (cached.organization_name) return cached;

  const egov = await lookupFromDataEgov(bin);
  if (egov.organization_name) {
    await saveToCache(bin, egov);
    return egov;
  }

  const uchet = await lookupFromUchetPk(bin);
  if (uchet.organization_name) {
    await saveToCache(bin, uchet);
    return uchet;
  }

  return EMPTY;
}
