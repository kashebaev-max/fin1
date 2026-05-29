"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { calcSalary, fmtMoney, TAX, TAX_COMPUTED } from "@/lib/tax2026";
import type { Employee } from "@/lib/types";

type Tab = "employees" | "payroll" | "orders" | "timesheet" | "leave";

export default function HRPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tab, setTab] = useState<Tab>("employees");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: "", iin: "", position: "", department: "", salary: "", hire_date: new Date().toISOString().slice(0, 10) });
  const [orderForm, setOrderForm] = useState({ type: "hire", employee_id: "", date: new Date().toISOString().slice(0, 10), new_position: "", new_department: "", new_salary: "", reason: "" });
  const [timesheetMonth, setTimesheetMonth] = useState(new Date().toISOString().slice(0, 7));
  const [timesheetData, setTimesheetData] = useState<Record<string, number>>({});
  const [leaveForm, setLeaveForm] = useState({ employee_id: "", type: "vacation" as "vacation" | "sick", date_from: "", date_to: "", days: 0 });
  const [orders, setOrders] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [previewDoc, setPreviewDoc] = useState<any>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase.from("employees").select("*").eq("user_id", user.id).order("full_name");
    const emps = (data || []) as Employee[];
    setEmployees(emps);
    const td: Record<string, number> = {};
    emps.filter(e => e.status === "active").forEach(e => { td[e.id] = 22; });
    setTimesheetData(td);
  }

  async function addEmployee() {
    await supabase.from("employees").insert({ user_id: userId, ...form, salary: Number(form.salary) });
    setForm({ full_name: "", iin: "", position: "", department: "", salary: "", hire_date: new Date().toISOString().slice(0, 10) });
    setShowAdd(false);
    setMsg("✅ Сотрудник добавлен"); load();
    setTimeout(() => setMsg(""), 3000);
  }

  // ═══ КАДРОВЫЕ ПРИКАЗЫ ═══
  async function processOrder() {
    const emp = employees.find(e => e.id === orderForm.employee_id);
    if (!emp) return;
    const orderNum = `ПР-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    if (orderForm.type === "hire") {
      await supabase.from("employees").update({ status: "active", hire_date: orderForm.date }).eq("id", emp.id);
    } else if (orderForm.type === "fire") {
      await supabase.from("employees").update({ status: "fired" }).eq("id", emp.id);
    } else if (orderForm.type === "transfer") {
      const updates: any = {};
      if (orderForm.new_position) updates.position = orderForm.new_position;
      if (orderForm.new_department) updates.department = orderForm.new_department;
      if (orderForm.new_salary) updates.salary = Number(orderForm.new_salary);
      await supabase.from("employees").update(updates).eq("id", emp.id);
    }

    await supabase.from("documents").insert({
      user_id: userId, doc_type: "order", doc_number: orderNum,
      doc_date: orderForm.date, counterparty_name: emp.full_name,
      total_sum: 0, nds_sum: 0, nds_rate: 0, total_with_nds: 0, status: "done",
      items: [], extra_data: { order_type: orderForm.type, reason: orderForm.reason, employee: emp.full_name, position: orderForm.new_position || emp.position, department: orderForm.new_department || emp.department },
    });

    const typeNames: Record<string, string> = { hire: "приёме на работу", fire: "увольнении", transfer: "переводе" };
    setMsg(`✅ Приказ ${orderNum} о ${typeNames[orderForm.type]} — ${emp.full_name}`);
    setOrderForm({ type: "hire", employee_id: "", date: new Date().toISOString().slice(0, 10), new_position: "", new_department: "", new_salary: "", reason: "" });
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  // ═══ ТАБЕЛЬ ═══
  function getTimesheetSalary(empId: string, days: number): number {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return 0;
    return Math.round((Number(emp.salary) / 22) * days);
  }

  // ═══ ОТПУСКА / БОЛЬНИЧНЫЕ ═══
  function calcLeaveDays(): number {
    if (!leaveForm.date_from || !leaveForm.date_to) return 0;
    const from = new Date(leaveForm.date_from);
    const to = new Date(leaveForm.date_to);
    return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1);
  }

  function calcVacationPay(): { avgDaily: number; total: number; days: number } {
    const emp = employees.find(e => e.id === leaveForm.employee_id);
    if (!emp) return { avgDaily: 0, total: 0, days: 0 };
    const days = calcLeaveDays();
    // Средний дневной заработок = оклад * 12 / 365 (упрощённо)
    const avgDaily = Math.round((Number(emp.salary) * 12) / 365);
    return { avgDaily, total: avgDaily * days, days };
  }

  function calcSickPay(): { avgDaily: number; total: number; days: number } {
    const emp = employees.find(e => e.id === leaveForm.employee_id);
    if (!emp) return { avgDaily: 0, total: 0, days: 0 };
    const days = calcLeaveDays();
    // Больничный = средний дневной × дни × коэффициент стажа (упрощённо 100%)
    const avgDaily = Math.round((Number(emp.salary) * 12) / 365);
    const maxDaily = 15 * TAX.MRP; // макс. дневной = 15 МРП
    const daily = Math.min(avgDaily, maxDaily);
    return { avgDaily: daily, total: daily * days, days };
  }

  async function processLeave() {
    const emp = employees.find(e => e.id === leaveForm.employee_id);
    if (!emp) return;
    const isVac = leaveForm.type === "vacation";
    const calc = isVac ? calcVacationPay() : calcSickPay();
    const docNum = `${isVac ? "OTP" : "BL"}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    await supabase.from("documents").insert({
      user_id: userId, doc_type: isVac ? "vacation" : "sick_leave", doc_number: docNum,
      doc_date: new Date().toISOString().slice(0, 10), counterparty_name: emp.full_name,
      total_sum: calc.total, nds_sum: 0, nds_rate: 0, total_with_nds: calc.total, status: "done",
      items: [{ name: isVac ? "Отпускные" : "Больничный лист", unit: "дн.", quantity: calc.days, price: calc.avgDaily, sum: calc.total }],
      extra_data: { leave_type: leaveForm.type, date_from: leaveForm.date_from, date_to: leaveForm.date_to, days: calc.days, avg_daily: calc.avgDaily },
    });

    const salaryCalc = calcSalary(calc.total);
    await supabase.from("journal_entries").insert({
      user_id: userId, entry_date: new Date().toISOString().slice(0, 10),
      doc_ref: docNum, debit_account: "7110", credit_account: "3350",
      amount: calc.total, description: `${isVac ? "Отпускные" : "Больничный"} — ${emp.full_name} (${calc.days} дн.)`,
    });

    setMsg(`✅ ${isVac ? "Отпускные" : "Больничный"} ${docNum}: ${emp.full_name} — ${fmtMoney(calc.total)} ₸ за ${calc.days} дн.`);
    setLeaveForm({ employee_id: "", type: "vacation", date_from: "", date_to: "", days: 0 });
    setTimeout(() => setMsg(""), 5000);
  }

  const activeEmps = employees.filter(e => e.status === "active");
  const totalGross = activeEmps.reduce((a, e) => a + Number(e.salary), 0);
  const totalNet = activeEmps.reduce((a, e) => a + calcSalary(Number(e.salary)).netSalary, 0);
  const totalEmployer = activeEmps.reduce((a, e) => a + calcSalary(Number(e.salary)).employerTotal, 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: "employees", label: "👥 Сотрудники" },
    { key: "payroll", label: "💳 Расчёт ЗП" },
    { key: "orders", label: "📋 Приказы" },
    { key: "timesheet", label: "📅 Табель" },
    { key: "leave", label: "🏖 Отпуска / Больничные" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: "#10B98120", color: "#10B981" }}>{msg}</div>}

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === t.key ? "var(--accent)" : "transparent", color: tab === t.key ? "#fff" : "var(--t3)", border: tab === t.key ? "none" : "1px solid var(--brd)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ СОТРУДНИКИ ═══ */}
      {tab === "employees" && (
        <>
          <div className="flex justify-between items-center">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Активных: {activeEmps.length} | Всего: {employees.length} | ФОТ: {fmtMoney(totalGross)} ₸</div>
            <button onClick={() => setShowAdd(!showAdd)} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#06B6D4" }}>+ Сотрудник</button>
          </div>
          {showAdd && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО</label><input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Ахметов Болат Канатович" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН</label><input value={form.iin} onChange={e => setForm({ ...form, iin: e.target.value })} placeholder="800515300111" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата приёма</label><input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Должность</label><input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="Бухгалтер" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Отдел</label><input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Бухгалтерия" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Оклад (₸)</label><input type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} placeholder="350000" /></div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={addEmployee} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["ФИО", "ИИН", "Должность", "Отдел", "Оклад", "Дата приёма", "Статус"].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
              <tbody>{employees.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Добавьте сотрудников</td></tr> : employees.map(e => (
                <tr key={e.id}><td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{e.full_name}</td><td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.iin}</td><td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{e.position}</td><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.department}</td><td className="p-2.5 text-[13px] font-semibold text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(e.salary))} ₸</td><td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.hire_date}</td><td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}><span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: e.status === "active" ? "#10B98120" : "#EF444420", color: e.status === "active" ? "#10B981" : "#EF4444" }}>{e.status === "active" ? "Работает" : "Уволен"}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ РАСЧЁТ ЗП ═══ */}
      {tab === "payroll" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-1">Расчётная ведомость — НК РК 2026</div>
          <div className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>ИПН 10% • ОПВ 10% • ВОСМС 2% • Вычет 30 МРП ({fmtMoney(TAX_COMPUTED.BASE_DEDUCTION)} ₸) • ОПВР 3.5% • СО 5% • ООСМС 3% • СН 6%</div>
          <div className="overflow-x-auto">
            <table>
              <thead><tr>{["ФИО", "Оклад", "ОПВ 10%", "ВОСМС 2%", "Выч.30МРП", "ИПН 10%", "К выдаче", "ОПВР 3.5%", "СО 5%", "ООСМС 3%", "СН 6%"].map(h => <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
              <tbody>{activeEmps.map(e => { const c = calcSalary(Number(e.salary)); return (
                <tr key={e.id}><td className="p-2 text-xs font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{e.full_name}</td><td className="p-2 text-xs text-right font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.gross)}</td><td className="p-2 text-xs text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.opv)}</td><td className="p-2 text-xs text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.vosms)}</td><td className="p-2 text-xs text-right" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.baseDeduction)}</td><td className="p-2 text-xs text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.ipn)}</td><td className="p-2 text-xs text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.netSalary)}</td><td className="p-2 text-xs text-right" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.opvr)}</td><td className="p-2 text-xs text-right" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.so)}</td><td className="p-2 text-xs text-right" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.oosms)}</td><td className="p-2 text-xs text-right" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(c.sn)}</td></tr>
              ); })}</tbody>
            </table>
          </div>
          <div className="flex justify-end gap-5 pt-3 text-xs" style={{ color: "var(--t3)" }}>
            <span>ФОТ: <b style={{ color: "var(--t1)" }}>{fmtMoney(totalGross)} ₸</b></span>
            <span>К выдаче: <b style={{ color: "#10B981" }}>{fmtMoney(totalNet)} ₸</b></span>
            <span>Работодатель: <b style={{ color: "#8B5CF6" }}>{fmtMoney(totalEmployer)} ₸</b></span>
          </div>
        </div>
      )}

      {/* ═══ ПРИКАЗЫ ═══ */}
      {tab === "orders" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Кадровый приказ</div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип приказа</label>
              <select value={orderForm.type} onChange={e => setOrderForm({ ...orderForm, type: e.target.value })}>
                <option value="hire">Приём на работу</option><option value="fire">Увольнение</option><option value="transfer">Перевод / Изменение оклада</option>
              </select></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сотрудник</label>
              <select value={orderForm.employee_id} onChange={e => setOrderForm({ ...orderForm, employee_id: e.target.value })}>
                <option value="">— Выберите —</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name} — {e.position}</option>)}
              </select></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата приказа</label><input type="date" value={orderForm.date} onChange={e => setOrderForm({ ...orderForm, date: e.target.value })} /></div>
          </div>
          {orderForm.type === "transfer" && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Новая должность</label><input value={orderForm.new_position} onChange={e => setOrderForm({ ...orderForm, new_position: e.target.value })} placeholder="Оставьте пустым если без изменений" /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Новый отдел</label><input value={orderForm.new_department} onChange={e => setOrderForm({ ...orderForm, new_department: e.target.value })} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Новый оклад</label><input type="number" value={orderForm.new_salary} onChange={e => setOrderForm({ ...orderForm, new_salary: e.target.value })} /></div>
            </div>
          )}
          {orderForm.type === "fire" && (
            <div className="mb-4"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Основание увольнения</label><input value={orderForm.reason} onChange={e => setOrderForm({ ...orderForm, reason: e.target.value })} placeholder="По собственному желанию / По соглашению сторон" /></div>
          )}
          <button onClick={processOrder} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>✓ Оформить приказ</button>
        </div>
      )}

      {/* ═══ ТАБЕЛЬ ═══ */}
      {tab === "timesheet" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold">Табель учёта рабочего времени</div>
            <input type="month" value={timesheetMonth} onChange={e => setTimesheetMonth(e.target.value)} style={{ width: 180 }} />
          </div>
          <table>
            <thead><tr>{["ФИО", "Должность", "Отработано дней", "Оклад", "Начислено"].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
            <tbody>{activeEmps.map(e => (
              <tr key={e.id}><td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{e.full_name}</td><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.position}</td><td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}><input type="number" value={timesheetData[e.id] || 22} onChange={ev => setTimesheetData({ ...timesheetData, [e.id]: Number(ev.target.value) })} style={{ width: 60 }} min={0} max={31} /></td><td className="p-2.5 text-[13px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(e.salary))} ₸</td><td className="p-2.5 text-[13px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(getTimesheetSalary(e.id, timesheetData[e.id] || 22))} ₸</td></tr>
            ))}</tbody>
          </table>
          <div className="flex justify-end pt-3 text-xs" style={{ color: "var(--t3)" }}>
            Итого начислено: <b style={{ color: "var(--t1)", marginLeft: 6 }}>{fmtMoney(activeEmps.reduce((a, e) => a + getTimesheetSalary(e.id, timesheetData[e.id] || 22), 0))} ₸</b>
          </div>
        </div>
      )}

      {/* ═══ ОТПУСКА / БОЛЬНИЧНЫЕ ═══ */}
      {tab === "leave" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Расчёт отпускных / больничных</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
              <select value={leaveForm.type} onChange={e => setLeaveForm({ ...leaveForm, type: e.target.value as any })}>
                <option value="vacation">🏖 Ежегодный трудовой отпуск</option><option value="sick">🏥 Больничный лист</option>
              </select></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сотрудник</label>
              <select value={leaveForm.employee_id} onChange={e => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}>
                <option value="">— Выберите —</option>{activeEmps.map(e => <option key={e.id} value={e.id}>{e.full_name} (оклад: {fmtMoney(Number(e.salary))} ₸)</option>)}
              </select></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата начала</label><input type="date" value={leaveForm.date_from} onChange={e => setLeaveForm({ ...leaveForm, date_from: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата окончания</label><input type="date" value={leaveForm.date_to} onChange={e => setLeaveForm({ ...leaveForm, date_to: e.target.value })} /></div>
          </div>

          {leaveForm.employee_id && leaveForm.date_from && leaveForm.date_to && (() => {
            const calc = leaveForm.type === "vacation" ? calcVacationPay() : calcSickPay();
            const salaryC = calcSalary(calc.total);
            return (
              <div className="p-4 rounded-lg mb-4" style={{ background: "var(--bg)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3" style={{ color: leaveForm.type === "vacation" ? "#10B981" : "#6366F1" }}>
                  {leaveForm.type === "vacation" ? "🏖 Расчёт отпускных" : "🏥 Расчёт больничного"}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: "var(--t2)" }}>
                  <div>Количество дней: <b style={{ color: "var(--t1)" }}>{calc.days}</b></div>
                  <div>Средний дневной заработок: <b style={{ color: "var(--t1)" }}>{fmtMoney(calc.avgDaily)} ₸</b></div>
                  <div>Начислено: <b style={{ color: "var(--t1)" }}>{fmtMoney(calc.total)} ₸</b></div>
                  <div>ИПН (10%): <b style={{ color: "#EF4444" }}>{fmtMoney(salaryC.ipn)} ₸</b></div>
                  <div>ОПВ (10%): <b style={{ color: "#EF4444" }}>{fmtMoney(salaryC.opv)} ₸</b></div>
                  <div>ВОСМС (2%): <b style={{ color: "#EF4444" }}>{fmtMoney(salaryC.vosms)} ₸</b></div>
                  <div className="col-span-2" style={{ borderTop: "1px solid var(--brd)", paddingTop: 8, marginTop: 4 }}>
                    <span className="text-sm font-bold" style={{ color: "#10B981" }}>К выдаче: {fmtMoney(salaryC.netSalary)} ₸</span>
                  </div>
                </div>
              </div>
            );
          })()}

          <button onClick={processLeave} disabled={!leaveForm.employee_id || !leaveForm.date_from || !leaveForm.date_to}
            className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-50"
            style={{ background: leaveForm.type === "vacation" ? "#10B981" : "#6366F1" }}>
            ✓ Начислить {leaveForm.type === "vacation" ? "отпускные" : "больничный"}
          </button>
          <p className="text-[10px] mt-2" style={{ color: "var(--t3)" }}>
            {leaveForm.type === "vacation"
              ? "Расчёт: среднедневной заработок = оклад × 12 / 365 (ст. 104 ТК РК). Минимум отпуска — 24 календарных дня."
              : `Расчёт: среднедневной заработок, макс. ${fmtMoney(15 * TAX.MRP)} ₸/день (15 МРП, ст. 133 ТК РК).`}
          </p>
        </div>
      )}
    </div>
  );
}
