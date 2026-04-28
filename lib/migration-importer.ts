// Импорт распарсенных данных в БД с дедупликацией и валидацией.

import { SupabaseClient } from "@supabase/supabase-js";
import type { FieldMapping } from "./migration-parser";

export interface ImportResult {
  total: number;
  successful: number;
  skipped: number;
  failed: number;
  duplicates: number;
  errors: { row: number; error: string }[];
  warnings: { row: number; warning: string }[];
  insertedIds: string[];
}

export type DuplicateStrategy = "skip" | "update" | "create_anyway";

// Преобразование значения по типу поля
function coerceValue(value: any, systemField: string): any {
  if (value === null || value === undefined || value === "") return null;
  const strVal = String(value).trim();

  // Числовые поля
  if (["amount", "salary", "purchase_price", "sale_price", "quantity", "min_stock", "vat_rate"].includes(systemField)) {
    const num = parseFloat(strVal.replace(/[^\d.,-]/g, "").replace(",", "."));
    return isNaN(num) ? null : num;
  }

  // Даты — пробуем разные форматы
  if (["entry_date", "hire_date", "doc_date"].includes(systemField)) {
    return parseDate(strVal);
  }

  // БИН — оставляем только цифры
  if (["bin", "iin"].includes(systemField)) {
    const cleaned = strVal.replace(/\D/g, "");
    return cleaned || null;
  }

  // Тип контрагента — нормализуем
  if (systemField === "counterparty_type") {
    const lower = strVal.toLowerCase();
    if (lower.includes("покупатель") || lower.includes("client") || lower.includes("клиент")) return "client";
    if (lower.includes("поставщик") || lower.includes("supplier")) return "supplier";
    return "both";
  }

  return strVal;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  
  // DD.MM.YYYY (формат 1С)
  let m = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${d}`;
  }
  
  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    return `${m[3]}-${mo}-${d}`;
  }
  
  // Excel serial date (число)
  const num = parseFloat(s);
  if (!isNaN(num) && num > 25569 && num < 60000) {
    // Excel: 25569 = 1970-01-01
    const date = new Date((num - 25569) * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }
  
  return null;
}

// Преобразование строки источника в объект для БД
function mapRow(
  row: any[],
  headers: string[],
  mappings: FieldMapping[]
): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const m of mappings) {
    let value: any = m.defaultValue;
    
    if (m.sourceField) {
      const idx = headers.indexOf(m.sourceField);
      if (idx >= 0 && row[idx] !== undefined) {
        value = row[idx];
      }
    }
    
    result[m.systemField] = coerceValue(value, m.systemField);
  }
  
  return result;
}

// ═══ ИМПОРТ КОНТРАГЕНТОВ ═══

export async function importCounterparties(
  supabase: SupabaseClient,
  userId: string,
  rows: any[][],
  headers: string[],
  mappings: FieldMapping[],
  duplicateStrategy: DuplicateStrategy = "skip",
  onProgress?: (processed: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length, successful: 0, skipped: 0, failed: 0, duplicates: 0,
    errors: [], warnings: [], insertedIds: [],
  };

  // Загружаем существующих контрагентов для проверки дублей
  const { data: existing } = await supabase
    .from("counterparties")
    .select("id, name, bin")
    .eq("user_id", userId);
  const existingByBin: Record<string, string> = {};
  const existingByName: Record<string, string> = {};
  (existing || []).forEach(e => {
    if (e.bin) existingByBin[e.bin] = e.id;
    if (e.name) existingByName[e.name.toLowerCase().trim()] = e.id;
  });

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const toInsert: any[] = [];

    for (let j = 0; j < batch.length; j++) {
      const rowIdx = i + j + 1;
      try {
        const data = mapRow(batch[j], headers, mappings);
        if (!data.name) {
          result.errors.push({ row: rowIdx, error: "Не указано наименование" });
          result.failed++;
          continue;
        }

        // Поиск дубля
        let existingId: string | null = null;
        if (data.bin && existingByBin[data.bin]) existingId = existingByBin[data.bin];
        else if (data.name && existingByName[String(data.name).toLowerCase().trim()]) {
          existingId = existingByName[String(data.name).toLowerCase().trim()];
        }

        if (existingId) {
          result.duplicates++;
          if (duplicateStrategy === "skip") {
            result.skipped++;
            continue;
          }
          if (duplicateStrategy === "update") {
            const updateData: any = { ...data };
            delete updateData.user_id;
            await supabase.from("counterparties").update(updateData).eq("id", existingId);
            result.successful++;
            continue;
          }
        }

        toInsert.push({
          user_id: userId,
          ...data,
          is_active: true,
        });
      } catch (err: any) {
        result.errors.push({ row: rowIdx, error: err.message || String(err) });
        result.failed++;
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabase.from("counterparties").insert(toInsert).select("id, name, bin");
      if (error) {
        result.failed += toInsert.length;
        result.errors.push({ row: i, error: `Batch error: ${error.message}` });
      } else if (inserted) {
        result.successful += inserted.length;
        result.insertedIds.push(...inserted.map((r: any) => r.id));
        // Обновляем кэш дублей
        inserted.forEach((c: any) => {
          if (c.bin) existingByBin[c.bin] = c.id;
          if (c.name) existingByName[c.name.toLowerCase().trim()] = c.id;
        });
      }
    }

    if (onProgress) onProgress(Math.min(i + BATCH, rows.length), rows.length);
  }

  return result;
}

// ═══ ИМПОРТ НОМЕНКЛАТУРЫ ═══

export async function importNomenclature(
  supabase: SupabaseClient,
  userId: string,
  rows: any[][],
  headers: string[],
  mappings: FieldMapping[],
  duplicateStrategy: DuplicateStrategy = "skip",
  onProgress?: (processed: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length, successful: 0, skipped: 0, failed: 0, duplicates: 0,
    errors: [], warnings: [], insertedIds: [],
  };

  const { data: existing } = await supabase.from("nomenclature").select("id, name, code").eq("user_id", userId);
  const byCode: Record<string, string> = {};
  const byName: Record<string, string> = {};
  (existing || []).forEach(e => {
    if (e.code) byCode[String(e.code)] = e.id;
    if (e.name) byName[e.name.toLowerCase().trim()] = e.id;
  });

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const toInsert: any[] = [];

    for (let j = 0; j < batch.length; j++) {
      const rowIdx = i + j + 1;
      try {
        const data = mapRow(batch[j], headers, mappings);
        if (!data.name) {
          result.errors.push({ row: rowIdx, error: "Не указано наименование" });
          result.failed++;
          continue;
        }

        let existingId: string | null = null;
        if (data.code && byCode[String(data.code)]) existingId = byCode[String(data.code)];
        else if (data.name && byName[String(data.name).toLowerCase().trim()]) {
          existingId = byName[String(data.name).toLowerCase().trim()];
        }

        if (existingId) {
          result.duplicates++;
          if (duplicateStrategy === "skip") { result.skipped++; continue; }
          if (duplicateStrategy === "update") {
            const upd: any = { ...data };
            delete upd.user_id;
            await supabase.from("nomenclature").update(upd).eq("id", existingId);
            result.successful++;
            continue;
          }
        }

        toInsert.push({ user_id: userId, ...data });
      } catch (err: any) {
        result.errors.push({ row: rowIdx, error: err.message || String(err) });
        result.failed++;
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabase.from("nomenclature").insert(toInsert).select("id");
      if (error) {
        result.failed += toInsert.length;
        result.errors.push({ row: i, error: error.message });
      } else if (inserted) {
        result.successful += inserted.length;
        result.insertedIds.push(...inserted.map((r: any) => r.id));
      }
    }

    if (onProgress) onProgress(Math.min(i + BATCH, rows.length), rows.length);
  }

  return result;
}

// ═══ ИМПОРТ СОТРУДНИКОВ ═══

export async function importEmployees(
  supabase: SupabaseClient,
  userId: string,
  rows: any[][],
  headers: string[],
  mappings: FieldMapping[],
  duplicateStrategy: DuplicateStrategy = "skip",
  onProgress?: (processed: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length, successful: 0, skipped: 0, failed: 0, duplicates: 0,
    errors: [], warnings: [], insertedIds: [],
  };

  const { data: existing } = await supabase.from("employees").select("id, full_name, iin").eq("user_id", userId);
  const byIIN: Record<string, string> = {};
  const byName: Record<string, string> = {};
  (existing || []).forEach(e => {
    if (e.iin) byIIN[e.iin] = e.id;
    if (e.full_name) byName[e.full_name.toLowerCase().trim()] = e.id;
  });

  const BATCH = 30;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const toInsert: any[] = [];

    for (let j = 0; j < batch.length; j++) {
      const rowIdx = i + j + 1;
      try {
        const data = mapRow(batch[j], headers, mappings);
        if (!data.full_name) {
          result.errors.push({ row: rowIdx, error: "Не указано ФИО" });
          result.failed++;
          continue;
        }

        let existingId: string | null = null;
        if (data.iin && byIIN[data.iin]) existingId = byIIN[data.iin];
        else if (byName[String(data.full_name).toLowerCase().trim()]) {
          existingId = byName[String(data.full_name).toLowerCase().trim()];
        }

        if (existingId) {
          result.duplicates++;
          if (duplicateStrategy === "skip") { result.skipped++; continue; }
          if (duplicateStrategy === "update") {
            const upd: any = { ...data }; delete upd.user_id;
            await supabase.from("employees").update(upd).eq("id", existingId);
            result.successful++;
            continue;
          }
        }

        toInsert.push({ user_id: userId, ...data, is_active: true });
      } catch (err: any) {
        result.errors.push({ row: rowIdx, error: err.message || String(err) });
        result.failed++;
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabase.from("employees").insert(toInsert).select("id");
      if (error) {
        result.failed += toInsert.length;
        result.errors.push({ row: i, error: error.message });
      } else if (inserted) {
        result.successful += inserted.length;
        result.insertedIds.push(...inserted.map((r: any) => r.id));
      }
    }

    if (onProgress) onProgress(Math.min(i + BATCH, rows.length), rows.length);
  }

  return result;
}

// ═══ ИМПОРТ ПРОВОДОК ═══

export async function importJournalEntries(
  supabase: SupabaseClient,
  userId: string,
  rows: any[][],
  headers: string[],
  mappings: FieldMapping[],
  onProgress?: (processed: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length, successful: 0, skipped: 0, failed: 0, duplicates: 0,
    errors: [], warnings: [], insertedIds: [],
  };

  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const toInsert: any[] = [];

    for (let j = 0; j < batch.length; j++) {
      const rowIdx = i + j + 1;
      try {
        const data = mapRow(batch[j], headers, mappings);
        if (!data.entry_date || !data.amount) {
          result.errors.push({ row: rowIdx, error: "Нет даты или суммы" });
          result.failed++;
          continue;
        }
        if (!data.debit_account || !data.credit_account) {
          result.errors.push({ row: rowIdx, error: "Нет счёта Дебет или Кредит" });
          result.failed++;
          continue;
        }

        toInsert.push({
          user_id: userId,
          entry_date: data.entry_date,
          debit_account: String(data.debit_account),
          credit_account: String(data.credit_account),
          amount: data.amount,
          description: data.description || null,
          doc_ref: data.doc_ref || null,
        });
      } catch (err: any) {
        result.errors.push({ row: rowIdx, error: err.message || String(err) });
        result.failed++;
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabase.from("journal_entries").insert(toInsert).select("id");
      if (error) {
        result.failed += toInsert.length;
        result.errors.push({ row: i, error: error.message });
      } else if (inserted) {
        result.successful += inserted.length;
        result.insertedIds.push(...inserted.map((r: any) => r.id));
      }
    }

    if (onProgress) onProgress(Math.min(i + BATCH, rows.length), rows.length);
  }

  return result;
}
