"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const CATEGORIES = [
  { value: "question", label: "Вопрос" },
  { value: "problem", label: "Проблема / ошибка" },
  { value: "suggestion", label: "Предложение" },
  { value: "billing", label: "Оплата / подписка" },
  { value: "other", label: "Другое" },
];

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("question");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit() {
    if (message.trim().length < 5) {
      setError("Опишите вопрос подробнее (минимум 5 символов).");
      return;
    }
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          email: email.trim() || undefined,
          page_url: typeof window !== "undefined" ? window.location.href : pathname,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error || `Ошибка сервера (${res.status})`);
        return;
      }
      setDone(true);
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 2600);
    } catch {
      setError("Ошибка отправки. Проверьте интернет и попробуйте снова.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Поддержка"
          title="Поддержка — задать вопрос"
          className="cursor-pointer border-none flex items-center justify-center transition-all"
          style={{
            position: "fixed",
            bottom: 84,
            right: 26,
            width: 52,
            height: 52,
            background: "var(--card)",
            border: "1px solid var(--brd)",
            color: "var(--accent)",
            borderRadius: "50%",
            fontSize: 22,
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            zIndex: 40,
          }}
        >
          💬
        </button>
      )}

      {open && (
        <div
          onClick={() => !sending && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl w-full"
            style={{
              maxWidth: 460,
              background: "var(--card)",
              border: "1px solid var(--brd)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{ padding: "16px 20px", borderBottom: "1px solid var(--brd)" }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 18 }}>💬</span>
                <div>
                  <div className="text-sm font-bold">Связаться с поддержкой</div>
                  <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                    Мы ответим на указанный e-mail
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={sending}
                className="cursor-pointer border-none bg-transparent text-lg"
                style={{ color: "var(--t3)" }}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            {done ? (
              <div className="text-center" style={{ padding: "36px 24px" }}>
                <div style={{ fontSize: 40 }}>✅</div>
                <div className="text-sm font-bold mt-3">Обращение отправлено!</div>
                <div className="text-xs mt-1.5" style={{ color: "var(--t3)" }}>
                  Администратор получил уведомление и свяжется с вами.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3" style={{ padding: 20 }}>
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>
                    Тема обращения
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px" }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>
                    Сообщение
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Опишите вопрос или проблему. Если это ошибка — что вы делали и что произошло."
                    rows={5}
                    maxLength={5000}
                    style={{ width: "100%", padding: "10px 12px", resize: "vertical", lineHeight: 1.5 }}
                  />
                  <div className="text-[10px] mt-1 text-right" style={{ color: "var(--t3)" }}>
                    {message.length}/5000
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>
                    E-mail для ответа (необязательно)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="По умолчанию — e-mail вашего аккаунта"
                    style={{ width: "100%", padding: "10px 12px" }}
                  />
                </div>

                {error && (
                  <div
                    className="text-xs p-2.5 rounded-lg"
                    style={{ background: "#EF444420", color: "#EF4444" }}
                  >
                    {error}
                  </div>
                )}

                <button
                  onClick={submit}
                  disabled={sending}
                  className="cursor-pointer border-none text-white font-semibold rounded-xl disabled:opacity-60"
                  style={{ padding: "12px", background: "var(--accent)", fontSize: 14 }}
                >
                  {sending ? "Отправка..." : "Отправить обращение"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
