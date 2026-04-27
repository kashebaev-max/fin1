"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney, TAX } from "@/lib/tax2026";

type Tab = "outgoing" | "incoming" | "create";

export default function ESFPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("outgoing");
  const [esfDocs, setEsfDocs] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // Форма создания ЭСФ
  const [form, setForm] = useState({
    esf_number: "",
    esf_date: new Date().toISOString().slice(0, 10),
    counterparty_bin: "",
    counterparty_name: "",
    doc_id: "",
    total_sum: "",
    nds_sum: "",
    notes: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [e, d, c, p] = await Promise.all([
      supabase.from("esf_documents").select("*").eq("user_id", user.id).order("esf_date", { ascending: false }),
      supabase.from("documents").select("*").eq("user_id", user.id).in("doc_type", ["sf", "invoice", "act", "waybill"]).order("doc_date", { ascending: false }),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
    ]);

    setEsfDocs(e.data || []);
    setDocs(d.data || []);
    setCounterparties(c.data || []);
    if (p.data) setProfile(p.data);
    setLoading(false);
  }

  function selectDocument(docId: string) {
    const d = docs.find(x => x.id === docId);
    if (!d) return;
    setForm({
      ...form,
      doc_id: docId,
      counterparty_name: d.counterparty_name,
      total_sum: String(d.total_sum),
      nds_sum: String(d.nds_sum),
      esf_number: `ESF-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
    });
  }

  function selectCounterparty(cpId: string) {
    const c = counterparties.find(x => x.id === cpId);
    if (!c) return;
    setForm({ ...form, counterparty_bin: c.bin || "", counterparty_name: c.name });
  }

  async function createESF() {
    if (!form.counterparty_bin || form.counterparty_bin.length !== 12) {
      setMsg("❌ БИН должен содержать 12 цифр");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const total = Number(form.total_sum);
    const nds = Number(form.nds_sum);

    await supabase.from("esf_documents").insert({
      user_id: userId,
      doc_id: form.doc_id || null,
      esf_number: form.esf_number || `ESF-${Date.now()}`,
      esf_date: form.esf_date,
      direction: "outgoing",
      status: "draft",
      counterparty_bin: form.counterparty_bin,
      counterparty_name: form.counterparty_name,
      total_sum: total,
      nds_sum: nds,
      total_with_nds: total + nds,
      notes: form.notes,
    });

    setMsg(`✅ ЭСФ ${form.esf_number} создан в статусе "Черновик"`);
    setForm({ esf_number: "", esf_date: new Date().toISOString().slice(0, 10), counterparty_bin: "", counterparty_name: "", doc_id: "", total_sum: "", nds_sum: "", notes: "" });
    setTab("outgoing");
    load();
    setTimeout(() => setMsg(""), 4000);
  }

  async function updateStatus(id: string, status: string) {
    const update: any = { status };
    if (status === "sent") update.sent_at = new Date().toISOString();
    if (status === "accepted") update.accepted_at = new Date().toISOString();
    await supabase.from("esf_documents").update(update).eq("id", id);
    setMsg(`✅ Статус обновлён: ${statusName(status)}`);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteESF(id: string) {
    if (!confirm("Удалить ЭСФ?")) return;
    await supabase.from("esf_documents").delete().eq("id", id);
    load();
  }

  function statusName(s: string): string {
    const n: Record<string, string> = {
      draft: "Черновик", sent: "Отправлен", received: "Получен",
      accepted: "Принят", rejected: "Отклонён", cancelled: "Отозван",
    };
    return n[s] || s;
  }

  function statusColor(s: string): string {
    const c: Record<string, string> = {
      draft: "#6B7280", sent: "#3B82F6", received: "#06B6D4",
      accepted: "#10B981", rejected: "#EF4444", cancelled: "#F59E0B",
    };
    return c[s] || "#6B7280";
  }

  const outgoing = esfDocs.filter(e => e.direction === "outgoing");
  const incoming = esfDocs.filter(e => e.direction === "incoming");

  const totalOutSum = outgoing.reduce((a, e) => a + Number(e.total_with_nds), 0);
  const totalInSum = incoming.reduce((a, e) => a + Number(e.total_with_nds), 0);
  const totalOutNDS = outgoing.reduce((a, e) => a + Number(e.nds_sum), 0);
  const totalInNDS = incoming.reduce((a, e) => a + Number(e.nds_sum), 0);

  if (loading) return <div className="text-center py-20 text-sm" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: "#10B98120", color: "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Электронные счета-фактуры (ЭСФ) • НК РК ст. 412 • Учёт исходящих и входящих ЭСФ • Интеграция с порталом ИС ЭСФ КГД
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📤 Исходящих ЭСФ</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{outgoing.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{fmtMoney(totalOutSum)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #3B82F6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📥 Входящих ЭСФ</div>
          <div className="text-xl font-bold" style={{ color: "#3B82F6" }}>{incoming.length}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>{fmtMoney(totalInSum)} ₸</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EC4899" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>НДС начисленный</div>
          <div className="text-xl font-bold" style={{ color: "#EC4899" }}>{fmtMoney(totalOutNDS)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По исходящим</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #8B5CF6" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>НДС в зачёт</div>
          <div className="text-xl font-bold" style={{ color: "#8B5CF6" }}>{fmtMoney(totalInNDS)} ₸</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>По входящим</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([["outgoing", "📤 Исходящие"], ["incoming", "📥 Входящие"], ["create", "+ Создать ЭСФ"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
        <a href="https://esf.gov.kz" target="_blank" rel="noopener" className="px-4 py-2 rounded-lg text-xs font-semibold no-underline ml-auto"
          style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--accent)" }}>
          🌐 Портал ИС ЭСФ КГД ↗
        </a>
      </div>

      {/* Создание ЭСФ */}
      {tab === "create" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-4">Создать электронный счёт-фактуру</div>

          <div className="mb-4">
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Создать на основе документа (опционально)</label>
            <select value={form.doc_id} onChange={e => selectDocument(e.target.value)}>
              <option value="">— Не выбрано —</option>
              {docs.map(d => (
                <option key={d.id} value={d.id}>{d.doc_number} от {d.doc_date} • {d.counterparty_name} • {fmtMoney(d.total_with_nds)} ₸</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Номер ЭСФ</label>
              <input value={form.esf_number} onChange={e => setForm({ ...form, esf_number: e.target.value })} placeholder="ESF-2026-12345" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Дата выписки</label>
              <input type="date" value={form.esf_date} onChange={e => setForm({ ...form, esf_date: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Контрагент (из справочника)</label>
              <select onChange={e => selectCounterparty(e.target.value)} value="">
                <option value="">— Выбрать или ввести вручную —</option>
                {counterparties.map(c => <option key={c.id} value={c.id}>{c.name} {c.bin ? `(${c.bin})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>БИН/ИИН покупателя</label>
              <input value={form.counterparty_bin} onChange={e => setForm({ ...form, counterparty_bin: e.target.value.replace(/\D/g, "").slice(0, 12) })} placeholder="123456789012" maxLength={12} />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Наименование покупателя</label>
            <input value={form.counterparty_name} onChange={e => setForm({ ...form, counterparty_name: e.target.value })} placeholder='ТОО «Покупатель»' />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма без НДС</label>
              <input type="number" value={form.total_sum} onChange={e => {
                const v = e.target.value;
                const nds = Math.round(Number(v) * TAX.NDS);
                setForm({ ...form, total_sum: v, nds_sum: String(nds) });
              }} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>НДС {TAX.NDS * 100}%</label>
              <input type="number" value={form.nds_sum} onChange={e => setForm({ ...form, nds_sum: e.target.value })} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Итого с НДС</label>
              <input type="number" value={Number(form.total_sum || 0) + Number(form.nds_sum || 0)} disabled />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Договор, основание поставки..." />
          </div>

          <div className="flex gap-3">
            <button onClick={createESF} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>
              💾 Сохранить ЭСФ
            </button>
            <button onClick={() => setTab("outgoing")} className="px-5 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>
              Отмена
            </button>
          </div>

          <div className="mt-4 p-3 rounded-lg" style={{ background: "#F59E0B10", border: "1px solid #F59E0B30" }}>
            <div className="text-[11px]" style={{ color: "var(--t2)", lineHeight: 1.6 }}>
              <b style={{ color: "#F59E0B" }}>ℹ️ Важно:</b> ЭСФ выписываются плательщиками НДС. Срок выписки — в течение 15 календарных дней с даты совершения оборота. После сохранения здесь — отправьте в портал ИС ЭСФ КГД для электронной подписи и регистрации.
            </div>
          </div>
        </div>
      )}

      {/* Список ЭСФ */}
      {(tab === "outgoing" || tab === "incoming") && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead>
              <tr>{["№ ЭСФ", "Дата", "Контрагент", "БИН", "Сумма без НДС", "НДС", "Итого", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {(tab === "outgoing" ? outgoing : incoming).length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>
                  {tab === "outgoing" ? "Нет исходящих ЭСФ. Создайте первый." : "Нет входящих ЭСФ. Они будут появляться при импорте из портала."}
                </td></tr>
              ) : (tab === "outgoing" ? outgoing : incoming).map(e => (
                <tr key={e.id}>
                  <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{e.esf_number}</td>
                  <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.esf_date}</td>
                  <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{e.counterparty_name}</td>
                  <td className="p-2.5 text-[12px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{e.counterparty_bin}</td>
                  <td className="p-2.5 text-[12px] text-right" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(e.total_sum)}</td>
                  <td className="p-2.5 text-[12px] text-right" style={{ color: "#EC4899", borderBottom: "1px solid var(--brd)" }}>{fmtMoney(e.nds_sum)}</td>
                  <td className="p-2.5 text-[12px] text-right font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(e.total_with_nds)}</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: statusColor(e.status) + "20", color: statusColor(e.status) }}>
                      {statusName(e.status)}
                    </span>
                  </td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <div className="flex gap-1">
                      {e.status === "draft" && tab === "outgoing" && (
                        <button onClick={() => updateStatus(e.id, "sent")} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#3B82F6" }}>Отправить</button>
                      )}
                      {e.status === "sent" && (
                        <button onClick={() => updateStatus(e.id, "accepted")} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#10B981" }}>Принят</button>
                      )}
                      <button onClick={() => deleteESF(e.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
