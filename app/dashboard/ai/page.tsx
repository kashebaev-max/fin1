"use client";

import { useState, useRef, useEffect } from "react";

export default function AIPage() {
  const [messages, setMessages] = useState([
    { role: "ai" as const, text: "Сәлеметсіз бе! Мен Жанара — AI-бухгалтер. Все расчёты по НК РК 2026 (НДС 16%, ИПН 10%/15%, вычет 30 МРП). Спрашивайте!" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
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
    "Ставки налогов 2026", "Рассчитай зарплату 400 000 ₸",
    "НДС 16% — что изменилось?", "МРП и показатели 2026",
    "Сроки отчётности", "Как считать ИПН?", "Проводки по зарплате",
  ];

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 160px)" }}>
      {/* Quick questions */}
      <div className="flex flex-wrap gap-2">
        {quickQ.map((q, i) => (
          <button key={i} onClick={() => setInput(q)}
            className="px-3 py-1.5 rounded-2xl text-[11px] font-medium cursor-pointer transition-all hover:opacity-80"
            style={{ border: "1px solid var(--brd)", background: "transparent", color: "var(--t3)" }}>
            {q}
          </button>
        ))}
      </div>

      {/* Chat */}
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
                  <div className="text-[10px] font-bold mb-1 tracking-wider" style={{ color: "#A855F7" }}>✦ AI ЖАНАРА • НК РК 2026</div>
                )}
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="self-start px-4 py-3 rounded-xl text-[13px]"
              style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
              Анализирую по НК РК 2026...
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2 p-4" style={{ borderTop: "1px solid var(--brd)" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Спросите Жанару о налогах, зарплатах, отчётности..."
            className="flex-1"
          />
          <button onClick={send} disabled={loading}
            className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            →
          </button>
        </div>
      </div>
    </div>
  );
}
