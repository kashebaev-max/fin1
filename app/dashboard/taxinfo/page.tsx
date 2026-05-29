"use client";

import { TAX, TAX_COMPUTED, fmtMoney } from "@/lib/tax2026";

export default function TaxInfoPage() {
  const sections = [
    { title: "НДС — Налог на добавленную стоимость", color: "#F59E0B", items: [
      `Базовая ставка: ${TAX.NDS * 100}% (было 12%)`,
      `Льготные ставки: 5% и 10% для отдельных товаров/услуг`,
      `Порог регистрации: ${TAX.NDS_THRESHOLD_MRP.toLocaleString()} МРП (${fmtMoney(TAX_COMPUTED.NDS_THRESHOLD)} ₸)`,
      `3 вида регистрации: добровольная, обязательная, условная`,
      `ЭСФ обязателен за нерезидента с 2026 года`,
      `Контроль e-Tamga для мониторинга ЭСФ`,
    ]},
    { title: "ИПН — Индивидуальный подоходный налог", color: "#6366F1", items: [
      `10% — доходы до ${TAX.IPN_THRESHOLD_MRP.toLocaleString()} МРП/год (${fmtMoney(TAX_COMPUTED.IPN_THRESHOLD_YEAR)} ₸)`,
      `15% — доходы свыше ${TAX.IPN_THRESHOLD_MRP.toLocaleString()} МРП/год (прогрессивная шкала)`,
      `Базовый вычет: ${TAX.BASE_DEDUCTION_MRP} МРП (${fmtMoney(TAX_COMPUTED.BASE_DEDUCTION)} ₸) — было 14 МРП`,
      `Вычет социальных платежей: ОПВ + ВОСМС`,
      `Дивиденды: 5% до 230 000 МРП, 15% свыше`,
      `Расчёт ИПН нарастающим итогом с начала года`,
    ]},
    { title: "КПН — Корпоративный подоходный налог", color: "#10B981", items: [
      `Базовая ставка: ${TAX.KPN * 100}% (без изменений)`,
      `Банки и игорный бизнес: ${TAX.KPN_BANK * 100}%`,
      `Сельхозпроизводители: ${TAX.KPN_AGRO * 100}%`,
      `С/х кооперативы: ${TAX.KPN_COOP * 100}%`,
      `Соцсфера (образование, медицина): ${TAX.KPN_SOC_2026 * 100}% (2026), ${TAX.KPN_SOC_2027 * 100}% (2027)`,
      `Авансовые платежи: порог ${TAX.KPN_ADVANCE_MRP.toLocaleString()} МРП`,
    ]},
    { title: "Зарплатные налоги и соцплатежи", color: "#8B5CF6", items: [
      `ОПВ: ${TAX.OPV * 100}% (за счёт работника)`,
      `ОПВР: ${TAX.OPVR * 100}% (за счёт работодателя, было 2.5%)`,
      `ВОСМС: ${TAX.VOSMS * 100}% (за счёт работника), лимит 20 МЗП`,
      `ООСМС: ${TAX.OOSMS * 100}% (за счёт работодателя), лимит 40 МЗП`,
      `СО: ${TAX.SO * 100}% от (ЗП − ОПВ)`,
      `СН: ${TAX.SN * 100}% (было 11%, но теперь без вычета СО)`,
    ]},
    { title: "Показатели 2026 года", color: "#EC4899", items: [
      `МРП: ${fmtMoney(TAX.MRP)} ₸ (было 3 932 ₸)`,
      `МЗП: ${fmtMoney(TAX.MZP)} ₸`,
      `Порог НДС: ${TAX.NDS_THRESHOLD_MRP.toLocaleString()} МРП = ${fmtMoney(TAX_COMPUTED.NDS_THRESHOLD)} ₸`,
      `Порог ИПН 15%: ${TAX.IPN_THRESHOLD_MRP.toLocaleString()} МРП/год = ${fmtMoney(TAX_COMPUTED.IPN_THRESHOLD_YEAR)} ₸`,
      `Базовый вычет ИПН: ${TAX.BASE_DEDUCTION_MRP} МРП = ${fmtMoney(TAX_COMPUTED.BASE_DEDUCTION)} ₸/мес`,
      `Наличные без вычета КПН: >1 000 МРП (${fmtMoney(1000 * TAX.MRP)} ₸)`,
    ]},
    { title: "СНР — Специальные налоговые режимы", color: "#06B6D4", items: [
      `Осталось 3 режима (было 8+)`,
      `Самозанятые: ИПН 0%, только соцплатежи, до 300 МРП/мес`,
      `Упрощённая декларация: ставка ${TAX.SNR_RATE * 100}% (±50% по регионам)`,
      `Порог упрощёнки: ${TAX.SNR_THRESHOLD_MRP.toLocaleString()} МРП в год`,
      `КФХ: единый земельный налог → ИПН`,
      `Расходы у лиц на СНР не вычитаются из КПН`,
    ]},
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px]" style={{ color: "var(--t3)" }}>
        Новый Налоговый кодекс РК (ЗРК 214-VIII от 18 июля 2025 г.) — вступил в силу 01.01.2026
      </div>
      {sections.map((s, i) => (
        <div key={i} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${s.color}` }}>
          <div className="text-sm font-bold mb-3" style={{ color: s.color }}>{s.title}</div>
          <div className="flex flex-col gap-2">
            {s.items.map((item, j) => (
              <div key={j} className="text-[13px] pl-3" style={{ color: "var(--t2)", borderLeft: "2px solid var(--brd)" }}>{item}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
