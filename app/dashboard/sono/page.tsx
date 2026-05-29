"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";
import { calculate910, validate910, generate910XML, F910_INFO, type F910Data } from "@/lib/fno/form-910";
import { calculate200, validate200, generate200XML, F200_INFO, type F200Data } from "@/lib/fno/form-200";
import { calculate300, validate300, generate300XML, F300_INFO, type F300Data } from "@/lib/fno/form-300";
import { calculate100, validate100, generate100XML, F100_INFO, type F100Data } from "@/lib/fno/form-100";
import { calculate700, validate700, generate700XML, F700_INFO, VEHICLE_TYPES_LIST, LAND_CATEGORIES_LIST, type F700Data } from "@/lib/fno/form-700";

interface FNODeclaration {
  id: string;
  form_code: string;
  form_name: string | null;
  period_year: number;
  period_quarter: number | null;
  period_month: number | null;
  period_type: string;
  status: string;
  data: any;
  xml_content: string | null;
  ai_validation_summary: string | null;
  ai_warnings: any[];
  created_at: string;
  updated_at: string;
}

interface DeadlineItem {
  id: string;
  form_code: string;
  form_name: string;
  description: string;
  period_type: string;
  due_day: number;
  due_month_offset: number;
}

const FORMS = [
  { code: "910.00", info: F910_INFO },
  { code: "200.00", info: F200_INFO },
  { code: "300.00", info: F300_INFO },
  { code: "100.00", info: F100_INFO },
  { code: "700.00", info: F700_INFO },
];

const STATUS_COLORS: Record<string, { c: string; l: string }> = {
  draft: { c: "#6B7280", l: "Черновик" },
  validating: { c: "#3B82F6", l: "Проверяется" },
  ready: { c: "#10B981", l: "Готово" },
  downloaded: { c: "#3B82F6", l: "Скачано" },
  submitted: { c: "#A855F7", l: "Подано" },
  accepted: { c: "#10B981", l: "Принято КГД" },
  rejected: { c: "#EF4444", l: "Отклонено" },
};

