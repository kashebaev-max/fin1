"use client";
export default function ReportsPage() {
  const reports = [
    { name: "ФНО 910.00", desc: "Упрощённая декларация (ставка 4%)", icon: "📋", color: "#10B981", dl: "Раз в полугодие" },
    { name: "ФНО 200.00", desc: "Декларация по ИПН 10%/15% и СН 6%", icon: "📋", color: "#F59E0B", dl: "Ежеквартально" },
    { name: "ФНО 300.00", desc: "Декларация по НДС 16%", icon: "📋", color: "#EC4899", dl: "Ежеквартально" },
    { name: "ФНО 100.00", desc: "Декларация по КПН 20%", icon: "📋", color: "#6366F1", dl: "Ежегодно" },
    { name: "ОСВ", desc: "Оборотно-сальдовая ведомость", icon: "📊", color: "#06B6D4" },
    { name: "Баланс", desc: "Бухгалтерский баланс", icon: "📊", color: "#8B5CF6" },
    { name: "Ведомость ЗП", desc: "ОПВ 10%, ВОСМС 2%, ОПВР 3.5%", icon: "💳", color: "#A855F7" },
    { name: "Остатки ТМЗ", desc: "Цены с НДС 16%", icon: "📦", color: "#84CC16" },
    { name: "Кассовая книга", desc: "ПКО / РКО", icon: "💵", color: "#14B8A6" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px]" style={{ color: "var(--t3)" }}>Формирование отчётов и деклараций по НК РК 2026</div>
      <div className="grid grid-cols-3 gap-3">
        {reports.map((r, i) => (
          <div key={i} className="rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-0.5"
            style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${r.color}` }}>
            <div className="flex items-center gap-2 mb-1"><span className="text-lg">{r.icon}</span><span className="text-[13px] font-bold">{r.name}</span></div>
            <div className="text-[11px]" style={{ color: "var(--t3)" }}>{r.desc}</div>
            {r.dl && <div className="text-[11px] font-semibold mt-2" style={{ color: r.color }}>📅 {r.dl}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
