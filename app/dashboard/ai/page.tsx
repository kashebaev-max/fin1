"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { executeAllTools, describeActionForUI, type ToolUse, type ToolResult } from "@/lib/ai-execute";

interface Message {
  role: "user" | "assistant";
  content: string;
  tool_uses?: ToolUse[];
  tool_results?: ToolResult[];
  pending_confirmation?: boolean;
  timestamp?: string;
}

const RISK_COLORS = {
  low:    { bg: "#10B98115", border: "#10B981", text: "#10B981", label: "Безопасно" },
  medium: { bg: "#F59E0B15", border: "#F59E0B", text: "#F59E0B", label: "Внимание" },
  high:   { bg: "#EF444415", border: "#EF4444", text: "#EF4444", label: "Высокий риск" },
};

export default function AIPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Привет! Я Жанара ✦ — твой AI-помощник Finstat.kz.\n\nМогу реально создавать данные в системе:\n• 👥 Контрагентов\n• 📦 Товары и услуги\n• 👤 Сотрудников\n• 📒 Бухгалтерские проводки\n• 📋 Заказы\n• 🏢 Основные средства\n• 📝 Документы (счета, акты)\n• 💰 Платежи\n\nВсе действия с твоим подтверждением. Что нужно сделать?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
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
      // assistant с tool_use — передаём блоками
      if (m.role === "assistant" && m.tool_uses && m.tool_uses.length > 0) {
        const blocks: any[] = [];
        if (m.content) {
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

      // user с результатами tools
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

      return { role: m.role, content: m.content };
    });

    try {
      const res = await fetch("/.netlify/functions/ai-zhanara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          messages: apiMessages,
          contextText: "Главный AI-чат /dashboard/ai. Пользователь может попросить создать любые данные.",
          enableTools: true,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `❌ Ошибка: ${data.error}`,
          timestamp: new Date().toISOString(),
        }]);
        setLoading(false);
        return;
      }

      const assistantMsg: Message = {
        role: "assistant",
        content: data.reply || "",
        tool_uses: data.tool_uses && data.tool_uses.length > 0 ? data.tool_uses : undefined,
        pending_confirmation: data.tool_uses && data.tool_uses.length > 0,
        timestamp: new Date().toISOString(),
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
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `❌ Ошибка сети: ${err.message}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const newMessages: Message[] = [
      ...messages,
      {
        role: "user",
        content: input.trim(),
        timestamp: new Date().toISOString(),
      },
    ];
    setMessages(newMessages);
    setInput("");

    await callAPI(newMessages);
  }

  async function confirmTools(currentMessages: Message[], messageIndex: number) {
    const msg = currentMessages[messageIndex];
    if (!msg.tool_uses || !userId) return;

    setLoading(true);

    const updatedMsgs = [...currentMessages];
    updatedMsgs[messageIndex] = { ...msg, pending_confirmation: false };
    setMessages(updatedMsgs);

    const results = await executeAllTools(supabase, userId, msg.tool_uses);

    const withResults: Message[] = [
      ...updatedMsgs,
      {
        role: "user",
        content: "",
        tool_results: results,
        timestamp: new Date().toISOString(),
      },
    ];
    setMessages(withResults);

    await callAPI(withResults);
  }

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
      timestamp: new Date().toISOString(),
    });
    setMessages(updated);

    callAPI(updated);
  }

  function clearHistory() {
    if (!confirm("Очистить историю диалога?")) return;
    setMessages([
      {
        role: "assistant",
        content: "История очищена. Начнём сначала! Что нужно сделать?",
        timestamp: new Date().toISOString(),
      },
    ]);
  }

  // Быстрые действия
  const quickActions = [
    { icon: "👥", label: "Создай контрагента ТОО Альфа с БИН 123456789012, тип клиент" },
    { icon: "📦", label: "Создай 3 товара: ноутбук 350000, мышка 5000, клавиатура 12000" },
    { icon: "👤", label: "Прими сотрудника Иванов Иван, ИИН 123456789012, должность бухгалтер, оклад 250000" },
    { icon: "📋", label: "Создай заказ для ТОО Альфа на сумму 580000" },
    { icon: "💰", label: "Зарегистрируй поступление 580000 от ТОО Альфа" },
  ];

  return (
    <div className="flex flex-col gap-4 h-full" style={{ minHeight: "calc(100vh - 100px)" }}>

      {/* Шапка */}
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #A855F710, #6366F110)", border: "1px solid #A855F730" }}>
        <div className="flex items-start gap-3">
          <span style={{ fontSize: 32 }}>✦</span>
          <div className="flex-1">
            <div className="text-base font-bold mb-1">Жанара — AI-помощник Finstat.kz</div>
            <div className="text-[12px]" style={{ color: "var(--t2)" }}>
              На базе Claude Sonnet 4.5. Знает всё о вашем бизнесе и может выполнять действия с вашим подтверждением.
            </div>
          </div>
          <button onClick={clearHistory}
            className="cursor-pointer rounded-lg border-none text-[10px] font-semibold"
            style={{ padding: "5px 10px", background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
            🗑 Очистить
          </button>
        </div>
      </div>

      {/* Авто-подтверждение */}
      <div className="rounded-xl p-3" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: "var(--t2)" }}>
          <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} />
          <span>⚡ Авто-подтверждать безопасные действия (создание контрагентов, товаров, документов)</span>
        </label>
      </div>

      {/* Чат */}
      <div className="rounded-xl flex flex-col"
        style={{
          background: "var(--card)",
          border: "1px solid var(--brd)",
          flex: 1,
          minHeight: 500,
          maxHeight: "calc(100vh - 350px)",
        }}>

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
            <div style={{ alignSelf: "flex-start", padding: "10px 14px", background: "var(--bg)", borderRadius: 12, fontSize: 12, color: "var(--t3)" }}>
              ✦ Думаю...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Быстрые действия */}
        {messages.length <= 1 && (
          <div style={{ padding: "0 16px 12px 16px" }}>
            <div className="text-[10px] font-bold mb-2" style={{ color: "var(--t3)" }}>💡 Быстрые примеры:</div>
            <div className="flex gap-2 flex-wrap">
              {quickActions.map((qa, i) => (
                <button key={i} onClick={() => setInput(qa.label)}
                  className="cursor-pointer rounded-lg border-none text-[10px] text-left"
                  style={{ padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t2)", maxWidth: 280 }}>
                  <span style={{ marginRight: 6 }}>{qa.icon}</span>{qa.label.slice(0, 40)}...
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ввод */}
        <div style={{ padding: 12, borderTop: "1px solid var(--brd)", background: "var(--bg)" }}>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Спросите Жанару... (Enter — отправить, Shift+Enter — новая строка)"
              rows={2}
              style={{ flex: 1, padding: "10px 12px", fontSize: 13, background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 8, color: "var(--t1)", resize: "none" }}
            />
            <button onClick={sendMessage} disabled={loading || !input.trim()}
              className="cursor-pointer rounded-lg border-none font-semibold"
              style={{
                padding: "10px 18px",
                background: "linear-gradient(135deg, #A855F7, #6366F1)",
                color: "#fff", fontSize: 13,
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}>
              {loading ? "..." : "Отправить ▶"}
            </button>
          </div>
        </div>
      </div>

      {/* Инфо */}
      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Жанара использует tool_use API</b> — каждое действие требует подтверждения. Без вашего «✓ Выполнить» ничего не создаётся.<br/>
        💡 <b>Авто-подтверждение</b> можно включить для массовых операций (создание контрагентов, товаров).<br/>
        💡 Если Жанара пишет «создал», но карточка подтверждения не появилась — это <b>ошибка системы</b>, сообщите в поддержку.
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
  const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";

  // Сообщение с результатами tools
  if (hasToolResults) {
    return (
      <div style={{ background: "var(--bg)", borderRadius: 12, padding: 12, fontSize: 11, alignSelf: "flex-start", maxWidth: "85%" }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--t3)", fontSize: 10 }}>📋 РЕЗУЛЬТАТЫ ВЫПОЛНЕНИЯ:</div>
        {message.tool_results!.map((r, i) => (
          <div key={i} style={{
            padding: "6px 10px", borderRadius: 6, marginBottom: 4,
            background: r.success ? "#10B98115" : "#EF444415",
            color: r.success ? "#059669" : "#DC2626",
            fontWeight: 500,
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
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>
        {!isUser && <span>✦ ЖАНАРА</span>}
        <span>{time}</span>
        {isUser && <span>ВЫ</span>}
      </div>

      {/* Текст */}
      {message.content && (
        <div style={{
          padding: "10px 14px", borderRadius: 12,
          background: isUser ? "linear-gradient(135deg, #A855F7, #6366F1)" : "var(--bg)",
          color: isUser ? "#fff" : "var(--t1)",
          fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
          border: isUser ? "none" : "1px solid var(--brd)",
        }}>
          {message.content}
        </div>
      )}

      {/* Карточки tool_use */}
      {message.tool_uses && message.tool_uses.length > 0 && (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>
            🤖 Жанара хочет выполнить {message.tool_uses.length} действи{message.tool_uses.length === 1 ? "е" : "я"}:
          </div>

          {message.tool_uses.map((tu, i) => {
            const desc = describeActionForUI(tu);
            const risk = RISK_COLORS[desc.risk];
            return (
              <div key={i} style={{
                background: "var(--bg)",
                border: `1px solid ${risk.border}40`,
                borderLeft: `3px solid ${risk.border}`,
                borderRadius: 10,
                padding: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 22 }}>{desc.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{desc.title}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)" }}>{desc.description}</div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    padding: "3px 8px", borderRadius: 4,
                    background: risk.bg, color: risk.text,
                  }}>{risk.label}</span>
                </div>

                {desc.paramsList.length > 0 && (
                  <div style={{ background: "var(--card)", borderRadius: 6, padding: 10, fontSize: 11, color: "var(--t2)" }}>
                    {desc.paramsList.map((p, idx) => (
                      <div key={idx} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "3px 0",
                        borderBottom: idx < desc.paramsList.length - 1 ? "1px solid var(--brd)" : "none",
                      }}>
                        <span style={{ color: "var(--t3)" }}>{p.label}:</span>
                        <span style={{ fontWeight: 600, marginLeft: 8, textAlign: "right", wordBreak: "break-all" }}>
                          {p.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Кнопки подтверждения */}
          {message.pending_confirmation && (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={onConfirm}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #10B981, #059669)",
                  color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                ✓ Выполнить всё ({message.tool_uses.length})
              </button>
              <button onClick={onCancel}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8,
                  background: "var(--card)", border: "1px solid var(--brd)",
                  color: "var(--t2)", fontSize: 13, fontWeight: 600, cursor: "pointer",
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
