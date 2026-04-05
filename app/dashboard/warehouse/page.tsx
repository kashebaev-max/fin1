"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TAX, fmtMoney } from "@/lib/tax2026";
import type { Product } from "@/lib/types";

type Tab = "stock" | "receipt" | "returns" | "inventory";

export default function WarehousePage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<Tab>("stock");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "шт", price: "", quantity: "", min_quantity: "", category: "goods" });
  const [receiptItems, setReceiptItems] = useState([{ product_id: "", name: "", unit: "шт", qty: 0, price: 0 }]);
  const [receiptCP, setReceiptCP] = useState("");
  const [receiptDoc, setReceiptDoc] = useState("");
  const [returnItems, setReturnItems] = useState([{ product_id: "", name: "", unit: "шт", qty: 0, price: 0 }]);
  const [returnCP, setReturnCP] = useState("");
  const [returnType, setReturnType] = useState<"from_buyer" | "to_supplier">("from_buyer");
  const [inventoryData, setInventoryData] = useState<{ id: string; name: string; unit: string; system_qty: number; actual_qty: number; diff: number }[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase.from("products").select("*").eq("user_id", user.id).order("name");
    const prods = (data || []) as Product[];
    setProducts(prods);
    setInventoryData(prods.map(p => ({ id: p.id, name: p.name, unit: p.unit, system_qty: Number(p.quantity), actual_qty: Number(p.quantity), diff: 0 })));
  }

  async function addProduct() {
    await supabase.from("products").insert({
      user_id: userId, name: form.name, unit: form.unit,
      price: Number(form.price), quantity: Number(form.quantity),
      min_quantity: Number(form.min_quantity), category: form.category,
    });
    setForm({ name: "", unit: "шт", price: "", quantity: "", min_quantity: "", category: "goods" });
    setShowAdd(false); load();
  }

  async function deleteProduct(id: string) {
    await supabase.from("products").delete().eq("id", id);
    load();
  }

  // ═══ ПОСТУПЛЕНИЕ ТОВАРОВ (приход на склад) ═══
  async function processReceipt() {
    for (const item of receiptItems) {
      if (!item.name || item.qty <= 0) continue;
      const { data: existing } = await supabase.from("products").select("*").eq("user_id", userId).eq("name", item.name).limit(1);
      if (existing && existing.length > 0) {
        const newQty = Number(existing[0].quantity) + item.qty;
        const newPrice = item.price > 0 ? item.price : Number(existing[0].price);
        await supabase.from("products").update({ quantity: newQty, price: newPrice }).eq("id", existing[0].id);
      } else {
        await supabase.from("products").insert({ user_id: userId, name: item.name, unit: item.unit, price: item.price, quantity: item.qty, min_quantity: 0, category: "goods" });
      }
    }
    const totalSum = receiptItems.reduce((a, it) => a + it.qty * it.price, 0);
    const nds = Math.round(totalSum * TAX.NDS);
    const docNum = `RCV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    await supabase.from("documents").insert({
      user_id: userId, doc_type: "receipt", doc_number: docNum,
      doc_date: new Date().toISOString().slice(0, 10),
      counterparty_name: receiptCP, total_sum: totalSum, nds_sum: nds,
      nds_rate: TAX.NDS, total_with_nds: totalSum + nds, status: "done",
      items: receiptItems.filter(it => it.qty > 0).map(it => ({ name: it.name, unit: it.unit, quantity: it.qty, price: it.price, sum: it.qty * it.price })),
    });
    await supabase.from("journal_entries").insert({
      user_id: userId, entry_date: new Date().toISOString().slice(0, 10),
      doc_ref: docNum, debit_account: "1310", credit_account: "3310",
      amount: totalSum, description: `Поступление ТМЗ от ${receiptCP}`,
    });
    if (nds > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId, entry_date: new Date().toISOString().slice(0, 10),
        doc_ref: docNum, debit_account: "1420", credit_account: "3310",
        amount: nds, description: `НДС 16% к зачёту — ${receiptCP}`,
      });
    }
    setMsg(`✅ Поступление ${docNum} проведено. Склад обновлён.`);
    setReceiptItems([{ product_id: "", name: "", unit: "шт", qty: 0, price: 0 }]);
    setReceiptCP(""); setReceiptDoc("");
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  // ═══ ВОЗВРАТ ТОВАРОВ ═══
  async function processReturn() {
    for (const item of returnItems) {
      if (!item.name || item.qty <= 0) continue;
      const { data: existing } = await supabase.from("products").select("*").eq("user_id", userId).eq("name", item.name).limit(1);
      if (existing && existing.length > 0) {
        const delta = returnType === "from_buyer" ? item.qty : -item.qty;
        const newQty = Math.max(0, Number(existing[0].quantity) + delta);
        await supabase.from("products").update({ quantity: newQty }).eq("id", existing[0].id);
      }
    }
    const totalSum = returnItems.reduce((a, it) => a + it.qty * it.price, 0);
    const docNum = `RET-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    await supabase.from("documents").insert({
      user_id: userId, doc_type: "return", doc_number: docNum,
      doc_date: new Date().toISOString().slice(0, 10),
      counterparty_name: returnCP, total_sum: totalSum,
      nds_sum: Math.round(totalSum * TAX.NDS), nds_rate: TAX.NDS,
      total_with_nds: totalSum + Math.round(totalSum * TAX.NDS), status: "done",
      items: returnItems.filter(it => it.qty > 0).map(it => ({ name: it.name, unit: it.unit, quantity: it.qty, price: it.price, sum: it.qty * it.price })),
      extra_data: { return_type: returnType },
    });
    const debit = returnType === "from_buyer" ? "1310" : "3310";
    const credit = returnType === "from_buyer" ? "6010" : "1310";
    await supabase.from("journal_entries").insert({
      user_id: userId, entry_date: new Date().toISOString().slice(0, 10),
      doc_ref: docNum, debit_account: debit, credit_account: credit,
      amount: totalSum, description: `${returnType === "from_buyer" ? "Возврат от покупателя" : "Возврат поставщику"} — ${returnCP}`,
    });
    setMsg(`✅ Возврат ${docNum} проведён. Склад обновлён.`);
    setReturnItems([{ product_id: "", name: "", unit: "шт", qty: 0, price: 0 }]);
    setReturnCP(""); load();
    setTimeout(() => setMsg(""), 4000);
  }

  // ═══ ИНВЕНТАРИЗАЦИЯ ═══
  async function processInventory() {
    let adjustments = 0;
    for (const row of inventoryData) {
      if (row.actual_qty !== row.system_qty) {
        await supabase.from("products").update({ quantity: row.actual_qty }).eq("id", row.id);
        const diff = row.actual_qty - row.system_qty;
        const debit = diff > 0 ? "1310" : "7210";
        const credit = diff > 0 ? "6280" : "1310";
        await supabase.from("journal_entries").insert({
          user_id: userId, entry_date: new Date().toISOString().slice(0, 10),
          doc_ref: `INV-${new Date().getFullYear()}`, debit_account: debit, credit_account: credit,
          amount: Math.abs(diff), description: `Инвентаризация: ${row.name} ${diff > 0 ? "излишек" : "недостача"} ${Math.abs(diff)} ${row.unit}`,
        });
        adjustments++;
      }
    }
    setMsg(`✅ Инвентаризация проведена. Корректировок: ${adjustments}`);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  function addReceiptRow() { setReceiptItems([...receiptItems, { product_id: "", name: "", unit: "шт", qty: 0, price: 0 }]); }
  function updReceiptRow(i: number, f: string, v: any) { const n = [...receiptItems]; n[i] = { ...n[i], [f]: v }; setReceiptItems(n); }
  function selectReceiptProduct(i: number, pid: string) {
    const p = products.find(x => x.id === pid);
    if (p) { const n = [...receiptItems]; n[i] = { product_id: pid, name: p.name, unit: p.unit, qty: 1, price: Number(p.price) }; setReceiptItems(n); }
  }

  function addReturnRow() { setReturnItems([...returnItems, { product_id: "", name: "", unit: "шт", qty: 0, price: 0 }]); }
  function updReturnRow(i: number, f: string, v: any) { const n = [...returnItems]; n[i] = { ...n[i], [f]: v }; setReturnItems(n); }
  function selectReturnProduct(i: number, pid: string) {
    const p = products.find(x => x.id === pid);
    if (p) { const n = [...returnItems]; n[i] = { product_id: pid, name: p.name, unit: p.unit, qty: 1, price: Number(p.price) }; setReturnItems(n); }
  }

  const totalValue = products.reduce((a, p) => a + Number(p.price) * Number(p.quantity), 0);
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "stock", label: "Остатки", icon: "📦" },
    { key: "receipt", label: "Поступление", icon: "↓" },
    { key: "returns", label: "Возвраты", icon: "↺" },
    { key: "inventory", label: "Инвентаризация", icon: "📋" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: "#10B98120", color: "#10B981" }}>{msg}</div>}

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all"
            style={{ background: tab === t.key ? "var(--accent)" : "transparent", color: tab === t.key ? "#fff" : "var(--t3)", border: tab === t.key ? "none" : "1px solid var(--brd)" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: ОСТАТКИ ═══ */}
      {tab === "stock" && (
        <>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs" style={{ color: "var(--t3)" }}>Стоимость (без НДС): {fmtMoney(totalValue)} ₸ | С НДС 16%: {fmtMoney(Math.round(totalValue * 1.16))} ₸</div>
            </div>
            <button onClick={() => setShowAdd(!showAdd)} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Товар/Услуга</button>
          </div>
          {showAdd && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Цемент М500" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ед. изм.</label><select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>{["шт", "кг", "тонна", "м", "м²", "м³", "мешок", "л", "рейс", "усл."].map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Цена (₸)</label><input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Кол-во</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Мин. остаток</label><input type="number" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: e.target.value })} /></div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={addProduct} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Наименование", "Остаток", "Ед.", "Мин.", "Цена", "Стоимость", "Статус", ""].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
              <tbody>{products.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Добавьте товары</td></tr> : products.map(p => {
                const low = Number(p.quantity) < Number(p.min_quantity) && Number(p.min_quantity) > 0;
                return (<tr key={p.id}><td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{p.name}</td><td className="p-2.5 text-[13px] font-bold" style={{ color: low ? "#EF4444" : "var(--t1)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.quantity))}</td><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.unit}</td><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.min_quantity))}</td><td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.price))} ₸</td><td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.price) * Number(p.quantity))} ₸</td><td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}><span className="text-[11px] font-semibold px-2.5 py-1 rounded-md" style={{ background: low ? "#EF444420" : "#10B98120", color: low ? "#EF4444" : "#10B981" }}>{low ? "⚠ Мало" : "✓ Норма"}</span></td><td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}><button onClick={() => deleteProduct(p.id)} className="bg-transparent border-none cursor-pointer text-sm" style={{ color: "#EF4444" }}>×</button></td></tr>);
              })}</tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ TAB: ПОСТУПЛЕНИЕ ═══ */}
      {tab === "receipt" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Поступление товаров (приходная накладная)</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Поставщик</label><input value={receiptCP} onChange={e => setReceiptCP(e.target.value)} placeholder='ТОО «СтройМат»' /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Основание (договор / счёт)</label><input value={receiptDoc} onChange={e => setReceiptDoc(e.target.value)} placeholder="Договор №..." /></div>
          </div>
          <div className="text-xs font-bold mb-2" style={{ color: "var(--t3)" }}>Товары:</div>
          {receiptItems.map((it, i) => (
            <div key={i} className="flex gap-2 items-end mb-2">
              <div className="flex-[2]"><select onChange={e => selectReceiptProduct(i, e.target.value)} value={it.product_id}><option value="">Из справочника...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="flex-[2]"><input value={it.name} onChange={e => updReceiptRow(i, "name", e.target.value)} placeholder="Или вручную" /></div>
              <div className="w-16"><input type="number" value={it.qty || ""} onChange={e => updReceiptRow(i, "qty", Number(e.target.value))} placeholder="Кол" /></div>
              <div className="w-24"><input type="number" value={it.price || ""} onChange={e => updReceiptRow(i, "price", Number(e.target.value))} placeholder="Цена" /></div>
              <div className="w-24 text-right text-xs font-bold pb-2">{fmtMoney(it.qty * it.price)} ₸</div>
            </div>
          ))}
          <button onClick={addReceiptRow} className="text-[11px] px-3 py-1 rounded-lg cursor-pointer mb-4" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>+ Строка</button>
          <div className="flex justify-between items-center pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
            <div className="text-sm">Итого: <b>{fmtMoney(receiptItems.reduce((a, it) => a + it.qty * it.price, 0))} ₸</b> <span className="text-xs" style={{ color: "var(--t3)" }}>(+НДС 16%: {fmtMoney(Math.round(receiptItems.reduce((a, it) => a + it.qty * it.price, 0) * TAX.NDS))} ₸)</span></div>
            <button onClick={processReceipt} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>✓ Оприходовать на склад</button>
          </div>
        </div>
      )}

      {/* ═══ TAB: ВОЗВРАТЫ ═══ */}
      {tab === "returns" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Возврат товаров</div>
          <div className="flex gap-3 mb-4">
            <button onClick={() => setReturnType("from_buyer")} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer" style={{ background: returnType === "from_buyer" ? "#10B981" : "transparent", color: returnType === "from_buyer" ? "#fff" : "var(--t3)", border: returnType === "from_buyer" ? "none" : "1px solid var(--brd)" }}>Возврат от покупателя (приход)</button>
            <button onClick={() => setReturnType("to_supplier")} className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer" style={{ background: returnType === "to_supplier" ? "#EF4444" : "transparent", color: returnType === "to_supplier" ? "#fff" : "var(--t3)", border: returnType === "to_supplier" ? "none" : "1px solid var(--brd)" }}>Возврат поставщику (расход)</button>
          </div>
          <div className="mb-4"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>{returnType === "from_buyer" ? "Покупатель" : "Поставщик"}</label><input value={returnCP} onChange={e => setReturnCP(e.target.value)} placeholder="Наименование контрагента" /></div>
          {returnItems.map((it, i) => (
            <div key={i} className="flex gap-2 items-end mb-2">
              <div className="flex-[2]"><select onChange={e => selectReturnProduct(i, e.target.value)} value={it.product_id}><option value="">Выбрать товар...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} (остаток: {p.quantity})</option>)}</select></div>
              <div className="w-20"><input type="number" value={it.qty || ""} onChange={e => updReturnRow(i, "qty", Number(e.target.value))} placeholder="Кол" /></div>
              <div className="w-24"><input type="number" value={it.price || ""} onChange={e => updReturnRow(i, "price", Number(e.target.value))} placeholder="Цена" /></div>
            </div>
          ))}
          <button onClick={addReturnRow} className="text-[11px] px-3 py-1 rounded-lg cursor-pointer mb-4" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>+ Строка</button>
          <div className="flex justify-end pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
            <button onClick={processReturn} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: returnType === "from_buyer" ? "#10B981" : "#EF4444" }}>✓ Провести возврат</button>
          </div>
        </div>
      )}

      {/* ═══ TAB: ИНВЕНТАРИЗАЦИЯ ═══ */}
      {tab === "inventory" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Инвентаризация ТМЗ</div>
          <p className="text-xs mb-4" style={{ color: "var(--t3)" }}>Введите фактические остатки. Система автоматически рассчитает расхождения и скорректирует данные.</p>
          <table>
            <thead><tr>{["Наименование", "Ед.", "По учёту", "Фактически", "Разница"].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
            <tbody>{inventoryData.map((row, i) => {
              const diff = row.actual_qty - row.system_qty;
              return (<tr key={row.id}><td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{row.name}</td><td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{row.unit}</td><td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(row.system_qty)}</td><td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}><input type="number" value={row.actual_qty} onChange={e => { const n = [...inventoryData]; n[i] = { ...n[i], actual_qty: Number(e.target.value), diff: Number(e.target.value) - n[i].system_qty }; setInventoryData(n); }} style={{ width: 100 }} /></td><td className="p-2.5 text-[13px] font-bold" style={{ color: diff > 0 ? "#10B981" : diff < 0 ? "#EF4444" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{diff > 0 ? "+" : ""}{diff}</td></tr>);
            })}</tbody>
          </table>
          <div className="flex justify-end mt-4">
            <button onClick={processInventory} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>✓ Провести инвентаризацию</button>
          </div>
        </div>
      )}
    </div>
  );
}
