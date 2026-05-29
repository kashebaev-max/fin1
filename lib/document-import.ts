// Импорт распознанных Жанарой данных в систему.
// На вход — extracted_data, на выход — созданные сущности.

import { SupabaseClient } from "@supabase/supabase-js";

export interface ExtractedData {
  doc_number?: string | null;
  doc_date?: string | null;
  seller?: { name?: string; bin?: string; address?: string; iik?: string; bank?: string };
  buyer?: { name?: string; bin?: string; address?: string };
  items?: { name: string; unit?: string; quantity?: number; price?: number; total?: number; vat_rate?: number; vat_amount?: number }[];
  total_without_vat?: number | null;
  vat_amount?: number | null;
  total_with_vat?: number | null;
  currency?: string;
  payment_terms?: string;
  purpose?: string;
  notes?: string;
}

export interface SuggestedAction {
  type: "create_journal_entry" | "create_counterparty_and_entry" | "create_payment" | "none";
  description: string;
  debit_account?: string;
  credit_account?: string;
  amount?: number;
}

export interface ImportResult {
  success: boolean;
  message: string;
  counterpartyId?: string;
  counterpartyCreated?: boolean;
  journalEntryId?: string;
  errors?: string[];
}

interface ImportOptions {
  // Какую сторону документа использовать как контрагента
  // "seller" — мы покупатели, контрагент = продавец
  // "buyer" — мы продавцы, контрагент = покупатель
  // "auto" — определить автоматически (по совпадению с нашим БИН)
  counterpartyRole?: "seller" | "buyer" | "auto";
  
  // Создавать ли проводку
  createJournalEntry?: boolean;
  
  // Переопределить параметры проводки
  overrideAmount?: number;
  overrideDate?: string;
  overrideDescription?: string;
  overrideDebitAccount?: string;
  overrideCreditAccount?: string;
}

// ═══ Поиск контрагента по БИН/имени ═══

async function findOrCreateCounterparty(
  supabase: SupabaseClient,
  userId: string,
  data: { name?: string; bin?: string; address?: string; iik?: string; bank?: string },
  type: "client" | "supplier"
): Promise<{ id: string; created: boolean; error?: string }> {
  if (!data.name) return { id: "", created: false, error: "Нет наименования контрагента" };

  // Сначала ищем по БИН (если есть)
  if (data.bin) {
    const { data: byBin } = await supabase
      .from("counterparties")
      .select("id")
      .eq("user_id", userId)
      .eq("bin", data.bin)
      .maybeSingle();
    if (byBin?.id) return { id: byBin.id, created: false };
  }

  // Если БИН не найден — ищем по имени (нечётко)
  const { data: byName } = await supabase
    .from("counterparties")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", `%${data.name.trim()}%`)
    .limit(1);
  if (byName && byName.length > 0) return { id: byName[0].id, created: false };

  // Не нашли — создаём
  const { data: created, error } = await supabase
    .from("counterparties")
    .insert({
      user_id: userId,
      name: data.name,
      bin: data.bin || null,
      counterparty_type: type,
      address: data.address || null,
      bank_account: data.iik || null,
      bank_name: data.bank || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { id: "", created: false, error: error?.message || "Не удалось создать контрагента" };
  }
  return { id: created.id, created: true };
}

// ═══ Главная функция импорта ═══

export async function importScannedDocument(
  supabase: SupabaseClient,
  userId: string,
  scanId: string,
  extractedData: ExtractedData,
  suggestedAction: SuggestedAction | null,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const errors: string[] = [];
  
  // Получаем профиль чтобы определить нашу роль
  const { data: profile } = await supabase.from("profiles").select("bin").eq("id", userId).single();
  const ourBin = profile?.bin;

  // Определяем кого создавать как контрагента
  let role: "seller" | "buyer" = options.counterpartyRole === "buyer" ? "buyer" : "seller";
  if (options.counterpartyRole === "auto" && ourBin) {
    // Если наш БИН — это продавец, значит контрагент — покупатель
    if (extractedData.seller?.bin === ourBin) role = "buyer";
    else role = "seller";
  }

  const counterpartyData = role === "seller" ? extractedData.seller : extractedData.buyer;
  const counterpartyType = role === "seller" ? "supplier" : "client";

  if (!counterpartyData?.name) {
    errors.push("В документе не найдено наименование контрагента");
    return { success: false, message: errors.join("; "), errors };
  }

  // Создаём/находим контрагента
  const cpResult = await findOrCreateCounterparty(supabase, userId, counterpartyData, counterpartyType);
  if (!cpResult.id) {
    errors.push(cpResult.error || "Ошибка работы с контрагентом");
    return { success: false, message: errors.join("; "), errors };
  }

  let journalEntryId: string | undefined;

  // Создаём проводку если нужно
  if (options.createJournalEntry !== false) {
    const amount = options.overrideAmount ?? extractedData.total_with_vat ?? extractedData.total_without_vat ?? 0;
    const date = options.overrideDate ?? extractedData.doc_date ?? new Date().toISOString().slice(0, 10);

    if (amount <= 0) {
      errors.push("Не определена сумма для проводки");
    } else {
      // Определяем счета по умолчанию
      let debit = options.overrideDebitAccount;
      let credit = options.overrideCreditAccount;

      if (!debit || !credit) {
        if (suggestedAction?.debit_account && suggestedAction?.credit_account) {
          debit = debit || suggestedAction.debit_account;
          credit = credit || suggestedAction.credit_account;
        } else if (role === "seller") {
          // Мы покупатели: получили товар/услугу от поставщика
          debit = debit || "1310"; // запасы (можно уточнять)
          credit = credit || "3310"; // кредиторка
        } else {
          // Мы продавцы: продали клиенту
          debit = debit || "1210"; // дебиторка
          credit = credit || "6010"; // выручка
        }
      }

      const description = options.overrideDescription ||
        `${suggestedAction?.description || "Документ"}: ${counterpartyData.name}` +
        (extractedData.doc_number ? ` (${extractedData.doc_number})` : "");

      const { data: entry, error } = await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: date,
        debit_account: String(debit),
        credit_account: String(credit),
        amount: Number(amount),
        description,
        doc_ref: extractedData.doc_number || null,
      }).select("id").single();

      if (error) {
        errors.push(`Ошибка создания проводки: ${error.message}`);
      } else {
        journalEntryId = entry?.id;
      }
    }
  }

  // Обновляем запись о сканировании
  await supabase.from("document_scans").update({
    status: "imported",
    related_counterparty_id: cpResult.id,
    related_journal_entry_id: journalEntryId || null,
    imported_at: new Date().toISOString(),
  }).eq("id", scanId);

  if (errors.length > 0 && !journalEntryId) {
    return {
      success: false,
      message: errors.join("; "),
      counterpartyId: cpResult.id,
      counterpartyCreated: cpResult.created,
      errors,
    };
  }

  const parts: string[] = [];
  if (cpResult.created) parts.push(`✓ Создан контрагент «${counterpartyData.name}»`);
  else parts.push(`✓ Найден контрагент «${counterpartyData.name}»`);
  if (journalEntryId) parts.push(`✓ Создана проводка`);

  return {
    success: true,
    message: parts.join(" · "),
    counterpartyId: cpResult.id,
    counterpartyCreated: cpResult.created,
    journalEntryId,
    errors: errors.length > 0 ? errors : undefined,
  };
}
