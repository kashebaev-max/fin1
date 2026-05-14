"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { formatRelativeTime } from "@/lib/analytics";

export default function UsersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, any>>({});
  const [payments, setPayments] = useState<Record<string, any[]>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "admin" | "active" | "trial" | "expired">("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  useEffect(() => { check(); }, []);

  async function check() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }
    
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    
    if (profile?.role !== "admin") {
      router.push("/dashboard");
      return;
    }
    setIsAdmin(true);
    await loadUsers();
  }

  async function loadUsers() {
    setLoading(true);

    const [profilesRes, subsRes, paysRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*"),
      supabase.from("payments").select("*").eq("status", "completed").order("created_at", { ascending: false }),
    ]);

    const subsMap: Record<string, any> = {};
    (subsRes.data || []).forEach(s => { subsMap[s.user_id] = s; });

    const paysMap: Record<string, any[]> = {};
    (paysRes.data || []).forEach(p => {
      if (!paysMap[p.user_id]) paysMap[p.user_id] = [];
      paysMap[p.user_id].push(p);
    });

    setUsers(profilesRes.data || []);
    setSubscriptions(subsMap);
    setPayments(paysMap);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let result = users;

    // Поиск
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(u =>
        u.email?.toLowerCase().includes(s) ||
        u.full_name?.toLowerCase().includes(s) ||
        u.company_name?.toLowerCase().includes(s) ||
        u.phone?.includes(s)
      );
    }

    // Фильтр
    if (filter !== "all") {
      result = result.filter(u => {
        const sub = subscriptions[u.id];
        if (filter === "admin") return u.role === "admin";
        if (filter === "active") return sub?.status === "active";
        if (filter === "trial") return sub?.status === "trial";
        if (filter === "expired") return !sub || sub.status === "expired" || (sub.expires_at && new Date(sub.expires_at) < new Date());
        return true;
      });
    }

    return result;
  }, [users, subscriptions, search, filter]);

  const stats = useMemo(() => {
    let admin = 0, active = 0, trial = 0, expired = 0, totalRevenue = 0;
    users.forEach(u => {
      if (u.role === "admin") admin++;
      const sub = subscriptions[u.id];
      if (sub?.status === "active") active++;
      else if (sub?.status === "trial" && new Date(sub.expires_at) > new Date()) trial++;
      else expired++;
      
      const userPays = payments[u.id] || [];
      userPays.forEach(p => { totalRevenue += Number(p.amount || 0); });
    });
    return { admin, active, trial, expired, totalRevenue };
  }, [users, subscriptions, payments]);

  if (loading || !isAdmin) {
    return <div className="p-8 text-center" style={{ color: "var(--t3)" }}>Загрузка...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">👥 Пользователи</h1>
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>
            Все зарегистрированные пользователи системы
          </p>
        </div>
        <button onClick={() => router.push("/dashboard/admin/analytics")}
          className="cursor-pointer rounded-lg font-semibold text-[12px]"
          style={{
            padding: "8px 14px",
            background: "var(--card)",
            border: "1px solid var(--brd)",
            color: "var(--t2)",
          }}>
          📊 К аналитике →
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Всего", value: users.length, color: "#6366F1" },
          { label: "Активных", value: stats.active, color: "#10B981" },
          { label: "На триале", value: stats.trial, color: "#A855F7" },
          { label: "Истёкших", value: stats.expired, color: "#EF4444" },
          { label: "Доход всего", value: stats.totalRevenue.toLocaleString("ru-RU") + " ₸", color: "#F59E0B", isText: true },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3"
            style={{ background: s.color + "15", border: `1px solid ${s.color}40` }}>
            <div className="text-[10px] font-bold" style={{ color: s.color }}>{s.label.toUpperCase()}</div>
            <div className="text-xl font-extrabold mt-1" style={{ color: s.color }}>
              {s.isText ? s.value : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Поиск + фильтры */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Email, ФИО, компания, телефон..."
          className="flex-1 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t1)", minWidth: 200 }}/>
        
        <div className="flex gap-1">
          {([
            { key: "all", label: "Все" },
            { key: "active", label: "✅ Активные" },
            { key: "trial", label: "🎁 Триал" },
            { key: "expired", label: "⛔ Истёкшие" },
            { key: "admin", label: "🛡 Админы" },
          ] as { key: any; label: string }[]).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="cursor-pointer rounded-lg text-[10px] font-semibold"
              style={{
                padding: "6px 10px",
                background: filter === f.key ? "linear-gradient(135deg, #6366F1, #A855F7)" : "var(--card)",
                color: filter === f.key ? "#fff" : "var(--t2)",
                border: filter === f.key ? "none" : "1px solid var(--brd)",
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Таблица пользователей */}
      <div className="rounded-xl overflow-auto" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--bg)", position: "sticky", top: 0 }}>
            <tr style={{ borderBottom: "1px solid var(--brd)" }}>
              <th className="text-left p-3" style={{ color: "var(--t3)" }}>Пользователь</th>
              <th className="text-left p-3" style={{ color: "var(--t3)" }}>Компания</th>
              <th className="text-left p-3" style={{ color: "var(--t3)" }}>Телефон</th>
              <th className="text-left p-3" style={{ color: "var(--t3)" }}>Роль</th>
              <th className="text-left p-3" style={{ color: "var(--t3)" }}>Подписка</th>
              <th className="text-left p-3" style={{ color: "var(--t3)" }}>Оплачено</th>
              <th className="text-left p-3" style={{ color: "var(--t3)" }}>Регистрация</th>
              <th className="text-left p-3" style={{ color: "var(--t3)" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8" style={{ color: "var(--t3)" }}>
                  Пользователей не найдено
                </td>
              </tr>
            ) : filtered.map(u => {
              const sub = subscriptions[u.id];
              const userPays = payments[u.id] || [];
              const totalPaid = userPays.reduce((sum, p) => sum + Number(p.amount || 0), 0);
              const expiresAt = sub?.expires_at ? new Date(sub.expires_at) : null;
              const isExpired = !sub || sub.status === "expired" || (expiresAt && expiresAt < new Date());

              return (
                <tr key={u.id} className="cursor-pointer hover:opacity-80"
                  style={{ borderBottom: "1px solid var(--brd)" }}
                  onClick={() => setSelectedUser({ user: u, sub, pays: userPays })}>
                  <td className="p-3">
                    <div className="font-semibold">{u.full_name || "—"}</div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>{u.email}</div>
                  </td>
                  <td className="p-3" style={{ color: "var(--t2)" }}>{u.company_name || "—"}</td>
                  <td className="p-3 font-mono" style={{ color: "var(--t2)" }}>{u.phone || "—"}</td>
                  <td className="p-3">
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                      background: u.role === "admin" ? "#F59E0B20" : "#6B728015",
                      color: u.role === "admin" ? "#F59E0B" : "#6B7280",
                    }}>{(u.role || "user").toUpperCase()}</span>
                  </td>
                  <td className="p-3">
                    {!sub ? (
                      <span style={{ fontSize: 9, color: "#6B7280" }}>—</span>
                    ) : isExpired ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: "#EF444415", color: "#EF4444",
                      }}>ИСТЁК</span>
                    ) : sub.status === "trial" ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: "#A855F715", color: "#A855F7",
                      }}>ТРИАЛ</span>
                    ) : (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: "#10B98115", color: "#10B981",
                      }}>АКТИВ</span>
                    )}
                  </td>
                  <td className="p-3 font-bold" style={{ color: totalPaid > 0 ? "#10B981" : "var(--t3)" }}>
                    {totalPaid > 0 ? totalPaid.toLocaleString("ru-RU") + " ₸" : "—"}
                  </td>
                  <td className="p-3" style={{ color: "var(--t3)" }}>
                    {u.created_at ? formatRelativeTime(u.created_at) : "—"}
                  </td>
                  <td className="p-3 text-right">→</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Модалка профиля */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setSelectedUser(null)}>
          <div onClick={e => e.stopPropagation()}
            className="rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-5"
            style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-lg font-bold">{selectedUser.user.full_name || "—"}</div>
                <div className="text-[12px]" style={{ color: "var(--t3)" }}>{selectedUser.user.email}</div>
              </div>
              <button onClick={() => setSelectedUser(null)}
                className="text-[20px] cursor-pointer"
                style={{ background: "transparent", border: "none", color: "var(--t3)" }}>×</button>
            </div>

            {/* Основная инфа */}
            <div className="rounded-lg p-3 mb-3" style={{ background: "var(--bg)" }}>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>Компания</div>
                  <div className="font-semibold">{selectedUser.user.company_name || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>Телефон</div>
                  <div className="font-mono">{selectedUser.user.phone || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>Роль</div>
                  <div className="font-semibold">{selectedUser.user.role || "user"}</div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>Регистрация</div>
                  <div className="font-semibold">{new Date(selectedUser.user.created_at).toLocaleString("ru-RU")}</div>
                </div>
              </div>
            </div>

            {/* Подписка */}
            {selectedUser.sub && (
              <div className="rounded-lg p-3 mb-3"
                style={{ background: "linear-gradient(135deg, #A855F710, #6366F110)", border: "1px solid #A855F740" }}>
                <div className="text-[10px] font-bold mb-2" style={{ color: "#A855F7" }}>📋 ПОДПИСКА</div>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>Статус</div>
                    <div className="font-bold">{selectedUser.sub.status}</div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>Тариф</div>
                    <div className="font-bold">{selectedUser.sub.plan}</div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>Истекает</div>
                    <div className="font-bold">
                      {selectedUser.sub.expires_at ? new Date(selectedUser.sub.expires_at).toLocaleDateString("ru-RU") : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>Всего оплачено</div>
                    <div className="font-bold" style={{ color: "#10B981" }}>
                      {Number(selectedUser.sub.total_paid || 0).toLocaleString("ru-RU")} ₸
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* История платежей */}
            {selectedUser.pays.length > 0 && (
              <div>
                <div className="text-[10px] font-bold mb-2" style={{ color: "var(--t3)" }}>💰 ИСТОРИЯ ПЛАТЕЖЕЙ</div>
                <div className="flex flex-col gap-1">
                  {selectedUser.pays.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded text-[11px]"
                      style={{ background: "var(--bg)" }}>
                      <div>
                        <div className="font-semibold">{p.description || p.plan}</div>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                          {new Date(p.created_at).toLocaleString("ru-RU")}
                        </div>
                      </div>
                      <div className="font-bold" style={{ color: "#10B981" }}>
                        {Number(p.amount).toLocaleString("ru-RU")} ₸
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => router.push(`/dashboard/admin/subscriptions`)}
              className="w-full mt-4 py-2 rounded-lg cursor-pointer font-bold text-[12px]"
              style={{
                background: "linear-gradient(135deg, #6366F1, #A855F7)",
                color: "#fff", border: "none",
              }}>
              Управление подписками →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
