"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "batches" | "receipt" | "writeoff" | "movements" | "expiring";

const VAL_METHODS: Record<string, { name: string; icon: string; color: string; desc: string }> = {
  fifo: { name: "FIFO", icon: "⬇", color: "#10B981", desc: "First In - First Out (раньше поступил → раньше списан)" },
  lifo: { name: "LIFO", icon: "⬆", color: "#F59E0B", desc: "Last In - First Out (позже поступил → раньше списан)" },
  avg: { name: "Средняя", icon: "≈", color: "#A855F7", desc: "Средневзвешенная себестоимость" },
};

const MOVE_TYPES: Record<string, { name: string; color: string; sign: string }> = {
  receipt: { name: "Поступление", color: "#10B981", sign: "+" },
  sale: { name: "Реализация", color: "#3B82F6", sign: "−" },
  writeoff: { name: "Списание", color: "#EF4444", sign: "−" },
  transfer: { name: "Перемещение", color: "#A855F7", sign: "−" },
  production_use: { name: "В производство", color: "#F59E0B", sign: "−" },
  return: { name: "Возврат", color: "#EC4899", sign: "+" },
};

export default function BatchesPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("batches");
  const [batches, setBatches] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [nomenclature, setNomenclature] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const [filterNom, setFilterNom] = useState<string>("all");
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  // Receipt form
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const emptyReceipt = {
    nomenclature_id: "",
    batch_number: "",
    receipt_date: new Date().toISOString().slice(0, 10),
    expiry_date: "",
    quantity: "0",
    purchase_price: "0",
    supplier_id: "",
    supplier_name: "",
    doc_number: "",
    warehouse_name: "Основной склад",
    notes: "",
  };
  const [receiptForm, setReceiptForm] = useState(emptyReceipt);

  // Writeoff form
  const [showWriteoffForm, setShowWriteoffForm] = useState(false);
  const emptyWriteoff = {
    nomenclature_id: "",
    quantity: "0",
    movement_type: "sale",
    movement_date: new Date().toISOString().slice(0, 10),
    method: "fifo" as "fifo" | "lifo" | "avg",
    doc_ref: "",
    notes: "",
  };
  const [writeoffForm, setWriteoffForm] = useState(emptyWriteoff);
  const [writeoffPreview, setWriteoffPreview] = useState<{ batch: any; qty: number; cost: number }[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [b, m, n, c] = await Promise.all([
      supabase.from("stock_batches").select("*").eq("user_id", user.id).order("receipt_date", { ascending: false }),
      supabase.from("batch_movements").select("*").eq("user_id", user.id).order("movement_date", { ascending: false }).limit(200),
      supabase.from("nomenclature").select("*").eq("user_id", user.id).order("name"),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
    ]);
    setBatches(b.data || []);
    setMovements(m.data || []);
    setNomenclature(n.data || []);
    setCounterparties(c.data || []);
  }

  // ═══ ПОСТУПЛЕНИЕ ПАРТИИ ═══
  function startReceipt() {
    const num = `ПАР-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setReceiptForm({ ...emptyReceipt, batch_number: num });
    setShowReceiptForm(true);
  }

  function selectSupplier(id: string) {
    const c = counterparties.find(x => x.id === id);
    if (c) setReceiptForm({ ...receiptForm, supplier_id: id, supplier_name: c.name });
    else setReceiptForm({ ...receiptForm, supplier_id: "" });
  }

  async function saveReceipt() {
    if (!receiptForm.nomenclature_id || Number(receiptForm.quantity) <= 0 || Number(receiptForm.purchase_price) <= 0) {
      setMsg("❌ Выберите товар, укажите количество и цену > 0"); setTimeout(() => setMsg(""), 3000); return;
    }
    const n = nomenclature.find(x => x.id === receiptForm.nomenclature_id);
    if (!n) return;

    const qty = Number(receiptForm.quantity);
    const price = Number(receiptForm.purchase_price);

    // Создаём партию
    const { data: batch } = await supabase.from("stock_batches").insert({
      user_id: userId,
      nomenclature_id: receiptForm.nomenclature_id,
      product_name: n.name,
      unit: n.unit,
      batch_number: receiptForm.batch_number,
      receipt_date: receiptForm.receipt_date,
      expiry_date: receiptForm.expiry_date || null,
      initial_quantity: qty,
      current_quantity: qty,
      purchase_price: price,
      supplier_id: receiptForm.supplier_id || null,
      supplier_name: receiptForm.supplier_name || null,
      doc_number: receiptForm.doc_number || null,
      warehouse_name: receiptForm.warehouse_name,
      notes: receiptForm.notes,
    }).select().single();

    // Движение поступления
    await supabase.from("batch_movements").insert({
      user_id: userId,
      batch_id: batch?.id,
      batch_number: receiptForm.batch_number,
      nomenclature_id: receiptForm.nomenclature_id,
      product_name: n.name,
      movement_date: receiptForm.receipt_date,
      movement_type: "receipt",
      quantity: qty,
      unit_cost: price,
      total_cost: qty * price,
      doc_ref: receiptForm.doc_number,
    });

    // Обновляем общий остаток в номенклатуре + средневзвешенная цена
    const otherBatches = batches.filter(b => b.nomenclature_id === receiptForm.nomenclature_id && b.is_active);
    const totalQty = otherBatches.reduce((a, b) => a + Number(b.current_quantity), 0) + qty;
    const totalCost = otherBatches.reduce((a, b) => a + Number(b.current_quantity) * Number(b.purchase_price), 0) + qty * price;
    const avgPrice = totalQty > 0 ? totalCost / totalQty : price;

    await supabase.from("nomenclature").update({
      quantity: totalQty,
      purchase_price: Math.round(avgPrice * 100) / 100,
    }).eq("id", receiptForm.nomenclature_id);

    setMsg(`✅ Партия ${receiptForm.batch_number} оприходована: ${qty} ${n.unit} × ${fmtMoney(price)} = ${fmtMoney(qty * price)} ₸`);
    setShowReceiptForm(false);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  // ═══ СПИСАНИЕ С УЧЁТОМ ПАРТИЙ ═══
  function startWriteoff() {
    setWriteoffForm({ ...emptyWriteoff, doc_ref: `СП-${Date.now().toString().slice(-6)}` });
    setWriteoffPreview([]);
    setShowWriteoffForm(true);
  }

  function calculatePreview() {
    if (!writeoffForm.nomenclature_id || Number(writeoffForm.quantity) <= 0) {
      setWriteoffPreview([]); return;
    }
    const qty = Number(writeoffForm.quantity);
    const activeBatches = batches.filter(b =>
      b.nomenclature_id === writeoffForm.nomenclature_id &&
      b.is_active &&
      Number(b.current_quantity) > 0
    );

    let sorted = [...activeBatches];
    if (writeoffForm.method === "fifo") {
      sorted.sort((a, b) => a.receipt_date.localeCompare(b.receipt_date));
    } else if (writeoffForm.method === "lifo") {
      sorted.sort((a, b) => b.receipt_date.localeCompare(a.receipt_date));
    }

    const preview: { batch: any; qty: number; cost: number }[] = [];
    let remaining = qty;

    if (writeoffForm.method === "avg") {
      // Средневзвешенная: вся партия по средней цене
      const totalQty = activeBatches.reduce((a, b) => a + Number(b.current_quantity), 0);
      const totalCost = activeBatches.reduce((a, b) => a + Number(b.current_quantity) * Number(b.purchase_price), 0);
      const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;

      // Списание идёт пропорционально из всех партий
      for (const b of sorted) {
        if (remaining <= 0) break;
        const available = Number(b.current_quantity);
        const propQty = Math.min(remaining, available);
        if (propQty > 0) {
          preview.push({ batch: b, qty: propQty, cost: propQty * avgPrice });
          remaining -= propQty;
        }
      }
    } else {
      // FIFO/LIFO
      for (const b of sorted) {
        if (remaining <= 0) break;
        const available = Number(b.current_quantity);
        const takeQty = Math.min(remaining, available);
        if (takeQty > 0) {
          preview.push({ batch: b, qty: takeQty, cost: takeQty * Number(b.purchase_price) });
          remaining -= takeQty;
        }
      }
    }

    if (remaining > 0.001) {
      setMsg(`⚠ Недостаточно товара: запрошено ${qty}, доступно ${qty - remaining}`);
      setTimeout(() => setMsg(""), 4000);
    }

    setWriteoffPreview(preview);
  }

  useEffect(() => { calculatePreview(); }, [writeoffForm.nomenclature_id, writeoffForm.quantity, writeoffForm.method, batches]);

  async function executeWriteoff() {
    if (writeoffPreview.length === 0) { setMsg("❌ Нет данных для списания"); setTimeout(() => setMsg(""), 3000); return; }
    const totalQty = writeoffPreview.reduce((a, p) => a + p.qty, 0);
    const totalCost = writeoffPreview.reduce((a, p) => a + p.cost, 0);
    const n = nomenclature.find(x => x.id === writeoffForm.nomenclature_id);
    if (!n) return;

    if (!confirm(`Списать ${totalQty} ${n.unit} из ${writeoffPreview.length} партий на сумму ${fmtMoney(totalCost)} ₸?`)) return;

    // Применяем списания
    for (const p of writeoffPreview) {
      const newQty = Number(p.batch.current_quantity) - p.qty;
      await supabase.from("stock_batches").update({
        current_quantity: newQty,
        is_active: newQty > 0.001,
      }).eq("id", p.batch.id);

      await supabase.from("batch_movements").insert({
        user_id: userId,
        batch_id: p.batch.id,
        batch_number: p.batch.batch_number,
        nomenclature_id: writeoffForm.nomenclature_id,
        product_name: n.name,
        movement_date: writeoffForm.movement_date,
        movement_type: writeoffForm.movement_type,
        quantity: p.qty,
        unit_cost: p.cost / p.qty,
        total_cost: p.cost,
        doc_ref: writeoffForm.doc_ref,
        notes: writeoffForm.notes,
      });
    }

    // Обновляем общий остаток
    const remainingBatches = batches.filter(b => b.nomenclature_id === writeoffForm.nomenclature_id && b.is_active && b.id !== writeoffPreview[0].batch.id);
    const newTotalQty = Number(n.quantity || 0) - totalQty;
    await supabase.from("nomenclature").update({ quantity: Math.max(0, newTotalQty) }).eq("id", writeoffForm.nomenclature_id);

    // Бух. проводка по списанию
    const movType = writeoffForm.movement_type;
    let debit = "7010", credit = "1330";
    if (movType === "sale") { debit = "7010"; credit = "1330"; }
    else if (movType === "writeoff") { debit = "7990"; credit = "1330"; }
    else if (movType === "production_use") { debit = "8110"; credit = "1330"; }

    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: writeoffForm.movement_date,
      doc_ref: writeoffForm.doc_ref,
      debit_account: debit,
      credit_account: credit,
      amount: totalCost,
      description: `${MOVE_TYPES[movType].name}: ${n.name} ${totalQty} ${n.unit} (${VAL_METHODS[writeoffForm.method].name})`,
    });

    setMsg(`✅ Списано ${totalQty} ${n.unit} на ${fmtMoney(totalCost)} ₸ методом ${VAL_METHODS[writeoffForm.method].name}. Проводка: Дт ${debit} Кт ${credit}`);
    setShowWriteoffForm(false);
    setWriteoffPreview([]);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  async function deleteBatch(id: string) {
    if (!confirm("Удалить партию? Связанные движения останутся, но потеряют связь.")) return;
    await supabase.from("stock_batches").delete().eq("id", id);
    load();
  }

  // KPI
  const activeBatches = batches.filter(b => b.is_active && Number(b.current_quantity) > 0);
  const totalValue = activeBatches.reduce((a, b) => a + Number(b.current_quantity) * Number(b.purchase_price), 0);
  const totalQuantity = activeBatches.reduce((a, b) => a + Number(b.current_quantity), 0);

  // Expiring
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const expiringSoon = activeBatches.filter(b => b.expiry_date && b.expiry_date >= today && b.expiry_date <= in30);
  const expired = activeBatches.filter(b => b.expiry_date && b.expiry_date < today);

  // Filter
  let filteredBatches = batches;
  if (filterNom !== "all") filteredBatches = filteredBatches.filter(b => b.nomenclature_id === filterNom);
  if (showOnlyActive) filteredBatches = filteredBatches.filter(b => b.is_active && Number(b.current_quantity) > 0);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") || msg.startsWith("⚠") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") || msg.startsWith("⚠") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Партионный учёт: каждое поступление = отдельная партия с датой и ценой. Списание: FIFO (старые первыми) / LIFO (новые первыми) / по средней.
      </div>

      {(expired.length > 0 || expiringSoon.length > 0) && (
        <div className="rounded-xl p-3" style={{ background: "#EF444410", border: "1px solid #EF444430" }}>
          <div className="flex gap-4 text-xs">
            {expired.length > 0 && <div><b style={{ color: "#EF4444" }}>⚠ Просрочено:</b> {expired.length} партий</div>}
            {expiringSoon.length > 0 && <div><b style={{ color: "#F59E0B" }}>⏰ Истекают в 30 дней:</b> {expiringSoon.length} партий</div>}
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📦 Активных партий</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{activeBatches.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {batches.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Остатки</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{totalQuantity.toFixed(2)}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Единиц</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Стоимость остатков</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(totalValue)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По закупочным</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⏰ С истечением</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{expired.length + expiringSoon.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Просрочено + 30 дн.</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          ["batches", `📦 Партии (${activeBatches.length})`],
          ["receipt", "📥 Приход"],
          ["writeoff", "📤 Списание"],
          ["movements", "📋 Движения"],
          ["expiring", `⏰ Сроки годности (${expired.length + expiringSoon.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ПАРТИИ ═══ */}
      {tab === "batches" && (
        <>
          <div className="flex gap-3 items-center flex-wrap">
            <select value={filterNom} onChange={e => setFilterNom(e.target.value)} style={{ width: 300 }}>
              <option value="all">Все товары</option>
              {nomenclature.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
              <span className="text-xs">Только активные (с остатком)</span>
            </label>
            <span className="text-[11px]" style={{ color: "var(--t3)" }}>{filteredBatches.length} партий</span>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№ партии", "Дата", "Срок годн.", "Товар", "Получено", "Остаток", "Цена", "Стоимость остатка", "Поставщик", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filteredBatches.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет партий</td></tr>
                ) : filteredBatches.map(b => {
                  const isExpired = b.expiry_date && b.expiry_date < today;
                  const isExpSoon = b.expiry_date && b.expiry_date >= today && b.expiry_date <= in30;
                  const isEmpty = Number(b.current_quantity) <= 0;
                  return (
                    <tr key={b.id} style={{ background: isExpired ? "#EF444410" : isExpSoon ? "#F59E0B10" : "transparent", opacity: isEmpty ? 0.5 : 1 }}>
                      <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{b.batch_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{b.receipt_date}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: isExpired ? "#EF4444" : isExpSoon ? "#F59E0B" : "var(--t3)", fontWeight: isExpired || isExpSoon ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>
                        {b.expiry_date || "—"}
                        {isExpired && <span className="ml-2">⚠</span>}
                        {isExpSoon && <span className="ml-2">⏰</span>}
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{b.product_name}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{Number(b.initial_quantity).toFixed(3)} {b.unit}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ color: isEmpty ? "var(--t3)" : "#10B981", borderBottom: "1px solid var(--brd)" }}>{Number(b.current_quantity).toFixed(3)} {b.unit}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(b.purchase_price))} ₸</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(b.current_quantity) * Number(b.purchase_price))} ₸</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{b.supplier_name || "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteBatch(b.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ПРИХОД ═══ */}
      {tab === "receipt" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Поступление новой партии товара. Каждая партия = отдельная запись с собственной ценой и сроком.</div>
            <button onClick={startReceipt} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Оприходовать партию</button>
          </div>

          {showReceiptForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">📥 Поступление партии товара</div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ партии</label><input value={receiptForm.batch_number} onChange={e => setReceiptForm({ ...receiptForm, batch_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата прихода</label><input type="date" value={receiptForm.receipt_date} onChange={e => setReceiptForm({ ...receiptForm, receipt_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Срок годности</label><input type="date" value={receiptForm.expiry_date} onChange={e => setReceiptForm({ ...receiptForm, expiry_date: e.target.value })} /></div>
                <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Товар *</label>
                  <select value={receiptForm.nomenclature_id} onChange={e => setReceiptForm({ ...receiptForm, nomenclature_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {nomenclature.map(n => <option key={n.id} value={n.id}>{n.name} ({n.unit})</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Количество *</label><input type="number" step="0.001" value={receiptForm.quantity} onChange={e => setReceiptForm({ ...receiptForm, quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Цена закупки за ед. *</label><input type="number" step="0.01" value={receiptForm.purchase_price} onChange={e => setReceiptForm({ ...receiptForm, purchase_price: e.target.value })} /></div>
                <div className="flex items-end" style={{ paddingBottom: 8 }}>
                  <div className="text-xs">Итого: <b style={{ color: "#10B981" }}>{fmtMoney(Number(receiptForm.quantity) * Number(receiptForm.purchase_price))} ₸</b></div>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Поставщик</label>
                  <select value={receiptForm.supplier_id} onChange={e => selectSupplier(e.target.value)}>
                    <option value="">— Выбрать —</option>
                    {counterparties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ накладной</label><input value={receiptForm.doc_number} onChange={e => setReceiptForm({ ...receiptForm, doc_number: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Склад</label><input value={receiptForm.warehouse_name} onChange={e => setReceiptForm({ ...receiptForm, warehouse_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={receiptForm.notes} onChange={e => setReceiptForm({ ...receiptForm, notes: e.target.value })} /></div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveReceipt} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>✓ Оприходовать</button>
                <button onClick={() => setShowReceiptForm(false)} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">Последние поступления (10)</div>
            <table>
              <thead><tr>{["№ партии", "Дата", "Товар", "Кол-во", "Цена", "Сумма", "Поставщик"].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {batches.slice(0, 10).map(b => (
                  <tr key={b.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{b.batch_number}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{b.receipt_date}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{b.product_name}</td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{Number(b.initial_quantity).toFixed(2)} {b.unit}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(b.purchase_price))} ₸</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(b.initial_quantity) * Number(b.purchase_price))} ₸</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{b.supplier_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ СПИСАНИЕ ═══ */}
      {tab === "writeoff" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Списание с автоматическим выбором партий по методу FIFO/LIFO/средняя</div>
            <button onClick={startWriteoff} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#EF4444" }}>+ Списать</button>
          </div>

          {showWriteoffForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">📤 Списание товара с расчётом по партиям</div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Метод списания</label>
                  <select value={writeoffForm.method} onChange={e => setWriteoffForm({ ...writeoffForm, method: e.target.value as any })}>
                    {Object.entries(VAL_METHODS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
                  </select>
                  <div className="text-[9px] mt-1" style={{ color: VAL_METHODS[writeoffForm.method].color }}>{VAL_METHODS[writeoffForm.method].desc}</div>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип операции</label>
                  <select value={writeoffForm.movement_type} onChange={e => setWriteoffForm({ ...writeoffForm, movement_type: e.target.value })}>
                    <option value="sale">📦 Реализация (Дт 7010 Кт 1330)</option>
                    <option value="writeoff">🗑 Списание (Дт 7990 Кт 1330)</option>
                    <option value="production_use">🏭 В производство (Дт 8110 Кт 1330)</option>
                    <option value="transfer">🔁 Перемещение</option>
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={writeoffForm.movement_date} onChange={e => setWriteoffForm({ ...writeoffForm, movement_date: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Товар *</label>
                  <select value={writeoffForm.nomenclature_id} onChange={e => setWriteoffForm({ ...writeoffForm, nomenclature_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {nomenclature.map(n => {
                      const avail = batches.filter(b => b.nomenclature_id === n.id && b.is_active).reduce((a, b) => a + Number(b.current_quantity), 0);
                      return <option key={n.id} value={n.id} disabled={avail === 0}>{n.name} ({n.unit}) — доступно: {avail.toFixed(2)}</option>;
                    })}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Кол-во *</label><input type="number" step="0.001" value={writeoffForm.quantity} onChange={e => setWriteoffForm({ ...writeoffForm, quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Документ</label><input value={writeoffForm.doc_ref} onChange={e => setWriteoffForm({ ...writeoffForm, doc_ref: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={writeoffForm.notes} onChange={e => setWriteoffForm({ ...writeoffForm, notes: e.target.value })} /></div>
              </div>

              {writeoffPreview.length > 0 && (
                <>
                  <div className="text-[11px] font-bold mb-2" style={{ color: "var(--accent)" }}>📊 РАСЧЁТ ПО ПАРТИЯМ ({VAL_METHODS[writeoffForm.method].name})</div>
                  <div className="rounded-lg p-2 mb-3" style={{ background: "var(--bg)" }}>
                    <table>
                      <thead><tr>{["№ партии", "Дата прихода", "Цена партии", "Списать кол-во", "Сумма"].map(h => (
                        <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{h}</th>
                      ))}</tr></thead>
                      <tbody>
                        {writeoffPreview.map((p, i) => (
                          <tr key={i}>
                            <td className="p-2 text-[12px] font-mono" style={{ color: "var(--accent)" }}>{p.batch.batch_number}</td>
                            <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>{p.batch.receipt_date}</td>
                            <td className="p-2 text-[12px]">{fmtMoney(Number(p.batch.purchase_price))} ₸</td>
                            <td className="p-2 text-[12px] font-bold">{p.qty.toFixed(3)}</td>
                            <td className="p-2 text-[12px] text-right font-bold" style={{ color: "#EF4444" }}>{fmtMoney(p.cost)} ₸</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "var(--card)" }}>
                          <td colSpan={3} className="p-2 text-[12px] font-bold">ИТОГО:</td>
                          <td className="p-2 text-[12px] font-bold">{writeoffPreview.reduce((a, p) => a + p.qty, 0).toFixed(3)}</td>
                          <td className="p-2 text-[14px] text-right font-bold" style={{ color: "#EF4444" }}>{fmtMoney(writeoffPreview.reduce((a, p) => a + p.cost, 0))} ₸</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <button onClick={executeWriteoff} disabled={writeoffPreview.length === 0} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#EF4444", opacity: writeoffPreview.length === 0 ? 0.5 : 1 }}>
                  ✓ Провести списание
                </button>
                <button onClick={() => setShowWriteoffForm(false)} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ ДВИЖЕНИЯ ═══ */}
      {tab === "movements" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📋 Все движения по партиям (последние 200)</div>
          <table>
            <thead><tr>{["Дата", "№ партии", "Товар", "Тип", "Кол-во", "Цена", "Сумма", "Документ"].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {movements.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет движений</td></tr>
              ) : movements.map(m => {
                const t = MOVE_TYPES[m.movement_type] || MOVE_TYPES.sale;
                return (
                  <tr key={m.id}>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{m.movement_date}</td>
                    <td className="p-2.5 text-[11px] font-mono" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{m.batch_number || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{m.product_name}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.sign} {t.name}</span>
                    </td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ color: t.color, borderBottom: "1px solid var(--brd)" }}>{t.sign}{Number(m.quantity).toFixed(3)}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(m.unit_cost))} ₸</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(m.total_cost))} ₸</td>
                    <td className="p-2.5 text-[11px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{m.doc_ref || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ СРОКИ ГОДНОСТИ ═══ */}
      {tab === "expiring" && (
        <>
          {expired.length > 0 && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid #EF444450" }}>
              <div className="text-sm font-bold mb-3" style={{ color: "#EF4444" }}>⚠ ПРОСРОЧЕНО ({expired.length})</div>
              <table>
                <thead><tr>{["№ партии", "Срок годности", "Товар", "Остаток", "Стоимость"].map(h => (
                  <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {expired.map(b => {
                    const daysOverdue = Math.floor((new Date(today).getTime() - new Date(b.expiry_date).getTime()) / 86400000);
                    return (
                      <tr key={b.id} style={{ background: "#EF444410" }}>
                        <td className="p-2.5 text-[12px] font-mono font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{b.batch_number}</td>
                        <td className="p-2.5 text-[12px] font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{b.expiry_date} ({daysOverdue} дн. назад)</td>
                        <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{b.product_name}</td>
                        <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{Number(b.current_quantity).toFixed(3)} {b.unit}</td>
                        <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(b.current_quantity) * Number(b.purchase_price))} ₸</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {expiringSoon.length > 0 && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid #F59E0B50" }}>
              <div className="text-sm font-bold mb-3" style={{ color: "#F59E0B" }}>⏰ ИСТЕКАЮТ В БЛИЖАЙШИЕ 30 ДНЕЙ ({expiringSoon.length})</div>
              <table>
                <thead><tr>{["№ партии", "Срок годности", "Товар", "Остаток", "Стоимость"].map(h => (
                  <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {expiringSoon.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)).map(b => {
                    const daysLeft = Math.floor((new Date(b.expiry_date).getTime() - new Date(today).getTime()) / 86400000);
                    return (
                      <tr key={b.id} style={{ background: "#F59E0B10" }}>
                        <td className="p-2.5 text-[12px] font-mono font-bold" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{b.batch_number}</td>
                        <td className="p-2.5 text-[12px] font-bold" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{b.expiry_date} (через {daysLeft} дн.)</td>
                        <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{b.product_name}</td>
                        <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{Number(b.current_quantity).toFixed(3)} {b.unit}</td>
                        <td className="p-2.5 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(b.current_quantity) * Number(b.purchase_price))} ₸</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {expired.length === 0 && expiringSoon.length === 0 && (
            <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
              ✅ Нет партий с истекающим сроком годности
            </div>
          )}
        </>
      )}
    </div>
  );
}
