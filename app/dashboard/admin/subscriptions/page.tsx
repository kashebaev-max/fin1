"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isPlatformAdmin } from "@/lib/platform-admin";

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [extending, setExtending] = useState<string | null>(null);

  useEffect(() => { check(); }, []);

  async function check() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }

    const { data: profile } = await supabase
      .from("profiles").select("*").eq("id", user.id).maybeSingle();

    if (!isPlatformAdmin(profile)) {
      router.push("/dashboard");
      return;
    }
    setIsAdmin(true);
    await loadUsers();
  }

  async function loadUsers() {
    setLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select(`
        *,
        profiles!user_id(email, phone, role, full_name, company_name)
      `)
      .order("created_at", { ascending: false });

    setUsers(data || []);
    setLoading(false);
  }

  async function extendManually(userId: string, days: number) {
    if (!confirm(`Выдать доступ на ${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}?`)) return;
    setExtending(userId);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant_access", userId, days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      await loadUsers();
      alert("✅ " + (data.message || "Доступ выдан"));
    } catch (err: unknown) {
      alert("❌ Ошибка: " + (err instanceof Error ? err.message : "Неизвестная ошибка"));
    }
    setExtending(null);
  }

  async function suspendUser(userId: string) {
    if (!confirm("Приостановить подписку пользователя?")) return;
    setExtending(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suspend", userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      await loadUsers();
    } catch (err: unknown) {
      alert("❌ " + (err instanceof Error ? err.message : "Ошибка"));
    }
    setExtending(null);
  }

  if (!isAdmin || loading) {
    return <div className="p-8 text-center" style={{ color: "var(--t3)" }}>Загрузка...</div>;
  }

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.profiles?.email?.toLowerCase().includes(s) ||
      u.profiles?.full_name?.toLowerCase().includes(s) ||
      u.profiles?.company_name?.toLowerCase().includes(s) ||
      u.profiles?.phone?.includes(s)
    );
  });

  const stats = {
    total: users.length,
    trial: users.filter(u => u.status === "trial").length,
    active: users.filter(u => u.status === "active").length,
    expired: users.filter(u => u.status === "expired" || (u.expires_at && new Date(u.expires_at) < new Date())).length,
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">🛡 Управление подписками</h1>

      {/* Статистика */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Всего", value: stats.total, color: "#6366F1" },
          { label: "На триале", value: stats.trial, color: "#A855F7" },
          { label: "Активных", value: stats.active, color: "#10B981" },
          { label: "Истёкших", value: stats.expired, color: "#EF4444" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3"
            style={{ background: s.color + "15", border: `1px solid ${s.color}40` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--t3)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Поиск */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔎 Email, ФИО, компания, телефон..."
        className="w-full px-3 py-2 rounded-lg text-[13px]"
        style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>

      {/* Список пользователей */}
      <div className="flex flex-col gap-2">
        {filtered.map(u => {
          const expiresAt = u.expires_at ? new Date(u.expires_at) : null;
          const daysLeft = expiresAt
            ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 0;
          const isExpired = u.status !== "active" && u.status !== "trial" || (expiresAt && expiresAt < new Date());

          return (
            <div key={u.id} className="rounded-xl p-3"
              style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {u.profiles?.email || "?"}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                      background: isExpired ? "#EF444415" : u.status === "trial" ? "#A855F715" : "#10B98115",
                      color: isExpired ? "#EF4444" : u.status === "trial" ? "#A855F7" : "#10B981",
                    }}>
                      {isExpired ? "ИСТЁК" : u.status === "trial" ? "ТРИАЛ" : "АКТИВ"}
                    </span>
                    <span style={{
                      fontSize: 9, padding: "2px 6px", borderRadius: 4,
                      background: u.profiles?.role === "admin" ? "#A855F715" : "#6B728015",
                      color: u.profiles?.role === "admin" ? "#A855F7" : "#6B7280",
                    }}>
                      {u.profiles?.role || "user"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>
                    {u.profiles?.company_name || u.profiles?.full_name || "—"}
                    {u.profiles?.phone && ` · ${u.profiles.phone}`}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    Тариф: <b>{u.plan}</b> · 
                    {expiresAt && (
                      <>
                        {" Истекает: "}
                        <b style={{ color: daysLeft <= 0 ? "#EF4444" : daysLeft <= 7 ? "#F59E0B" : "var(--t1)" }}>
                          {expiresAt.toLocaleDateString("ru-RU")}
                          {daysLeft > 0 ? ` (${daysLeft} дн)` : " (истёк)"}
                        </b>
                      </>
                    )}
                  </div>
                  {u.total_paid > 0 && (
                    <div style={{ fontSize: 10, color: "#10B981", marginTop: 2 }}>
                      💰 Оплачено: {Number(u.total_paid).toLocaleString("ru-RU")} ₸
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {([
                    { days: 2, label: "+2 дня" },
                    { days: 7, label: "+1 нед." },
                    { days: 30, label: "+1 мес." },
                    { days: 365, label: "+1 год" },
                  ] as const).map(({ days, label }) => (
                    <button
                      key={days}
                      onClick={() => extendManually(u.user_id, days)}
                      disabled={extending === u.user_id}
                      className="text-[10px] cursor-pointer px-3 py-1 rounded font-semibold"
                      style={{ background: "#10B98115", color: "#10B981", border: "none" }}
                    >
                      {label}
                    </button>
                  ))}
                  {u.status !== "suspended" && u.profiles?.role !== "admin" && (
                    <button onClick={() => suspendUser(u.user_id)} disabled={extending === u.user_id}
                      className="text-[10px] cursor-pointer px-3 py-1 rounded font-semibold"
                      style={{ background: "#EF444415", color: "#EF4444", border: "none" }}>
                      Приостановить
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-[12px]" style={{ color: "var(--t3)" }}>
          Пользователей не найдено
        </div>
      )}
    </div>
  );
}
