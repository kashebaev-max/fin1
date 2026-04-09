"use client";

import { useState } from "react";

export default function CheckPage() {
  const [bin, setBin] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function checkBIN() {
    if (!bin || bin.length !== 12) {
      setError("Введите 12 цифр БИН");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bin }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setError("Ошибка проверки. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  const statusColors: Record<string, string> = { ok: "#10B981", warning: "#F59E0B", error: "#EF4444", info: "#6366F1" };
  const statusIcons: Record<string, string> = { ok: "✅", warning: "⚠️", error: "❌", info: "ℹ️" };
  const riskColors: Record<string, string> = { low: "#10B981", medium: "#F59E0B", high: "#EF4444", unknown: "#6B7280" };
  const riskNames: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий", unknown: "Не определён" };

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Проверка контрагента по БИН/ИИН • Данные КГД МФ РК, Стат. реестр, Госзакупки
      </div>

      {/* Search */}
      <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-base font-bold mb-4">Проверка контрагента по БИН</div>
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              value={bin}
              onChange={e => setBin(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="Введите 12-значный БИН (например: 180940054321)"
              onKeyDown={e => e.key === "Enter" && checkBIN()}
              style={{ fontSize: 16, padding: "12px 16px", letterSpacing: "0.05em" }}
            />
          </div>
          <button
            onClick={checkBIN}
            disabled={loading || bin.length !== 12}
            className="px-6 py-3 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {loading ? "Проверка..." : "🔍 Проверить"}
          </button>
        </div>
        {bin.length > 0 && bin.length < 12 && (
          <div className="text-xs mt-2" style={{ color: "var(--t3)" }}>{bin.length}/12 цифр</div>
        )}
        {error && <div className="text-sm mt-3 p-3 rounded-lg" style={{ background: "#EF444420", color: "#EF4444" }}>{error}</div>}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary card */}
          <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>БИН</div>
                <div className="text-2xl font-bold font-mono" style={{ letterSpacing: "0.08em" }}>{result.bin}</div>
              </div>
              <div className="text-right">
                <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>Уровень риска</div>
                <div className="text-lg font-bold px-4 py-1.5 rounded-lg"
                  style={{ background: (riskColors[result.risk_level] || "#6B7280") + "20", color: riskColors[result.risk_level] || "#6B7280" }}>
                  {riskNames[result.risk_level] || "Не определён"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип организации</div>
                <div className="text-sm font-bold">{result.type || "—"}</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата регистрации</div>
                <div className="text-sm font-bold">{result.registration_date || "—"}</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Формат БИН</div>
                <div className="text-sm font-bold" style={{ color: result.valid ? "#10B981" : "#EF4444" }}>
                  {result.valid ? "✅ Корректный" : "❌ Некорректный"}
                </div>
              </div>
            </div>
          </div>

          {/* Checks */}
          <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-4">Результаты проверки</div>
            <div className="flex flex-col gap-2">
              {(result.checks || []).map((check: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                  <span className="text-base flex-shrink-0 mt-0.5">{statusIcons[check.status] || "ℹ️"}</span>
                  <div className="flex-1">
                    <div className="text-xs font-bold" style={{ color: statusColors[check.status] || "var(--t3)" }}>{check.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--t2)" }}>{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
              <div className="text-sm font-bold mb-3" style={{ color: "#F59E0B" }}>💡 Рекомендации</div>
              <div className="flex flex-col gap-2">
                {result.recommendations.map((rec: string, i: number) => (
                  <div key={i} className="text-xs pl-3" style={{ color: "var(--t2)", borderLeft: "2px solid var(--brd)" }}>{rec}</div>
                ))}
              </div>
            </div>
          )}

          {/* Links to official sources */}
          {result.links && result.links.length > 0 && (
            <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-4">Проверить в официальных реестрах</div>
              <div className="grid grid-cols-2 gap-3">
                {result.links.map((link: any, i: number) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="p-3 rounded-lg text-xs font-semibold no-underline transition-all"
                    style={{ background: "var(--bg)", color: "var(--accent)", border: "1px solid var(--brd)" }}
                    onMouseEnter={(e: any) => e.currentTarget.style.borderColor = "var(--accent)"}
                    onMouseLeave={(e: any) => e.currentTarget.style.borderColor = "var(--brd)"}>
                    {link.name} ↗
                  </a>
                ))}
              </div>
              <p className="text-[10px] mt-4" style={{ color: "var(--t3)" }}>
                Данные предоставлены для предварительной оценки. Для полной проверки благонадёжности используйте официальные порталы КГД МФ РК (portal.kgd.gov.kz).
                Проверка не заменяет due diligence и не является юридическим заключением.
              </p>
            </div>
          )}
        </>
      )}

      {/* Info block when no search yet */}
      {!result && !loading && (
        <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Что проверяется?</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "📋", title: "Формат и тип БИН", desc: "Валидность номера, тип организации (ТОО, АО, ИП)" },
              { icon: "📅", title: "Дата регистрации", desc: "Определение возраста компании по структуре БИН" },
              { icon: "⚠️", title: "Признаки риска", desc: "Новые компании, нестандартные БИН" },
              { icon: "🏛", title: "Ссылки на госреестры", desc: "КГД, стат.реестр, госзакупки, суды" },
              { icon: "📊", title: "НДС статус", desc: "Рекомендация проверить регистрацию по НДС" },
              { icon: "🚫", title: "Лжепредприятия", desc: "Ссылка на реестр КГД по лжепредприятиям" },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                <span className="text-lg">{item.icon}</span>
                <div>
                  <div className="text-xs font-bold">{item.title}</div>
                  <div className="text-[11px]" style={{ color: "var(--t3)" }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
