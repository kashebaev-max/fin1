"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  getSubscriptionInfo,
  formatExpiryDate,
  formatDaysLeft,
  getWarningLevel,
  PLANS,
  type SubscriptionInfo,
} from "@/lib/subscription";

export default function SubscriptionPage() {
  const router = useRouter();
  const supabase = createClient();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth");
      return;
    }

    const subInfo = await getSubscriptionInfo(supabase, user.id);
    setInfo(subInfo);

    const { data: pays } = await supabase
      .from("payments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setPayments(pays || []);

    setLoading(false);
  }

  if (loading) {
    return <div className="p-8 text-center" style={{ color: "var(--t3)" }}>Загрузка...</div>;
  }

  const warning = getWarningLevel(info);

  const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    trial: { label: "🎁 Тестовый период", color: "#A855F7", bg: "#A855F715" },
    active: { label: "✅ Активная подписка", color: "#10B981", bg: "#10B98115" },
    expired: { label: "⛔ Подписка истекла", color: "#EF4444", bg: "#EF444415" },
    cancelled: { label: "❌ Отменена", color: "#6B7280", bg: "#6B728015" },
    suspended: { label: "⏸ Приостановлена", color: "#F59E0B", bg: "#F59E0B15" },
  };

  const statusStyle = info ? STATUS_LABELS[info.status] : STATUS_LABELS.expired;

  return (
    <div className="flex flex-col gap-4">
      {/* Заголовок */}
      <div>
        <h1 className="text-xl font-bold mb-1">Подписка</h1>
        <p className="text-[12px]" style={{ color: "var(--t3)" }}>
          Управление подпиской на Finstat.kz
        </p>
      </div>

      {/* Текущий статус — большая карточка */}
      <div className="rounded-xl p-5"
        style={{ background: statusStyle.bg, border: `1px solid ${statusStyle.color}40` }}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: statusStyle.color, marginBottom: 4 }}>
              СТАТУС
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {statusStyle.label}
            </div>
          </div>
          {info && info.is_active && (
            <div className="text-right">
              <div style={{ fontSize: 24, fontWeight: 800, color: statusStyle.color }}>
                {info.days_left}
              </div>
              <div style={{ fontSize: 10, color: "var(--t3)" }}>дней осталось</div>
            </div>
          )}
        </div>

        {info && (
          <div className="grid grid-cols-2 gap-3" style={{ fontSize: 12 }}>
            <div>
              <div style={{ color: "var(--t3)", fontSize: 10 }}>Тариф</div>
              <div style={{ fontWeight: 600 }}>
                {info.plan === "trial" ? "Триал (бесплатно)" :
                 info.plan === "monthly_once" ? "Месячная разовая" :
                 info.plan === "monthly_recurring" ? "Месячная подписка (авто)" :
                 info.plan === "yearly_once" ? "Годовая" : info.plan}
              </div>
            </div>
            <div>
              <div style={{ color: "var(--t3)", fontSize: 10 }}>
                {info.is_trial ? "Триал заканчивается" : "Подписка действует до"}
              </div>
              <div style={{ fontWeight: 600 }}>
                {formatExpiryDate(info.expires_at)}
              </div>
            </div>
          </div>
        )}

        {warning.level !== "none" && (
          <div className="mt-3 p-3 rounded-lg" style={{ 
            background: warning.level === "critical" || warning.level === "expired" ? "#EF444425" : "#F59E0B25",
            color: warning.level === "critical" || warning.level === "expired" ? "#DC2626" : "#D97706",
            fontSize: 12,
            fontWeight: 600,
          }}>
            {warning.message}
          </div>
        )}
      </div>

      {/* Тарифы — кнопки выбора */}
      <div>
        <h2 className="text-base font-bold mb-3">Выберите тариф</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.values(PLANS).map(plan => (
            <button key={plan.key}
              onClick={() => router.push(`/dashboard/billing?plan=${plan.key}`)}
              className="cursor-pointer rounded-xl p-4 text-left"
              style={{
                background: "var(--card)",
                border: plan.badge === "Выгодно" ? "2px solid #10B981" : "1px solid var(--brd)",
                position: "relative",
              }}>
              {plan.badge && (
                <span style={{
                  position: "absolute", top: -10, right: 16,
                  fontSize: 10, fontWeight: 700,
                  padding: "3px 10px", borderRadius: 12,
                  background: plan.badge === "Выгодно" ? "#10B981" : "#A855F7",
                  color: "#fff",
                }}>
                  {plan.badge}
                </span>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 12, minHeight: 32 }}>
                {plan.description}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#A855F7" }}>
                {plan.amount.toLocaleString("ru-RU")} ₸
              </div>
              <div style={{ fontSize: 10, color: "var(--t3)" }}>
                {plan.duration_days === 365 ? "за год" : "в месяц"}
              </div>
              <div className="mt-3 py-2 rounded-lg text-center text-[12px] font-semibold"
                style={{ background: "#A855F715", color: "#A855F7" }}>
                Оформить →
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* История платежей */}
      <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <h2 className="text-base font-bold mb-3">История платежей</h2>
        {payments.length === 0 ? (
          <div className="text-center py-6 text-[12px]" style={{ color: "var(--t3)" }}>
            Платежей пока нет
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: "var(--bg)" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {p.description || p.plan}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--t3)" }}>
                    {new Date(p.created_at).toLocaleString("ru-RU")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {Number(p.amount).toLocaleString("ru-RU")} ₸
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "3px 8px", borderRadius: 4,
                    background: p.status === "completed" ? "#10B98115" : p.status === "pending" ? "#F59E0B15" : "#EF444415",
                    color: p.status === "completed" ? "#10B981" : p.status === "pending" ? "#F59E0B" : "#EF4444",
                  }}>
                    {p.status === "completed" ? "✅ Оплачен" :
                     p.status === "pending" ? "⏳ Ожидает" :
                     p.status === "failed" ? "❌ Ошибка" : p.status}
                  </span>
                  {p.status === "pending" && p.payment_url && (
                    <a href={p.payment_url} target="_blank" rel="noopener noreferrer"
                      style={{
                        fontSize: 11, fontWeight: 600, color: "#A855F7",
                        padding: "4px 10px", borderRadius: 6,
                        background: "#A855F715",
                        textDecoration: "none",
                      }}>
                      Оплатить
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
