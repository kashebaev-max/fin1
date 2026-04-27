"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TAX, fmtMoney } from "@/lib/tax2026";

type Tab = "register" | "shifts" | "receipts" | "products";

interface CartItem {
  product_id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  sum: number;
}

export default function POSPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("register");
  const [products, setProducts] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [msg, setMsg] = useState("");

  // POS state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mixed">("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [showReceiptPrint, setShowReceiptPrint] = useState(false);

  // Product editing
  const [editProduct, setEditProduct] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", barcode: "", sku: "", retail_price: "", price: "", quantity: "", min_quantity: "", unit: "шт" });

  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === "register" && barcodeRef.current) barcodeRef.current.focus(); }, [tab]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [p, s, r, prof] = await Promise.all([
      supabase.from("products").select("*").eq("user_id", user.id).order("name"),
      supabase.from("pos_shifts").select("*").eq("user_id", user.id).order("opened_at", { ascending: false }),
      supabase.from("pos_receipts").select("*").eq("user_id", user.id).order("receipt_date", { ascending: false }).limit(50),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
    ]);

    setProducts(p.data || []);
    setShifts(s.data || []);
    setReceipts(r.data || []);
    if (prof.data) setProfile(prof.data);

    const open = (s.data || []).find((x: any) => x.status === "open");
    setActiveShift(open || null);
  }

  // ═══ СМЕНА ═══
  async function openShift() {
    const { data: shift } = await supabase.from("pos_shifts").insert({
      user_id: userId,
      shift_number: `SHIFT-${new Date().toISOString().slice(0, 10)}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      opening_cash: Number(openingCash) || 0,
      cashier_name: profile?.full_name || "Кассир",
      status: "open",
    }).select().single();

    if (shift) {
      setActiveShift(shift);
      setOpeningCash("");
      setShowOpenShift(false);
      setMsg(`✅ Смена ${shift.shift_number} открыта`);
      load();
    }
    setTimeout(() => setMsg(""), 3000);
  }

  async function closeShift() {
    if (!activeShift) return;

    const shiftReceipts = receipts.filter(r => r.shift_id === activeShift.id);
    const totalSales = shiftReceipts.reduce((a, r) => a + Number(r.total_with_nds), 0);
    const cashSales = shiftReceipts.filter(r => r.payment_method === "cash").reduce((a, r) => a + Number(r.cash_amount), 0);
    const cardSales = shiftReceipts.filter(r => r.payment_method === "card").reduce((a, r) => a + Number(r.card_amount), 0);

    await supabase.from("pos_shifts").update({
      closed_at: new Date().toISOString(),
      closing_cash: Number(closingCash) || 0,
      total_sales: totalSales,
      total_receipts: shiftReceipts.length,
      cash_sales: cashSales,
      card_sales: cardSales,
      status: "closed",
    }).eq("id", activeShift.id);

    // Создать кассовую операцию ПКО на сумму наличных продаж
    if (cashSales > 0) {
      await supabase.from("cash_operations").insert({
        user_id: userId,
        op_type: "pko",
        op_date: new Date().toISOString().slice(0, 10),
        amount: cashSales,
        description: `Выручка от розницы за смену ${activeShift.shift_number}`,
        doc_number: `PKO-${activeShift.shift_number}`,
      });

      // Проводка
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: new Date().toISOString().slice(0, 10),
        doc_ref: activeShift.shift_number,
        debit_account: "1010",
        credit_account: "6010",
        amount: cashSales,
        description: `Розничная выручка наличными`,
      });
    }

    setActiveShift(null);
    setClosingCash("");
    setShowCloseShift(false);
    setMsg(`✅ Смена закрыта. Продаж: ${fmtMoney(totalSales)} ₸ • Чеков: ${shiftReceipts.length}`);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  // ═══ КОРЗИНА ═══
  function addToCart(product: any, qty = 1) {
    const price = Number(product.retail_price || product.price);
    const existing = cart.find(c => c.product_id === product.id);
    if (existing) {
      setCart(cart.map(c => c.product_id === product.id ? { ...c, quantity: c.quantity + qty, sum: (c.quantity + qty) * c.price } : c));
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        unit: product.unit,
        price,
        quantity: qty,
        sum: qty * price,
      }]);
    }
  }

  function updateCartQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart(cart.filter(c => c.product_id !== productId));
      return;
    }
    setCart(cart.map(c => c.product_id === productId ? { ...c, quantity: qty, sum: qty * c.price } : c));
  }

  function removeFromCart(productId: string) {
    setCart(cart.filter(c => c.product_id !== productId));
  }

  function clearCart() {
    setCart([]);
    setCashReceived("");
    setPaymentMethod("cash");
  }

  // Поиск по штрихкоду / SKU / названию
  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const product = products.find(p =>
      p.barcode === barcodeInput ||
      p.sku === barcodeInput ||
      p.name.toLowerCase().includes(barcodeInput.toLowerCase())
    );
    if (product) {
      if (Number(product.quantity) <= 0) {
        setMsg(`⚠ ${product.name} — нет на складе!`);
        setTimeout(() => setMsg(""), 3000);
      } else {
        addToCart(product, 1);
        setBarcodeInput("");
      }
    } else {
      setMsg(`❌ Товар "${barcodeInput}" не найден`);
      setTimeout(() => setMsg(""), 2500);
    }
  }

  // ═══ ПРОДАЖА ═══
  const cartTotal = cart.reduce((a, c) => a + c.sum, 0);
  const cartNDS = Math.round(cartTotal * TAX.NDS / (1 + TAX.NDS)); // НДС включён в цену
  const change = paymentMethod === "cash" ? Math.max(0, Number(cashReceived) - cartTotal) : 0;
  const canPay = cart.length > 0 && (paymentMethod !== "cash" || Number(cashReceived) >= cartTotal);

  async function processPayment() {
    if (!activeShift) {
      setMsg("❌ Откройте кассовую смену!");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    if (cart.length === 0) return;

    const receiptNumber = `R-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const cashAmount = paymentMethod === "cash" ? cartTotal : 0;
    const cardAmount = paymentMethod === "card" ? cartTotal : 0;

    const { data: receipt } = await supabase.from("pos_receipts").insert({
      user_id: userId,
      shift_id: activeShift.id,
      receipt_number: receiptNumber,
      payment_method: paymentMethod,
      total_sum: cartTotal - cartNDS,
      nds_sum: cartNDS,
      total_with_nds: cartTotal,
      cash_amount: cashAmount,
      card_amount: cardAmount,
      change_amount: change,
      items: cart,
    }).select().single();

    // Списать со склада
    for (const item of cart) {
      const product = products.find(p => p.id === item.product_id);
      if (product) {
        await supabase.from("products").update({
          quantity: Math.max(0, Number(product.quantity) - item.quantity),
        }).eq("id", item.product_id);
      }
    }

    // Проводка по бухгалтерии
    const debitAcc = paymentMethod === "cash" ? "1010" : "1030";
    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: new Date().toISOString().slice(0, 10),
      doc_ref: receiptNumber,
      debit_account: debitAcc,
      credit_account: "6010",
      amount: cartTotal - cartNDS,
      description: `Розничная продажа, чек ${receiptNumber}`,
    });

    if (cartNDS > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: new Date().toISOString().slice(0, 10),
        doc_ref: receiptNumber,
        debit_account: debitAcc,
        credit_account: "3130",
        amount: cartNDS,
        description: `НДС с розничной продажи`,
      });
    }

    setLastReceipt(receipt);
    setShowReceiptPrint(true);
    setMsg(`✅ Чек ${receiptNumber} проведён • ${fmtMoney(cartTotal)} ₸`);
    clearCart();
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  function printReceipt() {
    const w = window.open("", "_blank");
    if (!w || !lastReceipt) return;
    const items = lastReceipt.items as CartItem[];
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Чек ${lastReceipt.receipt_number}</title>
      <style>body{font-family:'Courier New',monospace;width:280px;padding:10px;font-size:12px}
      h2{text-align:center;margin:0;font-size:14px}.row{display:flex;justify-content:space-between;margin:2px 0}
      hr{border:none;border-top:1px dashed #000;margin:8px 0}.r{text-align:right}.b{font-weight:700}
      .c{text-align:center}@media print{body{width:auto}}</style></head><body>
      <h2>${profile?.company_name || "Организация"}</h2>
      <p class="c" style="margin:2px 0;font-size:10px">БИН: ${profile?.company_bin || "—"}</p>
      <hr>
      <p class="c b">КАССОВЫЙ ЧЕК</p>
      <p class="c">№ ${lastReceipt.receipt_number}</p>
      <p class="c" style="font-size:10px">${new Date(lastReceipt.receipt_date).toLocaleString("ru-RU")}</p>
      <hr>
      ${items.map(it => `
        <div>${it.name}</div>
        <div class="row"><span>${it.quantity} ${it.unit} × ${fmtMoney(it.price)}</span><span class="b">${fmtMoney(it.sum)} ₸</span></div>
      `).join("")}
      <hr>
      <div class="row"><span>Сумма без НДС:</span><span>${fmtMoney(Number(lastReceipt.total_sum))} ₸</span></div>
      <div class="row"><span>НДС 16%:</span><span>${fmtMoney(Number(lastReceipt.nds_sum))} ₸</span></div>
      <div class="row b" style="font-size:14px;margin-top:5px"><span>ИТОГО:</span><span>${fmtMoney(Number(lastReceipt.total_with_nds))} ₸</span></div>
      <hr>
      <div class="row"><span>Способ оплаты:</span><span>${lastReceipt.payment_method === "cash" ? "Наличные" : lastReceipt.payment_method === "card" ? "Карта" : "Смешанная"}</span></div>
      ${Number(lastReceipt.cash_amount) > 0 ? `<div class="row"><span>Получено:</span><span>${fmtMoney(Number(lastReceipt.cash_amount))} ₸</span></div>` : ""}
      ${Number(lastReceipt.change_amount) > 0 ? `<div class="row"><span>Сдача:</span><span>${fmtMoney(Number(lastReceipt.change_amount))} ₸</span></div>` : ""}
      <hr>
      <p class="c" style="font-size:10px;margin:0">Спасибо за покупку!</p>
      <p class="c" style="font-size:9px;margin:2px 0">finstat.kz</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  // ═══ ТОВАРЫ ═══
  function startEditProduct(p: any) {
    setEditProduct(p);
    setEditForm({
      name: p.name, barcode: p.barcode || "", sku: p.sku || "",
      retail_price: String(p.retail_price || p.price),
      price: String(p.price),
      quantity: String(p.quantity),
      min_quantity: String(p.min_quantity || 0),
      unit: p.unit,
    });
  }

  async function saveProduct() {
    if (!editProduct) return;
    await supabase.from("products").update({
      name: editForm.name,
      barcode: editForm.barcode || null,
      sku: editForm.sku || null,
      retail_price: Number(editForm.retail_price),
      price: Number(editForm.price),
      quantity: Number(editForm.quantity),
      min_quantity: Number(editForm.min_quantity),
      unit: editForm.unit,
    }).eq("id", editProduct.id);
    setEditProduct(null);
    setMsg("✅ Товар обновлён");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  // Filter products by search
  const filteredProducts = searchQuery
    ? products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode?.includes(searchQuery) ||
        p.sku?.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 24)
    : products.slice(0, 24);

  return (
    <div className="flex flex-col gap-4">
      {msg && <div className="rounded-xl p-3 text-sm font-semibold" style={{ background: msg.startsWith("❌") || msg.startsWith("⚠") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") || msg.startsWith("⚠") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        {([["register", "🛒 Касса"], ["shifts", "📋 Смены"], ["receipts", "🧾 Чеки"], ["products", "📦 Товары"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
        <div className="ml-auto">
          {activeShift ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-1 rounded font-semibold" style={{ background: "#10B98120", color: "#10B981" }}>● Смена открыта</span>
              <button onClick={() => setShowCloseShift(true)} className="text-[11px] px-3 py-1 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid #EF4444", color: "#EF4444" }}>Закрыть смену</button>
            </div>
          ) : (
            <button onClick={() => setShowOpenShift(true)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>+ Открыть смену</button>
          )}
        </div>
      </div>

      {/* Open shift modal */}
      {showOpenShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowOpenShift(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-2xl w-full max-w-md p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }} onClick={e => e.stopPropagation()}>
            <div className="text-base font-bold mb-4">Открыть кассовую смену</div>
            <div className="mb-4">
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма в кассе на начало смены (₸)</label>
              <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="0" autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowOpenShift(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              <button onClick={openShift} className="px-5 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>Открыть смену</button>
            </div>
          </div>
        </div>
      )}

      {/* Close shift modal */}
      {showCloseShift && activeShift && (() => {
        const shiftReceipts = receipts.filter(r => r.shift_id === activeShift.id);
        const totalSales = shiftReceipts.reduce((a, r) => a + Number(r.total_with_nds), 0);
        const cashSales = shiftReceipts.filter(r => r.payment_method === "cash").reduce((a, r) => a + Number(r.cash_amount), 0);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowCloseShift(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative rounded-2xl w-full max-w-md p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }} onClick={e => e.stopPropagation()}>
              <div className="text-base font-bold mb-4">Z-отчёт по смене</div>
              <div className="p-4 rounded-lg mb-4" style={{ background: "var(--bg)" }}>
                <div className="text-xs font-bold mb-2">{activeShift.shift_number}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div style={{ color: "var(--t3)" }}>Открыта:</div><div>{new Date(activeShift.opened_at).toLocaleString("ru-RU")}</div>
                  <div style={{ color: "var(--t3)" }}>На начало:</div><div>{fmtMoney(Number(activeShift.opening_cash))} ₸</div>
                  <div style={{ color: "var(--t3)" }}>Чеков:</div><div className="font-bold">{shiftReceipts.length}</div>
                  <div style={{ color: "var(--t3)" }}>Продаж:</div><div className="font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalSales)} ₸</div>
                  <div style={{ color: "var(--t3)" }}>В т.ч. наличными:</div><div>{fmtMoney(cashSales)} ₸</div>
                  <div style={{ color: "var(--t3)" }}>Картой:</div><div>{fmtMoney(totalSales - cashSales)} ₸</div>
                  <div style={{ color: "var(--t3)" }}>Должно быть в кассе:</div><div className="font-bold">{fmtMoney(Number(activeShift.opening_cash) + cashSales)} ₸</div>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Фактически в кассе на конец смены (₸)</label>
                <input type="number" value={closingCash} onChange={e => setClosingCash(e.target.value)} autoFocus />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCloseShift(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
                <button onClick={closeShift} className="px-5 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#EF4444" }}>Закрыть смену</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Receipt print modal */}
      {showReceiptPrint && lastReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowReceiptPrint(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-2xl w-full max-w-md p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }} onClick={e => e.stopPropagation()}>
            <div className="text-base font-bold mb-4">✅ Чек проведён!</div>
            <div className="p-4 rounded-lg mb-4" style={{ background: "var(--bg)" }}>
              <div className="text-center text-2xl font-bold mb-2">{fmtMoney(Number(lastReceipt.total_with_nds))} ₸</div>
              <div className="text-center text-xs" style={{ color: "var(--t3)" }}>{lastReceipt.receipt_number}</div>
              {Number(lastReceipt.change_amount) > 0 && (
                <div className="mt-3 p-2 rounded text-center" style={{ background: "#F59E0B20" }}>
                  <div className="text-xs" style={{ color: "var(--t3)" }}>Сдача</div>
                  <div className="text-lg font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(Number(lastReceipt.change_amount))} ₸</div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={printReceipt} className="flex-1 px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>🖨 Распечатать</button>
              <button onClick={() => setShowReceiptPrint(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ КАССА ═══ */}
      {tab === "register" && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 380px" }}>
          {/* Left: products & search */}
          <div className="flex flex-col gap-3">
            {/* Barcode scanner */}
            <form onSubmit={handleBarcodeSubmit} className="rounded-xl p-3 flex gap-2" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <input ref={barcodeRef} value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)}
                placeholder="📷 Отсканируйте штрихкод или введите название/SKU..."
                style={{ flex: 1, fontSize: 16, padding: "10px 14px" }} autoFocus />
              <button type="submit" className="px-5 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ В чек</button>
            </form>

            {/* Search */}
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 Быстрый поиск товаров..." />

            {/* Product grid */}
            <div className="grid grid-cols-4 gap-2">
              {filteredProducts.length === 0 ? (
                <div className="col-span-4 text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет товаров. Добавьте на вкладке «Товары».</div>
              ) : filteredProducts.map(p => {
                const stock = Number(p.quantity);
                const lowStock = stock <= 0;
                return (
                  <button key={p.id} onClick={() => !lowStock && addToCart(p)} disabled={lowStock}
                    className="rounded-lg p-3 text-left cursor-pointer transition-all"
                    style={{
                      background: lowStock ? "var(--bg)" : "var(--card)",
                      border: "1px solid var(--brd)",
                      opacity: lowStock ? 0.5 : 1,
                      cursor: lowStock ? "not-allowed" : "pointer",
                    }}>
                    <div className="text-xs font-bold mb-1" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>{fmtMoney(Number(p.retail_price || p.price))} ₸</div>
                    <div className="text-[10px] mt-1" style={{ color: lowStock ? "#EF4444" : "var(--t3)" }}>
                      {lowStock ? "❌ Нет в наличии" : `${stock} ${p.unit}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: cart */}
          <div className="rounded-xl p-4 flex flex-col" style={{ background: "var(--card)", border: "1px solid var(--brd)", height: "calc(100vh - 220px)" }}>
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm font-bold">🛒 Чек</div>
              {cart.length > 0 && <button onClick={clearCart} className="text-xs cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>Очистить</button>}
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 mb-3" style={{ minHeight: 100 }}>
              {cart.length === 0 ? (
                <div className="text-center py-8 text-xs" style={{ color: "var(--t3)" }}>Корзина пуста.<br />Отсканируйте штрихкод или выберите товар.</div>
              ) : cart.map(item => (
                <div key={item.product_id} className="rounded-lg p-2" style={{ background: "var(--bg)" }}>
                  <div className="flex justify-between mb-1">
                    <div className="text-xs font-semibold" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    <button onClick={() => removeFromCart(item.product_id)} className="text-sm cursor-pointer border-none bg-transparent ml-2" style={{ color: "#EF4444" }}>×</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateCartQty(item.product_id, item.quantity - 1)} className="w-7 h-7 rounded cursor-pointer border-none" style={{ background: "var(--brd)", color: "var(--t1)" }}>−</button>
                    <input type="number" value={item.quantity} onChange={e => updateCartQty(item.product_id, Number(e.target.value))} style={{ width: 60, textAlign: "center", padding: "4px 6px" }} />
                    <button onClick={() => updateCartQty(item.product_id, item.quantity + 1)} className="w-7 h-7 rounded cursor-pointer border-none" style={{ background: "var(--brd)", color: "var(--t1)" }}>+</button>
                    <span className="text-[11px]" style={{ color: "var(--t3)" }}>× {fmtMoney(item.price)}</span>
                    <span className="ml-auto text-xs font-bold">{fmtMoney(item.sum)} ₸</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-3" style={{ borderColor: "var(--brd)" }}>
              <div className="flex justify-between text-xs mb-1" style={{ color: "var(--t3)" }}>
                <span>В т.ч. НДС {TAX.NDS * 100}%:</span>
                <span>{fmtMoney(cartNDS)} ₸</span>
              </div>
              <div className="flex justify-between text-lg font-bold mb-3">
                <span>Итого:</span>
                <span>{fmtMoney(cartTotal)} ₸</span>
              </div>

              <div className="flex gap-1 mb-3">
                {([["cash", "💵 Наличные"], ["card", "💳 Карта"]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setPaymentMethod(key)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{ background: paymentMethod === key ? "var(--accent)" : "transparent", color: paymentMethod === key ? "#fff" : "var(--t3)", border: paymentMethod === key ? "none" : "1px solid var(--brd)" }}>
                    {label}
                  </button>
                ))}
              </div>

              {paymentMethod === "cash" && (
                <>
                  <div className="mb-2">
                    <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Получено наличными</label>
                    <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder={String(cartTotal)} />
                  </div>
                  {Number(cashReceived) >= cartTotal && cartTotal > 0 && (
                    <div className="flex justify-between mb-2 p-2 rounded" style={{ background: "#F59E0B20" }}>
                      <span className="text-xs font-semibold" style={{ color: "#F59E0B" }}>Сдача:</span>
                      <span className="text-sm font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(change)} ₸</span>
                    </div>
                  )}
                </>
              )}

              <button onClick={processPayment} disabled={!canPay || !activeShift}
                className="w-full py-3 rounded-xl text-white font-bold text-sm border-none cursor-pointer disabled:opacity-50"
                style={{ background: canPay && activeShift ? "#10B981" : "var(--brd)" }}>
                {!activeShift ? "Откройте смену" : canPay ? `✓ Оплатить ${fmtMoney(cartTotal)} ₸` : "Добавьте товары"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ СМЕНЫ ═══ */}
      {tab === "shifts" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["Смена", "Открыта", "Закрыта", "Чеков", "Наличные", "Карта", "Итого", "Статус"].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет смен</td></tr>
              ) : shifts.map(s => (
                <tr key={s.id}>
                  <td className="p-2.5 text-[12px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{s.shift_number}</td>
                  <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{new Date(s.opened_at).toLocaleString("ru-RU")}</td>
                  <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{s.closed_at ? new Date(s.closed_at).toLocaleString("ru-RU") : "—"}</td>
                  <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{s.total_receipts || 0}</td>
                  <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(s.cash_sales || 0))} ₸</td>
                  <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(s.card_sales || 0))} ₸</td>
                  <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(s.total_sales || 0))} ₸</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: s.status === "open" ? "#10B98120" : "#6B728020", color: s.status === "open" ? "#10B981" : "#6B7280" }}>
                      {s.status === "open" ? "● Открыта" : "Закрыта"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ЧЕКИ ═══ */}
      {tab === "receipts" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["№ чека", "Дата", "Позиций", "Способ", "Сумма", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет чеков</td></tr>
              ) : receipts.map(r => (
                <tr key={r.id}>
                  <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{r.receipt_number}</td>
                  <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{new Date(r.receipt_date).toLocaleString("ru-RU")}</td>
                  <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{(r.items as any[])?.length || 0}</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: r.payment_method === "cash" ? "#10B98120" : "#3B82F620", color: r.payment_method === "cash" ? "#10B981" : "#3B82F6" }}>
                      {r.payment_method === "cash" ? "💵 Наличные" : "💳 Карта"}
                    </span>
                  </td>
                  <td className="p-2.5 text-[13px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(r.total_with_nds))} ₸</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <button onClick={() => { setLastReceipt(r); setShowReceiptPrint(true); }} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>Печать</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ТОВАРЫ ═══ */}
      {tab === "products" && (
        <>
          <div className="text-xs" style={{ color: "var(--t3)" }}>
            Управление товарами для розничных продаж • Назначьте штрихкоды и розничные цены
          </div>

          {editProduct && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Редактировать товар: {editProduct.name}</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование</label><input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ед. изм.</label><input value={editForm.unit} onChange={e => setEditForm({ ...editForm, unit: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>📷 Штрихкод</label><input value={editForm.barcode} onChange={e => setEditForm({ ...editForm, barcode: e.target.value })} placeholder="EAN-13" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>SKU / Артикул</label><input value={editForm.sku} onChange={e => setEditForm({ ...editForm, sku: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Закупочная цена</label><input type="number" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>💰 Розничная цена</label><input type="number" value={editForm.retail_price} onChange={e => setEditForm({ ...editForm, retail_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Остаток</label><input type="number" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Мин. остаток</label><input type="number" value={editForm.min_quantity} onChange={e => setEditForm({ ...editForm, min_quantity: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveProduct} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => setEditProduct(null)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Товар", "Штрихкод", "SKU", "Закуп. цена", "Розничная", "Маржа", "Остаток", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет товаров. Добавьте через модуль «Склад».</td></tr>
                ) : products.map(p => {
                  const purchase = Number(p.price);
                  const retail = Number(p.retail_price || p.price);
                  const margin = retail > 0 && purchase > 0 ? Math.round(((retail - purchase) / purchase) * 100) : 0;
                  return (
                    <tr key={p.id}>
                      <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{p.name}</td>
                      <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.barcode || "—"}</td>
                      <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.sku || "—"}</td>
                      <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(purchase)} ₸</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(retail)} ₸</td>
                      <td className="p-2.5 text-[12px] text-right" style={{ color: margin > 0 ? "#10B981" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{margin > 0 ? "+" : ""}{margin}%</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{p.quantity} {p.unit}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => startEditProduct(p)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>Изменить</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
