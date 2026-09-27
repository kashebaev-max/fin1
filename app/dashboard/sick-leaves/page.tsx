"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { calculateSickLeave } from "@/lib/hr";

type SavedLeave = { id: string; employee_id: string; start_date: string; end_date: string; certificate_number: string | null; total_amount: number };
const money = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₸";
const fieldStyle = { background: "var(--bg)", color: "var(--t1)", border: "1px solid var(--brd)" };

export default function SickLeavesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<SavedLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<typeof calculateSickLeave> | null>(null);
  const [form, setForm] = useState({ startDate: "", endDate: "", averageDailyWage: "", workingDays: "", previouslyAccrued: "", standardCase: false });
  function change(key: string, value: string | boolean) {
    setForm(current => ({ ...current, [key]: value }));
    setResult(null); setError("");
  }
  async function load() {
    setLoading(true); setLoadError("");
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) { router.push("/auth"); return; }
      const { data, error } = await supabase.from("sick_leaves")
        .select("id,employee_id,start_date,end_date,certificate_number,total_amount")
        .eq("user_id", user.id).order("start_date", { ascending: false }).limit(100);
      if (error) throw error;
      const rows = data || [];
      if (rows.length) {
        const names = await supabase.from("employees").select("id,full_name").eq("user_id", user.id)
          .in("id", [...new Set(rows.map(row => row.employee_id))]);
        if (names.error) throw names.error;
        setEmployees(Object.fromEntries((names.data || []).map(emp => [emp.id, emp.full_name])));
      }
      setRecords(rows);
    } catch {
      setLoadError("Не удалось загрузить сохранённые больничные. Повторите попытку.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function calculate(event: React.FormEvent) {
    event.preventDefault(); setError(""); setResult(null);
    try {
      if (!form.standardCase) throw new Error("Подтвердите, что это обычный случай с ограничением 25 МРП.");
      if ([form.averageDailyWage, form.workingDays, form.previouslyAccrued].some(value => value.trim() === ""))
        throw new Error("Заполните все суммы и количество дней. Если начислений не было, введите 0.");
      setResult(calculateSickLeave({ ...form, averageDailyWage: Number(form.averageDailyWage), workingDays: Number(form.workingDays), previouslyAccrued: Number(form.previouslyAccrued) }));
    } catch (err) { setError(err instanceof Error ? err.message : "Проверьте исходные данные."); }
  }

  return <div className="flex flex-col gap-5 max-w-3xl">
    <div><h1 className="text-xl font-bold">Больничные листы</h1>
      <p className="text-sm mt-2" style={{ color: "var(--t2)" }}>Предварительный расчёт обычного пособия за один календарный месяц 2026 года.</p></div>
    <div className="rounded-xl p-4 text-sm" style={{ background: "#F59E0B15", border: "1px solid #F59E0B55" }}>
      Автоматическое оформление и создание проводок приостановлены: в прежней версии обнаружена неверная формула.
      Сохранённые записи доступны ниже и требуют проверки бухгалтером. Этот калькулятор не сохраняет начисления.
    </div>
    <p className="text-sm" style={{ color: "var(--t2)" }}>Пособие оплачивает работодатель за рабочие дни по графику сотрудника.
      Общий месячный предел для обычного случая — 25 МРП (108 125 ₸ в 2026 году).
      Удержания и сумма на руки рассчитываются отдельно в составе зарплаты.
      {" "}<a className="underline" href="https://www.gov.kz/situations/55/202?lang=ru" target="_blank" rel="noreferrer">Правила на gov.kz</a>.</p>
    <form onSubmit={calculate} className="rounded-xl p-4 flex flex-col gap-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {([{ key: "startDate", label: "Начало периода", type: "date" }, { key: "endDate", label: "Конец периода", type: "date" },
          { key: "averageDailyWage", label: "Средний дневной заработок, ₸", type: "number" },
          { key: "workingDays", label: "Рабочие дни к оплате", type: "number" },
          { key: "previouslyAccrued", label: "Другие начисленные пособия за этот месяц, ₸", type: "number" }] as const).map(field =>
          <label key={field.key} className="text-sm flex flex-col gap-2">{field.label}
            <input required type={field.type} value={form[field.key]} min={field.type === "date" ? "2026-01-01" : 0}
              max={field.type === "date" ? "2026-12-31" : undefined} step={field.type === "date" ? undefined : field.key === "workingDays" ? 1 : "0.01"}
              onChange={e => change(field.key, e.target.value)} className="w-full rounded-lg px-3 py-2" style={fieldStyle} />
          </label>)}
      </div>
      <p className="text-xs" style={{ color: "var(--t2)" }}>Введите средний заработок из расчётной ведомости и рабочие дни по фактическому графику.
        Оклад / 22 и календарные дни для этого расчёта не подходят. Для периода на стыке месяцев выполните отдельный расчёт за каждый месяц.
        Учтите все другие пособия этого сотрудника за тот же месяц, включая начисления вне Finstat.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.standardCase} onChange={e => change("standardCase", e.target.checked)} className="mt-1" />
        Это обычное пособие с лимитом 25 МРП. Случай не связан с трудовым увечьем, профессиональным заболеванием или льготной категорией.</label>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <button type="submit" className="rounded-lg px-4 py-3 font-semibold text-white bg-blue-600">Рассчитать до удержаний</button>
      {result && <div role="status" className="rounded-lg p-4" style={{ background: "#10B98115" }}>
        <div className="font-bold text-lg">Предварительно: {money(result.grossAmount)}</div>
        <div className="text-sm mt-2">Рабочих дней: {result.workingDays}. До ограничения: {money(result.uncappedAmount)}.
          Остаток месячного лимита: {money(result.remainingLimit)}.</div>
        <div className="text-sm mt-2">Сумма до удержаний. Расчёт не сохранён и не проведён.</div>
      </div>}
    </form>
    <section><h2 className="font-bold mb-3">Ранее сохранённые больничные</h2>
      {loading ? <p>Загрузка…</p> : loadError ? <div role="alert"><p>{loadError}</p><button className="underline mt-2" onClick={() => void load()}>Повторить</button></div> : records.length === 0 ? <p>Сохранённых больничных нет.</p> : <>
        <p className="text-xs mb-3">Последние 100 записей. Показаны исходные суммы без пересчёта. Проверьте начисления и связанные проводки.</p>
        {records.map(record => <div key={record.id} className="rounded-lg p-3 mb-2 text-sm" style={{ border: "1px solid var(--brd)" }}>
          <div className="font-semibold">{employees[record.employee_id] || "Сотрудник недоступен"}</div>
          <div>{record.start_date} — {record.end_date}{record.certificate_number ? ` · Листок № ${record.certificate_number}` : ""}</div>
          <div>Сохранено: {money(Number(record.total_amount))} · Требует проверки</div>
        </div>)}
      </>}
    </section>
  </div>;
}
