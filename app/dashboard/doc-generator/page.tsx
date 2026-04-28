"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";
import { exportToPDF } from "@/lib/export-utils";

interface Variable {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "money" | "date" | "counterparty";
  required?: boolean;
  default?: string;
  auto?: string;
}

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  content: string;
  variables: Variable[];
  is_system: boolean;
  user_id: string | null;
}

interface GeneratedDoc {
  id: string;
  title: string;
  template_name: string | null;
  final_content: string;
  generation_method: string;
  created_at: string;
}

interface Counterparty {
  id: string;
  name: string;
  bin: string | null;
  address: string | null;
  director_name: string | null;
}

const CATEGORIES = [
  { v: "all", l: "Все" },
  { v: "contract", l: "📄 Договоры" },
  { v: "act", l: "📋 Акты" },
  { v: "invoice", l: "🧾 Счета" },
  { v: "official", l: "📜 Официальные" },
  { v: "internal", l: "🏢 Внутренние" },
  { v: "other", l: "Прочее" },
];

type Tab = "templates" | "ai-freeform" | "history";

export default function DocGeneratorPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [history, setHistory] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("templates");
  const [category, setCategory] = useState("all");

  // Заполнение шаблона
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedTitle, setGeneratedTitle] = useState("");

  // AI freeform
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<{ title: string; content: string; suggestions?: string[] } | null>(null);

  // Просмотр из истории
  const [viewingDoc, setViewingDoc] = useState<GeneratedDoc | null>(null);

  // Улучшение существующего документа
  const [improvePrompt, setImprovePrompt] = useState("");
  const [improving, setImproving] = useState(false);

  const [msg, setMsg] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [profileRes, templatesRes, cpRes, historyRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("doc_templates").select("*").or(`is_system.eq.true,user_id.eq.${user.id}`).eq("is_active", true).order("is_system", { ascending: false }).order("name"),
      supabase.from("counterparties").select("id,name,bin,address,director_name").eq("user_id", user.id).limit(500),
      supabase.from("generated_documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);

    setProfile(profileRes.data);
    setTemplates((templatesRes.data as Template[]) || []);
    setCounterparties((cpRes.data as Counterparty[]) || []);
    setHistory((historyRes.data as GeneratedDoc[]) || []);
    setLoading(false);
  }

  function selectTemplate(t: Template) {
    setSelectedTemplate(t);
    // Инициализируем значения с дефолтами
    const initVals: Record<string, string> = {};
    t.variables.forEach(v => {
      if (v.default) initVals[v.key] = v.default;
    });
    // Подставляем реквизиты нашей компании
    if (profile) {
      initVals["our_company"] = profile.company_name || "";
      initVals["our_bin"] = profile.bin || "";
      initVals["our_address"] = profile.address || "";
      initVals["our_director"] = profile.director_name || profile.full_name || "";
      initVals["our_bank"] = profile.bank_name || "";
      initVals["our_iik"] = profile.bank_account || "";
      initVals["our_bik"] = profile.bank_bik || "";
    }
    setVarValues(initVals);
    setGeneratedContent("");
    setGeneratedTitle("");
  }

  function selectCounterparty(cpId: string) {
    const cp = counterparties.find(c => c.id === cpId);
    if (!cp) return;
    setVarValues({
      ...varValues,
      counterparty_name: cp.name,
      counterparty_bin: cp.bin || "",
      counterparty_address: cp.address || "",
      counterparty_director: cp.director_name || "",
    });
  }

  function calculateAutoFields(values: Record<string, string>): Record<string, string> {
    if (!selectedTemplate) return values;
    const result = { ...values };
    selectedTemplate.variables.forEach(v => {
      if (v.auto) {
        try {
          // Поддержка "amount * 16 / 116" — простой парсер математики
          const formula = v.auto.replace(/\b(\w+)\b/g, (match) => {
            if (Object.prototype.hasOwnProperty.call(values, match)) {
              return values[match] || "0";
            }
            return match;
          });
          // Безопасно вычисляем простую математику
          // eslint-disable-next-line no-new-func
          const calculated = Function(`"use strict"; return (${formula})`)();
          if (!isNaN(calculated) && isFinite(calculated)) {
            result[v.key] = String(Math.round(calculated * 100) / 100);
          }
        } catch {}
      }
    });
    return result;
  }

  function generateFromTemplate() {
    if (!selectedTemplate) return;

    const finalValues = calculateAutoFields(varValues);
    let content = selectedTemplate.content;

    // Заменяем все {{key}} на значения
    Object.entries(finalValues).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      content = content.replace(regex, value || `[${key}]`);
    });

    // Незаполненные placeholder'ы выделяем
    content = content.replace(/\{\{(\w+)\}\}/g, "[НЕ ЗАПОЛНЕНО: $1]");

    const title = `${selectedTemplate.name} ${finalValues.contract_number || finalValues.invoice_number || finalValues.act_number || finalValues.order_number || finalValues.doc_number || ""}`.trim();

    setGeneratedContent(content);
    setGeneratedTitle(title);
  }

  async function saveDocument() {
    if (!generatedContent || !userId) return;
    const { error } = await supabase.from("generated_documents").insert({
      user_id: userId,
      template_id: selectedTemplate?.id || null,
      template_name: selectedTemplate?.name || aiResult?.title || "Документ",
      title: generatedTitle || aiResult?.title || "Без названия",
      final_content: generatedContent || aiResult?.content || "",
      variables_used: varValues as any,
      generation_method: aiResult ? "ai_freeform" : "template",
      ai_prompt: aiResult ? aiPrompt : null,
    });
    if (error) {
      setMsg(`❌ ${error.message}`);
    } else {
      setMsg("✅ Документ сохранён в историю");
      // Перезагружаем историю
      const { data } = await supabase.from("generated_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      setHistory((data as GeneratedDoc[]) || []);
    }
    setTimeout(() => setMsg(""), 3000);
  }

  function downloadAsPDF() {
    const content = generatedContent || aiResult?.content || viewingDoc?.final_content;
    const title = generatedTitle || aiResult?.title || viewingDoc?.title || "Документ";
    if (!content) return;

    // Конвертируем в формат для exportToPDF (одна строка как одна "колонка"-ячейка)
    exportToPDF({
      fileName: title.replace(/[^a-zA-Zа-яА-Я0-9]+/g, "_").slice(0, 50),
      title: title,
      columns: [{ key: "line", label: "" }],
      rows: content.split("\n").map(line => ({ line })),
    });
  }

  function copyToClipboard() {
    const content = generatedContent || aiResult?.content || viewingDoc?.final_content;
    if (!content) return;
    navigator.clipboard.writeText(content);
    setMsg("✅ Скопировано в буфер обмена");
    setTimeout(() => setMsg(""), 2000);
  }

  async function generateWithAI() {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiResult(null);

    const businessContext = profile ? `Наша компания: ${profile.company_name || "—"}
БИН: ${profile.bin || "—"}
Адрес: ${profile.address || "—"}
Директор: ${profile.director_name || profile.full_name || "—"}` : "";

    try {
      const res = await fetch("/.netlify/functions/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "freeform",
          prompt: aiPrompt,
          businessContext,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMsg(`❌ ${data.error}`);
      } else {
        setAiResult(data);
      }
    } catch (err: any) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setAiGenerating(false);
    }
  }

  async function improveDocument() {
    const baseContent = generatedContent || aiResult?.content;
    if (!baseContent || !improvePrompt.trim()) return;
    setImproving(true);

    try {
      const res = await fetch("/.netlify/functions/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "improve",
          prompt: improvePrompt,
          baseDocument: baseContent,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMsg(`❌ ${data.error}`);
      } else {
        if (generatedContent) {
          setGeneratedContent(data.content);
          if (data.title) setGeneratedTitle(data.title);
        } else if (aiResult) {
          setAiResult({ title: data.title || aiResult.title, content: data.content, suggestions: data.changes });
        }
        setImprovePrompt("");
        setMsg("✅ Документ улучшен");
      }
    } catch (err: any) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setImproving(false);
      setTimeout(() => setMsg(""), 2000);
    }
  }

  function reset() {
    setSelectedTemplate(null);
    setVarValues({});
    setGeneratedContent("");
    setGeneratedTitle("");
    setAiResult(null);
    setAiPrompt("");
    setViewingDoc(null);
  }

  if (loading) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  // Просмотр документа из истории
  if (viewingDoc) {
    return (
      <div className="flex flex-col gap-4">
        {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

        <div className="flex justify-between items-center">
          <button onClick={() => setViewingDoc(null)} className="cursor-pointer rounded-lg border-none text-xs" style={{ padding: "6px 12px", background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
            ← Назад к истории
          </button>
          <div className="flex gap-2">
            <button onClick={copyToClipboard} className="cursor-pointer rounded-lg border-none text-xs font-semibold" style={{ padding: "6px 12px", background: "var(--accent-dim)", color: "var(--accent)" }}>
              📋 Копировать
            </button>
            <button onClick={downloadAsPDF} className="cursor-pointer rounded-lg border-none text-xs font-semibold" style={{ padding: "6px 12px", background: "#EF444420", color: "#EF4444" }}>
              📄 Скачать PDF
            </button>
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-1">{viewingDoc.title}</div>
          <div className="text-[10px] mb-4" style={{ color: "var(--t3)" }}>
            {viewingDoc.template_name} · {new Date(viewingDoc.created_at).toLocaleString("ru-RU")}
          </div>
          <pre className="whitespace-pre-wrap text-[12px]" style={{ fontFamily: "inherit", lineHeight: 1.6, color: "var(--t1)" }}>{viewingDoc.final_content}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Генерация деловых документов: договоры, акты, счета, приказы. Используйте готовые шаблоны или попросите Жанару создать документ с нуля.
      </div>

      <div className="flex gap-2 flex-wrap">
        {([
          ["templates", `📋 Шаблоны (${templates.length})`],
          ["ai-freeform", "✦ AI с нуля"],
          ["history", `📚 История (${history.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); reset(); }}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ВЫБОР ШАБЛОНА ═══ */}
      {tab === "templates" && !selectedTemplate && (
        <>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c.v} onClick={() => setCategory(c.v)}
                className="px-3 py-1.5 rounded-lg text-[11px] cursor-pointer"
                style={{ background: category === c.v ? "var(--accent-dim)" : "transparent", color: category === c.v ? "var(--accent)" : "var(--t3)", border: "1px solid var(--brd)" }}>
                {c.l}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates
              .filter(t => category === "all" || t.category === category)
              .map(t => (
                <div key={t.id} onClick={() => selectTemplate(t)}
                  className="rounded-xl p-4 cursor-pointer transition-all"
                  style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="flex items-start gap-3 mb-2">
                    <span style={{ fontSize: 24 }}>{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold">{t.name}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>{t.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold" style={{ color: "var(--t3)" }}>
                      {t.is_system ? "🔒 Системный" : "👤 Свой"} · {t.variables.length} полей
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {/* ═══ ЗАПОЛНЕНИЕ ШАБЛОНА ═══ */}
      {tab === "templates" && selectedTemplate && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <div className="flex flex-col gap-4">
            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 20 }}>{selectedTemplate.icon}</span>
                  <div>
                    <div className="text-sm font-bold">{selectedTemplate.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>{selectedTemplate.description}</div>
                  </div>
                </div>
                <button onClick={reset} className="cursor-pointer rounded-lg border-none text-[10px]" style={{ padding: "4px 8px", background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)" }}>
                  ← Сменить
                </button>
              </div>

              <div className="text-[12px] font-bold mb-2">Заполните поля:</div>

              <div className="flex flex-col gap-3">
                {selectedTemplate.variables.map(v => (
                  <div key={v.key}>
                    <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>
                      {v.label} {v.required && <span style={{ color: "#EF4444" }}>*</span>}
                      {v.auto && <span className="text-[9px] ml-1" style={{ color: "var(--t3)" }}>(авторасчёт)</span>}
                    </label>
                    {v.type === "counterparty" ? (
                      <select value={varValues[v.key] || ""} onChange={e => {
                        const cp = counterparties.find(c => c.name === e.target.value);
                        if (cp) selectCounterparty(cp.id);
                        else setVarValues({ ...varValues, [v.key]: e.target.value });
                      }}>
                        <option value="">— выберите контрагента —</option>
                        {counterparties.map(cp => <option key={cp.id} value={cp.name}>{cp.name}{cp.bin ? ` (${cp.bin})` : ""}</option>)}
                      </select>
                    ) : v.type === "textarea" ? (
                      <textarea value={varValues[v.key] || ""} onChange={e => setVarValues({ ...varValues, [v.key]: e.target.value })} rows={3} />
                    ) : v.type === "date" ? (
                      <input type="date" value={varValues[v.key] || ""} onChange={e => setVarValues({ ...varValues, [v.key]: e.target.value })} />
                    ) : v.type === "number" || v.type === "money" ? (
                      <input type="number" value={varValues[v.key] || ""} onChange={e => setVarValues({ ...varValues, [v.key]: e.target.value })} />
                    ) : (
                      <input value={varValues[v.key] || ""} onChange={e => setVarValues({ ...varValues, [v.key]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>

              <button onClick={generateFromTemplate}
                className="mt-4 w-full px-4 py-2.5 rounded-lg text-white font-semibold text-sm border-none cursor-pointer"
                style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)" }}>
                ✦ Сгенерировать документ
              </button>
            </div>
          </div>

          {/* ПРЕВЬЮ */}
          <div className="flex flex-col gap-3">
            {generatedContent ? (
              <>
                <div className="flex justify-between items-center">
                  <div className="text-sm font-bold">📄 Результат</div>
                  <div className="flex gap-2">
                    <button onClick={saveDocument} className="cursor-pointer rounded-lg border-none text-[11px] font-semibold" style={{ padding: "5px 10px", background: "#10B98120", color: "#10B981" }}>
                      💾 Сохранить
                    </button>
                    <button onClick={copyToClipboard} className="cursor-pointer rounded-lg border-none text-[11px] font-semibold" style={{ padding: "5px 10px", background: "var(--accent-dim)", color: "var(--accent)" }}>
                      📋 Копировать
                    </button>
                    <button onClick={downloadAsPDF} className="cursor-pointer rounded-lg border-none text-[11px] font-semibold" style={{ padding: "5px 10px", background: "#EF444420", color: "#EF4444" }}>
                      📄 PDF
                    </button>
                  </div>
                </div>

                <div ref={previewRef} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", maxHeight: 500, overflow: "auto" }}>
                  <pre className="whitespace-pre-wrap text-[11px]" style={{ fontFamily: "inherit", lineHeight: 1.6, color: "var(--t1)" }}>{generatedContent}</pre>
                </div>

                {/* Улучшение через AI */}
                <div className="rounded-xl p-3" style={{ background: "linear-gradient(135deg, #A855F710, #6366F110)", border: "1px solid #A855F730" }}>
                  <div className="text-[11px] font-bold mb-2" style={{ color: "#A855F7" }}>✦ Улучшить документ через Жанару</div>
                  <textarea value={improvePrompt} onChange={e => setImprovePrompt(e.target.value)}
                    placeholder="Например: добавь пункт о форс-мажоре, или измени срок оплаты на 10 дней"
                    rows={2} className="mb-2" />
                  <button onClick={improveDocument} disabled={improving || !improvePrompt.trim()}
                    className="cursor-pointer rounded-lg border-none text-xs font-semibold"
                    style={{ padding: "6px 12px", background: "linear-gradient(135deg, #A855F7, #6366F1)", color: "#fff", opacity: improving || !improvePrompt.trim() ? 0.5 : 1 }}>
                    {improving ? "Улучшаю..." : "✦ Применить"}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-xl p-12 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                <div className="text-[12px]" style={{ color: "var(--t3)" }}>
                  Заполните поля слева и нажмите "Сгенерировать"
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ AI С НУЛЯ ═══ */}
      {tab === "ai-freeform" && (
        <>
          {!aiResult && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: 22 }}>✦</span>
                <div>
                  <div className="text-sm font-bold" style={{ color: "#A855F7" }}>Опишите какой документ вам нужен</div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                    Жанара создаст документ с нуля по вашему описанию
                  </div>
                </div>
              </div>

              <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={5}
                placeholder='Например:
"Договор поставки строительных материалов с ТОО Альфа на 2 500 000 ₸ с НДС, срок поставки 30 дней, оплата в течение 14 дней после получения товара"

или

"Письмо в КГД с просьбой о рассрочке уплаты НДС за 1 квартал 2026 на 3 месяца"'
                className="mb-3" />

              <button onClick={generateWithAI} disabled={aiGenerating || !aiPrompt.trim()}
                className="px-4 py-2.5 rounded-lg text-white font-semibold text-sm border-none cursor-pointer"
                style={{ background: "linear-gradient(135deg, #A855F7, #6366F1)", opacity: aiGenerating || !aiPrompt.trim() ? 0.5 : 1 }}>
                {aiGenerating ? "✦ Жанара пишет документ..." : "✦ Сгенерировать"}
              </button>

              <div className="rounded-lg p-3 mt-3 text-[10px]" style={{ background: "var(--bg)", color: "var(--t3)" }}>
                💡 <b>Что Жанара умеет:</b> любые деловые документы — договоры, акты, претензии, заявления, гарантийные письма, доверенности, приказы.<br/>
                💡 <b>Совет:</b> чем подробнее опишешь — тем точнее будет результат. Указывай суммы, даты, условия.<br/>
                💡 <b>Ваши реквизиты</b> подставляются автоматически из профиля.
              </div>
            </div>
          )}

          {aiResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold">{aiResult.title}</div>
                  <button onClick={() => setAiResult(null)} className="cursor-pointer rounded-lg border-none text-[10px]" style={{ padding: "4px 8px", background: "transparent", border: "1px solid var(--brd)", color: "var(--t3)" }}>
                    ↺ Заново
                  </button>
                </div>

                <pre className="whitespace-pre-wrap text-[11px]" style={{ fontFamily: "inherit", lineHeight: 1.6, color: "var(--t1)", maxHeight: 500, overflow: "auto" }}>{aiResult.content}</pre>

                {aiResult.suggestions && aiResult.suggestions.length > 0 && (
                  <div className="rounded-lg p-3 mt-3" style={{ background: "#A855F710", border: "1px solid #A855F730" }}>
                    <div className="text-[10px] font-bold mb-1" style={{ color: "#A855F7" }}>✦ Рекомендации Жанары:</div>
                    <ul className="text-[10px] pl-4" style={{ color: "var(--t2)" }}>
                      {aiResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button onClick={saveDocument} className="flex-1 cursor-pointer rounded-lg border-none text-xs font-semibold" style={{ padding: "8px", background: "#10B98120", color: "#10B981" }}>
                    💾 Сохранить
                  </button>
                  <button onClick={copyToClipboard} className="flex-1 cursor-pointer rounded-lg border-none text-xs font-semibold" style={{ padding: "8px", background: "var(--accent-dim)", color: "var(--accent)" }}>
                    📋 Копировать
                  </button>
                  <button onClick={downloadAsPDF} className="flex-1 cursor-pointer rounded-lg border-none text-xs font-semibold" style={{ padding: "8px", background: "#EF444420", color: "#EF4444" }}>
                    📄 PDF
                  </button>
                </div>

                <div className="rounded-xl p-3" style={{ background: "linear-gradient(135deg, #A855F710, #6366F110)", border: "1px solid #A855F730" }}>
                  <div className="text-[11px] font-bold mb-2" style={{ color: "#A855F7" }}>✦ Улучшить документ</div>
                  <textarea value={improvePrompt} onChange={e => setImprovePrompt(e.target.value)}
                    placeholder="Что изменить или добавить..."
                    rows={2} className="mb-2" />
                  <button onClick={improveDocument} disabled={improving || !improvePrompt.trim()}
                    className="cursor-pointer rounded-lg border-none text-xs font-semibold w-full"
                    style={{ padding: "6px 12px", background: "linear-gradient(135deg, #A855F7, #6366F1)", color: "#fff", opacity: improving || !improvePrompt.trim() ? 0.5 : 1 }}>
                    {improving ? "Улучшаю..." : "✦ Применить улучшение"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "history" && (
        <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          {history.length === 0 ? (
            <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
              История пуста. Создайте первый документ!
            </div>
          ) : (
            history.map((doc, i) => (
              <div key={doc.id} onClick={() => setViewingDoc(doc)} style={{
                padding: "14px 18px",
                borderBottom: i < history.length - 1 ? "1px solid var(--brd)" : "none",
                cursor: "pointer",
                borderLeft: `3px solid ${doc.generation_method === "ai_freeform" ? "#A855F7" : "#3B82F6"}`,
              }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold">{doc.title}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>
                      {doc.template_name} · {new Date(doc.created_at).toLocaleString("ru-RU")}
                    </div>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                    background: doc.generation_method === "ai_freeform" ? "#A855F720" : "#3B82F620",
                    color: doc.generation_method === "ai_freeform" ? "#A855F7" : "#3B82F6",
                  }}>
                    {doc.generation_method === "ai_freeform" ? "✦ AI" : "📋 Шаблон"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>6 готовых шаблонов</b> сразу: договор услуг, акт выполненных работ, счёт на оплату, договор аренды, приказ Т-1, доверенность.<br/>
        💡 <b>AI-генерация</b> — для нестандартных документов: претензии, заявления, гарантийные письма и т.д.<br/>
        💡 <b>Реквизиты</b> вашей компании подставляются автоматически из профиля.<br/>
        💡 <b>Контрагенты</b> выбираются из вашего справочника — БИН, адрес, директор подтянутся сами.
      </div>
    </div>
  );
}
