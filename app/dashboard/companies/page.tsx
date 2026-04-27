"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

const TAX_REGIMES = [
  { key: "general", name: "Общеустановленный (ОУР)", desc: "КПН 20%, НДС 16%" },
  { key: "snr_simple", name: "Упрощённая декларация (СНР)", desc: "ИПН+СН 4%, ФНО 910" },
  { key: "snr_patent", name: "СНР на основе патента", desc: "Для ИП с одним сотрудником" },
  { key: "snr_fixed", name: "СНР с фиксированным вычетом", desc: "Для отдельных видов деятельности" },
  { key: "ezn", name: "Единый земельный налог", desc: "Для крестьянских хозяйств" },
];

const LEGAL_FORMS = ["ТОО", "ИП", "АО", "ГУ", "ОЮЛ", "ПК", "ОДО"];

export default function CompaniesPage() {
  const supabase = createClient();
  const [companies, setCompanies] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const emptyForm = {
    company_name: "", company_short_name: "", bin: "",
    legal_form: "ТОО", director_name: "", accountant_name: "",
    legal_address: "", actual_address: "", phone: "", email: "",
    bank_name: "", bank_iik: "", bank_bik: "",
    tax_regime: "general", is_nds_payer: false,
    nds_certificate: "", okpo: "", oked: "", notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [c, d] = await Promise.all([
      supabase.from("user_companies").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).order("company_name"),
      supabase.from("documents").select("id, company_id, total_with_nds, doc_type").eq("user_id", user.id),
    ]);
    setCompanies(c.data || []);
    setDocs(d.data || []);
  }

  function startCreate() {
    setEditingCompany(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(c: any) {
    setEditingCompany(c);
    setForm({
      company_name: c.company_name || "",
      company_short_name: c.company_short_name || "",
      bin: c.bin || "",
      legal_form: c.legal_form || "ТОО",
      director_name: c.director_name || "",
      accountant_name: c.accountant_name || "",
      legal_address: c.legal_address || "",
      actual_address: c.actual_address || "",
      phone: c.phone || "",
      email: c.email || "",
      bank_name: c.bank_name || "",
      bank_iik: c.bank_iik || "",
      bank_bik: c.bank_bik || "",
      tax_regime: c.tax_regime || "general",
      is_nds_payer: !!c.is_nds_payer,
      nds_certificate: c.nds_certificate || "",
      okpo: c.okpo || "",
      oked: c.oked || "",
      notes: c.notes || "",
    });
    setShowForm(true);
  }

  async function saveCompany() {
    if (!form.company_name) { setMsg("❌ Укажите название организации"); setTimeout(() => setMsg(""), 3000); return; }
    if (form.bin && form.bin.length !== 12) { setMsg("❌ БИН должен содержать 12 цифр"); setTimeout(() => setMsg(""), 3000); return; }

    if (editingCompany) {
      await supabase.from("user_companies").update(form).eq("id", editingCompany.id);
      setMsg(`✅ Организация «${form.company_name}» обновлена`);
    } else {
      const data: any = { user_id: userId, ...form };
      if (companies.length === 0) data.is_default = true;
      await supabase.from("user_companies").insert(data);
      setMsg(`✅ Организация «${form.company_name}» добавлена`);
    }
    setShowForm(false);
    setEditingCompany(null);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function setDefault(id: string) {
    await supabase.from("user_companies").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("user_companies").update({ is_default: true }).eq("id", id);
    setMsg("✅ Основная организация изменена");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteCompany(id: string) {
    const c = companies.find(x => x.id === id);
    if (!confirm(`Удалить организацию "${c?.company_name}"? Документы останутся, но потеряют связь с компанией.`)) return;
    await supabase.from("user_companies").delete().eq("id", id);
    load();
  }

  function getCompanyStats(companyId: string) {
    const cDocs = docs.filter(d => d.company_id === companyId);
    const total = cDocs.reduce((a, d) => a + Number(d.total_with_nds), 0);
    return { count: cDocs.length, total };
  }

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🏢 Организаций</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{companies.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Активных: {companies.filter(c => c.is_active).length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✓ Плательщики НДС</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{companies.filter(c => c.is_nds_payer).length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Из всех организаций</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📄 Всего документов</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{docs.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По всем компаниям</div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-xs" style={{ color: "var(--t3)" }}>
          Многофирменный учёт — ведение нескольких юр. лиц в одной системе. Основная организация подставляется в документах автоматически.
        </div>
        <button onClick={startCreate} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>
          + Добавить организацию
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">{editingCompany ? "Редактировать организацию" : "Новая организация"}</div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#6366F1" }}>📋 ОСНОВНОЕ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Полное название *</label><input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} placeholder='ТОО «Ваша Компания»' /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Краткое название</label><input value={form.company_short_name} onChange={e => setForm({ ...form, company_short_name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>БИН/ИИН (12 цифр)</label><input value={form.bin} onChange={e => setForm({ ...form, bin: e.target.value.replace(/\D/g, "").slice(0, 12) })} maxLength={12} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Орг.-прав. форма</label>
              <select value={form.legal_form} onChange={e => setForm({ ...form, legal_form: e.target.value })}>
                {LEGAL_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ОКЭД</label><input value={form.oked} onChange={e => setForm({ ...form, oked: e.target.value })} placeholder="46.49.0" /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#10B981" }}>👥 РУКОВОДСТВО</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Директор</label><input value={form.director_name} onChange={e => setForm({ ...form, director_name: e.target.value })} placeholder="ФИО руководителя" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Главный бухгалтер</label><input value={form.accountant_name} onChange={e => setForm({ ...form, accountant_name: e.target.value })} placeholder="ФИО гл. бухгалтера" /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#F59E0B" }}>📍 АДРЕС И КОНТАКТЫ</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Юридический адрес</label><input value={form.legal_address} onChange={e => setForm({ ...form, legal_address: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Фактический адрес</label><input value={form.actual_address} onChange={e => setForm({ ...form, actual_address: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Телефон</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#EC4899" }}>🏦 БАНКОВСКИЕ РЕКВИЗИТЫ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Банк</label><input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="АО «Halyk Bank»" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>БИК</label><input value={form.bank_bik} onChange={e => setForm({ ...form, bank_bik: e.target.value })} placeholder="HSBKKZKX" /></div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИК (расчётный счёт)</label><input value={form.bank_iik} onChange={e => setForm({ ...form, bank_iik: e.target.value })} placeholder="KZ12345678901234567890" /></div>
          </div>

          <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#A855F7" }}>⚖ НАЛОГООБЛОЖЕНИЕ</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Налоговый режим</label>
              <select value={form.tax_regime} onChange={e => setForm({ ...form, tax_regime: e.target.value })}>
                {TAX_REGIMES.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer" style={{ paddingBottom: 8 }}>
                <input type="checkbox" checked={form.is_nds_payer} onChange={e => setForm({ ...form, is_nds_payer: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span className="text-xs" style={{ color: "var(--t1)" }}>Плательщик НДС (16%)</span>
              </label>
            </div>
            {form.is_nds_payer && (
              <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ свидетельства о постановке на учёт по НДС</label><input value={form.nds_certificate} onChange={e => setForm({ ...form, nds_certificate: e.target.value })} /></div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={saveCompany} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              💾 {editingCompany ? "Сохранить" : "Создать организацию"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingCompany(null); }} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {companies.length === 0 ? (
          <div className="col-span-2 rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-3xl mb-2">🏢</div>
            <div className="text-sm font-bold mb-2">Нет организаций</div>
            <div className="text-xs" style={{ color: "var(--t3)" }}>Добавьте первую организацию для ведения учёта</div>
          </div>
        ) : companies.map(c => {
          const stats = getCompanyStats(c.id);
          const regime = TAX_REGIMES.find(r => r.key === c.tax_regime);
          return (
            <div key={c.id} className="rounded-xl p-5"
              style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: c.is_default ? "3px solid #10B981" : `1px solid var(--brd)` }}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-base font-bold">{c.company_short_name || c.company_name}</div>
                    {c.is_default && <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>ОСНОВНАЯ</span>}
                    {c.is_nds_payer && <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: "#EC489920", color: "#EC4899" }}>НДС</span>}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                    {c.legal_form} • БИН: {c.bin || "—"} • {regime?.name || c.tax_regime}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
                <div><span style={{ color: "var(--t3)" }}>Директор:</span> {c.director_name || "—"}</div>
                <div><span style={{ color: "var(--t3)" }}>Бухгалтер:</span> {c.accountant_name || "—"}</div>
                <div><span style={{ color: "var(--t3)" }}>Телефон:</span> {c.phone || "—"}</div>
                <div><span style={{ color: "var(--t3)" }}>Email:</span> {c.email || "—"}</div>
                <div className="col-span-2"><span style={{ color: "var(--t3)" }}>Адрес:</span> {c.legal_address || "—"}</div>
                {c.bank_name && <div className="col-span-2"><span style={{ color: "var(--t3)" }}>Банк:</span> {c.bank_name} • {c.bank_iik}</div>}
              </div>

              <div className="flex justify-between items-center pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
                <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                  📄 {stats.count} документов • {fmtMoney(stats.total)} ₸
                </div>
                <div className="flex gap-2">
                  {!c.is_default && (
                    <button onClick={() => setDefault(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#10B981" }}>
                      Сделать основной
                    </button>
                  )}
                  <button onClick={() => startEdit(c)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "var(--accent)" }}>✏</button>
                  <button onClick={() => deleteCompany(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl p-4" style={{ background: "#F59E0B10", border: "1px solid #F59E0B30" }}>
        <div className="text-xs font-bold mb-2" style={{ color: "#F59E0B" }}>ℹ️ Как работает многофирменный учёт</div>
        <div className="text-[11px]" style={{ color: "var(--t2)", lineHeight: 1.7 }}>
          1. Добавьте все ваши организации (ТОО, ИП и др.) в одной системе.<br />
          2. Назначьте одну как «Основную» — её реквизиты будут подставляться в новых документах автоматически.<br />
          3. Каждая организация имеет свой налоговый режим, БИН и банковские реквизиты.<br />
          4. В документах можно выбирать, от какой именно организации создавать документ.<br />
          5. Отчётность ФНО (910, 200, 300, 100) формируется отдельно по каждой организации.
        </div>
      </div>
    </div>
  );
}
