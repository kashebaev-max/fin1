"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

export default function BankPage() {
  const supabase = createClient();
  const [ops, setOps] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ op_type: "out", counterparty_name: "", amount: "", purpose: "" });

  useEffect(() => { load(); }, []);
  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("bank_operations").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setOps(data || []);
  }
  async function addOp() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const num = `ПП-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`;
    await supabase.from("bank_operations").insert({
      user_id: user.id, op_type: form.op_type, op_number: num,
      counterparty_name: form.counterparty_name, amount: Number(form.amount), purpose: form.purpose,
    });
    setForm({ op_type: "out", counterparty_name: "", amount: "", purpose: "" }); setShowAdd(false); load();
  }

  const balance = ops.reduce((a, o) => a + (o.op_type === "in" ? Number(o.amount) : -Number(o.amount)), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        {[{l:"Остаток на р/с",v:fmtMoney(balance)+" ₸",c:"#6366F1"},{l:"Поступления",v:"+"+fmtMoney(ops.filter(o=>o.op_type==="in").reduce((a:number,o:any)=>a+Number(o.amount),0))+" ₸",c:"#10B981"},{l:"Списания",v:"-"+fmtMoney(ops.filter(o=>o.op_type==="out").reduce((a:number,o:any)=>a+Number(o.amount),0))+" ₸",c:"#EF4444"}].map((x,i)=>
          <div key={i} className="rounded-xl p-5" style={{background:"var(--card)",border:"1px solid var(--brd)",borderLeft:`3px solid ${x.c}`}}>
            <div className="text-xs mb-1.5" style={{color:"var(--t3)"}}>{x.l}</div><div className="text-xl font-bold" style={{color:x.c}}>{x.v}</div>
          </div>)}
      </div>
      <button onClick={()=>setShowAdd(!showAdd)} className="self-start px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{background:"var(--accent)"}}>+ Банковская операция</button>
      {showAdd&&(
        <div className="rounded-xl p-5" style={{background:"var(--card)",border:"1px solid var(--brd)"}}>
          <div className="grid grid-cols-4 gap-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Тип</label><select value={form.op_type} onChange={e=>setForm({...form,op_type:e.target.value})}><option value="in">Поступление</option><option value="out">Списание</option></select></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Контрагент</label><input value={form.counterparty_name} onChange={e=>setForm({...form,counterparty_name:e.target.value})} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Сумма</label><input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Назначение</label><input value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})} /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addOp} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{background:"var(--accent)"}}>Сохранить</button>
            <button onClick={()=>setShowAdd(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{background:"transparent",border:"1px solid var(--brd)",color:"var(--t2)"}}>Отмена</button>
          </div>
        </div>
      )}
      <div className="rounded-xl p-5" style={{background:"var(--card)",border:"1px solid var(--brd)"}}>
        <table><thead><tr>{["Дата","Документ","Контрагент","Назначение","Сумма"].map(h=><th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{color:"var(--t3)",borderBottom:"2px solid var(--brd)"}}>{h}</th>)}</tr></thead>
          <tbody>{ops.length===0?<tr><td colSpan={5} className="text-center py-8 text-sm" style={{color:"var(--t3)"}}>Нет операций</td></tr>:ops.map((o:any)=>(
            <tr key={o.id}><td className="p-2.5 text-[13px]" style={{color:"var(--t3)",borderBottom:"1px solid var(--brd)"}}>{o.op_date}</td><td className="p-2.5 text-[13px] font-semibold" style={{color:"var(--accent)",borderBottom:"1px solid var(--brd)"}}>{o.op_number}</td><td className="p-2.5 text-[13px]" style={{borderBottom:"1px solid var(--brd)"}}>{o.counterparty_name}</td><td className="p-2.5 text-[13px]" style={{color:"var(--t3)",borderBottom:"1px solid var(--brd)"}}>{o.purpose}</td><td className="p-2.5 text-sm font-bold text-right" style={{color:o.op_type==="in"?"#10B981":"#EF4444",borderBottom:"1px solid var(--brd)"}}>{o.op_type==="in"?"+":"−"}{fmtMoney(o.amount)} ₸</td></tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}
