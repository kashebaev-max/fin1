"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

interface FixedAsset {
  id: string; name: string; inventory_number: string; category: string;
  purchase_date: string; initial_cost: number; useful_life_months: number;
  depreciation_method: string; accumulated_depreciation: number; status: string;
}

export default function AssetsPage() {
  const supabase = createClient();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", inventory_number: "", category: "equipment", purchase_date: new Date().toISOString().slice(0, 10), initial_cost: "", useful_life_months: "60", depreciation_method: "straight_line" });
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase.from("products").select("*").eq("user_id", user.id).eq("category", "fixed_asset").order("name");
    if (data) {
      setAssets(data.map((d: any) => ({
        id: d.id, name: d.name, inventory_number: d.unit,
        category: "equipment", purchase_date: d.created_at?.slice(0, 10) || "",
        initial_cost: Number(d.price), useful_life_months: Number(d.min_quantity) || 60,
        depreciation_method: "straight_line",
        accumulated_depreciation: Number(d.quantity),
        status: "active",
      })));
    }
  }

  async function addAsset() {
    await supabase.from("products").insert({
      user_id: userId, name: form.name, unit: form.inventory_number,
      price: Number(form.initial_cost), quantity: 0,
      min_quantity: Number(form.useful_life_months), category: "fixed_asset",
    });
    await supabase.from("journal_entries").insert({
      user_id: userId, entry_date: form.purchase_date,
      doc_ref: `ОС-${form.inventory_number}`, debit_account: "2410", credit_account: "1030",
      amount: Number(form.initial_cost), description: `Приобретение ОС: ${form.name}`,
    });
    setMsg(`✅ ОС "${form.name}" принято к учёту. Проводка: Дт 2410 Кт 1030 — ${fmtMoney(Number(form.initial_cost))} ₸`);
    setForm({ name: "", inventory_number: "", category: "equipment", purchase_date: new Date().toISOString().slice(0, 10), initial_cost: "", useful_life_months: "60", depreciation_method: "straight_line" });
    setShowAdd(false); load();
    setTimeout(() => setMsg(""), 5000);
  }

  function monthlyDepreciation(asset: FixedAsset): number {
    return Math.round(asset.initial_cost / asset.useful_life_months);
  }

  function residualValue(asset: FixedAsset): number {
    return Math.max(0, asset.initial_cost - asset.accumulated_depreciation);
  }

  function depreciationPercent(asset: FixedAsset): number {
    if (asset.initial_cost === 0) return 0;
    return Math.round((asset.accumulated_depreciation / asset.initial_cost) * 100);
  }

  async function accrueDepreciation() {
    let totalDep = 0;
    for (const asset of assets) {
      if (asset.accumulated_depreciation >= asset.initial_cost) continue;
      const monthly = monthlyDepreciation(asset);
      const newAccum = Math.min(asset.initial_cost, asset.accumulated_depreciation + monthly);
      await supabase.from("products").update({ quantity: newAccum }).eq("id", asset.id);
      totalDep += monthly;
    }
    if (totalDep > 0) {
      await supabase.from("journal_entries").insert({
        user_id: userId, entry_date: new Date().toISOString().slice(0, 10),
        doc_ref: `АМОР-${new Date().toISOString().slice(0, 7)}`,
        debit_account: "7110", credit_account: "2420",
        amount: totalDep, description: `Начисление амортизации ОС за ${new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}`,
      });
    }
    setMsg(`✅ Амортизация начислена: ${fmtMoney(totalDep)} ₸. Проводка: Дт 7110 Кт 2420`);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  const totalInitial = assets.reduce((a, x) => a + x.initial_cost, 0);
  const totalAccum = assets.reduce((a, x) => a + x.accumulated_depreciation, 0);
  const totalResidual = assets.reduce((a, x) => a + residualValue(x), 0);
  const categories: Record<string, string> = { equipment: "Оборудование", vehicle: "Транспорт", building: "Здания", furniture: "Мебель", computer: "Компьютеры", other: "Прочее" };

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: "#10B98120", color: "#10B981" }}>{msg}</div>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[{ l: "Первоначальная стоимость", v: fmtMoney(totalInitial) + " ₸", c: "#6366F1" }, { l: "Накопленная амортизация", v: fmtMoney(totalAccum) + " ₸", c: "#F59E0B" }, { l: "Остаточная стоимость", v: fmtMoney(totalResidual) + " ₸", c: "#10B981" }].map((x, i) => (
          <div key={i} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${x.c}` }}>
            <div className="text-xs mb-1.5" style={{ color: "var(--t3)" }}>{x.l}</div>
            <div className="text-xl font-bold" style={{ color: x.c }}>{x.v}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={() => setShowAdd(!showAdd)} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Принять ОС к учёту</button>
        <button onClick={accrueDepreciation} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "#F59E0B" }}>📊 Начислить амортизацию за месяц</button>
      </div>

      {showAdd && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">Принятие ОС к учёту</div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Компьютер Dell Optiplex" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Инвентарный номер</label><input value={form.inventory_number} onChange={e => setForm({ ...form, inventory_number: e.target.value })} placeholder="ОС-001" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Категория</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата ввода в эксплуатацию</label><input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Первоначальная стоимость (₸)</label><input type="number" value={form.initial_cost} onChange={e => setForm({ ...form, initial_cost: e.target.value })} placeholder="500000" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Срок полезного использования (мес.)</label><input type="number" value={form.useful_life_months} onChange={e => setForm({ ...form, useful_life_months: e.target.value })} placeholder="60" /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addAsset} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Принять к учёту</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
          <p className="text-[10px] mt-2" style={{ color: "var(--t3)" }}>Проводка при постановке на учёт: Дт 2410 «Основные средства» — Кт 1030 «Денежные средства на р/с»</p>
        </div>
      )}

      {/* Assets table */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-sm font-bold mb-3">Основные средства</div>
        <table>
          <thead><tr>{["Наименование", "Инв. №", "Первонач. ст-ть", "Амортизация", "Остаточная", "Износ %", "Ежемесячно"].map(h => <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>)}</tr></thead>
          <tbody>{assets.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет основных средств. Нажмите «Принять ОС к учёту».</td></tr> : assets.map(a => (
            <tr key={a.id}>
              <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{a.name}</td>
              <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{a.inventory_number}</td>
              <td className="p-2.5 text-[13px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(a.initial_cost)} ₸</td>
              <td className="p-2.5 text-[13px] text-right" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(a.accumulated_depreciation)} ₸</td>
              <td className="p-2.5 text-[13px] text-right font-semibold" style={{ color: "#10B981", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(residualValue(a))} ₸</td>
              <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                <div className="flex items-center gap-2">
                  <div style={{ width: 60, height: 6, background: "var(--brd)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${depreciationPercent(a)}%`, height: "100%", background: depreciationPercent(a) >= 100 ? "#EF4444" : "#F59E0B", borderRadius: 3 }} />
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: "var(--t3)" }}>{depreciationPercent(a)}%</span>
                </div>
              </td>
              <td className="p-2.5 text-[13px] text-right" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(monthlyDepreciation(a))} ₸</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="text-[10px] mt-3" style={{ color: "var(--t3)" }}>Метод: прямолинейный (равномерный). Проводка амортизации: Дт 7110 «Расходы по реализации» — Кт 2420 «Амортизация ОС» (МСБУ 16, НК РК 2026)</p>
      </div>
    </div>
  );
}
