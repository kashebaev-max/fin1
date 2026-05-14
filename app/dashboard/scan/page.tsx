"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import DocumentScanner from "@/components/DocumentScanner";

const DOC_TYPES: Record<string, { name: string; icon: string; color: string }> = {
  invoice: { name: "Счёт-фактура", icon: "📋", color: "#A855F7" },
  receipt: { name: "Чек", icon: "🧾", color: "#10B981" },
  delivery_note: { name: "Накладная", icon: "📦", color: "#F59E0B" },
  act: { name: "Акт", icon: "📄", color: "#6366F1" },
  contract: { name: "Договор", icon: "📜", color: "#EC4899" },
  payment_order: { name: "Платёжка", icon: "💰", color: "#10B981" },
  other: { name: "Документ", icon: "📄", color: "#6B7280" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  parsed: { label: "Распознан", color: "#A855F7" },
  created: { label: "✅ Создан в системе", color: "#10B981" },
  cancelled: { label: "Отменён", color: "#6B7280" },
  failed: { label: "Ошибка", color: "#EF4444" },
};

export default function ScanHistoryPage() {
  const supabase = createClient();
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("document_scans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    setScans(data || []);
    setLoading(false);
  }

  const filtered = filter === "all" ? scans : scans.filter(s => s.document_type === filter);

  const stats = {
    total: scans.length,
    parsed: scans.filter(s => s.status === "parsed").length,
    created: scans.filter(s => s.status === "created").length,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">📸 Сканированные документы</h1>
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>
            История распознанных документов через AI Жанару
          </p>
        </div>
        <button onClick={() => setShowScanner(true)}
          className="cursor-pointer rounded-lg font-bold flex items-center gap-2"
          style={{
            padding: "10px 18px",
            background: "linear-gradient(135deg, #A855F7, #6366F1)",
            color: "#fff",
            border: "none",
            fontSize: 13,
          }}>
          <span style={{ fontSize: 18 }}>📸</span>
          <span>Новый скан</span>
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-[10px]" style={{ color: "var(--t3)" }}>ВСЕГО СКАНОВ</div>
          <div className="text-2xl font-extrabold mt-1">{stats.total}</div>
        </div>
        <div className="rounded-xl p-3" style={{ background: "#A855F715", border: "1px solid #A855F740" }}>
          <div className="text-[10px]" style={{ color: "#A855F7" }}>РАСПОЗНАНО</div>
          <div className="text-2xl font-extrabold mt-1" style={{ color: "#A855F7" }}>{stats.parsed}</div>
        </div>
        <div className="rounded-xl p-3" style={{ background: "#10B98115", border: "1px solid #10B98140" }}>
          <div className="text-[10px]" style={{ color: "#10B981" }}>СОЗДАНО В СИСТЕМЕ</div>
          <div className="text-2xl font-extrabold mt-1" style={{ color: "#10B981" }}>{stats.created}</div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter("all")}
          className="cursor-pointer rounded-lg text-[11px] font-semibold"
          style={{
            padding: "5px 12px",
            background: filter === "all" ? "var(--accent)" : "var(--card)",
            color: filter === "all" ? "#fff" : "var(--t2)",
            border: filter === "all" ? "none" : "1px solid var(--brd)",
          }}>
          Все ({scans.length})
        </button>
        {Object.entries(DOC_TYPES).map(([key, info]) => {
          const count = scans.filter(s => s.document_type === key).length;
          if (count === 0) return null;
          return (
            <button key={key} onClick={() => setFilter(key)}
              className="cursor-pointer rounded-lg text-[11px] font-semibold flex items-center gap-1"
              style={{
                padding: "5px 12px",
                background: filter === key ? info.color : "var(--card)",
                color: filter === key ? "#fff" : "var(--t2)",
                border: filter === key ? "none" : "1px solid var(--brd)",
              }}>
              <span>{info.icon}</span>
              <span>{info.name} ({count})</span>
            </button>
          );
        })}
      </div>

      {/* Список */}
      {loading ? (
        <div className="text-center py-8" style={{ color: "var(--t3)" }}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-12 text-center"
          style={{ background: "var(--card)", border: "1px dashed var(--brd)" }}>
          <div style={{ fontSize: 64 }}>📸</div>
          <div className="text-lg font-bold mt-3">Пока нет сканированных документов</div>
          <div className="text-[12px] mt-2 mb-4" style={{ color: "var(--t3)" }}>
            Сканируйте чеки, накладные, счета — Жанара распознает и создаст в системе
          </div>
          <button onClick={() => setShowScanner(true)}
            className="cursor-pointer rounded-lg font-bold inline-flex items-center gap-2"
            style={{
              padding: "10px 20px",
              background: "linear-gradient(135deg, #A855F7, #6366F1)",
              color: "#fff",
              border: "none",
              fontSize: 13,
            }}>
            📸 Сделать первый скан
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(scan => {
            const docType = DOC_TYPES[scan.document_type] || DOC_TYPES.other;
            const status = STATUS_LABELS[scan.status] || STATUS_LABELS.parsed;
            const data = scan.parsed_data || {};

            return (
              <div key={scan.id} className="rounded-xl p-3"
                style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="flex items-start gap-3">
                  <span style={{ fontSize: 28 }}>{docType.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-[13px]">{docType.name}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        padding: "2px 6px", borderRadius: 4,
                        background: status.color + "15", color: status.color,
                      }}>{status.label}</span>
                    </div>
                    {data.supplier?.name && (
                      <div className="text-[12px]" style={{ color: "var(--t2)" }}>
                        {data.supplier.name}
                        {data.supplier.bin && ` (БИН ${data.supplier.bin})`}
                      </div>
                    )}
                    <div className="text-[10px] mt-1 flex items-center gap-3" style={{ color: "var(--t3)" }}>
                      {data.document_date && <span>📅 {data.document_date}</span>}
                      {data.document_number && <span>№ {data.document_number}</span>}
                      <span>{new Date(scan.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                  </div>
                  {data.total_amount && (
                    <div className="text-right">
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>Сумма</div>
                      <div className="font-bold text-[14px]" style={{ color: "#10B981" }}>
                        {Number(data.total_amount).toLocaleString("ru-RU")} ₸
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Сканер модалка */}
      <DocumentScanner 
        isOpen={showScanner} 
        onClose={() => setShowScanner(false)}
        onSuccess={() => { setShowScanner(false); load(); }}
      />
    </div>
  );
}
