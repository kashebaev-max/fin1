"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const supabase = createClient();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    trial: 0,
    active: 0,
    expired: 0,
    newThisMonth: 0,
  });

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (isPlatformAdmin(profile)) {
      setIsAdmin(true);
      await loadStats();
    }
    setLoading(false);
  }

  async function loadStats() {
    const { data: profiles } = await supabase.from("profiles").select("id, created_at, is_platform_admin");
    const { data: subs } = await supabase.from("subscriptions").select("user_id, status, expires_at");

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const clients = (profiles || []).filter((p) => !p.is_platform_admin);

    let trial = 0;
    let active = 0;
    let expired = 0;

    clients.forEach((p) => {
      const sub = (subs || []).find((s) => s.user_id === p.id);
      const exp = sub?.expires_at ? new Date(sub.expires_at) : null;
      const isLive =
        sub && (sub.status === "trial" || sub.status === "active") && (!exp || exp > now);

      if (!sub || !isLive) expired++;
      else if (sub.status === "trial") trial++;
      else active++;
    });

    setStats({
      total: clients.length,
      trial,
      active,
      expired,
      newThisMonth: clients.filter((p) => p.created_at >= monthStart).length,
    });
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-sm" style={{ color: "var(--t3)" }}>
        Загрузка...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="text-center rounded-xl p-8"
          style={{ background: "var(--card)", border: "1px solid var(--brd)" }}
        >
          <div className="text-4xl mb-4">🔒</div>
          <div className="text-lg font-bold mb-2">Доступ запрещён</div>
          <div className="text-sm" style={{ color: "var(--t3)" }}>
            Панель доступна только владельцу платформы Finstat.kz.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">🛡 Админ-панель</h1>
        <p className="text-[12px] mt-1" style={{ color: "var(--t3)" }}>
          Управление клиентами сервиса (отдельные организации). Сотрудники компаний — в модуле «Кадры» у
          каждого клиента.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Клиентов", value: stats.total, color: "#6366F1" },
          { label: "На триале", value: stats.trial, color: "#A855F7" },
          { label: "С подпиской", value: stats.active, color: "#10B981" },
          { label: "Истёкших", value: stats.expired, color: "#EF4444" },
          { label: "Новых в месяце", value: stats.newThisMonth, color: "#F59E0B" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-4"
            style={{ background: s.color + "15", border: `1px solid ${s.color}40` }}
          >
            <div className="text-[10px] font-bold" style={{ color: s.color }}>
              {s.label.toUpperCase()}
            </div>
            <div className="text-2xl font-extrabold mt-1" style={{ color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => router.push("/dashboard/admin/users")}
          className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #6366F1, #A855F7)",
            color: "#fff",
            border: "none",
          }}
        >
          👥 Пользователи — блокировка, триал, удаление
        </button>
        <button
          onClick={() => router.push("/dashboard/admin/subscriptions")}
          className="px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer"
          style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}
        >
          📋 Подписки
        </button>
        <button
          onClick={() => router.push("/dashboard/admin/analytics")}
          className="px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer"
          style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}
        >
          📊 Аналитика
        </button>
        <button
          onClick={() => router.push("/dashboard/admin/support")}
          className="px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer"
          style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}
        >
          🆘 Обращения в поддержку
        </button>
      </div>
    </div>
  );
}
