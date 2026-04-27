"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "assembly" | "disassembly" | "history";

interface Component {
  nomenclature_id: string;
  name: string;
  unit: string;
  quantity: number;
  available: number;
  price: number;
  amount: number;
}

export default function AssemblyPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("assembly");
  const [ops, setOps] = useState<any[]>([]);
  const [nomenclature, setNomenclature] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<any>(null);

  const empty = {
    op_number: "",
    op_date: new Date().toISOString().slice(0, 10),
    set_nomenclature_id: "",
    set_quantity: "1",
    warehouse_name: "Основной склад",
    responsible_name: "",
    notes: "",
  };
  const [form, setForm] = useState(empty);
  const [components, setComponents] = useState<Component[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [o, n] = await Promise.all([
      supabase.from("assembly_operations").select("*").eq("user_id", user.id).order("op_date", { ascending: false }),
      supabase.from("nomenclature").select("*").eq("user_id", user.id).order("name"),
    ]);
    setOps(o.data || []);
    setNomenclature(n.data || []);
  }

  function startCreate(opType: Tab) {
    const prefix = opType === "assembly" ? "СБ" : "РБ";
    const num = `${prefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setForm({ ...empty, op_number: num });
    setComponents([]);
    setShowForm(true);
  }

  function selectSet(nomId: string) {
    const n = nomenclature.find(x => x.id === nomId);
    if (!n) { setForm({ ...form, set_nomenclature_id: "" }); setComponents([]); return; }

    setForm({ ...form, set_nomenclature_id: nomId });

    // Если у позиции в номенклатуре заполнен set_components — подгружаем автоматически
    if (n.set_components && Array.isArray(n.set_components) && n.set_components.length > 0) {
      const newComps: Component[] = n.set_components.map((sc: any) => {
        const compN = nomenclature.find(x => x.id === sc.nomenclature_id);
        return {
          nomenclature_id: sc.nomenclature_id,
          name: sc.name || compN?.name || "Компонент",
          unit: compN?.unit || "шт",
          quantity: Number(sc.quantity || 1) * Number(form.set_quantity || 1),
          available: Number(compN?.quantity || 0),
          price: Number(compN?.purchase_price || 0),
          amount: Number(sc.quantity || 1) * Number(form.set_quantity || 1) * Number(compN?.purchase_price || 0),
        };
      });
      setComponents(newComps);
      setMsg(`✅ Загружен состав комплекта (${newComps.length} компонентов) из карточки номенклатуры`);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  function setQty(qty: string) {
    setForm({ ...form, set_quantity: qty });
    // Пересчитать компоненты пропорционально, если состав был загружен из набора
    const setN = nomenclature.find(x => x.id === form.set_nomenclature_id);
    if (setN?.set_components && Array.isArray(setN.set_components) && components.length > 0) {
      const newComps = components.map((c, i) => {
        const orig = setN.set_components[i];
        if (!orig) return c;
        const newQty = Number(orig.quantity || 1) * Number(qty || 1);
        return { ...c, quantity: newQty, amount: newQty * c.price };
      });
      setComponents(newComps);
    }
  }

  function addComponent() {
    setComponents([...components, { nomenclature_id: "", name: "", unit: "шт", quantity: 0, available: 0, price: 0, amount: 0 }]);
  }

  function selectComp(i: number, nomId: string) {
    const n = nomenclature.find(x => x.id === nomId);
    if (!n) return;
    const c = [...components];
    c[i] = {
      nomenclature_id: nomId,
      name: n.name,
      unit: n.unit,
      quantity: 0,
      available: Number(n.quantity || 0),
      price: Number(n.purchase_price || 0),
      amount: 0,
    };
    setComponents(c);
  }

  function updCompQty(i: number, qty: number) {
    const c = [...components];
    c[i].quantity = qty;
    c[i].amount = qty * c[i].price;
    setComponents(c);
  }

  function removeComp(i: number) {
    setComponents(components.filter((_, idx) => idx !== i));
  }

  const totalCompCost = components.reduce((a, c) => a + c.amount, 0);
  const setN = nomenclature.find(n => n.id === form.set_nomenclature_id);
  const setPrice = Number(setN?.purchase_price || 0);
  const setQuantity = Number(form.set_quantity || 0);
  const setTotalCost = setPrice * setQuantity;

  async function executeOperation() {
    if (!form.set_nomenclature_id) { setMsg("❌ Выберите комплект"); setTimeout(() => setMsg(""), 3000); return; }
    if (!setN) return;
    if (setQuantity <= 0) { setMsg("❌ Количество > 0"); setTimeout(() => setMsg(""), 3000); return; }
    if (components.length === 0) { setMsg("❌ Добавьте компоненты"); setTimeout(() => setMsg(""), 3000); return; }

    if (tab === "assembly") {
      // СБОРКА: уменьшаем компоненты, увеличиваем комплект
      for (const c of components) {
        if (c.quantity <= 0) { setMsg(`❌ Кол-во > 0 для ${c.name}`); setTimeout(() => setMsg(""), 3000); return; }
        if (c.quantity > c.available) { setMsg(`❌ Недостаточно ${c.name}: доступно ${c.available}, нужно ${c.quantity}`); setTimeout(() => setMsg(""), 3000); return; }
      }
    } else {
      // РАЗБОРКА: проверяем наличие комплекта
      if (setQuantity > Number(setN.quantity || 0)) {
        setMsg(`❌ Недостаточно комплектов на складе: есть ${setN.quantity}, нужно ${setQuantity}`);
        setTimeout(() => setMsg(""), 4000);
        return;
      }
    }

    const action = tab === "assembly" ? "Собрать" : "Разобрать";
    if (!confirm(`${action} ${setQuantity} ${setN.unit} «${setN.name}»?\n\nКомпонентов: ${components.length}\nСтоимость: ${fmtMoney(totalCompCost)} ₸`)) return;

    // Создаём документ
    await supabase.from("assembly_operations").insert({
      user_id: userId,
      op_number: form.op_number,
      op_date: form.op_date,
      op_type: tab,
      set_nomenclature_id: form.set_nomenclature_id,
      set_name: setN.name,
      set_unit: setN.unit,
      set_quantity: setQuantity,
      set_cost: setTotalCost,
      components,
      total_components_cost: totalCompCost,
      cost_diff: tab === "assembly" ? totalCompCost - setTotalCost : setTotalCost - totalCompCost,
      status: "completed",
      warehouse_name: form.warehouse_name,
      responsible_name: form.responsible_name,
      notes: form.notes,
      completed_at: new Date().toISOString(),
    });

    if (tab === "assembly") {
      // СБОРКА: -компоненты, +комплект
      for (const c of components) {
        const compN = nomenclature.find(x => x.id === c.nomenclature_id);
        if (compN) {
          await supabase.from("nomenclature").update({ quantity: Math.max(0, Number(compN.quantity || 0) - c.quantity) }).eq("id", c.nomenclature_id);
        }
      }
      // Увеличиваем комплект, обновляем себестоимость как среднюю
      const newQty = Number(setN.quantity || 0) + setQuantity;
      const newCost = newQty > 0 ? ((Number(setN.quantity || 0) * setPrice) + totalCompCost) / newQty : setPrice;
      await supabase.from("nomenclature").update({
        quantity: newQty,
        purchase_price: Math.round(newCost * 100) / 100,
      }).eq("id", form.set_nomenclature_id);

      // Бух. проводка: Дт 1320 (готовая продукция / комплект) Кт 1310 (компоненты)
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: form.op_date,
        doc_ref: form.op_number,
        debit_account: setN.inventory_account || "1320",
        credit_account: "1310",
        amount: totalCompCost,
        description: `Сборка ${setQuantity} ${setN.unit} «${setN.name}» из ${components.length} компонентов`,
      });
    } else {
      // РАЗБОРКА: -комплект, +компоненты
      await supabase.from("nomenclature").update({ quantity: Math.max(0, Number(setN.quantity || 0) - setQuantity) }).eq("id", form.set_nomenclature_id);

      for (const c of components) {
        const compN = nomenclature.find(x => x.id === c.nomenclature_id);
        if (compN) {
          // Увеличиваем по средней
          const newQty = Number(compN.quantity || 0) + c.quantity;
          await supabase.from("nomenclature").update({ quantity: newQty }).eq("id", c.nomenclature_id);
        }
      }

      // Бух. проводка: Дт 1310 (компоненты) Кт 1320 (комплект)
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: form.op_date,
        doc_ref: form.op_number,
        debit_account: "1310",
        credit_account: setN.inventory_account || "1320",
        amount: setTotalCost,
        description: `Разборка ${setQuantity} ${setN.unit} «${setN.name}» на ${components.length} компонентов`,
      });
    }

    setMsg(`✅ ${tab === "assembly" ? "Сборка" : "Разборка"} ${form.op_number} проведена`);
    setShowForm(false);
    setComponents([]);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function deleteOp(id: string) {
    if (!confirm("Удалить операцию? Корректировки остатков и проводки НЕ будут отменены.")) return;
    await supabase.from("assembly_operations").delete().eq("id", id);
    if (viewing?.id === id) setViewing(null);
    load();
  }

  // KPI
  const tabOps = ops.filter(o => o.op_type === tab);
  const monthOps = tabOps.filter(o => o.op_date >= new Date().toISOString().slice(0, 7) + "-01").length;
  const totalAssemblies = ops.filter(o => o.op_type === "assembly").length;
  const totalDisassemblies = ops.filter(o => o.op_type === "disassembly").length;
  const totalCost = tabOps.reduce((a, o) => a + Number(o.total_components_cost || 0), 0);

  // Sets in nomenclature (for hint)
  const availableSets = nomenclature.filter(n => n.item_type === "set" || (n.set_components && Array.isArray(n.set_components) && n.set_components.length > 0));

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Сборка комплектов из компонентов и обратное разделение комплекта на части. Состав комплекта подгружается из карточки номенклатуры автоматически.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🔧 Сборок</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{totalAssemblies}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🔨 Разборок</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{totalDisassemblies}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📅 За текущий месяц</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{monthOps}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Операций</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📚 Доступно комплектов</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{availableSets.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>В номенклатуре</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["assembly", "🔧 Сборка комплектов"],
          ["disassembly", "🔨 Разборка"],
          ["history", `📋 История (${ops.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setShowForm(false); setViewing(null); }}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ФОРМА (СБОРКА / РАЗБОРКА) ═══ */}
      {(tab === "assembly" || tab === "disassembly") && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>
              {tab === "assembly"
                ? "Сборка: компоненты −, комплект +. Проводка: Дт 1320 Кт 1310"
                : "Разборка: комплект −, компоненты +. Проводка: Дт 1310 Кт 1320"}
            </div>
            <button onClick={() => startCreate(tab)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новая {tab === "assembly" ? "сборка" : "разборка"}
            </button>
          </div>

          {showForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{tab === "assembly" ? "🔧 Сборка комплекта" : "🔨 Разборка комплекта"}</div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ документа</label><input value={form.op_number} onChange={e => setForm({ ...form, op_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={form.op_date} onChange={e => setForm({ ...form, op_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Склад</label><input value={form.warehouse_name} onChange={e => setForm({ ...form, warehouse_name: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>{tab === "assembly" ? "Что собираем" : "Что разбираем"} (комплект) *</label>
                  <select value={form.set_nomenclature_id} onChange={e => selectSet(e.target.value)}>
                    <option value="">— Выбрать комплект —</option>
                    {nomenclature.map(n => {
                      const hasComps = n.set_components && Array.isArray(n.set_components) && n.set_components.length > 0;
                      const isSet = n.item_type === "set";
                      const indicator = hasComps ? " 📦" : "";
                      return <option key={n.id} value={n.id}>{n.name} ({n.unit}){indicator}{isSet ? " — Набор" : ""} • в наличии: {n.quantity}</option>;
                    })}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Количество</label><input type="number" step="0.001" value={form.set_quantity} onChange={e => setQty(e.target.value)} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ответственный</label><input value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>

              {form.set_nomenclature_id && (
                <>
                  <div className="rounded-lg p-3 mb-3" style={{ background: tab === "assembly" ? "#10B98110" : "#F59E0B10" }}>
                    <div className="grid grid-cols-3 gap-3">
                      <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Комплект</div><div className="text-sm font-bold">{setN?.name}</div></div>
                      <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Кол-во</div><div className="text-sm font-bold">{setQuantity} {setN?.unit}</div></div>
                      <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>{tab === "assembly" ? "Получим на склад" : "Спишем со склада"}</div><div className="text-sm font-bold" style={{ color: tab === "assembly" ? "#10B981" : "#EF4444" }}>{tab === "assembly" ? "+" : "−"}{setQuantity} {setN?.unit}</div></div>
                    </div>
                  </div>

                  <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📦 КОМПОНЕНТЫ</div>
                  <div className="text-[10px] mb-2" style={{ color: "var(--t3)" }}>
                    {tab === "assembly" ? "Эти позиции спишутся со склада" : "Эти позиции поступят на склад"}
                  </div>

                  <div className="rounded-lg p-2 mb-3" style={{ background: "var(--bg)" }}>
                    {components.length === 0 && <div className="text-xs py-3 text-center" style={{ color: "var(--t3)" }}>
                      {setN?.set_components?.length ? "Состав загружается..." : "Состав не задан в карточке. Добавьте компоненты вручную или заполните «Состав комплекта» в номенклатуре."}
                    </div>}
                    {components.map((c, i) => (
                      <div key={i} className="grid items-end gap-2 mb-2" style={{ gridTemplateColumns: "1fr 90px 50px 100px 110px 30px" }}>
                        <select value={c.nomenclature_id} onChange={e => selectComp(i, e.target.value)} style={{ fontSize: 11 }}>
                          <option value="">— Компонент —</option>
                          {nomenclature.filter(n => n.id !== form.set_nomenclature_id).map(n => (
                            <option key={n.id} value={n.id}>{n.name} ({n.unit}) — на складе: {n.quantity}</option>
                          ))}
                        </select>
                        <input type="number" step="0.001" value={c.quantity} onChange={e => updCompQty(i, Number(e.target.value))} placeholder="Кол." style={{ fontSize: 11 }} />
                        <span className="text-[10px] pb-2 text-center" style={{ color: "var(--t3)" }}>{c.unit}</span>
                        {tab === "assembly" ? (
                          <span className="text-[10px] pb-2" style={{ color: c.quantity > c.available ? "#EF4444" : "var(--t3)" }}>
                            {c.quantity > c.available ? `⚠ макс ${c.available}` : `доступно ${c.available}`}
                          </span>
                        ) : (
                          <span className="text-[10px] pb-2" style={{ color: "var(--t3)" }}>+ к остатку</span>
                        )}
                        <span className="text-xs pb-1.5 text-right font-bold" style={{ color: "var(--accent)" }}>{fmtMoney(c.amount)} ₸</span>
                        <button onClick={() => removeComp(i)} className="text-sm cursor-pointer border-none bg-transparent pb-2" style={{ color: "#EF4444" }}>×</button>
                      </div>
                    ))}
                    <button onClick={addComponent} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить компонент</button>
                  </div>

                  {components.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 mb-3 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                      <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Стоимость компонентов</div><div className="text-sm font-bold" style={{ color: "var(--accent)" }}>{fmtMoney(totalCompCost)} ₸</div></div>
                      <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Стоимость комплекта</div><div className="text-sm font-bold">{fmtMoney(setTotalCost)} ₸</div></div>
                      <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Разница</div>
                        <div className="text-sm font-bold" style={{ color: Math.abs(totalCompCost - setTotalCost) < 0.01 ? "#10B981" : "#F59E0B" }}>
                          {totalCompCost - setTotalCost > 0 ? "+" : ""}{fmtMoney(totalCompCost - setTotalCost)} ₸
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2">
                <button onClick={executeOperation} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>
                  ✓ Провести {tab === "assembly" ? "сборку" : "разборку"}
                </button>
                <button onClick={() => { setShowForm(false); setComponents([]); }} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          {!showForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <table>
                <thead><tr>{["№", "Дата", "Комплект", "Кол-во", "Компонентов", "Стоимость", ""].map(h => (
                  <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {tabOps.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет операций</td></tr>
                  ) : tabOps.map(o => (
                    <tr key={o.id}>
                      <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{o.op_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.op_date}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{o.set_name}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{o.set_quantity} {o.set_unit}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{(o.components || []).length}</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.total_components_cost || 0))} ₸</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => setViewing(o)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>👁</button>
                        <button onClick={() => deleteOp(o.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ ИСТОРИЯ ВСЕХ ═══ */}
      {tab === "history" && (
        <>
          {viewing ? (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-base font-bold">{viewing.op_type === "assembly" ? "🔧 Сборка" : "🔨 Разборка"} {viewing.op_number}</div>
                  <div className="text-xs" style={{ color: "var(--t3)" }}>{viewing.op_date} • {viewing.warehouse_name}</div>
                </div>
                <button onClick={() => setViewing(null)} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Закрыть</button>
              </div>

              <div className="rounded-lg p-3 mb-4" style={{ background: viewing.op_type === "assembly" ? "#10B98110" : "#F59E0B10" }}>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>{viewing.op_type === "assembly" ? "СОБРАНО" : "РАЗОБРАНО"}</div>
                <div className="text-base font-bold">{viewing.set_quantity} {viewing.set_unit} «{viewing.set_name}»</div>
              </div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t3)" }}>КОМПОНЕНТЫ</div>
              <table>
                <thead><tr>{["Наименование", "Кол.", "Ед.", "Цена", "Сумма"].map(h => (
                  <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {(viewing.components || []).map((c: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 text-[12px]">{c.name}</td>
                      <td className="p-2 text-[12px] font-bold">{c.quantity}</td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>{c.unit}</td>
                      <td className="p-2 text-[12px]">{fmtMoney(c.price)} ₸</td>
                      <td className="p-2 text-[12px] text-right font-bold">{fmtMoney(c.amount)} ₸</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--bg)" }}>
                    <td colSpan={4} className="p-2 text-[12px] font-bold text-right">ИТОГО:</td>
                    <td className="p-2 text-[14px] font-bold text-right" style={{ color: "var(--accent)" }}>{fmtMoney(Number(viewing.total_components_cost))} ₸</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <table>
                <thead><tr>{["№", "Дата", "Тип", "Комплект", "Кол.", "Компонентов", "Стоимость", ""].map(h => (
                  <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {ops.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет операций</td></tr>
                  ) : ops.map(o => (
                    <tr key={o.id}>
                      <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{o.op_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.op_date}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: o.op_type === "assembly" ? "#10B98120" : "#F59E0B20", color: o.op_type === "assembly" ? "#10B981" : "#F59E0B" }}>
                          {o.op_type === "assembly" ? "🔧 Сборка" : "🔨 Разборка"}
                        </span>
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{o.set_name}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{o.set_quantity} {o.set_unit}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{(o.components || []).length}</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.total_components_cost || 0))} ₸</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => setViewing(o)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>👁</button>
                        <button onClick={() => deleteOp(o.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
