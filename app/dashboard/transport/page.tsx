"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "vehicles" | "drivers" | "waybills" | "fuel" | "analytics";

const FUEL_TYPES = {
  gasoline: "Бензин",
  diesel: "Дизель",
  gas: "Газ (LPG)",
  electric: "Электро",
  hybrid: "Гибрид",
};

const VEHICLE_TYPES = ["Легковой", "Грузовой", "Микроавтобус", "Автобус", "Спецтехника", "Прицеп", "Другое"];

export default function TransportPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("vehicles");
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [waybills, setWaybills] = useState<any[]>([]);
  const [fuel, setFuel] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Vehicle form
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [vehicleForm, setVehicleForm] = useState({
    plate_number: "", vehicle_type: "Легковой", brand: "", model: "", year: "",
    vin: "", engine_volume: "", fuel_type: "gasoline", fuel_consumption: "",
    capacity_kg: "", purchase_date: "", purchase_price: "",
    insurance_until: "", tech_inspection_until: "",
    current_mileage: "0", status: "active", notes: "",
  });

  // Driver form
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [driverForm, setDriverForm] = useState({
    full_name: "", iin: "", phone: "", license_number: "",
    license_categories: "B", license_until: "", hire_date: "", notes: "",
  });

  // Waybill form
  const [showWbForm, setShowWbForm] = useState(false);
  const [wbForm, setWbForm] = useState({
    waybill_number: "", waybill_date: new Date().toISOString().slice(0, 10),
    vehicle_id: "", driver_id: "",
    start_mileage: "", end_mileage: "",
    fuel_start: "", fuel_received: "0", fuel_end: "",
    route: "", cargo_description: "", cargo_weight: "",
    destination: "", purpose: "", notes: "",
  });

  // Fuel form
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelForm, setFuelForm] = useState({
    record_date: new Date().toISOString().slice(0, 10),
    vehicle_id: "", driver_id: "",
    fuel_type: "gasoline", liters: "", price_per_liter: "",
    station_name: "", receipt_number: "", mileage: "", notes: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [v, d, w, f] = await Promise.all([
      supabase.from("vehicles").select("*").eq("user_id", user.id).order("plate_number"),
      supabase.from("drivers").select("*").eq("user_id", user.id).order("full_name"),
      supabase.from("waybills").select("*").eq("user_id", user.id).order("waybill_date", { ascending: false }),
      supabase.from("fuel_records").select("*").eq("user_id", user.id).order("record_date", { ascending: false }),
    ]);
    setVehicles(v.data || []);
    setDrivers(d.data || []);
    setWaybills(w.data || []);
    setFuel(f.data || []);
  }

  // ═══ VEHICLES ═══
  function startCreateVehicle() {
    setEditingVehicle(null);
    setVehicleForm({
      plate_number: "", vehicle_type: "Легковой", brand: "", model: "", year: "",
      vin: "", engine_volume: "", fuel_type: "gasoline", fuel_consumption: "",
      capacity_kg: "", purchase_date: "", purchase_price: "",
      insurance_until: "", tech_inspection_until: "",
      current_mileage: "0", status: "active", notes: "",
    });
    setShowVehicleForm(true);
  }

  function startEditVehicle(v: any) {
    setEditingVehicle(v);
    setVehicleForm({
      plate_number: v.plate_number,
      vehicle_type: v.vehicle_type || "Легковой",
      brand: v.brand || "", model: v.model || "",
      year: String(v.year || ""), vin: v.vin || "",
      engine_volume: String(v.engine_volume || ""),
      fuel_type: v.fuel_type || "gasoline",
      fuel_consumption: String(v.fuel_consumption || ""),
      capacity_kg: String(v.capacity_kg || ""),
      purchase_date: v.purchase_date || "",
      purchase_price: String(v.purchase_price || ""),
      insurance_until: v.insurance_until || "",
      tech_inspection_until: v.tech_inspection_until || "",
      current_mileage: String(v.current_mileage || 0),
      status: v.status || "active",
      notes: v.notes || "",
    });
    setShowVehicleForm(true);
  }

  async function saveVehicle() {
    if (!vehicleForm.plate_number) { setMsg("❌ Укажите номерной знак"); setTimeout(() => setMsg(""), 3000); return; }
    const data = {
      user_id: userId,
      ...vehicleForm,
      year: Number(vehicleForm.year) || null,
      engine_volume: Number(vehicleForm.engine_volume) || null,
      fuel_consumption: Number(vehicleForm.fuel_consumption) || null,
      capacity_kg: Number(vehicleForm.capacity_kg) || null,
      purchase_price: Number(vehicleForm.purchase_price) || null,
      current_mileage: Number(vehicleForm.current_mileage) || 0,
      purchase_date: vehicleForm.purchase_date || null,
      insurance_until: vehicleForm.insurance_until || null,
      tech_inspection_until: vehicleForm.tech_inspection_until || null,
    };
    if (editingVehicle) await supabase.from("vehicles").update(data).eq("id", editingVehicle.id);
    else await supabase.from("vehicles").insert(data);
    setMsg(`✅ ${editingVehicle ? "Изменено" : "Добавлено"}: ${vehicleForm.plate_number}`);
    setShowVehicleForm(false);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteVehicle(id: string) {
    if (!confirm("Удалить транспортное средство?")) return;
    await supabase.from("vehicles").delete().eq("id", id);
    load();
  }

  // ═══ DRIVERS ═══
  async function saveDriver() {
    if (!driverForm.full_name) { setMsg("❌ Укажите ФИО водителя"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("drivers").insert({
      user_id: userId,
      ...driverForm,
      license_until: driverForm.license_until || null,
      hire_date: driverForm.hire_date || null,
    });
    setDriverForm({ full_name: "", iin: "", phone: "", license_number: "", license_categories: "B", license_until: "", hire_date: "", notes: "" });
    setShowDriverForm(false);
    setMsg("✅ Водитель добавлен");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteDriver(id: string) {
    if (!confirm("Удалить водителя?")) return;
    await supabase.from("drivers").delete().eq("id", id);
    load();
  }

  // ═══ WAYBILLS ═══
  function startCreateWb() {
    setWbForm({
      waybill_number: `ПЛ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      waybill_date: new Date().toISOString().slice(0, 10),
      vehicle_id: "", driver_id: "",
      start_mileage: "", end_mileage: "",
      fuel_start: "", fuel_received: "0", fuel_end: "",
      route: "", cargo_description: "", cargo_weight: "",
      destination: "", purpose: "", notes: "",
    });
    setShowWbForm(true);
  }

  async function saveWaybill() {
    if (!wbForm.vehicle_id || !wbForm.driver_id) {
      setMsg("❌ Выберите ТС и водителя");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const v = vehicles.find(x => x.id === wbForm.vehicle_id);
    const dr = drivers.find(x => x.id === wbForm.driver_id);

    const startM = Number(wbForm.start_mileage) || 0;
    const endM = Number(wbForm.end_mileage) || 0;
    const distance = endM - startM;

    const fuelStart = Number(wbForm.fuel_start) || 0;
    const fuelReceived = Number(wbForm.fuel_received) || 0;
    const fuelEnd = Number(wbForm.fuel_end) || 0;
    const fuelConsumed = fuelStart + fuelReceived - fuelEnd;

    // Стоимость потреблённого топлива (по средней последней закупки этого ТС)
    const lastFuel = fuel.find(f => f.vehicle_id === wbForm.vehicle_id);
    const pricePerLiter = lastFuel ? Number(lastFuel.price_per_liter || 0) : 0;
    const fuelCost = fuelConsumed * pricePerLiter;

    await supabase.from("waybills").insert({
      user_id: userId,
      waybill_number: wbForm.waybill_number,
      waybill_date: wbForm.waybill_date,
      vehicle_id: wbForm.vehicle_id,
      vehicle_plate: v?.plate_number || "",
      driver_id: wbForm.driver_id,
      driver_name: dr?.full_name || "",
      start_mileage: startM,
      end_mileage: endM,
      distance,
      fuel_start: fuelStart,
      fuel_received: fuelReceived,
      fuel_consumed: fuelConsumed,
      fuel_end: fuelEnd,
      fuel_cost: fuelCost,
      route: wbForm.route,
      cargo_description: wbForm.cargo_description,
      cargo_weight: Number(wbForm.cargo_weight) || null,
      destination: wbForm.destination,
      purpose: wbForm.purpose,
      status: "closed",
      notes: wbForm.notes,
    });

    // Обновить пробег ТС
    if (endM > 0 && v) {
      await supabase.from("vehicles").update({ current_mileage: endM }).eq("id", wbForm.vehicle_id);
    }

    // Проводка по списанию ГСМ: Дт 7210 Кт 1310 (ГСМ)
    if (fuelCost > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: wbForm.waybill_date,
        doc_ref: wbForm.waybill_number,
        debit_account: "7210",
        credit_account: "1310",
        amount: fuelCost,
        description: `Списание ГСМ по путевому листу ${wbForm.waybill_number}: ${fuelConsumed} л × ${pricePerLiter} ₸`,
      });
    }

    setMsg(`✅ Путевой лист ${wbForm.waybill_number} создан. Пробег: ${distance} км, ГСМ: ${fuelConsumed} л = ${fmtMoney(fuelCost)} ₸`);
    setShowWbForm(false);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  async function deleteWaybill(id: string) {
    if (!confirm("Удалить путевой лист?")) return;
    await supabase.from("waybills").delete().eq("id", id);
    load();
  }

  // ═══ FUEL ═══
  async function saveFuel() {
    if (!fuelForm.vehicle_id || !fuelForm.liters) {
      setMsg("❌ Выберите ТС и укажите литры"); setTimeout(() => setMsg(""), 3000); return;
    }
    const v = vehicles.find(x => x.id === fuelForm.vehicle_id);
    const dr = drivers.find(x => x.id === fuelForm.driver_id);
    const liters = Number(fuelForm.liters);
    const price = Number(fuelForm.price_per_liter) || 0;
    const total = liters * price;

    await supabase.from("fuel_records").insert({
      user_id: userId,
      record_date: fuelForm.record_date,
      vehicle_id: fuelForm.vehicle_id,
      vehicle_plate: v?.plate_number || "",
      driver_id: fuelForm.driver_id || null,
      driver_name: dr?.full_name || null,
      fuel_type: fuelForm.fuel_type,
      liters, price_per_liter: price, total_cost: total,
      station_name: fuelForm.station_name,
      receipt_number: fuelForm.receipt_number,
      mileage: Number(fuelForm.mileage) || null,
      notes: fuelForm.notes,
    });

    // Проводка: Дт 1310 (ГСМ запас) Кт 1010/1030
    if (total > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: fuelForm.record_date,
        doc_ref: fuelForm.receipt_number || `ГСМ-${Date.now()}`,
        debit_account: "1310",
        credit_account: "1010",
        amount: total,
        description: `Заправка ${v?.plate_number || ""}: ${liters} л ${FUEL_TYPES[fuelForm.fuel_type as keyof typeof FUEL_TYPES]} × ${price} ₸`,
      });
    }

    setMsg(`✅ Заправка проведена: ${liters} л × ${price} = ${fmtMoney(total)} ₸`);
    setFuelForm({ record_date: new Date().toISOString().slice(0, 10), vehicle_id: "", driver_id: "", fuel_type: "gasoline", liters: "", price_per_liter: "", station_name: "", receipt_number: "", mileage: "", notes: "" });
    setShowFuelForm(false);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function deleteFuel(id: string) {
    if (!confirm("Удалить запись?")) return;
    await supabase.from("fuel_records").delete().eq("id", id);
    load();
  }

  // KPI
  const activeVehicles = vehicles.filter(v => v.status === "active").length;
  const activeDrivers = drivers.filter(d => d.is_active).length;
  const totalFuelCost = fuel.reduce((a, f) => a + Number(f.total_cost), 0);
  const totalDistance = waybills.reduce((a, w) => a + Number(w.distance || 0), 0);
  const monthFuelCost = fuel.filter(f => f.record_date >= new Date().toISOString().slice(0, 7) + "-01").reduce((a, f) => a + Number(f.total_cost), 0);

  // Alerts: insurance / TO expiring in 30 days
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const insuranceExpiring = vehicles.filter(v => v.insurance_until && v.insurance_until >= today && v.insurance_until <= in30).length;
  const inspectionExpiring = vehicles.filter(v => v.tech_inspection_until && v.tech_inspection_until >= today && v.tech_inspection_until <= in30).length;
  const licenseExpiring = drivers.filter(d => d.license_until && d.license_until >= today && d.license_until <= in30).length;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Транспортный учёт — ТС, водители, путевые листы, ГСМ. С автоматическим списанием на затраты.
      </div>

      {/* Alerts */}
      {(insuranceExpiring + inspectionExpiring + licenseExpiring) > 0 && (
        <div className="rounded-xl p-3" style={{ background: "#F59E0B10", border: "1px solid #F59E0B30" }}>
          <div className="text-xs font-bold mb-2" style={{ color: "#F59E0B" }}>⚠ Скоро истекают (30 дней)</div>
          <div className="flex gap-4 text-[11px]">
            {insuranceExpiring > 0 && <span>🛡 Страховка: <b>{insuranceExpiring} ТС</b></span>}
            {inspectionExpiring > 0 && <span>🔍 Техосмотр: <b>{inspectionExpiring} ТС</b></span>}
            {licenseExpiring > 0 && <span>🪪 Водит. удостоверение: <b>{licenseExpiring} вод.</b></span>}
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🚗 ТС в работе</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{activeVehicles}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {vehicles.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>👥 Водителей</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{activeDrivers}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Активных</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⛽ ГСМ за месяц</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{fmtMoney(monthFuelCost)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {fmtMoney(totalFuelCost)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🛣 Пробег</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{totalDistance.toFixed(0)} км</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По всем ПЛ</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["vehicles", "🚗 Транспорт"],
          ["drivers", "👥 Водители"],
          ["waybills", "📋 Путевые листы"],
          ["fuel", "⛽ Заправки"],
          ["analytics", "📊 Аналитика"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ТРАНСПОРТ ═══ */}
      {tab === "vehicles" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Реестр транспортных средств с реквизитами и пробегом</div>
            <button onClick={startCreateVehicle} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить ТС</button>
          </div>

          {showVehicleForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{editingVehicle ? "Редактирование ТС" : "Новое транспортное средство"}</div>

              <div className="text-[11px] font-bold mb-2" style={{ color: "#6366F1" }}>📋 ОСНОВНОЕ</div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Номерной знак *</label><input value={vehicleForm.plate_number} onChange={e => setVehicleForm({ ...vehicleForm, plate_number: e.target.value.toUpperCase() })} placeholder="123ABC02" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={vehicleForm.vehicle_type} onChange={e => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}>
                    {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Марка</label><input value={vehicleForm.brand} onChange={e => setVehicleForm({ ...vehicleForm, brand: e.target.value })} placeholder="Toyota" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Модель</label><input value={vehicleForm.model} onChange={e => setVehicleForm({ ...vehicleForm, model: e.target.value })} placeholder="Camry" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Год выпуска</label><input type="number" value={vehicleForm.year} onChange={e => setVehicleForm({ ...vehicleForm, year: e.target.value })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>VIN</label><input value={vehicleForm.vin} onChange={e => setVehicleForm({ ...vehicleForm, vin: e.target.value.toUpperCase() })} maxLength={17} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Объём двиг. (л)</label><input type="number" step="0.1" value={vehicleForm.engine_volume} onChange={e => setVehicleForm({ ...vehicleForm, engine_volume: e.target.value })} /></div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#F59E0B" }}>⛽ ТОПЛИВО И ГРУЗОПОДЪЁМНОСТЬ</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип топлива</label>
                  <select value={vehicleForm.fuel_type} onChange={e => setVehicleForm({ ...vehicleForm, fuel_type: e.target.value })}>
                    {Object.entries(FUEL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Расход (л/100км)</label><input type="number" step="0.1" value={vehicleForm.fuel_consumption} onChange={e => setVehicleForm({ ...vehicleForm, fuel_consumption: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Грузоподъёмность (кг)</label><input type="number" value={vehicleForm.capacity_kg} onChange={e => setVehicleForm({ ...vehicleForm, capacity_kg: e.target.value })} /></div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#10B981" }}>📅 СРОКИ И ПРОБЕГ</div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата покупки</label><input type="date" value={vehicleForm.purchase_date} onChange={e => setVehicleForm({ ...vehicleForm, purchase_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Цена (₸)</label><input type="number" value={vehicleForm.purchase_price} onChange={e => setVehicleForm({ ...vehicleForm, purchase_price: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Страховка до</label><input type="date" value={vehicleForm.insurance_until} onChange={e => setVehicleForm({ ...vehicleForm, insurance_until: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Техосмотр до</label><input type="date" value={vehicleForm.tech_inspection_until} onChange={e => setVehicleForm({ ...vehicleForm, tech_inspection_until: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Текущий пробег</label><input type="number" value={vehicleForm.current_mileage} onChange={e => setVehicleForm({ ...vehicleForm, current_mileage: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Статус</label>
                  <select value={vehicleForm.status} onChange={e => setVehicleForm({ ...vehicleForm, status: e.target.value })}>
                    <option value="active">В работе</option>
                    <option value="repair">В ремонте</option>
                    <option value="sold">Продан</option>
                    <option value="decommissioned">Списан</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveVehicle} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => setShowVehicleForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Номер", "Тип", "Марка/Модель", "Топливо", "Пробег", "Страховка", "Техосмотр", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет транспортных средств</td></tr>
                ) : vehicles.map(v => {
                  const insExp = v.insurance_until && v.insurance_until <= in30;
                  const tiExp = v.tech_inspection_until && v.tech_inspection_until <= in30;
                  const colors: Record<string, string> = { active: "#10B981", repair: "#F59E0B", sold: "#6B7280", decommissioned: "#EF4444" };
                  const names: Record<string, string> = { active: "В работе", repair: "В ремонте", sold: "Продан", decommissioned: "Списан" };
                  return (
                    <tr key={v.id}>
                      <td className="p-2.5 text-[13px] font-bold font-mono" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{v.plate_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{v.vehicle_type}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{v.brand} {v.model} {v.year ? `(${v.year})` : ""}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{FUEL_TYPES[v.fuel_type as keyof typeof FUEL_TYPES]}{v.fuel_consumption ? ` • ${v.fuel_consumption}л/100км` : ""}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{Number(v.current_mileage || 0).toLocaleString("ru-RU")} км</td>
                      <td className="p-2.5 text-[11px]" style={{ color: insExp ? "#F59E0B" : "var(--t3)", fontWeight: insExp ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>{v.insurance_until || "—"}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: tiExp ? "#F59E0B" : "var(--t3)", fontWeight: tiExp ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>{v.tech_inspection_until || "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: colors[v.status] + "20", color: colors[v.status] }}>{names[v.status]}</span>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => startEditVehicle(v)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>✏</button>
                        <button onClick={() => deleteVehicle(v.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ВОДИТЕЛИ ═══ */}
      {tab === "drivers" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Водители с категориями прав и сроками</div>
            <button onClick={() => setShowDriverForm(!showDriverForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить водителя</button>
          </div>

          {showDriverForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО водителя *</label><input value={driverForm.full_name} onChange={e => setDriverForm({ ...driverForm, full_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ИИН</label><input value={driverForm.iin} onChange={e => setDriverForm({ ...driverForm, iin: e.target.value.replace(/\D/g, "").slice(0, 12) })} maxLength={12} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Телефон</label><input value={driverForm.phone} onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })} placeholder="+7" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ ВУ</label><input value={driverForm.license_number} onChange={e => setDriverForm({ ...driverForm, license_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Категории</label><input value={driverForm.license_categories} onChange={e => setDriverForm({ ...driverForm, license_categories: e.target.value })} placeholder="B, C, D" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ВУ действ. до</label><input type="date" value={driverForm.license_until} onChange={e => setDriverForm({ ...driverForm, license_until: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата найма</label><input type="date" value={driverForm.hire_date} onChange={e => setDriverForm({ ...driverForm, hire_date: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveDriver} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowDriverForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["ФИО", "ИИН", "Телефон", "№ ВУ", "Категории", "ВУ до", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {drivers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет водителей</td></tr>
                ) : drivers.map(d => {
                  const licExp = d.license_until && d.license_until <= in30;
                  return (
                    <tr key={d.id}>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{d.full_name}</td>
                      <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{d.iin || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{d.phone || "—"}</td>
                      <td className="p-2.5 text-[12px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{d.license_number || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{d.license_categories || "—"}</td>
                      <td className="p-2.5 text-[12px]" style={{ color: licExp ? "#F59E0B" : "var(--t3)", fontWeight: licExp ? 700 : 400, borderBottom: "1px solid var(--brd)" }}>{d.license_until || "—"}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => deleteDriver(d.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ПУТЕВЫЕ ЛИСТЫ ═══ */}
      {tab === "waybills" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Путевой лист с автоматическим расчётом расхода ГСМ и проводкой Дт 7210 Кт 1310</div>
            <button onClick={startCreateWb} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новый путевой лист</button>
          </div>

          {showWbForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Новый путевой лист</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ путевого листа</label><input value={wbForm.waybill_number} onChange={e => setWbForm({ ...wbForm, waybill_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={wbForm.waybill_date} onChange={e => setWbForm({ ...wbForm, waybill_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Транспорт *</label>
                  <select value={wbForm.vehicle_id} onChange={e => {
                    const v = vehicles.find(x => x.id === e.target.value);
                    setWbForm({ ...wbForm, vehicle_id: e.target.value, start_mileage: v ? String(v.current_mileage) : "" });
                  }}>
                    <option value="">— Выбрать —</option>
                    {vehicles.filter(v => v.status === "active").map(v => <option key={v.id} value={v.id}>{v.plate_number} • {v.brand} {v.model}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Водитель *</label>
                  <select value={wbForm.driver_id} onChange={e => setWbForm({ ...wbForm, driver_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {drivers.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.full_name}{d.license_categories ? ` (${d.license_categories})` : ""}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Цель поездки</label><input value={wbForm.purpose} onChange={e => setWbForm({ ...wbForm, purpose: e.target.value })} placeholder="Доставка груза" /></div>
              </div>

              <div className="text-[11px] font-bold mb-2 mt-3" style={{ color: "#A855F7" }}>🛣 ПРОБЕГ И ТОПЛИВО</div>
              <div className="grid grid-cols-5 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Пробег начало</label><input type="number" value={wbForm.start_mileage} onChange={e => setWbForm({ ...wbForm, start_mileage: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Пробег конец</label><input type="number" value={wbForm.end_mileage} onChange={e => setWbForm({ ...wbForm, end_mileage: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Топливо начало (л)</label><input type="number" step="0.1" value={wbForm.fuel_start} onChange={e => setWbForm({ ...wbForm, fuel_start: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Заправлено в пути (л)</label><input type="number" step="0.1" value={wbForm.fuel_received} onChange={e => setWbForm({ ...wbForm, fuel_received: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Топливо конец (л)</label><input type="number" step="0.1" value={wbForm.fuel_end} onChange={e => setWbForm({ ...wbForm, fuel_end: e.target.value })} /></div>
              </div>

              {wbForm.start_mileage && wbForm.end_mileage && (
                <div className="rounded-lg p-3 mb-3" style={{ background: "var(--bg)" }}>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Пробег</div><div className="font-bold" style={{ color: "#A855F7" }}>{Number(wbForm.end_mileage) - Number(wbForm.start_mileage)} км</div></div>
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Расход топлива</div><div className="font-bold" style={{ color: "#F59E0B" }}>{(Number(wbForm.fuel_start) + Number(wbForm.fuel_received) - Number(wbForm.fuel_end)).toFixed(2)} л</div></div>
                    <div><div className="text-[10px]" style={{ color: "var(--t3)" }}>Удельный расход</div>
                      <div className="font-bold">{Number(wbForm.end_mileage) > Number(wbForm.start_mileage) ? (((Number(wbForm.fuel_start) + Number(wbForm.fuel_received) - Number(wbForm.fuel_end)) / (Number(wbForm.end_mileage) - Number(wbForm.start_mileage))) * 100).toFixed(2) : "0"} л/100км</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Маршрут</label><input value={wbForm.route} onChange={e => setWbForm({ ...wbForm, route: e.target.value })} placeholder="Алматы → Астана → Алматы" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Пункт назначения</label><input value={wbForm.destination} onChange={e => setWbForm({ ...wbForm, destination: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание груза</label><input value={wbForm.cargo_description} onChange={e => setWbForm({ ...wbForm, cargo_description: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Вес груза (кг)</label><input type="number" value={wbForm.cargo_weight} onChange={e => setWbForm({ ...wbForm, cargo_weight: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={wbForm.notes} onChange={e => setWbForm({ ...wbForm, notes: e.target.value })} /></div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveWaybill} className="px-5 py-2 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#10B981" }}>✓ Закрыть путевой лист</button>
                <button onClick={() => setShowWbForm(false)} className="px-4 py-2 rounded-xl text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№", "Дата", "ТС", "Водитель", "Пробег", "ГСМ (л)", "Стоимость", "Маршрут", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {waybills.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет путевых листов</td></tr>
                ) : waybills.map(w => (
                  <tr key={w.id}>
                    <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{w.waybill_number}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{w.waybill_date}</td>
                    <td className="p-2.5 text-[12px] font-mono font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{w.vehicle_plate}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{w.driver_name}</td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ color: "#A855F7", borderBottom: "1px solid var(--brd)" }}>{Number(w.distance || 0).toFixed(0)} км</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{Number(w.fuel_consumed || 0).toFixed(2)}</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(w.fuel_cost || 0))} ₸</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{w.route || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteWaybill(w.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ЗАПРАВКИ ═══ */}
      {tab === "fuel" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Заправки ГСМ с автоматической проводкой Дт 1310 Кт 1010</div>
            <button onClick={() => setShowFuelForm(!showFuelForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Заправка</button>
          </div>

          {showFuelForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={fuelForm.record_date} onChange={e => setFuelForm({ ...fuelForm, record_date: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Транспорт *</label>
                  <select value={fuelForm.vehicle_id} onChange={e => {
                    const v = vehicles.find(x => x.id === e.target.value);
                    setFuelForm({ ...fuelForm, vehicle_id: e.target.value, fuel_type: v?.fuel_type || "gasoline" });
                  }}>
                    <option value="">— Выбрать —</option>
                    {vehicles.filter(v => v.status === "active").map(v => <option key={v.id} value={v.id}>{v.plate_number} • {v.brand} {v.model}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Водитель</label>
                  <select value={fuelForm.driver_id} onChange={e => setFuelForm({ ...fuelForm, driver_id: e.target.value })}>
                    <option value="">— Не указан —</option>
                    {drivers.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип топлива</label>
                  <select value={fuelForm.fuel_type} onChange={e => setFuelForm({ ...fuelForm, fuel_type: e.target.value })}>
                    {Object.entries(FUEL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Литров</label><input type="number" step="0.01" value={fuelForm.liters} onChange={e => setFuelForm({ ...fuelForm, liters: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Цена за литр (₸)</label><input type="number" step="0.01" value={fuelForm.price_per_liter} onChange={e => setFuelForm({ ...fuelForm, price_per_liter: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>АЗС</label><input value={fuelForm.station_name} onChange={e => setFuelForm({ ...fuelForm, station_name: e.target.value })} placeholder="Helios / Sinooil" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ чека</label><input value={fuelForm.receipt_number} onChange={e => setFuelForm({ ...fuelForm, receipt_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Пробег при заправке</label><input type="number" value={fuelForm.mileage} onChange={e => setFuelForm({ ...fuelForm, mileage: e.target.value })} /></div>
              </div>

              {fuelForm.liters && fuelForm.price_per_liter && (
                <div className="rounded-lg p-3 mb-3" style={{ background: "#10B98110" }}>
                  <div className="text-base font-bold" style={{ color: "#10B981" }}>
                    Сумма: {fmtMoney(Number(fuelForm.liters) * Number(fuelForm.price_per_liter))} ₸
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={saveFuel} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Провести заправку</button>
                <button onClick={() => setShowFuelForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Дата", "ТС", "Водитель", "Тип", "Литров", "Цена", "Сумма", "АЗС", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {fuel.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет заправок</td></tr>
                ) : fuel.map(f => (
                  <tr key={f.id}>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{f.record_date}</td>
                    <td className="p-2.5 text-[12px] font-mono font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{f.vehicle_plate}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{f.driver_name || "—"}</td>
                    <td className="p-2.5 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{FUEL_TYPES[f.fuel_type as keyof typeof FUEL_TYPES] || f.fuel_type}</td>
                    <td className="p-2.5 text-[12px] font-bold" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{Number(f.liters).toFixed(2)} л</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{Number(f.price_per_liter || 0).toFixed(2)} ₸</td>
                    <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(f.total_cost))} ₸</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{f.station_name || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteFuel(f.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
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
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">🛣 Топ ТС по пробегу</div>
            {(() => {
              const byVeh: Record<string, number> = {};
              waybills.forEach(w => { byVeh[w.vehicle_plate] = (byVeh[w.vehicle_plate] || 0) + Number(w.distance || 0); });
              const top = Object.entries(byVeh).sort(([, a], [, b]) => b - a).slice(0, 5);
              if (top.length === 0) return <div className="text-xs py-3" style={{ color: "var(--t3)" }}>Нет данных</div>;
              const max = top[0][1];
              return top.map(([plate, dist], i) => {
                const pct = (dist / max) * 100;
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-mono font-bold" style={{ width: 100 }}>{plate}</span>
                    <div style={{ flex: 1, height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#A855F7" }} />
                    </div>
                    <span className="text-xs font-bold" style={{ width: 80, textAlign: "right" }}>{dist.toFixed(0)} км</span>
                  </div>
                );
              });
            })()}
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">⛽ Топ ТС по затратам на ГСМ</div>
            {(() => {
              const byVeh: Record<string, number> = {};
              fuel.forEach(f => { byVeh[f.vehicle_plate] = (byVeh[f.vehicle_plate] || 0) + Number(f.total_cost); });
              const top = Object.entries(byVeh).sort(([, a], [, b]) => b - a).slice(0, 5);
              if (top.length === 0) return <div className="text-xs py-3" style={{ color: "var(--t3)" }}>Нет данных</div>;
              const max = top[0][1];
              return top.map(([plate, cost], i) => {
                const pct = (cost / max) * 100;
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-mono font-bold" style={{ width: 100 }}>{plate}</span>
                    <div style={{ flex: 1, height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#F59E0B" }} />
                    </div>
                    <span className="text-xs font-bold" style={{ width: 110, textAlign: "right", color: "#10B981" }}>{fmtMoney(cost)} ₸</span>
                  </div>
                );
              });
            })()}
          </div>

          <div className="rounded-xl p-5 col-span-2" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <div className="text-sm font-bold mb-3">📊 Расход по ТС (план/факт)</div>
            <table>
              <thead><tr>{["ТС", "Норматив (л/100км)", "Факт (л/100км)", "Пробег (км)", "Сожжено (л)", "Затраты"].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {vehicles.filter(v => v.status === "active").map(v => {
                  const wb = waybills.filter(w => w.vehicle_id === v.id);
                  const totalDist = wb.reduce((a, w) => a + Number(w.distance || 0), 0);
                  const totalFuel = wb.reduce((a, w) => a + Number(w.fuel_consumed || 0), 0);
                  const totalCost = fuel.filter(f => f.vehicle_id === v.id).reduce((a, f) => a + Number(f.total_cost), 0);
                  const factConsumption = totalDist > 0 ? (totalFuel / totalDist * 100) : 0;
                  const overConsumed = v.fuel_consumption && factConsumption > Number(v.fuel_consumption) * 1.1;
                  return (
                    <tr key={v.id}>
                      <td className="p-2.5 text-[12px] font-mono font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{v.plate_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{v.fuel_consumption || "—"}</td>
                      <td className="p-2.5 text-[12px] font-bold" style={{ color: overConsumed ? "#EF4444" : "#10B981", borderBottom: "1px solid var(--brd)" }}>{factConsumption.toFixed(2)}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{totalDist.toFixed(0)}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{totalFuel.toFixed(2)}</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(totalCost)} ₸</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
