"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

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

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.indexOf(",") !== -1 ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

      const res = await fetch("/.netlify/functions/scan-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_data: base64,
          file_type: selectedFile.type,
          file_name: selectedFile.name,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Не удалось распознать документ");
        setStep("error");
        return;
      }

      // Сохраняем в БД
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: scan } = await supabase.from("document_scans").insert({
          user_id: user.id,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          document_type: data.data?.document_type || "other",
          parsed_data: data.data || null,
          raw_text: data.raw_text || "",
          status: "parsed",
          ai_model_used: data.model_used,
          ai_processing_time_ms: data.processing_time_ms,
          ai_confidence_score: data.data?.confidence || null,
        }).select().single();
        
        if (scan) setScanId(scan.id);
      }

      setParsedData(data.data || { raw_text: data.raw_text });
      setStep("result");
    } catch (err: any) {
      setError("Ошибка: " + err.message);
      setStep("error");
    }
  }

  async function createInSystem() {
    if (!parsedData) return;

    setCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const createdIds: any = {
        counterparty_id: null,
        nomenclature_ids: [] as string[],
        order_id: null,
        journal_entry_ids: [] as string[],
      };

      // 1. Создаём контрагента (поставщика)
      if (parsedData.supplier?.name) {
        const { data: existingCp } = await supabase
          .from("counterparties")
          .select("id")
          .eq("user_id", user.id)
          .ilike("name", parsedData.supplier.name)
          .maybeSingle();

        if (existingCp) {
          createdIds.counterparty_id = existingCp.id;
        } else {
          const { data: newCp } = await supabase.from("counterparties").insert({
            user_id: user.id,
            name: parsedData.supplier.name,
            bin: parsedData.supplier.bin || null,
            address: parsedData.supplier.address || null,
            counterparty_type: "supplier",
            is_active: true,
          }).select().single();
          if (newCp) createdIds.counterparty_id = newCp.id;
        }
      }

      // 2. Создаём товары если есть
      if (parsedData.items && Array.isArray(parsedData.items)) {
        for (const item of parsedData.items) {
          if (!item.name) continue;
          
          const { data: existingNom } = await supabase
            .from("nomenclature")
            .select("id")
            .eq("user_id", user.id)
            .ilike("name", item.name)
            .maybeSingle();

          if (existingNom) {
            createdIds.nomenclature_ids.push(existingNom.id);
          } else {
            const { data: newNom } = await supabase.from("nomenclature").insert({
              user_id: user.id,
              name: item.name,
              unit: item.unit || "шт",
              purchase_price: item.price || 0,
              sale_price: (item.price || 0) * 1.3,  // +30% наценка по умолчанию
              quantity: item.quantity || 0,
              vat_rate: parsedData.vat_rate || 16,
              type: "product",
            }).select().single();
            if (newNom) createdIds.nomenclature_ids.push(newNom.id);
          }
        }
      }

      // 3. Создаём проводку поступления
      if (parsedData.total_amount && createdIds.counterparty_id) {
        const { data: entry } = await supabase.from("journal_entries").insert({
          user_id: user.id,
          entry_date: parsedData.document_date || new Date().toISOString().slice(0, 10),
          debit_account: "1330",  // Запасы
          credit_account: "3310",  // Кред. зад. поставщикам
          amount: parsedData.total_amount,
          description: `Поступление: ${parsedData.supplier?.name || "Поставщик"} (${parsedData.document_number || "без номера"})`,
        }).select().single();
        if (entry) createdIds.journal_entry_ids.push(entry.id);

        // НДС если есть
        if (parsedData.vat_amount && parsedData.vat_amount > 0) {
          const { data: vatEntry } = await supabase.from("journal_entries").insert({
            user_id: user.id,
            entry_date: parsedData.document_date || new Date().toISOString().slice(0, 10),
            debit_account: "1420",  // НДС к зачёту
            credit_account: "3310",
            amount: parsedData.vat_amount,
            description: `НДС: ${parsedData.supplier?.name || "Поставщик"}`,
          }).select().single();
          if (vatEntry) createdIds.journal_entry_ids.push(vatEntry.id);
        }
      }

      // 4. Обновляем scan
      if (scanId) {
        await supabase.from("document_scans").update({
          status: "created",
          created_counterparty_id: createdIds.counterparty_id,
          created_nomenclature_ids: createdIds.nomenclature_ids,
          created_journal_entry_ids: createdIds.journal_entry_ids,
        }).eq("id", scanId);
      }

      // Закрываем и возвращаем результат
      if (onSuccess) onSuccess({ parsedData, createdIds });
      
      alert(`✅ Создано:\n• Контрагент: ${createdIds.counterparty_id ? "1" : "0"}\n• Товаров: ${createdIds.nomenclature_ids.length}\n• Проводок: ${createdIds.journal_entry_ids.length}`);
      
      handleClose();
    } catch (err: any) {
      setError("Ошибка создания: " + err.message);
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
