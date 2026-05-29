"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney, TAX } from "@/lib/tax2026";

type Tab = "sale" | "purchase";

const STATUSES = {
  new: { name: "Новый", color: "#6B7280" },
  confirmed: { name: "Подтверждён", color: "#3B82F6" },
  in_progress: { name: "В работе", color: "#F59E0B" },
  shipped: { name: "Отгружен", color: "#A855F7" },
  delivered: { name: "Доставлен", color: "#10B981" },
  cancelled: { name: "Отменён", color: "#EF4444" },
  closed: { name: "Закрыт", color: "#6366F1" },
};

interface OrderItem {
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

export default function OrdersPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("sale");
  const [orders, setOrders] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [nomenclature, setNomenclature] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Filter
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [viewingOrder, setViewingOrder] = useState<any>(null);

  const emptyForm = {
    order_number: "",
    order_date: new Date().toISOString().slice(0, 10),
    counterparty_id: "",
    counterparty_name: "",
    counterparty_bin: "",
    company_id: "",
    contract_id: "",
    contract_number: "",
    expected_date: "",
    delivery_address: "",
    payment_terms: "",
    responsible_name: "",
    notes: "",
    status: "new",
  };
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [reserveStock, setReserveStock] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [o, cp, comp, ctr, n, r, d] = await Promise.all([
      supabase.from("orders").select("*").eq("user_id", user.id).order("order_date", { ascending: false }),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
      supabase.from("user_companies").select("*").eq("user_id", user.id),
      supabase.from("contracts").select("*").eq("user_id", user.id).eq("status", "active"),
      supabase.from("nomenclature").select("*").eq("user_id", user.id),
      supabase.from("stock_reservations").select("*").eq("user_id", user.id).is("released_at", null),
      supabase.from("documents").select("*").eq("user_id", user.id),
    ]);
    setOrders(o.data || []);
    setCounterparties(cp.data || []);
    setCompanies(comp.data || []);
    setContracts(ctr.data || []);
    setNomenclature(n.data || []);
    setReservations(r.data || []);
    setDocs(d.data || []);
  }

  function startCreate(orderType: Tab) {
    setEditingOrder(null);
    const prefix = orderType === "sale" ? "ЗП" : "ЗПС";
    const num = `${prefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setForm({ ...emptyForm, order_number: num });
    setItems([]);
    setReserveStock(orderType === "sale");
    setShowForm(true);
  }

  function startEdit(o: any) {
    setEditingOrder(o);
    setForm({
      order_number: o.order_number,
      order_date: o.order_date,
      counterparty_id: o.counterparty_id || "",
      counterparty_name: o.counterparty_name,
      counterparty_bin: o.counterparty_bin || "",
      company_id: o.company_id || "",
      contract_id: o.contract_id || "",
      contract_number: o.contract_number || "",
      expected_date: o.expected_date || "",
      delivery_address: o.delivery_address || "",
      payment_terms: o.payment_terms || "",
      responsible_name: o.responsible_name || "",
      notes: o.notes || "",
      status: o.status,
    });
    setItems(o.items || []);
    setReserveStock(!!o.is_reserved);
    setShowForm(true);
  }

  function selectCounterparty(id: string) {
    const cp = counterparties.find(x => x.id === id);
    if (cp) setForm({ ...form, counterparty_id: id, counterparty_name: cp.name, counterparty_bin: cp.bin || "" });
    else setForm({ ...form, counterparty_id: "" });
  }

  function selectContract(id: string) {
    const c = contracts.find(x => x.id === id);
    if (c) setForm({ ...form, contract_id: id, contract_number: c.contract_number });
    else setForm({ ...form, contract_id: "", contract_number: "" });
  }

  function addItem() {
    setItems([...items, { nomenclature_id: "", name: "", unit: "шт", quantity: 1, price: 0, nds_rate: 16, sum: 0, nds_sum: 0, total: 0 }]);
  }

  function selectItem(i: number, nomId: string) {
    const n = nomenclature.find(x => x.id === nomId);
    if (!n) return;
    const it = [...items];
    const price = tab === "sale" ? Number(n.retail_price || n.base_price || 0) : Number(n.purchase_price || 0);
    const ndsRate = Number(n.vat_rate || 16);
    const sum = 1 * price;
    const ndsSum = Math.round(sum * ndsRate / (100 + ndsRate));
    it[i] = {
      nomenclature_id: nomId,
      name: n.name,
      unit: n.unit,
      quantity: 1,
      price,
      nds_rate: ndsRate,
      sum: sum - ndsSum,
      nds_sum: ndsSum,
      total: sum,
    };
    setItems(it);
  }

  function updateItem(i: number, field: string, value: any) {
    const it = [...items];
    it[i] = { ...it[i], [field]: value };
    if (field === "quantity" || field === "price" || field === "nds_rate") {
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

  async function saveOrder() {
    if (!form.counterparty_name) { setMsg("❌ Укажите контрагента"); setTimeout(() => setMsg(""), 3000); return; }
    if (items.length === 0) { setMsg("❌ Добавьте хотя бы одну позицию"); setTimeout(() => setMsg(""), 3000); return; }

    const company = companies.find(c => c.id === form.company_id);
    const data = {
      user_id: userId,
      order_type: tab,
      order_number: form.order_number,
      order_date: form.order_date,
      counterparty_id: form.counterparty_id || null,
      counterparty_name: form.counterparty_name,
      counterparty_bin: form.counterparty_bin || null,
      company_id: form.company_id || null,
      company_name: company?.company_name || null,
      contract_id: form.contract_id || null,
      contract_number: form.contract_number || null,
      expected_date: form.expected_date || null,
      delivery_address: form.delivery_address || null,
      payment_terms: form.payment_terms || null,
      responsible_name: form.responsible_name || null,
      notes: form.notes || null,
      status: form.status,
      items,
      total_amount: totals.sum,
      nds_amount: totals.nds,
      total_with_nds: totals.total,
      is_reserved: tab === "sale" ? reserveStock : false,
      updated_at: new Date().toISOString(),
    };

    let orderId: string;
    if (editingOrder) {
      await supabase.from("orders").update(data).eq("id", editingOrder.id);
      orderId = editingOrder.id;
      // Удалить старые резервы
      await supabase.from("stock_reservations").delete().eq("order_id", orderId);
    } else {
      const { data: created } = await supabase.from("orders").insert(data).select().single();
      orderId = created.id;
    }

    // Резервирование товаров (только для заказов покупателей)
    if (tab === "sale" && reserveStock) {
      const reservs = items.filter(it => it.nomenclature_id).map(it => ({
        user_id: userId,
        order_id: orderId,
        nomenclature_id: it.nomenclature_id,
        product_name: it.name,
        quantity: it.quantity,
        unit: it.unit,
      }));
      if (reservs.length > 0) await supabase.from("stock_reservations").insert(reservs);
    }

    setMsg(`✅ Заказ ${form.order_number} ${editingOrder ? "обновлён" : "создан"}${tab === "sale" && reserveStock ? " (товары зарезервированы)" : ""}`);
    setShowForm(false);
    setEditingOrder(null);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function deleteOrder(id: string) {
    if (!confirm("Удалить заказ? Резервы товаров будут сняты.")) return;
    await supabase.from("stock_reservations").delete().eq("order_id", id);
    await supabase.from("orders").delete().eq("id", id);
    if (viewingOrder?.id === id) setViewingOrder(null);
    load();
  }

  async function changeStatus(id: string, status: string) {
    const update: any = { status, updated_at: new Date().toISOString() };
    if (status === "delivered") update.delivered_date = new Date().toISOString().slice(0, 10);
    if (status === "cancelled" || status === "closed") {
      // Снимаем резервы
      await supabase.from("stock_reservations").update({ released_at: new Date().toISOString() }).eq("order_id", id).is("released_at", null);
    }
    await supabase.from("orders").update(update).eq("id", id);
    load();
  }

  async function createDocFromOrder(order: any) {
    // Создать документ реализации/поступления на основе заказа
    const docType = order.order_type === "sale" ? "sf" : "receipt";
    const docNumber = order.order_type === "sale" ? `СФ-${Date.now()}` : `ПОСТ-${Date.now()}`;

    const { data: doc } = await supabase.from("documents").insert({
      user_id: userId,
      doc_number: docNumber,
      doc_date: new Date().toISOString().slice(0, 10),
      doc_type: docType,
      counterparty_id: order.counterparty_id,
      counterparty_name: order.counterparty_name,
      counterparty_bin: order.counterparty_bin,
      company_id: order.company_id,
      contract_id: order.contract_id,
      order_id: order.id,
      total_sum: order.total_amount,
      nds_sum: order.nds_amount,
      total_with_nds: order.total_with_nds,
      status: "draft",
      items: order.items,
    }).select().single();

    // Изменить статус заказа на "Отгружен"/"Доставлен"
    if (order.order_type === "sale") {
      await supabase.from("orders").update({ status: "shipped" }).eq("id", order.id);
    } else {
      await supabase.from("orders").update({ status: "delivered", delivered_date: new Date().toISOString().slice(0, 10) }).eq("id", order.id);
    }

    setMsg(`✅ Создан документ ${docNumber}. Откройте его в модуле «Документы» для проведения.`);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  // Reservation info
  function getReservedQty(nomId: string): number {
    return reservations.filter(r => r.nomenclature_id === nomId).reduce((a, r) => a + Number(r.quantity), 0);
  }

  // Filter
  const filteredOrders = orders.filter(o => {
    if (o.order_type !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.order_number.toLowerCase().includes(q) && !o.counterparty_name.toLowerCase().includes(q)) return false;
    }
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    return true;
  });

  // KPI
  const tabOrders = orders.filter(o => o.order_type === tab);
  const totalActive = tabOrders.filter(o => !["cancelled", "closed", "delivered"].includes(o.status)).length;
  const totalAmount = tabOrders.filter(o => !["cancelled"].includes(o.status)).reduce((a, o) => a + Number(o.total_with_nds), 0);
  const totalShipped = tabOrders.filter(o => o.status === "shipped" || o.status === "delivered").length;
  const totalReserved = reservations.length;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Заказы покупателей (от клиентов нам) и заказы поставщикам (от нас поставщикам). С резервированием на складе и автоматическим созданием документов реализации/поступления.
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        <button onClick={() => { setTab("sale"); setFilterStatus("all"); setShowForm(false); setViewingOrder(null); }}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "sale" ? "#10B981" : "transparent", color: tab === "sale" ? "#fff" : "var(--t3)", border: tab === "sale" ? "none" : "1px solid var(--brd)" }}>
          📥 Заказы покупателей ({orders.filter(o => o.order_type === "sale").length})
        </button>
        <button onClick={() => { setTab("purchase"); setFilterStatus("all"); setShowForm(false); setViewingOrder(null); }}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "purchase" ? "#3B82F6" : "transparent", color: tab === "purchase" ? "#fff" : "var(--t3)", border: tab === "purchase" ? "none" : "1px solid var(--brd)" }}>
          📤 Заказы поставщикам ({orders.filter(o => o.order_type === "purchase").length})
        </button>
        <button onClick={() => startCreate(tab)} className="ml-auto px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новый заказ</button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⏳ Активных</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{totalActive}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{tab === "sale" ? "К отгрузке" : "Ожидаем"}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Сумма</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalAmount)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По всем заказам</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>{tab === "sale" ? "🚚 Отгружено" : "📦 Получено"}</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{totalShipped}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>{tab === "sale" ? "🔒 Резервов" : "📋 Всего"}</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{tab === "sale" ? totalReserved : tabOrders.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{tab === "sale" ? "Зарезерв. позиций" : "Заказов"}</div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">
            {editingOrder ? "Редактирование" : "Новый"} {tab === "sale" ? "заказ покупателя" : "заказ поставщику"}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ заказа *</label><input value={form.order_number} onChange={e => setForm({ ...form, order_number: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>{tab === "sale" ? "Срок отгрузки" : "Ожидаемое поступление"}</label><input type="date" value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} /></div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>{tab === "sale" ? "Покупатель" : "Поставщик"} *</label>
              <select value={form.counterparty_id} onChange={e => selectCounterparty(e.target.value)}>
                <option value="">— Выбрать или ввести имя ниже —</option>
                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name} {c.bin ? `(${c.bin})` : ""}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наша организация</label>
              <select value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })}>
                <option value="">— Не указана —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_short_name || c.company_name}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование контрагента</label><input value={form.counterparty_name} onChange={e => setForm({ ...form, counterparty_name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>БИН</label><input value={form.counterparty_bin} onChange={e => setForm({ ...form, counterparty_bin: e.target.value.replace(/\D/g, "").slice(0, 12) })} /></div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Договор (привязка)</label>
              <select value={form.contract_id} onChange={e => selectContract(e.target.value)}>
                <option value="">— Без привязки —</option>
                {contracts.filter(c => !form.counterparty_id || c.counterparty_id === form.counterparty_id).map(c => <option key={c.id} value={c.id}>{c.contract_number} от {c.contract_date}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Статус</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
            </div>
          </div>

          {tab === "sale" && (
            <div className="mb-3 p-3 rounded-lg" style={{ background: "#F59E0B10", border: "1px solid #F59E0B30" }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={reserveStock} onChange={e => setReserveStock(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span className="text-xs"><b>🔒 Зарезервировать товары на складе</b> — при подтверждении заказа эти позиции не будут доступны для других продаж</span>
              </label>
            </div>
          )}

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#6366F1" }}>📦 ПОЗИЦИИ ЗАКАЗА</div>
          <div className="rounded-lg p-2 mb-3" style={{ background: "var(--bg)" }}>
            {items.length === 0 && <div className="text-xs py-3 text-center" style={{ color: "var(--t3)" }}>Добавьте позиции из номенклатуры</div>}
            {items.map((it, i) => {
              const reservedQty = it.nomenclature_id ? getReservedQty(it.nomenclature_id) : 0;
              const nom = nomenclature.find(n => n.id === it.nomenclature_id);
              const available = nom ? Math.max(0, Number(nom.quantity) - reservedQty) : 0;
              return (
                <div key={i} className="rounded-lg p-2 mb-1.5" style={{ background: "var(--card)" }}>
                  <div className="grid items-end gap-2" style={{ gridTemplateColumns: "1fr 80px 60px 110px 80px 110px 30px" }}>
                    <div>
                      {i === 0 && <div className="text-[9px] mb-1" style={{ color: "var(--t3)" }}>Позиция номенклатуры</div>}
                      <select value={it.nomenclature_id} onChange={e => selectItem(i, e.target.value)} style={{ fontSize: 11 }}>
                        <option value="">— Выбрать —</option>
                        {nomenclature.map(n => <option key={n.id} value={n.id}>{n.name} ({n.unit}) {tab === "sale" ? `Доступно: ${Math.max(0, Number(n.quantity) - getReservedQty(n.id))}` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      {i === 0 && <div className="text-[9px] mb-1" style={{ color: "var(--t3)" }}>Кол-во</div>}
                      <input type="number" step="0.001" value={it.quantity} onChange={e => updateItem(i, "quantity", Number(e.target.value))} style={{ fontSize: 11 }} />
                    </div>
                    <div className="text-[10px] pb-2 text-center" style={{ color: "var(--t3)" }}>{it.unit}</div>
                    <div>
                      {i === 0 && <div className="text-[9px] mb-1" style={{ color: "var(--t3)" }}>Цена</div>}
                      <input type="number" step="0.01" value={it.price} onChange={e => updateItem(i, "price", Number(e.target.value))} style={{ fontSize: 11 }} />
                    </div>
                    <div>
                      {i === 0 && <div className="text-[9px] mb-1" style={{ color: "var(--t3)" }}>НДС%</div>}
                      <select value={it.nds_rate} onChange={e => updateItem(i, "nds_rate", Number(e.target.value))} style={{ fontSize: 11 }}>
                        <option value="16">16%</option>
                        <option value="10">10%</option>
                        <option value="5">5%</option>
                        <option value="0">0%</option>
                      </select>
                    </div>
                    <div className="text-right text-xs pb-1.5 font-bold" style={{ color: "var(--accent)" }}>
                      {fmtMoney(it.total)} ₸
                    </div>
                    <button onClick={() => removeItem(i)} className="text-sm cursor-pointer border-none bg-transparent pb-2" style={{ color: "#EF4444" }}>×</button>
                  </div>
                  {tab === "sale" && nom && it.quantity > available && (
                    <div className="text-[10px] mt-1" style={{ color: "#EF4444" }}>⚠ На складе доступно только {available} {it.unit}</div>
                  )}
                </div>
              );
            })}
            <button onClick={addItem} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить позицию</button>
          </div>

          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-3 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Сумма без НДС</div><div className="text-sm font-bold">{fmtMoney(totals.sum)} ₸</div></div>
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>НДС</div><div className="text-sm font-bold" style={{ color: "#EC4899" }}>{fmtMoney(totals.nds)} ₸</div></div>
              <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Итого с НДС</div><div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(totals.total)} ₸</div></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Адрес доставки</label><input value={form.delivery_address} onChange={e => setForm({ ...form, delivery_address: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Условия оплаты</label><input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ответственный</label><input value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div className="flex gap-2">
            <button onClick={saveOrder} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 {editingOrder ? "Сохранить" : "Создать заказ"}</button>
            <button onClick={() => { setShowForm(false); setEditingOrder(null); }} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewingOrder && (() => {
        const s = STATUSES[viewingOrder.status as keyof typeof STATUSES];
        const linkedDocs = docs.filter(d => d.order_id === viewingOrder.id);
        const paidAmount = linkedDocs.filter(d => d.status === "done").reduce((a, d) => a + Number(d.total_with_nds || 0), 0);
        const balance = Number(viewingOrder.total_with_nds) - paidAmount;
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold">{viewingOrder.order_number}</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: s.color + "20", color: s.color }}>{s.name}</span>
                  {viewingOrder.is_reserved && <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>🔒 Резерв</span>}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--t3)" }}>
                  {viewingOrder.order_type === "sale" ? "Заказ покупателя" : "Заказ поставщику"} от {viewingOrder.order_date}
                </div>
              </div>
              <div className="flex gap-2">
                {!["delivered", "cancelled", "closed"].includes(viewingOrder.status) && linkedDocs.length === 0 && (
                  <button onClick={() => createDocFromOrder(viewingOrder)} className="text-[11px] px-3 py-1.5 rounded-lg text-white font-semibold cursor-pointer border-none" style={{ background: "#10B981" }}>
                    📄 Создать {viewingOrder.order_type === "sale" ? "счёт-фактуру" : "поступление"}
                  </button>
                )}
                <button onClick={() => setViewingOrder(null)} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Закрыть</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>{viewingOrder.order_type === "sale" ? "ПОКУПАТЕЛЬ" : "ПОСТАВЩИК"}</div>
                <div className="text-sm font-bold">{viewingOrder.counterparty_name}</div>
                {viewingOrder.counterparty_bin && <div className="text-[11px]" style={{ color: "var(--t3)" }}>БИН: {viewingOrder.counterparty_bin}</div>}
                {viewingOrder.contract_number && <div className="text-[11px] mt-1"><span style={{ color: "var(--t3)" }}>Договор:</span> {viewingOrder.contract_number}</div>}
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>СРОКИ</div>
                <div className="text-sm">
                  {viewingOrder.expected_date && <div><span style={{ color: "var(--t3)" }}>{viewingOrder.order_type === "sale" ? "Срок отгрузки:" : "Ожидается:"}</span> <b>{viewingOrder.expected_date}</b></div>}
                  {viewingOrder.delivered_date && <div><span style={{ color: "var(--t3)" }}>Доставлен:</span> <b style={{ color: "#10B981" }}>{viewingOrder.delivered_date}</b></div>}
                </div>
                {viewingOrder.responsible_name && <div className="text-[11px] mt-1"><span style={{ color: "var(--t3)" }}>Ответственный:</span> {viewingOrder.responsible_name}</div>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg p-3" style={{ background: "#6366F110", border: "1px solid #6366F130" }}>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>СУММА ЗАКАЗА</div>
                <div className="text-sm font-bold" style={{ color: "#6366F1" }}>{fmtMoney(Number(viewingOrder.total_with_nds))} ₸</div>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>в т.ч. НДС {fmtMoney(Number(viewingOrder.nds_amount))} ₸</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "#10B98110", border: "1px solid #10B98130" }}>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>{viewingOrder.order_type === "sale" ? "ОТГРУЖЕНО / ОПЛАЧЕНО" : "ПОЛУЧЕНО / ОПЛАЧЕНО"}</div>
                <div className="text-sm font-bold" style={{ color: "#10B981" }}>{fmtMoney(paidAmount)} ₸</div>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>По связанным документам</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: balance > 0 ? "#EF444410" : "#10B98110", border: `1px solid ${balance > 0 ? "#EF444430" : "#10B98130"}` }}>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>ОСТАТОК</div>
                <div className="text-sm font-bold" style={{ color: balance > 0 ? "#EF4444" : "#10B981" }}>{fmtMoney(balance)} ₸</div>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>{balance > 0 ? "К отгрузке/оплате" : "Полностью"}</div>
              </div>
            </div>

            <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t3)" }}>📦 ПОЗИЦИИ ({(viewingOrder.items || []).length})</div>
            <div className="rounded-lg mb-3" style={{ background: "var(--bg)" }}>
              <table>
                <thead><tr>{["Наименование", "Кол.", "Ед.", "Цена", "Сумма"].map(h => (
                  <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)" }}>{h}</th>
                ))}</tr></thead>
                <tbody>{(viewingOrder.items || []).map((it: any, i: number) => (
                  <tr key={i}>
                    <td className="p-2 text-[12px]">{it.name}</td>
                    <td className="p-2 text-[12px]">{it.quantity}</td>
                    <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>{it.unit}</td>
                    <td className="p-2 text-[12px]">{fmtMoney(Number(it.price))}</td>
                    <td className="p-2 text-[12px] font-bold text-right">{fmtMoney(Number(it.total))} ₸</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            {linkedDocs.length > 0 && (
              <>
                <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t3)" }}>📄 СВЯЗАННЫЕ ДОКУМЕНТЫ</div>
                <div className="rounded-lg" style={{ background: "var(--bg)" }}>
                  <table>
                    <tbody>{linkedDocs.map(d => (
                      <tr key={d.id}>
                        <td className="p-2 text-[12px] font-mono" style={{ color: "var(--accent)" }}>{d.doc_number}</td>
                        <td className="p-2 text-[12px]">{d.doc_type}</td>
                        <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>{d.doc_date}</td>
                        <td className="p-2 text-[12px] text-right font-bold">{fmtMoney(Number(d.total_with_nds))} ₸</td>
                        <td className="p-2"><span className="text-[10px] px-2 py-0.5 rounded" style={{ background: d.status === "done" ? "#10B98120" : "#6B728020", color: d.status === "done" ? "#10B981" : "#6B7280" }}>{d.status === "done" ? "Проведён" : "Черновик"}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Filters and list */}
      {!showForm && !viewingOrder && (
        <>
          <div className="flex gap-3 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Поиск: номер, контрагент..." style={{ flex: 1 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 200 }}>
              <option value="all">Все статусы</option>
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№", "Дата", "Контрагент", "Срок", "Сумма", "Резерв", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>{tabOrders.length === 0 ? "Нет заказов. Создайте первый." : "Ничего не найдено"}</td></tr>
                ) : filteredOrders.map(o => {
                  const s = STATUSES[o.status as keyof typeof STATUSES];
                  return (
                    <tr key={o.id}>
                      <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{o.order_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.order_date}</td>
                      <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {o.counterparty_name}
                        {o.contract_number && <div className="text-[10px]" style={{ color: "var(--t3)" }}>📑 {o.contract_number}</div>}
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.expected_date || "—"}</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.total_with_nds))} ₸</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {o.is_reserved && <span className="text-[10px] font-semibold" style={{ color: "#F59E0B" }}>🔒</span>}
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <select value={o.status} onChange={e => changeStatus(o.id, e.target.value)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: s.color + "20", color: s.color, border: "none" }}>
                          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                        </select>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => setViewingOrder(o)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>👁</button>
                        <button onClick={() => startEdit(o)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>✏</button>
                        <button onClick={() => deleteOrder(o.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
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
