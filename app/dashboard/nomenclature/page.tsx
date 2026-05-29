"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "list" | "categories" | "price-types";

const ITEM_TYPES = {
  goods: { name: "Товар", icon: "📦", color: "#3B82F6" },
  service: { name: "Услуга", icon: "🛠", color: "#A855F7" },
  work: { name: "Работа", icon: "🔧", color: "#10B981" },
  material: { name: "Материал", icon: "🪨", color: "#F59E0B" },
  finished_product: { name: "Гот. продукция", icon: "🏭", color: "#EC4899" },
  semi_product: { name: "Полуфабрикат", icon: "🔩", color: "#6366F1" },
  set: { name: "Комплект/Набор", icon: "🎁", color: "#EF4444" },
};

const COMMON_UNITS = ["шт", "кг", "г", "т", "л", "мл", "м", "см", "м²", "м³", "ч", "усл.ед", "комплект", "упак"];

const ACCOUNTS = {
  income: [
    { code: "6010", name: "Выручка от реализации товаров" },
    { code: "6020", name: "Выручка от услуг и работ" },
    { code: "6280", name: "Прочие доходы" },
  ],
  expense: [
    { code: "7010", name: "Себестоимость реализованных товаров" },
    { code: "7110", name: "Расходы на персонал" },
    { code: "7210", name: "Административные расходы" },
  ],
  inventory: [
    { code: "1310", name: "Сырьё и материалы" },
    { code: "1320", name: "Готовая продукция" },
    { code: "1330", name: "Товары" },
    { code: "1350", name: "Прочие запасы" },
  ],
};

interface Characteristic { key: string; value: string; }
interface SetComponent { nomenclature_id: string; name: string; quantity: number; }

