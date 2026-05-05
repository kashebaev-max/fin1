"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { PLANS, normalizePhone, isValidKZPhone } from "@/lib/subscription";

function BillingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  
  const planKey = searchParams.get("plan") || "monthly_once";
  const plan = PLANS[planKey as keyof typeof PLANS];

  const [userId, setUserId] = useState("");
  const [phone, setPhone] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ payment_url: string; amount: number } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth");
      return;
    }
    setUserId(user.id);

    // Загружаем телефон из профиля
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    
    if (profile?.phone) {
      setProfilePhone(profile.phone);
      setPhone(profile.phone);
    }
  }

  async function handlePay() {
    if (!isValidKZPhone(phone)) {
      setError("Укажите телефон в формате 87XXXXXXXXX");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Сохраняем телефон в профиль
      if (phone !== profilePhone) {
        await supabase.from("profiles").update({ phone: normalizePhone(phone) }).eq("id", userId);
      }

      const res = await fetch("/.netlify/functions/apipay-create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          plan: planKey,
          phone_number: normalizePhone(phone),
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Ошибка создания счёта");
        setLoading(false);
        return;
      }

      setSuccess({
        payment_url: data.payment_url,
        amount: data.amount,
      });
      
      // Открываем Kaspi автоматически
      if (data.payment_url) {
        window.open(data.payment_url, "_blank");
      }
    } catch (err: any) {
      setError("Ошибка сети: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!plan) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-base font-bold mb-2">Тариф не найден</div>
        <button onClick={() => router.push("/dashboard/subscription")}
          className="text-[12px] underline cursor-pointer" style={{ color: "#A855F7" }}>
          ← Вернуться к выбору тарифа
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl mx-auto">
        <div className="rounded-xl p-6 text-center"
          style={{ background: "#10B98115", border: "2px solid #10B981" }}>
          <div style={{ fontSize: 48 }}>📱</div>
          <h1 className="text-lg font-bold mt-2 mb-1" style={{ color: "#059669" }}>
            Счёт отправлен в Kaspi
          </h1>
          <p className="text-[13px] mb-4">
            Откройте приложение <b>Kaspi</b> на телефоне <b>{phone}</b>
            <br/>и подтвердите платёж на <b>{success.amount.toLocaleString("ru-RU")} ₸</b>
          </p>
          
          {success.payment_url && (
            <a href={success.payment_url} target="_blank" rel="noopener noreferrer"
              className="inline-block py-3 px-6 rounded-lg font-bold text-[13px] cursor-pointer"
              style={{ background: "#A855F7", color: "#fff", textDecoration: "none" }}>
              Открыть в Kaspi →
            </a>
          )}

          <div className="mt-4 text-[11px]" style={{ color: "var(--t3)" }}>
            После оплаты подписка активируется автоматически в течение 1-2 минут.
          </div>
        </div>

        <button onClick={() => router.push("/dashboard/subscription")}
          className="py-2 rounded-lg text-[12px] font-semibold cursor-pointer"
          style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
          ← К моей подписке
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      <button onClick={() => router.push("/dashboard/subscription")}
        className="self-start text-[12px] cursor-pointer" style={{ color: "var(--t3)" }}>
        ← Назад
      </button>

      <h1 className="text-xl font-bold">Оформление оплаты</h1>

      {/* Карточка тарифа */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>ВАШ ТАРИФ</div>
        <div className="text-base font-bold mb-1">{plan.name}</div>
        <div className="text-[12px] mb-4" style={{ color: "var(--t3)" }}>{plan.description}</div>
        
        <div className="flex items-center justify-between p-3 rounded-lg"
          style={{ background: "var(--bg)" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--t3)" }}>К оплате</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#A855F7" }}>
              {plan.amount.toLocaleString("ru-RU")} ₸
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 11, color: "var(--t3)" }}>Доступ на</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {plan.duration_days} дней
            </div>
          </div>
        </div>

        {plan.is_recurring && (
          <div className="mt-3 p-3 rounded-lg text-[11px]" 
            style={{ background: "#F59E0B15", color: "#D97706" }}>
            ⚠ Это <b>подписка с автосписанием</b>. Каждый месяц 10 000 ₸ будет автоматически списываться через Kaspi. Отменить можно в любой момент.
          </div>
        )}
      </div>

      {/* Форма оплаты */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-base font-bold mb-4">📱 Оплата через Kaspi</div>

        <label className="block">
          <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>
            Номер телефона (привязанный к Kaspi)
          </div>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="87001234567"
            className="w-full px-3 py-2 rounded-lg text-[13px]"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--brd)",
              color: "var(--t1)",
            }}
          />
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>
            На этот номер придёт уведомление в приложении Kaspi
          </div>
        </label>

        {error && (
          <div className="mt-3 p-3 rounded-lg text-[12px]"
            style={{ background: "#EF444415", color: "#EF4444" }}>
            {error}
          </div>
        )}

        <button onClick={handlePay} disabled={loading || !phone}
          className="w-full mt-4 py-3 rounded-lg font-bold text-[13px] cursor-pointer"
          style={{
            background: loading || !phone ? "var(--brd)" : "linear-gradient(135deg, #A855F7, #6366F1)",
            color: "#fff",
            border: "none",
            opacity: loading || !phone ? 0.5 : 1,
          }}>
          {loading ? "Создаём счёт..." : `📲 Оплатить ${plan.amount.toLocaleString("ru-RU")} ₸ через Kaspi`}
        </button>

        <div className="mt-4 text-[10px]" style={{ color: "var(--t3)" }}>
          🔒 Безопасная оплата через Apipay.kz и Kaspi Bank.<br/>
          Подписка активируется автоматически после оплаты.
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center" style={{ color: "var(--t3)" }}>Загрузка...</div>}>
      <BillingPageContent />
    </Suspense>
  );
}
