"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "stores" | "stocks" | "sales" | "transfer";

const STORE_TYPES: Record<string, { name: string; icon: string }> = {
  shop: { name: "Магазин", icon: "🏬" },
  kiosk: { name: "Киоск", icon: "🏪" },
  warehouse: { name: "Склад/розница", icon: "📦" },
  online: { name: "Интернет-магазин", icon: "🌐" },
  market: { name: "Рынок", icon: "🛒" },
  pavilion: { name: "Павильон", icon: "🏛" },
};

export default function RetailPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("stores");
  const [stores, setStores] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [nomenclature, setNomenclature] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const empty = {
    code: "", name: "", store_type: "shop",
    address: "", city: "", region: "",
    phone: "", manager_name: "",
    open_time: "09:00", close_time: "21:00",
    pricing_type: "retail",
    is_main: false, has_kkm: true, kkm_number: "",
    notes: "",
  };
  const [form, setForm] = useState(empty);

  const [showStockForm, setShowStockForm] = useState(false);
  const [stockForm, setStockForm] = useState({ store_id: "", nomenclature_id: "", quantity: "0", min_stock: "0" });

  const [transferForm, setTransferForm] = useState({
    from_store_id: "",
    to_store_id: "",
    items: [] as { nomenclature_id: string; name: string; unit: string; quantity: number; available: number }[],
    notes: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [s, st, n, p, sh] = await Promise.all([
      supabase.from("retail_stores").select("*").eq("user_id", user.id).order("name"),
      supabase.from("store_stocks").select("*").eq("user_id", user.id),
      supabase.from("nomenclature").select("*").eq("user_id", user.id).order("name"),
      supabase.from("pos_receipts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("pos_shifts").select("*").eq("user_id", user.id),
    ]);
    setStores(s.data || []);
    setStocks(st.data || []);
    setNomenclature(n.data || []);
    setPos(p.data || []);
    setShifts(sh.data || []);
  }

  function startCreate() { setEditing(null); setForm(empty); setShowForm(true); }
  function startEdit(s: any) {
    setEditing(s);
    setForm({
      code: s.code || "", name: s.name, store_type: s.store_type || "shop",
      address: s.address || "", city: s.city || "", region: s.region || "",
      phone: s.phone || "", manager_name: s.manager_name || "",
      open_time: s.open_time || "09:00", close_time: s.close_time || "21:00",
      pricing_type: s.pricing_type || "retail",
      is_main: !!s.is_main, has_kkm: !!s.has_kkm,
      kkm_number: s.kkm_number || "", notes: s.notes || "",
    });
    setShowForm(true);
  }

  async function saveStore() {
    if (!form.name) { setMsg("❌ Укажите название"); setTimeout(() => setMsg(""), 3000); return; }
    if (form.is_main && !editing) {
      await supabase.from("retail_stores").update({ is_main: false }).eq("user_id", userId);
    }
    const data = { user_id: userId, ...form };
    if (editing) await supabase.from("retail_stores").update(data).eq("id", editing.id);
    else await supabase.from("retail_stores").insert(data);
    setMsg(`✅ ${editing ? "Обновлено" : "Создано"}: ${form.name}`);
    setShowForm(false); setEditing(null); load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteStore(id: string) {
    if (!confirm("Удалить магазин? Связанные остатки также удалятся.")) return;
    await supabase.from("retail_stores").delete().eq("id", id);
    load();
  }

  async function addStock() {
    if (!stockForm.store_id || !stockForm.nomenclature_id) {
      setMsg("❌ Выберите магазин и товар"); setTimeout(() => setMsg(""), 3000); return;
    }
    const n = nomenclature.find(x => x.id === stockForm.nomenclature_id);
    if (!n) return;
    const existing = stocks.find(s => s.store_id === stockForm.store_id && s.nomenclature_id === stockForm.nomenclature_id);
    if (existing) {
      await supabase.from("store_stocks").update({
        quantity: Number(stockForm.quantity),
        min_stock: Number(stockForm.min_stock),
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("store_stocks").insert({
        user_id: userId,
        store_id: stockForm.store_id,
        nomenclature_id: stockForm.nomenclature_id,
        product_name: n.name,
        quantity: Number(stockForm.quantity),
        min_stock: Number(stockForm.min_stock),
      });
    }
    setStockForm({ store_id: "", nomenclature_id: "", quantity: "0", min_stock: "0" });
    setShowStockForm(false);
    setMsg("✅ Остаток установлен");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteStock(id: string) {
    if (!confirm("Убрать товар из остатков?")) return;
    await supabase.from("store_stocks").delete().eq("id", id);
    load();
  }

  function selectFromStore(id: string) { setTransferForm({ ...transferForm, from_store_id: id, items: [] }); }
  function addTransferItem() {
    setTransferForm({ ...transferForm, items: [...transferForm.items, { nomenclature_id: "", name: "", unit: "шт", quantity: 0, available: 0 }] });
  }
  function selectTransferItem(i: number, nomId: string) {
    const n = nomenclature.find(x => x.id === nomId);
    const stock = stocks.find(s => s.store_id === transferForm.from_store_id && s.nomenclature_id === nomId);
    if (!n) return;
    const it = [...transferForm.items];
    it[i] = { nomenclature_id: nomId, name: n.name, unit: n.unit, quantity: 0, available: Number(stock?.quantity || 0) };
    setTransferForm({ ...transferForm, items: it });
  }
  function updTransferQty(i: number, qty: number) {
    const it = [...transferForm.items]; it[i].quantity = qty;
    setTransferForm({ ...transferForm, items: it });
  }
  function removeTransferItem(i: number) {
    setTransferForm({ ...transferForm, items: transferForm.items.filter((_, idx) => idx !== i) });
  }

  async function executeTransfer() {
    if (!transferForm.from_store_id || !transferForm.to_store_id) { setMsg("❌ Выберите оба магазина"); setTimeout(() => setMsg(""), 3000); return; }
    if (transferForm.from_store_id === transferForm.to_store_id) { setMsg("❌ Магазины должны быть разными"); setTimeout(() => setMsg(""), 3000); return; }
    if (transferForm.items.length === 0) { setMsg("❌ Добавьте позиции"); setTimeout(() => setMsg(""), 3000); return; }
    for (const it of transferForm.items) {
      if (it.quantity <= 0) { setMsg(`❌ Количество > 0 для ${it.name}`); setTimeout(() => setMsg(""), 3000); return; }
      if (it.quantity > it.available) { setMsg(`❌ Недостаточно ${it.name}: доступно ${it.available}`); setTimeout(() => setMsg(""), 3000); return; }
    }
    if (!confirm(`Переместить ${transferForm.items.length} позиций?`)) return;

    for (const it of transferForm.items) {
      const fromStock = stocks.find(s => s.store_id === transferForm.from_store_id && s.nomenclature_id === it.nomenclature_id);
      if (fromStock) {
        await supabase.from("store_stocks").update({ quantity: Number(fromStock.quantity) - it.quantity, updated_at: new Date().toISOString() }).eq("id", fromStock.id);
      }
      const toStock = stocks.find(s => s.store_id === transferForm.to_store_id && s.nomenclature_id === it.nomenclature_id);
      if (toStock) {
        await supabase.from("store_stocks").update({ quantity: Number(toStock.quantity) + it.quantity, updated_at: new Date().toISOString() }).eq("id", toStock.id);
      } else {
        await supabase.from("store_stocks").insert({
          user_id: userId, store_id: transferForm.to_store_id, nomenclature_id: it.nomenclature_id,
          product_name: it.name, quantity: it.quantity,
        });
      }
    }
    setMsg(`✅ Перемещено ${transferForm.items.length} позиций`);
    setTransferForm({ from_store_id: "", to_store_id: "", items: [], notes: "" });
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  // KPI
  const activeStores = stores.filter(s => s.is_active !== false).length;
  const totalSku = new Set(stocks.map(s => s.nomenclature_id)).size;
  const totalStockValue = stocks.reduce((a, s) => {
    const n = nomenclature.find(x => x.id === s.nomenclature_id);
    return a + Number(s.quantity) * Number(n?.purchase_price || 0);
  }, 0);
  const lowStockCount = stocks.filter(s => Number(s.quantity) < Number(s.min_stock) && Number(s.min_stock) > 0).length;

  const salesByStore = stores.map(s => {
    const storeReceipts = pos.filter(r => r.store_id === s.id);
    const storeShifts = shifts.filter(sh => sh.store_id === s.id);
    return {
      store: s,
      receipts: storeReceipts.length,
      total: storeReceipts.reduce((a, r) => a + Number(r.total_sum || 0), 0),
      shifts: storeShifts.length,
    };
  });

  const filteredStocks = storeFilter === "all" ? stocks : stocks.filter(s => s.store_id === storeFilter);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Розничные точки — магазины, киоски, павильоны, интернет-магазин. Остатки по каждой точке отдельно, перемещения, аналитика продаж.
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🏬 Точек продаж</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{activeStores}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {stores.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📦 SKU в магазинах</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{totalSku}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Уникальных позиций</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Стоимость остатков</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(totalStockValue)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По закупочным</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⚠ Заканчивается</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{lowStockCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Ниже мин. остатка</div>
        </div>
      </div>

      <div className="flex gap-2">
        {([
          ["stores", "🏬 Магазины"],
          ["stocks", "📦 Остатки по точкам"],
          ["transfer", "🔁 Перемещение"],
          ["sales", "📊 Продажи по точкам"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "stores" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Реестр торговых точек с реквизитами и графиком работы</div>
            <button onClick={startCreate} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить точку</button>
          </div>

          {showForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{editing ? "Редактирование" : "Новая точка продаж"}</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="МАГ-01" /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={form.store_type} onChange={e => setForm({ ...form, store_type: e.target.value })}>
                    {Object.entries(STORE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Регион</label><input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Город</label><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Адрес</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Телефон</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Менеджер</label><input value={form.manager_name} onChange={e => setForm({ ...form, manager_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Открытие</label><input type="time" value={form.open_time} onChange={e => setForm({ ...form, open_time: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Закрытие</label><input type="time" value={form.close_time} onChange={e => setForm({ ...form, close_time: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип цен</label>
                  <select value={form.pricing_type} onChange={e => setForm({ ...form, pricing_type: e.target.value })}>
                    <option value="retail">Розничные</option>
                    <option value="wholesale">Оптовые</option>
                    <option value="special">Спец. цены</option>
                  </select>
                </div>
                <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_main} onChange={e => setForm({ ...form, is_main: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">⭐ Основная точка</span>
                  </label>
                </div>
                <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.has_kkm} onChange={e => setForm({ ...form, has_kkm: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">Есть ККМ</span>
                  </label>
                </div>
                {form.has_kkm && <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Регистр. № ККМ</label><input value={form.kkm_number} onChange={e => setForm({ ...form, kkm_number: e.target.value })} /></div>}
                <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveStore} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            {stores.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет точек продаж. Создайте первую.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {stores.map(s => {
                  const t = STORE_TYPES[s.store_type] || STORE_TYPES.shop;
                  const skuCount = stocks.filter(x => x.store_id === s.id).length;
                  return (
                    <div key={s.id} className="rounded-lg p-4" style={{ background: "var(--bg)", border: s.is_main ? "2px solid #F59E0B" : "1px solid var(--brd)" }}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-start gap-2">
                          <span style={{ fontSize: 24 }}>{t.icon}</span>
                          <div>
                            <div className="text-sm font-bold flex items-center gap-2">
                              {s.name}
                              {s.is_main && <span className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>⭐ ОСНОВНАЯ</span>}
                            </div>
                            <div className="text-[11px]" style={{ color: "var(--t3)" }}>{t.name}{s.code ? ` • ${s.code}` : ""}</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(s)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>✏</button>
                          <button onClick={() => deleteStore(s.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                        </div>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                        {s.address && <div>📍 {s.address}{s.city ? `, ${s.city}` : ""}</div>}
                        {s.phone && <div>📞 {s.phone}</div>}
                        {s.manager_name && <div>👤 {s.manager_name}</div>}
                        {s.open_time && <div>🕐 {s.open_time} − {s.close_time}</div>}
                        {s.has_kkm && <div>🧾 ККМ: {s.kkm_number || "не указан"}</div>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
                        <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>SKU</div><div className="text-sm font-bold" style={{ color: "#10B981" }}>{skuCount}</div></div>
                        <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Цены</div><div className="text-sm font-bold">{s.pricing_type}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "stocks" && (
        <>
          <div className="flex justify-between items-center">
            <div className="flex gap-3 items-center">
              <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} style={{ width: 250 }}>
                <option value="all">Все точки</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span className="text-[11px]" style={{ color: "var(--t3)" }}>{filteredStocks.length} позиций</span>
            </div>
            <button onClick={() => setShowStockForm(!showStockForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить остаток</button>
          </div>

          {showStockForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Магазин</label>
                  <select value={stockForm.store_id} onChange={e => setStockForm({ ...stockForm, store_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Товар</label>
                  <select value={stockForm.nomenclature_id} onChange={e => setStockForm({ ...stockForm, nomenclature_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {nomenclature.map(n => <option key={n.id} value={n.id}>{n.name} ({n.unit})</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Остаток</label><input type="number" step="0.001" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} /></div>
                <div className="col-span-4"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Мин. остаток</label><input type="number" step="0.001" value={stockForm.min_stock} onChange={e => setStockForm({ ...stockForm, min_stock: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addStock} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Сохранить</button>
                <button onClick={() => setShowStockForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Магазин", "Товар", "Остаток", "Мин.", "Цена", "Сумма", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filteredStocks.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет остатков</td></tr>
                ) : filteredStocks.map(s => {
                  const store = stores.find(x => x.id === s.store_id);
                  const n = nomenclature.find(x => x.id === s.nomenclature_id);
                  const isLow = Number(s.quantity) < Number(s.min_stock) && Number(s.min_stock) > 0;
                  const price = Number(n?.purchase_price || 0);
                  return (
                    <tr key={s.id}>
                      <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{store?.name || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{s.product_name || n?.name}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ color: isLow ? "#EF4444" : "var(--t1)", borderBottom: "1px solid var(--brd)" }}>
                        {Number(s.quantity).toFixed(3)} {n?.unit || ""}
                        {isLow && <span className="text-[9px] ml-2 px-1.5 py-0.5 rounded" style={{ background: "#EF444420", color: "#EF4444" }}>⚠</span>}
                      </td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{Number(s.min_stock).toFixed(3)}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(price)} ₸</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(s.quantity) * price)} ₸</td>
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

      {tab === "transfer" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">🔁 Перемещение товаров между точками</div>
          <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>Уменьшает остаток на источнике, увеличивает на приёмнике</div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>📤 ИЗ магазина (источник)</label>
              <select value={transferForm.from_store_id} onChange={e => selectFromStore(e.target.value)}>
                <option value="">— Выбрать —</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>📥 В магазин (приёмник)</label>
              <select value={transferForm.to_store_id} onChange={e => setTransferForm({ ...transferForm, to_store_id: e.target.value })}>
                <option value="">— Выбрать —</option>
                {stores.filter(s => s.id !== transferForm.from_store_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {transferForm.from_store_id && (
            <>
              <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📦 ТОВАРЫ К ПЕРЕМЕЩЕНИЮ</div>
              <div className="rounded-lg p-2 mb-3" style={{ background: "var(--bg)" }}>
                {transferForm.items.length === 0 && <div className="text-xs py-3 text-center" style={{ color: "var(--t3)" }}>Добавьте позиции</div>}
                {transferForm.items.map((it, i) => (
                  <div key={i} className="grid items-end gap-2 mb-2" style={{ gridTemplateColumns: "1fr 100px 120px 30px" }}>
                    <select value={it.nomenclature_id} onChange={e => selectTransferItem(i, e.target.value)} style={{ fontSize: 11 }}>
                      <option value="">— Выбрать товар —</option>
                      {nomenclature.map(n => {
                        const stock = stocks.find(s => s.store_id === transferForm.from_store_id && s.nomenclature_id === n.id);
                        const avail = stock ? Number(stock.quantity) : 0;
                        return <option key={n.id} value={n.id} disabled={avail === 0}>{n.name} ({n.unit}) — доступно: {avail}</option>;
                      })}
                    </select>
                    <input type="number" step="0.001" value={it.quantity} max={it.available} onChange={e => updTransferQty(i, Number(e.target.value))} placeholder="Кол-во" style={{ fontSize: 11 }} />
                    <span className="text-[10px] pb-2" style={{ color: it.quantity > it.available ? "#EF4444" : "var(--t3)" }}>{it.unit} • макс {it.available}</span>
                    <button onClick={() => removeTransferItem(i)} className="text-sm cursor-pointer border-none bg-transparent pb-2" style={{ color: "#EF4444" }}>×</button>
                  </div>
                ))}
                <button onClick={addTransferItem} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить позицию</button>
              </div>

              <button onClick={executeTransfer} disabled={transferForm.items.length === 0 || !transferForm.to_store_id} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981", opacity: (transferForm.items.length === 0 || !transferForm.to_store_id) ? 0.5 : 1 }}>
                ✓ Выполнить перемещение
              </button>
            </>
          )}
        </div>
      )}

      {tab === "sales" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">📊 Продажи по точкам (из POS-чеков)</div>
          {salesByStore.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет точек</div>
          ) : (
            <div className="flex flex-col gap-3">
              {salesByStore.sort((a, b) => b.total - a.total).map(({ store, receipts, total, shifts: sCnt }) => {
                const t = STORE_TYPES[store.store_type] || STORE_TYPES.shop;
                const max = Math.max(...salesByStore.map(s => s.total), 1);
                const pct = (total / max) * 100;
                return (
                  <div key={store.id} className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 20 }}>{t.icon}</span>
                        <div>
                          <div className="text-sm font-bold">{store.name}</div>
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>{receipts} чеков • {sCnt} смен</div>
                        </div>
                      </div>
                      <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(total)} ₸</div>
                    </div>
                    <div style={{ height: 6, background: "var(--card)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#10B981" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
