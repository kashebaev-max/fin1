"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "medicines" | "prescriptions" | "expiring";

const FORMS = ["Таблетки", "Капсулы", "Сироп", "Раствор", "Мазь", "Крем", "Гель", "Капли", "Спрей", "Свечи", "Порошок", "Ингалятор"];
const PHARM_GROUPS = ["Антибиотики", "Анальгетики", "Жаропонижающие", "Антигистаминные", "Витамины", "Сердечно-сосудистые", "ЖКТ", "Дыхательная система", "Нервная система", "Гормональные", "Дерматология", "Прочее"];

export default function PharmacyPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("medicines");
  const [medicines, setMedicines] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");

  // Medicine form
  const [showMedForm, setShowMedForm] = useState(false);
  const [medForm, setMedForm] = useState({
    name: "", international_name: "", manufacturer: "", country: "", form: "Таблетки",
    dosage: "", package: "", prescription_required: false, barcode: "", series: "",
    expiration_date: "", storage_conditions: "", pharmacy_group: "", atc_code: "",
    registration_number: "", purchase_price: "", retail_price: "", quantity: "0", min_stock: "5",
  });

  // Prescription form
  const [showPrescForm, setShowPrescForm] = useState(false);
  const [prescForm, setPrescForm] = useState({
    prescription_number: "", prescription_date: new Date().toISOString().slice(0, 10),
    patient_name: "", patient_iin: "", doctor_name: "", clinic_name: "",
  });
  const [prescItems, setPrescItems] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [m, p] = await Promise.all([
      supabase.from("pharmacy_medicines").select("*").eq("user_id", user.id).order("name"),
      supabase.from("pharmacy_prescriptions").select("*").eq("user_id", user.id).order("prescription_date", { ascending: false }),
    ]);
    setMedicines(m.data || []);
    setPrescriptions(p.data || []);
  }

  async function addMed() {
    if (!medForm.name) { setMsg("❌ Укажите название"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("pharmacy_medicines").insert({
      user_id: userId,
      ...medForm,
      purchase_price: Number(medForm.purchase_price) || null,
      retail_price: Number(medForm.retail_price) || null,
      quantity: Number(medForm.quantity),
      min_stock: Number(medForm.min_stock),
      expiration_date: medForm.expiration_date || null,
    });
    setMedForm({
      name: "", international_name: "", manufacturer: "", country: "", form: "Таблетки",
      dosage: "", package: "", prescription_required: false, barcode: "", series: "",
      expiration_date: "", storage_conditions: "", pharmacy_group: "", atc_code: "",
      registration_number: "", purchase_price: "", retail_price: "", quantity: "0", min_stock: "5",
    });
    setShowMedForm(false);
    setMsg("✅ Лекарство добавлено");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteMed(id: string) {
    if (!confirm("Удалить лекарство?")) return;
    await supabase.from("pharmacy_medicines").delete().eq("id", id);
    load();
  }

  function addPrescItem() {
    setPrescItems([...prescItems, { medicine_id: "", name: "", quantity: 1, price: 0, sum: 0 }]);
  }

  function selectPrescMed(i: number, mid: string) {
    const m = medicines.find(x => x.id === mid);
    if (!m) return;
    const n = [...prescItems];
    n[i] = {
      medicine_id: mid,
      name: m.name,
      quantity: 1,
      price: Number(m.retail_price || 0),
      sum: Number(m.retail_price || 0),
    };
    setPrescItems(n);
  }

  function updPrescQty(i: number, qty: number) {
    const n = [...prescItems];
    n[i] = { ...n[i], quantity: qty, sum: qty * Number(n[i].price) };
    setPrescItems(n);
  }

  function removePrescItem(i: number) {
    setPrescItems(prescItems.filter((_, idx) => idx !== i));
  }

  async function dispensePrescription() {
    if (prescItems.length === 0) { setMsg("❌ Добавьте лекарства"); setTimeout(() => setMsg(""), 3000); return; }
    if (!prescForm.patient_name) { setMsg("❌ Укажите пациента"); setTimeout(() => setMsg(""), 3000); return; }

    const total = prescItems.reduce((a, it) => a + Number(it.sum), 0);

    await supabase.from("pharmacy_prescriptions").insert({
      user_id: userId,
      prescription_number: prescForm.prescription_number || `Rx-${Date.now()}`,
      prescription_date: prescForm.prescription_date,
      patient_name: prescForm.patient_name,
      patient_iin: prescForm.patient_iin,
      doctor_name: prescForm.doctor_name,
      clinic_name: prescForm.clinic_name,
      medicines: prescItems,
      total_amount: total,
      is_dispensed: true,
      dispensed_at: new Date().toISOString(),
    });

    // Списать со склада
    for (const it of prescItems) {
      if (it.medicine_id) {
        const m = medicines.find(x => x.id === it.medicine_id);
        if (m) {
          await supabase.from("pharmacy_medicines").update({
            quantity: Math.max(0, Number(m.quantity) - it.quantity),
          }).eq("id", it.medicine_id);
        }
      }
    }

    // Проводка
    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: prescForm.prescription_date,
      doc_ref: prescForm.prescription_number || `Rx-${Date.now()}`,
      debit_account: "1010",
      credit_account: "6010",
      amount: total,
      description: `Аптека: рецепт ${prescForm.patient_name}`,
    });

    setMsg(`✅ Рецепт отпущен. Сумма: ${fmtMoney(total)} ₸`);
    setPrescForm({ prescription_number: "", prescription_date: new Date().toISOString().slice(0, 10), patient_name: "", patient_iin: "", doctor_name: "", clinic_name: "" });
    setPrescItems([]);
    setShowPrescForm(false);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function deletePresc(id: string) {
    if (!confirm("Удалить рецепт?")) return;
    await supabase.from("pharmacy_prescriptions").delete().eq("id", id);
    load();
  }

  // KPI
  const totalMeds = medicines.length;
  const lowStock = medicines.filter(m => Number(m.quantity) < Number(m.min_stock)).length;
  const today = new Date().toISOString().slice(0, 10);
  const in60Days = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const expiringSoon = medicines.filter(m => m.expiration_date && m.expiration_date >= today && m.expiration_date <= in60Days).length;
  const expired = medicines.filter(m => m.expiration_date && m.expiration_date < today).length;
  const totalValue = medicines.reduce((a, m) => a + Number(m.retail_price || 0) * Number(m.quantity), 0);

  const filteredMeds = medicines.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.international_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.barcode?.includes(search)
  );

  const expiringList = medicines.filter(m => m.expiration_date).sort((a, b) => (a.expiration_date || "").localeCompare(b.expiration_date || ""));

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EC4899" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>💊 Лекарств</div>
          <div className="text-lg font-bold" style={{ color: "#EC4899" }}>{totalMeds}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>💰 Стоимость</div>
          <div className="text-lg font-bold" style={{ color: "#6366F1" }}>{fmtMoney(totalValue)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>⚠ Заканчивается</div>
          <div className="text-lg font-bold" style={{ color: "#F59E0B" }}>{lowStock}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>📅 Истекает срок</div>
          <div className="text-lg font-bold" style={{ color: "#EF4444" }}>{expiringSoon}</div>
          <div className="text-[9px] mt-1" style={{ color: "var(--t3)" }}>Просрочено: {expired}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>📋 Рецептов</div>
          <div className="text-lg font-bold" style={{ color: "#10B981" }}>{prescriptions.length}</div>
        </div>
      </div>

      <div className="flex gap-2">
        {([["medicines", "💊 Каталог лекарств"], ["prescriptions", "📋 Рецепты"], ["expiring", "📅 Сроки годности"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ЛЕКАРСТВА ═══ */}
      {tab === "medicines" && (
        <>
          <div className="flex justify-between gap-3 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Поиск по названию, МНН или штрихкоду..." style={{ maxWidth: 400 }} />
            <button onClick={() => setShowMedForm(!showMedForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer flex-shrink-0" style={{ background: "var(--accent)" }}>+ Добавить лекарство</button>
          </div>

          {showMedForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-[11px] font-bold mb-2" style={{ color: "#EC4899" }}>📋 ОСНОВНОЕ</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Торговое название *</label><input value={medForm.name} onChange={e => setMedForm({ ...medForm, name: e.target.value })} placeholder="Парацетамол" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>МНН</label><input value={medForm.international_name} onChange={e => setMedForm({ ...medForm, international_name: e.target.value })} placeholder="Paracetamol" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Производитель</label><input value={medForm.manufacturer} onChange={e => setMedForm({ ...medForm, manufacturer: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Страна</label><input value={medForm.country} onChange={e => setMedForm({ ...medForm, country: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Регистр. №</label><input value={medForm.registration_number} onChange={e => setMedForm({ ...medForm, registration_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Форма</label>
                  <select value={medForm.form} onChange={e => setMedForm({ ...medForm, form: e.target.value })}>
                    {FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дозировка</label><input value={medForm.dosage} onChange={e => setMedForm({ ...medForm, dosage: e.target.value })} placeholder="500 мг" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Упаковка</label><input value={medForm.package} onChange={e => setMedForm({ ...medForm, package: e.target.value })} placeholder="20 табл." /></div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#F59E0B" }}>📦 ИДЕНТИФИКАЦИЯ И СРОКИ</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Штрихкод</label><input value={medForm.barcode} onChange={e => setMedForm({ ...medForm, barcode: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Серия</label><input value={medForm.series} onChange={e => setMedForm({ ...medForm, series: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Срок годности</label><input type="date" value={medForm.expiration_date} onChange={e => setMedForm({ ...medForm, expiration_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Условия хранения</label><input value={medForm.storage_conditions} onChange={e => setMedForm({ ...medForm, storage_conditions: e.target.value })} placeholder="до +25°C" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>АТХ-код</label><input value={medForm.atc_code} onChange={e => setMedForm({ ...medForm, atc_code: e.target.value })} placeholder="N02BE01" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Фарм. группа</label>
                  <select value={medForm.pharmacy_group} onChange={e => setMedForm({ ...medForm, pharmacy_group: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {PHARM_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#10B981" }}>💰 ЦЕНЫ И ОСТАТКИ</div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Закупочная (₸)</label><input type="number" value={medForm.purchase_price} onChange={e => setMedForm({ ...medForm, purchase_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Розничная (₸)</label><input type="number" value={medForm.retail_price} onChange={e => setMedForm({ ...medForm, retail_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Остаток (упак.)</label><input type="number" value={medForm.quantity} onChange={e => setMedForm({ ...medForm, quantity: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Мин. остаток</label><input type="number" value={medForm.min_stock} onChange={e => setMedForm({ ...medForm, min_stock: e.target.value })} /></div>
              </div>

              <div className="mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={medForm.prescription_required} onChange={e => setMedForm({ ...medForm, prescription_required: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                  <span className="text-xs">📋 Требуется рецепт</span>
                </label>
              </div>

              <div className="flex gap-2">
                <button onClick={addMed} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => setShowMedForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Название", "МНН", "Форма", "Дозировка", "Произв.", "Срок", "Цена", "Остаток", "Rx", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {filteredMeds.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет лекарств</td></tr>
                ) : filteredMeds.map(m => {
                  const isExpired = m.expiration_date && m.expiration_date < today;
                  const isExpiringSoon = m.expiration_date && m.expiration_date >= today && m.expiration_date <= in60Days;
                  const isLowStock = Number(m.quantity) < Number(m.min_stock);
                  return (
                    <tr key={m.id}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{m.name}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{m.international_name || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{m.form}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{m.dosage || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{m.manufacturer || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: isExpired ? "#EF4444" : isExpiringSoon ? "#F59E0B" : "var(--t3)", borderBottom: "1px solid var(--brd)", fontWeight: isExpired || isExpiringSoon ? 700 : 400 }}>
                        {m.expiration_date || "—"}
                      </td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{m.retail_price ? fmtMoney(m.retail_price) : "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: isLowStock ? "#EF4444" : "var(--t1)", fontWeight: isLowStock ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>
                        {m.quantity}
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {m.prescription_required && <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "#EC489920", color: "#EC4899" }}>Rx</span>}
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteMed(m.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ РЕЦЕПТЫ ═══ */}
      {tab === "prescriptions" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Рецептурный отпуск с автоматическим списанием со склада</div>
            <button onClick={() => setShowPrescForm(!showPrescForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новый рецепт</button>
          </div>

          {showPrescForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ рецепта</label><input value={prescForm.prescription_number} onChange={e => setPrescForm({ ...prescForm, prescription_number: e.target.value })} placeholder="Rx-2026-001" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={prescForm.prescription_date} onChange={e => setPrescForm({ ...prescForm, prescription_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО пациента</label><input value={prescForm.patient_name} onChange={e => setPrescForm({ ...prescForm, patient_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН</label><input value={prescForm.patient_iin} onChange={e => setPrescForm({ ...prescForm, patient_iin: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Врач</label><input value={prescForm.doctor_name} onChange={e => setPrescForm({ ...prescForm, doctor_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Поликлиника</label><input value={prescForm.clinic_name} onChange={e => setPrescForm({ ...prescForm, clinic_name: e.target.value })} /></div>
              </div>

              <div className="text-xs font-bold mb-2" style={{ color: "var(--t3)" }}>💊 ЛЕКАРСТВА В РЕЦЕПТЕ:</div>
              {prescItems.map((it, i) => (
                <div key={i} className="flex gap-2 items-end mb-2">
                  <div className="flex-1">
                    <select value={it.medicine_id} onChange={e => selectPrescMed(i, e.target.value)}>
                      <option value="">— Выбрать лекарство —</option>
                      {medicines.filter(m => Number(m.quantity) > 0).map(m => <option key={m.id} value={m.id}>{m.name} {m.dosage} ({m.form}) — остаток: {m.quantity}</option>)}
                    </select>
                  </div>
                  <div className="w-20"><input type="number" value={it.quantity} onChange={e => updPrescQty(i, Number(e.target.value))} placeholder="Кол." /></div>
                  <div className="w-24 text-xs pb-2" style={{ color: "var(--t3)" }}>× {fmtMoney(it.price)} ₸</div>
                  <div className="w-28 text-xs pb-2 text-right font-bold">{fmtMoney(it.sum)} ₸</div>
                  <button onClick={() => removePrescItem(i)} className="text-sm cursor-pointer border-none bg-transparent pb-2" style={{ color: "#EF4444" }}>×</button>
                </div>
              ))}
              <button onClick={addPrescItem} className="text-xs px-3 py-1 rounded-lg cursor-pointer mb-3" style={{ background: "transparent", border: "1px dashed var(--brd)", color: "var(--accent)" }}>+ Добавить лекарство</button>

              <div className="flex justify-between items-center p-3 rounded-lg mb-3" style={{ background: "var(--bg)" }}>
                <div className="text-sm font-bold">ИТОГО:</div>
                <div className="text-lg font-bold" style={{ color: "#10B981" }}>{fmtMoney(prescItems.reduce((a, it) => a + Number(it.sum), 0))} ₸</div>
              </div>

              <div className="flex gap-2">
                <button onClick={dispensePrescription} className="px-5 py-2 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>✓ Отпустить рецепт</button>
                <button onClick={() => setShowPrescForm(false)} className="px-4 py-2 rounded-xl text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№ Rx", "Дата", "Пациент", "Врач", "Поликлиника", "Препаратов", "Сумма", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {prescriptions.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет рецептов</td></tr>
                ) : prescriptions.map(p => (
                  <tr key={p.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{p.prescription_number}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.prescription_date}</td>
                    <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{p.patient_name}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{p.doctor_name || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.clinic_name || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{(p.medicines || []).length}</td>
                    <td className="p-2.5 text-[13px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.total_amount))} ₸</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deletePresc(p.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ СРОКИ ГОДНОСТИ ═══ */}
      {tab === "expiring" && (
        <>
          <div className="text-xs" style={{ color: "var(--t3)" }}>
            Контроль сроков годности — лекарства с истекающим сроком отмечены жёлтым, просроченные — красным
          </div>
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Название", "Серия", "Срок годности", "Дней осталось", "Остаток", "Стоимость риска"].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {expiringList.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет лекарств со сроком годности</td></tr>
                ) : expiringList.map(m => {
                  const daysLeft = m.expiration_date ? Math.ceil((new Date(m.expiration_date).getTime() - new Date().getTime()) / 86400000) : 0;
                  const expired = daysLeft < 0;
                  const soon = daysLeft >= 0 && daysLeft <= 60;
                  const value = Number(m.retail_price || 0) * Number(m.quantity);
                  return (
                    <tr key={m.id}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{m.name}</td>
                      <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{m.series || "—"}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ color: expired ? "#EF4444" : soon ? "#F59E0B" : "#10B981", borderBottom: "1px solid var(--brd)" }}>{m.expiration_date}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ color: expired ? "#EF4444" : soon ? "#F59E0B" : "#10B981", borderBottom: "1px solid var(--brd)" }}>
                        {expired ? `Просрочено на ${Math.abs(daysLeft)} дней` : `${daysLeft} дней`}
                      </td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{m.quantity} упак.</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: expired ? "#EF4444" : "var(--t1)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(value)} ₸</td>
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
