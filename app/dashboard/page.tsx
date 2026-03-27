"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";
import Link from "next/link";

export default function DashboardPage() {
  const supabase = createClient();
  const [stats, setStats] = useState({ docCount: 0, empCount: 0, recentDocs: [] as any[] });

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [docs, emps, recent] = await Promise.all([
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);

    setStats({
      docCount: docs.count || 0,
      empCount: emps.count || 0,
      recentDocs: recent.data || [],
    });
  }

  const kpis = [
    { label: "Документов", value: String(stats.docCount), color: "#6366F1" },
    { label: "Сотрудников", value: String(stats.empCount), color: "#10B981" },
    { label: "НДС", value: "16%", color: "#F59E0B" },
    { label: "МРП 2026", value: "4 325 ₸", color: "#EC4899" },
  ];

  const quickActions = [
    { label: "📄 Счёт на оплату", href: "/dashboard/documents" },
    { label: "📦 Накладная", href: "/dashboard/documents" },
    { label: "💵 ПКО (Приход)", href: "/dashboard/cashbox" },
    { label: "🏦 Платёж. поручение", href: "/dashboard/bank" },
    { label: "💳 Ведомость ЗП", href: "/dashboard/hr" },
    { label: "⚖ Ставки НК 2026", href: "/dashboard/taxinfo" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* AI Banner */}
      <Link href="/dashboard/ai" className="no-underline">
        <div
          className="rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #6366F118, #A855F718)", border: "1px solid #A855F730" }}
        >
          <span className="text-xl">✦</span>
          <div className="flex-1">
            <div className="text-[11px] font-bold tracking-wider" style={{ color: "#A855F7" }}>AI ЖАНАРА — РЕКОМЕНДАЦИИ</div>
            <div className="text-[13px] mt-1" style={{ color: "var(--t1)" }}>
              Задайте вопрос AI-бухгалтеру: налоги, зарплаты, документы, отчётность — всё по НК РК 2026
            </div>
          </div>
          <span style={{ color: "var(--t3)", fontSize: 18 }}>→</span>
        </div>
      </Link>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div
            key={i}
            className="rounded-xl p-5 animate-fadeIn"
            style={{ background: "var(--card)", border: "1px solid var(--brd)", animationDelay: `${i * 0.08}s` }}
          >
            <div className="text-xs mb-1.5" style={{ color: "var(--t3)" }}>{k.label}</div>
            <div className="text-2xl font-bold" style={{ letterSpacing: "-0.02em" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tax Banner */}
      <div
        className="rounded-xl p-5"
        style={{ background: "#F59E0B08", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}
      >
        <div className="text-[13px] font-bold mb-2" style={{ color: "#F59E0B" }}>
          ⚖ СТАВКИ НК РК 2026 (ЗРК 214-VIII от 18.07.2025)
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs" style={{ color: "var(--t2)" }}>
          <div><b style={{ color: "var(--t1)" }}>НДС: 16%</b> (было 12%)</div>
          <div><b style={{ color: "var(--t1)" }}>ИПН: 10%/15%</b> прогресс.</div>
          <div><b style={{ color: "var(--t1)" }}>КПН: 20%</b> (базовая)</div>
          <div><b style={{ color: "var(--t1)" }}>Вычет: 30 МРП</b> (129 750 ₸)</div>
          <div><b style={{ color: "var(--t1)" }}>ОПВ: 10%</b> | ОПВР: 3.5%</div>
          <div><b style={{ color: "var(--t1)" }}>СН: 6%</b> (без вычета СО)</div>
          <div><b style={{ color: "var(--t1)" }}>СО: 5%</b> | ВОСМС: 2%</div>
          <div><b style={{ color: "var(--t1)" }}>МЗП: 85 000 ₸</b></div>
        </div>
      </div>

      {/* Quick Actions + Recent Docs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">Быстрые действия</div>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((a, i) => (
              <Link key={i} href={a.href} className="no-underline">
                <div
                  className="p-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all hover:opacity-80"
                  style={{ border: "1px solid var(--brd)", color: "var(--t2)" }}
                >
                  {a.label}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">Последние документы</div>
          {stats.recentDocs.length === 0 ? (
            <div className="text-xs py-4 text-center" style={{ color: "var(--t3)" }}>
              Документов пока нет. Создайте первый в разделе «Документы»
            </div>
          ) : (
            stats.recentDocs.map((d: any) => (
              <div key={d.id} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                <div className="flex-1">
                  <div className="text-xs font-semibold">{d.doc_number}</div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{d.counterparty_name}</div>
                </div>
                <span className="text-xs font-bold">{fmtMoney(d.total_with_nds)} ₸</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
