"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TAX, fmtMoney } from "@/lib/tax2026";
import type { Product } from "@/lib/types";

export default function WarehousePage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "шт", price: "", quantity: "", min_quantity: "", category: "goods" });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("products").select("*").eq("user_id", user.id).order("name");
    setProducts((data || []) as Product[]);
  }

  async function addProduct() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("products").insert({
      user_id: user.id, name: form.name, unit: form.unit,
      price: Number(form.price), quantity: Number(form.quantity),
      min_quantity: Number(form.min_quantity), category: form.category,
    });
    setForm({ name: "", unit: "шт", price: "", quantity: "", min_quantity: "", category: "goods" });
    setShowAdd(false);
    load();
  }

  async function deleteProduct(id: string) {
    await supabase.from("products").delete().eq("id", id);
    load();
  }

  const totalValue = products.reduce((a, p) => a + Number(p.price) * Number(p.quantity), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-xs" style={{ color: "var(--t3)" }}>Общая стоимость (без НДС)</div>
          <div className="text-2xl font-bold">{fmtMoney(totalValue)} ₸</div>
          <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>С НДС 16%: {fmtMoney(Math.round(totalValue * 1.16))} ₸</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Товар/Услуга</button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Цемент М500" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Ед. изм.</label>
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                {["шт", "кг", "тонна", "м", "м²", "м³", "мешок", "л", "рейс", "усл."].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Цена (₸)</label>
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Кол-во</label>
              <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Мин. остаток</label>
              <input type="number" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addProduct} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <table>
          <thead>
            <tr>
              {["Наименование", "Остаток", "Ед.", "Мин.", "Цена (без НДС)", "Цена (с НДС 16%)", "Стоимость", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Добавьте товары или услуги</td></tr>
            ) : products.map(p => {
              const low = Number(p.quantity) < Number(p.min_quantity) && Number(p.min_quantity) > 0;
              return (
                <tr key={p.id}>
                  <td className="p-2.5 text-[13px] font-medium" style={{ borderBottom: "1px solid var(--brd)" }}>{p.name}</td>
                  <td className="p-2.5 text-[13px] font-bold" style={{ color: low ? "#EF4444" : "var(--t1)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.quantity))}</td>
                  <td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{p.unit}</td>
                  <td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.min_quantity))}</td>
                  <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.price))} ₸</td>
                  <td className="p-2.5 text-[13px]" style={{ color: "#F59E0B", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Math.round(Number(p.price) * 1.16))} ₸</td>
                  <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(Number(p.price) * Number(p.quantity))} ₸</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md" style={{ background: low ? "#EF444420" : "#10B98120", color: low ? "#EF4444" : "#10B981" }}>
                      {low ? "⚠ Мало" : "✓ Норма"}
                    </span>
                  </td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <button onClick={() => deleteProduct(p.id)} className="bg-transparent border-none cursor-pointer text-sm" style={{ color: "#EF4444" }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
