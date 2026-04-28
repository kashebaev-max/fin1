"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { collectBusinessContext, contextToText, BusinessContext } from "@/lib/ai-context";
import { getModuleContext } from "@/lib/module-contexts";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Props {
  onClose: () => void;
  moduleKey: string;
}

export default function JanaraSidePanel({ onClose, moduleKey }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [contextReady, setContextReady] = useState(false);
  const [sessionId] = useState(() => `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const moduleCtx = getModuleContext(moduleKey);

  useEffect(() => {
    init();
    // ESC для закрытия
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Стартовое приветствие — учитывает модуль
    const greeting = moduleCtx
      ? `Здравствуйте! Я вижу, что вы сейчас в модуле «${moduleCtx.name}». ${moduleCtx.expertise.split(",")[0]}. Чем могу помочь?`
      : "Здравствуйте! Чем могу помочь?";

    setMessages([{
      role: "assistant",
      content: greeting,
      timestamp: new Date(),
    }]);

    // Собираем контекст бизнеса в фоне
    try {
      const ctx = await collectBusinessContext(supabase, user.id);
      setBusinessContext(ctx);
      setContextReady(true);
    } catch (err) {
      console.error("Context error:", err);
    }
  }

  async function sendMessage(text?: string) {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    const userMsg: Message = { role: "user", content: userText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    let ctx = businessContext;
    if (!ctx) {
      ctx = await collectBusinessContext(supabase, userId);
      setBusinessContext(ctx);
    }

    // Усиливаем контекст инфой про текущий модуль
    let ctxText = contextToText(ctx);
    if (moduleCtx) {
      ctxText = `=== ТЕКУЩИЙ МОДУЛЬ ПОЛЬЗОВАТЕЛЯ: ${moduleCtx.name} ===
${moduleCtx.description}
ТВОЯ ЭКСПЕРТИЗА ЗДЕСЬ: ${moduleCtx.expertise}
ЧТО НА ЭКРАНЕ: ${moduleCtx.dataHint}
=== КОНЕЦ ОПИСАНИЯ МОДУЛЯ ===

${ctxText}`;
    }

    // Сохраняем сообщение
    await supabase.from("ai_conversations").insert({
      user_id: userId,
      session_id: sessionId,
      role: "user",
      content: userText,
      current_module: moduleKey,
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
        throw new Error(`AI: ${errText}`);
      }

      const data = await res.json();
      const reply = data.reply || "Извините, не получила ответ.";
      const assistantMsg: Message = { role: "assistant", content: reply, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMsg]);

      await supabase.from("ai_conversations").insert({
        user_id: userId,
        session_id: sessionId,
        role: "assistant",
        content: reply,
        current_module: moduleKey,
      });
    } catch (err: any) {
      const errorMsg: Message = {
        role: "assistant",
        content: `❌ Ошибка: ${err.message || err}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Затемнение */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 50,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Панель */}
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        maxWidth: "95vw",
        background: "var(--card)",
        borderLeft: "1px solid var(--brd)",
        boxShadow: "-10px 0 40px rgba(0,0,0,0.3)",
        zIndex: 51,
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Шапка */}
        <div style={{
          padding: "16px 18px",
          borderBottom: "1px solid var(--brd)",
          background: "linear-gradient(135deg, #A855F7, #6366F1)",
          color: "#fff",
        }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 22 }}>✦</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Жанара</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>
                  {moduleCtx ? `Эксперт по «${moduleCtx.name}»` : "AI-консультант"}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="cursor-pointer border-none bg-transparent"
              style={{ color: "#fff", fontSize: 22, padding: 4, lineHeight: 1 }}
              title="Закрыть (ESC)">×</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.85 }}>
            {contextReady ? "🟢 Вижу состояние бизнеса" : "🔄 Изучаю данные..."}
          </div>
        </div>

        {/* Сообщения */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
          <div className="flex flex-col gap-2.5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="rounded-xl"
                  style={{
                    maxWidth: "88%",
                    padding: "8px 12px",
                    background: m.role === "user" ? "var(--accent)" : "var(--bg)",
                    color: m.role === "user" ? "#fff" : "var(--t1)",
                    border: m.role === "user" ? "none" : "1px solid var(--brd)",
                  }}>
                  {m.role === "assistant" && (
                    <div className="flex items-center gap-1 mb-1" style={{ fontSize: 9, color: "#A855F7", fontWeight: 700 }}>
                      <span>✦ ЖАНАРА</span>
                      <span style={{ color: "var(--t3)", fontWeight: 400, marginLeft: 4 }}>{m.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{m.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl" style={{ padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--brd)", fontSize: 11, color: "#A855F7" }}>
                  ✦ Жанара думает...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Быстрые подсказки (только при пустом чате) */}
        {messages.length <= 1 && moduleCtx && moduleCtx.commonQuestions.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--brd)", background: "var(--bg)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              💡 Часто спрашивают
            </div>
            <div className="flex flex-col gap-1">
              {moduleCtx.commonQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  className="rounded-lg cursor-pointer border-none text-left"
                  style={{ padding: "6px 10px", background: "var(--card)", border: "1px solid var(--brd)", fontSize: 11, color: "var(--t2)" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ввод */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--brd)", display: "flex", gap: 6 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Спросите Жанару..."
            disabled={loading}
            autoFocus
            style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--brd)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--t1)" }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="cursor-pointer border-none rounded-lg"
            style={{ padding: "8px 14px", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, opacity: loading || !input.trim() ? 0.5 : 1 }}>
            →
          </button>
        </div>

        {/* Футер */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--brd)", textAlign: "center", background: "var(--bg)" }}>
          <button
            onClick={() => { onClose(); router.push("/dashboard/ai"); }}
            className="cursor-pointer border-none bg-transparent"
            style={{ color: "var(--accent)", fontSize: 10 }}>
            Открыть полный чат с историей →
          </button>
        </div>
      </div>
    </>
  );
}