export default function NomenclaturePage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("list");
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [priceTypes, setPriceTypes] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all");

  // Item form
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const emptyForm = {
    code: "", name: "", full_name: "",
    category_id: "", item_type: "goods",
    sku: "", barcode: "", article: "",
    unit: "шт", weight_kg: "", volume_m3: "",
    manufacturer: "", country: "",
    vat_rate: "16", vat_included: true,
    income_account: "6010", expense_account: "7010", inventory_account: "1330",
    purchase_price: "0", base_price: "0", retail_price: "", wholesale_price: "",
    quantity: "0", min_stock: "0", max_stock: "",
    description: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [characteristics, setCharacteristics] = useState<Characteristic[]>([]);
  const [setComponents, setSetComponents] = useState<SetComponent[]>([]);

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", parent_id: "", description: "" });
  const [editingCat, setEditingCat] = useState<any>(null);

  // Price type form
  const [showPtForm, setShowPtForm] = useState(false);
  const [ptForm, setPtForm] = useState({ code: "", name: "", description: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [n, c, p] = await Promise.all([
      supabase.from("nomenclature").select("*").eq("user_id", user.id).order("name"),
      supabase.from("nomenclature_categories").select("*").eq("user_id", user.id).order("sort_order").order("name"),
      supabase.from("nomenclature_price_types").select("*").eq("user_id", user.id),
    ]);
    setItems(n.data || []);
    setCategories(c.data || []);
    setPriceTypes(p.data || []);
  }

  // ═══ КАТЕГОРИИ ═══
  async function saveCategory() {
    if (!catForm.name) { setMsg("❌ Укажите название категории"); setTimeout(() => setMsg(""), 3000); return; }
    const data = { user_id: userId, name: catForm.name, parent_id: catForm.parent_id || null, description: catForm.description };
    if (editingCat) await supabase.from("nomenclature_categories").update(data).eq("id", editingCat.id);
    else await supabase.from("nomenclature_categories").insert(data);
    setCatForm({ name: "", parent_id: "", description: "" });
    setEditingCat(null);
    setShowCatForm(false);
    setMsg("✅ Категория сохранена");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteCategory(id: string) {
    if (!confirm("Удалить категорию? Товары останутся, но потеряют категорию.")) return;
    await supabase.from("nomenclature_categories").delete().eq("id", id);
    load();
  }

  function startEditCategory(c: any) {
    setEditingCat(c);
    setCatForm({ name: c.name, parent_id: c.parent_id || "", description: c.description || "" });
    setShowCatForm(true);
  }

  // ═══ ТИПЫ ЦЕН ═══
  async function savePriceType() {
    if (!ptForm.code || !ptForm.name) { setMsg("❌ Заполните код и название"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("nomenclature_price_types").insert({ user_id: userId, ...ptForm });
    setPtForm({ code: "", name: "", description: "" });
    setShowPtForm(false);
    load();
  }

  async function deletePriceType(id: string) {
    if (!confirm("Удалить тип цен?")) return;
    await supabase.from("nomenclature_price_types").delete().eq("id", id);
    load();
  }

  async function loadDefaultPriceTypes() {
    if (priceTypes.length > 0 && !confirm("Уже есть типы цен. Добавить стандартные сверху?")) return;
    const defaults = [
      { code: "RETAIL", name: "Розничная", is_default: true },
      { code: "WHOLESALE", name: "Оптовая" },
      { code: "PURCHASE", name: "Закупочная" },
      { code: "SPECIAL", name: "Спец. цена" },
      { code: "PROMO", name: "Акция" },
    ];
    await supabase.from("nomenclature_price_types").insert(defaults.map(d => ({ ...d, user_id: userId })));
    setMsg(`✅ Добавлено ${defaults.length} типов цен`);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  // ═══ НОМЕНКЛАТУРА ═══
  function startCreate() {
    setEditingItem(null);
    setForm(emptyForm);
    setCharacteristics([]);
    setSetComponents([]);
    setShowForm(true);
  }

  function startEdit(item: any) {
    setEditingItem(item);
    setForm({
      code: item.code || "",
      name: item.name,
      full_name: item.full_name || "",
      category_id: item.category_id || "",
      item_type: item.item_type || "goods",
      sku: item.sku || "",
      barcode: item.barcode || "",
      article: item.article || "",
      unit: item.unit,
      weight_kg: String(item.weight_kg || ""),
      volume_m3: String(item.volume_m3 || ""),
      manufacturer: item.manufacturer || "",
      country: item.country || "",
      vat_rate: String(item.vat_rate || 16),
      vat_included: !!item.vat_included,
      income_account: item.income_account || "6010",
      expense_account: item.expense_account || "7010",
      inventory_account: item.inventory_account || "1330",
      purchase_price: String(item.purchase_price || 0),
      base_price: String(item.base_price || 0),
      retail_price: String(item.retail_price || ""),
      wholesale_price: String(item.wholesale_price || ""),
      quantity: String(item.quantity || 0),
      min_stock: String(item.min_stock || 0),
      max_stock: String(item.max_stock || ""),
      description: item.description || "",
    });
    setCharacteristics(item.characteristics || []);
    setSetComponents(item.set_components || []);
    setShowForm(true);
  }

  async function saveItem() {
    if (!form.name) { setMsg("❌ Укажите название"); setTimeout(() => setMsg(""), 3000); return; }
    const cat = categories.find(c => c.id === form.category_id);
    const data = {
      user_id: userId,
      code: form.code || null,
      name: form.name,
      full_name: form.full_name || form.name,
      category_id: form.category_id || null,
      category_name: cat?.name || null,
      item_type: form.item_type,
      sku: form.sku || null,
      barcode: form.barcode || null,
      article: form.article || null,
      unit: form.unit,
      weight_kg: Number(form.weight_kg) || null,
      volume_m3: Number(form.volume_m3) || null,
      manufacturer: form.manufacturer || null,
      country: form.country || null,
      vat_rate: Number(form.vat_rate),
      vat_included: form.vat_included,
      income_account: form.income_account,
      expense_account: form.expense_account,
      inventory_account: form.inventory_account,
      purchase_price: Number(form.purchase_price) || 0,
      base_price: Number(form.base_price) || 0,
      retail_price: Number(form.retail_price) || null,
      wholesale_price: Number(form.wholesale_price) || null,
      quantity: Number(form.quantity) || 0,
      min_stock: Number(form.min_stock) || 0,
      max_stock: Number(form.max_stock) || null,
      characteristics,
      set_components: form.item_type === "set" ? setComponents : [],
      description: form.description || null,
      updated_at: new Date().toISOString(),
    };

    if (editingItem) await supabase.from("nomenclature").update(data).eq("id", editingItem.id);
    else await supabase.from("nomenclature").insert(data);

    setMsg(`✅ ${editingItem ? "Изменено" : "Создано"}: ${form.name}`);
    setShowForm(false);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteItem(id: string) {
    if (!confirm("Удалить позицию из номенклатуры?")) return;
    await supabase.from("nomenclature").delete().eq("id", id);
    load();
  }

  function addCharacteristic() {
    setCharacteristics([...characteristics, { key: "", value: "" }]);
  }
  function updChar(i: number, field: "key" | "value", value: string) {
    const n = [...characteristics];
    n[i][field] = value;
    setCharacteristics(n);
  }
  function removeChar(i: number) {
    setCharacteristics(characteristics.filter((_, idx) => idx !== i));
  }

  function addSetComp() {
    setSetComponents([...setComponents, { nomenclature_id: "", name: "", quantity: 1 }]);
  }
  function updSetComp(i: number, productId: string) {
    const item = items.find(x => x.id === productId);
    if (item) {
      const n = [...setComponents];
      n[i] = { nomenclature_id: productId, name: item.name, quantity: n[i].quantity || 1 };
      setSetComponents(n);
    }
  }
  function updSetCompQty(i: number, qty: number) {
    const n = [...setComponents];
    n[i].quantity = qty;
    setSetComponents(n);
  }
  function removeSetComp(i: number) {
    setSetComponents(setComponents.filter((_, idx) => idx !== i));
  }

  async function importFromProducts() {
    if (!confirm("Импортировать товары из старого справочника products в номенклатуру?")) return;
    const { data: oldProducts } = await supabase.from("products").select("*").eq("user_id", userId);
    if (!oldProducts || oldProducts.length === 0) {
      setMsg("Нет товаров для импорта");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const toInsert = oldProducts.map((p: any) => ({
      user_id: userId,
      name: p.name,
      full_name: p.name,
      item_type: "goods",
      sku: p.sku || null,
      barcode: p.barcode || null,
      unit: p.unit || "шт",
      vat_rate: 16,
      vat_included: true,
      purchase_price: Number(p.price) || 0,
      base_price: Number(p.price) || 0,
      retail_price: Number(p.retail_price) || Number(p.price) || 0,
      quantity: Number(p.quantity) || 0,
      min_stock: Number(p.min_quantity) || 0,
    }));
    await supabase.from("nomenclature").insert(toInsert);
    setMsg(`✅ Импортировано ${toInsert.length} позиций`);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  // Filtered items
  const filteredItems = items.filter(i => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) &&
        !i.code?.toLowerCase().includes(search.toLowerCase()) &&
        !i.barcode?.includes(search) &&
        !i.sku?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory !== "all" && i.category_id !== filterCategory) return false;
    if (filterType !== "all" && i.item_type !== filterType) return false;
    return true;
  });

  // KPI
  const totalGoods = items.filter(i => i.item_type === "goods" || i.item_type === "finished_product").length;
  const totalServices = items.filter(i => i.item_type === "service" || i.item_type === "work").length;
  const totalValue = items.reduce((a, i) => a + Number(i.purchase_price || 0) * Number(i.quantity || 0), 0);
  const lowStock = items.filter(i => Number(i.quantity) < Number(i.min_stock) && Number(i.min_stock) > 0).length;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Единый справочник товаров, услуг, работ, материалов, готовой продукции и комплектов с категориями, характеристиками и многоуровневыми ценами
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📦 Позиций</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{items.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>В каталоге</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #3B82F6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🏷 Товары</div>
          <div className="text-xl font-bold" style={{ color: "#3B82F6" }}>{totalGoods}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Услуг: {totalServices}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💰 Стоимость остатков</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalValue)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По закупочным</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⚠ Заканчивается</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{lowStock}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Ниже мин. остатка</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        {([["list", "📦 Номенклатура"], ["categories", "📂 Категории"], ["price-types", "🏷 Типы цен"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
        {items.length === 0 && tab === "list" && (
          <button onClick={importFromProducts} className="ml-auto text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)" }}>
            📥 Импорт из товаров
          </button>
        )}
      </div>

      {/* ═══ НОМЕНКЛАТУРА ═══ */}
      {tab === "list" && (
        <>
          <div className="flex gap-2 items-center flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Поиск: название, код, штрихкод, SKU..." style={{ flex: 1, minWidth: 200 }} />
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ width: 200 }}>
              <option value="all">Все категории</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 180 }}>
              <option value="all">Все типы</option>
              {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
            </select>
            <button onClick={startCreate} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить</button>
          </div>

          {showForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-4">{editingItem ? "Редактирование номенклатуры" : "Новая позиция номенклатуры"}</div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📋 ОСНОВНОЕ</div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="N-0001" /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={form.item_type} onChange={e => setForm({ ...form, item_type: e.target.value })}>
                    {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Полное наименование</label><input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Для печатных форм" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Категория</label>
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">— Без категории —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ед. изм.</label>
                  <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} list="units-list" />
                  <datalist id="units-list">{COMMON_UNITS.map(u => <option key={u} value={u} />)}</datalist>
                </div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#10B981" }}>🏷 ИДЕНТИФИКАЦИЯ</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>SKU</label><input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Штрихкод</label><input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Артикул</label><input value={form.article} onChange={e => setForm({ ...form, article: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Производитель</label><input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Страна</label><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Вес (кг)</label><input type="number" step="0.001" value={form.weight_kg} onChange={e => setForm({ ...form, weight_kg: e.target.value })} /></div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#EC4899" }}>💰 ЦЕНЫ И НДС</div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Закупочная (₸)</label><input type="number" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Базовая (₸)</label><input type="number" value={form.base_price} onChange={e => setForm({ ...form, base_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Розничная (₸)</label><input type="number" value={form.retail_price} onChange={e => setForm({ ...form, retail_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Оптовая (₸)</label><input type="number" value={form.wholesale_price} onChange={e => setForm({ ...form, wholesale_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ставка НДС, %</label>
                  <select value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: e.target.value })}>
                    <option value="16">16% (стандарт)</option>
                    <option value="10">10% (льготная)</option>
                    <option value="5">5% (соц. товары)</option>
                    <option value="0">0% (экспорт)</option>
                  </select>
                </div>
                <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.vat_included} onChange={e => setForm({ ...form, vat_included: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">НДС в цене</span>
                  </label>
                </div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#F59E0B" }}>📊 ОСТАТКИ И БУХУЧЁТ</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Остаток</label><input type="number" step="0.001" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Мин. остаток</label><input type="number" step="0.001" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Макс. остаток</label><input type="number" step="0.001" value={form.max_stock} onChange={e => setForm({ ...form, max_stock: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сч. учёта запасов</label>
                  <select value={form.inventory_account} onChange={e => setForm({ ...form, inventory_account: e.target.value })}>
                    {ACCOUNTS.inventory.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сч. доходов</label>
                  <select value={form.income_account} onChange={e => setForm({ ...form, income_account: e.target.value })}>
                    {ACCOUNTS.income.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сч. расходов</label>
                  <select value={form.expense_account} onChange={e => setForm({ ...form, expense_account: e.target.value })}>
                    {ACCOUNTS.expense.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#A855F7" }}>🎨 ДОП. ХАРАКТЕРИСТИКИ (произвольные)</div>
              {characteristics.length === 0 && <div className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Например: Цвет = Красный, Размер = XL, Мощность = 500 Вт</div>}
              {characteristics.map((c, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input value={c.key} onChange={e => updChar(i, "key", e.target.value)} placeholder="Свойство (Цвет)" style={{ flex: 1 }} />
                  <input value={c.value} onChange={e => updChar(i, "value", e.target.value)} placeholder="Значение (Красный)" style={{ flex: 1 }} />
                  <button onClick={() => removeChar(i)} className="text-sm cursor-pointer border-none bg-transparent" style={{ color: "#EF4444", padding: "0 8px" }}>×</button>
                </div>
              ))}
              <button onClick={addCharacteristic} className="text-xs px-3 py-1 rounded-lg cursor-pointer mb-3" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить характеристику</button>

              {form.item_type === "set" && (
                <>
                  <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#EF4444" }}>🎁 СОСТАВ КОМПЛЕКТА</div>
                  {setComponents.map((sc, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <select value={sc.nomenclature_id} onChange={e => updSetComp(i, e.target.value)} style={{ flex: 1 }}>
                        <option value="">— Выбрать позицию —</option>
                        {items.filter(x => x.item_type !== "set" && x.id !== editingItem?.id).map(x => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                      </select>
                      <input type="number" value={sc.quantity} onChange={e => updSetCompQty(i, Number(e.target.value))} style={{ width: 100 }} />
                      <button onClick={() => removeSetComp(i)} className="text-sm cursor-pointer border-none bg-transparent" style={{ color: "#EF4444", padding: "0 8px" }}>×</button>
                    </div>
                  ))}
                  <button onClick={addSetComp} className="text-xs px-3 py-1 rounded-lg cursor-pointer mb-3" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить компонент</button>
                </>
              )}

              <div className="mb-4">
                <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} style={{ width: "100%", padding: 8, fontSize: 12 }} />
              </div>

              <div className="flex gap-2">
                <button onClick={saveItem} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 {editingItem ? "Сохранить" : "Создать"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Код", "Наименование", "Тип", "Категория", "Ед.", "Закуп.", "Розн.", "Остаток", "НДС", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>
                    {items.length === 0 ? "Нет позиций. Создайте первую или импортируйте из старого справочника товаров." : "Ничего не найдено по фильтрам"}
                  </td></tr>
                ) : filteredItems.map(it => {
                  const t = ITEM_TYPES[it.item_type as keyof typeof ITEM_TYPES] || ITEM_TYPES.goods;
                  const isLow = Number(it.quantity) < Number(it.min_stock) && Number(it.min_stock) > 0;
                  return (
                    <tr key={it.id}>
                      <td className="p-2.5 text-[11px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{it.code || "—"}</td>
                      <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {it.name}
                        {it.barcode && <div className="text-[9px] font-mono" style={{ color: "var(--t3)" }}>📷 {it.barcode}</div>}
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>
                          {t.icon} {t.name}
                        </span>
                      </td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{it.category_name || "—"}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{it.unit}</td>
                      <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(it.purchase_price))}</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{it.retail_price ? fmtMoney(Number(it.retail_price)) : "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: isLow ? "#EF4444" : "var(--t1)", fontWeight: isLow ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>
                        {Number(it.quantity).toLocaleString("ru-RU")} {it.unit}
                      </td>
                      <td className="p-2.5 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{it.vat_rate}%</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => startEdit(it)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>✏</button>
                        <button onClick={() => deleteItem(it.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ КАТЕГОРИИ ═══ */}
      {tab === "categories" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Иерархическая структура категорий (родительская → подкатегории)</div>
            <button onClick={() => { setEditingCat(null); setCatForm({ name: "", parent_id: "", description: "" }); setShowCatForm(!showCatForm); }} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              + Новая категория
            </button>
          </div>

          {showCatForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{editingCat ? "Редактирование категории" : "Новая категория"}</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название</label><input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} placeholder="Электроника" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Родительская категория</label>
                  <select value={catForm.parent_id} onChange={e => setCatForm({ ...catForm, parent_id: e.target.value })}>
                    <option value="">— Корневая —</option>
                    {categories.filter(c => c.id !== editingCat?.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCategory} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Сохранить</button>
                <button onClick={() => setShowCatForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            {categories.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет категорий</div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Отрисовываем иерархию */}
                {categories.filter(c => !c.parent_id).map(parent => {
                  const children = categories.filter(c => c.parent_id === parent.id);
                  const itemsInCat = items.filter(i => i.category_id === parent.id).length;
                  return (
                    <div key={parent.id} className="rounded-lg" style={{ background: "var(--bg)", padding: 12 }}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-bold">📂 {parent.name}</div>
                          {parent.description && <div className="text-[11px]" style={{ color: "var(--t3)" }}>{parent.description}</div>}
                          <div className="text-[10px]" style={{ color: "var(--t3)" }}>{itemsInCat} позиций</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEditCategory(parent)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>✏</button>
                          <button onClick={() => deleteCategory(parent.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                        </div>
                      </div>
                      {children.length > 0 && (
                        <div className="mt-2 ml-4 flex flex-col gap-1">
                          {children.map(c => {
                            const cnt = items.filter(i => i.category_id === c.id).length;
                            return (
                              <div key={c.id} className="flex justify-between items-center py-1 px-2 rounded" style={{ background: "var(--card)" }}>
                                <div>
                                  <div className="text-xs font-semibold">└ {c.name}</div>
                                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{cnt} позиций</div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => startEditCategory(c)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>✏</button>
                                  <button onClick={() => deleteCategory(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ ТИПЫ ЦЕН ═══ */}
      {tab === "price-types" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Типы цен (Розничная, Оптовая, Закупочная и т.д.) — для разных категорий клиентов</div>
            <div className="flex gap-2">
              {priceTypes.length === 0 && (
                <button onClick={loadDefaultPriceTypes} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)" }}>
                  📥 Загрузить стандартные
                </button>
              )}
              <button onClick={() => setShowPtForm(!showPtForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
                + Новый тип цен
              </button>
            </div>
          </div>

          {showPtForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label><input value={ptForm.code} onChange={e => setPtForm({ ...ptForm, code: e.target.value })} placeholder="WHOLESALE" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название</label><input value={ptForm.name} onChange={e => setPtForm({ ...ptForm, name: e.target.value })} placeholder="Оптовая" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={ptForm.description} onChange={e => setPtForm({ ...ptForm, description: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={savePriceType} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Создать</button>
                <button onClick={() => setShowPtForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Код", "Название", "Описание", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {priceTypes.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет типов цен. Загрузите стандартные.</td></tr>
                ) : priceTypes.map(p => (
                  <tr key={p.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{p.code}</td>
                    <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>
                      {p.name}
                      {p.is_default && <span className="text-[9px] ml-2 px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>ПО УМОЛЧАНИЮ</span>}
                    </td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.description || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deletePriceType(p.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
