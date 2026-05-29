"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  parseFile, autoMapFields,
  COUNTERPARTY_FIELDS, NOMENCLATURE_FIELDS, EMPLOYEE_FIELDS, JOURNAL_ENTRY_FIELDS,
  type ParsedFile, type FieldMapping,
} from "@/lib/migration-parser";
import {
  importCounterparties, importNomenclature, importEmployees, importJournalEntries,
  type ImportResult, type DuplicateStrategy,
} from "@/lib/migration-importer";

type EntityType = "counterparties" | "nomenclature" | "employees" | "journal_entries";
type Step = "select" | "upload" | "mapping" | "importing" | "completed";

const ENTITY_INFO: Record<EntityType, { label: string; icon: string; description: string; fields: typeof COUNTERPARTY_FIELDS }> = {
  counterparties: {
    label: "Контрагенты",
    icon: "👥",
    description: "Клиенты, поставщики, партнёры с реквизитами",
    fields: COUNTERPARTY_FIELDS,
  },
  nomenclature: {
    label: "Номенклатура",
    icon: "📦",
    description: "Товары, услуги с ценами и остатками",
    fields: NOMENCLATURE_FIELDS,
  },
  employees: {
    label: "Сотрудники",
    icon: "👤",
    description: "Список сотрудников с окладами и реквизитами",
    fields: EMPLOYEE_FIELDS,
  },
  journal_entries: {
    label: "Бухгалтерские проводки",
    icon: "📒",
    description: "Журнал хозяйственных операций (Дт/Кт)",
    fields: JOURNAL_ENTRY_FIELDS,
  },
};

interface MigrationJob {
  id: string;
  entity_type: string;
  source_format: string;
  source_file_name: string | null;
  status: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  duplicates_handled: number;
  created_at: string;
  completed_at: string | null;
}

