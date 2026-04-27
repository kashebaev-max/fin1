"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

// Условные обозначения по форме Т-13
const TIME_CODES: Record<string, { name: string; color: string; bg: string; type: "work" | "absent" | "weekend" | "vacation" | "sick" | "other" }> = {
  "Я": { name: "Явка (рабочий день)", color: "#10B981", bg: "#10B98115", type: "work" },
  "Н": { name: "Ночной", color: "#6366F1", bg: "#6366F115", type: "work" },
  "С": { name: "Сверхурочный", color: "#F59E0B", bg: "#F59E0B15", type: "work" },
  "РВ": { name: "Работа в выходной", color: "#A855F7", bg: "#A855F715", type: "work" },
  "В": { name: "Выходной", color: "#6B7280", bg: "#6B728015", type: "weekend" },
  "ОТ": { name: "Отпуск ежегодный", color: "#3B82F6", bg: "#3B82F615", type: "vacation" },
  "ОЖ": { name: "Отпуск по уходу за ребёнком", color: "#EC4899", bg: "#EC489915", type: "vacation" },
  "ОБ": { name: "Отпуск без сохранения", color: "#8B5CF6", bg: "#8B5CF615", type: "vacation" },
  "Б": { name: "Больничный", color: "#EF4444", bg: "#EF444415", type: "sick" },
  "К": { name: "Командировка", color: "#14B8A6", bg: "#14B8A615", type: "work" },
  "ПР": { name: "Прогул", color: "#DC2626", bg: "#DC262615", type: "absent" },
  "У": { name: "Учебный отпуск", color: "#0EA5E9", bg: "#0EA5E915", type: "vacation" },
  "Г": { name: "Гос. обязанности", color: "#84CC16", bg: "#84CC1615", type: "other" },
};

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

// Праздники РК 2026
const KZ_HOLIDAYS_2026 = [
  "2026-01-01", "2026-01-02", // Новый год
  "2026-01-07", // Православное Рождество
  "2026-03-08", // Международный женский день
  "2026-03-21", "2026-03-22", "2026-03-23", // Наурыз
  "2026-05-01", // Праздник единства народа
  "2026-05-07", // День защитника Отечества
  "2026-05-09", // День Победы
  "2026-07-06", // День столицы
  "2026-08-30", // День Конституции
  "2026-10-25", // День Республики
  "2026-12-16", // День Независимости
];

