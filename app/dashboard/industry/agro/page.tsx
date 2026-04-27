"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "fields" | "livestock" | "operations";

const OP_TYPES = ["Посев", "Пахота", "Вспашка", "Внесение удобрений", "Опрыскивание", "Полив", "Уборка урожая", "Сенокос", "Прочее"];

export default function AgroPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("fields");
  const [fields, setFields] = useState<any[]>([]);
  const [livestock, setLivestock] = useState<any[]>([]);
  const [ops, setOps] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Field form
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [fieldForm, setFieldForm] = useState({ field_name: "", field_code: "", area_ha: "", location: "", cadastral_number: "", soil_type: "", current_crop: "", planting_date: "", harvest_date: "", expected_yield_ton: "", actual_yield_ton: "", notes: "" });

  // Livestock form
  const [showLiveForm, setShowLiveForm] = useState(false);
  const [liveForm, setLiveForm] = useState({ animal_type: "", breed: "", count: "1", age_months: "", weight_kg: "", identifier: "", acquisition_date: "", acquisition_price: "", status: "active" });

  // Operation form
  const [showOpForm, setShowOpForm] = useState(false);
  const [opForm, setOpForm] = useState({ operation_date: new Date().toISOString().slice(0, 10), operation_type: "Посев", field_id: "", description: "", cost: "", responsible_name: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [f, l, o] = await Promise.all([
      supabase.from("agro_fields").select("*").eq("user_id", user.id).order("field_name"),
      supabase.from("agro_livestock").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("agro_operations").select("*").eq("user_id", user.id).order("operation_date", { ascending: false }),
    ]);
    setFields(f.data || []);
    setLivestock(l.data || []);
    setOps(o.data || []);
  }

  async function addField() {
    if (!fieldForm.field_name) { setMsg("❌ Укажите название поля"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("agro_fields").insert({
      user_id: userId,
      ...fieldForm,
      area_ha: Number(fieldForm.area_ha) || null,
      planting_date: fieldForm.planting_date || null,
      harvest_date: fieldForm.harvest_date || null,
      expected_yield_ton: Number(fieldForm.expected_yield_ton) || null,
      actual_yield_ton: Number(fieldForm.actual_yield_ton) || null,
    });
    setFieldForm({ field_name: "", field_code: "", area_ha: "", location: "", cadastral_number: "", soil_type: "", current_crop: "", planting_date: "", harvest_date: "", expected_yield_ton: "", actual_yield_ton: "", notes: "" });
    setShowFieldForm(false);
    setMsg("✅ Поле добавлено");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteField(id: string) {
    if (!confirm("Удалить поле?")) return;
    await supabase.from("agro_fields").delete().eq("id", id);
    load();
  }

  async function addLivestock() {
    if (!liveForm.animal_type) { setMsg("❌ Укажите вид животных"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("agro_livestock").insert({
      user_id: userId,
      ...liveForm,
      count: Number(liveForm.count),
      age_months: Number(liveForm.age_months) || null,
      weight_kg: Number(liveForm.weight_kg) || null,
      acquisition_price: Number(liveForm.acquisition_price) || null,
      acquisition_date: liveForm.acquisition_date || null,
    });
    setLiveForm({ animal_type: "", breed: "", count: "1", age_months: "", weight_kg: "", identifier: "", acquisition_date: "", acquisition_price: "", status: "active" });
    setShowLiveForm(false);
    setMsg("✅ Скот добавлен");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteLive(id: string) {
    if (!confirm("Удалить запись?")) return;
    await supabase.from("agro_livestock").delete().eq("id", id);
    load();
  }

  async function addOp() {
    if (!opForm.field_id) { setMsg("❌ Выберите поле"); setTimeout(() => setMsg(""), 3000); return; }
    const f = fields.find(x => x.id === opForm.field_id);
    await supabase.from("agro_operations").insert({
      user_id: userId,
      ...opForm,
      field_name: f?.field_name || "",
      cost: Number(opForm.cost) || 0,
    });
    setOpForm({ operation_date: new Date().toISOString().slice(0, 10), operation_type: "Посев", field_id: "", description: "", cost: "", responsible_name: "" });
    setShowOpForm(false);
    setMsg("✅ Операция записана");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteOp(id: string) {
    if (!confirm("Удалить операцию?")) return;
    await supabase.from("agro_operations").delete().eq("id", id);
    load();
  }

  // KPI
  const totalArea = fields.reduce((a, f) => a + Number(f.area_ha || 0), 0);
  const totalLivestock = livestock.filter(l => l.status === "active").reduce((a, l) => a + Number(l.count), 0);
  const totalYield = fields.reduce((a, f) => a + Number(f.actual_yield_ton || 0), 0);
  const totalOpCost = ops.reduce((a, o) => a + Number(o.cost), 0);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🌾 Полей</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fields.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{totalArea.toFixed(1)} га</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🐄 Поголовье</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{totalLivestock}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Активных</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📦 Урожай</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{totalYield.toFixed(1)} т</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего собрано</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💸 Затраты</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{fmtMoney(totalOpCost)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>На операции</div>
        </div>
      </div>

      <div className="flex gap-2">
        {([["fields", "🌾 Поля и культуры"], ["livestock", "🐄 Скот"], ["operations", "🚜 Сезонные операции"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ПОЛЯ ═══ */}
      {tab === "fields" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Земельные участки с культурами и сроками сева/уборки</div>
            <button onClick={() => setShowFieldForm(!showFieldForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить поле</button>
          </div>

          {showFieldForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название поля</label><input value={fieldForm.field_name} onChange={e => setFieldForm({ ...fieldForm, field_name: e.target.value })} placeholder='Поле №1 "Северное"' /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label><input value={fieldForm.field_code} onChange={e => setFieldForm({ ...fieldForm, field_code: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Площадь (га)</label><input type="number" step="0.01" value={fieldForm.area_ha} onChange={e => setFieldForm({ ...fieldForm, area_ha: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Кадастр. №</label><input value={fieldForm.cadastral_number} onChange={e => setFieldForm({ ...fieldForm, cadastral_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип почвы</label><input value={fieldForm.soil_type} onChange={e => setFieldForm({ ...fieldForm, soil_type: e.target.value })} placeholder="Чернозём" /></div>
                <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Местоположение</label><input value={fieldForm.location} onChange={e => setFieldForm({ ...fieldForm, location: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Текущая культура</label><input value={fieldForm.current_crop} onChange={e => setFieldForm({ ...fieldForm, current_crop: e.target.value })} placeholder="Пшеница" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата сева</label><input type="date" value={fieldForm.planting_date} onChange={e => setFieldForm({ ...fieldForm, planting_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата уборки</label><input type="date" value={fieldForm.harvest_date} onChange={e => setFieldForm({ ...fieldForm, harvest_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>План урожая (т)</label><input type="number" step="0.1" value={fieldForm.expected_yield_ton} onChange={e => setFieldForm({ ...fieldForm, expected_yield_ton: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Факт урожая (т)</label><input type="number" step="0.1" value={fieldForm.actual_yield_ton} onChange={e => setFieldForm({ ...fieldForm, actual_yield_ton: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addField} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowFieldForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Поле", "Площадь", "Культура", "Сев", "Уборка", "План (т)", "Факт (т)", "Урожайность", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {fields.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет полей</td></tr>
                ) : fields.map(f => {
                  const yieldHa = Number(f.area_ha) > 0 && Number(f.actual_yield_ton) > 0 ? (Number(f.actual_yield_ton) / Number(f.area_ha)).toFixed(2) : "—";
                  return (
                    <tr key={f.id}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{f.field_name}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{f.area_ha ? `${f.area_ha} га` : "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{f.current_crop || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{f.planting_date || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{f.harvest_date || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{f.expected_yield_ton || "—"}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{f.actual_yield_ton || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{yieldHa !== "—" ? `${yieldHa} т/га` : "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteField(f.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ СКОТ ═══ */}
      {tab === "livestock" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Учёт поголовья: КРС, МРС, лошади, птица</div>
            <button onClick={() => setShowLiveForm(!showLiveForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить</button>
          </div>

          {showLiveForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Вид</label><input value={liveForm.animal_type} onChange={e => setLiveForm({ ...liveForm, animal_type: e.target.value })} placeholder="КРС / Овцы / Лошади" list="animal-types" />
                  <datalist id="animal-types"><option value="КРС (крупный рогатый скот)" /><option value="МРС (мелкий рогатый скот)" /><option value="Овцы" /><option value="Козы" /><option value="Лошади" /><option value="Свиньи" /><option value="Куры" /><option value="Утки" /><option value="Гуси" /></datalist>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Порода</label><input value={liveForm.breed} onChange={e => setLiveForm({ ...liveForm, breed: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Голов</label><input type="number" value={liveForm.count} onChange={e => setLiveForm({ ...liveForm, count: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Возраст (мес.)</label><input type="number" value={liveForm.age_months} onChange={e => setLiveForm({ ...liveForm, age_months: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Вес (кг)</label><input type="number" step="0.1" value={liveForm.weight_kg} onChange={e => setLiveForm({ ...liveForm, weight_kg: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Идентиф. №</label><input value={liveForm.identifier} onChange={e => setLiveForm({ ...liveForm, identifier: e.target.value })} placeholder="Бирка" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата приёма</label><input type="date" value={liveForm.acquisition_date} onChange={e => setLiveForm({ ...liveForm, acquisition_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Цена приобр. (₸)</label><input type="number" value={liveForm.acquisition_price} onChange={e => setLiveForm({ ...liveForm, acquisition_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Статус</label>
                  <select value={liveForm.status} onChange={e => setLiveForm({ ...liveForm, status: e.target.value })}>
                    <option value="active">В стаде</option><option value="sold">Продан</option><option value="died">Пал</option><option value="slaughtered">На убой</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addLivestock} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowLiveForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Вид", "Порода", "Голов", "Возраст", "Вес", "Идент.", "Цена", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {livestock.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет скота</td></tr>
                ) : livestock.map(l => {
                  const colors: Record<string, string> = { active: "#10B981", sold: "#3B82F6", died: "#EF4444", slaughtered: "#F59E0B" };
                  const names: Record<string, string> = { active: "В стаде", sold: "Продан", died: "Пал", slaughtered: "На убой" };
                  return (
                    <tr key={l.id}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{l.animal_type}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.breed || "—"}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{l.count}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.age_months ? `${l.age_months} мес` : "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.weight_kg ? `${l.weight_kg} кг` : "—"}</td>
                      <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{l.identifier || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{l.acquisition_price ? `${fmtMoney(l.acquisition_price)} ₸` : "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: colors[l.status] + "20", color: colors[l.status] }}>{names[l.status]}</span>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteLive(l.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ОПЕРАЦИИ ═══ */}
      {tab === "operations" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Сезонные сельхоз операции с привязкой к полям</div>
            <button onClick={() => setShowOpForm(!showOpForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Записать операцию</button>
          </div>

          {showOpForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={opForm.operation_date} onChange={e => setOpForm({ ...opForm, operation_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип операции</label>
                  <select value={opForm.operation_type} onChange={e => setOpForm({ ...opForm, operation_type: e.target.value })}>
                    {OP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Поле</label>
                  <select value={opForm.field_id} onChange={e => setOpForm({ ...opForm, field_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {fields.map(f => <option key={f.id} value={f.id}>{f.field_name} ({f.area_ha} га)</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={opForm.description} onChange={e => setOpForm({ ...opForm, description: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Стоимость (₸)</label><input type="number" value={opForm.cost} onChange={e => setOpForm({ ...opForm, cost: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ответственный</label><input value={opForm.responsible_name} onChange={e => setOpForm({ ...opForm, responsible_name: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addOp} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Записать</button>
                <button onClick={() => setShowOpForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Дата", "Операция", "Поле", "Описание", "Затраты", "Ответственный", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {ops.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет операций</td></tr>
                ) : ops.map(o => (
                  <tr key={o.id}>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{o.operation_date}</td>
                    <td className="p-2.5 text-[13px] font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{o.operation_type}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{o.field_name || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{o.description || "—"}</td>
                    <td className="p-2.5 text-[12px] font-bold text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(o.cost))} ₸</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{o.responsible_name || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteOp(o.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
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
