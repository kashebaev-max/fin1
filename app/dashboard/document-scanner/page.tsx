"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";
import { importScannedDocument, type ExtractedData, type SuggestedAction } from "@/lib/document-import";

interface RecognitionResult {
  doc_type: string;
  doc_type_label: string;
  confidence: number;
  summary: string;
  data: ExtractedData;
  suggested_action: SuggestedAction;
}

interface ScanRecord {
  id: string;
  file_name: string;
  detected_doc_type: string | null;
  extracted_data: ExtractedData;
  ai_summary: string | null;
  confidence: number;
  status: string;
  uploaded_at: string;
  imported_at: string | null;
  related_counterparty_id: string | null;
  related_journal_entry_id: string | null;
}

const DOC_TYPE_ICONS: Record<string, string> = {
  invoice: "🧾",
  act: "📋",
  bill: "💵",
  waybill: "📦",
  receipt: "🧾",
  contract: "📑",
  other: "📄",
};

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  pending: { color: "#6B7280", label: "Ожидает" },
  processing: { color: "#3B82F6", label: "Обработка..." },
  recognized: { color: "#F59E0B", label: "Распознано" },
  confirmed: { color: "#10B981", label: "Подтверждено" },
  rejected: { color: "#6B7280", label: "Отклонено" },
  imported: { color: "#10B981", label: "Импортировано" },
  failed: { color: "#EF4444", label: "Ошибка" },
};

const ACCOUNTS_OPTIONS = [
  { v: "1010", l: "1010 Касса" },
  { v: "1030", l: "1030 Расчётный счёт" },
  { v: "1210", l: "1210 Дебиторка" },
  { v: "1310", l: "1310 Сырьё/материалы" },
  { v: "1320", l: "1320 Готовая продукция" },
  { v: "1330", l: "1330 Товары" },
  { v: "1420", l: "1420 НДС к зачёту" },
  { v: "2410", l: "2410 Основные средства" },
  { v: "3110", l: "3110 КПН" },
  { v: "3120", l: "3120 ИПН" },
  { v: "3130", l: "3130 НДС к уплате" },
  { v: "3310", l: "3310 Кредиторка" },
  { v: "3350", l: "3350 ЗП к выплате" },
  { v: "5010", l: "5010 Уставный капитал" },
  { v: "6010", l: "6010 Доход от реализации" },
  { v: "7010", l: "7010 Себестоимость" },
  { v: "7110", l: "7110 Расходы по реализации" },
  { v: "7210", l: "7210 Адм. расходы" },
  { v: "7990", l: "7990 Прочие расходы" },
];

