"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "specs" | "orders" | "outputs" | "analytics";

interface Component {
  product_id: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  sum: number;
}

export default function ProductionPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("specs");
  const [specs, setSpecs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [outputs, setOutputs] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Spec form
  const [showSpecForm, setShowSpecForm] = useState(false);
  const [specForm, setSpecForm] = useState({
    spec_number: "",
    product_name: "",
    product_id: "",
    output_quantity: "1",
    output_unit: "шт",
    labor_cost: "0",
    overhead_cost: "0",
    description: "",
  });
  const [components, setComponents] = useState<Component[]>([]);
  const [editingSpec, setEditingSpec] = useState<any>(null);

  // Order form
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({
    order_number: "",
    order_date: new Date().toISOString().slice(0, 10),
    spec_id: "",
    planned_quantity: "1",
    start_date: "",
    end_date: "",
    responsible_name: "",
    notes: "",
  });

  // Output form
  const [showOutputForm, setShowOutputForm] = useState(false);
  const [outputForm, setOutputForm] = useState({
    output_number: "",
    output_date: new Date().toISOString().slice(0, 10),
    order_id: "",
    quantity: "1",
    notes: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [s, o, out, p] = await Promise.all([
      supabase.from("production_specifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("production_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("production_outputs").select("*").eq("user_id", user.id).order("output_date", { ascending: false }),
      supabase.from("products").select("*").eq("user_id", user.id),
    ]);

    setSpecs(s.data || []);
    setOrders(o.data || []);
    setOutputs(out.data || []);
    setProducts(p.data || []);
  }

  // ═══ СПЕЦИФИКАЦИИ ═══
  function addComponent() {
    setComponents([...components, { product_id: "", name: "", unit: "", quantity: 1, price: 0, sum: 0 }]);
  }

  function selectComponent(i: number, productId: string) {
    const p = products.find(x => x.id === productId);
    if (p) {
      const n = [...components];
      n[i] = {
        product_id: productId,
        name: p.name,
        unit: p.unit,
        quantity: 1,
        price: Number(p.price),
        sum: Number(p.price),
      };
      setComponents(n);
    }
  }

  function updComp(i: number, field: string, value: any) {
    const n = [...components];
    n[i] = { ...n[i], [field]: value };
    if (field === "quantity" || field === "price") {
      n[i].sum = Number(n[i].quantity) * Number(n[i].price);
    }
    setComponents(n);
  }

  function removeComp(i: number) {
    setComponents(components.filter((_, idx) => idx !== i));
  }

  const materialsCost = components.reduce((a, c) => a + Number(c.sum), 0);
  const totalCost = materialsCost + Number(specForm.labor_cost || 0) + Number(specForm.overhead_cost || 0);
  const costPerUnit = Number(specForm.output_quantity || 1) > 0 ? totalCost / Number(specForm.output_quantity) : 0;

  function startCreateSpec() {
    setEditingSpec(null);
    setSpecForm({
      spec_number: `СП-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      product_name: "", product_id: "",
      output_quantity: "1", output_unit: "шт",
      labor_cost: "0", overhead_cost: "0", description: "",
    });
    setComponents([]);
    setShowSpecForm(true);
  }

  function startEditSpec(s: any) {
    setEditingSpec(s);
    setSpecForm({
      spec_number: s.spec_number,
      product_name: s.product_name,
      product_id: s.product_id || "",
      output_quantity: String(s.output_quantity),
      output_unit: s.output_unit,
      labor_cost: String(s.labor_cost),
      overhead_cost: String(s.overhead_cost),
      description: s.description || "",
    });
    setComponents(s.components || []);
    setShowSpecForm(true);
  }

  async function saveSpec() {
    if (!specForm.product_name || components.length === 0) {
      setMsg("❌ Укажите готовый продукт и хотя бы один компонент");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const data = {
      user_id: userId,
      spec_number: specForm.spec_number,
      product_name: specForm.product_name,
      product_id: specForm.product_id || null,
      output_quantity: Number(specForm.output_quantity),
      output_unit: specForm.output_unit,
      labor_cost: Number(specForm.labor_cost),
      overhead_cost: Number(specForm.overhead_cost),
      total_cost: totalCost,
      cost_per_unit: costPerUnit,
      components,
      description: specForm.description,
    };
    if (editingSpec) {
      await supabase.from("production_specifications").update(data).eq("id", editingSpec.id);
    } else {
      await supabase.from("production_specifications").insert(data);
    }
    setMsg(`✅ Спецификация ${specForm.spec_number} сохранена`);
    setShowSpecForm(false);
    setComponents([]);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteSpec(id: string) {
    if (!confirm("Удалить спецификацию?")) return;
    await supabase.from("production_specifications").delete().eq("id", id);
    load();
  }

  // ═══ ЗАКАЗЫ НА ПРОИЗВОДСТВО ═══
  function startCreateOrder() {
    setOrderForm({
      order_number: `ЗП-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      order_date: new Date().toISOString().slice(0, 10),
      spec_id: "", planned_quantity: "1",
      start_date: "", end_date: "",
      responsible_name: "", notes: "",
    });
    setShowOrderForm(true);
  }

  async function saveOrder() {
    const spec = specs.find(s => s.id === orderForm.spec_id);
    if (!spec) {
      setMsg("❌ Выберите спецификацию");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const planned = Number(orderForm.planned_quantity);
    const ratio = planned / Number(spec.output_quantity);

    await supabase.from("production_orders").insert({
      user_id: userId,
      order_number: orderForm.order_number,
      order_date: orderForm.order_date,
      spec_id: orderForm.spec_id,
      product_id: spec.product_id,
      product_name: spec.product_name,
      planned_quantity: planned,
      unit: spec.output_unit,
      start_date: orderForm.start_date || null,
      end_date: orderForm.end_date || null,
      status: "planned",
      materials_cost: Number(spec.total_cost) - Number(spec.labor_cost) - Number(spec.overhead_cost),
      labor_cost: Number(spec.labor_cost) * ratio,
      overhead_cost: Number(spec.overhead_cost) * ratio,
      total_cost: Number(spec.cost_per_unit) * planned,
      cost_per_unit: Number(spec.cost_per_unit),
      responsible_name: orderForm.responsible_name,
      notes: orderForm.notes,
    });

    setMsg(`✅ Заказ на производство ${orderForm.order_number} создан`);
    setShowOrderForm(false);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function updateOrderStatus(id: string, status: string) {
    const update: any = { status, updated_at: new Date().toISOString() };
    if (status === "in_progress" && !orders.find(o => o.id === id)?.start_date) {
      update.start_date = new Date().toISOString().slice(0, 10);
    }
    if (status === "completed") {
      update.end_date = new Date().toISOString().slice(0, 10);
    }
    await supabase.from("production_orders").update(update).eq("id", id);
    load();
  }

  async function deleteOrder(id: string) {
    if (!confirm("Удалить заказ?")) return;
    await supabase.from("production_orders").delete().eq("id", id);
    load();
  }

  // ═══ ВЫПУСК ПРОДУКЦИИ ═══
  function startCreateOutput() {
    setOutputForm({
      output_number: `ВП-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      output_date: new Date().toISOString().slice(0, 10),
      order_id: "", quantity: "1", notes: "",
    });
    setShowOutputForm(true);
  }

  async function processOutput() {
    const order = orders.find(o => o.id === outputForm.order_id);
    if (!order) {
      setMsg("❌ Выберите заказ на производство");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const spec = specs.find(s => s.id === order.spec_id);
    if (!spec) {
      setMsg("❌ Спецификация не найдена");
      setTimeout(() => setMsg(""), 3000);
      return;
    }

    const qty = Number(outputForm.quantity);
    const ratio = qty / Number(spec.output_quantity);

    // Расчёт расхода материалов
    const consumedMaterials = (spec.components || []).map((c: any) => ({
      product_id: c.product_id,
      name: c.name,
      unit: c.unit,
      quantity: Number(c.quantity) * ratio,
      price: Number(c.price),
      sum: Number(c.sum) * ratio,
    }));

    const materialsCost = consumedMaterials.reduce((a: number, m: any) => a + m.sum, 0);
    const laborCost = Number(spec.labor_cost) * ratio;
    const overheadCost = Number(spec.overhead_cost) * ratio;
    const totalCost = materialsCost + laborCost + overheadCost;

    // Списать материалы со склада
    for (const m of consumedMaterials) {
      if (m.product_id) {
        const product = products.find(p => p.id === m.product_id);
        if (product) {
          await supabase.from("products").update({
            quantity: Math.max(0, Number(product.quantity) - m.quantity),
          }).eq("id", m.product_id);
        }
      }
    }

    // Оприходовать готовую продукцию
    if (order.product_id) {
      const product = products.find(p => p.id === order.product_id);
      if (product) {
        await supabase.from("products").update({
          quantity: Number(product.quantity) + qty,
        }).eq("id", order.product_id);
      }
    } else {
      await supabase.from("products").insert({
        user_id: userId,
        name: order.product_name,
        unit: order.unit,
        price: Number(spec.cost_per_unit),
        quantity: qty,
        category: "finished_product",
      });
    }

    // Сохранить запись о выпуске
    await supabase.from("production_outputs").insert({
      user_id: userId,
      output_number: outputForm.output_number,
      output_date: outputForm.output_date,
      order_id: orderForm.order_id || order.id,
      spec_id: spec.id,
      product_id: order.product_id,
      product_name: order.product_name,
      quantity: qty,
      unit: order.unit,
      consumed_materials: consumedMaterials,
      materials_cost: materialsCost,
      labor_cost: laborCost,
      overhead_cost: overheadCost,
      total_cost: totalCost,
      cost_per_unit: Number(spec.cost_per_unit),
      notes: outputForm.notes,
    });

    // Обновить заказ
    const newProduced = Number(order.produced_quantity) + qty;
    await supabase.from("production_orders").update({
      produced_quantity: newProduced,
      status: newProduced >= Number(order.planned_quantity) ? "completed" : "in_progress",
      end_date: newProduced >= Number(order.planned_quantity) ? new Date().toISOString().slice(0, 10) : null,
    }).eq("id", order.id);

    // Бухгалтерские проводки
    // Списание материалов: Дт 8110 Кт 1310
    if (materialsCost > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: outputForm.output_date,
        doc_ref: outputForm.output_number,
        debit_account: "8110",
        credit_account: "1310",
        amount: materialsCost,
        description: `Списание материалов на производство ${order.product_name}`,
      });
    }

    // Зарплата: Дт 8110 Кт 3350
    if (laborCost > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: outputForm.output_date,
        doc_ref: outputForm.output_number,
        debit_account: "8110",
        credit_account: "3350",
        amount: laborCost,
        description: `ЗП производственного персонала`,
      });
    }

    // Оприходование готовой продукции: Дт 1320 Кт 8110
    if (totalCost > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: outputForm.output_date,
        doc_ref: outputForm.output_number,
        debit_account: "1320",
        credit_account: "8110",
        amount: totalCost,
        description: `Оприходование готовой продукции: ${order.product_name} ${qty} ${order.unit}`,
      });
    }

    setMsg(`✅ Выпуск ${outputForm.output_number}: ${qty} ${order.unit} ${order.product_name} • Себестоимость ${fmtMoney(totalCost)} ₸`);
    setShowOutputForm(false);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  async function deleteOutput(id: string) {
    if (!confirm("Удалить запись о выпуске?")) return;
    await supabase.from("production_outputs").delete().eq("id", id);
    load();
  }

  // KPI
  const activeOrders = orders.filter(o => o.status === "in_progress" || o.status === "planned").length;
  const totalProducedThisMonth = outputs.filter(o => o.output_date >= new Date().toISOString().slice(0, 7) + "-01")
    .reduce((a, o) => a + Number(o.quantity), 0);
  const totalCostThisMonth = outputs.filter(o => o.output_date >= new Date().toISOString().slice(0, 7) + "-01")
    .reduce((a, o) => a + Number(o.total_cost), 0);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Спецификаций</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{specs.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Активных рецептур</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🏭 В производстве</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{activeOrders}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Открытых заказов</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📦 Выпущено</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{totalProducedThisMonth.toFixed(0)}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За этот месяц</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #8B5CF6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Себестоимость</div>
          <div className="text-xl font-bold" style={{ color: "#8B5CF6" }}>{fmtMoney(totalCostThisMonth)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За этот месяц</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["specs", "📋 Спецификации"],
          ["orders", "🏭 Заказы на производство"],
          ["outputs", "📦 Выпуск продукции"],
          ["analytics", "📊 Аналитика"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ СПЕЦИФИКАЦИИ ═══ */}
      {tab === "specs" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Спецификация (BOM) — рецептура: что и сколько нужно для производства одной единицы продукции
            </div>
            <button onClick={startCreateSpec} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новая спецификация
            </button>
          </div>

          {showSpecForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{editingSpec ? "Редактирование спецификации" : "Новая спецификация"}</div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Номер</label><input value={specForm.spec_number} onChange={e => setSpecForm({ ...specForm, spec_number: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Готовая продукция (что производим)</label>
                  <input value={specForm.product_name} onChange={e => setSpecForm({ ...specForm, product_name: e.target.value, product_id: "" })} placeholder='Например: "Хлеб пшеничный"' list="products-list" />
                  <datalist id="products-list">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Выпуск</label><input type="number" value={specForm.output_quantity} onChange={e => setSpecForm({ ...specForm, output_quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ед.изм.</label><input value={specForm.output_unit} onChange={e => setSpecForm({ ...specForm, output_unit: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Связать с товаром</label>
                  <select value={specForm.product_id} onChange={e => setSpecForm({ ...specForm, product_id: e.target.value })}>
                    <option value="">— Не связан —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="text-xs font-bold mb-2" style={{ color: "var(--t3)" }}>📦 Компоненты (сырьё и материалы):</div>
              {components.length === 0 && <div className="text-xs py-3" style={{ color: "var(--t3)" }}>Добавьте компоненты</div>}
              {components.map((c, i) => (
                <div key={i} className="flex gap-2 items-end mb-2">
                  <div className="flex-[3]">
                    <select onChange={e => selectComponent(i, e.target.value)} value={c.product_id}>
                      <option value="">— Выбрать материал —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (остаток: {p.quantity} {p.unit})</option>)}
                    </select>
                  </div>
                  <div className="w-20"><input type="number" step="0.001" value={c.quantity} onChange={e => updComp(i, "quantity", Number(e.target.value))} placeholder="Кол." /></div>
                  <div className="w-16 text-xs pb-2 text-center" style={{ color: "var(--t3)" }}>{c.unit}</div>
                  <div className="w-28"><input type="number" value={c.price} onChange={e => updComp(i, "price", Number(e.target.value))} placeholder="Цена" /></div>
                  <div className="w-28 text-xs pb-2 text-right font-bold">{fmtMoney(c.sum)} ₸</div>
                  <button onClick={() => removeComp(i)} className="text-sm cursor-pointer border-none bg-transparent pb-2" style={{ color: "#EF4444" }}>×</button>
                </div>
              ))}
              <button onClick={addComponent} className="text-xs px-3 py-1 rounded-lg cursor-pointer mb-4" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>+ Добавить компонент</button>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>💰 ЗП производственного персонала (на весь выпуск)</label><input type="number" value={specForm.labor_cost} onChange={e => setSpecForm({ ...specForm, labor_cost: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>📊 Накладные расходы (электричество, аренда и т.д.)</label><input type="number" value={specForm.overhead_cost} onChange={e => setSpecForm({ ...specForm, overhead_cost: e.target.value })} /></div>
              </div>

              <div className="p-4 rounded-lg mb-4" style={{ background: "var(--bg)" }}>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Материалы</div><div className="font-bold">{fmtMoney(materialsCost)} ₸</div></div>
                  <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>+ ЗП</div><div className="font-bold">{fmtMoney(Number(specForm.labor_cost))} ₸</div></div>
                  <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>+ Накладные</div><div className="font-bold">{fmtMoney(Number(specForm.overhead_cost))} ₸</div></div>
                  <div><div className="text-[10px]" style={{ color: "#10B981" }}>= Себестоимость 1 ед.</div><div className="font-bold text-base" style={{ color: "#10B981" }}>{fmtMoney(costPerUnit)} ₸</div></div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveSpec} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => setShowSpecForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№", "Продукция", "Выпуск", "Компонентов", "Себестоимость 1 ед.", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {specs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет спецификаций</td></tr>
                ) : specs.map(s => (
                  <tr key={s.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{s.spec_number}</td>
                    <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{s.product_name}</td>
                    <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{s.output_quantity} {s.output_unit}</td>
                    <td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{(s.components || []).length}</td>
                    <td className="p-2.5 text-[13px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(s.cost_per_unit))} ₸</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => startEditSpec(s)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>✏</button>
                      <button onClick={() => deleteSpec(s.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ЗАКАЗЫ ═══ */}
      {tab === "orders" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Заказы на производство — план выпуска готовой продукции на основе спецификаций
            </div>
            <button onClick={startCreateOrder} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новый заказ
            </button>
          </div>

          {showOrderForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Новый заказ на производство</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Номер</label><input value={orderForm.order_number} onChange={e => setOrderForm({ ...orderForm, order_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата заказа</label><input type="date" value={orderForm.order_date} onChange={e => setOrderForm({ ...orderForm, order_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Спецификация</label>
                  <select value={orderForm.spec_id} onChange={e => setOrderForm({ ...orderForm, spec_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {specs.map(s => <option key={s.id} value={s.id}>{s.product_name} ({fmtMoney(Number(s.cost_per_unit))} ₸/ед.)</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Плановое количество</label><input type="number" value={orderForm.planned_quantity} onChange={e => setOrderForm({ ...orderForm, planned_quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата начала</label><input type="date" value={orderForm.start_date} onChange={e => setOrderForm({ ...orderForm, start_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата завершения</label><input type="date" value={orderForm.end_date} onChange={e => setOrderForm({ ...orderForm, end_date: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ответственный</label><input value={orderForm.responsible_name} onChange={e => setOrderForm({ ...orderForm, responsible_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={orderForm.notes} onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveOrder} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Создать заказ</button>
                <button onClick={() => setShowOrderForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№", "Дата", "Продукция", "План", "Произведено", "Себестоимость", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет заказов</td></tr>
                ) : orders.map(o => {
                  const progress = Number(o.planned_quantity) > 0 ? Math.round((Number(o.produced_quantity) / Number(o.planned_quantity)) * 100) : 0;
                  const statusColors: Record<string, string> = { planned: "#6B7280", in_progress: "#F59E0B", completed: "#10B981", cancelled: "#EF4444" };
                  const statusNames: Record<string, string> = { planned: "Запланирован", in_progress: "В производстве", completed: "Завершён", cancelled: "Отменён" };
                  return (
                    <tr key={o.id}>
                      <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{o.order_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.order_date}</td>
                      <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{o.product_name}</td>
                      <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{o.planned_quantity} {o.unit}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <div className="flex items-center gap-2">
                          <div style={{ width: 60, height: 5, background: "var(--brd)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(100, progress)}%`, height: "100%", background: "#10B981" }} />
                          </div>
                          <span className="text-[11px]">{Number(o.produced_quantity)}/{progress}%</span>
                        </div>
                      </td>
                      <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.total_cost))} ₸</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <select value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: statusColors[o.status] + "20", color: statusColors[o.status], border: "none" }}>
                          {Object.entries(statusNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
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

      {/* ═══ ВЫПУСК ═══ */}
      {tab === "outputs" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              Фактический выпуск — списание материалов со склада + оприходование готовой продукции + проводки по бухгалтерии
            </div>
            <button onClick={startCreateOutput} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Зафиксировать выпуск
            </button>
          </div>

          {showOutputForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Зафиксировать выпуск продукции</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Номер</label><input value={outputForm.output_number} onChange={e => setOutputForm({ ...outputForm, output_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={outputForm.output_date} onChange={e => setOutputForm({ ...outputForm, output_date: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Заказ на производство</label>
                  <select value={outputForm.order_id} onChange={e => setOutputForm({ ...outputForm, order_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {orders.filter(o => o.status !== "completed" && o.status !== "cancelled").map(o => (
                      <option key={o.id} value={o.id}>{o.order_number} • {o.product_name} • План: {o.planned_quantity} {o.unit} • Готово: {o.produced_quantity}</option>
                    ))}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Произведено количество</label><input type="number" step="0.001" value={outputForm.quantity} onChange={e => setOutputForm({ ...outputForm, quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={outputForm.notes} onChange={e => setOutputForm({ ...outputForm, notes: e.target.value })} /></div>
              </div>
              <div className="text-[10px] mb-3 p-3 rounded-lg" style={{ background: "#F59E0B10", color: "var(--t2)", border: "1px solid #F59E0B30" }}>
                ℹ️ <b>Что произойдёт:</b> Со склада спишутся материалы по спецификации. На склад поступит готовая продукция. Будут созданы 3 проводки: списание материалов (Дт 8110 Кт 1310), ЗП производства (Дт 8110 Кт 3350), оприходование готовой продукции (Дт 1320 Кт 8110).
              </div>
              <div className="flex gap-2">
                <button onClick={processOutput} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>✓ Провести выпуск</button>
                <button onClick={() => setShowOutputForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№", "Дата", "Продукция", "Кол-во", "Материалы", "ЗП", "Накл.", "Себестоимость", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {outputs.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет выпусков</td></tr>
                ) : outputs.map(o => (
                  <tr key={o.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{o.output_number}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.output_date}</td>
                    <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{o.product_name}</td>
                    <td className="p-2.5 text-[13px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{o.quantity} {o.unit}</td>
                    <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.materials_cost))}</td>
                    <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.labor_cost))}</td>
                    <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.overhead_cost))}</td>
                    <td className="p-2.5 text-[13px] text-right font-bold" style={{ color: "#8B5CF6", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.total_cost))} ₸</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteOutput(o.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ АНАЛИТИКА ═══ */}
      {tab === "analytics" && (
        <>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-4">Структура себестоимости (за всё время)</div>
            {(() => {
              const totalMat = outputs.reduce((a, o) => a + Number(o.materials_cost), 0);
              const totalLab = outputs.reduce((a, o) => a + Number(o.labor_cost), 0);
              const totalOH = outputs.reduce((a, o) => a + Number(o.overhead_cost), 0);
              const total = totalMat + totalLab + totalOH;
              const data = [
                { name: "Материалы", value: totalMat, color: "#6366F1" },
                { name: "ЗП производства", value: totalLab, color: "#F59E0B" },
                { name: "Накладные расходы", value: totalOH, color: "#8B5CF6" },
              ];
              return (
                <div className="flex flex-col gap-2">
                  {data.map((d, i) => {
                    const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-3 py-2">
                        <span className="text-xs font-semibold" style={{ color: d.color, width: 160 }}>{d.name}</span>
                        <div style={{ flex: 1, height: 16, background: "var(--bg)", borderRadius: 8, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: d.color, borderRadius: 8 }} />
                        </div>
                        <span className="text-xs font-bold" style={{ minWidth: 130, textAlign: "right" }}>{fmtMoney(d.value)} ₸ ({pct}%)</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between pt-3 mt-2 text-sm font-bold" style={{ borderTop: "1px solid var(--brd)" }}>
                    <span>Итого:</span>
                    <span>{fmtMoney(total)} ₸</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Топ продукции по объёму выпуска</div>
              {(() => {
                const grouped: Record<string, number> = {};
                outputs.forEach(o => {
                  grouped[o.product_name] = (grouped[o.product_name] || 0) + Number(o.quantity);
                });
                const top = Object.entries(grouped).sort(([, a], [, b]) => b - a).slice(0, 5);
                if (top.length === 0) return <div className="text-xs py-4" style={{ color: "var(--t3)" }}>Нет данных</div>;
                const max = top[0][1];
                return top.map(([name, qty], i) => {
                  const pct = (qty / max) * 100;
                  return (
                    <div key={i} className="flex items-center gap-3 py-1.5">
                      <span className="text-xs" style={{ width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                      <div style={{ flex: 1, height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#10B981", borderRadius: 3 }} />
                      </div>
                      <span className="text-xs font-bold" style={{ minWidth: 70, textAlign: "right" }}>{qty.toFixed(0)}</span>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Показатели</div>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Спецификаций</span><span className="text-xs font-bold">{specs.length}</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Заказов всего</span><span className="text-xs font-bold">{orders.length}</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Завершённых</span><span className="text-xs font-bold" style={{ color: "#10B981" }}>{orders.filter(o => o.status === "completed").length}</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>В работе</span><span className="text-xs font-bold" style={{ color: "#F59E0B" }}>{orders.filter(o => o.status === "in_progress").length}</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Выпусков</span><span className="text-xs font-bold">{outputs.length}</span></div>
                <div className="flex justify-between"><span className="text-xs" style={{ color: "var(--t3)" }}>Средняя себестоимость 1 ед.</span><span className="text-xs font-bold">{fmtMoney(outputs.length > 0 ? Math.round(outputs.reduce((a, o) => a + Number(o.cost_per_unit), 0) / outputs.length) : 0)} ₸</span></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
