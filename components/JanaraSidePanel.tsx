"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { executeAllTools, describeActionForUI, type ToolUse, type ToolResult } from "@/lib/ai-execute";

interface Message {
  role: "user" | "assistant";
  content: string | any[]; // string для простых, array для tool_use/tool_result
  tool_uses?: ToolUse[];   // если ассистент попросил вызвать tools
  tool_results?: ToolResult[]; // если выполнили tools
  pending_confirmation?: boolean; // ожидает подтверждения пользователя
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contextText?: string;
}

const RISK_COLORS = {
  low: { bg: "#10B98115", border: "#10B981", text: "#10B981", label: "Безопасно" },
  medium: { bg: "#F59E0B15", border: "#F59E0B", text: "#F59E0B", label: "Внимание" },
  high: { bg: "#EF444415", border: "#EF4444", text: "#EF4444", label: "Высокий риск" },
};

export default function JanaraSidePanel({ isOpen, onClose, contextText }: Props) {
  const supabase = createClient();
  const [userId, setUserId] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Привет! Я Жанара, твой AI-помощник. Могу создавать контрагентов, товары, сотрудников, проводки, заказы, ОС, документы, платежи. Все действия с твоим подтверждением. Что нужно сделать?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false); // автоматически подтверждать low-risk
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function callAPI(currentMessages: Message[]) {
    setLoading(true);

    // Преобразуем сообщения в формат API
    const apiMessages = currentMessages.map(m => {
      // Если у assistant был tool_use — передаём блоками
      if (m.role === "assistant" && m.tool_uses && m.tool_uses.length > 0) {
        const blocks: any[] = [];
        if (typeof m.content === "string" && m.content) {
          blocks.push({ type: "text", text: m.content });
        }
        for (const tu of m.tool_uses) {
          blocks.push({
            type: "tool_use",
            id: tu.id,
            name: tu.name,
            input: tu.input,
          });
        }
        return { role: "assistant", content: blocks };
      }

      // Если user отправляет результаты tools
      if (m.role === "user" && m.tool_results && m.tool_results.length > 0) {
        return {
          role: "user",
          content: m.tool_results.map(r => ({
            type: "tool_result",
            tool_use_id: r.tool_use_id,
            content: r.content,
          })),
        };
      }

      // Обычное сообщение
      return { role: m.role, content: m.content as string };
    });

    try {
      const res = await fetch("/.netlify/functions/ai-zhanara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          messages: apiMessages,
          contextText: contextText || "",
          enableTools: true,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `❌ Ошибка: ${data.error}` }]);
        setLoading(false);
        return;
      }

      const assistantMsg: Message = {
        role: "assistant",
        content: data.reply || "",
        tool_uses: data.tool_uses && data.tool_uses.length > 0 ? data.tool_uses : undefined,
        pending_confirmation: data.tool_uses && data.tool_uses.length > 0,
      };

      const updated = [...currentMessages, assistantMsg];
      setMessages(updated);

      // Автоподтверждение для low-risk если включено
      if (autoApprove && assistantMsg.tool_uses) {
        const allLowRisk = assistantMsg.tool_uses.every(tu => {
          const desc = describeActionForUI(tu);
          return desc.risk === "low";
        });
        if (allLowRisk) {
          await confirmTools(updated, updated.length - 1);
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `❌ Ошибка сети: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: input.trim() },
    ];
    setMessages(newMessages);
    setInput("");

    await callAPI(newMessages);
  }

  // Подтверждение и выполнение tool_use
  async function confirmTools(currentMessages: Message[], messageIndex: number) {
    const msg = currentMessages[messageIndex];
    if (!msg.tool_uses || !userId) return;

    setLoading(true);

    // Помечаем что подтверждение получено
    const updatedMsgs = [...currentMessages];
    updatedMsgs[messageIndex] = { ...msg, pending_confirmation: false };
    setMessages(updatedMsgs);

    // Выполняем все tools
    const results = await executeAllTools(supabase, userId, msg.tool_uses);

    // Добавляем сообщение с результатами от пользователя (для AI)
    const withResults: Message[] = [
      ...updatedMsgs,
      {
        role: "user",
        content: "",
        tool_results: results,
      },
    ];
    setMessages(withResults);

    // Отправляем результаты обратно Жанаре чтобы она прокомментировала
    await callAPI(withResults);
  }

  // Отмена tool_use
  function cancelTools(messageIndex: number) {
    const msg = messages[messageIndex];
    if (!msg.tool_uses) return;

    const fakeResults: ToolResult[] = msg.tool_uses.map(tu => ({
      tool_use_id: tu.id,
      content: "Пользователь отменил действие",
      success: false,
    }));

    const updated = [...messages];
    updated[messageIndex] = { ...msg, pending_confirmation: false };
    updated.push({
      role: "user",
      content: "",
      tool_results: fakeResults,
    });
    setMessages(updated);

    callAPI(updated);
  }

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, height: "100vh", width: "min(450px, 100vw)",
      background: "var(--bg)", borderLeft: "1px solid var(--brd)", zIndex: 1000,
      display: "flex", flexDirection: "column", boxShadow: "-8px 0 24px rgba(0,0,0,0.1)",
    }}>
      {/* Шапка */}
      <div style={{ padding: 16, borderBottom: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>✦</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Жанара</div>
            <div style={{ fontSize: 10, color: "var(--t3)" }}>AI-помощник Finstat.kz</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "var(--t3)" }}>×</button>
      </div>

      {/* Опция автоподтверждения */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--brd)", background: "var(--card)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", color: "var(--t2)" }}>
          <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} />
          Авто-подтверждать безопасные действия (создание контрагентов, товаров)
        </label>
      </div>

      {/* Сообщения */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg, i) => (
          <MessageView
            key={i}
            message={msg}
            messageIndex={i}
            onConfirm={() => confirmTools(messages, i)}
            onCancel={() => cancelTools(i)}
          />
        ))}
        {loading && (
          <div style={{ padding: 12, background: "var(--card)", borderRadius: 12, fontSize: 12, color: "var(--t3)" }}>
            ✦ Думаю...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Ввод */}
      <div style={{ padding: 12, borderTop: "1px solid var(--brd)", background: "var(--card)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Создай контрагента ТОО Альфа с БИН 123456789012..."
            rows={2}
            style={{ flex: 1, padding: "8px 10px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--brd)", borderRadius: 8, color: "var(--t1)", resize: "none" }}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            style={{
              padding: "8px 16px", background: "linear-gradient(135deg, #A855F7, #6366F1)",
              color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}>
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// КОМПОНЕНТ ОТОБРАЖЕНИЯ СООБЩЕНИЯ
// ═══════════════════════════════════════════

function MessageView({
  message, messageIndex, onConfirm, onCancel,
}: {
  message: Message;
  messageIndex: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isUser = message.role === "user";
  const hasToolResults = message.tool_results && message.tool_results.length > 0;

  // Сообщение с результатами выполнения tools — показываем компактно
  if (hasToolResults) {
    return (
      <div style={{ background: "var(--card)", borderRadius: 12, padding: 10, fontSize: 11 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--t3)" }}>📋 Результаты:</div>
        {message.tool_results!.map((r, i) => (
          <div key={i} style={{
            padding: "4px 8px", borderRadius: 6, marginBottom: 4,
            background: r.success ? "#10B98115" : "#EF444415",
            color: r.success ? "#059669" : "#DC2626",
          }}>
            {r.content}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "85%",
    }}>
      {/* Текст сообщения */}
      {typeof message.content === "string" && message.content && (
        <div style={{
          padding: "10px 14px", borderRadius: 12,
          background: isUser ? "linear-gradient(135deg, #A855F7, #6366F1)" : "var(--card)",
          color: isUser ? "#fff" : "var(--t1)",
          fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap",
          border: isUser ? "none" : "1px solid var(--brd)",
        }}>
          {message.content}
        </div>
      )}

      {/* Карточки tool_use с кнопками подтверждения */}
      {message.tool_uses && message.tool_uses.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>
            🤖 Жанара хочет выполнить {message.tool_uses.length} действи{message.tool_uses.length === 1 ? "е" : "я"}:
          </div>

          {message.tool_uses.map((tu, i) => {
            const desc = describeActionForUI(tu);
            const risk = RISK_COLORS[desc.risk];
            return (
              <div key={i} style={{
                background: "var(--card)", border: `1px solid ${risk.border}40`,
                borderLeft: `3px solid ${risk.border}`,
                borderRadius: 10, padding: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{desc.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{desc.title}</div>
                    <div style={{ fontSize: 10, color: "var(--t3)" }}>{desc.description}</div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    padding: "2px 6px", borderRadius: 4,
                    background: risk.bg, color: risk.text,
                  }}>{risk.label}</span>
                </div>

                {desc.paramsList.length > 0 && (
                  <div style={{ background: "var(--bg)", borderRadius: 6, padding: 8, fontSize: 10, color: "var(--t2)" }}>
                    {desc.paramsList.map((p, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span style={{ color: "var(--t3)" }}>{p.label}:</span>
                        <span style={{ fontWeight: 600 }}>{p.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Кнопки подтверждения (показываются только если pending) */}
          {message.pending_confirmation && (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={onConfirm}
                style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #10B981, #059669)",
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>
                ✓ Выполнить всё
              </button>
              <button onClick={onCancel}
                style={{
                  flex: 1, padding: "8px", borderRadius: 8,
                  background: "var(--card)", border: "1px solid var(--brd)",
                  color: "var(--t2)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                ✗ Отменить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
