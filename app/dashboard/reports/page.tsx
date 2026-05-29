"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TAX, fmtMoney, calcSalary } from "@/lib/tax2026";

type FNOCategory = "main" | "kpn" | "mineral" | "ipn" | "nds" | "excise" | "other" | "special";

interface FNO {
  code: string;
  fullName: string;
  desc: string;
  period: string;
  deadline: string;
  category: FNOCategory;
  autoFill?: boolean;
}

const ALL_FNO: FNO[] = [
  { code: "100.00", fullName: "Декларация по КПН", desc: "Корпоративный подоходный налог (20%)", period: "Годовая", deadline: "до 31 марта", category: "main", autoFill: true },
  { code: "200.00", fullName: "Декларация по ИПН и СН", desc: "ИПН 10%/15%, СН 6%, ОПВ, ВОСМС", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "main", autoFill: true },
  { code: "300.00", fullName: "Декларация по НДС", desc: "Налог на добавленную стоимость (16%)", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "main", autoFill: true },
  { code: "910.00", fullName: "Упрощённая декларация", desc: "Для субъектов малого бизнеса на СНР (4%)", period: "Раз в полугодие", deadline: "15 фев. и 15 авг.", category: "main", autoFill: true },
  { code: "101.01", fullName: "Авансовые платежи по КПН (до декларации)", desc: "Авансовые платежи КПН в 1 квартале", period: "Разовая", deadline: "до 20 января", category: "kpn" },
  { code: "101.02", fullName: "Авансовые платежи по КПН (после декларации)", desc: "Авансовые платежи после сдачи годовой декларации", period: "Разовая", deadline: "до 20 апреля", category: "kpn" },
  { code: "101.03", fullName: "Расчёт КПН у источника (резидент)", desc: "КПН у источника с резидентов", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "kpn" },
  { code: "101.04", fullName: "Расчёт КПН у источника (нерезидент)", desc: "КПН у источника с нерезидентов", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "kpn" },
  { code: "110.00", fullName: "Декларация по КПН для недропользователей", desc: "Специальная декларация для недропользователей", period: "Годовая", deadline: "до 31 марта", category: "mineral" },
  { code: "150.00", fullName: "Декларация по подписному бонусу", desc: "Подписной бонус недропользователей", period: "Разовая", deadline: "по графику", category: "mineral" },
  { code: "641.00", fullName: "Декларация по рентному налогу на экспорт", desc: "Рентный налог с экспорта нефти и газа", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "mineral" },
  { code: "220.00", fullName: "Декларация по ИПН (для физлиц на ОУР)", desc: "ИПН физических лиц на общеустановленном режиме", period: "Годовая", deadline: "до 31 марта", category: "ipn" },
  { code: "250.00", fullName: "Декларация об активах и обязательствах", desc: "Всеобщее декларирование — активы", period: "Годовая", deadline: "до 15 сентября", category: "ipn" },
  { code: "270.00", fullName: "Декларация о доходах и имуществе", desc: "Всеобщее декларирование — доходы физлиц", period: "Годовая", deadline: "до 15 сентября", category: "ipn" },
  { code: "851.00", fullName: "Декларация по единому платежу", desc: "Единый платёж (ИПН+ОПВ+ВОСМС+СО+СН)", period: "Ежемесячно", deadline: "до 25 числа", category: "ipn" },
  { code: "860.00", fullName: "Расчёт единого земельного налога", desc: "Для крестьянских хозяйств", period: "Годовая", deadline: "до 31 марта", category: "ipn" },
  { code: "880.00", fullName: "Декларация для самозанятых", desc: "Новый налог с самозанятых (2026)", period: "Ежемесячно", deadline: "до 25 числа", category: "ipn" },
  { code: "328.00", fullName: "Заявление о ввозе товаров (ЕАЭС)", desc: "НДС при импорте из стран ЕАЭС", period: "Ежемесячно", deadline: "до 20 числа", category: "nds" },
  { code: "870.00", fullName: "Декларация по КПН/НДС нерезидента", desc: "НДС по работам/услугам нерезидентов", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "nds" },
  { code: "400.00", fullName: "Декларация по акцизам", desc: "Алкоголь, табак, ГСМ, автомобили", period: "Ежемесячно", deadline: "до 20 числа", category: "excise" },
  { code: "500.00", fullName: "Декларация по плате за эмиссии", desc: "Плата за эмиссии в окружающую среду", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "other" },
  { code: "510.00", fullName: "Декларация по платежам (компенсация)", desc: "Исторические затраты недропользователей", period: "По графику", deadline: "По графику", category: "other" },
  { code: "531.00", fullName: "Декларация по плате за лесные пользования", desc: "Плата за использование лесных ресурсов", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "other" },
  { code: "590.00", fullName: "Декларация по плате за водные ресурсы", desc: "Плата за водопользование", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "other" },
  { code: "600.00", fullName: "Декларация по плате за радиочастотный спектр", desc: "Для операторов связи", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "other" },
  { code: "700.00", fullName: "Декларация по налогам на транспорт/землю/имущество", desc: "Транспортный, земельный, имущественный налоги", period: "Годовая", deadline: "до 31 марта", category: "other" },
  { code: "701.01", fullName: "Расчёт текущих платежей (транспорт/земля/имущество)", desc: "Авансовые платежи в течение года", period: "Ежегодно", deadline: "до 15 февраля", category: "other" },
  { code: "710.00", fullName: "Декларация по налогу на игорный бизнес", desc: "Для букмекерских контор и тотализаторов", period: "Ежеквартально", deadline: "до 15 числа 2-го мес.", category: "special" },
  { code: "920.00", fullName: "Декларация для КФХ на ЕЗН", desc: "Крестьянские/фермерские хозяйства", period: "Годовая", deadline: "до 31 марта", category: "special" },
];

