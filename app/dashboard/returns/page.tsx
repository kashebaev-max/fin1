"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "from_customer" | "to_supplier";

interface ReturnItem {
  nomenclature_id: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  nds_rate: number;
  sum: number;
  nds_sum: number;
  total: number;
}

const REASONS = ["Брак", "Не подошёл размер/комплектация", "Истёк срок годности", "Излишки поставки", "Несоответствие документам", "Прочее"];

export default function ReturnsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("from_customer");
  const [returns, setReturns] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [nomenclature, setNomenclature] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const emptyForm = {
    return_number: "",
    return_date: new Date().toISOString().slice(0, 10),
    counterparty_id: "",
    counterparty_name: "",
    counterparty_bin: "",
    original_doc_id: "",
    original_doc_number: "",
    reason: "Брак",
    refund_method: "cash",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ReturnItem[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [r, c, d, n] = await Promise.all([
      supabase.from("returns").select("*").eq("user_id", user.id).order("return_date", { ascending: false }),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
      supabase.from("documents").select("*").eq("user_id", user.id),
      supabase.from("nomenclature").select("*").eq("user_id", user.id),
    ]);
    setReturns(r.data || []);
    setCounterparties(c.data || []);
    setDocs(d.data || []);
    setNomenclature(n.data || []);
  }

  function startCreate() {
    const prefix = tab === "from_customer" ? "ВП" : "ВПС";
    const num = `${prefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setForm({ ...emptyForm, return_number: num });
    setItems([]);
    setShowForm(true);
  }

  function selectCp(id: string) {
    const cp = counterparties.find(x => x.id === id);
    if (cp) setForm({ ...form, counterparty_id: id, counterparty_name: cp.name, counterparty_bin: cp.bin || "" });
    else setForm({ ...form, counterparty_id: "" });
  }

  function selectOriginalDoc(docId: string) {
    if (!docId) { setForm({ ...form, original_doc_id: "", original_doc_number: "" }); return; }
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;
    setForm({ ...form, original_doc_id: docId, original_doc_number: doc.doc_number });
    // Импортируем позиции из документа
    if (doc.items && Array.isArray(doc.items)) {
      const newItems: ReturnItem[] = doc.items.map((it: any) => ({
        nomenclature_id: it.nomenclature_id || "",
        name: it.name,
        unit: it.unit || "шт",
        quantity: Number(it.quantity || 0),
        price: Number(it.price || 0),
        nds_rate: Number(it.nds_rate || 16),
        sum: Number(it.sum || 0),
        nds_sum: Number(it.nds_sum || 0),
        total: Number(it.total || 0),
      }));
      setItems(newItems);
    }
  }

  function addItem() {
    setItems([...items, { nomenclature_id: "", name: "", unit: "шт", quantity: 1, price: 0, nds_rate: 16, sum: 0, nds_sum: 0, total: 0 }]);
  }

  function selectItem(i: number, nomId: string) {
    const n = nomenclature.find(x => x.id === nomId);
    if (!n) return;
    const it = [...items];
    const price = tab === "from_customer" ? Number(n.retail_price || n.base_price || 0) : Number(n.purchase_price || 0);
    const ndsRate = Number(n.vat_rate || 16);
    const total = 1 * price;
    const ndsSum = Math.round(total * ndsRate / (100 + ndsRate));
    it[i] = { nomenclature_id: nomId, name: n.name, unit: n.unit, quantity: 1, price, nds_rate: ndsRate, sum: total - ndsSum, nds_sum: ndsSum, total };
    setItems(it);
  }

  function updItem(i: number, field: string, value: any) {
    const it = [...items];
    it[i] = { ...it[i], [field]: value };
    if (["quantity", "price", "nds_rate"].includes(field)) {
      const total = Number(it[i].quantity) * Number(it[i].price);
      const ndsSum = Math.round(total * Number(it[i].nds_rate) / (100 + Number(it[i].nds_rate)));
      it[i].total = total;
      it[i].nds_sum = ndsSum;
      it[i].sum = total - ndsSum;
    }
    setItems(it);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  const totals = items.reduce((acc, it) => ({
    sum: acc.sum + Number(it.sum),
    nds: acc.nds + Number(it.nds_sum),
    total: acc.total + Number(it.total),
  }), { sum: 0, nds: 0, total: 0 });

  async function processReturn() {
    if (!form.counterparty_name) { setMsg("❌ Укажите контрагента"); setTimeout(() => setMsg(""), 3000); return; }
    if (items.length === 0) { setMsg("❌ Добавьте позиции"); setTimeout(() => setMsg(""), 3000); return; }

    await supabase.from("returns").insert({
      user_id: userId,
      return_number: form.return_number,
      return_date: form.return_date,
      return_type: tab,
      counterparty_id: form.counterparty_id || null,
      counterparty_name: form.counterparty_name,
      counterparty_bin: form.counterparty_bin || null,
      original_doc_id: form.original_doc_id || null,
      original_doc_number: form.original_doc_number || null,
      reason: form.reason,
      items,
      total_amount: totals.sum,
      nds_amount: totals.nds,
      total_with_nds: totals.total,
      refund_method: form.refund_method,
      notes: form.notes,
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    // Возврат от покупателя:
    // 1. Товар обратно на склад: +quantity
    // 2. Возврат денег: Дт 6010 Кт 1010 (или 1030)
    if (tab === "from_customer") {
      for (const it of items) {
        if (it.nomenclature_id) {
          const n = nomenclature.find(x => x.id === it.nomenclature_id);
          if (n) {
            await supabase.from("nomenclature").update({ quantity: Number(n.quantity) + it.quantity }).eq("id", it.nomenclature_id);
          }
        }
      }
      // Сторно реализации
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: form.return_date,
        doc_ref: form.return_number,
        debit_account: "6010",
        credit_account: form.refund_method === "bank" ? "1030" : "1010",
        amount: totals.total,
        description: `Возврат от покупателя ${form.counterparty_name}: ${form.reason}`,
      });
    }

    // Возврат поставщику:
    // 1. Товар со склада: -quantity
    // 2. Уменьшение задолженности: Дт 1010/1030 Кт 1330
    if (tab === "to_supplier") {
      for (const it of items) {
        if (it.nomenclature_id) {
          const n = nomenclature.find(x => x.id === it.nomenclature_id);
          if (n) {
            await supabase.from("nomenclature").update({ quantity: Math.max(0, Number(n.quantity) - it.quantity) }).eq("id", it.nomenclature_id);
          }
        }
      }
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: form.return_date,
        doc_ref: form.return_number,
        debit_account: form.refund_method === "bank" ? "1030" : "1010",
        credit_account: "1330",
        amount: totals.total,
        description: `Возврат поставщику ${form.counterparty_name}: ${form.reason}`,
      });
    }

    setMsg(`✅ Возврат ${form.return_number} проведён. ${tab === "from_customer" ? "Товар оприходован" : "Товар списан"}, сумма ${fmtMoney(totals.total)} ₸`);
    setShowForm(false);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  async function deleteReturn(id: string) {
    if (!confirm("Удалить запись о возврате? Корректировки остатков и проводки НЕ будут отменены.")) return;
    await supabase.from("returns").delete().eq("id", id);
    load();
  }

  // Filter returns by tab
  const tabReturns = returns.filter(r => r.return_type === tab);

  // KPI
  const totalCount = tabReturns.length;
  const totalAmount = tabReturns.reduce((a, r) => a + Number(r.total_with_nds || 0), 0);
  const monthCount = tabReturns.filter(r => r.return_date >= new Date().toISOString().slice(0, 7) + "-01").length;

  // Filter docs by counterparty for original_doc selector
  const filteredDocs = docs.filter(d => {
    if (!form.counterparty_id) return false;
    if (d.counterparty_id !== form.counterparty_id) return false;
    if (tab === "from_customer") return ["invoice", "sf", "act", "waybill"].includes(d.doc_type);
    return ["receipt", "purchase"].includes(d.doc_type);
  });

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Возвраты — товар от покупателя (приход на склад + сторно реализации) или товар поставщику (списание со склада + уменьшение задолженности)
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        <button onClick={() => { setTab("from_customer"); setShowForm(false); }}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "from_customer" ? "#F59E0B" : "transparent", color: tab === "from_customer" ? "#fff" : "var(--t3)", border: tab === "from_customer" ? "none" : "1px solid var(--brd)" }}>
          ↩ Возврат от покупателя ({returns.filter(r => r.return_type === "from_customer").length})
        </button>
        <button onClick={() => { setTab("to_supplier"); setShowForm(false); }}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "to_supplier" ? "#3B82F6" : "transparent", color: tab === "to_supplier" ? "#fff" : "var(--t3)", border: tab === "to_supplier" ? "none" : "1px solid var(--brd)" }}>
          ↪ Возврат поставщику ({returns.filter(r => r.return_type === "to_supplier").length})
        </button>
        <button onClick={startCreate} className="ml-auto px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новый возврат</button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Всего возвратов</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{totalCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За месяц: {monthCount}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Сумма</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{fmtMoney(totalAmount)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Средний возврат</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(totalCount > 0 ? totalAmount / totalCount : 0)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>На один возврат</div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">{tab === "from_customer" ? "Возврат от покупателя" : "Возврат поставщику"}</div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ возврата</label><input value={form.return_number} onChange={e => setForm({ ...form, return_number: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={form.return_date} onChange={e => setForm({ ...form, return_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Причина</label>
              <select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>{tab === "from_customer" ? "Покупатель *" : "Поставщик *"}</label>
              <select value={form.counterparty_id} onChange={e => selectCp(e.target.value)}>
                <option value="">— Выбрать —</option>
                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name} {c.bin ? `(${c.bin})` : ""}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Способ возврата денег</label>
              <select value={form.refund_method} onChange={e => setForm({ ...form, refund_method: e.target.value })}>
                <option value="cash">💵 Наличные (касса)</option>
                <option value="bank">🏦 На счёт</option>
              </select>
            </div>
            {form.counterparty_id && (
              <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Документ-основание (импорт позиций)</label>
                <select value={form.original_doc_id} onChange={e => selectOriginalDoc(e.target.value)}>
                  <option value="">— Без основания —</option>
                  {filteredDocs.map(d => <option key={d.id} value={d.id}>{d.doc_number} от {d.doc_date} • {fmtMoney(Number(d.total_with_nds))} ₸</option>)}
                </select>
              </div>
            )}
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📦 ПОЗИЦИИ К ВОЗВРАТУ</div>
          <div className="rounded-lg p-2 mb-3" style={{ background: "var(--bg)" }}>
            {items.length === 0 && <div className="text-xs py-3 text-center" style={{ color: "var(--t3)" }}>Добавьте позиции вручную или выберите документ-основание</div>}
            {items.map((it, i) => (
              <div key={i} className="rounded-lg p-2 mb-1.5" style={{ background: "var(--card)" }}>
                <div className="grid items-end gap-2" style={{ gridTemplateColumns: "1fr 80px 50px 110px 80px 110px 30px" }}>
                  <select value={it.nomenclature_id} onChange={e => selectItem(i, e.target.value)} style={{ fontSize: 11 }}>
                    <option value="">— Выбрать —</option>
                    {nomenclature.map(n => <option key={n.id} value={n.id}>{n.name} ({n.unit})</option>)}
                  </select>
                  <input type="number" step="0.001" value={it.quantity} onChange={e => updItem(i, "quantity", Number(e.target.value))} style={{ fontSize: 11 }} />
                  <span className="text-[10px] text-center pb-2" style={{ color: "var(--t3)" }}>{it.unit}</span>
                  <input type="number" step="0.01" value={it.price} onChange={e => updItem(i, "price", Number(e.target.value))} style={{ fontSize: 11 }} />
                  <select value={it.nds_rate} onChange={e => updItem(i, "nds_rate", Number(e.target.value))} style={{ fontSize: 11 }}>
                    <option value="16">16%</option>
                    <option value="10">10%</option>
                    <option value="5">5%</option>
                    <option value="0">0%</option>
                  </select>
                  <div className="text-right text-xs pb-1.5 font-bold" style={{ color: "#EF4444" }}>{fmtMoney(it.total)} ₸</div>
                  <button onClick={() => removeItem(i)} className="text-sm cursor-pointer border-none bg-transparent pb-2" style={{ color: "#EF4444" }}>×</button>
                </div>
              </div>
            ))}
            <button onClick={addItem} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить позицию</button>
          </div>

          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-3 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Сумма без НДС</div><div className="text-sm font-bold">{fmtMoney(totals.sum)} ₸</div></div>
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>НДС</div><div className="text-sm font-bold" style={{ color: "#EC4899" }}>{fmtMoney(totals.nds)} ₸</div></div>
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Итого с НДС</div><div className="text-base font-bold" style={{ color: "#EF4444" }}>{fmtMoney(totals.total)} ₸</div></div>
            </div>
          )}

          <div className="text-[10px] mb-3 p-3 rounded-lg" style={{ background: "#F59E0B10", color: "var(--t2)", border: "1px solid #F59E0B30" }}>
            ℹ️ <b>Что произойдёт:</b><br />
            {tab === "from_customer"
              ? `1. Товары вернутся на склад (+${items.reduce((a, it) => a + it.quantity, 0)} ед.)\n2. Будет создана сторно-проводка: Дт 6010 Кт ${form.refund_method === "bank" ? "1030" : "1010"} на ${fmtMoney(totals.total)} ₸`
              : `1. Товары спишутся со склада (−${items.reduce((a, it) => a + it.quantity, 0)} ед.)\n2. Будет создана проводка возврата: Дт ${form.refund_method === "bank" ? "1030" : "1010"} Кт 1330 на ${fmtMoney(totals.total)} ₸`}
          </div>

          <div className="flex gap-2">
            <button onClick={processReturn} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>✓ Провести возврат</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* List */}
      {!showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["№", "Дата", "Контрагент", "Основание", "Причина", "Сумма", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {tabReturns.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет возвратов</td></tr>
              ) : tabReturns.map(r => (
                <tr key={r.id}>
                  <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{r.return_number}</td>
                  <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.return_date}</td>
                  <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{r.counterparty_name}</td>
                  <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.original_doc_number || "—"}</td>
                  <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{r.reason || "—"}</td>
                  <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(r.total_with_nds))} ₸</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <button onClick={() => deleteReturn(r.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
