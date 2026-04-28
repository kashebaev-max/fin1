"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { HELP_SECTIONS, findArticle, searchArticles, type HelpArticle, type HelpSection, type HelpStep } from "@/lib/help-content";

const DIFFICULTY_BADGES = {
  beginner: { label: "🟢 Новичок", color: "#10B981" },
  intermediate: { label: "🟡 Средний", color: "#F59E0B" },
  advanced: { label: "🔴 Сложный", color: "#EF4444" },
};

export default function HelpPage() {
  const router = useRouter();
  const [selectedSection, setSelectedSection] = useState<string>("getting-started");
  const [selectedArticle, setSelectedArticle] = useState<string | null>("registration");
  const [search, setSearch] = useState("");

  const currentSection = HELP_SECTIONS.find(s => s.key === selectedSection);
  const currentArticle = selectedArticle ? findArticle(selectedArticle) : null;

  const searchResults = useMemo(() => {
    return search.trim() ? searchArticles(search) : [];
  }, [search]);

  function selectArticle(sectionKey: string, articleKey: string) {
    setSelectedSection(sectionKey);
    setSelectedArticle(articleKey);
    setSearch("");
    // Прокрутка вверх
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }

  function printArticle() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ═══ ШАПКА ═══ */}
      <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #6366F110, #A855F710)", border: "1px solid #6366F130" }}>
        <div className="flex items-start gap-3">
          <span style={{ fontSize: 32 }}>📚</span>
          <div className="flex-1">
            <div className="text-base font-bold mb-1">Справочный центр Finstat.kz</div>
            <div className="text-[12px]" style={{ color: "var(--t2)" }}>
              Подробные пошаговые инструкции по всем функциям системы. {HELP_SECTIONS.length} разделов · {HELP_SECTIONS.reduce((s, x) => s + x.articles.length, 0)} статей.
            </div>
          </div>
        </div>

        {/* Поиск */}
        <div className="mt-4">
          <div style={{ position: "relative" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Поиск по инструкциям..."
              style={{ width: "100%", padding: "10px 14px", fontSize: 13, background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 8, color: "var(--t1)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 16 }}>×</button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ РЕЗУЛЬТАТЫ ПОИСКА ═══ */}
      {search && searchResults.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">Найдено {searchResults.length} статей:</div>
          <div className="flex flex-col gap-2">
            {searchResults.map(({ sectionKey, article }) => {
              const section = HELP_SECTIONS.find(s => s.key === sectionKey);
              return (
                <button key={`${sectionKey}-${article.key}`} onClick={() => selectArticle(sectionKey, article.key)}
                  className="text-left rounded-lg cursor-pointer border-none transition-all"
                  style={{ padding: "10px 14px", background: "var(--bg)", borderLeft: `3px solid ${section?.color || "#6366F1"}` }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 18 }}>{article.icon}</span>
                    <div>
                      <div className="text-[12px] font-bold">{article.title}</div>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                        {section?.title} · {article.estimatedTime}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {search && searchResults.length === 0 && (
        <div className="rounded-xl p-6 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🤔</div>
          <div className="text-sm font-bold mb-1">Ничего не найдено</div>
          <div className="text-[11px]" style={{ color: "var(--t3)" }}>Попробуйте другой запрос или спросите Жанару — она знает всё!</div>
        </div>
      )}

      {/* ═══ ОСНОВНОЕ СОДЕРЖАНИЕ ═══ */}
      {!search && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ═══ НАВИГАЦИЯ ПО РАЗДЕЛАМ (СЛЕВА) ═══ */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)" }}>Разделы инструкций</div>

            {HELP_SECTIONS.map(section => (
              <div key={section.key} className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: `1px solid ${selectedSection === section.key ? section.color : "var(--brd)"}` }}>
                <button onClick={() => { setSelectedSection(section.key); setSelectedArticle(section.articles[0]?.key || null); }}
                  className="w-full text-left cursor-pointer border-none flex items-center gap-3 transition-all"
                  style={{ padding: "10px 12px", background: selectedSection === section.key ? section.color + "15" : "transparent" }}>
                  <span style={{ fontSize: 20 }}>{section.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold" style={{ color: selectedSection === section.key ? section.color : "var(--t1)" }}>{section.title}</div>
                    <div className="text-[9px]" style={{ color: "var(--t3)" }}>{section.articles.length} статей</div>
                  </div>
                </button>

                {selectedSection === section.key && (
                  <div style={{ padding: "0 6px 6px 6px", background: section.color + "08" }}>
                    {section.articles.map(article => (
                      <button key={article.key} onClick={() => selectArticle(section.key, article.key)}
                        className="w-full text-left cursor-pointer border-none rounded-lg transition-all flex items-center gap-2"
                        style={{
                          padding: "6px 10px",
                          background: selectedArticle === article.key ? section.color + "20" : "transparent",
                          color: selectedArticle === article.key ? section.color : "var(--t2)",
                          fontWeight: selectedArticle === article.key ? 600 : 400,
                          marginTop: 2,
                        }}>
                        <span style={{ fontSize: 12, opacity: 0.8 }}>{article.icon}</span>
                        <span className="text-[11px]">{article.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
              💡 Не нашли ответ? <button onClick={() => router.push("/dashboard/ai")} className="cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)", textDecoration: "underline" }}>Спросите Жанару</button> — она знает всё о вашем бизнесе.
            </div>
          </div>

          {/* ═══ КОНТЕНТ СТАТЬИ (СПРАВА) ═══ */}
          <div className="lg:col-span-8 xl:col-span-9">
            {currentArticle ? (
              <ArticleView article={currentArticle.article} section={currentArticle.section} onSelectArticle={selectArticle} onPrint={printArticle} />
            ) : currentSection ? (
              <SectionOverview section={currentSection} onSelectArticle={(articleKey) => selectArticle(currentSection.key, articleKey)} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SECTION OVERVIEW (если статья не выбрана)
// ═══════════════════════════════════════════
function SectionOverview({ section, onSelectArticle }: { section: HelpSection; onSelectArticle: (key: string) => void }) {
  return (
    <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)", padding: 24 }}>
      <div className="flex items-center gap-3 mb-3">
        <span style={{ fontSize: 36 }}>{section.icon}</span>
        <div>
          <div className="text-xl font-bold">{section.title}</div>
          <div className="text-[12px]" style={{ color: "var(--t3)" }}>{section.description}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        {section.articles.map(article => {
          const diffBadge = DIFFICULTY_BADGES[article.difficulty];
          return (
            <button key={article.key} onClick={() => onSelectArticle(article.key)}
              className="text-left rounded-xl cursor-pointer border-none transition-all"
              style={{ padding: 16, background: "var(--bg)", borderLeft: `3px solid ${section.color}` }}>
              <div className="flex items-start gap-3">
                <span style={{ fontSize: 24 }}>{article.icon}</span>
                <div className="flex-1">
                  <div className="text-[13px] font-bold mb-1">{article.title}</div>
                  <div className="text-[10px] mb-2" style={{ color: "var(--t3)" }}>{article.description}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: diffBadge.color + "20", color: diffBadge.color }}>
                      {diffBadge.label}
                    </span>
                    <span className="text-[9px]" style={{ color: "var(--t3)" }}>⏱ {article.estimatedTime}</span>
                    <span className="text-[9px]" style={{ color: "var(--t3)" }}>· {article.steps.length} шагов</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ARTICLE VIEW (выбранная статья)
// ═══════════════════════════════════════════
function ArticleView({ article, section, onSelectArticle, onPrint }: {
  article: HelpArticle;
  section: HelpSection;
  onSelectArticle: (sectionKey: string, articleKey: string) => void;
  onPrint: () => void;
}) {
  const diffBadge = DIFFICULTY_BADGES[article.difficulty];
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  function toggleStep(idx: number) {
    const next = new Set(completedSteps);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setCompletedSteps(next);
  }

  return (
    <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)", padding: 24 }}>

      {/* Хлебные крошки */}
      <div className="flex items-center gap-1.5 text-[10px] mb-3" style={{ color: "var(--t3)" }}>
        <span>📚 Инструкции</span>
        <span>›</span>
        <span style={{ color: section.color }}>{section.title}</span>
        <span>›</span>
        <span style={{ color: "var(--t1)" }}>{article.title}</span>
      </div>

      {/* Заголовок статьи */}
      <div className="flex items-start gap-4 mb-4">
        <span style={{ fontSize: 40 }}>{article.icon}</span>
        <div className="flex-1">
          <h1 className="text-xl font-bold mb-1">{article.title}</h1>
          <div className="text-[12px] mb-3" style={{ color: "var(--t2)" }}>{article.description}</div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: diffBadge.color + "20", color: diffBadge.color }}>
              {diffBadge.label}
            </span>
            <span className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--bg)", color: "var(--t3)" }}>⏱ {article.estimatedTime}</span>
            <span className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--bg)", color: "var(--t3)" }}>📋 {article.steps.length} шагов</span>
            <button onClick={onPrint} className="cursor-pointer rounded-lg border-none text-[10px] font-semibold ml-auto" style={{ padding: "5px 10px", background: "var(--accent-dim)", color: "var(--accent)" }}>
              🖨 Печать / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Прогресс */}
      <div className="rounded-lg p-3 mb-4" style={{ background: "var(--bg)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-bold">Ваш прогресс</div>
          <div className="text-[11px]" style={{ color: "var(--t3)" }}>{completedSteps.size} из {article.steps.length}</div>
        </div>
        <div style={{ height: 6, background: "var(--card)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${(completedSteps.size / article.steps.length) * 100}%`,
            background: "linear-gradient(90deg, #10B981, #059669)",
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      {/* Шаги */}
      <div className="flex flex-col gap-3">
        {article.steps.map((step, idx) => (
          <StepCard key={idx} step={step} index={idx} completed={completedSteps.has(idx)} onToggle={() => toggleStep(idx)} sectionColor={section.color} />
        ))}
      </div>

      {/* Связанные статьи */}
      {article.relatedArticles && article.relatedArticles.length > 0 && (
        <div className="rounded-xl p-4 mt-5" style={{ background: "var(--bg)" }}>
          <div className="text-[12px] font-bold mb-3">📖 Также может быть полезно:</div>
          <div className="flex flex-col gap-2">
            {article.relatedArticles.map(key => {
              const found = findArticle(key);
              if (!found) return null;
              return (
                <button key={key} onClick={() => onSelectArticle(found.section.key, found.article.key)}
                  className="text-left rounded-lg cursor-pointer border-none transition-all flex items-center gap-2"
                  style={{ padding: "8px 12px", background: "var(--card)", borderLeft: `3px solid ${found.section.color}` }}>
                  <span style={{ fontSize: 16 }}>{found.article.icon}</span>
                  <div>
                    <div className="text-[12px] font-bold">{found.article.title}</div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>{found.section.title} · ⏱ {found.article.estimatedTime}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Помощь Жанары */}
      <div className="rounded-xl p-4 mt-4" style={{ background: "linear-gradient(135deg, #A855F710, #6366F110)", border: "1px solid #A855F730" }}>
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 22 }}>✦</span>
          <div className="text-[12px] font-bold" style={{ color: "#A855F7" }}>Не получилось? Спросите Жанару</div>
        </div>
        <div className="text-[11px]" style={{ color: "var(--t2)" }}>
          AI-ассистент Жанара знает все детали системы и сможет помочь с конкретно вашей ситуацией. Кликните на ✦ в правом нижнем углу.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP CARD
// ═══════════════════════════════════════════
function StepCard({ step, index, completed, onToggle, sectionColor }: {
  step: HelpStep;
  index: number;
  completed: boolean;
  onToggle: () => void;
  sectionColor: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{
      background: completed ? "#10B98108" : "var(--bg)",
      border: `1px solid ${completed ? "#10B98140" : "var(--brd)"}`,
    }}>
      <div style={{ padding: 16 }}>
        <div className="flex items-start gap-3">
          {/* Чекбокс */}
          <button onClick={onToggle}
            className="cursor-pointer rounded-full border-none flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              width: 28, height: 28,
              background: completed ? "#10B981" : "transparent",
              border: completed ? "none" : `2px solid ${sectionColor}`,
              color: completed ? "#fff" : sectionColor,
              fontSize: 14, fontWeight: 700,
            }}>
            {completed ? "✓" : index + 1}
          </button>

          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold mb-1" style={{ textDecoration: completed ? "line-through" : "none", color: completed ? "var(--t3)" : "var(--t1)" }}>
              Шаг {index + 1}: {step.title}
            </div>
            <div className="text-[12px]" style={{ color: "var(--t2)", lineHeight: 1.6 }}>{step.description}</div>

            {/* Скриншот (плейсхолдер) */}
            {step.screenshot && (
              <div className="rounded-lg mt-3 flex items-center justify-center" style={{
                background: "var(--card)",
                border: "1px dashed var(--brd)",
                aspectRatio: "16 / 9",
                color: "var(--t3)",
              }}>
                {/* Если есть реальный скриншот — будет img */}
                <img src={step.screenshot} alt={step.title}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling!.removeAttribute("hidden"); }}
                  style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }}
                />
                <div hidden className="text-center p-4">
                  <div style={{ fontSize: 28, marginBottom: 4 }}>📸</div>
                  <div className="text-[11px] font-bold">Скриншот будет добавлен</div>
                  <div className="text-[10px] mt-0.5">{step.screenshot}</div>
                </div>
              </div>
            )}

            {/* Совет */}
            {step.tip && (
              <div className="rounded-lg mt-3 p-3 text-[11px]" style={{ background: "#3B82F610", borderLeft: "3px solid #3B82F6", color: "var(--t2)" }}>
                💡 <b>Совет:</b> {step.tip}
              </div>
            )}

            {/* Предупреждение */}
            {step.warning && (
              <div className="rounded-lg mt-3 p-3 text-[11px]" style={{ background: "#F59E0B15", borderLeft: "3px solid #F59E0B", color: "var(--t2)" }}>
                ⚠ <b>Важно:</b> {step.warning}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