const CATEGORY_NAMES: Record<FNOCategory, { name: string; color: string; icon: string }> = {
  main: { name: "Основные (автозаполнение)", color: "#10B981", icon: "⭐" },
  kpn: { name: "КПН и корпоративные", color: "#8B5CF6", icon: "🏢" },
  ipn: { name: "ИПН и физические лица", color: "#F59E0B", icon: "👤" },
  nds: { name: "НДС и внешнеэкономические", color: "#EC4899", icon: "🌐" },
  excise: { name: "Акцизы", color: "#EF4444", icon: "🍾" },
  other: { name: "Прочие налоги и платежи", color: "#3B82F6", icon: "📋" },
  mineral: { name: "Недропользование", color: "#6B7280", icon: "⛏" },
  special: { name: "Специальные режимы", color: "#14B8A6", icon: "🎯" },
};

type Tab = "list" | "balance" | "100.00" | "200.00" | "300.00" | "910.00";

export default function ReportsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("list");
  const [entries, setEntries] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [periodFrom, setPeriodFrom] = useState(new Date().getFullYear() + "-01-01");
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const [categoryFilter, setCategoryFilter] = useState<FNOCategory | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [j, e, d, p] = await Promise.all([
      supabase.from("journal_entries").select("*").eq("user_id", user.id).order("entry_date"),
      supabase.from("employees").select("*").eq("user_id", user.id).eq("status", "active"),
      supabase.from("documents").select("*").eq("user_id", user.id).eq("status", "done"),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
    ]);
    setEntries(j.data || []);
    setEmployees(e.data || []);
    setDocs(d.data || []);
    if (p.data) setProfile(p.data);
  }

  function getAccountBalance(code: string, type: "A" | "P" = "A"): number {
    const filtered = entries.filter(e => e.entry_date >= periodFrom && e.entry_date <= periodTo);
    const debit = filtered.filter(e => e.debit_account === code).reduce((a: number, e: any) => a + Number(e.amount), 0);
    const credit = filtered.filter(e => e.credit_account === code).reduce((a: number, e: any) => a + Number(e.amount), 0);
    return type === "A" ? debit - credit : credit - debit;
  }

  function getRevenue(): number {
    return docs.filter(d => d.doc_date >= periodFrom && d.doc_date <= periodTo && ["invoice", "sf", "act", "waybill"].includes(d.doc_type))
      .reduce((a: number, d: any) => a + Number(d.total_sum), 0);
  }

  function getNDSCollected(): number {
    return docs.filter(d => d.doc_date >= periodFrom && d.doc_date <= periodTo && Number(d.nds_sum) > 0)
      .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
  }

  function getNDSPaid(): number {
    return docs.filter(d => d.doc_date >= periodFrom && d.doc_date <= periodTo && d.doc_type === "receipt")
      .reduce((a: number, d: any) => a + Number(d.nds_sum), 0);
  }

  function getTotalFOT(): number {
    return employees.reduce((a: number, e: any) => a + Number(e.salary), 0);
  }

  function printReport(title: string) {
    const content = document.getElementById("report-content");
    if (!content) return;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title><style>body{font-family:Times New Roman,serif;padding:40px;font-size:13px;line-height:1.6;color:#111}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #333;padding:5px 8px;font-size:12px}th{background:#f0f0f0;font-weight:700}.r{text-align:right}.c{text-align:center}h2{text-align:center}h3{text-align:center;color:#555}@media print{body{padding:20px}}</style></head><body>' + content.innerHTML + '</body></html>');
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  }

  const categories: (FNOCategory | "all")[] = ["all", "main", "kpn", "ipn", "nds", "excise", "other", "mineral", "special"];
  const filteredFNO = ALL_FNO.filter(f =>
    (categoryFilter === "all" || f.category === categoryFilter) &&
    (search === "" || f.code.includes(search) || f.fullName.toLowerCase().includes(search.toLowerCase()) || f.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Все {ALL_FNO.length} форм налоговой отчётности по Приказу МФ РК №695 от 12.11.2025 • НК РК 2026
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab("list")}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "list" ? "var(--accent)" : "transparent", color: tab === "list" ? "#fff" : "var(--t3)", border: tab === "list" ? "none" : "1px solid var(--brd)" }}>
          📋 Все ФНО ({ALL_FNO.length})
        </button>
        <button onClick={() => setTab("balance")}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "balance" ? "var(--accent)" : "transparent", color: tab === "balance" ? "#fff" : "var(--t3)", border: tab === "balance" ? "none" : "1px solid var(--brd)" }}>
          📊 Бух. баланс
        </button>
        {(["910.00", "200.00", "300.00", "100.00"] as const).map(code => (
          <button key={code} onClick={() => setTab(code)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === code ? "var(--accent)" : "transparent", color: tab === code ? "#fff" : "var(--t3)", border: tab === code ? "none" : "1px solid var(--brd)" }}>
            ⚡ {code}
          </button>
        ))}
      </div>

      {tab !== "list" && (
        <div className="flex gap-3 items-center">
          <label className="text-xs" style={{ color: "var(--t3)" }}>Период:</label>
          <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} style={{ width: 150 }} />
          <span className="text-xs" style={{ color: "var(--t3)" }}>—</span>
          <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} style={{ width: 150 }} />
          <button onClick={() => printReport("Отчёт")}
            className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer ml-auto" style={{ background: "var(--accent)" }}>
            🖨 Печать
          </button>
        </div>
      )}

      {tab === "list" && (
        <>
          <div className="flex gap-3 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск: код формы или название..." style={{ maxWidth: 400 }} />
            <span className="text-xs" style={{ color: "var(--t3)" }}>Найдено: {filteredFNO.length} из {ALL_FNO.length}</span>
          </div>

          <div className="flex gap-2 flex-wrap">
            {categories.map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
                style={{
                  background: categoryFilter === c ? (c === "all" ? "var(--accent)" : CATEGORY_NAMES[c as FNOCategory]?.color) : "transparent",
                  color: categoryFilter === c ? "#fff" : "var(--t3)",
                  border: categoryFilter === c ? "none" : "1px solid var(--brd)",
                }}>
                {c === "all" ? "Все категории" : (CATEGORY_NAMES[c as FNOCategory]?.icon + " " + CATEGORY_NAMES[c as FNOCategory]?.name)}
              </button>
            ))}
          </div>

          {(categoryFilter === "all" ? Object.keys(CATEGORY_NAMES) as FNOCategory[] : [categoryFilter as FNOCategory]).map(cat => {
            const catForms = filteredFNO.filter(f => f.category === cat);
            if (catForms.length === 0) return null;
            const catInfo = CATEGORY_NAMES[cat];
            return (
              <div key={cat} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 mt-2">
                  <span style={{ fontSize: 16 }}>{catInfo.icon}</span>
                  <div className="text-sm font-bold" style={{ color: catInfo.color }}>{catInfo.name}</div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>• {catForms.length} форм</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {catForms.map(f => (
                    <div key={f.code} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid " + catInfo.color }}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold font-mono" style={{ color: catInfo.color }}>{f.code}</span>
                          {f.autoFill && <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>⚡ АВТО</span>}
                        </div>
                        {f.autoFill && (
                          <button onClick={() => setTab(f.code as Tab)}
                            className="text-[10px] font-semibold cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>
                            Открыть →
                          </button>
                        )}
                      </div>
                      <div className="text-[13px] font-semibold mb-1">{f.fullName}</div>
                      <div className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>{f.desc}</div>
                      <div className="flex justify-between text-[10px]" style={{ color: "var(--t3)" }}>
                        <span>📅 {f.period}</span>
                        <span>⏱ {f.deadline}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="rounded-xl p-4 mt-4" style={{ background: "#F59E0B10", border: "1px solid #F59E0B30" }}>
            <div className="text-xs font-bold mb-2" style={{ color: "#F59E0B" }}>ℹ️ Как сдавать формы ФНО</div>
            <div className="text-[11px]" style={{ color: "var(--t2)", lineHeight: 1.7 }}>
              Формы налоговой отчётности сдаются в электронном виде через портал Кабинет налогоплательщика (cabinet.salyk.kz) или через СОНО. ЭЦП обязательна. За несвоевременную сдачу — штраф от 5 МРП (21 625 ₸) и выше.
            </div>
          </div>
        </>
      )}

      <div id="report-content">

      {tab === "balance" && (() => {
        const assets = [
          { code: "1010", name: "Денежные средства в кассе", amount: Math.max(0, getAccountBalance("1010")) },
          { code: "1030", name: "Денежные средства на р/с", amount: Math.max(0, getAccountBalance("1030")) },
          { code: "1210", name: "Краткосрочная ДЗ покупателей", amount: Math.max(0, getAccountBalance("1210")) },
          { code: "1310", name: "Запасы (сырьё и материалы)", amount: Math.max(0, getAccountBalance("1310")) },
          { code: "1330", name: "Товары", amount: Math.max(0, getAccountBalance("1330")) },
          { code: "1420", name: "НДС к зачёту", amount: Math.max(0, getAccountBalance("1420")) },
          { code: "2410", name: "Основные средства", amount: Math.max(0, getAccountBalance("2410")) },
        ];
        const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
        const liabilities = [
          { code: "3120", name: "Обязательства по ИПН", amount: Math.max(0, getAccountBalance("3120", "P")) },
          { code: "3130", name: "НДС к уплате", amount: Math.max(0, getAccountBalance("3130", "P")) },
          { code: "3310", name: "КЗ поставщикам", amount: Math.max(0, getAccountBalance("3310", "P")) },
          { code: "3350", name: "Задолженность по ЗП", amount: Math.max(0, getAccountBalance("3350", "P")) },
          { code: "5110", name: "Уставный капитал", amount: Math.max(0, getAccountBalance("5110", "P")) },
        ];
        const totalLiab = liabilities.reduce((s, l) => s + l.amount, 0);
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>БУХГАЛТЕРСКИЙ БАЛАНС</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name || "Организация"} • на {periodTo}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <table><thead><tr><th className="text-left p-2 text-[11px]" style={{ background: "#6366F120", color: "#6366F1" }} colSpan={2}>АКТИВ</th><th className="r p-2 text-[11px]" style={{ background: "#6366F120", color: "#6366F1" }}>₸</th></tr></thead>
                <tbody>{assets.map((a, i) => (<tr key={i}><td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.code}</td><td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.name}</td><td className="p-2 text-[12px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{a.amount !== 0 ? fmtMoney(a.amount) : ""}</td></tr>))}
                <tr style={{ background: "var(--bg)" }}><td colSpan={2} className="p-2 text-[13px]" style={{ fontWeight: 700 }}>ИТОГО</td><td className="p-2 text-[13px] r" style={{ fontWeight: 700, color: "#6366F1" }}>{fmtMoney(totalAssets)}</td></tr>
                </tbody></table>
              </div>
              <div>
                <table><thead><tr><th className="text-left p-2 text-[11px]" style={{ background: "#10B98120", color: "#10B981" }} colSpan={2}>ПАССИВ</th><th className="r p-2 text-[11px]" style={{ background: "#10B98120", color: "#10B981" }}>₸</th></tr></thead>
                <tbody>{liabilities.map((l, i) => (<tr key={i}><td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.code}</td><td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.name}</td><td className="p-2 text-[12px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{l.amount !== 0 ? fmtMoney(l.amount) : ""}</td></tr>))}
                <tr style={{ background: "var(--bg)" }}><td colSpan={2} className="p-2 text-[13px]" style={{ fontWeight: 700 }}>ИТОГО</td><td className="p-2 text-[13px] r" style={{ fontWeight: 700, color: "#10B981" }}>{fmtMoney(totalLiab)}</td></tr>
                </tbody></table>
              </div>
            </div>
          </div>
        );
      })()}

      {tab === "910.00" && (() => {
        const revenue = getRevenue();
        const tax = Math.round(revenue * TAX.SNR_RATE);
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>ФНО 910.00 — УПРОЩЁННАЯ ДЕКЛАРАЦИЯ</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name} • {periodFrom} — {periodTo}</p>
            <table><thead><tr><th className="text-left p-3 text-[12px]" style={{ background: "#10B98120" }}>Показатель</th><th className="r p-3 text-[12px]" style={{ background: "#10B98120", width: 200 }}>Сумма, ₸</th></tr></thead>
            <tbody>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.001 — Доход за налоговый период</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(revenue)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.002 — Среднесписочная численность</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{employees.length}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.004 — Сумма налогов ({TAX.SNR_RATE * 100}%)</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(tax)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.005 — в т.ч. ИПН (1/2)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Math.round(tax * 0.5))}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>910.00.006 — в т.ч. СН (1/2)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Math.round(tax * 0.5))}</td></tr>
            </tbody></table>
          </div>
        );
      })()}

      {tab === "200.00" && (() => {
        const fot = getTotalFOT();
        const totalIPN = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).ipn, 0);
        const totalOPV = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).opv, 0);
        const totalOPVR = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).opvr, 0);
        const totalSO = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).so, 0);
        const totalSN = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).sn, 0);
        const totalVOSMS = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).vosms, 0);
        const totalOOSMS = employees.reduce((a: number, e: any) => a + calcSalary(Number(e.salary)).oosms, 0);
        const months = 3;
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>ФНО 200.00 — ДЕКЛАРАЦИЯ ПО ИПН И СН</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name} • за квартал</p>
            <table><thead><tr><th className="text-left p-3 text-[12px]" style={{ background: "#F59E0B20" }}>Показатель</th><th className="r p-3 text-[12px]" style={{ background: "#F59E0B20" }}>За месяц</th><th className="r p-3 text-[12px]" style={{ background: "#F59E0B20" }}>За квартал</th></tr></thead>
            <tbody>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>Численность работников</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{employees.length}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{employees.length}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>ФОТ начисленный</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(fot)}</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(fot * months)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>ИПН (10%)</td><td className="p-3 text-[13px] r" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalIPN)}</td><td className="p-3 text-[13px] r" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalIPN * months)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>ОПВ (10%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOPV)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOPV * months)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>ОПВР (3.5%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOPVR)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOPVR * months)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>СО (5%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalSO)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalSO * months)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>СН (6%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalSN)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalSN * months)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>ВОСМС (2%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalVOSMS)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalVOSMS * months)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>ООСМС (3%)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOOSMS)}</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalOOSMS * months)}</td></tr>
            </tbody></table>
          </div>
        );
      })()}

      {tab === "300.00" && (() => {
        const ndsCollected = getNDSCollected();
        const ndsPaid = getNDSPaid();
        const ndsPayable = Math.max(0, ndsCollected - ndsPaid);
        const revenue = getRevenue();
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>ФНО 300.00 — ДЕКЛАРАЦИЯ ПО НДС</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name} • Ставка: {TAX.NDS * 100}%</p>
            <table><thead><tr><th className="text-left p-3 text-[12px]" style={{ background: "#EC489920" }}>Показатель</th><th className="r p-3 text-[12px]" style={{ background: "#EC489920" }}>Сумма, ₸</th></tr></thead>
            <tbody>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>300.00.001 — Оборот по реализации (без НДС)</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(revenue)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>300.00.002 — НДС начисленный ({TAX.NDS * 100}%)</td><td className="p-3 text-[13px] r" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(ndsCollected)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>300.00.013 — НДС относимый в зачёт</td><td className="p-3 text-[13px] r" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(ndsPaid)}</td></tr>
              <tr style={{ background: "var(--bg)" }}><td className="p-3 text-[14px] font-bold">300.00.024 — НДС к уплате</td><td className="p-3 text-[14px] r font-bold" style={{ color: "#EC4899" }}>{fmtMoney(ndsPayable)}</td></tr>
            </tbody></table>
          </div>
        );
      })()}

      {tab === "100.00" && (() => {
        const revenue = getRevenue();
        const expenses = Math.abs(getAccountBalance("7010")) + Math.abs(getAccountBalance("7110")) + Math.abs(getAccountBalance("7210"));
        const taxableIncome = Math.max(0, revenue - expenses);
        const kpn = Math.round(taxableIncome * TAX.KPN);
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>ФНО 100.00 — ДЕКЛАРАЦИЯ ПО КПН</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--t3)", margin: "0 0 16px" }}>{profile?.company_name} • Ставка КПН: {TAX.KPN * 100}%</p>
            <table><thead><tr><th className="text-left p-3 text-[12px]" style={{ background: "#8B5CF620" }}>Показатель</th><th className="r p-3 text-[12px]" style={{ background: "#8B5CF620" }}>Сумма, ₸</th></tr></thead>
            <tbody>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>100.00.001 — Совокупный годовой доход (СГД)</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(revenue)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>100.00.030 — Вычеты (расходы)</td><td className="p-3 text-[13px] r" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(expenses)}</td></tr>
              <tr><td className="p-3 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>100.00.038 — Налогооблагаемый доход</td><td className="p-3 text-[13px] r font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(taxableIncome)}</td></tr>
              <tr style={{ background: "var(--bg)" }}><td className="p-3 text-[14px] font-bold">100.00.045 — КПН к уплате ({TAX.KPN * 100}%)</td><td className="p-3 text-[14px] r font-bold" style={{ color: "#8B5CF6" }}>{fmtMoney(kpn)}</td></tr>
            </tbody></table>
          </div>
        );
      })()}

      </div>
    </div>
  );
}