export default function SonoPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [declarations, setDeclarations] = useState<FNODeclaration[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [tab, setTab] = useState<"calendar" | "create" | "history">("calendar");
  const [loading, setLoading] = useState(true);

  const [selectedForm, setSelectedForm] = useState<string>("910.00");
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState<number>(1);
  const [calculating, setCalculating] = useState(false);
  const [calculatedData, setCalculatedData] = useState<any>(null);
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [xmlContent, setXmlContent] = useState("");
  const [savingDecl, setSavingDecl] = useState(false);

  const [aiAdvice, setAiAdvice] = useState("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const [showRegisters, setShowRegisters] = useState(false);
  const [showDepGroups, setShowDepGroups] = useState(false);
  const [showProperty, setShowProperty] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showLand, setShowLand] = useState(true);

  const [msg, setMsg] = useState("");

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [declRes, deadRes] = await Promise.all([
      supabase.from("fno_declarations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("fno_deadlines").select("*").eq("is_active", true),
    ]);

    setDeclarations((declRes.data as FNODeclaration[]) || []);
    setDeadlines((deadRes.data as DeadlineItem[]) || []);
    setLoading(false);
  }

  function calculateNextDeadlines() {
    const now = new Date();
    const upcoming: { deadline: DeadlineItem; dueDate: Date; daysLeft: number; period: string }[] = [];

    for (const d of deadlines) {
      if (d.period_type === "quarter") {
        for (let q = 1; q <= 4; q++) {
          const periodEndMonth = q * 3;
          const dueDate = new Date(now.getFullYear(), periodEndMonth - 1 + d.due_month_offset, d.due_day);
          const daysLeft = Math.floor((dueDate.getTime() - now.getTime()) / 86400000);
          if (daysLeft >= -30 && daysLeft <= 90) {
            upcoming.push({ deadline: d, dueDate, daysLeft, period: `${q} квартал ${now.getFullYear()}` });
          }
        }
      } else if (d.period_type === "half_year") {
        for (let h = 1; h <= 2; h++) {
          const periodEndMonth = h * 6;
          const dueDate = new Date(now.getFullYear(), periodEndMonth - 1 + d.due_month_offset, d.due_day);
          const daysLeft = Math.floor((dueDate.getTime() - now.getTime()) / 86400000);
          if (daysLeft >= -30 && daysLeft <= 180) {
            upcoming.push({ deadline: d, dueDate, daysLeft, period: `${h === 1 ? "1-е" : "2-е"} полугодие ${now.getFullYear()}` });
          }
        }
      } else if (d.period_type === "year") {
        const dueDate = new Date(now.getFullYear(), d.due_month_offset - 1, d.due_day);
        const daysLeft = Math.floor((dueDate.getTime() - now.getTime()) / 86400000);
        if (daysLeft >= -30 && daysLeft <= 365) {
          upcoming.push({ deadline: d, dueDate, daysLeft, period: `${now.getFullYear() - 1} год` });
        }
      }
    }

    return upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  async function calculateDeclaration() {
    if (!userId) return;
    setCalculating(true);
    setCalculatedData(null);
    setValidation(null);
    setXmlContent("");

    try {
      let data: any;
      let val: any;
      let xml: string;

      if (selectedForm === "910.00") {
        data = await calculate910(supabase, userId, year, period as 1 | 2);
        val = validate910(data);
        xml = generate910XML(data);
      } else if (selectedForm === "200.00") {
        data = await calculate200(supabase, userId, year, period as 1 | 2 | 3 | 4);
        val = validate200(data);
        xml = generate200XML(data);
      } else if (selectedForm === "300.00") {
        data = await calculate300(supabase, userId, year, period as 1 | 2 | 3 | 4);
        val = validate300(data);
        xml = generate300XML(data);
      } else if (selectedForm === "100.00") {
        data = await calculate100(supabase, userId, year);
        val = validate100(data);
        xml = generate100XML(data);
      } else if (selectedForm === "700.00") {
        data = await calculate700(supabase, userId, year);
        val = validate700(data);
        xml = generate700XML(data);
      } else {
        setMsg(`❌ Форма ${selectedForm} ещё не реализована`);
        setCalculating(false);
        return;
      }

      setCalculatedData(data);
      setValidation(val);
      setXmlContent(xml);
    } catch (err: any) {
      setMsg(`❌ Ошибка: ${err.message}`);
    } finally {
      setCalculating(false);
    }
  }

  async function saveDeclaration() {
    if (!calculatedData || !userId) return;
    setSavingDecl(true);

    const formInfo = FORMS.find(f => f.code === selectedForm)?.info;

    const { error } = await supabase.from("fno_declarations").insert({
      user_id: userId,
      form_code: selectedForm,
      form_name: formInfo?.name,
      period_year: year,
      period_quarter: ["200.00", "300.00"].includes(selectedForm) ? period : null,
      period_month: null,
      period_type: formInfo?.period_type || "quarter",
      tin: (calculatedData as any).tin,
      taxpayer_name: (calculatedData as any).taxpayer_name,
      data: calculatedData as any,
      xml_content: xmlContent,
      xml_filename: `${selectedForm}_${year}_${period}_${(calculatedData as any).tin || "draft"}.xml`,
      status: validation && validation.errors.length === 0 ? "ready" : "draft",
      ai_warnings: validation?.warnings as any || [],
    });

    if (error) {
      setMsg(`❌ ${error.message}`);
    } else {
      setMsg("✅ Декларация сохранена");
      await init();
      setTab("history");
    }
    setSavingDecl(false);
    setTimeout(() => setMsg(""), 3000);
  }

  function downloadXML() {
    if (!xmlContent || !calculatedData) return;
    const filename = `${selectedForm}_${year}_${period}_${(calculatedData as any).tin || "draft"}.xml`;
    const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    setMsg("✅ Файл скачан. Загрузите его в cabinet.salyk.kz");
    setTimeout(() => setMsg(""), 4000);
  }

  async function getAIAdvice() {
    if (!calculatedData) return;
    setLoadingAdvice(true);
    setAiAdvice("");

    let ctxText = `Форма: ${selectedForm}\nГод: ${year}\nНалогоплательщик: ${calculatedData.taxpayer_name} (${calculatedData.tin})`;

    if (selectedForm === "910.00") {
      const d = calculatedData as F910Data;
      ctxText += `\nДоход: ${d.income_total?.toLocaleString("ru-RU")} ₸\nНалог: ${d.tax_amount?.toLocaleString("ru-RU")} ₸\nК уплате: ${d.total_to_pay?.toLocaleString("ru-RU")} ₸`;
    } else if (selectedForm === "200.00") {
      const d = calculatedData as F200Data;
      ctxText += `\nИПН: ${d.total_ipn?.toLocaleString("ru-RU")} ₸\nСН: ${d.total_social_tax?.toLocaleString("ru-RU")} ₸\nК уплате: ${d.total_to_pay?.toLocaleString("ru-RU")} ₸`;
    } else if (selectedForm === "300.00") {
      const d = calculatedData as F300Data;
      ctxText += `\nОборот по реализации (16%): ${d.sales_16_amount.toLocaleString("ru-RU")} ₸
НДС начисленный: ${d.total_output_vat.toLocaleString("ru-RU")} ₸
НДС к зачёту: ${d.total_input_vat.toLocaleString("ru-RU")} ₸
${d.is_to_pay ? `НДС к УПЛАТЕ: ${d.final_amount.toLocaleString("ru-RU")} ₸` : `НДС к ВОЗМЕЩЕНИЮ: ${d.final_amount.toLocaleString("ru-RU")} ₸`}`;
    } else if (selectedForm === "100.00") {
      const d = calculatedData as F100Data;
      ctxText += `\nСГД: ${d.total_annual_income.toLocaleString("ru-RU")} ₸
Вычеты: ${d.total_deductions.toLocaleString("ru-RU")} ₸
Налогооблагаемый доход: ${d.taxable_income.toLocaleString("ru-RU")} ₸
КПН (20%): ${d.cit_amount.toLocaleString("ru-RU")} ₸
${d.is_to_pay ? `К доплате: ${d.cit_to_pay.toLocaleString("ru-RU")} ₸` : `К возврату: ${d.cit_to_refund.toLocaleString("ru-RU")} ₸`}`;
    } else if (selectedForm === "700.00") {
      const d = calculatedData as F700Data;
      ctxText += `\nОбъекты налогообложения:
- Имущество: ${d.property_items.length} объектов, налог ${d.property_tax_total.toLocaleString("ru-RU")} ₸
- Транспорт: ${d.vehicle_items.length} ТС, налог ${d.vehicle_tax_total.toLocaleString("ru-RU")} ₸
- Земля: ${d.land_items.length} участков (${d.land_total_area_ha.toFixed(2)} га), налог ${d.land_tax_total.toLocaleString("ru-RU")} ₸
ИТОГО налог: ${d.total_tax.toLocaleString("ru-RU")} ₸
Авансовые платежи: ${d.advance_payments_paid.toLocaleString("ru-RU")} ₸
${d.is_to_pay ? `К доплате: ${d.to_pay.toLocaleString("ru-RU")} ₸` : `К возврату: ${d.to_refund.toLocaleString("ru-RU")} ₸`}`;
    }

    if (validation?.warnings.length) {
      ctxText += `\n\nПредупреждения:\n${validation.warnings.join("\n")}`;
    }

    try {
      const res = await fetch("/.netlify/functions/ai-zhanara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          messages: [{
            role: "user",
            content: `Проверь мою декларацию ${selectedForm}. Что важно проверить перед подачей? Есть ли возможности оптимизации налога?`,
          }],
          contextText: ctxText,
        }),
      });
      const data = await res.json();
      setAiAdvice(data.reply || "Не получила ответ");
    } catch (err: any) {
      setAiAdvice(`❌ ${err.message}`);
    } finally {
      setLoadingAdvice(false);
    }
  }

  async function changeStatus(declId: string, newStatus: string) {
    await supabase.from("fno_declarations").update({
      status: newStatus,
      submitted_at: newStatus === "submitted" ? new Date().toISOString() : null,
    }).eq("id", declId);
    await init();
  }

  if (loading) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  const upcomingDeadlines = calculateNextDeadlines();
  const isAnnualForm = ["100.00", "700.00"].includes(selectedForm);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #6366F110, #A855F710)", border: "1px solid #6366F130" }}>
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontSize: 22 }}>📤</span>
          <div className="text-sm font-bold">СОНО — подача ФНО в КГД</div>
        </div>
        <div className="text-[11px]" style={{ color: "var(--t2)" }}>
          Finstat автоматически рассчитает все суммы и сгенерирует XML-файл декларации.
          Загрузите файл в <a href="https://cabinet.salyk.kz" target="_blank" rel="noopener noreferrer" style={{ color: "#A855F7", textDecoration: "underline" }}>cabinet.salyk.kz</a> через раздел «Импорт декларации».
        </div>
      </div>

      <div className="flex gap-2">
        {([
          ["calendar", `📅 Календарь (${upcomingDeadlines.length})`],
          ["create", "+ Создать ФНО"],
          ["history", `📚 История (${declarations.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "calendar" && (
        <>
          <div className="text-sm font-bold">📅 Ближайшие сроки сдачи</div>
          {upcomingDeadlines.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-[12px]" style={{ color: "var(--t3)" }}>Ближайших сроков нет</div>
            </div>
          ) : (
            upcomingDeadlines.slice(0, 10).map(({ deadline, dueDate, daysLeft, period: p }, i) => {
              const isOverdue = daysLeft < 0;
              const isUrgent = daysLeft >= 0 && daysLeft <= 7;
              const color = isOverdue ? "#EF4444" : isUrgent ? "#F59E0B" : "#10B981";
              return (
                <div key={i} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${color}` }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-bold">{deadline.form_code}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: color + "20", color }}>
                          {isOverdue ? `🔴 Просрочка ${Math.abs(daysLeft)} дн.` : daysLeft === 0 ? "⚠ СЕГОДНЯ" : isUrgent ? `⚠ Через ${daysLeft} дн.` : `✓ Через ${daysLeft} дн.`}
                        </span>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--t2)" }}>{deadline.form_name}</div>
                      <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За период: <b>{p}</b> · Срок: <b>{dueDate.toLocaleDateString("ru-RU")}</b></div>
                    </div>
                    <button onClick={() => { setSelectedForm(deadline.form_code); setTab("create"); }} className="cursor-pointer rounded-lg border-none text-xs font-semibold" style={{ padding: "6px 12px", background: "var(--accent)", color: "#fff" }}>
                      + Создать
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {tab === "create" && (
        <>
          <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">📝 Создание декларации</div>

            <div className={`grid grid-cols-1 ${isAnnualForm ? "md:grid-cols-2" : "md:grid-cols-3"} gap-3 mb-3`}>
              <div>
                <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>Форма</label>
                <select value={selectedForm} onChange={e => { setSelectedForm(e.target.value); setCalculatedData(null); setPeriod(1); }}>
                  {FORMS.map(f => <option key={f.code} value={f.code}>{f.code} — {f.info.name.slice(0, 60)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>Год</label>
                <select value={year} onChange={e => { setYear(Number(e.target.value)); setCalculatedData(null); }}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {!isAnnualForm && (
                <div>
                  <label className="text-[10px] font-semibold mb-1 block" style={{ color: "var(--t3)" }}>
                    {selectedForm === "910.00" ? "Полугодие" : "Квартал"}
                  </label>
                  <select value={period} onChange={e => { setPeriod(Number(e.target.value)); setCalculatedData(null); }}>
                    {selectedForm === "910.00" ? (
                      <>
                        <option value={1}>1-е полугодие</option>
                        <option value={2}>2-е полугодие</option>
                      </>
                    ) : (
                      <>
                        <option value={1}>1 квартал</option>
                        <option value={2}>2 квартал</option>
                        <option value={3}>3 квартал</option>
                        <option value={4}>4 квартал</option>
                      </>
                    )}
                  </select>
                </div>
              )}
            </div>

            {(() => {
              const formInfo = FORMS.find(f => f.code === selectedForm)?.info;
              if (!formInfo) return null;
              return (
                <div className="rounded-lg p-3 text-[11px]" style={{ background: "var(--bg)", color: "var(--t2)" }}>
                  <div className="font-bold mb-1">ℹ {formInfo.name}</div>
                  <div>{formInfo.description}</div>
                  {formInfo.rate_info && <div className="mt-1" style={{ color: "var(--t3)" }}>Ставки: {formInfo.rate_info}</div>}
                </div>
              );
            })()}

            <button onClick={calculateDeclaration} disabled={calculating}
              className="mt-3 w-full px-4 py-2.5 rounded-lg text-white font-semibold text-sm border-none cursor-pointer"
              style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)", opacity: calculating ? 0.5 : 1 }}>
              {calculating ? "✦ Считаю..." : "✦ Рассчитать автоматически из учёта"}
            </button>
          </div>

          {calculatedData && (
            <>
              {validation && (
                <>
                  {validation.errors.length > 0 && (
                    <div className="rounded-xl p-4" style={{ background: "#EF444415", border: "1px solid #EF444440" }}>
                      <div className="text-sm font-bold mb-2" style={{ color: "#EF4444" }}>❌ Ошибки ({validation.errors.length})</div>
                      <ul className="text-[11px] pl-4" style={{ color: "var(--t2)" }}>
                        {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div className="rounded-xl p-4" style={{ background: "#F59E0B15", border: "1px solid #F59E0B40" }}>
                      <div className="text-sm font-bold mb-2" style={{ color: "#F59E0B" }}>⚠ Предупреждения ({validation.warnings.length})</div>
                      <ul className="text-[11px] pl-4" style={{ color: "var(--t2)" }}>
                        {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}

              <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3">📊 Рассчитанные показатели</div>

                {selectedForm === "910.00" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>Доход за полугодие</div>
                      <div className="text-base font-bold">{fmtMoney((calculatedData as F910Data).income_total)} ₸</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>Среднесписочная численность</div>
                      <div className="text-base font-bold">{(calculatedData as F910Data).income_employees_avg} чел.</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "#10B98115" }}>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>Налог 4%</div>
                      <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney((calculatedData as F910Data).tax_amount)} ₸</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "var(--accent-dim)" }}>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>ВСЕГО К УПЛАТЕ</div>
                      <div className="text-base font-bold" style={{ color: "var(--accent)" }}>{fmtMoney((calculatedData as F910Data).total_to_pay)} ₸</div>
                    </div>
                  </div>
                )}

                {selectedForm === "200.00" && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-lg p-2" style={{ background: "var(--bg)" }}>
                      <div className="text-[9px]" style={{ color: "var(--t3)" }}>ИПН</div>
                      <div className="text-[12px] font-bold">{fmtMoney((calculatedData as F200Data).total_ipn)} ₸</div>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: "var(--bg)" }}>
                      <div className="text-[9px]" style={{ color: "var(--t3)" }}>СН 6%</div>
                      <div className="text-[12px] font-bold">{fmtMoney((calculatedData as F200Data).total_social_tax)} ₸</div>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: "var(--bg)" }}>
                      <div className="text-[9px]" style={{ color: "var(--t3)" }}>ОПВ 10%</div>
                      <div className="text-[12px] font-bold">{fmtMoney((calculatedData as F200Data).total_opv)} ₸</div>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: "var(--accent-dim)" }}>
                      <div className="text-[9px]" style={{ color: "var(--t3)" }}>К уплате</div>
                      <div className="text-[12px] font-bold" style={{ color: "var(--accent)" }}>{fmtMoney((calculatedData as F200Data).total_to_pay)} ₸</div>
                    </div>
                  </div>
                )}

                {selectedForm === "300.00" && (() => {
                  const d = calculatedData as F300Data;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="rounded-lg p-3" style={{ background: "#10B98115" }}>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>НДС начисленный</div>
                        <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(d.total_output_vat)} ₸</div>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: "#3B82F615" }}>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>НДС к зачёту</div>
                        <div className="text-base font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(d.total_input_vat)} ₸</div>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: d.is_to_pay ? "#EF444415" : "#10B98115" }}>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>{d.is_to_pay ? "К УПЛАТЕ" : "К ВОЗМЕЩЕНИЮ"}</div>
                        <div className="text-lg font-bold" style={{ color: d.is_to_pay ? "#EF4444" : "#10B981" }}>{fmtMoney(d.final_amount)} ₸</div>
                      </div>
                    </div>
                  );
                })()}

                {selectedForm === "100.00" && (() => {
                  const d = calculatedData as F100Data;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg p-3" style={{ background: "#10B98115" }}>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>СГД</div>
                        <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(d.total_annual_income)} ₸</div>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: "#3B82F615" }}>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>Вычеты</div>
                        <div className="text-base font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(d.total_deductions)} ₸</div>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: "#A855F715" }}>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>КПН ({d.tax_rate}%)</div>
                        <div className="text-base font-bold" style={{ color: "#A855F7" }}>{fmtMoney(d.cit_amount)} ₸</div>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: d.is_to_pay ? "#EF444415" : "#10B98115" }}>
                        <div className="text-[10px]" style={{ color: "var(--t3)" }}>{d.is_to_pay ? "К ДОПЛАТЕ" : "К ВОЗВРАТУ"}</div>
                        <div className="text-lg font-bold" style={{ color: d.is_to_pay ? "#EF4444" : "#10B981" }}>{fmtMoney(d.is_to_pay ? d.cit_to_pay : d.cit_to_refund)} ₸</div>
                      </div>
                    </div>
                  );
                })()}

                {/* ═══ ФОРМА 700.00 ═══ */}
                {selectedForm === "700.00" && (() => {
                  const d = calculatedData as F700Data;
                  return (
                    <>
                      {/* СВОДКА */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                        <div className="rounded-lg p-3" style={{ background: "#3B82F615", borderLeft: "3px solid #3B82F6" }}>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>🏢 Имущество (1.5%)</div>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>{d.property_items.length} объект(ов)</div>
                          <div className="text-base font-bold mt-1" style={{ color: "#3B82F6" }}>{fmtMoney(d.property_tax_total)} ₸</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: "#A855F715", borderLeft: "3px solid #A855F7" }}>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>🚗 Транспорт</div>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>{d.vehicle_items.length} ТС</div>
                          <div className="text-base font-bold mt-1" style={{ color: "#A855F7" }}>{fmtMoney(d.vehicle_tax_total)} ₸</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: "#10B98115", borderLeft: "3px solid #10B981" }}>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>🌾 Земля</div>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>{d.land_items.length} участ. ({d.land_total_area_ha.toFixed(2)} га)</div>
                          <div className="text-base font-bold mt-1" style={{ color: "#10B981" }}>{fmtMoney(d.land_tax_total)} ₸</div>
                        </div>
                      </div>

                      {/* ═══ ИМУЩЕСТВО ═══ */}
                      {d.property_items.length > 0 && (
                        <div className="rounded-lg p-3 mb-3" style={{ background: "var(--bg)", borderLeft: "3px solid #3B82F6" }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[12px] font-bold flex items-center gap-1.5">
                              <span>🏢</span> Налог на имущество
                              <span className="text-[10px] font-normal" style={{ color: "var(--t3)" }}>· 1.5% от среднегодовой остаточной стоимости</span>
                            </div>
                            <button onClick={() => setShowProperty(!showProperty)} className="cursor-pointer rounded-lg border-none text-[10px]" style={{ padding: "3px 8px", background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
                              {showProperty ? "Скрыть" : "Показать"}
                            </button>
                          </div>

                          {showProperty && (
                            <div style={{ overflowX: "auto" }}>
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr style={{ background: "var(--card)" }}>
                                    <th style={{ padding: 4, textAlign: "left" }}>Объект</th>
                                    <th style={{ padding: 4, textAlign: "left" }}>Кадастр</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Перв. стоимость</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>На начало</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>На конец</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Среднегод.</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Налог 1.5%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {d.property_items.map(p => (
                                    <tr key={p.asset_id} style={{ borderBottom: "1px solid var(--brd)" }}>
                                      <td style={{ padding: 4 }}><b>{p.name}</b></td>
                                      <td style={{ padding: 4, fontFamily: "monospace", fontSize: 9 }}>{p.cadastral_number || "—"}</td>
                                      <td style={{ padding: 4, textAlign: "right" }}>{fmtMoney(p.initial_cost)}</td>
                                      <td style={{ padding: 4, textAlign: "right" }}>{fmtMoney(p.residual_value_start)}</td>
                                      <td style={{ padding: 4, textAlign: "right" }}>{fmtMoney(p.residual_value_end)}</td>
                                      <td style={{ padding: 4, textAlign: "right", fontWeight: 600 }}>{fmtMoney(p.average_value)}</td>
                                      <td style={{ padding: 4, textAlign: "right", fontWeight: 600, color: "#3B82F6" }}>{fmtMoney(p.tax_amount)}</td>
                                    </tr>
                                  ))}
                                  <tr style={{ background: "var(--card)", fontWeight: "bold" }}>
                                    <td colSpan={5} style={{ padding: 4, textAlign: "right" }}>ИТОГО:</td>
                                    <td style={{ padding: 4, textAlign: "right" }}>{fmtMoney(d.property_total_average_value)}</td>
                                    <td style={{ padding: 4, textAlign: "right", color: "#3B82F6" }}>{fmtMoney(d.property_tax_total)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ═══ ТРАНСПОРТ ═══ */}
                      {d.vehicle_items.length > 0 && (
                        <div className="rounded-lg p-3 mb-3" style={{ background: "var(--bg)", borderLeft: "3px solid #A855F7" }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[12px] font-bold flex items-center gap-1.5">
                              <span>🚗</span> Налог на транспорт
                              <span className="text-[10px] font-normal" style={{ color: "var(--t3)" }}>· МРП × ставка × возрастной коэф.</span>
                            </div>
                            <button onClick={() => setShowVehicles(!showVehicles)} className="cursor-pointer rounded-lg border-none text-[10px]" style={{ padding: "3px 8px", background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
                              {showVehicles ? "Скрыть" : "Показать"}
                            </button>
                          </div>

                          {showVehicles && (
                            <div style={{ overflowX: "auto" }}>
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr style={{ background: "var(--card)" }}>
                                    <th style={{ padding: 4, textAlign: "left" }}>Гос. номер</th>
                                    <th style={{ padding: 4, textAlign: "left" }}>Тип</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Параметр</th>
                                    <th style={{ padding: 4, textAlign: "center" }}>Год</th>
                                    <th style={{ padding: 4, textAlign: "center" }}>Возр.</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>МРП</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Коэф.</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Налог</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {d.vehicle_items.map(v => {
                                    const typeLabel = VEHICLE_TYPES_LIST.find(t => t.value === v.vehicle_type)?.label || v.vehicle_type;
                                    let paramLabel = "—";
                                    if (v.vehicle_type === "car" || v.vehicle_type === "motorcycle") {
                                      paramLabel = `${v.engine_volume || 0} см³`;
                                    } else if (v.vehicle_type === "truck") {
                                      paramLabel = `${v.load_capacity || 0} т`;
                                    } else if (v.vehicle_type === "bus") {
                                      paramLabel = `${v.seats || 0} мест`;
                                    } else {
                                      paramLabel = `${v.engine_power || 0} кВт`;
                                    }
                                    return (
                                      <tr key={v.asset_id} style={{ borderBottom: "1px solid var(--brd)" }}>
                                        <td style={{ padding: 4 }}><b>{v.registration_number || v.name}</b></td>
                                        <td style={{ padding: 4 }}>{typeLabel}</td>
                                        <td style={{ padding: 4, textAlign: "right" }}>{paramLabel}</td>
                                        <td style={{ padding: 4, textAlign: "center" }}>{v.year_made}</td>
                                        <td style={{ padding: 4, textAlign: "center" }}>{v.age_years} л.</td>
                                        <td style={{ padding: 4, textAlign: "right" }}>{v.base_rate_mrp}</td>
                                        <td style={{ padding: 4, textAlign: "right" }}>{v.age_coefficient.toFixed(2)}</td>
                                        <td style={{ padding: 4, textAlign: "right", fontWeight: 600, color: "#A855F7" }}>{fmtMoney(v.tax_amount)}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr style={{ background: "var(--card)", fontWeight: "bold" }}>
                                    <td colSpan={7} style={{ padding: 4, textAlign: "right" }}>ИТОГО:</td>
                                    <td style={{ padding: 4, textAlign: "right", color: "#A855F7" }}>{fmtMoney(d.vehicle_tax_total)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ═══ ЗЕМЛЯ ═══ */}
                      {d.land_items.length > 0 && (
                        <div className="rounded-lg p-3 mb-3" style={{ background: "var(--bg)", borderLeft: "3px solid #10B981" }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[12px] font-bold flex items-center gap-1.5">
                              <span>🌾</span> Земельный налог
                              <span className="text-[10px] font-normal" style={{ color: "var(--t3)" }}>· По категории и площади</span>
                            </div>
                            <button onClick={() => setShowLand(!showLand)} className="cursor-pointer rounded-lg border-none text-[10px]" style={{ padding: "3px 8px", background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
                              {showLand ? "Скрыть" : "Показать"}
                            </button>
                          </div>

                          {showLand && (
                            <div style={{ overflowX: "auto" }}>
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr style={{ background: "var(--card)" }}>
                                    <th style={{ padding: 4, textAlign: "left" }}>Участок</th>
                                    <th style={{ padding: 4, textAlign: "left" }}>Кадастр</th>
                                    <th style={{ padding: 4, textAlign: "left" }}>Регион</th>
                                    <th style={{ padding: 4, textAlign: "left" }}>Категория</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Площадь</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Ставка</th>
                                    <th style={{ padding: 4, textAlign: "right" }}>Налог</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {d.land_items.map(l => {
                                    const catLabel = LAND_CATEGORIES_LIST.find(c => c.value === l.category)?.label || l.category;
                                    const isHa = ["agricultural", "forest", "water"].includes(l.category);
                                    return (
                                      <tr key={l.asset_id} style={{ borderBottom: "1px solid var(--brd)" }}>
                                        <td style={{ padding: 4 }}><b>{l.name}</b></td>
                                        <td style={{ padding: 4, fontFamily: "monospace", fontSize: 9 }}>{l.cadastral_number || "—"}</td>
                                        <td style={{ padding: 4 }}>{l.region}</td>
                                        <td style={{ padding: 4 }}>{catLabel}</td>
                                        <td style={{ padding: 4, textAlign: "right" }}>
                                          {isHa ? `${l.area_ha} га` : `${fmtMoney(l.area_sqm)} м²`}
                                        </td>
                                        <td style={{ padding: 4, textAlign: "right" }}>{l.rate_per_unit} ₸{isHa ? "/га" : "/м²"}</td>
                                        <td style={{ padding: 4, textAlign: "right", fontWeight: 600, color: "#10B981" }}>{fmtMoney(l.tax_amount)}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr style={{ background: "var(--card)", fontWeight: "bold" }}>
                                    <td colSpan={6} style={{ padding: 4, textAlign: "right" }}>ИТОГО ({d.land_total_area_ha.toFixed(2)} га):</td>
                                    <td style={{ padding: 4, textAlign: "right", color: "#10B981" }}>{fmtMoney(d.land_tax_total)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ═══ ИТОГО ═══ */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                        <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>Начислено налогов</div>
                          <div className="text-base font-bold">{fmtMoney(d.total_tax)} ₸</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>Авансовые платежи</div>
                          <div className="text-base font-bold">{fmtMoney(d.advance_payments_paid)} ₸</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: d.is_to_pay ? "#EF444415" : "#10B98115", borderLeft: `3px solid ${d.is_to_pay ? "#EF4444" : "#10B981"}` }}>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>{d.is_to_pay ? "К ДОПЛАТЕ" : "К ВОЗВРАТУ"}</div>
                          <div className="text-lg font-bold" style={{ color: d.is_to_pay ? "#EF4444" : "#10B981" }}>{fmtMoney(d.is_to_pay ? d.to_pay : d.to_refund)} ₸</div>
                        </div>
                      </div>

                      <div className="rounded-lg p-3 mt-3 text-[10px]" style={{ background: "#3B82F610", color: "var(--t2)" }}>
                        💡 <b>Откуда данные:</b> из справочника основных средств (модуль 🏢 ОС). У каждого актива должен быть указан <code>tax_object_type</code>: property/vehicle/land.<br/>
                        💡 <b>Налог на имущество</b> — 1.5% от среднегодовой остаточной стоимости (для юрлиц).<br/>
                        💡 <b>Налог на транспорт</b> — по таблице ставок в МРП (ст.492 НК РК). Для авто 6+ лет применяется коэф. 0.7, для 16+ лет — 0.3.<br/>
                        💡 <b>Земельный налог</b> — по категории: с/х земли по га, населённые пункты по кв.м.<br/>
                        💡 <b>Авансовые платежи</b> — берутся из проводок Дт 3160/3170/3180 (расчёты по налогам).<br/>
                        💡 <b>Срок сдачи:</b> до 31 марта · <b>Срок уплаты КПН:</b> до 10 апреля следующего года.
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3">📤 Дальнейшие действия</div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={downloadXML} disabled={!validation || validation.errors.length > 0}
                    className="cursor-pointer rounded-lg border-none font-semibold"
                    style={{ padding: "10px 16px", background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff", fontSize: 13, opacity: !validation || validation.errors.length > 0 ? 0.5 : 1 }}>
                    📥 Скачать XML для СОНО
                  </button>
                  <button onClick={saveDeclaration} disabled={savingDecl}
                    className="cursor-pointer rounded-lg border-none font-semibold"
                    style={{ padding: "10px 16px", background: "var(--accent)", color: "#fff", fontSize: 13 }}>
                    {savingDecl ? "Сохраняю..." : "💾 Сохранить как черновик"}
                  </button>
                  <button onClick={getAIAdvice} disabled={loadingAdvice}
                    className="cursor-pointer rounded-lg border-none font-semibold"
                    style={{ padding: "10px 16px", background: "linear-gradient(135deg, #A855F7, #6366F1)", color: "#fff", fontSize: 13 }}>
                    {loadingAdvice ? "✦ Думает..." : "✦ Совет Жанары"}
                  </button>
                </div>

                {aiAdvice && (
                  <div className="rounded-lg p-3 mt-3" style={{ background: "#A855F710", border: "1px solid #A855F730" }}>
                    <div className="text-[11px]" style={{ color: "var(--t2)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{aiAdvice}</div>
                  </div>
                )}
              </div>

              <details className="rounded-xl p-3" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <summary className="cursor-pointer text-[12px] font-bold">🗂 Показать XML (для проверки)</summary>
                <pre className="mt-2 text-[10px] overflow-auto" style={{ background: "var(--bg)", padding: 10, borderRadius: 6, maxHeight: 300, color: "var(--t2)" }}>{xmlContent}</pre>
              </details>
            </>
          )}
        </>
      )}

      {tab === "history" && (
        <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          {declarations.length === 0 ? (
            <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
              История пуста
            </div>
          ) : (
            declarations.map((d, i) => {
              const status = STATUS_COLORS[d.status] || STATUS_COLORS.draft;
              return (
                <div key={d.id} style={{
                  padding: "14px 18px",
                  borderBottom: i < declarations.length - 1 ? "1px solid var(--brd)" : "none",
                  borderLeft: `3px solid ${status.c}`,
                }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold">{d.form_code}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: status.c + "20", color: status.c }}>
                          {status.l}
                        </span>
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--t2)" }}>{d.form_name}</div>
                      <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                        Период: {d.period_year}, {d.period_quarter ? `${d.period_quarter} квартал` : d.period_month ? `${d.period_month} месяц` : "год"} ·
                        Создан: {new Date(d.created_at).toLocaleDateString("ru-RU")}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {d.xml_content && (
                        <button onClick={() => {
                          const blob = new Blob([d.xml_content!], { type: "application/xml;charset=utf-8" });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = `${d.form_code}_${d.period_year}_${d.period_quarter || d.period_month || "year"}.xml`;
                          link.click();
                          URL.revokeObjectURL(url);
                          changeStatus(d.id, "downloaded");
                        }} className="cursor-pointer rounded-lg border-none text-[10px] font-semibold" style={{ padding: "5px 10px", background: "#10B98120", color: "#10B981" }}>
                          📥 XML
                        </button>
                      )}
                      {d.status !== "submitted" && d.status !== "accepted" && (
                        <button onClick={() => changeStatus(d.id, "submitted")} className="cursor-pointer rounded-lg border-none text-[10px] font-semibold" style={{ padding: "5px 10px", background: "#A855F720", color: "#A855F7" }}>
                          ✓ Подано
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Доступные формы:</b> 910.00 (упрощёнка), 200.00 (соц.налоги), 300.00 (НДС), 100.00 (КПН), <b>700.00 (имущество/транспорт/земля) — НОВАЯ!</b><br/>
        💡 <b>Форма 700.00</b> — годовая декларация для всех владельцев налогооблагаемого имущества. Ставки: имущество 1.5%, транспорт по МРП, земля по категории.<br/>
        💡 <b>Срок сдачи 700.00:</b> до 31 марта следующего года.
      </div>
    </div>
  );
}
