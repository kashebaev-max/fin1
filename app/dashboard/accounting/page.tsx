"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

export default function AccountingPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0,10), doc_ref: "", debit_account: "", credit_account: "", amount: "", description: "" });

  useEffect(() => { load(); }, []);
  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("journal_entries").select("*").eq("user_id", user.id).order("entry_date", { ascending: false }).limit(50);
    setEntries(data || []);
  }
  async function addEntry() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("journal_entries").insert({ user_id: user.id, ...form, amount: Number(form.amount) });
    setForm({ entry_date: new Date().toISOString().slice(0,10), doc_ref: "", debit_account: "", credit_account: "", amount: "", description: "" });
    setShowAdd(false); load();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-center">
        <div className="text-xs" style={{ color: "var(--t3)" }}>Журнал проводок • НДС 16% по НК РК 2026</div>
        <button onClick={() => setShowAdd(!showAdd)} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Проводка</button>
      </div>
      {showAdd && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="grid grid-cols-6 gap-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата</label><input type="date" value={form.entry_date} onChange={e => setForm({...form, entry_date: e.target.value})} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Документ</label><input value={form.doc_ref} onChange={e => setForm({...form, doc_ref: e.target.value})} placeholder="ПКО-42" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дебет</label><input value={form.debit_account} onChange={e => setForm({...form, debit_account: e.target.value})} placeholder="1010" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Кредит</label><input value={form.credit_account} onChange={e => setForm({...form, credit_account: e.target.value})} placeholder="1210" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма</label><input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Оплата..." /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addEntry} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Добавить</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <table>
          <thead><tr>{["Дата","Документ","Дебет","Кредит","Сумма (₸)","Описание"].map(h=><th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{color:"var(--t3)",borderBottom:"2px solid var(--brd)"}}>{h}</th>)}</tr></thead>
          <tbody>{entries.length===0?<tr><td colSpan={6} className="text-center py-8 text-sm" style={{color:"var(--t3)"}}>Добавьте проводки</td></tr>:entries.map((r:any)=>(
            <tr key={r.id}><td className="p-2.5 text-[13px]" style={{color:"var(--t3)",borderBottom:"1px solid var(--brd)"}}>{r.entry_date}</td><td className="p-2.5 text-[13px] font-semibold" style={{color:"var(--accent)",borderBottom:"1px solid var(--brd)"}}>{r.doc_ref}</td><td className="p-2.5 text-[13px] font-mono" style={{borderBottom:"1px solid var(--brd)"}}>{r.debit_account}</td><td className="p-2.5 text-[13px] font-mono" style={{borderBottom:"1px solid var(--brd)"}}>{r.credit_account}</td><td className="p-2.5 text-[13px] font-semibold text-right" style={{borderBottom:"1px solid var(--brd)"}}>{fmtMoney(r.amount)}</td><td className="p-2.5 text-[13px]" style={{color:"var(--t3)",borderBottom:"1px solid var(--brd)"}}>{r.description}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
