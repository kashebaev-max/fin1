"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { calculateSickLeave, calculateWorkExperience, sickLeaveRate, countDaysInPeriod } from "@/lib/hr";

export default function SickLeavesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [sickLeaves, setSickLeaves] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    employee_id: "",
    start_date: "",
    end_date: "",
    certificate_number: "",
    certificate_date: new Date().toISOString().slice(0, 10),
    diagnosis: "",
    notes: "",
  });

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

    const [empsRes, sicksRes] = await Promise.all([
      supabase.from("employees").select("*").eq("user_id", user.id).order("full_name"),
      supabase.from("sick_leaves").select("*").eq("user_id", user.id).order("start_date", { ascending: false }),
    ]);

    setEmployees(empsRes.data || []);
    setSickLeaves(sicksRes.data || []);
    setLoading(false);
  }

  function calculatePreview() {
    const emp = employees.find(e => e.id === form.employee_id);
    if (!emp) return;

    const { calendar } = countDaysInPeriod(form.start_date, form.end_date);
    if (calendar <= 0) return;

    const experience = calculateWorkExperience(emp.work_experience_start_date || emp.hire_date);
    const avgDailyWage = (emp.salary || 0) / 22;
    const calc = calculateSickLeave(avgDailyWage, calendar, experience);

    setPreview({ ...calc, employee: emp, totalDays: calendar, experience });
  }

  async function createSickLeave() {
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

      const { calendar } = countDaysInPeriod(form.start_date, form.end_date);
      const experience = calculateWorkExperience(emp.work_experience_start_date || emp.hire_date);
      const avgDailyWage = (emp.salary || 0) / 22;
      const calc = calculateSickLeave(avgDailyWage, calendar, experience);

      const journalIds: string[] = [];

      // Проводка работодателя: Дт 7110 Кт 3350
      if (calc.employerAmount > 0) {
        const { data: e1 } = await supabase.from("journal_entries").insert({
          user_id: user.id,
          entry_date: form.start_date,
          debit_account: "7110",
          credit_account: "3350",
          amount: calc.employerAmount,
          description: `Больничный (работодатель, ${calc.employerDays} дн): ${emp.full_name}`,
        }).select().single();
        if (e1) journalIds.push(e1.id);
      }

      // Проводка ГФСС: Дт 1410 Кт 3350 (зачёт от фонда)
      if (calc.gfssAmount > 0) {
        const { data: e2 } = await supabase.from("journal_entries").insert({
          user_id: user.id,
          entry_date: form.start_date,
          debit_account: "1410",
          credit_account: "3350",
          amount: calc.gfssAmount,
          description: `Больничный (ГФСС, ${calc.gfssDays} дн): ${emp.full_name}`,
        }).select().single();
        if (e2) journalIds.push(e2.id);
      }

      // ИПН с части работодателя
      if (calc.ipnAmount > 0) {
        const { data: e3 } = await supabase.from("journal_entries").insert({
          user_id: user.id,
          entry_date: form.start_date,
          debit_account: "3350",
          credit_account: "3120",
          amount: calc.ipnAmount,
          description: `ИПН с больничного: ${emp.full_name}`,
        }).select().single();
        if (e3) journalIds.push(e3.id);
      }

      await supabase.from("sick_leaves").insert({
        user_id: user.id,
        employee_id: form.employee_id,
        start_date: form.start_date,
        end_date: form.end_date,
        total_days: calendar,
        work_experience_years: experience,
        payment_rate: calc.paymentRate,
        average_daily_wage: avgDailyWage,
        employer_days: calc.employerDays,
        employer_amount: calc.employerAmount,
        gfss_days: calc.gfssDays,
        gfss_amount: calc.gfssAmount,
        total_amount: calc.totalAmount,
        ipn_amount: calc.ipnAmount,
        net_amount: calc.netAmount,
        certificate_number: form.certificate_number,
        certificate_date: form.certificate_date,
        diagnosis: form.diagnosis,
        status: "approved",
        journal_entry_ids: journalIds,
        notes: form.notes,
      });

      alert(`✅ Больничный оформлен!\nВсего: ${calc.totalAmount.toLocaleString("ru-RU")} ₸\n• Работодатель (3 дня): ${calc.employerAmount.toLocaleString("ru-RU")} ₸\n• ГФСС (${calc.gfssDays} дн): ${calc.gfssAmount.toLocaleString("ru-RU")} ₸\n• К выплате: ${calc.netAmount.toLocaleString("ru-RU")} ₸\nПроводок: ${journalIds.length}`);

      setShowForm(false);
      setForm({
        employee_id: "", start_date: "", end_date: "",
        certificate_number: "", certificate_date: new Date().toISOString().slice(0, 10),
        diagnosis: "", notes: "",
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
          <h1 className="text-xl font-bold">🤒 Больничные листы</h1>
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>
            Учёт временной нетрудоспособности с автоматическим расчётом
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="cursor-pointer rounded-lg font-bold"
          style={{
            padding: "10px 18px",
            background: "linear-gradient(135deg, #EF4444, #DC2626)",
            color: "#fff", border: "none", fontSize: 13,
          }}>
          + Новый больничный
        </button>
      </div>

      {/* Инфо-блок про правила */}
      <div className="rounded-xl p-3 text-[11px]"
        style={{ background: "#06B6D410", border: "1px solid #06B6D440", color: "var(--t2)" }}>
        <b style={{ color: "#06B6D4" }}>📋 Правила расчёта:</b> Первые 3 дня — за счёт работодателя, с 4-го дня — за счёт ГФСС. 
        Стаж до 1 года = 60%, 1-5 лет = 80%, свыше 5 лет = 100% среднего заработка.
      </div>

      {/* Список больничных */}
      {sickLeaves.length === 0 ? (
        <div className="rounded-xl p-12 text-center"
          style={{ background: "var(--card)", border: "1px dashed var(--brd)" }}>
          <div style={{ fontSize: 48 }}>🤒</div>
          <div className="text-base font-bold mt-2">Пока нет больничных</div>
          <div className="text-[12px] mt-1" style={{ color: "var(--t3)" }}>
            Создайте первый при предъявлении листка нетрудоспособности
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sickLeaves.map(s => {
            const emp = employees.find(e => e.id === s.employee_id);
            return (
              <div key={s.id} className="rounded-xl p-3"
                style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="flex items-start gap-3">
                  <span style={{ fontSize: 28 }}>🤒</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[13px]">{emp?.full_name || "—"}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: s.payment_rate === 100 ? "#10B98115" : s.payment_rate === 80 ? "#F59E0B15" : "#EF444415",
                        color: s.payment_rate === 100 ? "#10B981" : s.payment_rate === 80 ? "#F59E0B" : "#EF4444",
                      }}>{s.payment_rate}%</span>
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>
                      {s.start_date} — {s.end_date} · {s.total_days} дн
                      {s.certificate_number && ` · Листок № ${s.certificate_number}`}
                    </div>
                    <div className="text-[10px] mt-1 flex gap-3" style={{ color: "var(--t3)" }}>
                      <span>🏢 Работодатель: <b>{Number(s.employer_amount).toLocaleString("ru-RU")} ₸</b> ({s.employer_days} дн)</span>
                      {s.gfss_days > 0 && (
                        <span>🏛 ГФСС: <b>{Number(s.gfss_amount).toLocaleString("ru-RU")} ₸</b> ({s.gfss_days} дн)</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>К выплате</div>
                    <div className="font-bold text-[14px]" style={{ color: "#10B981" }}>
                      {Number(s.net_amount).toLocaleString("ru-RU")} ₸
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модалка */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()}
            className="rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-5"
            style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-lg font-bold mb-4">🤒 Оформление больничного</div>

            <div className="flex flex-col gap-3">
              <label>
                <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Сотрудник *</div>
                <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-[13px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
                  <option value="">— Выберите —</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Начало болезни *</div>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
                </label>
                <label>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Окончание *</div>
                  <input type="date" value={form.end_date}
                    onChange={e => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>№ листка</div>
                  <input type="text" value={form.certificate_number}
                    onChange={e => setForm({ ...form, certificate_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
                </label>
                <label>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Дата листка</div>
                  <input type="date" value={form.certificate_date}
                    onChange={e => setForm({ ...form, certificate_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
                </label>
              </div>

              <label>
                <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--t2)" }}>Диагноз / Причина</div>
                <input type="text" value={form.diagnosis}
                  onChange={e => setForm({ ...form, diagnosis: e.target.value })}
                  placeholder="ОРВИ, грипп, травма..."
                  className="w-full px-3 py-2 rounded-lg text-[13px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
              </label>

              {/* Предпросмотр */}
              {preview && (
                <div className="rounded-lg p-3 mt-2"
                  style={{ background: "linear-gradient(135deg, #EF444410, #DC262610)", border: "1px solid #EF444440" }}>
                  <div className="text-[11px] font-bold mb-2" style={{ color: "#EF4444" }}>📊 РАСЧЁТ БОЛЬНИЧНОГО</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>Всего дней:</div><div className="font-bold text-right">{preview.totalDays}</div>
                    <div>Стаж работы:</div><div className="font-bold text-right">{preview.experience.toFixed(1)} лет → {preview.paymentRate}%</div>
                    <div>Средний дневной:</div><div className="font-bold text-right">{Math.round(preview.averageDailyWage).toLocaleString("ru-RU")} ₸</div>
                    <div className="pt-1" style={{ borderTop: "1px solid var(--brd)", color: "#F59E0B" }}>🏢 Работодатель ({preview.employerDays} дн):</div>
                    <div className="font-bold text-right pt-1" style={{ borderTop: "1px solid var(--brd)", color: "#F59E0B" }}>{preview.employerAmount.toLocaleString("ru-RU")} ₸</div>
                    <div style={{ color: "#06B6D4" }}>🏛 ГФСС ({preview.gfssDays} дн):</div>
                    <div className="font-bold text-right" style={{ color: "#06B6D4" }}>{preview.gfssAmount.toLocaleString("ru-RU")} ₸</div>
                    <div style={{ color: "#EF4444" }}>ИПН 10%:</div>
                    <div className="font-bold text-right" style={{ color: "#EF4444" }}>−{preview.ipnAmount.toLocaleString("ru-RU")} ₸</div>
                    <div className="font-bold pt-1" style={{ borderTop: "1px solid var(--brd)", color: "#10B981" }}>К ВЫПЛАТЕ:</div>
                    <div className="font-bold text-right pt-1" style={{ borderTop: "1px solid var(--brd)", color: "#10B981" }}>{preview.netAmount.toLocaleString("ru-RU")} ₸</div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowForm(false)} disabled={creating}
                className="flex-1 py-2.5 rounded-lg cursor-pointer font-semibold text-[12px]"
                style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                Отмена
              </button>
              <button onClick={createSickLeave} disabled={creating}
                className="flex-1 py-2.5 rounded-lg cursor-pointer font-bold text-[12px]"
                style={{
                  background: creating ? "var(--brd)" : "linear-gradient(135deg, #EF4444, #DC2626)",
                  color: "#fff", border: "none", opacity: creating ? 0.5 : 1,
                }}>
                {creating ? "Создаём..." : "✓ Оформить больничный"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
