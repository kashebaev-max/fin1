"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { collectBusinessContext, contextToText } from "@/lib/ai-context";

interface Insight {
  id?: string;
  category: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  relatedModule?: string;
  is_dismissed?: boolean;
}

const SEVERITY_STYLES: Record<string, { color: string; icon: string; label: string }> = {
  critical: { color: "#EF4444", icon: "🔴", label: "Критично" },
  warning: { color: "#F59E0B", icon: "🟡", label: "Внимание" },
  info: { color: "#3B82F6", icon: "🔵", label: "К сведению" },
  success: { color: "#10B981", icon: "🟢", label: "Успех" },
};

const CATEGORY_ICONS: Record<string, string> = {
  tax_deadline: "📅",
  cashflow: "💰",
  overdue: "⚠️",
  low_stock: "📉",
  expiring_batches: "⏰",
  unposted_docs: "📄",
  salary_due: "💸",
  recommendation: "💡",
  anomaly: "🔍",
  opportunity: "✨",
  compliance: "⚖",
  general: "📋",
};

const CACHE_TTL_MIN = 60;

export default function AIInsightsPanel() {
  const supabase = createClient();
  const router = useRouter();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [userId, setUserId] = useState("");
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    await loadCachedInsights(user.id);
    setLoading(false);
  }

  async function loadCachedInsights(uid: string) {
    const { data } = await supabase
      .from("ai_insights")
      .select("*")
      .eq("user_id", uid)
      .eq("is_dismissed", false)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data && data.length > 0) {
      setInsights(data as any);
      setLastGenerated(new Date(data[0].created_at));
    }
  }

  async function generateInsights() {
    if (!userId) return;
    setGenerating(true);
    setError("");

    try {
      const ctx = await collectBusinessContext(supabase, userId);
      const ctxText = contextToText(ctx);

      const res = await fetch("/.netlify/functions/ai-zhanara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "insights",
          contextText: ctxText,
          messages: [],
        }),
      });

      if (!res.ok) throw new Error(`AI error ${res.status}`);
      const data = await res.json();
      const newInsights: Insight[] = data.insights || [];

      if (newInsights.length === 0) {
        setError("AI вернула пустой ответ. Попробуйте ещё раз.");
        return;
      }

      await supabase.from("ai_insights").delete().eq("user_id", userId).eq("is_dismissed", false);

      const toInsert = newInsights.map(i => ({
        user_id: userId,
        category: i.category || "general",
        severity: i.severity || "info",
        title: i.title,
        message: i.message,
        action_label: i.actionLabel || null,
        action_url: i.actionUrl || null,
        related_module: i.relatedModule || null,
      }));
      const { data: inserted } = await supabase.from("ai_insights").insert(toInsert).select();
      setInsights(inserted as any || []);
      setLastGenerated(new Date());

      await supabase.from("ai_business_snapshot").upsert({
        user_id: userId,
        cash_total: ctx.finance.cash,
        bank_total: ctx.finance.bank,
        receivables: ctx.finance.receivables,
        payables: ctx.finance.payables,
        vat_due: ctx.taxes.vatDue,
        ipn_due: ctx.taxes.ipnDue,
        cit_due: ctx.taxes.citDue,
        stock_value: ctx.inventory.totalValue,
        low_stock_count: ctx.inventory.lowStockItems.length,
        expiring_batches_count: ctx.inventory.expiringSoon.length,
        expired_batches_count: ctx.inventory.expired.length,
        revenue_mtd: ctx.sales.revenueMTD,
        expenses_mtd: ctx.expenses.mtd,
        employees_count: ctx.hr.activeEmployees,
        payroll_total: ctx.hr.payrollMonthly,
        draft_docs_count: ctx.documents.draftCount,
        overdue_payments_count: ctx.recurring.overduePayments.length,
        full_snapshot: ctx as any,
        refreshed_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    } catch (err: any) {
      setError(`Не удалось сгенерировать инсайты: ${err.message || err}`);
    } finally {
      setGenerating(false);
    }
  }

  async function dismissInsight(id: string | undefined) {
    if (!id) return;
    await supabase.from("ai_insights").update({ is_dismissed: true }).eq("id", id);
    setInsights(prev => prev.filter(i => i.id !== id));
  }

  const visibleInsights = showAll ? insights : insights.slice(0, 5);
  const criticalCount = insights.filter(i => i.severity === "critical").length;
  const warningCount = insights.filter(i => i.severity === "warning").length;

  if (loading) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        Загрузка инсайтов...
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 22 }}>✦</span>
          <div>
            <div className="text-sm font-bold" style={{ color: "#A855F7" }}>Жанара рекомендует</div>
            <div className="text-[10px]" style={{ color: "var(--t3)" }}>
              {lastGenerated ? `Обновлено ${lastGenerated.toLocaleString("ru-RU")}` : "Анализ ещё не запускался"}
              {criticalCount > 0 && <span className="ml-2" style={{ color: "#EF4444" }}>🔴 {criticalCount} критично</span>}
              {warningCount > 0 && <span className="ml-2" style={{ color: "#F59E0B" }}>🟡 {warningCount} внимание</span>}
            </div>
          </div>
        </div>
        <button
          onClick={generateInsights}
          disabled={generating}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer border-none"
          style={{ background: "#A855F720", color: "#A855F7", opacity: generating ? 0.5 : 1 }}>
          {generating ? "🔄 Анализирую..." : insights.length === 0 ? "✦ Запустить анализ" : "🔄 Обновить"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-3 text-[11px]" style={{ background: "#EF444420", color: "#EF4444" }}>
          {error}
        </div>
      )}

      {insights.length === 0 && !generating && !error && (
        <div className="text-center py-8 text-[12px]" style={{ color: "var(--t3)" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✦</div>
          <div className="mb-2">Нажмите «Запустить анализ» — Жанара изучит ваши данные и подскажет, на что обратить внимание.</div>
          <div className="text-[10px]">Анализируется состояние финансов, налогов, склада, кадров</div>
        </div>
      )}

      {generating && insights.length === 0 && (
        <div className="text-center py-6 text-[12px]" style={{ color: "var(--t3)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🤔</div>
          Жанара изучает ваш бизнес...
        </div>
      )}

      {visibleInsights.length > 0 && (
        <div className="flex flex-col gap-2">
          {visibleInsights.map((insight, idx) => {
            const sev = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;
            const catIcon = CATEGORY_ICONS[insight.category] || "💡";
            return (
              <div
                key={insight.id || idx}
                className="rounded-lg p-3"
                style={{
                  background: sev.color + "08",
                  border: `1px solid ${sev.color}25`,
                  borderLeft: `3px solid ${sev.color}`,
                }}>
                <div className="flex items-start gap-2">
                  <span style={{ fontSize: 18, lineHeight: "1.2" }}>{catIcon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[12px] font-bold" style={{ color: sev.color }}>{insight.title}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: sev.color + "20", color: sev.color }}>
                        {sev.icon} {sev.label}
                      </span>
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--t2)" }}>{insight.message}</div>
                    {insight.actionUrl && insight.actionLabel && (
                      <button
                        onClick={() => router.push(insight.actionUrl!)}
                        className="mt-2 px-2.5 py-1 rounded text-[10px] font-semibold cursor-pointer border-none"
                        style={{ background: sev.color, color: "#fff" }}>
                        {insight.actionLabel} →
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => dismissInsight(insight.id)}
                    className="text-[14px] cursor-pointer border-none bg-transparent"
                    style={{ color: "var(--t3)", padding: 2 }}
                    title="Отклонить">×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {insights.length > 5 && (
        <div className="text-center mt-3">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] cursor-pointer border-none bg-transparent"
            style={{ color: "var(--accent)" }}>
            {showAll ? "Свернуть" : `Показать ещё ${insights.length - 5}`}
          </button>
        </div>
      )}

      <div className="mt-3 pt-3 text-[10px] text-center" style={{ borderTop: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 Хотите спросить Жанару напрямую? <button onClick={() => router.push("/dashboard/ai")} className="underline cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>Открыть чат</button>
      </div>
    </div>
  );
}
