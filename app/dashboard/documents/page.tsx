"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TAX, fmtMoney, calcNDS } from "@/lib/tax2026";
import { generateDocumentHTML, getDocTitle, getFullDocumentHTML } from "@/lib/doc-templates";
import type { Document, Counterparty, Product } from "@/lib/types";

const DOC_TYPES = [
  { key: "invoice", name: "Счёт на оплату", icon: "📄", color: "#6366F1" },
  { key: "sf", name: "Счёт-фактура", icon: "📋", color: "#8B5CF6" },
  { key: "waybill", name: "Накладная", icon: "📦", color: "#F59E0B" },
  { key: "act", name: "Акт выполненных работ", icon: "✅", color: "#10B981" },
  { key: "contract", name: "Договор", icon: "📝", color: "#EC4899" },
  { key: "pko", name: "ПКО", icon: "💵", color: "#06B6D4" },
  { key: "rko", name: "РКО", icon: "💸", color: "#EF4444" },
  { key: "pp", name: "Платёжное поручение", icon: "🏦", color: "#3B82F6" },
  { key: "avr", name: "Авансовый отчёт", icon: "📑", color: "#F97316" },
  { key: "dov", name: "Доверенность", icon: "🔑", color: "#84CC16" },
  { key: "payroll", name: "Ведомость ЗП", icon: "💳", color: "#A855F7" },
  { key: "ttn", name: "ТТН", icon: "🚛", color: "#14B8A6" },
];

// Типы документов которые влияют на склад
const STOCK_AFFECTING_TYPES = ["waybill", "ttn"]; // расход со склада
const STOCK_INCOMING_TYPES: string[] = []; // приход на склад (можно добавить "receipt")

