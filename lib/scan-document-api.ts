// Единый клиент для /.netlify/functions/scan-document

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedData, SuggestedAction } from "@/lib/document-import";

export interface ScanApiResponse {
  success?: boolean;
  parsed?: boolean;
  data?: ScanParsedPayload | null;
  raw_text?: string;
  error?: string;
  warning?: string;
  model_used?: string;
  processing_time_ms?: number;
}

export interface ScanParsedPayload {
  document_type?: string;
  confidence?: number;
  supplier?: { name?: string; bin?: string; address?: string };
  buyer?: { name?: string; bin?: string; address?: string };
  document_date?: string;
  document_number?: string;
  items?: { name: string; quantity?: number; unit?: string; price?: number; amount?: number }[];
  vat_rate?: number;
  vat_amount?: number;
  total_amount?: number;
  currency?: string;
  raw_observation?: string;
}

export interface RecognitionResult {
  doc_type: string;
  doc_type_label: string;
  confidence: number;
  summary: string;
  data: ExtractedData;
  suggested_action: SuggestedAction;
}

const DOC_LABELS: Record<string, string> = {
  invoice: "Счёт-фактура",
  receipt: "Кассовый чек",
  delivery_note: "Накладная",
  act: "Акт выполненных работ",
  contract: "Договор",
  payment_order: "Платёжное поручение",
  other: "Документ",
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Вызов Netlify OCR */
export async function callScanDocument(
  fileBase64: string,
  fileType: string,
  fileName?: string
): Promise<ScanApiResponse> {
  const res = await fetch("/.netlify/functions/scan-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_data: fileBase64,
      file_type: fileType,
      file_name: fileName,
      // алиасы для старого кода
      fileBase64: fileBase64,
      fileType: fileType,
    }),
  });

  const text = await res.text();
  if (text.trim().startsWith("<") || text.trim().toLowerCase().startsWith("<!doctype")) {
    throw new Error("Сервер не успел ответить (таймаут). Попробуйте файл меньше или повторите через минуту.");
  }

  let data: ScanApiResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Ошибка ответа сервера (${res.status})`);
  }

  if (!res.ok || data.error) {
    throw new Error(data.error || `Ошибка распознавания (${res.status})`);
  }

  return data;
}

/** Преобразование ответа Claude → формат страницы импорта */
export function mapToRecognitionResult(payload: ScanParsedPayload): RecognitionResult {
  const docType = payload.document_type || "other";
  const label = DOC_LABELS[docType] || DOC_LABELS.other;

  const items = (payload.items || []).map((it) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.price) || 0;
    const total = Number(it.amount) || qty * price;
    return {
      name: it.name || "Позиция",
      unit: it.unit || "шт",
      quantity: qty,
      price,
      total,
    };
  });

  let totalWithVat = Number(payload.total_amount) || 0;
  const vatAmount = Number(payload.vat_amount) || 0;
  if (!totalWithVat && items.length > 0) {
    totalWithVat = items.reduce((sum, it) => sum + (it.total || 0), 0);
  }
  const totalWithoutVat =
    totalWithVat > 0 && vatAmount > 0 ? totalWithVat - vatAmount : totalWithVat;

  const data: ExtractedData = {
    doc_number: payload.document_number || null,
    doc_date: payload.document_date || null,
    seller: payload.supplier
      ? {
          name: payload.supplier.name,
          bin: payload.supplier.bin,
          address: payload.supplier.address,
        }
      : undefined,
    buyer: payload.buyer
      ? {
          name: payload.buyer.name,
          bin: payload.buyer.bin,
          address: payload.buyer.address,
        }
      : undefined,
    items,
    total_without_vat: totalWithoutVat || null,
    vat_amount: vatAmount || null,
    total_with_vat: totalWithVat || null,
    currency: payload.currency || "KZT",
    notes: payload.raw_observation,
  };

  const party = payload.supplier?.name || payload.buyer?.name || "контрагент";
  const conf = typeof payload.confidence === "number" ? payload.confidence : 0.85;
  const confPct = conf <= 1 ? Math.round(conf * 100) : Math.round(conf);

  const suggested_action: SuggestedAction = {
    type: "create_counterparty_and_entry",
    description: `Создать контрагента «${party}» и проводку поступления`,
    debit_account: "1330",
    credit_account: "3310",
    amount: totalWithVat || totalWithoutVat,
  };

  return {
    doc_type: docType,
    doc_type_label: label,
    confidence: confPct,
    summary:
      payload.raw_observation ||
      `${label} №${payload.document_number || "—"} от ${payload.document_date || "—"}, сумма ${totalWithVat.toLocaleString("ru-RU")} ₸`,
    data,
    suggested_action,
  };
}

/** Сохранение записи сканирования (совместимость колонок modal + full page) */
export async function insertScanProcessing(
  supabase: SupabaseClient,
  userId: string,
  file: { name: string; type: string; size: number }
): Promise<string | null> {
  const row: Record<string, unknown> = {
    user_id: userId,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    file_size_bytes: file.size,
    status: "processing",
  };

  const { data, error } = await supabase.from("document_scans").insert(row).select("id").single();
  if (error) {
    console.warn("document_scans insert:", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function updateScanParsed(
  supabase: SupabaseClient,
  scanId: string,
  recognition: RecognitionResult,
  meta: { model_used?: string; processing_time_ms?: number; raw_text?: string }
) {
  const extracted = recognition.data;
  const payload = {
    status: "recognized",
    document_type: recognition.doc_type,
    detected_doc_type: recognition.doc_type,
    parsed_data: {
      document_type: recognition.doc_type,
      confidence: recognition.confidence / 100,
      supplier: extracted.seller,
      buyer: extracted.buyer,
      document_date: extracted.doc_date,
      document_number: extracted.doc_number,
      items: extracted.items,
      vat_amount: extracted.vat_amount,
      total_amount: extracted.total_with_vat,
    },
    extracted_data: extracted,
    ai_summary: recognition.summary,
    confidence: recognition.confidence,
    raw_text: meta.raw_text || null,
    ai_model_used: meta.model_used || null,
    ai_processing_time_ms: meta.processing_time_ms || null,
    ai_confidence_score: recognition.confidence / 100,
    processed_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("document_scans").update(payload).eq("id", scanId);
  if (error) console.warn("document_scans update:", error.message);
}

export async function updateScanFailed(
  supabase: SupabaseClient,
  scanId: string | null,
  message: string
) {
  if (!scanId) return;
  await supabase
    .from("document_scans")
    .update({ status: "failed", error_message: message })
    .eq("id", scanId);
}
