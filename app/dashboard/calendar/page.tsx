"use client";

import { useState } from "react";
import { TAX, fmtMoney } from "@/lib/tax2026";

interface Deadline {
  date: string;
  form: string;
  description: string;
  frequency: string;
  color: string;
  category: "tax" | "report" | "payment" | "social";
}

const DEADLINES_2026: Deadline[] = [
  // ЯНВАРЬ
  { date: "2026-01-15", form: "ФНО 300.00", description: "Декларация по НДС 16% за 4 кв. 2025", frequency: "Ежеквартально", color: "#EC4899", category: "report" },
  { date: "2026-01-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата налогов и соцплатежей за декабрь 2025", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  // ФЕВРАЛЬ
  { date: "2026-02-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата налогов и соцплатежей за январь 2026", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  // МАРТ
  { date: "2026-03-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата налогов и соцплатежей за февраль", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-03-31", form: "ФНО 910.00", description: "Упрощённая декларация за 2 полугодие 2025", frequency: "Раз в полугодие", color: "#10B981", category: "report" },
  { date: "2026-03-31", form: "ФНО 200.00", description: "Декларация по ИПН и СН за 4 кв. 2025", frequency: "Ежеквартально", color: "#F59E0B", category: "report" },
  { date: "2026-03-31", form: "ФНО 100.00", description: "Декларация по КПН за 2025 год", frequency: "Ежегодно", color: "#8B5CF6", category: "report" },
  // АПРЕЛЬ
  { date: "2026-04-10", form: "КПН", description: "Уплата КПН за 2025 год", frequency: "Ежегодно", color: "#8B5CF6", category: "payment" },
  { date: "2026-04-15", form: "ФНО 300.00", description: "Декларация по НДС 16% за 1 кв. 2026", frequency: "Ежеквартально", color: "#EC4899", category: "report" },
  { date: "2026-04-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата налогов и соцплатежей за март", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-04-25", form: "НДС", description: "Уплата НДС 16% за 1 кв. 2026", frequency: "Ежеквартально", color: "#EC4899", category: "payment" },
  // МАЙ — ИЮНЬ
  { date: "2026-05-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата за апрель", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-06-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата за май", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-06-30", form: "ФНО 200.00", description: "Декларация по ИПН и СН за 1 кв. 2026", frequency: "Ежеквартально", color: "#F59E0B", category: "report" },
  // ИЮЛЬ
  { date: "2026-07-15", form: "ФНО 300.00", description: "Декларация по НДС 16% за 2 кв. 2026", frequency: "Ежеквартально", color: "#EC4899", category: "report" },
  { date: "2026-07-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата за июнь", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-07-25", form: "НДС", description: "Уплата НДС 16% за 2 кв. 2026", frequency: "Ежеквартально", color: "#EC4899", category: "payment" },
  // АВГУСТ
  { date: "2026-08-15", form: "ФНО 910.00", description: "Упрощённая декларация за 1 полугодие 2026", frequency: "Раз в полугодие", color: "#10B981", category: "report" },
  { date: "2026-08-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата за июль", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  // СЕНТЯБРЬ — ОКТЯБРЬ
  { date: "2026-09-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата за август", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-09-30", form: "ФНО 200.00", description: "Декларация по ИПН и СН за 2 кв. 2026", frequency: "Ежеквартально", color: "#F59E0B", category: "report" },
  { date: "2026-10-15", form: "ФНО 300.00", description: "Декларация по НДС 16% за 3 кв. 2026", frequency: "Ежеквартально", color: "#EC4899", category: "report" },
  { date: "2026-10-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата за сентябрь", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-10-25", form: "НДС", description: "Уплата НДС 16% за 3 кв. 2026", frequency: "Ежеквартально", color: "#EC4899", category: "payment" },
  // НОЯБРЬ — ДЕКАБРЬ
  { date: "2026-11-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата за октябрь", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-12-25", form: "ИПН/СН/ОПВ/СО", description: "Уплата за ноябрь", frequency: "Ежемесячно", color: "#6366F1", category: "payment" },
  { date: "2026-12-31", form: "ФНО 200.00", description: "Декларация по ИПН и СН за 3 кв. 2026", frequency: "Ежеквартально", color: "#F59E0B", category: "report" },
];

export default function CalendarPage() {
  const [filter, setFilter] = useState<"all" | "report" | "payment">("all");
  const today = new Date().toISOString().slice(0, 10);

  const filtered = DEADLINES_2026.filter(d => filter === "all" || d.category === filter);
  const upcoming = filtered.filter(d => d.date >= today).slice(0, 5);
  const overdue = filtered.filter(d => d.date < today);

  function daysUntil(date: string): number {
    return Math.ceil((new Date(date).getTime() - new Date(today).getTime()) / 86400000);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Календарь бухгалтера 2026 • НК РК (ЗРК 214-VIII) • НДС 16% • ИПН 10%/15%
      </div>

      {/* Upcoming deadlines */}
      {upcoming.length > 0 && (
        <div className="rounded-xl p-5" style={{ background: "#F59E0B08", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-sm font-bold mb-3" style={{ color: "#F59E0B" }}>⏰ Ближайшие сроки</div>
          {upcoming.map((d, i) => {
            const days = daysUntil(d.date);
            const urgent = days <= 7;
            return (
              <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: i < upcoming.length - 1 ? "1px solid var(--brd)" : "none" }}>
                <div className="text-xs font-mono font-bold" style={{ color: urgent ? "#EF4444" : "var(--t1)", minWidth: 80 }}>{d.date.slice(5)}</div>
                <div className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: d.color + "20", color: d.color, minWidth: 90 }}>{d.form}</div>
                <div className="flex-1 text-xs" style={{ color: "var(--t2)" }}>{d.description}</div>
                <div className="text-xs font-bold" style={{ color: urgent ? "#EF4444" : "#F59E0B" }}>
                  {days === 0 ? "СЕГОДНЯ!" : days === 1 ? "ЗАВТРА!" : `${days} дн.`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {([["all", "Все"], ["report", "📋 Отчётность"], ["payment", "💰 Уплата"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: filter === key ? "var(--accent)" : "transparent", color: filter === key ? "#fff" : "var(--t3)", border: filter === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tax rates reminder */}
      <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-xs font-bold mb-2" style={{ color: "var(--t3)" }}>Ставки для расчёта (НК РК 2026)</div>
        <div className="grid grid-cols-4 gap-2 text-[11px]" style={{ color: "var(--t2)" }}>
          <div>НДС: <b style={{ color: "var(--t1)" }}>16%</b></div>
          <div>ИПН: <b style={{ color: "var(--t1)" }}>10%/15%</b></div>
          <div>ОПВ: <b style={{ color: "var(--t1)" }}>10%</b></div>
          <div>ОПВР: <b style={{ color: "var(--t1)" }}>3.5%</b></div>
          <div>СН: <b style={{ color: "var(--t1)" }}>6%</b></div>
          <div>СО: <b style={{ color: "var(--t1)" }}>5%</b></div>
          <div>ВОСМС: <b style={{ color: "var(--t1)" }}>2%</b></div>
          <div>ООСМС: <b style={{ color: "var(--t1)" }}>3%</b></div>
        </div>
      </div>

      {/* Full calendar */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-sm font-bold mb-4">Полный календарь 2026</div>
        <table>
          <thead><tr>{["Дата", "Форма", "Описание", "Периодичность", "Статус"].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((d, i) => {
            const isPast = d.date < today;
            const isClose = !isPast && daysUntil(d.date) <= 14;
            return (
              <tr key={i}>
                <td className="p-2.5 text-[13px] font-mono font-semibold" style={{ color: isPast ? "var(--t3)" : isClose ? "#EF4444" : "var(--t1)", borderBottom: "1px solid var(--brd)" }}>{d.date}</td>
                <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}><span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: d.color + "20", color: d.color }}>{d.form}</span></td>
                <td className="p-2.5 text-[13px]" style={{ color: isPast ? "var(--t3)" : "var(--t1)", borderBottom: "1px solid var(--brd)" }}>{d.description}</td>
                <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{d.frequency}</td>
                <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                  {isPast ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#6B728020", color: "#6B7280" }}>Прошёл</span>
                    : isClose ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#EF444420", color: "#EF4444" }}>Скоро! ({daysUntil(d.date)} дн.)</span>
                    : <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>Впереди</span>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