export default function DocumentsPage() {
  const supabase = createClient();
  const [docs, setDocs] = useState<Document[]>([]);
  const [counterparties, setCPs] = useState<Counterparty[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [showCreate, setShowCreate] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [userId, setUserId] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [d, c, p, prof] = await Promise.all([
      supabase.from("documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("counterparties").select("*").eq("user_id", user.id).order("name"),
      supabase.from("products").select("*").eq("user_id", user.id).order("name"),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
    ]);
    setDocs((d.data || []) as Document[]);
    setCPs((c.data || []) as Counterparty[]);
    setProducts((p.data || []) as Product[]);
    if (prof.data) setProfile(prof.data);
  }

  function getCompanyData() {
    if (!profile) return undefined;
    return {
      name: profile.company_name || "",
      bin: profile.company_bin || "",
      address: profile.company_address || "",
      director: profile.director_name || "",
      accountant: profile.accountant_name || "",
      bank: profile.bank_name || "",
      iik: profile.bank_iik || "",
      bik: profile.bank_bik || "",
      kbe: profile.bank_kbe || "17",
      phone: profile.phone || "",
    };
  }

  async function saveDocument(doc: any) {
    const { data, error } = await supabase.from("documents").insert({
      user_id: userId, ...doc,
    }).select().single();
    if (!error && data) {
      setDocs([data as Document, ...docs]);
      setShowCreate(null);
      openPreview(data as Document);
    }
  }

  async function deleteDocument(id: string) {
    await supabase.from("documents").delete().eq("id", id);
    setDocs(docs.filter(d => d.id !== id));
  }

  // ПРОВЕСТИ ДОКУМЕНТ — обновить статус + склад + проводки
  async function postDocument(doc: Document) {
    // 1. Обновить статус на "done"
    await supabase.from("documents").update({ status: "done" }).eq("id", doc.id);

    // 2. Если документ влияет на склад — обновить остатки
    if (STOCK_AFFECTING_TYPES.includes(doc.doc_type)) {
      const items = (doc.items as any[]) || [];
      for (const item of items) {
        // Найти товар по имени и списать
        const { data: prods } = await supabase.from("products")
          .select("*").eq("user_id", userId).eq("name", item.name).limit(1);
        if (prods && prods.length > 0) {
          const prod = prods[0];
          const newQty = Math.max(0, Number(prod.quantity) - Number(item.quantity));
          await supabase.from("products").update({ quantity: newQty }).eq("id", prod.id);
        }
      }
    }

    // 3. Создать проводки в журнале
    const entryData = getJournalEntries(doc);
    for (const entry of entryData) {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: doc.doc_date,
        document_id: doc.id,
        doc_ref: doc.doc_number,
        ...entry,
      });
    }

    // 4. Если касса — создать кассовую операцию
    if (doc.doc_type === "pko" || doc.doc_type === "rko") {
      await supabase.from("cash_operations").insert({
        user_id: userId,
        op_type: doc.doc_type,
        op_number: doc.doc_number,
        op_date: doc.doc_date,
        counterparty_name: doc.counterparty_name,
        amount: doc.total_with_nds,
        basis: doc.extra_data?.basis || "",
        document_id: doc.id,
      });
    }

    // 5. Если платёжное поручение — создать банковскую операцию
    if (doc.doc_type === "pp") {
      await supabase.from("bank_operations").insert({
        user_id: userId,
        op_type: "out",
        op_number: doc.doc_number,
        op_date: doc.doc_date,
        counterparty_name: doc.counterparty_name,
        amount: doc.total_with_nds,
        purpose: doc.extra_data?.purpose || "Оплата по договору",
        document_id: doc.id,
      });
    }

    // Обновить список
    setDocs(docs.map(d => d.id === doc.id ? { ...d, status: "done" as any } : d));
    setPreviewDoc(null);
    loadData(); // перезагрузить все данные
  }

  function getJournalEntries(doc: Document): { debit_account: string; credit_account: string; amount: number; description: string }[] {
    const entries: any[] = [];
    switch (doc.doc_type) {
      case "invoice":
      case "sf":
        entries.push({ debit_account: "1210", credit_account: "6010", amount: doc.total_sum, description: `Реализация — ${doc.counterparty_name}` });
        if (doc.nds_sum > 0) entries.push({ debit_account: "1210", credit_account: "3130", amount: doc.nds_sum, description: `НДС ${Math.round(doc.nds_rate*100)}% от реализации` });
        break;
      case "waybill":
      case "ttn":
        entries.push({ debit_account: "7010", credit_account: "1310", amount: doc.total_sum, description: `Отпуск ТМЗ — ${doc.counterparty_name}` });
        entries.push({ debit_account: "1210", credit_account: "6010", amount: doc.total_sum, description: `Реализация ТМЗ — ${doc.counterparty_name}` });
        if (doc.nds_sum > 0) entries.push({ debit_account: "1210", credit_account: "3130", amount: doc.nds_sum, description: `НДС ${Math.round(doc.nds_rate*100)}%` });
        break;
      case "act":
        entries.push({ debit_account: "1210", credit_account: "6010", amount: doc.total_sum, description: `Оказание услуг — ${doc.counterparty_name}` });
        if (doc.nds_sum > 0) entries.push({ debit_account: "1210", credit_account: "3130", amount: doc.nds_sum, description: `НДС ${Math.round(doc.nds_rate*100)}%` });
        break;
      case "pko":
        entries.push({ debit_account: "1010", credit_account: "1210", amount: doc.total_with_nds, description: `Приход в кассу от ${doc.counterparty_name}` });
        break;
      case "rko":
        entries.push({ debit_account: "7210", credit_account: "1010", amount: doc.total_with_nds, description: `Расход из кассы — ${doc.counterparty_name}` });
        break;
      case "pp":
        entries.push({ debit_account: "3310", credit_account: "1030", amount: doc.total_with_nds, description: `Оплата поставщику — ${doc.counterparty_name}` });
        break;
    }
    return entries;
  }

  function openPreview(doc: any) {
    const cp = counterparties.find(c => c.id === doc.counterparty_id);
    setPreviewDoc({
      ...doc,
      counterparty_bin: cp?.bin || "",
      counterparty_address: cp?.address || "",
      counterparty_iik: cp?.iik || "",
      counterparty_bank: cp?.bank_name || "",
      company: getCompanyData(),
    });
  }

  function printDocument(doc: any) {
    const html = getFullDocumentHTML(doc);
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ═══ Preview Modal ═══ */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPreviewDoc(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto"
            style={{ background: "var(--card)", border: "1px solid var(--brd)" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 sticky top-0 z-10"
              style={{ background: "var(--card)", borderBottom: "1px solid var(--brd)" }}>
              <span className="text-base font-bold">{getDocTitle(previewDoc.doc_type)} № {previewDoc.doc_number}</span>
              <button onClick={() => setPreviewDoc(null)} className="bg-transparent border-none text-xl cursor-pointer" style={{ color: "var(--t3)" }}>×</button>
            </div>
            <div className="p-6">
              {/* Rendered document */}
              <div className="bg-white text-black rounded-lg p-8 text-sm"
                style={{ fontFamily: "'Times New Roman', serif", lineHeight: 1.7 }}
                dangerouslySetInnerHTML={{ __html: generateDocumentHTML({
                  ...previewDoc,
                  company: previewDoc.company || getCompanyData(),
                }) }} />

              {/* Action buttons */}
              <div className="flex gap-3 mt-5 justify-between">
                <div className="text-xs" style={{ color: "var(--t3)" }}>
                  Статус: <b style={{ color: previewDoc.status === "done" ? "#10B981" : "#F59E0B" }}>
                    {previewDoc.status === "done" ? "✓ Проведён" : previewDoc.status === "draft" ? "Черновик" : "Ожидает"}
                  </b>
                </div>
                <div className="flex gap-3">
                  {previewDoc.status !== "done" && (
                    <button onClick={() => postDocument(previewDoc)}
                      className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer"
                      style={{ background: "#10B981" }}>
                      ✓ Провести
                    </button>
                  )}
                  <button onClick={() => printDocument(previewDoc)}
                    className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer"
                    style={{ background: "var(--accent)" }}>
                    🖨 Печать / PDF
                  </button>
                  <button onClick={() => setPreviewDoc(null)}
                    className="px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer"
                    style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Create Modal ═══ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowCreate(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto"
            style={{ background: "var(--card)", border: "1px solid var(--brd)" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5" style={{ borderBottom: "1px solid var(--brd)" }}>
              <span className="text-base font-bold">Создать: {DOC_TYPES.find(d => d.key === showCreate)?.name}</span>
              <button onClick={() => setShowCreate(null)} className="bg-transparent border-none text-xl cursor-pointer" style={{ color: "var(--t3)" }}>×</button>
            </div>
            <div className="p-6">
              <CreateDocForm
                docType={showCreate}
                counterparties={counterparties}
                products={products}
                onSave={saveDocument}
                onCancel={() => setShowCreate(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ Doc type grid ═══ */}
      <div className="text-sm font-bold">Создать документ <span className="font-normal text-xs" style={{ color: "var(--t3)" }}>(НДС 16% — НК РК 2026)</span></div>
      <div className="grid grid-cols-4 gap-3">
        {DOC_TYPES.map(dt => (
          <button key={dt.key} onClick={() => setShowCreate(dt.key)}
            className="rounded-xl p-3.5 text-left cursor-pointer transition-all hover:-translate-y-0.5"
            style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${dt.color}` }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-base">{dt.icon}</span>
              <span className="text-xs font-bold" style={{ color: "var(--t1)" }}>{dt.name}</span>
            </div>
          </button>
        ))}
      </div>

      {/* ═══ Documents table ═══ */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <table>
          <thead>
            <tr>
              {["", "Номер", "Тип", "Дата", "Контрагент", "Сумма (с НДС)", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Документов нет</td></tr>
            ) : docs.map(d => {
              const dt = DOC_TYPES.find(t => t.key === d.doc_type);
              const statusColors: Record<string, string> = { done: "#10B981", draft: "#6B7280", pending: "#F59E0B", sent: "#3B82F6", cancelled: "#EF4444" };
              const statusNames: Record<string, string> = { done: "Проведён", draft: "Черновик", pending: "Ожидает", sent: "Отправлен", cancelled: "Отменён" };
              return (
                <tr key={d.id}>
                  <td className="p-2.5 text-base" style={{ borderBottom: "1px solid var(--brd)" }}>{dt?.icon}</td>
                  <td className="p-2.5 text-[13px] font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{d.doc_number}</td>
                  <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{dt?.name}</td>
                  <td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{d.doc_date}</td>
                  <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{d.counterparty_name}</td>
                  <td className="p-2.5 text-[13px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(d.total_with_nds)} ₸</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
                      style={{ background: (statusColors[d.status] || "#6B7280") + "20", color: statusColors[d.status] || "#6B7280" }}>
                      {statusNames[d.status] || d.status}
                    </span>
                  </td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <div className="flex gap-2">
                      <button onClick={() => openPreview(d)} className="bg-transparent border-none cursor-pointer text-xs font-semibold" style={{ color: "var(--accent)" }}>Открыть</button>
                      {d.status !== "done" && (
                        <button onClick={() => deleteDocument(d.id)} className="bg-transparent border-none cursor-pointer text-xs" style={{ color: "#EF4444" }}>×</button>
                      )}
                    </div>
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

// ═══════════════════════════════════════
// CREATE DOCUMENT FORM
// ═══════════════════════════════════════
function CreateDocForm({ docType, counterparties, products, onSave, onCancel }: {
  docType: string; counterparties: Counterparty[]; products: Product[];
  onSave: (doc: any) => void; onCancel: () => void;
}) {
  const [cpId, setCpId] = useState("");
  const [items, setItems] = useState([{ name: "", unit: "шт", quantity: 1, price: 0, sum: 0 }]);
  const [extra, setExtra] = useState<any>({});
  const cp = counterparties.find(c => c.id === cpId);
  const needsItems = !["pko", "rko", "pp"].includes(docType);
  const showAmt = ["pko", "rko", "pp"].includes(docType);

  const addRow = () => setItems([...items, { name: "", unit: "шт", quantity: 1, price: 0, sum: 0 }]);
  const removeRow = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: string, val: any) => {
    const next = [...items]; next[i] = { ...next[i], [field]: val };
    next[i].sum = next[i].quantity * next[i].price; setItems(next);
  };
  const selectProduct = (i: number, pid: string) => {
    const p = products.find(x => x.id === pid);
    if (p) { const next = [...items]; next[i] = { name: p.name, unit: p.unit, quantity: 1, price: Number(p.price), sum: Number(p.price) }; setItems(next); }
  };
  const totalSum = items.reduce((a, it) => a + it.sum, 0);
  const ndsCalc = calcNDS(needsItems ? totalSum : Number(extra.amount || 0));

  const handleSave = () => {
    const now = new Date().toISOString().slice(0, 10);
    onSave({
      doc_type: docType,
      doc_number: `${docType.toUpperCase().slice(0, 3)}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      doc_date: now, counterparty_id: cpId || null, counterparty_name: cp?.name || extra.cpName || "",
      total_sum: ndsCalc.sumWithoutNDS, nds_sum: ndsCalc.nds, nds_rate: TAX.NDS,
      total_with_nds: ndsCalc.total, status: "draft",
      items: needsItems ? items : [{ name: DOC_TYPES.find(d => d.key === docType)?.name || docType, unit: "усл.", quantity: 1, price: ndsCalc.sumWithoutNDS, sum: ndsCalc.sumWithoutNDS }],
      extra_data: extra,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Контрагент</label>
        <select value={cpId} onChange={e => setCpId(e.target.value)}>
          <option value="">— Выберите контрагента —</option>
          {counterparties.map(c => <option key={c.id} value={c.id}>{c.name} (БИН: {c.bin})</option>)}
        </select>
        <p className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Нет контрагента? Добавьте в разделе «Настройки»</p>
      </div>

      {showAmt && <div><label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма (без НДС)</label><input type="number" value={extra.amount || ""} onChange={e => setExtra({ ...extra, amount: e.target.value })} placeholder="0" /></div>}

      {(docType === "pko" || docType === "rko") && <div><label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Основание</label><input value={extra.basis || ""} onChange={e => setExtra({ ...extra, basis: e.target.value })} placeholder="Оплата по счёту / Хоз. расходы" /></div>}

      {docType === "pp" && <div><label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Назначение платежа</label><input value={extra.purpose || ""} onChange={e => setExtra({ ...extra, purpose: e.target.value })} placeholder="Оплата по договору №..." /></div>}

      {docType === "ttn" && <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Автомобиль</label><input value={extra.vehicle || ""} onChange={e => setExtra({ ...extra, vehicle: e.target.value })} placeholder="MAN TGS, гос.№" /></div>
        <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Водитель</label><input value={extra.driver || ""} onChange={e => setExtra({ ...extra, driver: e.target.value })} placeholder="ФИО водителя" /></div>
      </div>}

      {docType === "dov" && <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Доверенное лицо</label><input value={extra.employee || ""} onChange={e => setExtra({ ...extra, employee: e.target.value })} placeholder="ФИО" /></div>
        <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Срок действия до</label><input type="date" value={extra.valid_until || ""} onChange={e => setExtra({ ...extra, valid_until: e.target.value })} /></div>
      </div>}

      {docType === "avr" && <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Подотчётное лицо</label><input value={extra.employee || ""} onChange={e => setExtra({ ...extra, employee: e.target.value })} placeholder="ФИО" /></div>
        <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма аванса</label><input type="number" value={extra.advance || ""} onChange={e => setExtra({ ...extra, advance: Number(e.target.value) })} placeholder="0" /></div>
      </div>}

      {docType === "contract" && <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Срок выполнения</label><input value={extra.deadline || ""} onChange={e => setExtra({ ...extra, deadline: e.target.value })} placeholder="30 календарных дней" /></div>
        <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Срок оплаты (дней)</label><input value={extra.payment_days || ""} onChange={e => setExtra({ ...extra, payment_days: e.target.value })} placeholder="5 банковских дней" /></div>
      </div>}

      {needsItems && <>
        <div className="text-[13px] font-bold mt-1">Товары / Услуги</div>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="flex-[2]">{i === 0 && <label className="block text-[10px] mb-1" style={{ color: "var(--t3)" }}>Из справочника</label>}
              <select onChange={e => selectProduct(i, e.target.value)} value=""><option value="">Выбрать...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {fmtMoney(Number(p.price))} ₸</option>)}</select></div>
            <div className="flex-[2]">{i === 0 && <label className="block text-[10px] mb-1" style={{ color: "var(--t3)" }}>Наименование</label>}
              <input value={it.name} onChange={e => updateRow(i, "name", e.target.value)} placeholder="Или вручную" /></div>
            <div className="w-20">{i === 0 && <label className="block text-[10px] mb-1" style={{ color: "var(--t3)" }}>Кол-во</label>}
              <input type="number" value={it.quantity} onChange={e => updateRow(i, "quantity", Number(e.target.value))} /></div>
            <div className="w-28">{i === 0 && <label className="block text-[10px] mb-1" style={{ color: "var(--t3)" }}>Цена</label>}
              <input type="number" value={it.price} onChange={e => updateRow(i, "price", Number(e.target.value))} /></div>
            <div className="w-24 text-right text-[13px] font-bold pb-2.5">{fmtMoney(it.sum)} ₸</div>
            <button onClick={() => removeRow(i)} className="bg-transparent border-none cursor-pointer text-lg pb-2" style={{ color: "#EF4444" }}>×</button>
          </div>
        ))}
        <button onClick={addRow} className="self-start px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
          style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>+ Добавить строку</button>
      </>}

      <div className="flex justify-end gap-5 py-3 text-xs" style={{ borderTop: "1px solid var(--brd)", color: "var(--t3)" }}>
        <span>Итого: <b style={{ color: "var(--t1)" }}>{fmtMoney(ndsCalc.sumWithoutNDS)} ₸</b></span>
        <span>НДС {TAX.NDS * 100}%: <b style={{ color: "var(--t1)" }}>{fmtMoney(ndsCalc.nds)} ₸</b></span>
        <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>Всего: {fmtMoney(ndsCalc.total)} ₸</span>
      </div>
      <div className="flex gap-3 justify-end mt-2">
        <button onClick={onCancel} className="px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
        <button onClick={handleSave} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>Сформировать документ</button>
      </div>
    </div>
  );
}
