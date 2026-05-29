"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "list" | "card";
type CardTab = "info" | "history" | "balance" | "contacts" | "notes" | "contracts";

const CP_TYPES = {
  company: { name: "Юр. лицо", icon: "🏢", color: "#6366F1" },
  individual: { name: "Физ. лицо / ИП", icon: "👤", color: "#10B981" },
  gov: { name: "Гос. учреждение", icon: "🏛", color: "#F59E0B" },
  foreign: { name: "Иностранный", icon: "🌐", color: "#EC4899" },
};

const CP_ROLES = {
  customer: { name: "Покупатель", color: "#10B981" },
  supplier: { name: "Поставщик", color: "#3B82F6" },
  both: { name: "Покупатель + Поставщик", color: "#A855F7" },
  employee: { name: "Сотрудник", color: "#F59E0B" },
  other: { name: "Прочий", color: "#6B7280" },
};

const NOTE_TYPES = {
  general: { name: "Общая заметка", icon: "📝" },
  meeting: { name: "Встреча", icon: "🤝" },
  call: { name: "Звонок", icon: "📞" },
  email: { name: "Email", icon: "📧" },
  visit: { name: "Визит", icon: "🚶" },
  complaint: { name: "Жалоба", icon: "⚠" },
};

const LEGAL_FORMS = ["ТОО", "ИП", "АО", "ГУ", "ОЮЛ", "ПК", "ОДО", "Физ. лицо", "Иностранная компания"];

