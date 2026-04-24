"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney, TAX, TAX_COMPUTED, calcSalary } from "@/lib/tax2026";
import Link from "next/link";

export default function DashboardPage() {
  const supabase = createClient();
  const [stats, setStats] = useState({
    cashBalance: 0, bankBalance: 0, receivables: 0, payables: 0,
    revenueMonth: 0, expensesMonth: 0, ndsPayable: 0, fotTotal: 0,
    docCount: 0, empCount: 0, productsCount: 0, lowStock: 0,
    recentDocs: [] as any[], revenueByMonth: [] as { month: string; revenue: number }[],
    lowStockItems: [] as any[], topDebtors: [] as any[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);

    const [docs, emps, prods, cashOps, bankOps, journal] = await Promise.all([
      supabase.from("documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("employees").select("*").eq("user_id", user.id).eq("status", "active"),
      supabase.from("products").select("*").eq("user_id", user.id),
      supabase.from("cash_operations").select("*").eq("user_id", user.id),
      supabase.from("bank_operations").select("*").eq("user_id", user.id),
      supabase.from("journal_entries").select("*").eq("user_id", user.id).gte("entry_date", sixMonthsAgo),
    ]);

    const allDocs = docs.data || [];
    const allEmps = emps.data || [];
    const allProds = prods.data || [];
    const cashList = cashOps.data || [];
    const bankList = bankOps.data || [];
    const journalList = journal.data || [];

    // Cash balance
    const cashBalance = cashList.reduce((a: number, o: any) => a + (o.op_type === "pko" ? Number(o.amount) : -Number(o.amount)), 0);

    // Bank balance
    const bankBalance = bankList.reduce((a: number, o: any) => a + (o.op_type === "in" ? Number(o.amount) : -Number(o.amount)), 0);

    // Receivables (1210 debit - credit)
    const debit1210 = journalList.filter((e: any) => e.debit_account === "1210").reduce((a: number, e: any) => a + Number(e.amount), 0);
    const credit1210 = journalList.filter((e: any) => e.credit_account === "1210").reduce((a: number, e: any) => a + Number(e.amount), 0);
    const receivables = Math.max(0, debit1210 - credit1210);

    // Payables (3310 credit - debit)
    const debit3310 = journalList.filter((e: any) => e.debit_account === "3310").reduce((a: number, e: any) => a + Number(e.amount), 0);
    const credit3310 = journalList.filter((e: any) => e.credit_account === "3310").reduce((a: number, e: any) => a + Number(e.amount), 0);
    const payables = Math.max(0, credit3310 - debit3310);

    // This month revenue/expenses
    const monthDocs = allDocs.filter((d: any) => d.doc_date >= monthStart && d.status === "done");
    const revenueMonth = monthDocs.filter((d: any) => ["invoice", "sf", "act", "waybill", "ttn"].includes(d.doc_type))
      .reduce((a: number, d: any) => a + Number(d.total_sum), 0);
    const expensesMonth = monthDocs.filter((d: any) => ["rko", "pp", "receipt"].includes(d.doc_type))
      .reduce((a: number, d: any) => a + Number(d.total_sum), 0);

    // NDS payable
    const ndsCollected = allDocs.filter((d: any) => d.doc_date >= monthStart && Number(d.nds_sum) > 0 && d.status === "done")
      .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
    const ndsPaid = allDocs.filter((d: any) => d.doc_date >= monthStart && d.doc_type === "receipt")
      .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
    const ndsPayable = Math.max(0, ndsCollected - ndsPaid);

    // FOT
    const fotTotal = allEmps.reduce((a: number, e: any) => a + Number(e.salary), 0);

    // Low stock items
    const lowStockItems = allProds.filter((p: any) => Number(p.quantity) < Number(p.min_quantity) && Number(p.min_quantity) > 0).slice(0, 5);

    // Revenue by month (last 6 months)
    const revenueByMonth: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-31`;
      const monthRev = allDocs.filter((doc: any) => doc.doc_date >= `${monthStr}-01` && doc.doc_date <= monthEnd
        && ["invoice", "sf", "act", "waybill", "ttn"].includes(doc.doc_type) && doc.status === "done")
        .reduce((a: number, doc: any) => a + Number(doc.total_sum), 0);
      revenueByMonth.push({ month: d.toLocaleDateString("ru-RU", { month: "short" }), revenue: monthRev });
    }

    // Top debtors
    const debtorsMap: Record<string, number> = {};
    allDocs.filter((d: any) => ["invoice", "sf", "act"].includes(d.doc_type) && d.status !== "done")
      .forEach((d: any) => {
        debtorsMap[d.counterparty_name] = (debtorsMap[d.counterparty_name] || 0) + Number(d.total_with_nds);
      });
    const topDebtors = Object.entries(debtorsMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));

    setStats({
      cashBalance, bankBalance, receivables, payables,
      revenueMonth, expensesMonth, ndsPayable, fotTotal,
      docCount: allDocs.length, empCount: allEmps.length,
      productsCount: allProds.length, lowStock: lowStockItems.length,
      recentDocs: allDocs.slice(0, 5), revenueByMonth,
      lowStockItems, topDebtors,
    });
    setLoading(false);
  }

  const netCashFlow = stats.revenueMonth - stats.expensesMonth;
  const maxRevenue = Math.max(1, ...stats.revenueByMonth.map(m => m.revenue));

  if (loading) return <div className="text-center py-20 text-sm" style={{ color: "var(--t3)" }}>Загрузка данных...</div>;

  return (
    <div className="flex flex-col gap-5">
      {/* AI Banner */}
      <Link href="/dashboard/ai" className="no-underline">
        <div className="rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #6366F118, #A855F718)", border: "1px solid #A855F730" }}>
          <span className="text-xl">✦</span>
          <div className="flex-1">
            <div className="text-[11px] font-bold tracking-wider" style={{ color: "#A855F7" }}>AI ЖАНАРА — РЕКОМЕНДАЦИИ</div>
            <div className="text-[13px] mt-1" style={{ color: "var(--t1)" }}>
              Спросите AI-бухгалтера: «Какой у меня оборот?», «Сколько заплатить НДС?», «Проводки по зарплате»
            </div>
          </div>
          <span style={{ color: "var(--t3)", fontSize: 18 }}>→</span>
        </div>
      </Link>

      {/* Financial KPIs — 4 cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Касса + Банк" value={fmtMoney(stats.cashBalance + stats.bankBalance) + " ₸"}
          subtitle={`Касса: ${fmtMoney(stats.cashBalance)} | Банк: ${fmtMoney(stats.bankBalance)}`}
          color="#6366F1" icon="💰" />
        <KPICard label="Дебиторка (нам должны)" value={fmtMoney(stats.receivables) + " ₸"}
          subtitle={`${stats.topDebtors.length} контрагентов`}
          color="#10B981" icon="📥" />
        <KPICard label="Кредиторка (мы должны)" value={fmtMoney(stats.payables) + " ₸"}
          subtitle="Поставщикам и налоги"
          color="#F59E0B" icon="📤" />
        <KPICard label="НДС к уплате" value={fmtMoney(stats.ndsPayable) + " ₸"}
          subtitle={`За ${new Date().toLocaleDateString("ru-RU", { month: "long" })}`}
          color="#EC4899" icon="⚖" />
      </div>

      {/* Revenue chart + Month summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold">Выручка за 6 месяцев</div>
            <div className="text-xs" style={{ color: "var(--t3)" }}>Всего: {fmtMoney(stats.revenueByMonth.reduce((a, m) => a + m.revenue, 0))} ₸</div>
          </div>
          <div className="flex gap-2 items-end" style={{ height: 140 }}>
            {stats.revenueByMonth.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="text-[10px] font-semibold" style={{ color: "var(--t3)" }}>{m.revenue > 0 ? fmtMoney(m.revenue / 1000) + "К" : ""}</div>
                <div style={{ width: "80%", height: `${(m.revenue / maxRevenue) * 100}px`, background: "linear-gradient(to top, #6366F1, #A855F7)", borderRadius: 4, minHeight: 2, transition: "all 0.3s" }} />
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>{m.month}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Этот месяц</div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 Выручка</div>
              <div className="text-lg font-bold" style={{ color: "#10B981" }}>+{fmtMoney(stats.revenueMonth)} ₸</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📉 Расходы</div>
              <div className="text-lg font-bold" style={{ color: "#EF4444" }}>−{fmtMoney(stats.expensesMonth)} ₸</div>
            </div>
            <div style={{ borderTop: "1px solid var(--brd)", paddingTop: 10 }}>
              <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💵 Чистый поток</div>
              <div className="text-xl font-bold" style={{ color: netCashFlow >= 0 ? "#10B981" : "#EF4444" }}>
                {netCashFlow >= 0 ? "+" : ""}{fmtMoney(netCashFlow)} ₸
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Low stock + Debtors + Recent docs */}
      <div className="grid grid-cols-3 gap-4">
        {/* Low stock alert */}
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-bold">⚠ Заканчивается на складе</div>
            <Link href="/dashboard/warehouse" className="text-[11px] no-underline" style={{ color: "var(--accent)" }}>Все →</Link>
          </div>
          {stats.lowStockItems.length === 0 ? (
            <div className="text-xs py-4 text-center" style={{ color: "var(--t3)" }}>✓ Всё в норме</div>
          ) : (
            stats.lowStockItems.map((p: any) => (
              <div key={p.id} className="flex justify-between py-2 text-xs" style={{ borderBottom: "1px solid var(--brd)" }}>
                <span>{p.name}</span>
                <span style={{ color: "#EF4444" }}>{p.quantity} {p.unit} (мин: {p.min_quantity})</span>
              </div>
            ))
          )}
        </div>

        {/* Top debtors */}
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-bold">💼 Главные должники</div>
            <Link href="/dashboard/accounting" className="text-[11px] no-underline" style={{ color: "var(--accent)" }}>Сверки →</Link>
          </div>
          {stats.topDebtors.length === 0 ? (
            <div className="text-xs py-4 text-center" style={{ color: "var(--t3)" }}>Все контрагенты расчитались</div>
          ) : (
            stats.topDebtors.map((d: any, i: number) => (
              <div key={i} className="flex justify-between py-2 text-xs" style={{ borderBottom: "1px solid var(--brd)" }}>
                <span className="truncate">{d.name}</span>
                <span className="font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(d.amount)} ₸</span>
              </div>
            ))
          )}
        </div>

        {/* Recent docs */}
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-bold">📄 Последние документы</div>
            <Link href="/dashboard/documents" className="text-[11px] no-underline" style={{ color: "var(--accent)" }}>Все →</Link>
          </div>
          {stats.recentDocs.length === 0 ? (
            <div className="text-xs py-4 text-center" style={{ color: "var(--t3)" }}>Документов ещё нет</div>
          ) : (
            stats.recentDocs.map((d: any) => (
              <div key={d.id} className="flex justify-between py-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{d.doc_number}</div>
                  <div className="text-[10px] truncate" style={{ color: "var(--t3)" }}>{d.counterparty_name}</div>
                </div>
                <span className="text-xs font-bold">{fmtMoney(d.total_with_nds)} ₸</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-sm font-bold mb-3">Быстрые действия</div>
        <div className="grid grid-cols-6 gap-2">
          {[
            { icon: "📄", label: "Счёт", href: "/dashboard/documents" },
            { icon: "📦", label: "Накладная", href: "/dashboard/documents" },
            { icon: "💵", label: "ПКО", href: "/dashboard/cashbox" },
            { icon: "🏦", label: "Платёж", href: "/dashboard/bank" },
            { icon: "💳", label: "Ведом. ЗП", href: "/dashboard/hr" },
            { icon: "🔍", label: "Проверка БИН", href: "/dashboard/check" },
          ].map((a, i) => (
            <Link key={i} href={a.href} className="no-underline">
              <div className="p-3 rounded-lg text-center cursor-pointer transition-all hover:opacity-80"
                style={{ background: "var(--bg)", border: "1px solid var(--brd)" }}>
                <div className="text-lg mb-1">{a.icon}</div>
                <div className="text-[11px] font-medium" style={{ color: "var(--t2)" }}>{a.label}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, subtitle, color, icon }: { label: string; value: string; subtitle: string; color: string; icon: string }) {
  return (
    <div className="rounded-xl p-4 animate-fadeIn" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs font-semibold" style={{ color: "var(--t3)" }}>{label}</div>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div className="text-xl font-bold mb-1" style={{ color, letterSpacing: "-0.02em" }}>{value}</div>
      <div className="text-[10px]" style={{ color: "var(--t3)" }}>{subtitle}</div>
    </div>
  );
}
