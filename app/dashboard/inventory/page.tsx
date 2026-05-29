"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

interface InvItem {
  nomenclature_id: string;
  name: string;
  unit: string;
  expected_qty: number;
  actual_qty: number;
  diff_qty: number;
  price: number;
  diff_amount: number;
}

export default function InventoryPage() {
  const supabase = createClient();
  const [acts, setActs] = useState<any[]>([]);
  const [nomenclature, setNomenclature] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [form, setForm] = useState({
    act_number: "",
    act_date: new Date().toISOString().slice(0, 10),
    warehouse_name: "Основной склад",
    responsible_name: "",
    notes: "",
  });
  const [items, setItems] = useState<InvItem[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [a, n] = await Promise.all([
      supabase.from("inventory_acts").select("*").eq("user_id", user.id).order("act_date", { ascending: false }),
      supabase.from("nomenclature").select("*").eq("user_id", user.id).order("name"),
    ]);
    setActs(a.data || []);
    setNomenclature(n.data || []);
  }

  function startCreate() {
    const num = `ИНВ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setForm({ act_number: num, act_date: new Date().toISOString().slice(0, 10), warehouse_name: "Основной склад", responsible_name: "", notes: "" });
    // Загружаем все позиции из номенклатуры
    setItems(nomenclature.filter(n => ["goods", "material", "finished_product"].includes(n.item_type)).map(n => ({
      nomenclature_id: n.id,
      name: n.name,
      unit: n.unit,
      expected_qty: Number(n.quantity || 0),
      actual_qty: Number(n.quantity || 0),
      diff_qty: 0,
      price: Number(n.purchase_price || 0),
      diff_amount: 0,
    })));
    setShowForm(true);
  }

  function updItemActual(i: number, qty: number) {
    const n = [...items];
    n[i].actual_qty = qty;
    n[i].diff_qty = qty - n[i].expected_qty;
    n[i].diff_amount = n[i].diff_qty * n[i].price;
    setItems(n);
  }

  const totals = items.reduce((acc, it) => ({
    surplus_qty: acc.surplus_qty + (it.diff_qty > 0 ? it.diff_qty : 0),
    shortage_qty: acc.shortage_qty + (it.diff_qty < 0 ? Math.abs(it.diff_qty) : 0),
    surplus_amt: acc.surplus_amt + (it.diff_amount > 0 ? it.diff_amount : 0),
    shortage_amt: acc.shortage_amt + (it.diff_amount < 0 ? Math.abs(it.diff_amount) : 0),
  }), { surplus_qty: 0, shortage_qty: 0, surplus_amt: 0, shortage_amt: 0 });

  async function completeInventory() {
    if (items.length === 0) { setMsg("❌ Нет позиций для инвентаризации"); setTimeout(() => setMsg(""), 3000); return; }
    if (!confirm(`Завершить инвентаризацию?\n\nИзлишки: ${totals.surplus_qty} ед. (${fmtMoney(totals.surplus_amt)} ₸)\nНедостачи: ${totals.shortage_qty} ед. (${fmtMoney(totals.shortage_amt)} ₸)\n\nОстатки в номенклатуре будут изменены, проводки созданы автоматически.`)) return;

    const { data: act } = await supabase.from("inventory_acts").insert({
      user_id: userId,
      act_number: form.act_number,
      act_date: form.act_date,
      warehouse_name: form.warehouse_name,
      responsible_name: form.responsible_name,
      status: "completed",
      items: items.filter(it => it.diff_qty !== 0),
      total_surplus_qty: totals.surplus_qty,
      total_shortage_qty: totals.shortage_qty,
      total_surplus_amount: totals.surplus_amt,
      total_shortage_amount: totals.shortage_amt,
      notes: form.notes,
      completed_at: new Date().toISOString(),
    }).select().single();

    // Корректировка остатков
    for (const it of items) {
      if (it.diff_qty !== 0) {
        await supabase.from("nomenclature").update({ quantity: it.actual_qty }).eq("id", it.nomenclature_id);
      }
    }

    // Проводка по излишкам: Дт 1330 Кт 6280 (прочие доходы)
    if (totals.surplus_amt > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: form.act_date,
        doc_ref: form.act_number,
        debit_account: "1330",
        credit_account: "6280",
        amount: totals.surplus_amt,
        description: `Излишки по инвентаризации ${form.act_number}: ${totals.surplus_qty} ед.`,
      });
    }

    // Проводка по недостачам: Дт 7990 (прочие расходы) Кт 1330
    if (totals.shortage_amt > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: form.act_date,
        doc_ref: form.act_number,
        debit_account: "7990",
        credit_account: "1330",
        amount: totals.shortage_amt,
        description: `Недостача по инвентаризации ${form.act_number}: ${totals.shortage_qty} ед.`,
      });
    }

    setMsg(`✅ Инвентаризация ${form.act_number} проведена`);
    setShowForm(false);
    setItems([]);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function deleteAct(id: string) {
    if (!confirm("Удалить акт инвентаризации? Корректировки остатков НЕ будут отменены.")) return;
    await supabase.from("inventory_acts").delete().eq("id", id);
    if (viewing?.id === id) setViewing(null);
    load();
  }

  // KPI
  const total = acts.length;
  const monthCount = acts.filter(a => a.act_date >= new Date().toISOString().slice(0, 7) + "-01").length;
  const totalSurplus = acts.reduce((a, x) => a + Number(x.total_surplus_amount || 0), 0);
  const totalShortage = acts.reduce((a, x) => a + Number(x.total_shortage_amount || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Инвентаризация — пересчёт фактических остатков на складе. Проводки: Дт 1330 Кт 6280 (излишки), Дт 7990 Кт 1330 (недостачи).
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Всего инвентаризаций</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{total}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За месяц: {monthCount}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 Излишки</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalSurplus)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📉 Недостачи</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{fmtMoney(totalShortage)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${totalSurplus - totalShortage >= 0 ? "#A855F7" : "#EF4444"}` }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💎 Сальдо</div>
          <div className="text-xl font-bold" style={{ color: totalSurplus - totalShortage >= 0 ? "#A855F7" : "#EF4444" }}>{totalSurplus - totalShortage >= 0 ? "+" : ""}{fmtMoney(totalSurplus - totalShortage)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Излишки − недостачи</div>
        </div>
      </div>

      <div className="flex justify-between">
        <div className="text-xs" style={{ color: "var(--t3)" }}>Список актов инвентаризации</div>
        <button onClick={startCreate} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Провести инвентаризацию</button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">Новая инвентаризация</div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ акта</label><input value={form.act_number} onChange={e => setForm({ ...form, act_number: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={form.act_date} onChange={e => setForm({ ...form, act_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Склад</label><input value={form.warehouse_name} onChange={e => setForm({ ...form, warehouse_name: e.target.value })} /></div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ответственный (МОЛ)</label><input value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} placeholder="ФИО кладовщика" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#F59E0B" }}>📊 ВЕДОМОСТЬ ПЕРЕСЧЁТА ({items.length} позиций)</div>
          <div className="text-[10px] mb-2" style={{ color: "var(--t3)" }}>Введите фактическое количество для каждой позиции. Расхождения подсветятся автоматически.</div>

          <div style={{ maxHeight: 500, overflowY: "auto" }} className="rounded-lg" >
            <table>
              <thead style={{ position: "sticky", top: 0, background: "var(--card)", zIndex: 1 }}>
                <tr>{["Наименование", "Учёт", "Факт", "Разница", "Цена", "Сумма откл."].map(h => (
                  <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const diffPos = it.diff_qty > 0;
                  const diffNeg = it.diff_qty < 0;
                  return (
                    <tr key={i} style={{ background: diffPos ? "#10B98110" : diffNeg ? "#EF444410" : "transparent" }}>
                      <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{it.name} <span style={{ color: "var(--t3)" }}>({it.unit})</span></td>
                      <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{it.expected_qty}</td>
                      <td className="p-2" style={{ borderBottom: "1px solid var(--brd)", width: 100 }}>
                        <input type="number" step="0.001" value={it.actual_qty} onChange={e => updItemActual(i, Number(e.target.value))} style={{ fontSize: 11, padding: "2px 4px" }} />
                      </td>
                      <td className="p-2 text-[12px] font-bold" style={{ color: diffPos ? "#10B981" : diffNeg ? "#EF4444" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                        {it.diff_qty > 0 ? "+" : ""}{it.diff_qty.toFixed(3)}
                      </td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(it.price)}</td>
                      <td className="p-2 text-[12px] font-bold text-right" style={{ color: diffPos ? "#10B981" : diffNeg ? "#EF4444" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                        {it.diff_amount > 0 ? "+" : ""}{fmtMoney(it.diff_amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-4 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
            <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Излишки (кол.)</div><div className="text-base font-bold" style={{ color: "#10B981" }}>+{totals.surplus_qty}</div></div>
            <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Излишки (₸)</div><div className="text-base font-bold" style={{ color: "#10B981" }}>+{fmtMoney(totals.surplus_amt)} ₸</div></div>
            <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Недостачи (кол.)</div><div className="text-base font-bold" style={{ color: "#EF4444" }}>−{totals.shortage_qty}</div></div>
            <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Недостачи (₸)</div><div className="text-base font-bold" style={{ color: "#EF4444" }}>−{fmtMoney(totals.shortage_amt)} ₸</div></div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={completeInventory} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>✓ Провести инвентаризацию</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* List */}
      {!showForm && !viewing && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["№ акта", "Дата", "Склад", "Ответственный", "Излишки", "Недостачи", "Статус", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {acts.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет инвентаризаций</td></tr>
              ) : acts.map(a => (
                <tr key={a.id}>
                  <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{a.act_number}</td>
                  <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{a.act_date}</td>
                  <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.warehouse_name || "—"}</td>
                  <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.responsible_name || "—"}</td>
                  <td className="p-2.5 text-[12px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>+{fmtMoney(Number(a.total_surplus_amount || 0))} ₸</td>
                  <td className="p-2.5 text-[12px] font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>−{fmtMoney(Number(a.total_shortage_amount || 0))} ₸</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>Завершён</span>
                  </td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <button onClick={() => setViewing(a)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>👁</button>
                    <button onClick={() => deleteAct(a.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View */}
      {viewing && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-base font-bold">Акт инвентаризации {viewing.act_number}</div>
              <div className="text-xs" style={{ color: "var(--t3)" }}>{viewing.act_date} • {viewing.warehouse_name} • {viewing.responsible_name}</div>
            </div>
            <button onClick={() => setViewing(null)} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Закрыть</button>
          </div>

          <div className="rounded-lg" style={{ background: "var(--bg)" }}>
            <table>
              <thead><tr>{["Наименование", "Учёт", "Факт", "Разница", "Сумма откл."].map(h => (
                <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {(viewing.items || []).map((it: any, i: number) => (
                  <tr key={i} style={{ background: it.diff_qty > 0 ? "#10B98110" : it.diff_qty < 0 ? "#EF444410" : "transparent" }}>
                    <td className="p-2 text-[12px]">{it.name}</td>
                    <td className="p-2 text-[12px]">{it.expected_qty}</td>
                    <td className="p-2 text-[12px]">{it.actual_qty}</td>
                    <td className="p-2 text-[12px] font-bold" style={{ color: it.diff_qty > 0 ? "#10B981" : "#EF4444" }}>{it.diff_qty > 0 ? "+" : ""}{it.diff_qty}</td>
                    <td className="p-2 text-[12px] text-right font-bold" style={{ color: it.diff_amount > 0 ? "#10B981" : "#EF4444" }}>{it.diff_amount > 0 ? "+" : ""}{fmtMoney(it.diff_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
