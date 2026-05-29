"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "all" | "expiring" | "by-counterparty";

const CONTRACT_TYPES = {
  sale: { name: "Договор купли-продажи", icon: "💰", color: "#10B981" },
  purchase: { name: "Договор поставки", icon: "📦", color: "#3B82F6" },
  service: { name: "Договор услуг", icon: "🛠", color: "#A855F7" },
  rent: { name: "Договор аренды", icon: "🏢", color: "#F59E0B" },
  work: { name: "Договор подряда", icon: "🔨", color: "#EC4899" },
  commission: { name: "Комиссия", icon: "🤝", color: "#6366F1" },
  agency: { name: "Агентский", icon: "👥", color: "#14B8A6" },
  loan: { name: "Заём", icon: "💸", color: "#EF4444" },
  other: { name: "Прочий", icon: "📄", color: "#6B7280" },
};

const STATUSES = {
  draft: { name: "Черновик", color: "#6B7280" },
  active: { name: "Действующий", color: "#10B981" },
  completed: { name: "Исполнен", color: "#3B82F6" },
  cancelled: { name: "Расторгнут", color: "#EF4444" },
  expired: { name: "Истёк срок", color: "#F59E0B" },
};

export default function ContractsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("all");
  const [contracts, setContracts] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<any>(null);
  const [viewingContract, setViewingContract] = useState<any>(null);

  const emptyForm = {
    contract_number: "",
    contract_date: new Date().toISOString().slice(0, 10),
    contract_type: "sale",
    counterparty_id: "",
    counterparty_name: "",
    counterparty_bin: "",
    company_id: "",
    subject: "",
    description: "",
    total_amount: "",
    currency: "KZT",
    with_nds: true,
    nds_rate: "16",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    is_perpetual: false,
    payment_terms: "",
    delivery_terms: "",
    status: "draft",
    responsible_name: "",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [c, cp, comp, d] = await Promise.all([
      supabase.from("contracts").select("*").eq("user_id", user.id).order("contract_date", { ascending: false }),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
      supabase.from("user_companies").select("*").eq("user_id", user.id),
      supabase.from("documents").select("*").eq("user_id", user.id),
    ]);
    setContracts(c.data || []);
    setCounterparties(cp.data || []);
    setCompanies(comp.data || []);
    setDocs(d.data || []);

    // Авто-обновление статусов по сроку
    const today = new Date().toISOString().slice(0, 10);
    for (const ct of c.data || []) {
      if (ct.status === "active" && ct.end_date && ct.end_date < today && !ct.is_perpetual) {
        await supabase.from("contracts").update({ status: "expired" }).eq("id", ct.id);
      }
    }
  }

  function startCreate() {
    setEditingContract(null);
    const num = `Д-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    setForm({ ...emptyForm, contract_number: num });
    setShowForm(true);
  }

  function startEdit(c: any) {
    setEditingContract(c);
    setForm({
      contract_number: c.contract_number,
      contract_date: c.contract_date,
      contract_type: c.contract_type,
      counterparty_id: c.counterparty_id || "",
      counterparty_name: c.counterparty_name,
      counterparty_bin: c.counterparty_bin || "",
      company_id: c.company_id || "",
      subject: c.subject || "",
      description: c.description || "",
      total_amount: String(c.total_amount || ""),
      currency: c.currency || "KZT",
      with_nds: !!c.with_nds,
      nds_rate: String(c.nds_rate || 16),
      start_date: c.start_date || "",
      end_date: c.end_date || "",
      is_perpetual: !!c.is_perpetual,
      payment_terms: c.payment_terms || "",
      delivery_terms: c.delivery_terms || "",
      status: c.status,
      responsible_name: c.responsible_name || "",
      notes: c.notes || "",
    });
    setShowForm(true);
  }

  function selectCounterparty(id: string) {
    const cp = counterparties.find(x => x.id === id);
    if (cp) {
      setForm({ ...form, counterparty_id: id, counterparty_name: cp.name, counterparty_bin: cp.bin || "" });
    } else {
      setForm({ ...form, counterparty_id: "" });
    }
  }

  function selectCompany(id: string) {
    setForm({ ...form, company_id: id });
  }

  async function saveContract() {
    if (!form.contract_number || !form.counterparty_name) {
      setMsg("❌ Заполните номер и контрагента");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const company = companies.find(c => c.id === form.company_id);
    const data = {
      user_id: userId,
      contract_number: form.contract_number,
      contract_date: form.contract_date,
      contract_type: form.contract_type,
      counterparty_id: form.counterparty_id || null,
      counterparty_name: form.counterparty_name,
      counterparty_bin: form.counterparty_bin || null,
      company_id: form.company_id || null,
      company_name: company?.company_name || null,
      subject: form.subject || null,
      description: form.description || null,
      total_amount: Number(form.total_amount) || 0,
      currency: form.currency,
      with_nds: form.with_nds,
      nds_rate: Number(form.nds_rate),
      start_date: form.start_date || null,
      end_date: form.is_perpetual ? null : (form.end_date || null),
      is_perpetual: form.is_perpetual,
      payment_terms: form.payment_terms || null,
      delivery_terms: form.delivery_terms || null,
      status: form.status,
      responsible_name: form.responsible_name || null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    };

    if (editingContract) {
      await supabase.from("contracts").update(data).eq("id", editingContract.id);
    } else {
      await supabase.from("contracts").insert(data);
    }
    setMsg(`✅ Договор ${form.contract_number} ${editingContract ? "обновлён" : "создан"}`);
    setShowForm(false);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteContract(id: string) {
    if (!confirm("Удалить договор? Связанные документы останутся, но потеряют связь.")) return;
    await supabase.from("contracts").delete().eq("id", id);
    if (viewingContract?.id === id) setViewingContract(null);
    load();
  }

  async function changeStatus(id: string, status: string) {
    await supabase.from("contracts").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  function getDocumentsForContract(contractId: string) {
    return docs.filter(d => d.contract_id === contractId);
  }

  function getPaidAmount(contractId: string): number {
    return docs.filter(d => d.contract_id === contractId && d.status === "done")
      .reduce((a, d) => a + Number(d.total_with_nds || 0), 0);
  }

  function printContract(c: any) {
    const w = window.open("", "_blank");
    if (!w) return;
    const type = CONTRACT_TYPES[c.contract_type as keyof typeof CONTRACT_TYPES];
    const totalWithVat = c.with_nds ? Number(c.total_amount) : Number(c.total_amount) * (1 + Number(c.nds_rate) / 100);
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Договор ${c.contract_number}</title>
      <style>body{font-family:'Times New Roman',serif;padding:40px;font-size:13px;line-height:1.7;color:#111;max-width:800px;margin:0 auto}
      h1{text-align:center;margin:0 0 24px;font-size:18px}h2{font-size:14px;margin:20px 0 8px;text-transform:uppercase}
      .header{display:flex;justify-content:space-between;margin-bottom:30px}.row{margin:6px 0}.label{color:#555;width:200px;display:inline-block}
      table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #333;padding:5px 8px;font-size:12px}
      .signatures{display:flex;justify-content:space-between;margin-top:60px}.sig{width:45%;border-top:1px solid #000;padding-top:8px}
      @media print{body{padding:20px}}</style></head><body>
      <h1>${type.name.toUpperCase()}<br>№ ${c.contract_number}</h1>
      <div class="header">
        <div><b>${c.company_name || "Организация"}</b></div>
        <div>от ${c.contract_date}</div>
      </div>
      <h2>Стороны:</h2>
      <div class="row"><span class="label">Заказчик / Покупатель:</span> ${c.contract_type === "purchase" ? c.company_name : c.counterparty_name}</div>
      <div class="row"><span class="label">Поставщик / Исполнитель:</span> ${c.contract_type === "purchase" ? c.counterparty_name : c.company_name}</div>
      <div class="row"><span class="label">БИН контрагента:</span> ${c.counterparty_bin || "—"}</div>
      ${c.subject ? `<h2>Предмет договора:</h2><div>${c.subject}</div>` : ""}
      ${c.description ? `<h2>Описание:</h2><div>${c.description}</div>` : ""}
      <h2>Финансовые условия:</h2>
      <div class="row"><span class="label">Сумма договора:</span> ${fmtMoney(Number(c.total_amount))} ${c.currency} ${c.with_nds ? "(в т.ч. НДС)" : "(без НДС)"}</div>
      ${c.with_nds ? `<div class="row"><span class="label">Ставка НДС:</span> ${c.nds_rate}%</div>` : ""}
      ${c.payment_terms ? `<div class="row"><span class="label">Условия оплаты:</span> ${c.payment_terms}</div>` : ""}
      ${c.delivery_terms ? `<div class="row"><span class="label">Условия поставки:</span> ${c.delivery_terms}</div>` : ""}
      <h2>Срок действия:</h2>
      <div class="row"><span class="label">Дата начала:</span> ${c.start_date || "—"}</div>
      <div class="row"><span class="label">Дата окончания:</span> ${c.is_perpetual ? "Бессрочный" : (c.end_date || "—")}</div>
      <div class="signatures">
        <div class="sig"><b>${c.company_name || "Заказчик"}</b><br>______________________</div>
        <div class="sig"><b>${c.counterparty_name}</b><br>______________________</div>
      </div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  // Filters
  const filteredContracts = contracts.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.contract_number.toLowerCase().includes(q) &&
          !c.counterparty_name.toLowerCase().includes(q) &&
          !c.subject?.toLowerCase().includes(q)) return false;
    }
    if (filterType !== "all" && c.contract_type !== filterType) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  // Tab data
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const expiringContracts = contracts.filter(c => c.status === "active" && !c.is_perpetual && c.end_date && c.end_date >= today && c.end_date <= in30Days);

  // KPI
  const activeCount = contracts.filter(c => c.status === "active").length;
  const totalActiveAmount = contracts.filter(c => c.status === "active").reduce((a, c) => a + Number(c.total_amount), 0);
  const expiringCount = expiringContracts.length;
  const draftsCount = contracts.filter(c => c.status === "draft").length;

  // Group by counterparty
  const byCp: Record<string, any[]> = {};
  contracts.forEach(c => {
    const key = c.counterparty_name || "Без контрагента";
    if (!byCp[key]) byCp[key] = [];
    byCp[key].push(c);
  });

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Реестр договоров с контрагентами • Привязка документов и оплат • Контроль сроков действия
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✅ Действующих</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{activeCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{fmtMoney(totalActiveAmount)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⏰ Истекают в 30 дней</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{expiringCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Требуют продления</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6B7280" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📝 Черновики</div>
          <div className="text-xl font-bold" style={{ color: "#6B7280" }}>{draftsCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Не подписаны</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Всего</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{contracts.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>За всё время</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center flex-wrap">
        {([["all", "📋 Все договоры"], ["expiring", `⏰ Истекают (${expiringCount})`], ["by-counterparty", "👥 По контрагентам"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
        <button onClick={startCreate} className="ml-auto px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новый договор</button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">{editingContract ? "Редактирование договора" : "Новый договор"}</div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📋 ОСНОВНОЕ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Номер договора *</label><input value={form.contract_number} onChange={e => setForm({ ...form, contract_number: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата договора</label><input type="date" value={form.contract_date} onChange={e => setForm({ ...form, contract_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип договора</label>
              <select value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value })}>
                {Object.entries(CONTRACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Контрагент *</label>
              <select value={form.counterparty_id} onChange={e => selectCounterparty(e.target.value)}>
                <option value="">— Выбрать или ввести имя ниже —</option>
                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name} {c.bin ? `(${c.bin})` : ""}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Организация (наша)</label>
              <select value={form.company_id} onChange={e => selectCompany(e.target.value)}>
                <option value="">— Не указано —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_short_name || c.company_name}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование контрагента (если не из справочника)</label><input value={form.counterparty_name} onChange={e => setForm({ ...form, counterparty_name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>БИН контрагента</label><input value={form.counterparty_bin} onChange={e => setForm({ ...form, counterparty_bin: e.target.value.replace(/\D/g, "").slice(0, 12) })} maxLength={12} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#A855F7" }}>📝 ПРЕДМЕТ И ОПИСАНИЕ</div>
          <div className="grid grid-cols-1 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Предмет договора</label><input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Например: Поставка офисной мебели" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} style={{ width: "100%", padding: 8, fontSize: 12 }} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#10B981" }}>💰 ФИНАНСЫ</div>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма договора</label><input type="number" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Валюта</label>
              <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                <option value="KZT">KZT (тенге)</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="RUB">RUB</option>
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ставка НДС</label>
              <select value={form.nds_rate} onChange={e => setForm({ ...form, nds_rate: e.target.value })}>
                <option value="16">16%</option>
                <option value="10">10%</option>
                <option value="5">5%</option>
                <option value="0">0% (без НДС)</option>
              </select>
            </div>
            <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.with_nds} onChange={e => setForm({ ...form, with_nds: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span className="text-xs">НДС включён</span>
              </label>
            </div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Условия оплаты</label><input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder='Аванс 50%, остаток после поставки' /></div>
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Условия поставки</label><input value={form.delivery_terms} onChange={e => setForm({ ...form, delivery_terms: e.target.value })} placeholder="Доставка за счёт поставщика" /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#F59E0B" }}>📅 СРОКИ И СТАТУС</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата начала</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата окончания</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} disabled={form.is_perpetual} />
            </div>
            <div className="flex items-end gap-2" style={{ paddingBottom: 8 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_perpetual} onChange={e => setForm({ ...form, is_perpetual: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span className="text-xs">Бессрочный</span>
              </label>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Статус</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ответственный</label><input value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div className="flex gap-2">
            <button onClick={saveContract} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 {editingContract ? "Сохранить" : "Создать договор"}</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewingContract && (() => {
        const t = CONTRACT_TYPES[viewingContract.contract_type as keyof typeof CONTRACT_TYPES];
        const s = STATUSES[viewingContract.status as keyof typeof STATUSES];
        const linkedDocs = getDocumentsForContract(viewingContract.id);
        const paidAmount = getPaidAmount(viewingContract.id);
        const balance = Number(viewingContract.total_amount) - paidAmount;
        return (
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 24 }}>{t.icon}</span>
                <div>
                  <div className="text-base font-bold">{viewingContract.contract_number}</div>
                  <div className="text-xs" style={{ color: "var(--t3)" }}>{t.name} от {viewingContract.contract_date}</div>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded ml-2" style={{ background: s.color + "20", color: s.color }}>{s.name}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => printContract(viewingContract)} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)" }}>🖨 Печать</button>
                <button onClick={() => setViewingContract(null)} className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Закрыть</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>КОНТРАГЕНТ</div>
                <div className="text-sm font-bold">{viewingContract.counterparty_name}</div>
                {viewingContract.counterparty_bin && <div className="text-[11px]" style={{ color: "var(--t3)" }}>БИН: {viewingContract.counterparty_bin}</div>}
                {viewingContract.company_name && <div className="text-[11px] mt-1"><span style={{ color: "var(--t3)" }}>От нас:</span> {viewingContract.company_name}</div>}
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>СРОКИ</div>
                <div className="text-sm font-bold">
                  {viewingContract.start_date || "—"} → {viewingContract.is_perpetual ? "бессрочно" : (viewingContract.end_date || "—")}
                </div>
                {viewingContract.responsible_name && <div className="text-[11px] mt-1"><span style={{ color: "var(--t3)" }}>Ответственный:</span> {viewingContract.responsible_name}</div>}
              </div>
            </div>

            {viewingContract.subject && (
              <div className="mb-3">
                <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>ПРЕДМЕТ ДОГОВОРА</div>
                <div className="text-sm">{viewingContract.subject}</div>
              </div>
            )}

            {viewingContract.description && (
              <div className="mb-3">
                <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>ОПИСАНИЕ</div>
                <div className="text-xs" style={{ color: "var(--t2)" }}>{viewingContract.description}</div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg p-3" style={{ background: "#6366F110", border: "1px solid #6366F130" }}>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>СУММА ДОГОВОРА</div>
                <div className="text-sm font-bold" style={{ color: "#6366F1" }}>{fmtMoney(Number(viewingContract.total_amount))} {viewingContract.currency}</div>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>{viewingContract.with_nds ? `с НДС ${viewingContract.nds_rate}%` : "без НДС"}</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: "#10B98110", border: "1px solid #10B98130" }}>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>ОПЛАЧЕНО</div>
                <div className="text-sm font-bold" style={{ color: "#10B981" }}>{fmtMoney(paidAmount)} ₸</div>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>По связанным документам</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: balance > 0 ? "#EF444410" : "#10B98110", border: `1px solid ${balance > 0 ? "#EF444430" : "#10B98130"}` }}>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>ОСТАТОК</div>
                <div className="text-sm font-bold" style={{ color: balance > 0 ? "#EF4444" : "#10B981" }}>{fmtMoney(balance)} ₸</div>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>{balance > 0 ? "К оплате" : "Полностью оплачен"}</div>
              </div>
            </div>

            {(viewingContract.payment_terms || viewingContract.delivery_terms) && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                {viewingContract.payment_terms && <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Условия оплаты</div><div className="text-xs">{viewingContract.payment_terms}</div></div>}
                {viewingContract.delivery_terms && <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Условия поставки</div><div className="text-xs">{viewingContract.delivery_terms}</div></div>}
              </div>
            )}

            <div className="text-[11px] font-bold mb-2" style={{ color: "var(--t3)" }}>📄 СВЯЗАННЫЕ ДОКУМЕНТЫ ({linkedDocs.length})</div>
            {linkedDocs.length === 0 ? (
              <div className="text-xs py-3" style={{ color: "var(--t3)" }}>Нет связанных документов. Создайте документ и привяжите его к договору.</div>
            ) : (
              <div className="rounded-lg" style={{ background: "var(--bg)" }}>
                <table>
                  <tbody>{linkedDocs.map(d => (
                    <tr key={d.id}>
                      <td className="p-2 text-[12px] font-mono" style={{ color: "var(--accent)" }}>{d.doc_number}</td>
                      <td className="p-2 text-[12px]">{d.doc_type}</td>
                      <td className="p-2 text-[11px]" style={{ color: "var(--t3)" }}>{d.doc_date}</td>
                      <td className="p-2 text-[12px] text-right font-bold">{fmtMoney(Number(d.total_with_nds))} ₸</td>
                      <td className="p-2 text-[10px]"><span className="px-2 py-0.5 rounded" style={{ background: d.status === "done" ? "#10B98120" : "#6B728020", color: d.status === "done" ? "#10B981" : "#6B7280" }}>{d.status === "done" ? "Проведён" : "Черновик"}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* All contracts */}
      {tab === "all" && !viewingContract && !showForm && (
        <>
          <div className="flex gap-3 items-center flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Поиск: номер, контрагент, предмет..." style={{ flex: 1, minWidth: 200 }} />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 200 }}>
              <option value="all">Все типы</option>
              {Object.entries(CONTRACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 180 }}>
              <option value="all">Все статусы</option>
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№ договора", "Дата", "Тип", "Контрагент", "Сумма", "Действует", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filteredContracts.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>{contracts.length === 0 ? "Нет договоров. Создайте первый." : "Ничего не найдено"}</td></tr>
                ) : filteredContracts.map(c => {
                  const t = CONTRACT_TYPES[c.contract_type as keyof typeof CONTRACT_TYPES];
                  const s = STATUSES[c.status as keyof typeof STATUSES];
                  const expSoon = c.status === "active" && !c.is_perpetual && c.end_date && c.end_date >= today && c.end_date <= in30Days;
                  return (
                    <tr key={c.id}>
                      <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{c.contract_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{c.contract_date}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.icon} {t.name}</span>
                      </td>
                      <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {c.counterparty_name}
                        {c.counterparty_bin && <div className="text-[10px] font-mono" style={{ color: "var(--t3)" }}>{c.counterparty_bin}</div>}
                      </td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(c.total_amount))} {c.currency}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: expSoon ? "#F59E0B" : "var(--t3)", fontWeight: expSoon ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>
                        {c.is_perpetual ? "бессрочно" : (c.end_date ? (expSoon ? `до ${c.end_date} ⏰` : `до ${c.end_date}`) : "—")}
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <select value={c.status} onChange={e => changeStatus(c.id, e.target.value)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: s.color + "20", color: s.color, border: "none" }}>
                          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                        </select>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => setViewingContract(c)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>👁</button>
                        <button onClick={() => startEdit(c)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>✏</button>
                        <button onClick={() => deleteContract(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Expiring */}
      {tab === "expiring" && !viewingContract && !showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4" style={{ color: "#F59E0B" }}>⏰ Договоры, истекающие в ближайшие 30 дней</div>
          {expiringContracts.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет истекающих договоров. ✅</div>
          ) : (
            <div className="flex flex-col gap-2">
              {expiringContracts.map(c => {
                const daysLeft = Math.ceil((new Date(c.end_date).getTime() - new Date().getTime()) / 86400000);
                return (
                  <div key={c.id} className="rounded-lg p-3 flex justify-between items-center" style={{ background: "#F59E0B10", border: "1px solid #F59E0B30" }}>
                    <div>
                      <div className="text-sm font-bold">{c.contract_number} • {c.counterparty_name}</div>
                      <div className="text-[11px]" style={{ color: "var(--t3)" }}>{c.subject || c.contract_type}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: daysLeft <= 7 ? "#EF4444" : "#F59E0B" }}>Осталось {daysLeft} дней</div>
                      <div className="text-[11px]" style={{ color: "var(--t3)" }}>До {c.end_date}</div>
                    </div>
                    <button onClick={() => setViewingContract(c)} className="text-[11px] px-3 py-1 rounded-lg cursor-pointer" style={{ background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)" }}>Открыть</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* By counterparty */}
      {tab === "by-counterparty" && !viewingContract && !showForm && (
        <div className="flex flex-col gap-3">
          {Object.keys(byCp).length === 0 ? (
            <div className="rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>Нет договоров</div>
          ) : Object.entries(byCp).sort(([, a], [, b]) => b.length - a.length).map(([cpName, cpContracts]) => {
            const total = cpContracts.reduce((sum, c) => sum + Number(c.total_amount), 0);
            const active = cpContracts.filter(c => c.status === "active").length;
            return (
              <div key={cpName} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <div className="text-sm font-bold">{cpName}</div>
                    <div className="text-[11px]" style={{ color: "var(--t3)" }}>{cpContracts.length} договоров • Активных: {active} • Всего: {fmtMoney(total)} ₸</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {cpContracts.map(c => {
                    const t = CONTRACT_TYPES[c.contract_type as keyof typeof CONTRACT_TYPES];
                    const s = STATUSES[c.status as keyof typeof STATUSES];
                    return (
                      <div key={c.id} className="rounded-lg p-3 cursor-pointer" style={{ background: "var(--bg)", border: "1px solid var(--brd)" }} onClick={() => setViewingContract(c)}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-xs font-mono font-bold" style={{ color: "var(--accent)" }}>{c.contract_number}</div>
                            <div className="text-[11px]" style={{ color: "var(--t3)" }}>{c.contract_date} • {t.name}</div>
                          </div>
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded" style={{ background: s.color + "20", color: s.color }}>{s.name}</span>
                        </div>
                        <div className="text-sm font-bold mt-1">{fmtMoney(Number(c.total_amount))} {c.currency}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