export default function MigrationPage() {
  const supabase = createClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState("");
  const [step, setStep] = useState<Step>("select");
  const [tab, setTab] = useState<"new" | "history">("new");

  // Параметры миграции
  const [entityType, setEntityType] = useState<EntityType>("counterparties");
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("skip");
  const [previewLimit] = useState(10);
  const [dragActive, setDragActive] = useState(false);

  // Прогресс
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  // История
  const [history, setHistory] = useState<MigrationJob[]>([]);

  // AI помощь с маппингом
  const [aiHelping, setAiHelping] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    await loadHistory(user.id);
  }

  async function loadHistory(uid: string) {
    const { data } = await supabase.from("migration_jobs").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(30);
    setHistory((data as MigrationJob[]) || []);
  }

  async function handleFile(file: File) {
    setError("");
    setParsedFile(null);
    setParsing(true);

    try {
      const parsed = await parseFile(file);
      if (parsed.totalRows === 0) {
        setError("В файле не найдено строк данных");
        setParsing(false);
        return;
      }

      setParsedFile(parsed);

      // Авто-маппинг
      const fields = ENTITY_INFO[entityType].fields;
      const auto = autoMapFields(parsed.headers, fields);
      setMappings(auto);

      setStep("mapping");
    } catch (err: any) {
      setError(`Ошибка чтения файла: ${err.message || err}`);
    } finally {
      setParsing(false);
    }
  }

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

  function updateMapping(systemField: string, sourceField: string | null) {
    setMappings(prev => prev.map(m => m.systemField === systemField ? { ...m, sourceField } : m));
  }

  async function startImport() {
    if (!parsedFile || !userId) return;

    // Проверка обязательных полей
    const missingRequired = mappings.filter(m => m.required && !m.sourceField);
    if (missingRequired.length > 0) {
      setError(`Не сопоставлены обязательные поля: ${missingRequired.map(m => m.systemLabel).join(", ")}`);
      return;
    }

    setImporting(true);
    setError("");
    setProgress({ processed: 0, total: parsedFile.totalRows });
    setStep("importing");

    // Создаём запись о миграции
    const { data: job, error: jobErr } = await supabase.from("migration_jobs").insert({
      user_id: userId,
      entity_type: entityType,
      source_format: parsedFile.format,
      source_file_name: parsedFile.fileName,
      encoding: parsedFile.encoding,
      field_mapping: Object.fromEntries(mappings.map(m => [m.systemField, m.sourceField])) as any,
      status: "importing",
      total_rows: parsedFile.totalRows,
      started_at: new Date().toISOString(),
    }).select().single();

    if (jobErr || !job) {
      setError(`Не удалось создать запись: ${jobErr?.message}`);
      setImporting(false);
      return;
    }

    let result: ImportResult;
    try {
      const onProgress = (processed: number, total: number) => setProgress({ processed, total });

      switch (entityType) {
        case "counterparties":
          result = await importCounterparties(supabase, userId, parsedFile.rows, parsedFile.headers, mappings, duplicateStrategy, onProgress);
          break;
        case "nomenclature":
          result = await importNomenclature(supabase, userId, parsedFile.rows, parsedFile.headers, mappings, duplicateStrategy, onProgress);
          break;
        case "employees":
          result = await importEmployees(supabase, userId, parsedFile.rows, parsedFile.headers, mappings, duplicateStrategy, onProgress);
          break;
        case "journal_entries":
          result = await importJournalEntries(supabase, userId, parsedFile.rows, parsedFile.headers, mappings, onProgress);
          break;
      }

      setImportResult(result);

      // Обновляем job
      await supabase.from("migration_jobs").update({
        status: result.failed > 0 ? "completed_with_errors" : "completed",
        processed_rows: parsedFile.totalRows,
        successful_rows: result.successful,
        failed_rows: result.failed,
        skipped_rows: result.skipped,
        duplicates_handled: result.duplicates,
        error_log: result.errors.slice(0, 100) as any,
        warning_log: result.warnings.slice(0, 50) as any,
        completed_at: new Date().toISOString(),
      }).eq("id", job.id);

      setStep("completed");
      await loadHistory(userId);
    } catch (err: any) {
      await supabase.from("migration_jobs").update({
        status: "failed",
        error_log: [{ error: err.message || String(err) }] as any,
        completed_at: new Date().toISOString(),
      }).eq("id", job.id);
      setError(`Ошибка импорта: ${err.message || err}`);
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep("select");
    setEntityType("counterparties");
    setParsedFile(null);
    setMappings([]);
    setImportResult(null);
    setError("");
    setProgress({ processed: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #6366F110, #A855F710)", border: "1px solid #6366F130" }}>
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontSize: 22 }}>📥</span>
          <div className="text-sm font-bold">Миграция из 1С (и других систем)</div>
        </div>
        <div className="text-[11px]" style={{ color: "var(--t2)" }}>
          Поддерживаются: <b>Excel (.xlsx)</b>, <b>CSV</b> (любая кодировка), <b>XML 1С</b>. Импортируйте контрагентов, номенклатуру, сотрудников и проводки за несколько кликов.
        </div>
      </div>

      <div className="flex gap-2">
        {([
          ["new", "📥 Новая миграция"],
          ["history", `📚 История (${history.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); reset(); }}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "new" && (
        <>
          {/* Stepper */}
          <div className="flex items-center gap-2 text-[11px]">
            {(["select", "upload", "mapping", "importing", "completed"] as Step[]).map((s, i) => {
              const labels = ["1. Тип", "2. Файл", "3. Поля", "4. Импорт", "5. Готово"];
              const stepIndex = ["select", "upload", "mapping", "importing", "completed"].indexOf(step);
              const isActive = step === s;
              const isPast = stepIndex > i;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className="rounded-full flex items-center justify-center font-bold" style={{
                    width: 24, height: 24, fontSize: 10,
                    background: isActive ? "var(--accent)" : isPast ? "#10B981" : "var(--bg)",
                    color: isActive || isPast ? "#fff" : "var(--t3)",
                    border: isActive ? "none" : isPast ? "none" : "1px solid var(--brd)",
                  }}>{isPast ? "✓" : i + 1}</div>
                  <div className="font-semibold" style={{ color: isActive ? "var(--accent)" : isPast ? "#10B981" : "var(--t3)" }}>{labels[i]}</div>
                  {i < 4 && <div style={{ width: 16, height: 1, background: "var(--brd)" }} />}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="rounded-xl p-3 text-sm font-semibold" style={{ background: "#EF444420", color: "#EF4444" }}>
              ❌ {error}
            </div>
          )}

          {/* ═══ STEP 1: ВЫБОР ТИПА ═══ */}
          {step === "select" && (
            <>
              <div className="text-sm font-bold">Что переносим?</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(ENTITY_INFO) as EntityType[]).map(type => {
                  const info = ENTITY_INFO[type];
                  return (
                    <div key={type} onClick={() => { setEntityType(type); setStep("upload"); }}
                      className="rounded-xl p-4 cursor-pointer transition-all"
                      style={{ background: "var(--card)", border: `1px solid ${entityType === type ? "var(--accent)" : "var(--brd)"}` }}>
                      <div className="flex items-start gap-3">
                        <span style={{ fontSize: 28 }}>{info.icon}</span>
                        <div className="flex-1">
                          <div className="text-[13px] font-bold">{info.label}</div>
                          <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>{info.description}</div>
                          <div className="text-[10px] mt-2" style={{ color: "var(--t3)" }}>
                            Полей: {info.fields.length} · обязательных: {info.fields.filter(f => f.required).length}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ═══ STEP 2: ЗАГРУЗКА ФАЙЛА ═══ */}
          {step === "upload" && (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setStep("select")} className="cursor-pointer rounded-lg border-none text-xs" style={{ padding: "5px 10px", background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                  ← Назад
                </button>
                <div className="text-[11px]" style={{ color: "var(--t3)" }}>Выбрано: <b>{ENTITY_INFO[entityType].icon} {ENTITY_INFO[entityType].label}</b></div>
              </div>

              <div
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                onClick={() => !parsing && fileInputRef.current?.click()}
                className="rounded-xl p-12 text-center cursor-pointer transition-all"
                style={{ background: dragActive ? "#A855F710" : "var(--card)", border: `2px dashed ${dragActive ? "#A855F7" : "var(--brd)"}` }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{parsing ? "⏳" : "📁"}</div>
                {parsing ? (
                  <>
                    <div className="text-sm font-bold mb-1">Читаю файл...</div>
                    <div className="text-[11px]" style={{ color: "var(--t3)" }}>Может занять несколько секунд для больших Excel</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold mb-1">{dragActive ? "Отпустите файл" : "Перетащите файл сюда"}</div>
                    <div className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>или нажмите чтобы выбрать</div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                      Excel (.xlsx, .xls) · CSV · XML 1С<br/>
                      Кодировка определится автоматически (UTF-8 или Windows-1251 для старых файлов)
                    </div>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt,.xml"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} style={{ display: "none" }} />
              </div>

              <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
                💡 <b>Из 1С:Бухгалтерии:</b> «Сервис» → «Универсальный обмен данными в формате XML» — выгрузить нужный справочник.<br/>
                💡 <b>Excel из любой 1С:</b> любой отчёт → «Файл» → «Сохранить как...» → выбрать .xlsx.<br/>
                💡 <b>CSV из старых баз:</b> используется автоматическая конвертация Windows-1251 в UTF-8.
              </div>
            </>
          )}

          {/* ═══ STEP 3: МАППИНГ ═══ */}
          {step === "mapping" && parsedFile && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => setStep("upload")} className="cursor-pointer rounded-lg border-none text-xs" style={{ padding: "5px 10px", background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                    ← Назад
                  </button>
                  <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                    📄 {parsedFile.fileName} · {parsedFile.format.toUpperCase()} · {parsedFile.encoding} · <b>{parsedFile.totalRows} строк</b>
                  </div>
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-2">📊 Превью данных (первые {Math.min(previewLimit, parsedFile.rows.length)} строк)</div>
                <div style={{ maxHeight: 200, overflow: "auto" }}>
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr style={{ background: "var(--bg)" }}>
                        {parsedFile.headers.map((h, i) => (
                          <th key={i} style={{ padding: 4, textAlign: "left", borderBottom: "1px solid var(--brd)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedFile.rows.slice(0, previewLimit).map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--brd)" }}>
                          {row.map((cell, j) => <td key={j} style={{ padding: 4 }}>{String(cell || "").slice(0, 50)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-2">🔗 Соответствие полей</div>
                <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
                  Сопоставьте поля из вашего файла с полями системы. <b style={{ color: "#10B981" }}>Зелёные</b> определились автоматически. <b style={{ color: "#EF4444" }}>Красные</b> требуют вашего внимания (обязательные).
                </div>

                <div className="flex flex-col gap-2">
                  {mappings.map(m => (
                    <div key={m.systemField} className="flex items-center gap-3 rounded-lg p-2" style={{
                      background: m.sourceField ? "#10B98110" : (m.required ? "#EF444410" : "var(--bg)"),
                      borderLeft: `3px solid ${m.sourceField ? "#10B981" : (m.required ? "#EF4444" : "var(--brd)")}`,
                    }}>
                      <div style={{ flex: "0 0 200px" }}>
                        <div className="text-[12px] font-bold">{m.systemLabel} {m.required && <span style={{ color: "#EF4444" }}>*</span>}</div>
                        <div className="text-[9px]" style={{ color: "var(--t3)" }}>→ {m.systemField}</div>
                      </div>
                      <div style={{ fontSize: 16, color: "var(--t3)" }}>←</div>
                      <select value={m.sourceField || ""} onChange={e => updateMapping(m.systemField, e.target.value || null)} style={{ flex: 1 }}>
                        <option value="">— не импортировать —</option>
                        {parsedFile.headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-2">🔁 Стратегия дублей</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {([
                    ["skip", "⏭ Пропускать", "Существующие записи не трогаем"],
                    ["update", "✏ Обновлять", "Перезаписать существующие новыми данными"],
                    ["create_anyway", "➕ Создавать", "Создавать новые записи всегда"],
                  ] as const).map(([key, title, desc]) => (
                    <button key={key} onClick={() => setDuplicateStrategy(key)}
                      className="cursor-pointer rounded-lg border-none text-left p-3"
                      style={{
                        background: duplicateStrategy === key ? "var(--accent-dim)" : "var(--bg)",
                        border: `1px solid ${duplicateStrategy === key ? "var(--accent)" : "var(--brd)"}`,
                      }}>
                      <div className="text-[12px] font-bold" style={{ color: duplicateStrategy === key ? "var(--accent)" : "var(--t1)" }}>{title}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={startImport} disabled={importing}
                className="px-5 py-3 rounded-lg text-white font-semibold border-none cursor-pointer"
                style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)", fontSize: 14 }}>
                🚀 Запустить импорт {parsedFile.totalRows} строк
              </button>
            </>
          )}

          {/* ═══ STEP 4: ИМПОРТ ═══ */}
          {step === "importing" && (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
              <div className="text-base font-bold mb-2">Импорт в процессе...</div>
              <div className="text-[12px] mb-4" style={{ color: "var(--t3)" }}>
                Обработано {progress.processed} из {progress.total}
              </div>
              <div style={{ height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden", maxWidth: 400, margin: "0 auto" }}>
                <div style={{
                  height: "100%",
                  width: progress.total > 0 ? `${(progress.processed / progress.total) * 100}%` : "0%",
                  background: "linear-gradient(90deg, #6366F1, #A855F7)",
                  transition: "width 0.3s",
                }} />
              </div>
              <div className="text-[10px] mt-2" style={{ color: "var(--t3)" }}>
                {progress.total > 0 ? `${Math.round((progress.processed / progress.total) * 100)}%` : "0%"}
              </div>
            </div>
          )}

          {/* ═══ STEP 5: РЕЗУЛЬТАТ ═══ */}
          {step === "completed" && importResult && (
            <>
              <div className="rounded-xl p-5" style={{
                background: importResult.failed === 0 ? "#10B98115" : "#F59E0B15",
                border: `1px solid ${importResult.failed === 0 ? "#10B98140" : "#F59E0B40"}`,
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontSize: 28 }}>{importResult.failed === 0 ? "✅" : "⚠"}</span>
                  <div>
                    <div className="text-base font-bold" style={{ color: importResult.failed === 0 ? "#10B981" : "#F59E0B" }}>
                      {importResult.failed === 0 ? "Импорт завершён успешно" : "Импорт завершён с ошибками"}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                      Обработано {importResult.total} строк
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg p-3" style={{ background: "var(--card)" }}>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>✅ Импортировано</div>
                    <div className="text-lg font-bold" style={{ color: "#10B981" }}>{importResult.successful}</div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "var(--card)" }}>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>⏭ Пропущено</div>
                    <div className="text-lg font-bold" style={{ color: "#6B7280" }}>{importResult.skipped}</div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "var(--card)" }}>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>🔁 Дублей</div>
                    <div className="text-lg font-bold" style={{ color: "#F59E0B" }}>{importResult.duplicates}</div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "var(--card)" }}>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>❌ Ошибок</div>
                    <div className="text-lg font-bold" style={{ color: "#EF4444" }}>{importResult.failed}</div>
                  </div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="text-sm font-bold mb-2">📋 Журнал ошибок ({importResult.errors.length})</div>
                  <div style={{ maxHeight: 240, overflow: "auto" }}>
                    {importResult.errors.slice(0, 50).map((e, i) => (
                      <div key={i} className="text-[10px] py-1" style={{ borderBottom: "1px solid var(--brd)", color: "var(--t2)" }}>
                        Строка {e.row}: <span style={{ color: "#EF4444" }}>{e.error}</span>
                      </div>
                    ))}
                    {importResult.errors.length > 50 && (
                      <div className="text-[10px] py-1 text-center" style={{ color: "var(--t3)" }}>
                        ... и ещё {importResult.errors.length - 50} ошибок
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 rounded-lg text-white text-sm font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
                  + Новая миграция
                </button>
                {entityType === "counterparties" && (
                  <button onClick={() => router.push("/dashboard/counterparties")} className="px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                    Открыть контрагентов →
                  </button>
                )}
                {entityType === "nomenclature" && (
                  <button onClick={() => router.push("/dashboard/nomenclature")} className="px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                    Открыть номенклатуру →
                  </button>
                )}
                {entityType === "employees" && (
                  <button onClick={() => router.push("/dashboard/hr")} className="px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                    Открыть кадры →
                  </button>
                )}
                {entityType === "journal_entries" && (
                  <button onClick={() => router.push("/dashboard/accounting")} className="px-4 py-2 rounded-lg text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                    Открыть проводки →
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "history" && (
        <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          {history.length === 0 ? (
            <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
              История миграций пуста
            </div>
          ) : (
            history.map((j, i) => {
              const info = ENTITY_INFO[j.entity_type as EntityType];
              const statusColors: Record<string, { color: string; label: string }> = {
                completed: { color: "#10B981", label: "✓ Успешно" },
                completed_with_errors: { color: "#F59E0B", label: "⚠ С ошибками" },
                failed: { color: "#EF4444", label: "✗ Ошибка" },
                importing: { color: "#3B82F6", label: "⏳ В процессе" },
                preparing: { color: "#6B7280", label: "○ Подготовка" },
                cancelled: { color: "#6B7280", label: "○ Отменено" },
              };
              const status = statusColors[j.status] || statusColors.preparing;
              return (
                <div key={j.id} style={{
                  padding: "12px 18px",
                  borderBottom: i < history.length - 1 ? "1px solid var(--brd)" : "none",
                  borderLeft: `3px solid ${status.color}`,
                }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 22 }}>{info?.icon || "📄"}</span>
                      <div>
                        <div className="text-[12px] font-bold">{info?.label || j.entity_type}</div>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                          {j.source_file_name || j.source_format} · {new Date(j.created_at).toLocaleString("ru-RU")}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: status.color + "20", color: status.color }}>
                        {status.label}
                      </span>
                      <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                        {j.successful_rows}✓ · {j.failed_rows}✗ · {j.duplicates_handled}🔁
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
        💡 <b>Безопасно:</b> до запуска импорта вы видите превью первых 10 строк и можете вручную поправить маппинг полей.<br/>
        💡 <b>Дубли:</b> система автоматически находит совпадения по БИН (для контрагентов), коду (номенклатура), ИИН (сотрудники).<br/>
        💡 <b>Кодировки:</b> Windows-1251 (старые выгрузки 1С 7.7) определяется и конвертируется автоматически.<br/>
        💡 <b>Формат XML 1С:</b> поддерживается стандартный CommerceML и базовые структуры выгрузки 1С:Бухгалтерии для Казахстана.
      </div>
    </div>
  );
}
