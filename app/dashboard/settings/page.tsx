"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function SettingsPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>({});
  const [cps, setCps] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showAddCP, setShowAddCP] = useState(false);
  const [cpForm, setCpForm] = useState({ name: "", bin: "", address: "", iik: "", phone: "", type: "both" });

  useEffect(() => { load(); }, []);
  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (p) setProfile(p);
    const { data: c } = await supabase.from("counterparties").select("*").eq("user_id", user.id).order("name");
    setCps(c || []);
  }
  async function saveProfile() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update(profile).eq("id", user.id);
    setSaving(false);
  }
  async function addCP() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("counterparties").insert({ user_id: user.id, ...cpForm });
    setCpForm({ name: "", bin: "", address: "", iik: "", phone: "", type: "both" }); setShowAddCP(false); load();
  }
  async function deleteCP(id: string) { await supabase.from("counterparties").delete().eq("id", id); load(); }

  const fields = [
    { key: "company_name", label: "Название организации", ph: 'ТОО «Компания»' },
    { key: "company_bin", label: "БИН", ph: "123456789012" },
    { key: "company_address", label: "Адрес", ph: "г. Астана, ул. ..." },
    { key: "director_name", label: "Директор", ph: "Касымов М.Т." },
    { key: "accountant_name", label: "Гл. бухгалтер", ph: "Ахметов Б.К." },
    { key: "phone", label: "Телефон", ph: "+7 (7xx) xxx-xx-xx" },
    { key: "bank_name", label: "Банк", ph: 'АО «Kaspi Bank»' },
    { key: "bank_iik", label: "ИИК", ph: "KZ..." },
    { key: "bank_bik", label: "БИК", ph: "CASPKZKA" },
    { key: "bank_kbe", label: "Кбе", ph: "17" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Company Profile */}
      <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-base font-bold mb-4">Реквизиты организации</div>
        <div className="grid grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>{f.label}</label>
              <input value={profile[f.key] || ""} onChange={e => setProfile({ ...profile, [f.key]: e.target.value })} placeholder={f.ph} />
            </div>
          ))}
        </div>
        <button onClick={saveProfile} disabled={saving} className="mt-4 px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)" }}>
          {saving ? "Сохранение..." : "Сохранить реквизиты"}
        </button>
      </div>

      {/* Counterparties */}
      <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="flex justify-between items-center mb-4">
          <div className="text-base font-bold">Контрагенты ({cps.length})</div>
          <button onClick={() => setShowAddCP(!showAddCP)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Контрагент</button>
        </div>
        {showAddCP && (
          <div className="mb-4 p-4 rounded-lg" style={{ border: "1px solid var(--brd)" }}>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Название</label><input value={cpForm.name} onChange={e=>setCpForm({...cpForm,name:e.target.value})} placeholder='ТОО «...»' /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>БИН</label><input value={cpForm.bin} onChange={e=>setCpForm({...cpForm,bin:e.target.value})} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Адрес</label><input value={cpForm.address} onChange={e=>setCpForm({...cpForm,address:e.target.value})} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>ИИК</label><input value={cpForm.iik} onChange={e=>setCpForm({...cpForm,iik:e.target.value})} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Телефон</label><input value={cpForm.phone} onChange={e=>setCpForm({...cpForm,phone:e.target.value})} /></div>
              <div><label className="block text-[10px] font-semibold mb-1" style={{color:"var(--t3)"}}>Тип</label><select value={cpForm.type} onChange={e=>setCpForm({...cpForm,type:e.target.value})}><option value="buyer">Покупатель</option><option value="supplier">Поставщик</option><option value="both">Оба</option></select></div>
            </div>
            <div className="flex gap-3 mt-3">
              <button onClick={addCP} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{background:"var(--accent)"}}>Добавить</button>
              <button onClick={()=>setShowAddCP(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{background:"transparent",border:"1px solid var(--brd)",color:"var(--t2)"}}>Отмена</button>
            </div>
          </div>
        )}
        <table><thead><tr>{["Название","БИН","Адрес","ИИК","Тип",""].map(h=><th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{color:"var(--t3)",borderBottom:"2px solid var(--brd)"}}>{h}</th>)}</tr></thead>
          <tbody>{cps.map((c:any)=>(
            <tr key={c.id}><td className="p-2.5 text-[13px] font-medium" style={{borderBottom:"1px solid var(--brd)"}}>{c.name}</td><td className="p-2.5 text-[13px] font-mono" style={{borderBottom:"1px solid var(--brd)"}}>{c.bin}</td><td className="p-2.5 text-[13px]" style={{color:"var(--t3)",borderBottom:"1px solid var(--brd)"}}>{c.address}</td><td className="p-2.5 text-[11px] font-mono" style={{borderBottom:"1px solid var(--brd)"}}>{c.iik}</td><td className="p-2.5" style={{borderBottom:"1px solid var(--brd)"}}><span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{background:c.type==="buyer"?"#10B98120":c.type==="supplier"?"#F59E0B20":"#6366F120",color:c.type==="buyer"?"#10B981":c.type==="supplier"?"#F59E0B":"#6366F1"}}>{c.type==="buyer"?"Покупатель":c.type==="supplier"?"Поставщик":"Оба"}</span></td><td className="p-2.5" style={{borderBottom:"1px solid var(--brd)"}}><button onClick={()=>deleteCP(c.id)} className="bg-transparent border-none cursor-pointer text-sm" style={{color:"#EF4444"}}>×</button></td></tr>
          ))}</tbody></table>
        {cps.length===0&&<div className="text-center py-6 text-sm" style={{color:"var(--t3)"}}>Добавьте контрагентов для создания документов</div>}
      </div>
    </div>
  );
}
