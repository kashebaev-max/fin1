"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { importScannedDocument } from "@/lib/document-import";
import {
  callScanDocument,
  fileToBase64,
  insertScanProcessing,
  mapToRecognitionResult,
  updateScanFailed,
  updateScanParsed,
} from "@/lib/scan-document-api";
import { useReadOnlyOptional } from "@/lib/read-only-context";

// Типы документов с иконками
const DOC_TYPES: Record<string, { name: string; icon: string; color: string }> = {
  invoice: { name: "Счёт-фактура", icon: "📋", color: "#A855F7" },
  receipt: { name: "Кассовый чек", icon: "🧾", color: "#10B981" },
  delivery_note: { name: "Накладная", icon: "📦", color: "#F59E0B" },
  act: { name: "Акт", icon: "📄", color: "#6366F1" },
  contract: { name: "Договор", icon: "📜", color: "#EC4899" },
  payment_order: { name: "Платёжное поручение", icon: "💰", color: "#10B981" },
  other: { name: "Документ", icon: "📄", color: "#6B7280" },
};

interface ScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (parsedData: any) => void;
}

export default function DocumentScanner({ isOpen, onClose, onSuccess }: ScannerProps) {
  const router = useRouter();
  const supabase = createClient();
  const readOnly = useReadOnlyOptional();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<"select" | "preview" | "scanning" | "result" | "creating" | "error">("select");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>("");
  const [parsedData, setParsedData] = useState<any>(null);
  const [error, setError] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!isOpen) return null;

  function reset() {
    setStep("select");
    setSelectedFile(null);
    setFilePreview("");
    setParsedData(null);
    setError("");
    setScanId(null);
    setCreating(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Файл больше 5 МБ. Пожалуйста, сожмите изображение.");
      setStep("error");
      return;
    }

    setSelectedFile(file);
    
    // Превью только для изображений
    if (file.type.indexOf("image/") === 0) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview("");
    }
    
    setStep("preview");
  }

  async function startScan() {
    if (!selectedFile) return;

    setStep("scanning");
    setError("");

    try {
      const base64 = await fileToBase64(selectedFile);
      const api = await callScanDocument(base64, selectedFile.type, selectedFile.name);

      const { data: { user } } = await supabase.auth.getUser();
      let recordId: string | null = null;

      if (user) {
        recordId = await insertScanProcessing(supabase, user.id, {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
        });
        setScanId(recordId);
      }

      if (!api.parsed || !api.data) {
        await updateScanFailed(
          supabase,
          recordId,
          api.warning || "Структурированные данные не извлечены"
        );
        setError(
          api.warning ||
            "Не удалось извлечь данные. Сделайте фото чётче или загрузите PDF лучшего качества."
        );
        setStep("error");
        return;
      }

      const recognition = mapToRecognitionResult(api.data);
      if (user && recordId) {
        await updateScanParsed(supabase, recordId, recognition, {
          model_used: api.model_used,
          processing_time_ms: api.processing_time_ms,
          raw_text: api.raw_text,
        });
      }

      setParsedData({
        document_type: recognition.doc_type,
        confidence: recognition.confidence / 100,
        supplier: recognition.data.seller,
        buyer: recognition.data.buyer,
        document_date: recognition.data.doc_date,
        document_number: recognition.data.doc_number,
        items: recognition.data.items?.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          price: it.price,
          amount: it.total,
        })),
        vat_rate: 16,
        vat_amount: recognition.data.vat_amount,
        total_amount: recognition.data.total_with_vat,
        raw_observation: recognition.summary,
      });
      setStep("result");
    } catch (err: unknown) {
      setError("Ошибка: " + (err instanceof Error ? err.message : String(err)));
      setStep("error");
    }
  }

  async function createInSystem() {
    if (!parsedData) return;
    if (readOnly?.isReadOnly && !readOnly.ensureCanWrite()) return;

    setCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");
      if (!scanId) throw new Error("Запись сканирования не найдена");

      const recognition = mapToRecognitionResult({
        document_type: parsedData.document_type,
        confidence: parsedData.confidence,
        supplier: parsedData.supplier,
        buyer: parsedData.buyer,
        document_date: parsedData.document_date,
        document_number: parsedData.document_number,
        items: parsedData.items,
        vat_rate: parsedData.vat_rate,
        vat_amount: parsedData.vat_amount,
        total_amount: parsedData.total_amount,
        raw_observation: parsedData.raw_observation,
      });

      const importRes = await importScannedDocument(
        supabase,
        user.id,
        scanId,
        recognition.data,
        recognition.suggested_action,
        { counterpartyRole: "auto", createJournalEntry: true }
      );

      if (!importRes.success) {
        throw new Error(importRes.message);
      }

      if (onSuccess) onSuccess({ parsedData, importRes });
      alert(`✅ ${importRes.message}`);
      handleClose();
    } catch (err: unknown) {
      setError("Ошибка создания: " + (err instanceof Error ? err.message : String(err)));
      setStep("error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={handleClose}>
      <div onClick={e => e.stopPropagation()}
        className="rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto"
        style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        
        {/* Шапка */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--brd)" }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 24 }}>📸</span>
            <div>
              <div className="font-bold text-base">Сканер документов</div>
              <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                AI распознаёт и создаёт записи в системе
              </div>
            </div>
          </div>
          <button onClick={handleClose}
            className="text-[20px] cursor-pointer border-none"
            style={{ background: "transparent", color: "var(--t3)" }}>×</button>
        </div>

        {/* Контент */}
        <div className="p-5">
          {/* Шаг 1: Выбор файла */}
          {step === "select" && (
            <div className="flex flex-col gap-3">
              <div className="text-center mb-2 text-[12px]" style={{ color: "var(--t2)" }}>
                Загрузите фото или PDF документа — AI Жанара распознает и предложит создать в системе
              </div>

              <button onClick={() => cameraInputRef.current?.click()}
                className="rounded-xl p-5 cursor-pointer text-left flex items-center gap-3"
                style={{
                  background: "linear-gradient(135deg, #A855F7, #6366F1)",
                  color: "#fff",
                  border: "none",
                }}>
                <span style={{ fontSize: 32 }}>📷</span>
                <div>
                  <div className="font-bold text-base">Сфотографировать</div>
                  <div className="text-[11px] opacity-80">Камера телефона</div>
                </div>
              </button>

              <button onClick={() => fileInputRef.current?.click()}
                className="rounded-xl p-5 cursor-pointer text-left flex items-center gap-3"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--brd)",
                  color: "var(--t1)",
                }}>
                <span style={{ fontSize: 32 }}>📁</span>
                <div>
                  <div className="font-bold text-base">Загрузить файл</div>
                  <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                    JPG, PNG, PDF — до 5 МБ
                  </div>
                </div>
              </button>

              <input ref={fileInputRef} type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileSelect} style={{ display: "none" }} />
              
              <input ref={cameraInputRef} type="file"
                accept="image/*" capture="environment"
                onChange={handleFileSelect} style={{ display: "none" }} />

              <div className="text-[10px] text-center mt-2" style={{ color: "var(--t3)" }}>
                💡 Поддерживается: счёт-фактура, чек, накладная, акт, договор, платёжка
              </div>
            </div>
          )}

          {/* Шаг 2: Превью + кнопка распознавания */}
          {step === "preview" && selectedFile && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                <div className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Файл:</div>
                <div className="font-semibold text-sm mb-1">{selectedFile.name}</div>
                <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                  {(selectedFile.size / 1024).toFixed(1)} КБ · {selectedFile.type}
                </div>
              </div>

              {filePreview && (
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--brd)" }}>
                  <img src={filePreview} alt="Preview" style={{ width: "100%", maxHeight: 400, objectFit: "contain" }} />
                </div>
              )}

              {!filePreview && selectedFile.type === "application/pdf" && (
                <div className="rounded-lg p-8 text-center" style={{ background: "var(--bg)" }}>
                  <div style={{ fontSize: 48 }}>📄</div>
                  <div className="text-[12px] mt-2" style={{ color: "var(--t3)" }}>PDF файл готов к распознаванию</div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { reset(); }}
                  className="flex-1 py-2.5 rounded-lg cursor-pointer font-semibold text-[12px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                  ← Выбрать другой
                </button>
                <button onClick={startScan}
                  className="flex-1 py-2.5 rounded-lg cursor-pointer font-bold text-[12px]"
                  style={{ background: "linear-gradient(135deg, #A855F7, #6366F1)", color: "#fff", border: "none" }}>
                  ✦ Распознать AI
                </button>
              </div>
            </div>
          )}

          {/* Шаг 3: Сканирование */}
          {step === "scanning" && (
            <div className="text-center py-12">
              <div style={{ fontSize: 64 }} className="animate-pulse">✦</div>
              <div className="mt-4 text-base font-bold">Жанара распознаёт документ...</div>
              <div className="mt-2 text-[12px]" style={{ color: "var(--t3)" }}>
                Это займёт 5-15 секунд
              </div>
              <div className="mt-3 inline-flex items-center gap-1">
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#A855F7", animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#6366F1", animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#A855F7", animationDelay: "300ms" }}></div>
              </div>
            </div>
          )}

          {/* Шаг 4: Результат */}
          {step === "result" && parsedData && (
            <div className="flex flex-col gap-3">
              {/* Тип документа */}
              {parsedData.document_type && DOC_TYPES[parsedData.document_type] && (
                <div className="rounded-lg p-3 flex items-center gap-3"
                  style={{ background: DOC_TYPES[parsedData.document_type].color + "15", border: `1px solid ${DOC_TYPES[parsedData.document_type].color}40` }}>
                  <span style={{ fontSize: 28 }}>{DOC_TYPES[parsedData.document_type].icon}</span>
                  <div>
                    <div className="font-bold" style={{ color: DOC_TYPES[parsedData.document_type].color }}>
                      {DOC_TYPES[parsedData.document_type].name}
                    </div>
                    {parsedData.confidence && (
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                        Уверенность AI: {Math.round(parsedData.confidence * 100)}%
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Поставщик */}
              {parsedData.supplier && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                  <div className="text-[10px] font-bold mb-1" style={{ color: "var(--t3)" }}>ПОСТАВЩИК</div>
                  <div className="font-semibold text-sm">{parsedData.supplier.name || "—"}</div>
                  {parsedData.supplier.bin && (
                    <div className="text-[11px]" style={{ color: "var(--t3)" }}>БИН: {parsedData.supplier.bin}</div>
                  )}
                  {parsedData.supplier.address && (
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>{parsedData.supplier.address}</div>
                  )}
                </div>
              )}

              {/* Дата и номер */}
              {(parsedData.document_date || parsedData.document_number) && (
                <div className="grid grid-cols-2 gap-2">
                  {parsedData.document_date && (
                    <div className="rounded-lg p-2.5" style={{ background: "var(--bg)" }}>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>ДАТА</div>
                      <div className="font-semibold text-[13px]">{parsedData.document_date}</div>
                    </div>
                  )}
                  {parsedData.document_number && (
                    <div className="rounded-lg p-2.5" style={{ background: "var(--bg)" }}>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>НОМЕР</div>
                      <div className="font-semibold text-[13px]">{parsedData.document_number}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Позиции */}
              {parsedData.items && parsedData.items.length > 0 && (
                <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                  <div className="text-[10px] font-bold mb-2" style={{ color: "var(--t3)" }}>
                    ПОЗИЦИИ ({parsedData.items.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {parsedData.items.map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-[12px] py-1"
                        style={{ borderBottom: i < parsedData.items.length - 1 ? "1px solid var(--brd)" : "none" }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.name}</div>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                            {item.quantity} {item.unit || "шт"} × {Number(item.price || 0).toLocaleString("ru-RU")} ₸
                          </div>
                        </div>
                        <div className="font-semibold">
                          {Number(item.amount || 0).toLocaleString("ru-RU")} ₸
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Итого */}
              {parsedData.total_amount && (
                <div className="rounded-lg p-3" style={{ background: "linear-gradient(135deg, #10B98115, #10B98125)", border: "1px solid #10B98140" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: "#059669" }}>ИТОГО</div>
                      {parsedData.vat_amount && (
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                          в т.ч. НДС {parsedData.vat_rate || 16}%: {Number(parsedData.vat_amount).toLocaleString("ru-RU")} ₸
                        </div>
                      )}
                    </div>
                    <div className="text-xl font-extrabold" style={{ color: "#059669" }}>
                      {Number(parsedData.total_amount).toLocaleString("ru-RU")} ₸
                    </div>
                  </div>
                </div>
              )}

              {/* Кнопки действий */}
              <div className="flex gap-2 mt-2">
                <button onClick={handleClose} disabled={creating}
                  className="flex-1 py-2.5 rounded-lg cursor-pointer font-semibold text-[12px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                  Закрыть
                </button>
                <button onClick={createInSystem} disabled={creating}
                  className="flex-1 py-2.5 rounded-lg cursor-pointer font-bold text-[12px]"
                  style={{
                    background: creating ? "var(--brd)" : "linear-gradient(135deg, #10B981, #059669)",
                    color: "#fff", border: "none",
                    opacity: creating ? 0.5 : 1,
                  }}>
                  {creating ? "Создаём..." : "✓ Создать в системе"}
                </button>
              </div>
            </div>
          )}

          {/* Ошибка */}
          {step === "error" && (
            <div className="text-center py-8">
              <div style={{ fontSize: 48 }}>⚠</div>
              <div className="mt-3 text-base font-bold" style={{ color: "#EF4444" }}>Ошибка</div>
              <div className="mt-2 text-[12px]" style={{ color: "var(--t3)" }}>{error}</div>
              <button onClick={reset}
                className="mt-4 py-2 px-4 rounded-lg cursor-pointer font-semibold text-[12px]"
                style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                Попробовать ещё раз
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
