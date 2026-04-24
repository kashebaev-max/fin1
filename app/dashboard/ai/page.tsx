"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

interface Insight {
  type: "warning" | "info" | "success";
  icon: string;
  title: string;
  detail: string;
  action?: string;
  href?: string;
}

export default function AIPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<{role: "ai" | "user"; text: string}[]>([
    { role: "ai" as const, text: "Сәлеметсіз бе! Я Жанара — ваш AI-ассистент. Я вижу все данные вашей компании и могу помочь с налогами, анализом финансов, напомнить о сроках. Задавайте любые вопросы!" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadInsights(); }, []);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  async function loadInsights() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setInsightsLoading(false); return; }

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const [docs, emps, prods, cashOps, bankOps, journal] = await Promise.all([
      supabase.from("documents").select("*").eq("user_id", user.id),
      supabase.from("employees").select("*").eq("user_id", user.id).eq("status", "active"),
      supabase.from("products").select("*").eq("user_id", user.id),
      supabase.from("cash_operations").select("*").eq("user_id", user.id),
      supabase.from("bank_operations").select("*").eq("user_id", user.id),
      supabase.from("journal_entries").select("*").eq("user_id", user.id),
    ]);

    const allDocs = docs.data || [];
    const allProds = prods.data || [];
    const journalList = journal.data || [];

    const newInsights: Insight[] = [];

    // Непроведённые документы
    const draftDocs = allDocs.filter((d: any) => d.status === "draft");
    if (draftDocs.length > 0) {
      newInsights.push({
        type: "warning", icon: "📝",
        title: `${draftDocs.length} документов не проведены`,
        detail: `Документы в статусе "Черновик" не попадают в бухгалтерию и склад. Проведите их.`,
        action: "Открыть документы", href: "/dashboard/documents",
      });
    }

    // Заканчивается на складе
    const lowStock = allProds.filter((p: any) => Number(p.quantity) < Number(p.min_quantity) && Number(p.min_quantity) > 0);
    if (lowStock.length > 0) {
      newInsights.push({
        type: "warning", icon: "📦",
        title: `${lowStock.length} товаров заканчиваются`,
        detail: `На складе ниже минимального остатка: ${lowStock.slice(0, 3).map((p: any) => p.name).join(", ")}${lowStock.length > 3 ? " и другие" : ""}. Пора закупать.`,
        action: "Открыть склад", href: "/dashboard/warehouse",
      });
    }

    // Дебиторка
    const debit1210 = journalList.filter((e: any) => e.debit_account === "1210").reduce((a: number, e: any) => a + Number(e.amount), 0);
    const credit1210 = journalList.filter((e: any) => e.credit_account === "1210").reduce((a: number, e: any) => a + Number(e.amount), 0);
    const receivables = Math.max(0, debit1210 - credit1210);
    if (receivables > 500000) {
      newInsights.push({
        type: "warning", icon: "💼",
        title: `Дебиторка: ${fmtMoney(receivables)} ₸`,
        detail: `Контрагенты должны вам крупную сумму. Напомните о задолженности — проведите акты сверки.`,
        action: "Акт сверки", href: "/dashboard/accounting",
      });
    }

    // НДС
    const ndsCollected = allDocs.filter((d: any) => d.doc_date >= monthStart && Number(d.nds_sum) > 0 && d.status === "done")
      .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
    const ndsPaid = allDocs.filter((d: any) => d.doc_date >= monthStart && d.doc_type === "receipt")
      .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
    const ndsPayable = Math.max(0, ndsCollected - ndsPaid);
    if (ndsPayable > 50000) {
      newInsights.push({
        type: "info", icon: "⚖",
        title: `НДС к уплате: ${fmtMoney(ndsPayable)} ₸`,
        detail: `По результатам месяца нужно будет уплатить НДС. Срок — до 25 числа следующего месяца. Готовьте средства.`,
        action: "Отчёт ФНО 300", href: "/dashboard/reports",
      });
    }

    // Сроки ФНО
    const today = new Date();
    const dayOfMonth = today.getDate();
    const monthNum = today.getMonth() + 1;

    if ([15, 25].includes(dayOfMonth) || (dayOfMonth >= 10 && dayOfMonth <= 14)) {
      if (dayOfMonth <= 15 && [2, 5, 8, 11].includes(monthNum)) {
        newInsights.push({
          type: "warning", icon: "📅",
          title: "Скоро срок сдачи ФНО 200 и 300",
          detail: `До 15 числа нужно сдать декларации по ИПН/СН (ФНО 200) и НДС (ФНО 300) за квартал.`,
          action: "Открыть отчёты", href: "/dashboard/reports",
        });
      }
    }

    // Если всё в порядке
    if (newInsights.length === 0) {
      newInsights.push({
        type: "success", icon: "✅",
        title: "Всё под контролем",
        detail: "Срочных задач нет. Продолжайте работу. Я рядом, если понадобится совет.",
      });
    }

    setInsights(newInsights);
    setInsightsLoading(false);
  }

  async function send(msgText?: string) {
    const userMsg = (msgText || input).trim();
    if (!userMsg || loading) return;
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "ai", text: data.reply || "Не удалось получить ответ." }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Ошибка соединения. Попробуйте позже." }]);
    } finally {
      setLoading(false);
    }
  }

  const quickQ = [
    "Что у меня с деньгами?",
    "Покажи непроведённые документы",
    "Какая у меня дебиторка?",
    "Когда сдавать ФНО 300?",
    "Рассчитай зарплату 400 000 ₸",
    "Что купить на склад?",
  ];

  const insightColors: Record<string, { bg: string; color: string }> = {
    warning: { bg: "#F59E0B15", color: "#F59E0B" },
    info: { bg: "#6366F115", color: "#6366F1" },
    success: { bg: "#10B98115", color: "#10B981" },
  };

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
      {/* Left: Insights panel */}
      <aside className="w-80 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        <div>
          <div className="text-xs font-bold tracking-widest mb-1" style={{ color: "#A855F7" }}>✦ АНАЛИЗ ОТ ЖАНАРЫ</div>
          <div className="text-[11px]" style={{ color: "var(--t3)" }}>Что важно знать прямо сейчас</div>
        </div>

        {insightsLoading ? (
          <div className="text-xs py-8 text-center" style={{ color: "var(--t3)" }}>Анализирую данные...</div>
        ) : (
          insights.map((ins, i) => (
            <div key={i} className="rounded-xl p-4"
              style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${insightColors[ins.type].color}` }}>
              <div className="flex items-start gap-2 mb-2">
                <span className="text-base flex-shrink-0">{ins.icon}</span>
                <div className="flex-1">
                  <div className="text-xs font-bold mb-1" style={{ color: insightColors[ins.type].color }}>{ins.title}</div>
                  <div className="text-[11px]" style={{ color: "var(--t2)", lineHeight: 1.5 }}>{ins.detail}</div>
                </div>
              </div>
              {ins.action && ins.href && (
                <a href={ins.href} className="text-[11px] font-semibold no-underline block mt-2"
                  style={{ color: insightColors[ins.type].color }}>
                  {ins.action} →
                </a>
              )}
            </div>
          ))
        )}

        <div className="rounded-xl p-4 mt-2" style={{ background: "linear-gradient(135deg, #6366F110, #A855F710)", border: "1px solid #A855F730" }}>
          <div className="text-[10px] font-bold tracking-wider mb-1" style={{ color: "#A855F7" }}>💡 СОВЕТ</div>
          <div className="text-[11px]" style={{ color: "var(--t2)", lineHeight: 1.5 }}>
            Задавайте мне вопросы о вашем бизнесе. Я вижу документы, деньги, склад и могу дать конкретный совет — не общий.
          </div>
        </div>
      </aside>

      {/* Right: Chat */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {quickQ.map((q, i) => (
            <button key={i} onClick={() => send(q)}
              className="px-3 py-1.5 rounded-2xl text-[11px] font-medium cursor-pointer transition-all hover:opacity-80"
              style={{ border: "1px solid var(--brd)", background: "transparent", color: "var(--t3)" }}>
              {q}
            </button>
          ))}
        </div>

        <div className="flex-1 rounded-xl flex flex-col overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div ref={chatRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            {messages.map((m, i) => (
              <div key={i} className="flex" style={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div
                  className="max-w-[80%] px-4 py-3 text-[13px] whitespace-pre-line"
                  style={{
                    borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: m.role === "user" ? "var(--accent)" : "var(--bg)",
                    color: m.role === "user" ? "#fff" : "var(--t1)",
                    border: m.role === "ai" ? "1px solid var(--brd)" : "none",
                    lineHeight: 1.6,
                  }}
                >
                  {m.role === "ai" && (
                    <div className="text-[10px] font-bold mb-1 tracking-wider" style={{ color: "#A855F7" }}>✦ AI ЖАНАРА</div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="self-start px-4 py-3 rounded-xl text-[13px]"
                style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
                Анализирую ваши данные...
              </div>
            )}
          </div>

          <div className="flex gap-2 p-4" style={{ borderTop: "1px solid var(--brd)" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Спросите о ваших финансах, документах, налогах..."
              className="flex-1"
            />
            <button onClick={() => send()} disabled={loading}
              className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)" }}>
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
