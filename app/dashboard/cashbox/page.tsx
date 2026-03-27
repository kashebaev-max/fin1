"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

export default function CashboxPage() {
  const supabase = createClient();
  const [ops, setOps] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState<"pko"|"rko"|null>(null);
  const [form, setForm] = useState({ counterparty_name: "", amount: "", basis: "" });

  useEffect(() => { load(); }, []);
  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("cash_operations").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setOps(data || []);
  }
  async function addOp() {
    if (!showAdd) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const num = `${showAdd.toUpperCase()}-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`;
    await supabase.from("cash_operations").insert({
      user_id: user.id, op_type: showAdd, op_number: num,
      counterparty_name: form.counterparty_name, amount: Number(form.amount), basis: form.basis,
    });
    setForm({ counterparty_name: "", amount: "", basis: "" }); setShowAdd(null); load();
  }

  const balance = ops.reduce((a, o) => a + (o.op_type === "pko" ? Number(o.amount) : -Number(o.amount)), 0);
  const dayIn = ops.filter(o => o.op_type === "pko").reduce((a, o) => a + Number(o.amount), 0);
  const dayOut = ops.filter(o => o.op_type === "rko").reduce((a, o) => a + Number(o.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        {[{l:"Остаток в кассе",v:fmtMoney(balance)+" ₸",c:"#6366F1"},{l:"Приход",v:"+"+fmtMoney(dayIn)+" ₸",c:"#10B981"},{l:"Расход",v:"-"+fmtMoney(dayOut)+" ₸",c:"#EF4444"}].map((x,i)=>
          <div key={i} className="rounded-xl p-5" style={{background:"var(--card)",border:"1px solid var(--brd)",borderLeft:`3px solid ${x.c}`}}>
            <div className="text-xs mb-1.5" style={{color:"var(--t3)"}}>{x.l}</div>
            <div className="text-xl font-bold" style={{color:x.c}}>{x.v}</div>
          </div>)}
      </div>
      <div className="flex gap-2">
        <button onClick={()=>setShowAdd("pko")} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{background:"#10B981"}}>+ ПКО</button>
        <button onClick={()=>setShowAdd("rko")} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{background:"#EF4444"}}>− РКО</button>
      </div>
      {showAdd && (
        <div className="rounded-xl p-5" style={{background:"var(--card)",border:"1px solid var(--brd)"}}>
          <div className="text-sm font-bold mb-3">{showAdd==="pko"?"Приходный кассовый ордер":"Расходный кассовый ордер"}</div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Контрагент</label><input value={form.counterparty_name} onChange={e=>setForm({...form,counterparty_name:e.target.value})} placeholder="ТОО..." /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Сумма</label><input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Основание</label><input value={form.basis} onChange={e=>setForm({...form,basis:e.target.value})} placeholder="Оплата по счёту" /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addOp} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{background:"var(--accent)"}}>Сохранить</button>
            <button onClick={()=>setShowAdd(null)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{background:"transparent",border:"1px solid var(--brd)",color:"var(--t2)"}}>Отмена</button>
          </div>
        </div>
      )}
      <div className="rounded-xl p-5" style={{background:"var(--card)",border:"1px solid var(--brd)"}}>
        {ops.map((op:any)=>(
          <div key={op.id} className="flex items-center gap-3 py-3" style={{borderBottom:"1px solid var(--brd)"}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{background:op.op_type==="pko"?"#10B98120":"#EF444420",color:op.op_type==="pko"?"#10B981":"#EF4444"}}>{op.op_type==="pko"?"↓":"↑"}</div>
            <div className="flex-1"><div className="text-[13px] font-semibold" style={{color:"var(--accent)"}}>{op.op_number}</div><div className="text-xs" style={{color:"var(--t3)"}}>{op.counterparty_name} — {op.basis}</div></div>
            <span className="text-sm font-bold" style={{color:op.op_type==="pko"?"#10B981":"#EF4444"}}>{op.op_type==="pko"?"+":"−"}{fmtMoney(op.amount)} ₸</span>
          </div>
        ))}
        {ops.length===0&&<div className="text-center py-8 text-sm" style={{color:"var(--t3)"}}>Нет операций</div>}
      </div>
    </div>
  );
}
