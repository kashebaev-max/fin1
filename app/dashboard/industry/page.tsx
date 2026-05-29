"use client";

import { useRouter } from "next/navigation";

const INDUSTRIES = [
  {
    key: "zhkh",
    icon: "🏘",
    name: "ЖКХ / ОСИ / КСК",
    desc: "Управление многоквартирными домами и кондоминиумами",
    features: ["Реестр квартир и собственников", "Тарифы на коммунальные услуги", "Начисления и оплата", "Учёт задолженностей"],
    path: "/dashboard/industry/zhkh",
    color: "#3B82F6",
  },
  {
    key: "agro",
    icon: "🌾",
    name: "Сельское хозяйство",
    desc: "Учёт полей, скота, урожая для крестьянских хозяйств",
    features: ["Поля и культуры", "Учёт скота (КРС, МРС)", "Сезонные операции", "Расчёт урожайности"],
    path: "/dashboard/industry/agro",
    color: "#10B981",
  },
  {
    key: "pharmacy",
    icon: "💊",
    name: "Аптека",
    desc: "Розничная аптечная торговля с учётом лекарств",
    features: ["Каталог лекарств", "Серии и сроки годности", "Рецептурный отпуск", "АТХ-классификация"],
    path: "/dashboard/industry/pharmacy",
    color: "#EC4899",
  },
];

export default function IndustryPage() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Отраслевые модули — расширения для специализированных видов деятельности
      </div>

      <div className="grid grid-cols-3 gap-4">
        {INDUSTRIES.map(ind => (
          <div key={ind.key}
            onClick={() => router.push(ind.path)}
            className="rounded-xl p-6 cursor-pointer transition-all"
            style={{
              background: "var(--card)",
              border: "1px solid var(--brd)",
              borderTop: `4px solid ${ind.color}`,
            }}>
            <div className="text-4xl mb-3">{ind.icon}</div>
            <div className="text-base font-bold mb-1" style={{ color: ind.color }}>{ind.name}</div>
            <div className="text-xs mb-4" style={{ color: "var(--t3)" }}>{ind.desc}</div>
            <div className="flex flex-col gap-1.5">
              {ind.features.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]" style={{ color: "var(--t2)" }}>
                  <span style={{ color: ind.color }}>✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <button
              className="mt-4 w-full py-2 rounded-lg text-white font-semibold text-xs border-none cursor-pointer"
              style={{ background: ind.color }}>
              Открыть →
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-4" style={{ background: "#F59E0B10", border: "1px solid #F59E0B30" }}>
        <div className="text-xs font-bold mb-2" style={{ color: "#F59E0B" }}>ℹ️ Как работают отраслевые модули</div>
        <div className="text-[11px]" style={{ color: "var(--t2)", lineHeight: 1.7 }}>
          Каждый модуль интегрирован с основной системой Finstat.kz. Документы, проводки, склад и отчётность работают так же, как и для обычного бизнеса. Отраслевой модуль добавляет специфическую функциональность для вашей сферы. Можно использовать несколько модулей одновременно.
        </div>
      </div>
    </div>
  );
}