export default function CounterpartiesPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("list");
  const [cardTab, setCardTab] = useState<CardTab>("info");
  const [items, setItems] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Selected
  const [selected, setSelected] = useState<any>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const emptyForm = {
    name: "", bin: "",
    counterparty_type: "company", counterparty_role: "both",
    legal_form: "ТОО",
    legal_address: "", actual_address: "",
    country: "Казахстан", region: "", city: "",
    phone: "", email: "", website: "",
    director_name: "", director_position: "Директор", accountant_name: "",
    bank_name: "", bank_iik: "", bank_bik: "",
    is_nds_payer: false, nds_certificate: "", okpo: "", oked: "",
    rating: 3, credit_limit: "0", payment_terms_days: "0",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ full_name: "", position: "", phone: "", email: "", is_primary: false, notes: "" });

  // Note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ note_date: new Date().toISOString().slice(0, 10), note_type: "general", subject: "", content: "", author_name: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [c, d, ctr, o, cn, n] = await Promise.all([
      supabase.from("counterparties").select("*").eq("user_id", user.id).order("name"),
      supabase.from("documents").select("*").eq("user_id", user.id),
      supabase.from("contracts").select("*").eq("user_id", user.id),
      supabase.from("orders").select("*").eq("user_id", user.id),
      supabase.from("counterparty_contacts").select("*").eq("user_id", user.id),
      supabase.from("counterparty_notes").select("*").eq("user_id", user.id).order("note_date", { ascending: false }),
    ]);
    setItems(c.data || []);
    setDocs(d.data || []);
    setContracts(ctr.data || []);
    setOrders(o.data || []);
    setContacts(cn.data || []);
    setNotes(n.data || []);

    // Refresh selected if exists
    if (selected) {
      const updated = (c.data || []).find((x: any) => x.id === selected.id);
      if (updated) setSelected(updated);
    }
  }

  // ═══ КАРТОЧКА ═══
  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(c: any) {
    setEditing(c);
    setForm({
      name: c.name || "",
      bin: c.bin || "",
      counterparty_type: c.counterparty_type || "company",
      counterparty_role: c.counterparty_role || "both",
      legal_form: c.legal_form || "ТОО",
      legal_address: c.legal_address || "",
      actual_address: c.actual_address || "",
      country: c.country || "Казахстан",
      region: c.region || "",
      city: c.city || "",
      phone: c.phone || "",
      email: c.email || "",
      website: c.website || "",
      director_name: c.director_name || "",
      director_position: c.director_position || "Директор",
      accountant_name: c.accountant_name || "",
      bank_name: c.bank_name || "",
      bank_iik: c.bank_iik || "",
      bank_bik: c.bank_bik || "",
      is_nds_payer: !!c.is_nds_payer,
      nds_certificate: c.nds_certificate || "",
      okpo: c.okpo || "",
      oked: c.oked || "",
      rating: c.rating || 3,
      credit_limit: String(c.credit_limit || 0),
      payment_terms_days: String(c.payment_terms_days || 0),
      notes: c.notes || "",
    });
    setShowForm(true);
  }

  async function saveItem() {
    if (!form.name) { setMsg("❌ Укажите наименование"); setTimeout(() => setMsg(""), 3000); return; }
    const data: any = {
      user_id: userId,
      ...form,
      rating: Number(form.rating),
      credit_limit: Number(form.credit_limit) || 0,
      payment_terms_days: Number(form.payment_terms_days) || 0,
    };
    if (editing) await supabase.from("counterparties").update(data).eq("id", editing.id);
    else await supabase.from("counterparties").insert(data);
    setMsg(`✅ ${editing ? "Обновлено" : "Создано"}: ${form.name}`);
    setShowForm(false);
    setEditing(null);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteItem(id: string) {
    if (!confirm("Удалить контрагента? Все связи с документами останутся, но потеряют связь.")) return;
    await supabase.from("counterparties").delete().eq("id", id);
    if (selected?.id === id) { setSelected(null); setTab("list"); }
    load();
  }

  // ═══ КОНТАКТЫ ═══
  async function addContact() {
    if (!contactForm.full_name || !selected) { setMsg("❌ Укажите ФИО"); setTimeout(() => setMsg(""), 3000); return; }
    if (contactForm.is_primary) {
      await supabase.from("counterparty_contacts").update({ is_primary: false }).eq("counterparty_id", selected.id);
    }
    await supabase.from("counterparty_contacts").insert({
      user_id: userId,
      counterparty_id: selected.id,
      ...contactForm,
    });
    setContactForm({ full_name: "", position: "", phone: "", email: "", is_primary: false, notes: "" });
    setShowContactForm(false);
    load();
  }

  async function deleteContact(id: string) {
    if (!confirm("Удалить контакт?")) return;
    await supabase.from("counterparty_contacts").delete().eq("id", id);
    load();
  }

  // ═══ ЗАМЕТКИ ═══
  async function addNote() {
    if (!noteForm.subject || !selected) { setMsg("❌ Укажите тему заметки"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("counterparty_notes").insert({
      user_id: userId,
      counterparty_id: selected.id,
      ...noteForm,
    });
    setNoteForm({ note_date: new Date().toISOString().slice(0, 10), note_type: "general", subject: "", content: "", author_name: "" });
    setShowNoteForm(false);
    load();
  }

  async function deleteNote(id: string) {
    if (!confirm("Удалить заметку?")) return;
    await supabase.from("counterparty_notes").delete().eq("id", id);
    load();
  }

  // Helpers
  function getStats(cpId: string) {
    const cpDocs = docs.filter(d => d.counterparty_id === cpId);
    const cpContracts = contracts.filter(c => c.counterparty_id === cpId);
    const cpOrders = orders.filter(o => o.counterparty_id === cpId);

    let salesTotal = 0, purchasesTotal = 0, paidIn = 0, paidOut = 0;
    let receivable = 0, payable = 0;

    cpDocs.forEach(d => {
      const total = Number(d.total_with_nds || 0);
      const isPaid = d.status === "done";
      // Продажи (наши счета покупателю)
      if (["invoice", "sf", "act"].includes(d.doc_type)) {
        salesTotal += total;
        if (isPaid) paidIn += total;
        else receivable += total;
      }
      // Закупки (поступления от поставщика)
      if (["receipt", "purchase", "waybill"].includes(d.doc_type)) {
        purchasesTotal += total;
        if (isPaid) paidOut += total;
        else payable += total;
      }
    });

    const balance = receivable - payable;
    return {
      docs: cpDocs.length,
      contracts: cpContracts.length,
      activeContracts: cpContracts.filter(c => c.status === "active").length,
      orders: cpOrders.length,
      activeOrders: cpOrders.filter(o => !["delivered", "cancelled", "closed"].includes(o.status)).length,
      salesTotal, purchasesTotal,
      paidIn, paidOut,
      receivable, payable, balance,
      cpDocs, cpContracts, cpOrders,
    };
  }

  // KPI overall
  const totalActive = items.filter(c => c.is_active !== false).length;
  const totalCustomers = items.filter(c => c.counterparty_role === "customer" || c.counterparty_role === "both").length;
  const totalSuppliers = items.filter(c => c.counterparty_role === "supplier" || c.counterparty_role === "both").length;
  const ndsPayers = items.filter(c => c.is_nds_payer).length;

  // Filter
  const filteredItems = items.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.bin?.includes(search) && !c.email?.toLowerCase().includes(q)) return false;
    }
    if (filterType !== "all" && c.counterparty_type !== filterType) return false;
    if (filterRole !== "all") {
      if (filterRole === "customer" && !["customer", "both"].includes(c.counterparty_role)) return false;
      if (filterRole === "supplier" && !["supplier", "both"].includes(c.counterparty_role)) return false;
      if (filterRole !== "customer" && filterRole !== "supplier" && c.counterparty_role !== filterRole) return false;
    }
    return true;
  });

  // Sort by balance (debtors first)
  const sortedFiltered = [...filteredItems].sort((a, b) => {
    const sa = getStats(a.id);
    const sb = getStats(b.id);
    return sb.receivable - sa.receivable;
  });

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Полный модуль контрагентов: реквизиты, балансы, история документов, контактные лица, заметки и взаимодействия
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>👥 Контрагентов</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{items.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Активных: {totalActive}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🛒 Покупатели</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{totalCustomers}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>В т.ч. совмещают</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #3B82F6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📦 Поставщики</div>
          <div className="text-xl font-bold" style={{ color: "#3B82F6" }}>{totalSuppliers}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>В т.ч. совмещают</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EC4899" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✓ Плательщиков НДС</div>
          <div className="text-xl font-bold" style={{ color: "#EC4899" }}>{ndsPayers}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{items.length > 0 ? Math.round(ndsPayers / items.length * 100) : 0}% от всех</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        <button onClick={() => { setTab("list"); setSelected(null); }}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: tab === "list" ? "var(--accent)" : "transparent", color: tab === "list" ? "#fff" : "var(--t3)", border: tab === "list" ? "none" : "1px solid var(--brd)" }}>
          📋 Список
        </button>
        {selected && (
          <button onClick={() => setTab("card")}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === "card" ? "var(--accent)" : "transparent", color: tab === "card" ? "#fff" : "var(--t3)", border: tab === "card" ? "none" : "1px solid var(--brd)" }}>
            👤 {selected.name}
          </button>
        )}
        <button onClick={startCreate} className="ml-auto px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новый контрагент</button>
      </div>

      {/* ═══ ФОРМА ═══ */}
      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">{editing ? "Редактирование контрагента" : "Новый контрагент"}</div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📋 ОСНОВНОЕ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder='ТОО "Компания"' /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>БИН/ИИН</label><input value={form.bin} onChange={e => setForm({ ...form, bin: e.target.value.replace(/\D/g, "").slice(0, 12) })} maxLength={12} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
              <select value={form.counterparty_type} onChange={e => setForm({ ...form, counterparty_type: e.target.value })}>
                {Object.entries(CP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Роль</label>
              <select value={form.counterparty_role} onChange={e => setForm({ ...form, counterparty_role: e.target.value })}>
                {Object.entries(CP_ROLES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Орг.-прав. форма</label>
              <select value={form.legal_form} onChange={e => setForm({ ...form, legal_form: e.target.value })}>
                {LEGAL_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#10B981" }}>📍 АДРЕС И КОНТАКТЫ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Страна</label><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Область/Регион</label><input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Город</label><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Юридический адрес</label><input value={form.legal_address} onChange={e => setForm({ ...form, legal_address: e.target.value })} /></div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Фактический адрес</label><input value={form.actual_address} onChange={e => setForm({ ...form, actual_address: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Телефон</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+7" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Веб-сайт</label><input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#F59E0B" }}>👥 РУКОВОДСТВО</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО руководителя</label><input value={form.director_name} onChange={e => setForm({ ...form, director_name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Должность</label><input value={form.director_position} onChange={e => setForm({ ...form, director_position: e.target.value })} /></div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО гл. бухгалтера</label><input value={form.accountant_name} onChange={e => setForm({ ...form, accountant_name: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#EC4899" }}>🏦 БАНК</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Банк</label><input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="АО «Halyk Bank»" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>БИК</label><input value={form.bank_bik} onChange={e => setForm({ ...form, bank_bik: e.target.value })} /></div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИК</label><input value={form.bank_iik} onChange={e => setForm({ ...form, bank_iik: e.target.value })} placeholder="KZ..." /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#A855F7" }}>⚖ НАЛОГИ И УСЛОВИЯ</div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_nds_payer} onChange={e => setForm({ ...form, is_nds_payer: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span className="text-xs">Плательщик НДС</span>
              </label>
            </div>
            {form.is_nds_payer && (
              <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ свидетельства НДС</label><input value={form.nds_certificate} onChange={e => setForm({ ...form, nds_certificate: e.target.value })} /></div>
            )}
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ОКПО</label><input value={form.okpo} onChange={e => setForm({ ...form, okpo: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ОКЭД</label><input value={form.oked} onChange={e => setForm({ ...form, oked: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Кредитный лимит (₸)</label><input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Отсрочка платежа (дней)</label><input type="number" value={form.payment_terms_days} onChange={e => setForm({ ...form, payment_terms_days: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Рейтинг (1-5)</label>
              <select value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })}>
                <option value={1}>⭐ — Плохо</option>
                <option value={2}>⭐⭐ — Ниже среднего</option>
                <option value={3}>⭐⭐⭐ — Средне</option>
                <option value={4}>⭐⭐⭐⭐ — Хорошо</option>
                <option value={5}>⭐⭐⭐⭐⭐ — Отлично</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Заметка</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ width: "100%", padding: 8, fontSize: 12 }} />
          </div>

          <div className="flex gap-2">
            <button onClick={saveItem} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 {editing ? "Сохранить" : "Создать"}</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* ═══ СПИСОК ═══ */}
      {tab === "list" && !showForm && (
        <>
          <div className="flex gap-3 items-center flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Поиск: имя, БИН, email..." style={{ flex: 1, minWidth: 200 }} />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 180 }}>
              <option value="all">Все типы</option>
              {Object.entries(CP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
            </select>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ width: 200 }}>
              <option value="all">Все роли</option>
              <option value="customer">Покупатели</option>
              <option value="supplier">Поставщики</option>
              <option value="employee">Сотрудники</option>
            </select>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Наименование", "Тип / Роль", "БИН", "Контакты", "Документов", "Дебиторка", "Кредиторка", "★", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {sortedFiltered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>{items.length === 0 ? "Нет контрагентов. Создайте первого." : "Ничего не найдено"}</td></tr>
                ) : sortedFiltered.map(c => {
                  const t = CP_TYPES[c.counterparty_type as keyof typeof CP_TYPES] || CP_TYPES.company;
                  const r = CP_ROLES[c.counterparty_role as keyof typeof CP_ROLES] || CP_ROLES.both;
                  const stats = getStats(c.id);
                  const overLimit = Number(c.credit_limit || 0) > 0 && stats.receivable > Number(c.credit_limit);
                  return (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => { setSelected(c); setTab("card"); setCardTab("info"); }}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <div>{c.name}</div>
                        {c.legal_form && <div className="text-[10px]" style={{ color: "var(--t3)" }}>{c.legal_form}</div>}
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color, alignSelf: "flex-start" }}>{t.icon} {t.name}</span>
                          <span className="text-[10px]" style={{ color: r.color }}>{r.name}</span>
                        </div>
                      </td>
                      <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                        {c.bin || "—"}
                        {c.is_nds_payer && <div className="text-[9px] mt-1 px-1.5 py-0.5 rounded inline-block" style={{ background: "#EC489920", color: "#EC4899" }}>НДС</div>}
                      </td>
                      <td className="p-2.5 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {c.phone && <div>📞 {c.phone}</div>}
                        {c.email && <div style={{ color: "var(--t3)" }}>✉ {c.email}</div>}
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <div>📄 {stats.docs}</div>
                        {stats.activeContracts > 0 && <div className="text-[10px]" style={{ color: "var(--t3)" }}>📑 {stats.activeContracts}</div>}
                      </td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>
                        {stats.receivable > 0 ? `${fmtMoney(stats.receivable)} ₸` : "—"}
                        {overLimit && <div className="text-[9px]" style={{ color: "#EF4444" }}>⚠ Свыше лимита</div>}
                      </td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>
                        {stats.payable > 0 ? `${fmtMoney(stats.payable)} ₸` : "—"}
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {Array.from({ length: c.rating || 3 }, (_, i) => "⭐").join("")}
                      </td>
                      <td className="p-2.5" onClick={e => e.stopPropagation()} style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => startEdit(c)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>✏</button>
                        <button onClick={() => deleteItem(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ КАРТОЧКА КОНТРАГЕНТА ═══ */}
      {tab === "card" && selected && (() => {
        const t = CP_TYPES[selected.counterparty_type as keyof typeof CP_TYPES] || CP_TYPES.company;
        const r = CP_ROLES[selected.counterparty_role as keyof typeof CP_ROLES] || CP_ROLES.both;
        const stats = getStats(selected.id);
        const cpContacts = contacts.filter(c => c.counterparty_id === selected.id);
        const cpNotes = notes.filter(n => n.counterparty_id === selected.id);
        const cpContracts = contracts.filter(c => c.counterparty_id === selected.id);

        return (
          <>
            {/* Header */}
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl flex items-center justify-center" style={{ width: 56, height: 56, background: t.color + "20", fontSize: 28 }}>{t.icon}</div>
                  <div>
                    <div className="text-lg font-bold">{selected.name}</div>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.name}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: r.color + "20", color: r.color }}>{r.name}</span>
                      {selected.is_nds_payer && <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: "#EC489920", color: "#EC4899" }}>НДС</span>}
                      <span className="text-[10px]" style={{ color: "var(--t3)" }}>{Array.from({ length: selected.rating || 3 }, () => "⭐").join("")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(selected)} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)" }}>✏ Редактировать</button>
                  <button onClick={() => { setSelected(null); setTab("list"); }} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>← К списку</button>
                </div>
              </div>

              {/* Stats overview */}
              <div className="grid grid-cols-4 gap-3 mt-4">
                <div className="rounded-lg p-3" style={{ background: "#10B98110" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>ПРОДАЖИ</div>
                  <div className="text-base font-bold" style={{ color: "#10B981" }}>{fmtMoney(stats.salesTotal)} ₸</div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>Оплачено: {fmtMoney(stats.paidIn)} ₸</div>
                </div>
                <div className="rounded-lg p-3" style={{ background: "#3B82F610" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>ЗАКУПКИ</div>
                  <div className="text-base font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(stats.purchasesTotal)} ₸</div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>Оплачено: {fmtMoney(stats.paidOut)} ₸</div>
                </div>
                <div className="rounded-lg p-3" style={{ background: "#F59E0B10" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>ДОЛЖЕН НАМ</div>
                  <div className="text-base font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(stats.receivable)} ₸</div>
                  {Number(selected.credit_limit || 0) > 0 && <div className="text-[10px]" style={{ color: stats.receivable > Number(selected.credit_limit) ? "#EF4444" : "var(--t3)" }}>Лимит: {fmtMoney(Number(selected.credit_limit))} ₸</div>}
                </div>
                <div className="rounded-lg p-3" style={{ background: "#EF444410" }}>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>МЫ ДОЛЖНЫ</div>
                  <div className="text-base font-bold" style={{ color: "#EF4444" }}>{fmtMoney(stats.payable)} ₸</div>
                  <div className="text-[10px]" style={{ color: stats.balance >= 0 ? "#10B981" : "#EF4444" }}>Сальдо: {stats.balance > 0 ? "+" : ""}{fmtMoney(stats.balance)}</div>
                </div>
              </div>
            </div>

            {/* Card tabs */}
            <div className="flex gap-2">
              {([
                ["info", "📋 Реквизиты"],
                ["balance", "💰 Баланс расчётов"],
                ["history", `📄 История (${stats.docs})`],
                ["contracts", `📑 Договоры (${cpContracts.length})`],
                ["contacts", `👥 Контакты (${cpContacts.length})`],
                ["notes", `📝 Заметки (${cpNotes.length})`],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setCardTab(key)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{ background: cardTab === key ? "var(--accent)" : "transparent", color: cardTab === key ? "#fff" : "var(--t3)", border: cardTab === key ? "none" : "1px solid var(--brd)" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Card content */}
            {cardTab === "info" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="text-sm font-bold mb-3" style={{ color: "#6366F1" }}>📋 Юридические реквизиты</div>
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Полное наименование:</span> <span className="font-semibold">{selected.name}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Орг.-прав. форма:</span> <span>{selected.legal_form || "—"}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>БИН/ИИН:</span> <span className="font-mono">{selected.bin || "—"}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>ОКПО:</span> <span className="font-mono">{selected.okpo || "—"}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>ОКЭД:</span> <span className="font-mono">{selected.oked || "—"}</span></div>
                    <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>Плательщик НДС:</span> <span>{selected.is_nds_payer ? "✓ Да" : "✗ Нет"}</span></div>
                    {selected.is_nds_payer && <div className="flex justify-between"><span style={{ color: "var(--t3)" }}>№ свидетельства НДС:</span> <span>{selected.nds_certificate || "—"}</span></div>}
                  </div>
                </div>

                <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="text-sm font-bold mb-3" style={{ color: "#10B981" }}>📍 Адреса и контакты</div>
                  <div className="flex flex-col gap-2 text-xs">
                    <div><span style={{ color: "var(--t3)" }}>Страна:</span> {selected.country || "—"}{selected.region ? `, ${selected.region}` : ""}{selected.city ? `, ${selected.city}` : ""}</div>
                    <div><span style={{ color: "var(--t3)" }}>Юр. адрес:</span> {selected.legal_address || "—"}</div>
                    <div><span style={{ color: "var(--t3)" }}>Факт. адрес:</span> {selected.actual_address || "—"}</div>
                    <div><span style={{ color: "var(--t3)" }}>Телефон:</span> {selected.phone ? <a href={`tel:${selected.phone}`} style={{ color: "var(--accent)" }}>{selected.phone}</a> : "—"}</div>
                    <div><span style={{ color: "var(--t3)" }}>Email:</span> {selected.email ? <a href={`mailto:${selected.email}`} style={{ color: "var(--accent)" }}>{selected.email}</a> : "—"}</div>
                    <div><span style={{ color: "var(--t3)" }}>Сайт:</span> {selected.website ? <a href={selected.website} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{selected.website}</a> : "—"}</div>
                  </div>
                </div>

                <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="text-sm font-bold mb-3" style={{ color: "#F59E0B" }}>👥 Руководство</div>
                  <div className="flex flex-col gap-2 text-xs">
                    <div><span style={{ color: "var(--t3)" }}>{selected.director_position || "Директор"}:</span> {selected.director_name || "—"}</div>
                    <div><span style={{ color: "var(--t3)" }}>Главный бухгалтер:</span> {selected.accountant_name || "—"}</div>
                  </div>
                </div>

                <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="text-sm font-bold mb-3" style={{ color: "#EC4899" }}>🏦 Банковские реквизиты</div>
                  <div className="flex flex-col gap-2 text-xs">
                    <div><span style={{ color: "var(--t3)" }}>Банк:</span> {selected.bank_name || "—"}</div>
                    <div><span style={{ color: "var(--t3)" }}>ИИК:</span> <span className="font-mono">{selected.bank_iik || "—"}</span></div>
                    <div><span style={{ color: "var(--t3)" }}>БИК:</span> <span className="font-mono">{selected.bank_bik || "—"}</span></div>
                  </div>
                </div>

                <div className="rounded-xl p-5 col-span-2" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  <div className="text-sm font-bold mb-3" style={{ color: "#A855F7" }}>⚙ Условия работы</div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><div style={{ color: "var(--t3)" }}>Кредитный лимит</div><div className="font-bold">{fmtMoney(Number(selected.credit_limit || 0))} ₸</div></div>
                    <div><div style={{ color: "var(--t3)" }}>Отсрочка платежа</div><div className="font-bold">{selected.payment_terms_days || 0} дней</div></div>
                    <div><div style={{ color: "var(--t3)" }}>Рейтинг</div><div className="font-bold">{Array.from({ length: selected.rating || 3 }, () => "⭐").join("")} ({selected.rating || 3}/5)</div></div>
                  </div>
                  {selected.notes && (
                    <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--bg)" }}>
                      <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>ЗАМЕТКА:</div>
                      <div className="text-xs">{selected.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {cardTab === "balance" && (
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-4">💰 Баланс расчётов с {selected.name}</div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="rounded-lg p-4" style={{ background: "#10B98110", border: "1px solid #10B98130" }}>
                    <div className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>📈 ПРОДАЖИ (наши документы покупателю)</div>
                    <div className="text-lg font-bold" style={{ color: "#10B981" }}>{fmtMoney(stats.salesTotal)} ₸</div>
                    <div className="flex justify-between mt-2 text-[11px]">
                      <span style={{ color: "var(--t3)" }}>Оплачено:</span>
                      <span style={{ color: "#10B981" }}>{fmtMoney(stats.paidIn)} ₸</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: "var(--t3)" }}>Должен:</span>
                      <span style={{ color: "#F59E0B" }}>{fmtMoney(stats.receivable)} ₸</span>
                    </div>
                  </div>
                  <div className="rounded-lg p-4" style={{ background: "#3B82F610", border: "1px solid #3B82F630" }}>
                    <div className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>📉 ЗАКУПКИ (наши поступления от поставщика)</div>
                    <div className="text-lg font-bold" style={{ color: "#3B82F6" }}>{fmtMoney(stats.purchasesTotal)} ₸</div>
                    <div className="flex justify-between mt-2 text-[11px]">
                      <span style={{ color: "var(--t3)" }}>Оплачено нами:</span>
                      <span style={{ color: "#10B981" }}>{fmtMoney(stats.paidOut)} ₸</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: "var(--t3)" }}>Мы должны:</span>
                      <span style={{ color: "#EF4444" }}>{fmtMoney(stats.payable)} ₸</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg p-4" style={{ background: stats.balance >= 0 ? "#A855F710" : "#EF444410", border: `1px solid ${stats.balance >= 0 ? "#A855F730" : "#EF444430"}` }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-xs font-bold mb-1">САЛЬДО (нам должны минус мы должны)</div>
                      <div className="text-[11px]" style={{ color: "var(--t3)" }}>{stats.balance > 0 ? "В нашу пользу" : stats.balance < 0 ? "В пользу контрагента" : "Расчёты сбалансированы"}</div>
                    </div>
                    <div className="text-2xl font-bold" style={{ color: stats.balance >= 0 ? "#A855F7" : "#EF4444" }}>
                      {stats.balance > 0 ? "+" : ""}{fmtMoney(stats.balance)} ₸
                    </div>
                  </div>
                </div>

                {Number(selected.credit_limit || 0) > 0 && stats.receivable > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-bold mb-2">Использование кредитного лимита</div>
                    <div style={{ width: "100%", height: 10, background: "var(--bg)", borderRadius: 5, overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.min(100, stats.receivable / Number(selected.credit_limit) * 100)}%`,
                        height: "100%",
                        background: stats.receivable > Number(selected.credit_limit) ? "#EF4444" : stats.receivable > Number(selected.credit_limit) * 0.8 ? "#F59E0B" : "#10B981",
                      }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px]">
                      <span style={{ color: "var(--t3)" }}>{fmtMoney(stats.receivable)} ₸</span>
                      <span style={{ color: "var(--t3)" }}>лимит {fmtMoney(Number(selected.credit_limit))} ₸</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {cardTab === "history" && (
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3">📄 История документов</div>
                {stats.cpDocs.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет документов</div>
                ) : (
                  <table>
                    <thead><tr>{["№", "Дата", "Тип", "Сумма", "Статус"].map(h => (
                      <th key={h} className="text-left p-2 text-[10px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
                    ))}</tr></thead>
                    <tbody>
                      {stats.cpDocs.sort((a: any, b: any) => (b.doc_date || "").localeCompare(a.doc_date || "")).map((d: any) => (
                        <tr key={d.id}>
                          <td className="p-2 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{d.doc_number}</td>
                          <td className="p-2 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{d.doc_date}</td>
                          <td className="p-2 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{d.doc_type}</td>
                          <td className="p-2 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(d.total_with_nds))} ₸</td>
                          <td className="p-2" style={{ borderBottom: "1px solid var(--brd)" }}>
                            <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: d.status === "done" ? "#10B98120" : "#6B728020", color: d.status === "done" ? "#10B981" : "#6B7280" }}>
                              {d.status === "done" ? "Проведён" : "Черновик"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {cardTab === "contracts" && (
              <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="text-sm font-bold mb-3">📑 Договоры с контрагентом</div>
                {cpContracts.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет договоров</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {cpContracts.map(c => (
                      <div key={c.id} className="rounded-lg p-3" style={{ background: "var(--bg)", border: "1px solid var(--brd)" }}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-xs font-mono font-bold" style={{ color: "var(--accent)" }}>{c.contract_number}</div>
                            <div className="text-[11px]" style={{ color: "var(--t3)" }}>{c.contract_date} • {c.contract_type}</div>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: c.status === "active" ? "#10B98120" : "#6B728020", color: c.status === "active" ? "#10B981" : "#6B7280" }}>
                            {c.status === "active" ? "Действует" : c.status}
                          </span>
                        </div>
                        {c.subject && <div className="text-[11px] mt-1">{c.subject}</div>}
                        <div className="text-sm font-bold mt-1">{fmtMoney(Number(c.total_amount))} {c.currency}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {cardTab === "contacts" && (
              <>
                <div className="flex justify-between">
                  <div className="text-xs" style={{ color: "var(--t3)" }}>Контактные лица контрагента</div>
                  <button onClick={() => setShowContactForm(!showContactForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить контакт</button>
                </div>

                {showContactForm && (
                  <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО</label><input value={contactForm.full_name} onChange={e => setContactForm({ ...contactForm, full_name: e.target.value })} /></div>
                      <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Должность</label><input value={contactForm.position} onChange={e => setContactForm({ ...contactForm, position: e.target.value })} /></div>
                      <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Телефон</label><input value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} /></div>
                      <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Email</label><input value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} /></div>
                      <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={contactForm.is_primary} onChange={e => setContactForm({ ...contactForm, is_primary: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                          <span className="text-xs">Основной контакт</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addContact} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                      <button onClick={() => setShowContactForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
                    </div>
                  </div>
                )}

                <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                  {cpContacts.length === 0 ? (
                    <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет контактов</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {cpContacts.map(c => (
                        <div key={c.id} className="rounded-lg p-3" style={{ background: "var(--bg)", border: c.is_primary ? "2px solid #10B981" : "1px solid var(--brd)" }}>
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-sm font-bold flex items-center gap-2">{c.full_name} {c.is_primary && <span className="text-[9px] px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>ОСНОВНОЙ</span>}</div>
                              {c.position && <div className="text-[11px]" style={{ color: "var(--t3)" }}>{c.position}</div>}
                              <div className="mt-2 flex flex-col gap-1 text-[11px]">
                                {c.phone && <div>📞 <a href={`tel:${c.phone}`} style={{ color: "var(--accent)" }}>{c.phone}</a></div>}
                                {c.email && <div>✉ <a href={`mailto:${c.email}`} style={{ color: "var(--accent)" }}>{c.email}</a></div>}
                              </div>
                            </div>
                            <button onClick={() => deleteContact(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {cardTab === "notes" && (
              <>
                <div className="flex justify-between">
                  <div className="text-xs" style={{ color: "var(--t3)" }}>Заметки и история взаимодействий</div>
                  <button onClick={() => setShowNoteForm(!showNoteForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить заметку</button>
                </div>

                {showNoteForm && (
                  <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={noteForm.note_date} onChange={e => setNoteForm({ ...noteForm, note_date: e.target.value })} /></div>
                      <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                        <select value={noteForm.note_type} onChange={e => setNoteForm({ ...noteForm, note_type: e.target.value })}>
                          {Object.entries(NOTE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
                        </select>
                      </div>
                      <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Автор</label><input value={noteForm.author_name} onChange={e => setNoteForm({ ...noteForm, author_name: e.target.value })} /></div>
                      <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тема</label><input value={noteForm.subject} onChange={e => setNoteForm({ ...noteForm, subject: e.target.value })} /></div>
                      <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Содержание</label><textarea value={noteForm.content} onChange={e => setNoteForm({ ...noteForm, content: e.target.value })} rows={3} style={{ width: "100%", padding: 8, fontSize: 12 }} /></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addNote} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                      <button onClick={() => setShowNoteForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {cpNotes.length === 0 ? (
                    <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>Нет заметок</div>
                  ) : cpNotes.map(n => {
                    const nt = NOTE_TYPES[n.note_type as keyof typeof NOTE_TYPES] || NOTE_TYPES.general;
                    return (
                      <div key={n.id} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 16 }}>{nt.icon}</span>
                            <div>
                              <div className="text-sm font-bold">{n.subject}</div>
                              <div className="text-[11px]" style={{ color: "var(--t3)" }}>{n.note_date} • {nt.name}{n.author_name ? ` • ${n.author_name}` : ""}</div>
                            </div>
                          </div>
                          <button onClick={() => deleteNote(n.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                        </div>
                        {n.content && <div className="text-xs whitespace-pre-wrap" style={{ color: "var(--t2)" }}>{n.content}</div>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}
