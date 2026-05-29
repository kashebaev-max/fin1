"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { VACATION_TYPES, calculateVacationPay, countDaysInPeriod } from "@/lib/hr";

export default function VacationsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [vacations, setVacations] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [form, setForm] = useState({
    employee_id: "",
    vacation_type: "labor",
    start_date: "",
    end_date: "",
    notes: "",
    order_number: "",
    order_date: new Date().toISOString().slice(0, 10),
  });

  // Calculated preview
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (form.employee_id && form.start_date && form.end_date) {
      calculatePreview();
    } else {
      setPreview(null);
    }
  }, [form.employee_id, form.start_date, form.end_date]);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }

    const [empsRes, vacsRes] = await Promise.all([
      supabase.from("employees").select("*").eq("user_id", user.id).order("full_name"),
      supabase.from("vacations").select("*").eq("user_id", user.id).order("start_date", { ascending: false }),
    ]);

    setEmployees(empsRes.data || []);
    setVacations(vacsRes.data || []);
    setLoading(false);
  }

  async function calculatePreview() {
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp) return;

    const { calendar, working } = countDaysInPeriod(form.start_date, form.end_date);
    if (calendar <= 0) return;

    // Средний дневной заработок (упрощённо: оклад / 29.3)
    const avgDailyWage = (emp.salary || 0) / 29.3;
    const calc = calculateVacationPay(avgDailyWage, calendar);

    setPreview({ ...calc, employee: emp });
  }

  async function createVacation() {
    if (!form.employee_id || !form.start_date || !form.end_date) {
      alert("Заполните все обязательные поля");
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const emp = employees.find(e => e.id === form.employee_id);
      if (!emp) return;

      const { calendar, working } = countDaysInPeriod(form.start_date, form.end_date);
      const avgDailyWage = (emp.salary || 0) / 29.3;
      const calc = calculateVacationPay(avgDailyWage, calendar);

      const journalIds: string[] = [];

      // Создаём проводки если оплачиваемый отпуск
      if (form.vacation_type !== "unpaid") {
        // Дт 7110 Кт 3350 — начисление отпускных
        const { data: e1 } = await supabase.from("journal_entries").insert({
          user_id: user.id,
          entry_date: form.start_date,
          debit_account: "7110",
          credit_account: "3350",
          amount: calc.grossAmount,
          description: `Отпускные: ${emp.full_name} (${calendar} дн)`,
        }).select().single();
        if (e1) journalIds.push(e1.id);

        // ИПН Дт 3350 Кт 3120
        if (calc.ipnAmount > 0) {
          const { data: e2 } = await supabase.from("journal_entries").insert({
            user_id: user.id,
            entry_date: form.start_date,
            debit_account: "3350",
            credit_account: "3120",
            amount: calc.ipnAmount,
            description: `ИПН с отпускных: ${emp.full_name}`,
          }).select().single();
          if (e2) journalIds.push(e2.id);
        }

        // ОПВ Дт 3350 Кт 3220
        if (calc.opvAmount > 0) {
          const { data: e3 } = await supabase.from("journal_entries").insert({
            user_id: user.id,
            entry_date: form.start_date,
            debit_account: "3350",
            credit_account: "3220",
            amount: calc.opvAmount,
            description: `ОПВ с отпускных: ${emp.full_name}`,
          }).select().single();
          if (e3) journalIds.push(e3.id);
        }
      }

      // Создаём запись об отпуске
      await supabase.from("vacations").insert({
        user_id: user.id,
        employee_id: form.employee_id,
        vacation_type: form.vacation_type,
        start_date: form.start_date,
        end_date: form.end_date,
        calendar_days: calendar,
        working_days: working,
        average_daily_wage: avgDailyWage,
        vacation_pay: calc.grossAmount,
        ipn_amount: calc.ipnAmount,
        opv_amount: calc.opvAmount,
        vosms_amount: calc.vosmsAmount,
        net_amount: calc.netAmount,
        order_number: form.order_number,
        order_date: form.order_date,
        status: "approved",
        journal_entry_ids: journalIds,
        notes: form.notes,
      });

      // Обновляем счётчик использованных дней
      if (form.vacation_type === "labor") {
        await supabase.from("employees").update({
          vacation_days_used: (emp.vacation_days_used || 0) + calendar,
        }).eq("id", emp.id);
      }

      alert(`✅ Отпуск оформлен!\nНачислено: ${calc.grossAmount.toLocaleString("ru-RU")} ₸\nК выплате: ${calc.netAmount.toLocaleString("ru-RU")} ₸\nПроводок создано: ${journalIds.length}`);

      setShowForm(false);
      setForm({
        employee_id: "", vacation_type: "labor",
        start_date: "", end_date: "", notes: "",
        order_number: "", order_date: new Date().toISOString().slice(0, 10),
      });
      setPreview(null);
      await load();
    } catch (err: any) {
      alert("Ошибка: " + err.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🏖 Отпуска</h1>
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>
            Управление отпусками сотрудников
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="cursor-pointer rounded-lg font-bold"
          style={{
            padding: "10px 18px",
            background: "linear-gradient(135deg, #A855F7, #6366F1)",
            color: "#fff", border: "none", fontSize: 13,
          }}>
          + Оформить отпуск
        </button>
      </div>

      {/* Сотрудники с остатком отпуска */}
      <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <h2 className="text-base font-bold mb-3">📊 Остатки отпускных дней</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {employees.map(emp => {
            const total = emp.vacation_days_per_year || 24;
            const used = emp.vacation_days_used || 0;
            const left = total - used;
            const percent = (used / total) * 100;
            return (
              <div key={emp.id} className="rounded-lg p-3"
                style={{ background: "var(--bg)", border: "1px solid var(--brd)" }}>
                <div className="text-[12px] font-semibold truncate">{emp.full_name}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px]" style={{ color: "var(--t3)" }}>Использовано:</span>
                  <span className="text-[10px] font-bold">{used} / {total} дн</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--brd)" }}>
                  <div style={{
                    width: `${Math.min(percent, 100)}%`, height: "100%",
                    background: percent > 80 ? "#EF4444" : percent > 50 ? "#F59E0B" : "#10B981",
                  }}/>
                </div>
                <div className="mt-1.5 text-[10px] font-bold" style={{ color: left <= 0 ? "#EF4444" : "#10B981" }}>
                  Осталось: {left} дней
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Список отпусков */}
      <h2 className="text-base font-bold">История отпусков</h2>
      {vacations.length === 0 ? (
        <div className="rounded-xl p-8 text-center"
          style={{ background: "var(--card)", border: "1px dashed var(--brd)" }}>
          <div style={{ fontSize: 48 }}>🏖</div>
          <div className="text-base font-bold mt-2">Пока нет отпусков</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {vacations.map(v => {
            const emp = employees.find(e => e.id === v.employee_id);
            const vacType = VACATION_TYPES[v.vacation_type] || VACATION_TYPES.labor;
            return (
              <div key={v.id} className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <span style={{ fontSize: 28 }}>{vacType.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px]">{emp?.full_name || "—"}</div>
                  <div className="text-[11px]" style={{ color: vacType.color }}>{vacType.name}</div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                    {v.start_date} — {v.end_date} · {v.calendar_days} дн
                    {v.order_number && ` · Приказ № ${v.order_number}`}
                  </div>
                </div>
                {v.vacation_pay > 0 && (
                  <div className="text-right">
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>К выплате</div>
                    <div className="font-bold text-[13px]" style={{ color: "#10B981" }}>
                      {Number(v.net_amount || v.vacation_pay).toLocaleString("ru-RU")} ₸
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка создания */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()}
            className="rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-5"
            style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-lg font-bold mb-4">🏖 Оформление отпуска</div>

            <div className="flex flex-col gap-3">
              <label className="block">
                <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Сотрудник *</div>
                <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                  <option value="">— Выберите —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.full_name} ({e.position || "—"})</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Тип отпуска *</div>
                <select value={form.vacation_type} onChange={e => setForm({ ...form, vacation_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                  {Object.entries(VACATION_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Дата начала *</div>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
                </label>
                <label className="block">
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Дата окончания *</div>
                  <input type="date" value={form.end_date}
                    onChange={e => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Номер приказа</div>
                  <input type="text" value={form.order_number}
                    onChange={e => setForm({ ...form, order_number: e.target.value })}
                    placeholder="ОТП-001"
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
                </label>
                <label className="block">
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Дата приказа</div>
                  <input type="date" value={form.order_date}
                    onChange={e => setForm({ ...form, order_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
                </label>
              </div>

              {/* Предпросмотр расчёта */}
              {preview && form.vacation_type !== "unpaid" && (
                <div className="rounded-lg p-3 mt-2"
                  style={{ background: "linear-gradient(135deg, #A855F710, #6366F110)", border: "1px solid #A855F740" }}>
                  <div className="text-[11px] font-bold mb-2" style={{ color: "#A855F7" }}>📊 РАСЧЁТ ОТПУСКНЫХ</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>Календарных дней:</div><div className="font-bold text-right">{preview.calendarDays}</div>
                    <div>Средний дневной:</div><div className="font-bold text-right">{Math.round(preview.averageDailyWage).toLocaleString("ru-RU")} ₸</div>
                    <div>Начислено:</div><div className="font-bold text-right">{preview.grossAmount.toLocaleString("ru-RU")} ₸</div>
                    <div style={{ color: "#EF4444" }}>ИПН 10%:</div><div className="font-bold text-right" style={{ color: "#EF4444" }}>−{preview.ipnAmount.toLocaleString("ru-RU")} ₸</div>
                    <div style={{ color: "#EF4444" }}>ОПВ 10%:</div><div className="font-bold text-right" style={{ color: "#EF4444" }}>−{preview.opvAmount.toLocaleString("ru-RU")} ₸</div>
                    <div style={{ color: "#EF4444" }}>ВОСМС 2%:</div><div className="font-bold text-right" style={{ color: "#EF4444" }}>−{preview.vosmsAmount.toLocaleString("ru-RU")} ₸</div>
                    <div className="font-bold pt-1" style={{ borderTop: "1px solid var(--brd)", color: "#10B981" }}>К ВЫПЛАТЕ:</div>
                    <div className="font-bold text-right pt-1" style={{ borderTop: "1px solid var(--brd)", color: "#10B981" }}>{preview.netAmount.toLocaleString("ru-RU")} ₸</div>
                  </div>
                </div>
              )}

              <label className="block">
                <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Примечание</div>
                <textarea value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-[12px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
              </label>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowForm(false)} disabled={creating}
                className="flex-1 py-2.5 rounded-lg cursor-pointer font-semibold text-[12px]"
                style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                Отмена
              </button>
              <button onClick={createVacation} disabled={creating}
                className="flex-1 py-2.5 rounded-lg cursor-pointer font-bold text-[12px]"
                style={{
                  background: creating ? "var(--brd)" : "linear-gradient(135deg, #A855F7, #6366F1)",
                  color: "#fff", border: "none", opacity: creating ? 0.5 : 1,
                }}>
                {creating ? "Создаём..." : "✓ Оформить отпуск"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
