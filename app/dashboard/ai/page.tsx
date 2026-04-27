"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { collectBusinessContext, contextToText, BusinessContext } from "@/lib/ai-context";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  { icon: "💰", text: "Как у меня с финансами сейчас?" },
  { icon: "📊", text: "Что должен сдать в этом месяце?" },
  { icon: "⚠️", text: "Какие у меня сейчас проблемы и риски?" },
  { icon: "📈", text: "Как идут продажи?" },
  { icon: "📦", text: "Что со складом и партиями?" },
  { icon: "👥", text: "Расскажи про моих сотрудников и ЗП" },
  { icon: "💡", text: "Что мне сделать прямо сейчас в первую очередь?" },
  { icon: "📅", text: "Какие ближайшие дедлайны по налогам?" },
];

export default function AIChatPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [sessionId] = useState(() => `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [contextStale, setContextStale] = useState(true);
  const [showContextPreview, setShowContextPreview] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { init(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Загружаем последние сообщения из истории (опционально, для непрерывности)
    const { data } = await supabase
      .from("ai_conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data && data.length > 0) {
      const sorted = data.reverse().map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
      }));
      setMessages(sorted);
    } else {
      // Приветствие
      setMessages([{
        role: "assistant",
        content: "Здравствуйте! Я — Жанара, ваш AI-консультант по бухгалтерии и налогам РК. Я вижу состояние вашего бизнеса в реальном времени и помогу разобраться с любыми вопросами. Можете задать вопрос или выбрать одну из быстрых тем ниже.",
        timestamp: new Date(),
      }]);
    }

    // Сразу собираем контекст
    refreshContext(user.id);
  }

  async function refreshContext(uid: string) {
    setContextLoading(true);
    try {
      const ctx = await collectBusinessContext(supabase, uid);
      setBusinessContext(ctx);
      setContextStale(false);
    } catch (err) {
      console.error("Context collect error:", err);
    } finally {
      setContextLoading(false);
    }
  }

  async function sendMessage(text?: string) {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    const userMsg: Message = { role: "user", content: userText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Если контекст устарел или не загружен — пересобираем
    let ctx = businessContext;
    if (!ctx || contextStale) {
      ctx = await collectBusinessContext(supabase, userId);
      setBusinessContext(ctx);
      setContextStale(false);
    }
    const ctxText = contextToText(ctx);

    // Сохраняем сообщение пользователя
    await supabase.from("ai_conversations").insert({
      user_id: userId,
      session_id: sessionId,
      role: "user",
      content: userText,
      business_context: ctx as any,
      current_module: "ai",
    });

    try {
      const apiMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/.netlify/functions/ai-zhanara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          messages: apiMessages,
          contextText: ctxText,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI API error: ${errText}`);
      }

      const data = await res.json();
      const assistantText = data.reply || "Извините, не получила ответ. Попробуйте ещё раз.";
      const assistantMsg: Message = { role: "assistant", content: assistantText, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMsg]);

      // Сохраняем ответ
      await supabase.from("ai_conversations").insert({
        user_id: userId,
        session_id: sessionId,
        role: "assistant",
        content: assistantText,
        current_module: "ai",
      });
    } catch (err: any) {
      const errorMsg: Message = {
        role: "assistant",
        content: `❌ Ошибка: ${err.message || err}. Проверьте, что в Netlify задана переменная ANTHROPIC_API_KEY.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    if (!confirm("Очистить историю диалога? Контекст бизнеса сохранится.")) return;
    await supabase.from("ai_conversations").delete().eq("user_id", userId);
    setMessages([{
      role: "assistant",
      content: "История очищена. Чем могу помочь?",
      timestamp: new Date(),
    }]);
  }

  return (
    <div className="flex flex-col gap-4" style={{ height: "calc(100vh - 140px)" }}>

      {/* Контекст индикатор */}
      <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--t3)" }}>
          <span style={{ fontSize: 16 }}>{contextLoading ? "🔄" : businessContext ? "🟢" : "🔴"}</span>
          {contextLoading
            ? "Собираю данные о вашем бизнесе..."
            : businessContext
              ? <>Жанара видит: касса <b>{businessContext.finance.cash.toLocaleString("ru-RU")} ₸</b> · банк <b>{businessContext.finance.bank.toLocaleString("ru-RU")} ₸</b> · выручка месяца <b>{businessContext.sales.revenueMTD.toLocaleString("ru-RU")} ₸</b> · {businessContext.hr.activeEmployees} сотрудников</>
              : "Контекст не загружен"
          }
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowContextPreview(!showContextPreview)}
            className="text-[10px] cursor-pointer border-none bg-transparent"
            style={{ color: "var(--accent)" }}>
            {showContextPreview ? "Скрыть" : "Показать"} контекст
          </button>
          <button
            onClick={() => userId && refreshContext(userId)}
            disabled={contextLoading}
            className="text-[10px] cursor-pointer border-none bg-transparent"
            style={{ color: "var(--accent)" }}>
            🔄 Обновить
          </button>
          <button
            onClick={clearHistory}
            className="text-[10px] cursor-pointer border-none bg-transparent"
            style={{ color: "#EF4444" }}>
            🗑 Очистить
          </button>
        </div>
      </div>

      {showContextPreview && businessContext && (
        <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--brd)", maxHeight: 200, overflow: "auto" }}>
          <pre className="text-[10px] whitespace-pre-wrap" style={{ color: "var(--t2)", fontFamily: "monospace" }}>{contextToText(businessContext)}</pre>
        </div>
      )}

      {/* Сообщения */}
      <div className="flex-1 rounded-xl p-4 overflow-y-auto" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="rounded-xl p-3"
                style={{
                  maxWidth: "80%",
                  background: m.role === "user" ? "var(--accent)" : "var(--bg)",
                  color: m.role === "user" ? "#fff" : "var(--t1)",
                  border: m.role === "user" ? "none" : "1px solid var(--brd)",
                }}>
                {m.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px]" style={{ color: "#A855F7", fontWeight: 700 }}>
                    <span>✦</span>
                    <span>ЖАНАРА</span>
                    <span style={{ color: "var(--t3)", fontWeight: 400, marginLeft: 4 }}>{m.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
                <div className="text-[12px]" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{m.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--brd)" }}>
                <div className="text-[11px]" style={{ color: "#A855F7" }}>✦ Жанара думает...</div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Быстрые подсказки */}
      {messages.length <= 1 && (
        <div className="grid grid-cols-4 gap-2">
          {QUICK_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => sendMessage(p.text)}
              disabled={loading}
              className="rounded-lg p-2.5 text-left cursor-pointer transition-all border-none"
              style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <span style={{ fontSize: 16, marginRight: 6 }}>{p.icon}</span>
              <span className="text-[11px]">{p.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* Ввод */}
      <div className="rounded-xl p-3 flex gap-2" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Спросите Жанару... (Enter — отправить)"
          disabled={loading}
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--brd)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--t1)" }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer"
          style={{ background: "var(--accent)", opacity: loading || !input.trim() ? 0.5 : 1 }}>
          Отправить →
        </button>
      </div>
    </div>
  );
}