export default function DocumentScannerPage() {
  const supabase = createClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState("");
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [tab, setTab] = useState<"upload" | "history">("upload");

  // Текущий сканируемый файл
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [currentFile, setCurrentFile] = useState<{ name: string; type: string; size: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  // Поля редактирования (если пользователь хочет поправить)
  const [editAmount, setEditAmount] = useState("0");
  const [editDate, setEditDate] = useState("");
  const [editDebit, setEditDebit] = useState("1310");
  const [editCredit, setEditCredit] = useState("3310");
  const [editDescription, setEditDescription] = useState("");

  // Импорт
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    await loadHistory(user.id);
  }

  async function loadHistory(uid: string) {
    const { data } = await supabase
      .from("document_scans")
      .select("*")
      .eq("user_id", uid)
      .order("uploaded_at", { ascending: false })
      .limit(50);
    setScans((data as ScanRecord[]) || []);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1]; // Убираем "data:..;base64,"
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file: File) {
    setError("");
    setResult(null);
    setImportResult(null);
    setScanId(null);

    if (!file) return;

    const supportedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!supportedTypes.includes(file.type)) {
      setError(`Поддерживаются: PDF, JPG, PNG, WebP. Загружен: ${file.type}`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Файл больше 10 МБ. Уменьшите размер или сожмите изображение.");
      return;
    }

    setCurrentFile({ name: file.name, type: file.type, size: file.size });

    // Превью для изображений
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }

    setUploading(true);
    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch (err) {
      setError("Не удалось прочитать файл");
      setUploading(false);
      return;
    }

    // Создаём запись о сканировании
    const { data: scan, error: scanErr } = await supabase.from("document_scans").insert({
      user_id: userId,
      file_name: file.name,
      file_type: file.type === "application/pdf" ? "pdf" : "image",
      file_size_bytes: file.size,
      status: "processing",
    }).select("id").single();

    if (scanErr || !scan) {
      setError(`Ошибка БД: ${scanErr?.message}`);
      setUploading(false);
      return;
    }
    setScanId(scan.id);
    setUploading(false);

    // Распознаём
    setRecognizing(true);
    try {
      const res = await fetch("/.netlify/functions/scan-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, fileType: file.type }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        await supabase.from("document_scans").update({
          status: "failed",
          error_message: data.error || `HTTP ${res.status}`,
        }).eq("id", scan.id);
        setError(`Ошибка распознавания: ${data.error || "неизвестная ошибка"}`);
        setRecognizing(false);
        return;
      }

      const recognition: RecognitionResult = data;
      setResult(recognition);

      // Заполняем поля редактирования
      setEditAmount(String(recognition.data.total_with_vat || recognition.data.total_without_vat || recognition.suggested_action?.amount || 0));
      setEditDate(recognition.data.doc_date || new Date().toISOString().slice(0, 10));
      setEditDebit(recognition.suggested_action?.debit_account || "1310");
      setEditCredit(recognition.suggested_action?.credit_account || "3310");
      setEditDescription(`${recognition.doc_type_label}: ${recognition.data.seller?.name || recognition.data.buyer?.name || ""}` + (recognition.data.doc_number ? ` ${recognition.data.doc_number}` : ""));

      // Сохраняем результат
      await supabase.from("document_scans").update({
        status: "recognized",
        detected_doc_type: recognition.doc_type,
        extracted_data: recognition.data as any,
        ai_summary: recognition.summary,
        confidence: recognition.confidence,
        processed_at: new Date().toISOString(),
      }).eq("id", scan.id);

    } catch (err: any) {
      await supabase.from("document_scans").update({
        status: "failed",
        error_message: err.message || String(err),
      }).eq("id", scan.id);
      setError(`Ошибка: ${err.message || err}`);
    } finally {
      setRecognizing(false);
    }
  }

  async function handleImport() {
    if (!result || !scanId) return;
    setImporting(true);
    setImportResult(null);

    const importRes = await importScannedDocument(supabase, userId, scanId, result.data, result.suggested_action, {
      counterpartyRole: "auto",
      createJournalEntry: true,
      overrideAmount: Number(editAmount),
      overrideDate: editDate,
      overrideDebitAccount: editDebit,
      overrideCreditAccount: editCredit,
      overrideDescription: editDescription,
    });

    setImportResult({ success: importRes.success, message: importRes.message });
    setImporting(false);
    await loadHistory(userId);
  }

  function reset() {
    setCurrentFile(null);
    setPreviewUrl(null);
    setResult(null);
    setScanId(null);
    setError("");
    setImportResult(null);
    setEditAmount("0");
    setEditDate("");
    setEditDescription("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Drag & Drop handlers
  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Жанара читает PDF и фото документов: счета-фактуры, акты, накладные, чеки. Извлекает контрагента, суммы, НДС — и одним кликом создаёт проводку и контрагента в системе.
      </div>

      <div className="flex gap-2">
        {([
          ["upload", "📄 Загрузить документ"],
          ["history", `📋 История (${scans.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ЗАГРУЗКА ═══ */}
      {tab === "upload" && (
        <>
          {!result && !currentFile && (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl p-12 text-center cursor-pointer transition-all"
              style={{
                background: dragActive ? "#A855F710" : "var(--card)",
                border: `2px dashed ${dragActive ? "#A855F7" : "var(--brd)"}`,
              }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>📄✦</div>
              <div className="text-sm font-bold mb-2">
                {dragActive ? "Отпустите файл" : "Перетащите документ сюда"}
              </div>
              <div className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>
                или нажмите чтобы выбрать
              </div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                Поддерживаются: PDF, JPG, PNG, WebP · до 10 МБ<br/>
                Жанара распознает счёт-фактуру, акт, накладную, чек, договор
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                style={{ display: "none" }}
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl p-4" style={{ background: "#EF444420", color: "#EF4444", border: "1px solid #EF444440" }}>
              <div className="text-sm font-semibold">❌ {error}</div>
              <button onClick={reset} className="mt-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer border-none" style={{ background: "var(--card)", color: "var(--t2)" }}>
                Попробовать снова
              </button>
            </div>
          )}

          {currentFile && !result && (uploading || recognizing) && (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{recognizing ? "🤔" : "📤"}</div>
              <div className="text-sm font-bold mb-1">
                {uploading && "Загружаю файл..."}
                {recognizing && "Жанара читает документ..."}
              </div>
              <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                {currentFile.name} · {(currentFile.size / 1024).toFixed(1)} КБ
              </div>
              {recognizing && (
                <div className="text-[10px] mt-3" style={{ color: "var(--t3)" }}>
                  Это занимает 5-15 секунд...
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* ═══ ЛЕВАЯ ЧАСТЬ — превью + распознанные данные ═══ */}
              <div className="flex flex-col gap-4">

                {/* Превью файла */}
                {previewUrl && (
                  <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                    <div className="text-[10px] p-2 font-semibold" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                      Загруженный файл
                    </div>
                    <img src={previewUrl} alt={currentFile?.name} style={{ maxWidth: "100%", maxHeight: 400, display: "block", margin: "0 auto" }} />
                  </div>
                )}

                {!previewUrl && currentFile && (
                  <div className="rounded-xl p-6 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                    <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
                    <div className="text-[12px] font-bold">{currentFile.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>{(currentFile.size / 1024).toFixed(1)} КБ · PDF</div>
                  </div>
                )}

                {/* Что нашла Жанара */}
                <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #A855F710, #6366F110)", border: "1px solid #A855F730" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ fontSize: 18 }}>{DOC_TYPE_ICONS[result.doc_type] || "📄"}</span>
                    <div className="flex-1">
                      <div className="text-[12px] font-bold" style={{ color: "#A855F7" }}>{result.doc_type_label}</div>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                        Уверенность: {result.confidence}% {result.confidence >= 90 ? "✓" : result.confidence >= 70 ? "⚠" : "🔴"}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--t2)", lineHeight: 1.5 }}>
                    ✦ {result.summary}
                  </div>
                </div>

                {/* Распознанные данные */}
                <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="text-[12px] font-bold mb-3">📋 Распознанные данные</div>

                  <div className="flex flex-col gap-2 text-[11px]">
                    {result.data.doc_number && (
                      <div className="flex justify-between">
                        <span style={{ color: "var(--t3)" }}>Номер:</span>
                        <span className="font-semibold">{result.data.doc_number}</span>
                      </div>
                    )}
                    {result.data.doc_date && (
                      <div className="flex justify-between">
                        <span style={{ color: "var(--t3)" }}>Дата:</span>
                        <span className="font-semibold">{result.data.doc_date}</span>
                      </div>
                    )}

                    {result.data.seller?.name && (
                      <div className="rounded-lg p-2 mt-1" style={{ background: "var(--bg)" }}>
                        <div className="text-[9px] mb-1 font-bold uppercase" style={{ color: "#10B981" }}>📤 Продавец</div>
                        <div className="font-semibold">{result.data.seller.name}</div>
                        {result.data.seller.bin && <div style={{ color: "var(--t3)" }}>БИН: {result.data.seller.bin}</div>}
                        {result.data.seller.address && <div style={{ color: "var(--t3)" }}>{result.data.seller.address}</div>}
                      </div>
                    )}

                    {result.data.buyer?.name && (
                      <div className="rounded-lg p-2" style={{ background: "var(--bg)" }}>
                        <div className="text-[9px] mb-1 font-bold uppercase" style={{ color: "#3B82F6" }}>📥 Покупатель</div>
                        <div className="font-semibold">{result.data.buyer.name}</div>
                        {result.data.buyer.bin && <div style={{ color: "var(--t3)" }}>БИН: {result.data.buyer.bin}</div>}
                      </div>
                    )}

                    {result.data.items && result.data.items.length > 0 && (
                      <div className="mt-1">
                        <div className="text-[9px] mb-1 font-bold uppercase" style={{ color: "var(--t3)" }}>📦 Позиции ({result.data.items.length})</div>
                        <div className="rounded-lg" style={{ background: "var(--bg)" }}>
                          {result.data.items.slice(0, 5).map((item, i) => (
                            <div key={i} className="flex justify-between p-2 text-[10px]" style={{ borderBottom: i < Math.min(result.data.items!.length, 5) - 1 ? "1px solid var(--brd)" : "none" }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                              <span className="font-semibold ml-2">{item.quantity || 1} × {fmtMoney(item.price || 0)} = {fmtMoney(item.total || 0)} ₸</span>
                            </div>
                          ))}
                          {result.data.items.length > 5 && (
                            <div className="p-2 text-[10px] text-center" style={{ color: "var(--t3)" }}>
                              ... и ещё {result.data.items.length - 5}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg p-2 mt-1" style={{ background: "var(--accent-dim)" }}>
                      {result.data.total_without_vat !== undefined && result.data.total_without_vat !== null && (
                        <div className="flex justify-between">
                          <span style={{ color: "var(--t3)" }}>Без НДС:</span>
                          <span className="font-semibold">{fmtMoney(result.data.total_without_vat)} ₸</span>
                        </div>
                      )}
                      {result.data.vat_amount !== undefined && result.data.vat_amount !== null && (
                        <div className="flex justify-between">
                          <span style={{ color: "var(--t3)" }}>НДС:</span>
                          <span className="font-semibold">{fmtMoney(result.data.vat_amount)} ₸</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold mt-1 pt-1" style={{ borderTop: "1px solid var(--brd)" }}>
                        <span>ИТОГО:</span>
                        <span style={{ color: "var(--accent)" }}>{fmtMoney(result.data.total_with_vat || 0)} ₸</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ═══ ПРАВАЯ ЧАСТЬ — что импортировать ═══ */}
              <div className="flex flex-col gap-4">

                <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="text-[12px] font-bold mb-1">✨ Жанара предлагает</div>
                  <div className="text-[11px] mb-3" style={{ color: "var(--t2)" }}>
                    {result.suggested_action.description}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>Дата</label>
                      <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>Сумма ₸</label>
                      <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>Дебет</label>
                      <select value={editDebit} onChange={e => setEditDebit(e.target.value)}>
                        {ACCOUNTS_OPTIONS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>Кредит</label>
                      <select value={editCredit} onChange={e => setEditCredit(e.target.value)}>
                        {ACCOUNTS_OPTIONS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                      </select>
                    </div>
                  </div>

                  <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>Описание</label>
                  <input value={editDescription} onChange={e => setEditDescription(e.target.value)} className="mb-3" />

                  <div className="rounded-lg p-3 text-[11px]" style={{ background: "var(--bg)" }}>
                    <div className="font-bold mb-1">Будет создано:</div>
                    <div>✓ Контрагент «{result.data.seller?.name || result.data.buyer?.name}» (если ещё нет в базе)</div>
                    <div>✓ Проводка Дт {editDebit} Кт {editCredit} на {fmtMoney(Number(editAmount))} ₸</div>
                  </div>
                </div>

                {!importResult && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      disabled={importing || !editAmount || Number(editAmount) <= 0}
                      className="flex-1 cursor-pointer rounded-lg border-none font-semibold"
                      style={{ padding: "12px", background: "linear-gradient(135deg, #A855F7, #6366F1)", color: "#fff", fontSize: 13, opacity: importing ? 0.5 : 1 }}>
                      {importing ? "Импортирую..." : "✦ Импортировать в систему"}
                    </button>
                    <button onClick={reset} className="cursor-pointer rounded-lg border-none" style={{ padding: "12px 16px", background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)", fontSize: 12 }}>
                      Отмена
                    </button>
                  </div>
                )}

                {importResult && (
                  <div className="rounded-xl p-4" style={{
                    background: importResult.success ? "#10B98115" : "#EF444415",
                    border: `1px solid ${importResult.success ? "#10B98140" : "#EF444440"}`,
                  }}>
                    <div className="text-sm font-bold mb-1" style={{ color: importResult.success ? "#10B981" : "#EF4444" }}>
                      {importResult.success ? "✅ Импорт выполнен" : "❌ Ошибка импорта"}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--t2)" }}>{importResult.message}</div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => router.push("/dashboard/accounting")} className="px-3 py-1.5 rounded-lg text-xs cursor-pointer border-none" style={{ background: "var(--accent)", color: "#fff" }}>
                        Открыть журнал проводок
                      </button>
                      <button onClick={reset} className="px-3 py-1.5 rounded-lg text-xs cursor-pointer border-none" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                        Загрузить ещё документ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "history" && (
        <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          {scans.length === 0 ? (
            <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              История пуста. Загрузите первый документ.
            </div>
          ) : (
            scans.map((s, i) => {
              const status = STATUS_STYLES[s.status] || STATUS_STYLES.pending;
              const docIcon = DOC_TYPE_ICONS[s.detected_doc_type || "other"] || "📄";
              return (
                <div key={s.id} style={{
                  padding: "14px 18px",
                  borderBottom: i < scans.length - 1 ? "1px solid var(--brd)" : "none",
                  borderLeft: `3px solid ${status.color}`,
                }}>
                  <div className="flex items-start gap-3">
                    <span style={{ fontSize: 22 }}>{docIcon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[12px] font-bold">{s.file_name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: status.color + "20", color: status.color }}>
                          {status.label}
                        </span>
                        {s.confidence > 0 && (
                          <span className="text-[9px]" style={{ color: "var(--t3)" }}>{s.confidence}%</span>
                        )}
                      </div>
                      {s.ai_summary && (
                        <div className="text-[10px] mb-1" style={{ color: "var(--t2)" }}>{s.ai_summary}</div>
                      )}
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                        {new Date(s.uploaded_at).toLocaleString("ru-RU")}
                        {s.extracted_data?.total_with_vat && ` · ${fmtMoney(s.extracted_data.total_with_vat)} ₸`}
                        {s.imported_at && " · ✓ импортировано"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Как работает:</b> Жанара использует AI Vision (тот же Claude API) — читает документ как человек, понимает структуру. Работает с PDF, фото, скринами.<br/>
        💡 <b>Что распознаёт:</b> счета-фактуры РК, акты выполненных работ, накладные, чеки, договоры. Точность 90%+ для качественных документов.<br/>
        💡 <b>Безопасность:</b> Жанара ничего не делает без вашего подтверждения. Вы видите все данные перед импортом и можете их изменить.<br/>
        💡 <b>Дубликаты:</b> если контрагент уже есть в базе (по БИН или имени) — он не дублируется.
      </div>
    </div>
  );
}
