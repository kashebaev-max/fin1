"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "warehouses" | "stocks" | "transfer" | "history";

const WH_TYPES: Record<string, { name: string; icon: string; color: string }> = {
  main: { name: "Основной склад", icon: "🏢", color: "#6366F1" },
  transit: { name: "Транзитный", icon: "🚚", color: "#F59E0B" },
  production: { name: "Производственный", icon: "🏭", color: "#A855F7" },
  returns: { name: "Возвратный", icon: "↩", color: "#EF4444" },
  consignment: { name: "Комиссионный", icon: "🤝", color: "#10B981" },
};

const STATUS: Record<string, { name: string; color: string }> = {
  draft: { name: "Черновик", color: "#6B7280" },
  in_transit: { name: "В пути", color: "#F59E0B" },
  completed: { name: "Завершено", color: "#10B981" },
  cancelled: { name: "Отменено", color: "#EF4444" },
};

interface TransferItem {
  nomenclature_id: string;
  name: string;
  unit: string;
  quantity: number;
  available: number;
  price: number;
  amount: number;
}

export default function TransfersPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("warehouses");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [nomenclature, setNomenclature] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [whFilter, setWhFilter] = useState<string>("all");

  // Warehouse form
  const [showWhForm, setShowWhForm] = useState(false);
  const [editingWh, setEditingWh] = useState<any>(null);
  const emptyWh = {
    code: "", name: "", warehouse_type: "main",
    address: "", responsible_name: "", responsible_iin: "",
    is_main: false, notes: "",
  };
  const [whForm, setWhForm] = useState(emptyWh);

  // Stock form
  const [showStockForm, setShowStockForm] = useState(false);
  const [stockForm, setStockForm] = useState({ warehouse_id: "", nomenclature_id: "", quantity: "0" });

  // Transfer form
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [viewingTransfer, setViewingTransfer] = useState<any>(null);
  const emptyTransfer = {
    transfer_number: "",
    transfer_date: new Date().toISOString().slice(0, 10),
    from_warehouse_id: "",
    to_warehouse_id: "",
    responsible_from: "",
    responsible_to: "",
    notes: "",
  };
  const [transferForm, setTransferForm] = useState(emptyTransfer);
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [w, s, t, n] = await Promise.all([
      supabase.from("warehouses").select("*").eq("user_id", user.id).order("name"),
      supabase.from("warehouse_stocks").select("*").eq("user_id", user.id),
      supabase.from("warehouse_transfers").select("*").eq("user_id", user.id).order("transfer_date", { ascending: false }),
      supabase.from("nomenclature").select("*").eq("user_id", user.id).order("name"),
    ]);
    setWarehouses(w.data || []);
    setStocks(s.data || []);
    setTransfers(t.data || []);
    setNomenclature(n.data || []);
  }

  // ═══ СКЛАДЫ ═══
  function startCreateWh() { setEditingWh(null); setWhForm(emptyWh); setShowWhForm(true); }
  function startEditWh(w: any) {
    setEditingWh(w);
    setWhForm({
      code: w.code || "", name: w.name, warehouse_type: w.warehouse_type || "main",
      address: w.address || "", responsible_name: w.responsible_name || "", responsible_iin: w.responsible_iin || "",
      is_main: !!w.is_main, notes: w.notes || "",
    });
    setShowWhForm(true);
  }

  async function saveWh() {
    if (!whForm.name) { setMsg("❌ Укажите название"); setTimeout(() => setMsg(""), 3000); return; }
    if (whForm.is_main && !editingWh) {
      await supabase.from("warehouses").update({ is_main: false }).eq("user_id", userId);
    }
    const data = { user_id: userId, ...whForm };
    if (editingWh) await supabase.from("warehouses").update(data).eq("id", editingWh.id);
    else await supabase.from("warehouses").insert(data);
    setMsg(`✅ ${editingWh ? "Обновлено" : "Создано"}: ${whForm.name}`);
    setShowWhForm(false); setEditingWh(null); load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteWh(id: string) {
    if (!confirm("Удалить склад? Остатки и история перемещений по нему останутся, но потеряют связь.")) return;
    await supabase.from("warehouses").delete().eq("id", id);
    load();
  }

  // ═══ ОСТАТКИ ═══
  async function addStock() {
    if (!stockForm.warehouse_id || !stockForm.nomenclature_id) {
      setMsg("❌ Выберите склад и товар"); setTimeout(() => setMsg(""), 3000); return;
    }
    const n = nomenclature.find(x => x.id === stockForm.nomenclature_id);
    if (!n) return;
    const existing = stocks.find(s => s.warehouse_id === stockForm.warehouse_id && s.nomenclature_id === stockForm.nomenclature_id);
    if (existing) {
      await supabase.from("warehouse_stocks").update({
        quantity: Number(stockForm.quantity),
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("warehouse_stocks").insert({
        user_id: userId,
        warehouse_id: stockForm.warehouse_id,
        nomenclature_id: stockForm.nomenclature_id,
        product_name: n.name,
        quantity: Number(stockForm.quantity),
        unit: n.unit,
      });
    }
    setStockForm({ warehouse_id: "", nomenclature_id: "", quantity: "0" });
    setShowStockForm(false);
    setMsg("✅ Остаток установлен");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteStock(id: string) {
    if (!confirm("Убрать товар из остатков?")) return;
    await supabase.from("warehouse_stocks").delete().eq("id", id);
    load();
  }

  // ═══ ПЕРЕМЕЩЕНИЕ ═══
  function startTransfer() {
    const num = `ПЕР-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setTransferForm({ ...emptyTransfer, transfer_number: num });
    setTransferItems([]);
    setShowTransferForm(true);
  }

  function selectFromWh(id: string) {
    setTransferForm({ ...transferForm, from_warehouse_id: id });
    setTransferItems([]);
  }

  function addTransferItem() {
    setTransferItems([...transferItems, { nomenclature_id: "", name: "", unit: "шт", quantity: 0, available: 0, price: 0, amount: 0 }]);
  }

  function selectItem(i: number, nomId: string) {
    const n = nomenclature.find(x => x.id === nomId);
    const stock = stocks.find(s => s.warehouse_id === transferForm.from_warehouse_id && s.nomenclature_id === nomId);
    if (!n) return;
    const it = [...transferItems];
    it[i] = {
      nomenclature_id: nomId,
      name: n.name,
      unit: n.unit,
      quantity: 0,
      available: Number(stock?.quantity || 0),
      price: Number(n.purchase_price || 0),
      amount: 0,
    };
    setTransferItems(it);
  }

  function updItemQty(i: number, qty: number) {
    const it = [...transferItems];
    it[i].quantity = qty;
    it[i].amount = qty * it[i].price;
    setTransferItems(it);
  }

  function removeItem(i: number) {
    setTransferItems(transferItems.filter((_, idx) => idx !== i));
  }

  const totalQty = transferItems.reduce((a, it) => a + it.quantity, 0);
  const totalAmount = transferItems.reduce((a, it) => a + it.amount, 0);

  async function executeTransfer() {
    if (!transferForm.from_warehouse_id || !transferForm.to_warehouse_id) {
      setMsg("❌ Выберите оба склада"); setTimeout(() => setMsg(""), 3000); return;
    }
    if (transferForm.from_warehouse_id === transferForm.to_warehouse_id) {
      setMsg("❌ Склады должны быть разными"); setTimeout(() => setMsg(""), 3000); return;
    }
    if (transferItems.length === 0) {
      setMsg("❌ Добавьте позиции"); setTimeout(() => setMsg(""), 3000); return;
    }
    for (const it of transferItems) {
      if (it.quantity <= 0) { setMsg(`❌ Количество > 0 для ${it.name}`); setTimeout(() => setMsg(""), 3000); return; }
      if (it.quantity > it.available) { setMsg(`❌ Недостаточно ${it.name}: доступно ${it.available}`); setTimeout(() => setMsg(""), 3000); return; }
    }

    const fromWh = warehouses.find(w => w.id === transferForm.from_warehouse_id);
    const toWh = warehouses.find(w => w.id === transferForm.to_warehouse_id);

    if (!confirm(`Переместить ${transferItems.length} позиций (${totalQty} ед., ${fmtMoney(totalAmount)} ₸) из ${fromWh?.name} в ${toWh?.name}?`)) return;

    // Создаём документ перемещения
    await supabase.from("warehouse_transfers").insert({
      user_id: userId,
      transfer_number: transferForm.transfer_number,
      transfer_date: transferForm.transfer_date,
      from_warehouse_id: transferForm.from_warehouse_id,
      from_warehouse_name: fromWh?.name,
      to_warehouse_id: transferForm.to_warehouse_id,
      to_warehouse_name: toWh?.name,
      responsible_from: transferForm.responsible_from,
      responsible_to: transferForm.responsible_to,
      status: "completed",
      items: transferItems,
      total_qty: totalQty,
      total_amount: totalAmount,
      notes: transferForm.notes,
      completed_at: new Date().toISOString(),
    });

    // Применяем остатки
    for (const it of transferItems) {
      // Уменьшить из источника
      const fromStock = stocks.find(s => s.warehouse_id === transferForm.from_warehouse_id && s.nomenclature_id === it.nomenclature_id);
      if (fromStock) {
        await supabase.from("warehouse_stocks").update({
          quantity: Number(fromStock.quantity) - it.quantity,
          updated_at: new Date().toISOString(),
        }).eq("id", fromStock.id);
      }
      // Увеличить в приёмнике
      const toStock = stocks.find(s => s.warehouse_id === transferForm.to_warehouse_id && s.nomenclature_id === it.nomenclature_id);
      if (toStock) {
        await supabase.from("warehouse_stocks").update({
          quantity: Number(toStock.quantity) + it.quantity,
          updated_at: new Date().toISOString(),
        }).eq("id", toStock.id);
      } else {
        await supabase.from("warehouse_stocks").insert({
          user_id: userId,
          warehouse_id: transferForm.to_warehouse_id,
          nomenclature_id: it.nomenclature_id,
          product_name: it.name,
          quantity: it.quantity,
          unit: it.unit,
        });
      }
    }

    // Бух. проводка по перемещению (если склады разные субсчета — но обычно внутреннее перемещение без проводки)
    // По умолчанию просто фиксируем документ

    setMsg(`✅ Перемещение ${transferForm.transfer_number}: ${transferItems.length} позиций`);
    setShowTransferForm(false);
    setTransferItems([]);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function deleteTransfer(id: string) {
    if (!confirm("Удалить запись о перемещении? Остатки НЕ будут возвращены автоматически.")) return;
    await supabase.from("warehouse_transfers").delete().eq("id", id);
    if (viewingTransfer?.id === id) setViewingTransfer(null);
    load();
  }

  // KPI
  const totalWh = warehouses.length;
  const activeWh = warehouses.filter(w => w.is_active !== false).length;
  const totalStockValue = stocks.reduce((a, s) => {
    const n = nomenclature.find(x => x.id === s.nomenclature_id);
    return a + Number(s.quantity) * Number(n?.purchase_price || 0);
  }, 0);
  const monthTransfers = transfers.filter(t => t.transfer_date >= new Date().toISOString().slice(0, 7) + "-01").length;

  const filteredStocks = whFilter === "all" ? stocks : stocks.filter(s => s.warehouse_id === whFilter);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Управление складами и перемещения товаров между ними. Накладная на перемещение сохраняется как документ.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🏢 Складов</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{activeWh}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {totalWh}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📦 Позиций на складах</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{stocks.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Уник. SKU: {new Set(stocks.map(s => s.nomenclature_id)).size}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Стоимость остатков</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(totalStockValue)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По закупочным</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🔁 Перемещений за месяц</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{monthTransfers}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {transfers.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["warehouses", "🏢 Склады"],
          ["stocks", "📦 Остатки по складам"],
          ["transfer", "🔁 Перемещение"],
          ["history", `📋 История (${transfers.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ СКЛАДЫ ═══ */}
      {tab === "warehouses" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Реестр складов организации с МОЛ (материально-ответственными лицами)</div>
            <button onClick={startCreateWh} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить склад</button>
          </div>

          {showWhForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{editingWh ? "Редактирование склада" : "Новый склад"}</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label><input value={whForm.code} onChange={e => setWhForm({ ...whForm, code: e.target.value })} placeholder="СКЛ-01" /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название *</label><input value={whForm.name} onChange={e => setWhForm({ ...whForm, name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип склада</label>
                  <select value={whForm.warehouse_type} onChange={e => setWhForm({ ...whForm, warehouse_type: e.target.value })}>
                    {Object.entries(WH_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Адрес</label><input value={whForm.address} onChange={e => setWhForm({ ...whForm, address: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>МОЛ (ответственный)</label><input value={whForm.responsible_name} onChange={e => setWhForm({ ...whForm, responsible_name: e.target.value })} placeholder="ФИО кладовщика" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН МОЛ</label><input value={whForm.responsible_iin} onChange={e => setWhForm({ ...whForm, responsible_iin: e.target.value.replace(/\D/g, "").slice(0, 12) })} maxLength={12} /></div>
                <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={whForm.is_main} onChange={e => setWhForm({ ...whForm, is_main: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">⭐ Основной склад</span>
                  </label>
                </div>
                <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={whForm.notes} onChange={e => setWhForm({ ...whForm, notes: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveWh} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => { setShowWhForm(false); setEditingWh(null); }} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            {warehouses.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет складов. Создайте первый.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {warehouses.map(w => {
                  const t = WH_TYPES[w.warehouse_type] || WH_TYPES.main;
                  const items = stocks.filter(s => s.warehouse_id === w.id);
                  const value = items.reduce((a, s) => {
                    const n = nomenclature.find(x => x.id === s.nomenclature_id);
                    return a + Number(s.quantity) * Number(n?.purchase_price || 0);
                  }, 0);
                  return (
                    <div key={w.id} className="rounded-lg p-4" style={{ background: "var(--bg)", border: w.is_main ? "2px solid #F59E0B" : "1px solid var(--brd)" }}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-start gap-2">
                          <span style={{ fontSize: 24 }}>{t.icon}</span>
                          <div>
                            <div className="text-sm font-bold flex items-center gap-2">
                              {w.name}
                              {w.is_main && <span className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>⭐ ОСНОВНОЙ</span>}
                            </div>
                            <div className="text-[11px]" style={{ color: t.color }}>{t.name}{w.code ? ` • ${w.code}` : ""}</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => startEditWh(w)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>✏</button>
                          <button onClick={() => deleteWh(w.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                        </div>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                        {w.address && <div>📍 {w.address}</div>}
                        {w.responsible_name && <div>👤 МОЛ: {w.responsible_name}</div>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
                        <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Позиций</div><div className="text-sm font-bold" style={{ color: "#10B981" }}>{items.length}</div></div>
                        <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Стоимость</div><div className="text-sm font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(value)} ₸</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ ОСТАТКИ ═══ */}
      {tab === "stocks" && (
        <>
          <div className="flex justify-between items-center">
            <div className="flex gap-3 items-center">
              <select value={whFilter} onChange={e => setWhFilter(e.target.value)} style={{ width: 250 }}>
                <option value="all">Все склады</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <span className="text-[11px]" style={{ color: "var(--t3)" }}>{filteredStocks.length} позиций</span>
            </div>
            <button onClick={() => setShowStockForm(!showStockForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить остаток</button>
          </div>

          {showStockForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Склад</label>
                  <select value={stockForm.warehouse_id} onChange={e => setStockForm({ ...stockForm, warehouse_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Товар</label>
                  <select value={stockForm.nomenclature_id} onChange={e => setStockForm({ ...stockForm, nomenclature_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {nomenclature.map(n => <option key={n.id} value={n.id}>{n.name} ({n.unit})</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Количество</label><input type="number" step="0.001" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addStock} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Сохранить</button>
                <button onClick={() => setShowStockForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Склад", "Товар", "Остаток", "Ед.", "Цена", "Сумма", "Обновлено", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filteredStocks.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет остатков</td></tr>
                ) : filteredStocks.map(s => {
                  const wh = warehouses.find(x => x.id === s.warehouse_id);
                  const n = nomenclature.find(x => x.id === s.nomenclature_id);
                  const price = Number(n?.purchase_price || 0);
                  return (
                    <tr key={s.id}>
                      <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{wh?.name || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{s.product_name || n?.name}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{Number(s.quantity).toFixed(3)}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{s.unit || n?.unit || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(price)} ₸</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(s.quantity) * price)} ₸</td>
                      <td className="p-2.5 text-[10px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{s.updated_at ? new Date(s.updated_at).toLocaleDateString("ru-RU") : "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteStock(s.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ПЕРЕМЕЩЕНИЕ ═══ */}
      {tab === "transfer" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Создание накладной на перемещение между складами</div>
            <button onClick={startTransfer} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новое перемещение</button>
          </div>

          {showTransferForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Накладная на перемещение</div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ накладной</label><input value={transferForm.transfer_number} onChange={e => setTransferForm({ ...transferForm, transfer_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={transferForm.transfer_date} onChange={e => setTransferForm({ ...transferForm, transfer_date: e.target.value })} /></div>
                <div></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>📤 ИЗ склада *</label>
                  <select value={transferForm.from_warehouse_id} onChange={e => selectFromWh(e.target.value)}>
                    <option value="">— Выбрать —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>📥 НА склад *</label>
                  <select value={transferForm.to_warehouse_id} onChange={e => setTransferForm({ ...transferForm, to_warehouse_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {warehouses.filter(w => w.id !== transferForm.from_warehouse_id).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сдал (МОЛ источника)</label><input value={transferForm.responsible_from} onChange={e => setTransferForm({ ...transferForm, responsible_from: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Принял (МОЛ приёмника)</label><input value={transferForm.responsible_to} onChange={e => setTransferForm({ ...transferForm, responsible_to: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={transferForm.notes} onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })} /></div>
              </div>

              {transferForm.from_warehouse_id && (
                <>
                  <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📦 ТОВАРЫ К ПЕРЕМЕЩЕНИЮ</div>
                  <div className="rounded-lg p-2 mb-3" style={{ background: "var(--bg)" }}>
                    {transferItems.length === 0 && <div className="text-xs py-3 text-center" style={{ color: "var(--t3)" }}>Добавьте позиции</div>}
                    {transferItems.map((it, i) => (
                      <div key={i} className="grid items-end gap-2 mb-2" style={{ gridTemplateColumns: "1fr 80px 50px 100px 110px 30px" }}>
                        <select value={it.nomenclature_id} onChange={e => selectItem(i, e.target.value)} style={{ fontSize: 11 }}>
                          <option value="">— Товар —</option>
                          {nomenclature.map(n => {
                            const stock = stocks.find(s => s.warehouse_id === transferForm.from_warehouse_id && s.nomenclature_id === n.id);
                            const avail = stock ? Number(stock.quantity) : 0;
                            return <option key={n.id} value={n.id} disabled={avail === 0}>{n.name} ({n.unit}) — {avail}</option>;
                          })}
                        </select>
                        <input type="number" step="0.001" value={it.quantity} max={it.available} onChange={e => updItemQty(i, Number(e.target.value))} placeholder="Кол." style={{ fontSize: 11 }} />
                        <span className="text-[10px] pb-2 text-center" style={{ color: "var(--t3)" }}>{it.unit}</span>
                        <span className="text-[10px] pb-2" style={{ color: it.quantity > it.available ? "#EF4444" : "var(--t3)" }}>макс {it.available}</span>
                        <span className="text-xs pb-1.5 text-right font-bold" style={{ color: "#10B981" }}>{fmtMoney(it.amount)} ₸</span>
                        <button onClick={() => removeItem(i)} className="text-sm cursor-pointer border-none bg-transparent pb-2" style={{ color: "#EF4444" }}>×</button>
                      </div>
                    ))}
                    <button onClick={addTransferItem} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить позицию</button>
                  </div>

                  {transferItems.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 mb-3 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                      <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Всего ед.</div><div className="text-sm font-bold">{totalQty}</div></div>
                      <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Общая стоимость</div><div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalAmount)} ₸</div></div>
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2">
                <button onClick={executeTransfer} disabled={transferItems.length === 0 || !transferForm.to_warehouse_id} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981", opacity: (transferItems.length === 0 || !transferForm.to_warehouse_id) ? 0.5 : 1 }}>
                  ✓ Провести перемещение
                </button>
                <button onClick={() => setShowTransferForm(false)} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "history" && (
        <>
          {viewingTransfer ? (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-base font-bold">Накладная {viewingTransfer.transfer_number}</div>
                  <div className="text-xs" style={{ color: "var(--t3)" }}>{viewingTransfer.transfer_date}</div>
                </div>
                <button onClick={() => setViewingTransfer(null)} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Закрыть</button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg p-3" style={{ background: "#EF444410" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>📤 ОТКУДА</div>
                  <div className="text-sm font-bold">{viewingTransfer.from_warehouse_name}</div>
                  {viewingTransfer.responsible_from && <div className="text-[10px]" style={{ color: "var(--t3)" }}>Сдал: {viewingTransfer.responsible_from}</div>}
                </div>
                <div className="rounded-lg p-3" style={{ background: "#10B98110" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>📥 КУДА</div>
                  <div className="text-sm font-bold">{viewingTransfer.to_warehouse_name}</div>
                  {viewingTransfer.responsible_to && <div className="text-[10px]" style={{ color: "var(--t3)" }}>Принял: {viewingTransfer.responsible_to}</div>}
                </div>
              </div>

              <table>
                <thead><tr>{["Товар", "Кол-во", "Ед.", "Цена", "Сумма"].map(h => (
                  <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {(viewingTransfer.items || []).map((it: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 text-[12px]">{it.name}</td>
                      <td className="p-2 text-[12px] font-bold">{it.quantity}</td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>{it.unit}</td>
                      <td className="p-2 text-[12px]">{fmtMoney(it.price)} ₸</td>
                      <td className="p-2 text-[12px] text-right font-bold">{fmtMoney(it.amount)} ₸</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--bg)" }}>
                    <td colSpan={4} className="p-2 text-[12px] font-bold text-right">ИТОГО:</td>
                    <td className="p-2 text-[14px] font-bold text-right" style={{ color: "#10B981" }}>{fmtMoney(Number(viewingTransfer.total_amount))} ₸</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <table>
                <thead><tr>{["№", "Дата", "Откуда", "Куда", "Позиций", "Стоимость", "Статус", ""].map(h => (
                  <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {transfers.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет перемещений</td></tr>
                  ) : transfers.map(t => {
                    const s = STATUS[t.status] || STATUS.completed;
                    return (
                      <tr key={t.id}>
                        <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{t.transfer_number}</td>
                        <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{t.transfer_date}</td>
                        <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{t.from_warehouse_name}</td>
                        <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{t.to_warehouse_name}</td>
                        <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{(t.items || []).length}</td>
                        <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(t.total_amount))} ₸</td>
                        <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: s.color + "20", color: s.color }}>{s.name}</span>
                        </td>
                        <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                          <button onClick={() => setViewingTransfer(t)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>👁</button>
                          <button onClick={() => deleteTransfer(t.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
