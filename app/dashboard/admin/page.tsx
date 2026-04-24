"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

const ADMIN_EMAIL = "kashebaev@gmail.com";

const PLAN_NAMES: Record<string, string> = { free: "Бесплатный", basic: "Базовый", pro: "Профессионал", enterprise: "Корпоративный" };
const PLAN_COLORS: Record<string, string> = { free: "#6B7280", basic: "#3B82F6", pro: "#8B5CF6", enterprise: "#F59E0B" };
const STATUS_NAMES: Record<string, string> = { active: "Активна", expired: "Истекла", cancelled: "Отменена", trial: "Пробный" };
const STATUS_COLORS: Record<string, string> = { active: "#10B981", expired: "#EF4444", cancelled: "#6B7280", trial: "#F59E0B" };
const ROLE_NAMES: Record<string, string> = { admin: "Администратор", accountant: "Бухгалтер", manager: "Менеджер", employee: "Сотрудник" };

interface UserData {
  id: string; email: string; full_name: string; company_name: string; company_bin: string; role: string; created_at: string;
  subscription?: { plan: string; status: string; start_date: string; end_date: string };
}

export default function AdminPage() {
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, newThisMonth: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [editPlan, setEditPlan] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editRole, setEditRole] = useState("");
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"users" | "stats">("users");

  useEffect(() => { checkAdmin(); }, []);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (profile?.email === ADMIN_EMAIL || profile?.role === "admin") {
      setIsAdmin(true);
      await loadUsers();
    }
    setLoading(false);
  }

  async function loadUsers() {
    const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    const { data: subs } = await supabase.from("subscriptions").select("*");

    const userData: UserData[] = (profiles || []).map((p: any) => {
      const sub = (subs || []).find((s: any) => s.user_id === p.id);
      return {
        id: p.id, email: p.email, full_name: p.full_name || "",
        company_name: p.company_name || "", company_bin: p.company_bin || "",
        role: p.role || "employee", created_at: p.created_at,
        subscription: sub ? { plan: sub.plan, status: sub.status, start_date: sub.start_date, end_date: sub.end_date } : undefined,
      };
    });

    setUsers(userData);

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    setStats({
      total: userData.length,
      active: userData.filter(u => u.subscription?.status === "active").length,
      newThisMonth: userData.filter(u => u.created_at >= monthStart).length,
    });
  }

  async function updateUser() {
    if (!selectedUser) return;

    if (editRole && editRole !== selectedUser.role) {
      await supabase.from("profiles").update({ role: editRole }).eq("id", selectedUser.id);
    }

    if (editPlan || editStatus) {
      const { data: existingSub } = await supabase.from("subscriptions").select("*").eq("user_id", selectedUser.id).limit(1);
      const subData: any = {};
      if (editPlan) subData.plan = editPlan;
      if (editStatus) subData.status = editStatus;

      if (existingSub && existingSub.length > 0) {
        await supabase.from("subscriptions").update(subData).eq("user_id", selectedUser.id);
      } else {
        await supabase.from("subscriptions").insert({
          user_id: selectedUser.id, plan: editPlan || "free", status: editStatus || "active",
          start_date: new Date().toISOString().slice(0, 10),
          end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        });
      }
    }

    setMsg(`✅ Пользователь ${selectedUser.full_name || selectedUser.email} обновлён`);
    setSelectedUser(null); setEditPlan(""); setEditStatus(""); setEditRole("");
    await loadUsers();
    setTimeout(() => setMsg(""), 4000);
  }

  async function deleteUser(userId: string) {
    if (!confirm("Удалить пользователя и все его данные? Это действие необратимо.")) return;
    await supabase.from("subscriptions").delete().eq("user_id", userId);
    await supabase.from("documents").delete().eq("user_id", userId);
    await supabase.from("employees").delete().eq("user_id", userId);
    await supabase.from("products").delete().eq("user_id", userId);
    await supabase.from("counterparties").delete().eq("user_id", userId);
    await supabase.from("journal_entries").delete().eq("user_id", userId);
    await supabase.from("cash_operations").delete().eq("user_id", userId);
    await supabase.from("bank_operations").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("id", userId);
    setMsg("✅ Пользователь удалён");
    await loadUsers();
    setTimeout(() => setMsg(""), 4000);
  }

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.company_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="text-center py-20 text-sm" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  if (!isAdmin) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center rounded-xl p-8" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-4xl mb-4">🔒</div>
        <div className="text-lg font-bold mb-2">Доступ запрещён</div>
        <div className="text-sm" style={{ color: "var(--t3)" }}>Панель администратора доступна только для администраторов.</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: "#10B98120", color: "#10B981" }}>{msg}</div>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Всего пользователей", value: String(stats.total), icon: "👥", color: "#6366F1" },
          { label: "Активных", value: String(stats.active), icon: "✅", color: "#10B981" },
          { label: "Новых за этот месяц", value: String(stats.newThisMonth), icon: "🆕", color: "#F59E0B" },
        ].map((s, i) => (
          <div key={i} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${s.color}` }}>
            <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>{s.icon} {s.label}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([["users", "👥 Пользователи"], ["stats", "📊 Статистика"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <>
          {/* Edit modal */}
          {selectedUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setSelectedUser(null)}>
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              <div className="relative rounded-2xl w-full max-w-lg" style={{ background: "var(--card)", border: "1px solid var(--brd)" }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-5" style={{ borderBottom: "1px solid var(--brd)" }}>
                  <span className="text-base font-bold">Редактировать пользователя</span>
                  <button onClick={() => setSelectedUser(null)} className="bg-transparent border-none text-xl cursor-pointer" style={{ color: "var(--t3)" }}>×</button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <div className="p-4 rounded-lg" style={{ background: "var(--bg)" }}>
                    <div className="text-sm font-bold">{selectedUser.full_name || "Без имени"}</div>
                    <div className="text-xs" style={{ color: "var(--t3)" }}>{selectedUser.email}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>{selectedUser.company_name} {selectedUser.company_bin && `• БИН: ${selectedUser.company_bin}`}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>Регистрация: {selectedUser.created_at?.slice(0, 10)}</div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Роль</label>
                    <select value={editRole || selectedUser.role} onChange={e => setEditRole(e.target.value)}>
                      {Object.entries(ROLE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тарифный план</label>
                    <select value={editPlan || selectedUser.subscription?.plan || "free"} onChange={e => setEditPlan(e.target.value)}>
                      {Object.entries(PLAN_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Статус подписки</label>
                    <select value={editStatus || selectedUser.subscription?.status || "active"} onChange={e => setEditStatus(e.target.value)}>
                      {Object.entries(STATUS_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>

                  <div className="flex gap-3 justify-end pt-2">
                    <button onClick={() => deleteUser(selectedUser.id)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{ background: "#EF444420", color: "#EF4444", border: "none" }}>
                      Удалить
                    </button>
                    <button onClick={() => setSelectedUser(null)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                      Отмена
                    </button>
                    <button onClick={updateUser}
                      className="px-5 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer"
                      style={{ background: "var(--accent)" }}>
                      Сохранить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 items-center">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск по имени, email или компании..." style={{ maxWidth: 400 }} />
            <span className="text-xs" style={{ color: "var(--t3)" }}>Найдено: {filteredUsers.length}</span>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead>
                <tr>
                  {["Пользователь", "Компания", "Роль", "Тариф", "Статус", "Регистрация", ""].map(h => (
                    <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет пользователей</td></tr>
                ) : filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center font-bold text-white flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 8, fontSize: 11, background: u.role === "admin" ? "linear-gradient(135deg, #F59E0B, #EF4444)" : "linear-gradient(135deg, #6366F1, #EC4899)" }}>
                          {u.full_name?.split(" ").map(w => w[0]).join("").slice(0, 2) || "??"}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium">{u.full_name || "—"}</div>
                          <div className="text-[11px]" style={{ color: "var(--t3)" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <div>{u.company_name || "—"}</div>
                      {u.company_bin && <div className="text-[10px] font-mono" style={{ color: "var(--t3)" }}>БИН: {u.company_bin}</div>}
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: u.role === "admin" ? "#F59E0B20" : "#6366F120", color: u.role === "admin" ? "#F59E0B" : "#6366F1" }}>
                        {ROLE_NAMES[u.role] || u.role}
                      </span>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: (PLAN_COLORS[u.subscription?.plan || "free"] || "#6B7280") + "20", color: PLAN_COLORS[u.subscription?.plan || "free"] || "#6B7280" }}>
                        {PLAN_NAMES[u.subscription?.plan || "free"]}
                      </span>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: (STATUS_COLORS[u.subscription?.status || "active"] || "#6B7280") + "20", color: STATUS_COLORS[u.subscription?.status || "active"] || "#6B7280" }}>
                        {STATUS_NAMES[u.subscription?.status || "active"]}
                      </span>
                    </td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                      {u.created_at?.slice(0, 10)}
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => { setSelectedUser(u); setEditPlan(""); setEditStatus(""); setEditRole(""); }}
                        className="bg-transparent border-none cursor-pointer text-xs font-semibold" style={{ color: "var(--accent)" }}>
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "stats" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-4">Регистрации за 30 дней</div>
            <div className="flex gap-1 items-end" style={{ height: 100 }}>
              {(() => {
                const last30: Record<string, number> = {};
                for (let i = 29; i >= 0; i--) {
                  const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
                  last30[d] = 0;
                }
                users.forEach(u => {
                  const d = u.created_at?.slice(0, 10);
                  if (d && last30[d] !== undefined) last30[d]++;
                });
                const maxVal = Math.max(1, ...Object.values(last30));
                return Object.entries(last30).map(([date, count], i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <div style={{ width: "100%", height: `${(count / maxVal) * 70}px`, background: count > 0 ? "#6366F1" : "var(--brd)", borderRadius: 2, minHeight: 2 }} title={`${date}: ${count}`} />
                  </div>
                ));
              })()}
            </div>
            <div className="flex justify-between mt-2 text-[10px]" style={{ color: "var(--t3)" }}>
              <span>30 дней назад</span><span>Сегодня</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">По ролям</div>
              {Object.entries(ROLE_NAMES).map(([key, name]) => {
                const count = users.filter(u => u.role === key).length;
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3 py-2">
                    <span className="text-xs" style={{ color: "var(--t3)", width: 120 }}>{name}</span>
                    <div style={{ flex: 1, height: 6, background: "var(--brd)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#6366F1", borderRadius: 3 }} />
                    </div>
                    <span className="text-xs font-bold" style={{ minWidth: 30, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">По тарифам</div>
              {Object.entries(PLAN_NAMES).map(([key, name]) => {
                const count = users.filter(u => (u.subscription?.plan || "free") === key).length;
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3 py-2">
                    <span className="text-xs" style={{ color: "var(--t3)", width: 120 }}>{name}</span>
                    <div style={{ flex: 1, height: 6, background: "var(--brd)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: PLAN_COLORS[key], borderRadius: 3 }} />
                    </div>
                    <span className="text-xs font-bold" style={{ minWidth: 30, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
