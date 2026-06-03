"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { useRouter } from "next/navigation";

type SupportMessage = {
  id: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  company_name: string | null;
  category: string;
  message: string;
  page_url: string | null;
  status: "new" | "in_progress" | "resolved";
  admin_notes: string | null;
  created_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  question: "Вопрос",
  problem: "Проблема",
  suggestion: "Предложение",
  billing: "Оплата",
  other: "Другое",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "Новое", color: "#EF4444" },
  in_progress: { label: "В работе", color: "#F59E0B" },
  resolved: { label: "Решено", color: "#10B981" },
};

const STATUS_FLOW: SupportMessage["status"][] = ["new", "in_progress", "resolved"];

export default function AdminSupportPage() {
  const supabase = createClient();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SupportMessage[]>([]);
  const [filter, setFilter] = useState<"all" | SupportMessage["status"]>("all");

  useEffect(() => {
    check();
  }, []);

  async function check() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!isPlatformAdmin(profile)) {
      router.push("/dashboard");
      return;
    }
    setIsAdmin(true);
    await load();
    setLoading(false);
  }

  async function load() {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setItems((data as SupportMessage[]) || []);
  }

  async function setStatus(id: string, status: SupportMessage["status"]) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    await supabase
      .from("support_messages")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-sm" style={{ color: "var(--t3)" }}>
        Загрузка...
      </div>
    );
  }

  if (!isAdmin) return null;

  const counts = {
    all: items.length,
    new: items.filter((m) => m.status === "new").length,
    in_progress: items.filter((m) => m.status === "in_progress").length,
    resolved: items.filter((m) => m.status === "resolved").length,
  };

  const visible = filter === "all" ? items : items.filter((m) => m.status === filter);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">🆘 Обращения в поддержку</h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--t3)" }}>
            Сообщения пользователей из виджета на сайте
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
          style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}
        >
          ↻ Обновить
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "new", "in_progress", "resolved"] as const).map((f) => {
          const active = filter === f;
          const label = f === "all" ? "Все" : STATUS_META[f].label;
          const color = f === "all" ? "var(--accent)" : STATUS_META[f].color;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer border"
              style={{
                background: active ? color + "20" : "var(--card)",
                borderColor: active ? color : "var(--brd)",
                color: active ? color : "var(--t2)",
              }}
            >
              {label} · {counts[f]}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div
          className="text-center rounded-xl py-16 text-sm"
          style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}
        >
          Обращений нет
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((m) => {
            const sm = STATUS_META[m.status];
            return (
              <div
                key={m.id}
                className="rounded-xl p-4"
                style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${sm.color}` }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                    >
                      {CATEGORY_LABELS[m.category] || m.category}
                    </span>
                    <span className="text-sm font-bold">{m.name || "Без имени"}</span>
                    {m.company_name && (
                      <span className="text-[11px]" style={{ color: "var(--t3)" }}>
                        · {m.company_name}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded"
                    style={{ background: sm.color + "20", color: sm.color }}
                  >
                    {sm.label}
                  </span>
                </div>

                <div
                  className="text-sm mt-2.5"
                  style={{ color: "var(--t1)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}
                >
                  {m.message}
                </div>

                <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                  <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                    {m.email && (
                      <a href={`mailto:${m.email}`} style={{ color: "var(--accent)" }}>
                        {m.email}
                      </a>
                    )}
                    {m.email && " · "}
                    {new Date(m.created_at).toLocaleString("ru-RU")}
                  </div>
                  <div className="flex gap-1.5">
                    {STATUS_FLOW.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(m.id, s)}
                        disabled={m.status === s}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer border disabled:cursor-default"
                        style={{
                          background: m.status === s ? STATUS_META[s].color + "20" : "transparent",
                          borderColor: m.status === s ? STATUS_META[s].color : "var(--brd)",
                          color: m.status === s ? STATUS_META[s].color : "var(--t3)",
                        }}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </div>
                </div>

                {m.page_url && (
                  <div className="text-[10px] mt-2 truncate" style={{ color: "var(--t3)" }}>
                    Страница: {m.page_url}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
