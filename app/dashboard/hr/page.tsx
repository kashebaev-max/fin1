"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { calcSalary, fmtMoney, TAX, TAX_COMPUTED } from "@/lib/tax2026";
import type { Employee } from "@/lib/types";

export default function HRPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: "", iin: "", position: "", department: "", salary: "" });

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("employees").select("*").eq("user_id", user.id).eq("status", "active").order("full_name");
    setEmployees((data || []) as Employee[]);
  }

  async function addEmployee() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("employees").insert({
      user_id: user.id,
      full_name: form.full_name,
      iin: form.iin,
      position: form.position,
      department: form.department,
      salary: Number(form.salary),
    });
    if (!error) {
      setForm({ full_name: "", iin: "", position: "", department: "", salary: "" });
      setShowAdd(false);
      loadEmployees();
    }
  }

  async function deleteEmployee(id: string) {
    await supabase.from("employees").update({ status: "fired" }).eq("id", id);
    loadEmployees();
  }

  const totalGross = employees.reduce((a, e) => a + Number(e.salary), 0);
  const totalNet = employees.reduce((a, e) => a + calcSalary(Number(e.salary)).netSalary, 0);
  const totalEmployer = employees.reduce((a, e) => a + calcSalary(Number(e.salary)).employerTotal, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xs" style={{ color: "var(--t3)" }}>
            Штат: {employees.length} | ФОТ: {fmtMoney(totalGross)} ₸
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>
            НК РК 2026: ИПН 10% • ОПВ 10% • ВОСМС 2% • Вычет 30 МРП ({fmtMoney(TAX_COMPUTED.BASE_DEDUCTION)} ₸)
          </div>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer"
          style={{ background: "#06B6D4" }}>
          + Сотрудник
        </button>
      </div>

      {/* Add Employee Form */}
      {showAdd && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">Новый сотрудник</div>
          <div className="grid grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО</label>
              <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Ахметов Б.К." />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН</label>
              <input value={form.iin} onChange={e => setForm({ ...form, iin: e.target.value })} placeholder="800515300111" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Должность</label>
              <input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="Бухгалтер" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Отдел</label>
              <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Бухгалтерия" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Оклад (₸)</label>
              <input type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} placeholder="350000" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addEmployee} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* Payroll Table */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-sm font-bold mb-3">Расчётная ведомость — НК РК 2026</div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {["ФИО", "Должность", "Оклад", "ОПВ 10%", "ВОСМС 2%", "Выч. 30МРП", "ИПН 10%", "К выдаче", "ОПВР 3.5%", "СО 5%", "ООСМС 3%", "СН 6%", ""].map(h => (
                  <th key={h} className="text-left p-2 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Добавьте сотрудников</td></tr>
              ) : employees.map(e => {
                const c = calcSalary(Number(e.salary));
                return (
                  <tr key={e.id}>
                    <td className="p-2 text-xs font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{e.full_name}</td>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.position}</td>
                    <td className="p-2 text-xs text-right font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.gross)}</td>
                    <td className="p-2 text-xs text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.opv)}</td>
                    <td className="p-2 text-xs text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.vosms)}</td>
                    <td className="p-2 text-xs text-right" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.baseDeduction)}</td>
                    <td className="p-2 text-xs text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.ipn)}</td>
                    <td className="p-2 text-xs text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.netSalary)}</td>
                    <td className="p-2 text-xs text-right" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.opvr)}</td>
                    <td className="p-2 text-xs text-right" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.so)}</td>
                    <td className="p-2 text-xs text-right" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.oosms)}</td>
                    <td className="p-2 text-xs text-right" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.sn)}</td>
                    <td className="p-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteEmployee(e.id)} className="bg-transparent border-none cursor-pointer text-xs" style={{ color: "#EF4444" }}>Уволить</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {employees.length > 0 && (
          <div className="flex justify-end gap-5 pt-3 text-xs" style={{ color: "var(--t3)" }}>
            <span>ФОТ: <b style={{ color: "var(--t1)" }}>{fmtMoney(totalGross)} ₸</b></span>
            <span>К выдаче: <b style={{ color: "#10B981" }}>{fmtMoney(totalNet)} ₸</b></span>
            <span>Работодатель: <b style={{ color: "#8B5CF6" }}>{fmtMoney(totalEmployer)} ₸</b></span>
          </div>
        )}
      </div>
    </div>
  );
}