export default function TimesheetPage() {
  const supabase = createClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [editingCell, setEditingCell] = useState<{ tsId: string; day: number } | null>(null);
  const [cellForm, setCellForm] = useState({ code: "Я", hours: 8 });

  useEffect(() => { load(); }, [year, month]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [t, e] = await Promise.all([
      supabase.from("timesheets").select("*").eq("user_id", user.id).eq("year", year).eq("month", month),
      supabase.from("employees").select("*").eq("user_id", user.id).order("full_name"),
    ]);
    setTimesheets(t.data || []);
    setEmployees(e.data || []);
  }

  // Дней в месяце
  function daysInMonth(y: number, m: number): number {
    return new Date(y, m, 0).getDate();
  }

  const totalDays = daysInMonth(year, month);

  // Является ли день выходным или праздником
  function isWeekendOrHoliday(day: number): boolean {
    const d = new Date(year, month - 1, day);
    const dayOfWeek = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    return dayOfWeek === 0 || dayOfWeek === 6 || KZ_HOLIDAYS_2026.includes(dateStr);
  }

  // Создать табель для всех сотрудников за месяц
  async function createForAllEmployees() {
    if (employees.length === 0) {
      setMsg("❌ Нет сотрудников. Добавьте их в модуле «Кадры»."); setTimeout(() => setMsg(""), 3000); return;
    }
    if (!confirm(`Создать табель за ${MONTHS[month - 1]} ${year} для всех ${employees.length} сотрудников?`)) return;

    const newSheets = [];
    for (const emp of employees) {
      const exists = timesheets.find(t => t.employee_id === emp.id);
      if (exists) continue;

      // Генерируем дни по умолчанию (рабочий день 8 часов или выходной)
      const days: Record<string, { code: string; hours: number }> = {};
      for (let d = 1; d <= totalDays; d++) {
        if (isWeekendOrHoliday(d)) {
          days[d.toString()] = { code: "В", hours: 0 };
        } else {
          days[d.toString()] = { code: "Я", hours: 8 };
        }
      }

      newSheets.push({
        user_id: userId,
        year,
        month,
        employee_id: emp.id,
        employee_name: emp.full_name,
        employee_iin: emp.iin || null,
        employee_position: emp.position || null,
        days,
        ...calculateTotals(days),
      });
    }

    if (newSheets.length > 0) {
      await supabase.from("timesheets").insert(newSheets);
      setMsg(`✅ Создано ${newSheets.length} табелей`);
    } else {
      setMsg("ℹ Все табели уже созданы");
    }
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  function calculateTotals(days: Record<string, { code: string; hours: number }>) {
    let worked_days = 0, worked_hours = 0, weekend_days = 0, vacation_days = 0, sick_days = 0, absent_days = 0, overtime_hours = 0;
    Object.values(days).forEach(d => {
      const c = TIME_CODES[d.code];
      if (!c) return;
      if (c.type === "work") {
        worked_days += 1;
        worked_hours += Number(d.hours);
        if (d.code === "С" || (Number(d.hours) > 8 && d.code === "Я")) overtime_hours += Number(d.hours) - 8;
      }
      if (c.type === "weekend") weekend_days += 1;
      if (c.type === "vacation") vacation_days += 1;
      if (c.type === "sick") sick_days += 1;
      if (c.type === "absent") absent_days += 1;
    });
    return { worked_days, worked_hours, weekend_days, vacation_days, sick_days, absent_days, overtime_hours };
  }

  function startEditCell(tsId: string, day: number) {
    const ts = timesheets.find(t => t.id === tsId);
    if (!ts) return;
    const dayData = (ts.days || {})[day.toString()] || { code: "Я", hours: 8 };
    setEditingCell({ tsId, day });
    setCellForm({ code: dayData.code, hours: dayData.hours });
  }

  async function saveCell() {
    if (!editingCell) return;
    const ts = timesheets.find(t => t.id === editingCell.tsId);
    if (!ts) return;
    const newDays = { ...(ts.days || {}) };
    newDays[editingCell.day.toString()] = { code: cellForm.code, hours: Number(cellForm.hours) };

    const totals = calculateTotals(newDays);

    await supabase.from("timesheets").update({ days: newDays, ...totals }).eq("id", editingCell.tsId);
    setEditingCell(null);
    load();
  }

  async function approveTimesheet(id: string) {
    const ts = timesheets.find(t => t.id === id);
    if (!ts) return;
    if (!confirm(`Утвердить табель сотрудника ${ts.employee_name}? После утверждения изменения будут заблокированы.`)) return;
    await supabase.from("timesheets").update({
      status: "approved",
      approved_date: new Date().toISOString().slice(0, 10),
    }).eq("id", id);
    setMsg("✅ Табель утверждён");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function reopenTimesheet(id: string) {
    if (!confirm("Снять утверждение и разрешить редактирование?")) return;
    await supabase.from("timesheets").update({ status: "draft", approved_date: null }).eq("id", id);
    load();
  }

  async function deleteTimesheet(id: string) {
    if (!confirm("Удалить табель?")) return;
    await supabase.from("timesheets").delete().eq("id", id);
    load();
  }

  // Заполнить весь табель одинаковыми днями (быстрая массовая операция)
  async function fillAllAsDefault(id: string) {
    const ts = timesheets.find(t => t.id === id);
    if (!ts || ts.status !== "draft") return;
    if (!confirm("Сбросить и заполнить как обычный месяц (Я=8ч в будни, В=0ч в выходные)?")) return;
    const days: Record<string, { code: string; hours: number }> = {};
    for (let d = 1; d <= totalDays; d++) {
      if (isWeekendOrHoliday(d)) days[d.toString()] = { code: "В", hours: 0 };
      else days[d.toString()] = { code: "Я", hours: 8 };
    }
    const totals = calculateTotals(days);
    await supabase.from("timesheets").update({ days, ...totals }).eq("id", id);
    load();
  }

  function exportCSV() {
    const days = Array.from({ length: totalDays }, (_, i) => (i + 1).toString());
    const rows: string[][] = [];
    rows.push(["Сотрудник", "Должность", "ИИН", ...days, "Отработано дней", "Отработано часов", "Выходных", "Отпуск", "Больничный", "Прогул"]);
    timesheets.forEach(t => {
      const row = [t.employee_name, t.employee_position || "", t.employee_iin || ""];
      for (let d = 1; d <= totalDays; d++) {
        const data = (t.days || {})[d.toString()];
        row.push(data ? `${data.code}/${data.hours}` : "");
      }
      row.push(String(t.worked_days), String(t.worked_hours), String(t.weekend_days), String(t.vacation_days), String(t.sick_days), String(t.absent_days));
      rows.push(row);
    });
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Табель_${MONTHS[month - 1]}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // KPI
  const totalEmployees = timesheets.length;
  const totalWorkedHours = timesheets.reduce((a, t) => a + Number(t.worked_hours || 0), 0);
  const totalWorkedDays = timesheets.reduce((a, t) => a + Number(t.worked_days || 0), 0);
  const onVacation = timesheets.filter(t => t.vacation_days > 0).length;
  const approved = timesheets.filter(t => t.status === "approved").length;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : msg.startsWith("ℹ") ? "#3B82F620" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : msg.startsWith("ℹ") ? "#3B82F6" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Табель учёта рабочего времени по форме Т-13. Учитывает выходные и праздники РК автоматически. Используется для расчёта зарплаты.
      </div>

      {/* Period and actions */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="grid grid-cols-5 gap-3 items-end">
          <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Месяц</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Год</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={createForAllEmployees} className="px-3 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
            + Создать на всех ({employees.length})
          </button>
          <button onClick={exportCSV} disabled={timesheets.length === 0} className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" style={{ background: "#10B98120", color: "#10B981", opacity: timesheets.length === 0 ? 0.5 : 1 }}>
            📊 CSV
          </button>
          <button onClick={() => window.print()} disabled={timesheets.length === 0} className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none" style={{ background: "#6366F120", color: "#6366F1", opacity: timesheets.length === 0 ? 0.5 : 1 }}>
            🖨 Печать
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>👥 Сотрудников</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{totalEmployees}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✓ Дней отработано</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{totalWorkedDays}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⏱ Часов отработано</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{totalWorkedHours.toFixed(0)}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #3B82F6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🏖 В отпуске</div>
          <div className="text-xl font-bold" style={{ color: "#3B82F6" }}>{onVacation}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✓ Утверждено</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{approved} / {totalEmployees}</div>
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t3)" }}>УСЛОВНЫЕ ОБОЗНАЧЕНИЯ</div>
        <div className="grid grid-cols-7 gap-2">
          {Object.entries(TIME_CODES).map(([code, info]) => (
            <div key={code} className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded" style={{ background: info.bg, color: info.color, minWidth: 30, textAlign: "center" }}>{code}</span>
              <span className="text-[10px]" style={{ color: "var(--t3)" }}>{info.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timesheet table */}
      {timesheets.length === 0 ? (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
          Нет табелей за {MONTHS[month - 1]} {year}. Нажмите «+ Создать на всех» чтобы заполнить.
        </div>
      ) : (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-1 text-center">ТАБЕЛЬ УЧЁТА РАБОЧЕГО ВРЕМЕНИ (форма Т-13)</div>
          <div className="text-xs text-center mb-4" style={{ color: "var(--t3)" }}>{MONTHS[month - 1]} {year}</div>

          <div style={{ overflow: "auto" }}>
            <table style={{ fontSize: 10, minWidth: "100%" }}>
              <thead>
                <tr>
                  <th rowSpan={2} className="text-left p-1.5 sticky left-0 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)", borderRight: "2px solid var(--brd)", background: "var(--card)", verticalAlign: "bottom", minWidth: 160, zIndex: 2 }}>
                    Сотрудник
                  </th>
                  <th colSpan={totalDays} className="text-center p-1 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                    Дни месяца
                  </th>
                  <th colSpan={4} className="text-center p-1 font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)", borderLeft: "2px solid var(--brd)" }}>
                    Итого
                  </th>
                  <th rowSpan={2} className="p-1.5" style={{ borderBottom: "2px solid var(--brd)", verticalAlign: "bottom", minWidth: 90 }}></th>
                </tr>
                <tr>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
                    const isWk = isWeekendOrHoliday(d);
                    return (
                      <th key={d} className="text-center font-bold" style={{
                        borderBottom: "2px solid var(--brd)",
                        background: isWk ? "#EF444415" : "transparent",
                        color: isWk ? "#EF4444" : "var(--t3)",
                        fontSize: 9,
                        padding: "4px 2px",
                        minWidth: 28,
                      }}>{d}</th>
                    );
                  })}
                  <th className="text-center font-bold p-1" style={{ borderBottom: "2px solid var(--brd)", borderLeft: "2px solid var(--brd)", color: "#10B981", fontSize: 9 }}>Раб. дн</th>
                  <th className="text-center font-bold p-1" style={{ borderBottom: "2px solid var(--brd)", color: "#F59E0B", fontSize: 9 }}>Часов</th>
                  <th className="text-center font-bold p-1" style={{ borderBottom: "2px solid var(--brd)", color: "#3B82F6", fontSize: 9 }}>Отп.</th>
                  <th className="text-center font-bold p-1" style={{ borderBottom: "2px solid var(--brd)", color: "#EF4444", fontSize: 9 }}>Бол.</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map(ts => {
                  const isApproved = ts.status === "approved";
                  return (
                    <tr key={ts.id}>
                      <td className="p-1.5 sticky left-0 font-semibold" style={{ background: "var(--card)", borderRight: "2px solid var(--brd)", borderBottom: "1px solid var(--brd)", zIndex: 1 }}>
                        <div className="text-[11px]">{ts.employee_name}</div>
                        <div className="text-[9px]" style={{ color: "var(--t3)" }}>{ts.employee_position || "—"}</div>
                        {isApproved && <div className="text-[9px] mt-0.5" style={{ color: "#10B981" }}>✓ Утверждён</div>}
                      </td>
                      {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
                        const data = (ts.days || {})[d.toString()];
                        const code = data?.code || "";
                        const info = TIME_CODES[code];
                        const isWk = isWeekendOrHoliday(d);
                        return (
                          <td key={d}
                            onClick={() => !isApproved && startEditCell(ts.id, d)}
                            className="text-center p-1 transition-all"
                            style={{
                              background: info?.bg || (isWk ? "#EF444408" : "transparent"),
                              borderBottom: "1px solid var(--brd)",
                              borderRight: "1px solid var(--brd)",
                              cursor: isApproved ? "default" : "pointer",
                              fontSize: 9,
                            }}>
                            <div className="font-bold" style={{ color: info?.color || "var(--t3)" }}>{code || "·"}</div>
                            {data?.hours > 0 && <div className="text-[8px]" style={{ color: "var(--t3)" }}>{data.hours}</div>}
                          </td>
                        );
                      })}
                      <td className="text-center p-1 font-bold" style={{ borderBottom: "1px solid var(--brd)", borderLeft: "2px solid var(--brd)", color: "#10B981" }}>{ts.worked_days}</td>
                      <td className="text-center p-1 font-bold" style={{ borderBottom: "1px solid var(--brd)", color: "#F59E0B" }}>{ts.worked_hours}</td>
                      <td className="text-center p-1 font-bold" style={{ borderBottom: "1px solid var(--brd)", color: "#3B82F6" }}>{ts.vacation_days}</td>
                      <td className="text-center p-1 font-bold" style={{ borderBottom: "1px solid var(--brd)", color: "#EF4444" }}>{ts.sick_days}</td>
                      <td className="text-center p-1" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {!isApproved ? (
                          <>
                            <button onClick={() => fillAllAsDefault(ts.id)} title="Заполнить по умолчанию" className="text-[10px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>↻</button>
                            <button onClick={() => approveTimesheet(ts.id)} title="Утвердить" className="text-[10px] cursor-pointer border-none bg-transparent ml-1" style={{ color: "#10B981" }}>✓</button>
                            <button onClick={() => deleteTimesheet(ts.id)} className="text-[10px] cursor-pointer border-none bg-transparent ml-1" style={{ color: "#EF4444" }}>×</button>
                          </>
                        ) : (
                          <button onClick={() => reopenTimesheet(ts.id)} title="Снять утверждение" className="text-[10px] cursor-pointer border-none bg-transparent" style={{ color: "#F59E0B" }}>↶</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cell edit modal */}
      {editingCell && (() => {
        const ts = timesheets.find(t => t.id === editingCell.tsId);
        return (
          <div onClick={() => setEditingCell(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={e => e.stopPropagation()} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", maxWidth: 500, width: "100%" }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-base font-bold">Редактирование дня</div>
                  <div className="text-xs" style={{ color: "var(--t3)" }}>{ts?.employee_name} • {editingCell.day} {MONTHS[month - 1]} {year}</div>
                </div>
                <button onClick={() => setEditingCell(null)} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>✕</button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label>
                  <select value={cellForm.code} onChange={e => {
                    const newCode = e.target.value;
                    const info = TIME_CODES[newCode];
                    setCellForm({ code: newCode, hours: info?.type === "work" ? 8 : 0 });
                  }}>
                    {Object.entries(TIME_CODES).map(([code, info]) => (
                      <option key={code} value={code}>{code} — {info.name}</option>
                    ))}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Часы</label>
                  <input type="number" min="0" max="24" step="0.5" value={cellForm.hours} onChange={e => setCellForm({ ...cellForm, hours: Number(e.target.value) })} />
                </div>
              </div>

              <div className="rounded-lg p-2 mb-3" style={{ background: TIME_CODES[cellForm.code]?.bg }}>
                <div className="text-xs font-bold" style={{ color: TIME_CODES[cellForm.code]?.color }}>
                  {cellForm.code} — {TIME_CODES[cellForm.code]?.name}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveCell} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => setEditingCell(null)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 Кликните на любой день в таблице, чтобы изменить код или количество часов.<br/>
        💡 Выходные и государственные праздники РК выделены красным автоматически.<br/>
        💡 После утверждения табель блокируется (✓). Снять утверждение можно кнопкой ↶.<br/>
        💡 Эти данные используются для расчёта зарплаты в модуле «Кадры и ЗП».
      </div>
    </div>
  );
}
