"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  TIMESHEET_CODES,
  MONTHS_RU,
  generateTimesheetDays,
  calculateTimesheetTotals,
  KZ_HOLIDAYS_2026,
} from "@/lib/hr";

export default function TimesheetPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  
  const [employees, setEmployees] = useState<any[]>([]);
  const [timesheets, setTimesheets] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ empId: string; day: number } | null>(null);
  const [codePopupValue, setCodePopupValue] = useState("");
  const [hoursPopupValue, setHoursPopupValue] = useState(8);

  useEffect(() => { load(); }, [year, month]);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth"); return; }

    // Загружаем сотрудников
    const { data: emps } = await supabase
      .from("employees")
      .select("*")
      .eq("user_id", user.id)
      .order("full_name");

    setEmployees(emps || []);

    // Загружаем существующие табели
    const { data: tss } = await supabase
      .from("timesheets")
      .select("*")
      .eq("user_id", user.id)
      .eq("year", year)
      .eq("month", month);

    const tsMap: Record<string, any> = {};
    (tss || []).forEach(ts => { tsMap[ts.employee_id] = ts; });
    setTimesheets(tsMap);

    setLoading(false);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArr = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function getDayInfo(empId: string, day: number) {
    const ts = timesheets[empId];
    if (!ts || !ts.days || !ts.days[day.toString()]) {
      // Если табеля нет — показываем «пусто»
      return null;
    }
    return ts.days[day.toString()];
  }

  function isWeekend(day: number) {
    const date = new Date(year, month - 1, day);
    return date.getDay() === 0 || date.getDay() === 6;
  }

  function isHoliday(day: number) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return KZ_HOLIDAYS_2026.indexOf(dateStr) !== -1;
  }

  async function autoFillEmployee(empId: string) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const days = generateTimesheetDays(year, month, emp.work_schedule || "5x2", 8);
    const totals = calculateTimesheetTotals(days);

    const existing = timesheets[empId];
    
    if (existing) {
      await supabase.from("timesheets").update({
        days, ...totals, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("timesheets").insert({
        user_id: user.id,
        employee_id: empId,
        year, month,
        days, ...totals,
        status: "draft",
      });
    }

    await load();
    setSaving(false);
  }

  async function autoFillAll() {
    if (!confirm(`Заполнить табели для всех ${employees.length} сотрудников по умолчанию (5/2, 8 часов)?`)) return;
    setSaving(true);
    for (const emp of employees) {
      await autoFillEmployeeInternal(emp.id);
    }
    await load();
    setSaving(false);
  }

  async function autoFillEmployeeInternal(empId: string) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const days = generateTimesheetDays(year, month, emp.work_schedule || "5x2", 8);
    const totals = calculateTimesheetTotals(days);

    const existing = timesheets[empId];
    if (existing) {
      await supabase.from("timesheets").update({
        days, ...totals, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("timesheets").insert({
        user_id: user.id, employee_id: empId, year, month,
        days, ...totals, status: "draft",
      });
    }
  }

  async function updateCell(empId: string, day: number, code: string, hours: number) {
    const ts = timesheets[empId];
    if (!ts) {
      // Создаём новый табель с автозаполнением и потом меняем 1 ячейку
      const emp = employees.find(e => e.id === empId);
      if (!emp) return;
      const days = generateTimesheetDays(year, month, emp.work_schedule || "5x2", 8);
      days[day.toString()] = { code, hours };
      const totals = calculateTimesheetTotals(days);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      await supabase.from("timesheets").insert({
        user_id: user.id, employee_id: empId, year, month,
        days, ...totals, status: "draft",
      });
    } else {
      const newDays = { ...ts.days, [day.toString()]: { code, hours } };
      const totals = calculateTimesheetTotals(newDays);
      
      await supabase.from("timesheets").update({
        days: newDays, ...totals, updated_at: new Date().toISOString(),
      }).eq("id", ts.id);
    }
    
    await load();
    setSelectedCell(null);
  }

  function openCellEditor(empId: string, day: number) {
    const info = getDayInfo(empId, day);
    setCodePopupValue(info?.code || "Я");
    setHoursPopupValue(info?.hours || 8);
    setSelectedCell({ empId, day });
  }

  if (loading) {
    return <div className="p-8 text-center" style={{ color: "var(--t3)" }}>Загрузка...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">⏰ Табель учёта рабочего времени</h1>
          <p className="text-[12px]" style={{ color: "var(--t3)" }}>
            {MONTHS_RU[month - 1]} {year} · {employees.length} сотрудников
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 rounded-lg text-[12px]"
            style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
            {MONTHS_RU.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-lg text-[12px]"
            style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t1)" }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <button onClick={autoFillAll} disabled={saving || employees.length === 0}
            className="px-3 py-2 rounded-lg text-[12px] font-bold cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #A855F7, #6366F1)",
              color: "#fff", border: "none",
              opacity: saving || employees.length === 0 ? 0.5 : 1,
            }}>
            ⚡ Автозаполнить все
          </button>
        </div>
      </div>

      {/* Легенда */}
      <div className="flex gap-2 flex-wrap rounded-xl p-3"
        style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-[10px] font-bold mr-1" style={{ color: "var(--t3)" }}>КОДЫ:</div>
        {Object.entries(TIMESHEET_CODES).map(([code, info]) => (
          <div key={code} className="flex items-center gap-1 text-[10px]">
            <span style={{
              fontWeight: 700, padding: "2px 6px", borderRadius: 3,
              background: info.color + "20", color: info.color,
            }}>{code}</span>
            <span style={{ color: "var(--t2)" }}>{info.name}</span>
          </div>
        ))}
      </div>

      {employees.length === 0 ? (
        <div className="rounded-xl p-12 text-center"
          style={{ background: "var(--card)", border: "1px dashed var(--brd)" }}>
          <div style={{ fontSize: 48 }}>👥</div>
          <div className="text-lg font-bold mt-3">Нет сотрудников</div>
          <div className="text-[12px] mt-2 mb-4" style={{ color: "var(--t3)" }}>
            Добавьте сотрудников чтобы вести табель
          </div>
          <button onClick={() => router.push("/dashboard/employees")}
            className="cursor-pointer rounded-lg font-bold"
            style={{
              padding: "10px 20px",
              background: "linear-gradient(135deg, #A855F7, #6366F1)",
              color: "#fff", border: "none", fontSize: 13,
            }}>
            👥 Перейти к сотрудникам
          </button>
        </div>
      ) : (
        <div className="rounded-xl overflow-auto"
          style={{ background: "var(--card)", border: "1px solid var(--brd)", maxHeight: "70vh" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--card)", zIndex: 10 }}>
                <th style={{
                  padding: "8px", textAlign: "left", minWidth: 200,
                  borderBottom: "1px solid var(--brd)",
                  position: "sticky", left: 0, background: "var(--card)", zIndex: 11,
                }}>
                  Сотрудник
                </th>
                {daysArr.map(day => (
                  <th key={day} style={{
                    padding: "4px 2px", textAlign: "center", minWidth: 30,
                    borderBottom: "1px solid var(--brd)",
                    background: isHoliday(day) ? "#F59E0B20" : isWeekend(day) ? "#6B728020" : "var(--card)",
                    color: isHoliday(day) ? "#F59E0B" : isWeekend(day) ? "var(--t3)" : "var(--t2)",
                  }}>{day}</th>
                ))}
                <th style={{
                  padding: "8px", textAlign: "center", minWidth: 50,
                  borderBottom: "1px solid var(--brd)", background: "var(--bg)",
                  color: "#10B981", fontWeight: 700,
                }}>Дней</th>
                <th style={{
                  padding: "8px", textAlign: "center", minWidth: 50,
                  borderBottom: "1px solid var(--brd)", background: "var(--bg)",
                  color: "#10B981", fontWeight: 700,
                }}>Часы</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const ts = timesheets[emp.id];
                return (
                  <tr key={emp.id}>
                    <td style={{
                      padding: "8px", borderBottom: "1px solid var(--brd)",
                      position: "sticky", left: 0, background: "var(--card)", zIndex: 5,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{emp.full_name}</div>
                      <div style={{ fontSize: 9, color: "var(--t3)" }}>{emp.position || "—"}</div>
                      {!ts && (
                        <button onClick={() => autoFillEmployee(emp.id)} disabled={saving}
                          className="mt-1 text-[9px] cursor-pointer"
                          style={{
                            padding: "2px 6px", borderRadius: 4,
                            background: "#A855F715", color: "#A855F7", border: "none",
                          }}>
                          ⚡ Заполнить
                        </button>
                      )}
                    </td>
                    {daysArr.map(day => {
                      const info = getDayInfo(emp.id, day);
                      const codeInfo = info ? TIMESHEET_CODES[info.code] : null;
                      return (
                        <td key={day}
                          onClick={() => ts && openCellEditor(emp.id, day)}
                          style={{
                            padding: "4px 2px", textAlign: "center",
                            borderBottom: "1px solid var(--brd)",
                            cursor: ts ? "pointer" : "default",
                            background: codeInfo ? codeInfo.color + "15" : (isHoliday(day) ? "#F59E0B10" : isWeekend(day) ? "#6B728010" : "transparent"),
                          }}>
                          {info ? (
                            <div style={{
                              fontSize: 10, fontWeight: 700,
                              color: codeInfo?.color,
                            }}>{info.code}</div>
                          ) : (
                            <div style={{ fontSize: 9, color: "var(--t3)" }}>—</div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{
                      padding: "8px", textAlign: "center", fontWeight: 700,
                      borderBottom: "1px solid var(--brd)", background: "var(--bg)",
                      color: "#10B981",
                    }}>{ts?.worked_days || 0}</td>
                    <td style={{
                      padding: "8px", textAlign: "center", fontWeight: 700,
                      borderBottom: "1px solid var(--brd)", background: "var(--bg)",
                      color: "#10B981",
                    }}>{ts?.worked_hours || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Модалка редактирования ячейки */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setSelectedCell(null)}>
          <div onClick={e => e.stopPropagation()}
            className="rounded-xl p-5 max-w-sm w-full"
            style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-base font-bold mb-3">
              {employees.find(e => e.id === selectedCell.empId)?.full_name} — {selectedCell.day} {MONTHS_RU[month - 1]}
            </div>

            <div className="grid grid-cols-4 gap-2 mb-3">
              {Object.entries(TIMESHEET_CODES).map(([code, info]) => (
                <button key={code} onClick={() => setCodePopupValue(code)}
                  className="cursor-pointer rounded-lg py-2 text-[11px] font-bold"
                  style={{
                    background: codePopupValue === code ? info.color : info.color + "20",
                    color: codePopupValue === code ? "#fff" : info.color,
                    border: codePopupValue === code ? `2px solid ${info.color}` : "1px solid " + info.color + "40",
                  }}>
                  {code}
                </button>
              ))}
            </div>

            <div className="mb-3">
              <div className="text-[11px] mb-1" style={{ color: "var(--t3)" }}>Часы</div>
              <input type="number" value={hoursPopupValue}
                onChange={e => setHoursPopupValue(Number(e.target.value))}
                min={0} max={24} step={0.5}
                className="w-full px-3 py-2 rounded-lg text-[13px]"
                style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t1)" }}/>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setSelectedCell(null)}
                className="flex-1 py-2 rounded-lg cursor-pointer text-[12px] font-semibold"
                style={{ background: "var(--bg)", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                Отмена
              </button>
              <button onClick={() => updateCell(selectedCell.empId, selectedCell.day, codePopupValue, hoursPopupValue)}
                className="flex-1 py-2 rounded-lg cursor-pointer text-[12px] font-bold"
                style={{
                  background: "linear-gradient(135deg, #10B981, #059669)",
                  color: "#fff", border: "none",
                }}>
                ✓ Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
