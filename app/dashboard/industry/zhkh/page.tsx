"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "apartments" | "services" | "charges";

const RATE_TYPES = {
  per_area: "за м²",
  per_apt: "за квартиру",
  per_resident: "с проживающего",
  fixed: "фиксированная",
};

export default function ZhkhPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("apartments");
  const [apts, setApts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Apartment form
  const [showAptForm, setShowAptForm] = useState(false);
  const [aptForm, setAptForm] = useState({ apt_number: "", building: "", entrance: "", floor: "", area: "", residents_count: "1", owner_name: "", owner_phone: "", apt_type: "apartment", notes: "" });

  // Service form
  const [showServForm, setShowServForm] = useState(false);
  const [servForm, setServForm] = useState({ service_name: "", service_code: "", unit: "м²", rate: "", rate_type: "per_area", description: "" });

  // Charge generation
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [chargePeriod, setChargePeriod] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [a, s, c] = await Promise.all([
      supabase.from("zhkh_apartments").select("*").eq("user_id", user.id).order("apt_number"),
      supabase.from("zhkh_services").select("*").eq("user_id", user.id),
      supabase.from("zhkh_charges").select("*").eq("user_id", user.id).order("charge_period", { ascending: false }),
    ]);
    setApts(a.data || []);
    setServices(s.data || []);
    setCharges(c.data || []);
  }

  async function addApt() {
    if (!aptForm.apt_number) { setMsg("❌ Укажите номер квартиры"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("zhkh_apartments").insert({
      user_id: userId,
      ...aptForm,
      floor: Number(aptForm.floor) || null,
      area: Number(aptForm.area) || null,
      residents_count: Number(aptForm.residents_count),
    });
    setAptForm({ apt_number: "", building: "", entrance: "", floor: "", area: "", residents_count: "1", owner_name: "", owner_phone: "", apt_type: "apartment", notes: "" });
    setShowAptForm(false);
    setMsg("✅ Квартира добавлена");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteApt(id: string) {
    if (!confirm("Удалить квартиру и её начисления?")) return;
    await supabase.from("zhkh_charges").delete().eq("apartment_id", id);
    await supabase.from("zhkh_apartments").delete().eq("id", id);
    load();
  }

  async function addService() {
    if (!servForm.service_name || !servForm.rate) { setMsg("❌ Заполните название и тариф"); setTimeout(() => setMsg(""), 3000); return; }
    await supabase.from("zhkh_services").insert({ user_id: userId, ...servForm, rate: Number(servForm.rate) });
    setServForm({ service_name: "", service_code: "", unit: "м²", rate: "", rate_type: "per_area", description: "" });
    setShowServForm(false);
    load();
  }

  async function deleteService(id: string) {
    if (!confirm("Удалить услугу?")) return;
    await supabase.from("zhkh_services").delete().eq("id", id);
    load();
  }

  async function generateCharges() {
    if (!chargePeriod) return;
    if (apts.length === 0) { setMsg("❌ Сначала добавьте квартиры"); setTimeout(() => setMsg(""), 3000); return; }
    if (services.length === 0) { setMsg("❌ Сначала добавьте тарифы"); setTimeout(() => setMsg(""), 3000); return; }

    const existing = charges.filter(c => c.charge_period === chargePeriod);
    if (existing.length > 0) {
      if (!confirm(`Начисления за ${chargePeriod} уже существуют (${existing.length}). Создать заново?`)) return;
      for (const e of existing) await supabase.from("zhkh_charges").delete().eq("id", e.id);
    }

    let count = 0;
    for (const apt of apts) {
      const details = services.map(s => {
        let amount = 0;
        if (s.rate_type === "per_area") amount = Number(apt.area || 0) * Number(s.rate);
        else if (s.rate_type === "per_resident") amount = Number(apt.residents_count) * Number(s.rate);
        else if (s.rate_type === "per_apt" || s.rate_type === "fixed") amount = Number(s.rate);
        return { service_name: s.service_name, unit: s.unit, rate: Number(s.rate), amount: Math.round(amount * 100) / 100 };
      });
      const total = details.reduce((a, d) => a + d.amount, 0);

      await supabase.from("zhkh_charges").insert({
        user_id: userId,
        apartment_id: apt.id,
        apt_number: apt.apt_number,
        owner_name: apt.owner_name,
        charge_period: chargePeriod,
        total_amount: total,
        debt_amount: total,
        details,
        status: "unpaid",
      });
      count++;
    }
    setMsg(`✅ Начислено за ${chargePeriod}: ${count} квартир`);
    setShowChargeForm(false);
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function markPaid(id: string) {
    const c = charges.find(x => x.id === id);
    if (!c) return;
    await supabase.from("zhkh_charges").update({
      paid_amount: Number(c.total_amount),
      debt_amount: 0,
      status: "paid",
      paid_at: new Date().toISOString(),
    }).eq("id", id);

    // Создать ПКО
    await supabase.from("cash_operations").insert({
      user_id: userId,
      op_type: "pko",
      op_date: new Date().toISOString().slice(0, 10),
      amount: Number(c.total_amount),
      description: `Оплата за ЖКУ кв. ${c.apt_number} за ${c.charge_period}`,
      doc_number: `PKO-ZHKH-${Date.now()}`,
    });

    // Проводка Дт 1010 Кт 1210
    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: new Date().toISOString().slice(0, 10),
      doc_ref: `ZHKH-${c.apt_number}-${c.charge_period}`,
      debit_account: "1010",
      credit_account: "1210",
      amount: Number(c.total_amount),
      description: `Оплата за ЖКУ кв. ${c.apt_number}`,
    });

    setMsg("✅ Оплата проведена");
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  // KPI
  const totalApts = apts.length;
  const totalArea = apts.reduce((a, p) => a + Number(p.area || 0), 0);
  const totalDebt = charges.filter(c => c.status !== "paid").reduce((a, c) => a + Number(c.debt_amount), 0);
  const totalPaid = charges.filter(c => c.status === "paid").reduce((a, c) => a + Number(c.total_amount), 0);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #3B82F6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🏘 Квартир</div>
          <div className="text-xl font-bold" style={{ color: "#3B82F6" }}>{totalApts}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Площадь: {totalArea.toFixed(0)} м²</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Услуг (тарифов)</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{services.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Активных</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⚠ Задолженность</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{fmtMoney(totalDebt)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{charges.filter(c => c.status !== "paid").length} долгов</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✅ Поступило</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{fmtMoney(totalPaid)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего оплачено</div>
        </div>
      </div>

      <div className="flex gap-2">
        {([["apartments", "🏘 Квартиры"], ["services", "📋 Тарифы"], ["charges", "💰 Начисления"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ КВАРТИРЫ ═══ */}
      {tab === "apartments" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Реестр квартир/помещений с собственниками</div>
            <button onClick={() => setShowAptForm(!showAptForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить квартиру</button>
          </div>

          {showAptForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ квартиры *</label><input value={aptForm.apt_number} onChange={e => setAptForm({ ...aptForm, apt_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дом</label><input value={aptForm.building} onChange={e => setAptForm({ ...aptForm, building: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Подъезд</label><input value={aptForm.entrance} onChange={e => setAptForm({ ...aptForm, entrance: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Этаж</label><input type="number" value={aptForm.floor} onChange={e => setAptForm({ ...aptForm, floor: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Площадь, м²</label><input type="number" step="0.01" value={aptForm.area} onChange={e => setAptForm({ ...aptForm, area: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Проживает</label><input type="number" value={aptForm.residents_count} onChange={e => setAptForm({ ...aptForm, residents_count: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип</label>
                  <select value={aptForm.apt_type} onChange={e => setAptForm({ ...aptForm, apt_type: e.target.value })}>
                    <option value="apartment">Квартира</option><option value="commercial">Коммерческое</option><option value="parking">Паркинг</option>
                  </select>
                </div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО собственника</label><input value={aptForm.owner_name} onChange={e => setAptForm({ ...aptForm, owner_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Телефон</label><input value={aptForm.owner_phone} onChange={e => setAptForm({ ...aptForm, owner_phone: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addApt} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
                <button onClick={() => setShowAptForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["№", "Дом", "Этаж", "Площадь", "Прож.", "Собственник", "Телефон", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {apts.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет квартир. Добавьте первую.</td></tr>
                ) : apts.map(a => (
                  <tr key={a.id}>
                    <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>№ {a.apt_number}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.building || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.floor || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.area ? `${a.area} м²` : "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.residents_count}</td>
                    <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{a.owner_name || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{a.owner_phone || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteApt(a.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ ТАРИФЫ ═══ */}
      {tab === "services" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Тарифы на коммунальные услуги (отопление, вода, вывоз мусора и т.д.)</div>
            <button onClick={() => setShowServForm(!showServForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Добавить тариф</button>
          </div>

          {showServForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название услуги</label><input value={servForm.service_name} onChange={e => setServForm({ ...servForm, service_name: e.target.value })} placeholder="Содержание дома" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Код</label><input value={servForm.service_code} onChange={e => setServForm({ ...servForm, service_code: e.target.value })} placeholder="СОД-001" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тариф (₸)</label><input type="number" step="0.0001" value={servForm.rate} onChange={e => setServForm({ ...servForm, rate: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип расчёта</label>
                  <select value={servForm.rate_type} onChange={e => setServForm({ ...servForm, rate_type: e.target.value })}>
                    {Object.entries(RATE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ед. измерения</label><input value={servForm.unit} onChange={e => setServForm({ ...servForm, unit: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addService} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Создать</button>
                <button onClick={() => setShowServForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Код", "Название", "Тариф", "Тип расчёта", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {services.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет тарифов</td></tr>
                ) : services.map(s => (
                  <tr key={s.id}>
                    <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{s.service_code || "—"}</td>
                    <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{s.service_name}</td>
                    <td className="p-2.5 text-[13px] font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{s.rate} ₸/{s.unit}</td>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{RATE_TYPES[s.rate_type as keyof typeof RATE_TYPES]}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteService(s.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ НАЧИСЛЕНИЯ ═══ */}
      {tab === "charges" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>Начисления за коммунальные услуги по периодам</div>
            <button onClick={() => setShowChargeForm(!showChargeForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Начислить за период</button>
          </div>

          {showChargeForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Начислить за все квартиры</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Период (месяц)</label><input type="month" value={chargePeriod} onChange={e => setChargePeriod(e.target.value)} /></div>
              </div>
              <div className="text-[11px] mb-3 p-3 rounded-lg" style={{ background: "var(--bg)", color: "var(--t2)" }}>
                ℹ️ Будут начислены {services.length} услуг для {apts.length} квартир. Расчёт зависит от типа тарифа: за м², за квартиру или с проживающего.
              </div>
              <div className="flex gap-2">
                <button onClick={generateCharges} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981" }}>✓ Начислить</button>
                <button onClick={() => setShowChargeForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Период", "№ кв.", "Собственник", "Сумма", "Оплачено", "Долг", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {charges.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет начислений</td></tr>
                ) : charges.map(c => {
                  const colors: Record<string, string> = { unpaid: "#EF4444", partial: "#F59E0B", paid: "#10B981" };
                  const names: Record<string, string> = { unpaid: "Не оплачено", partial: "Частично", paid: "Оплачено" };
                  return (
                    <tr key={c.id}>
                      <td className="p-2.5 text-[12px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{c.charge_period}</td>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>№ {c.apt_number}</td>
                      <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{c.owner_name || "—"}</td>
                      <td className="p-2.5 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(c.total_amount))} ₸</td>
                      <td className="p-2.5 text-[12px] text-right" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(c.paid_amount))}</td>
                      <td className="p-2.5 text-[12px] text-right" style={{ color: "#EF4444", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(c.debt_amount))}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: colors[c.status] + "20", color: colors[c.status] }}>{names[c.status]}</span>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        {c.status !== "paid" && <button onClick={() => markPaid(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#10B981" }}>✓ Оплачено</button>}
                      </td>
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
