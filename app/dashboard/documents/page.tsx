"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { TAX, fmtMoney, calcNDS } from "@/lib/tax2026";
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

export default function DocumentsPage() {
  const supabase = createClient();
  const [docs, setDocs] = useState<Document[]>([]);
  const [counterparties, setCPs] = useState<Counterparty[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showCreate, setShowCreate] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [userId, setUserId] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [d, c, p] = await Promise.all([
      supabase.from("documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("counterparties").select("*").eq("user_id", user.id).order("name"),
      supabase.from("products").select("*").eq("user_id", user.id).order("name"),
    ]);
    setDocs((d.data || []) as Document[]);
    setCPs((c.data || []) as Counterparty[]);
    setProducts((p.data || []) as Product[]);
  }

  async function saveDocument(doc: Partial<Document>) {
    const { data, error } = await supabase.from("documents").insert({
      user_id: userId,
      ...doc,
    }).select().single();

    if (!error && data) {
      setDocs([data as Document, ...docs]);
      setShowCreate(null);
      setPreviewDoc(data as Document);
    }
  }

  async function deleteDocument(id: string) {
    await supabase.from("documents").delete().eq("id", id);
    setDocs(docs.filter(d => d.id !== id));
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from("documents").update({ status }).eq("id", id);
    setDocs(docs.map(d => d.id === id ? { ...d, status: status as any } : d));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPreviewDoc(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto"
            style={{ background: "var(--card)", border: "1px solid var(--brd)" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 sticky top-0 z-10"
              style={{ background: "var(--card)", borderBottom: "1px solid var(--brd)" }}>
              <span className="text-base font-bold">{previewDoc.doc_type} № {previewDoc.doc_number}</span>
              <button onClick={() => setPreviewDoc(null)} className="bg-transparent border-none text-xl cursor-pointer" style={{ color: "var(--t3)" }}>×</button>
            </div>
            <div className="p-6">
              <div className="bg-white text-black rounded-lg p-8 text-sm" style={{ fontFamily: "'Times New Roman', serif", lineHeight: 1.7 }}>
                <h2 className="text-center text-lg font-bold mb-4">
                  {DOC_TYPES.find(t => t.key === previewDoc.doc_type)?.name} № {previewDoc.doc_number}
                </h2>
                <p><b>Дата:</b> {previewDoc.doc_date}</p>
                <p><b>Контрагент:</b> {previewDoc.counterparty_name || "—"}</p>
                {previewDoc.items && (previewDoc.items as any[]).length > 0 && (
                  <table className="mt-4 mb-4" style={{ border: "1px solid #333" }}>
                    <thead>
                      <tr style={{ background: "#f0f0f0" }}>
                        <th className="p-2 text-left border border-gray-400 text-xs">№</th>
                        <th className="p-2 text-left border border-gray-400 text-xs">Наименование</th>
                        <th className="p-2 text-right border border-gray-400 text-xs">Кол-во</th>
                        <th className="p-2 text-right border border-gray-400 text-xs">Цена</th>
                        <th className="p-2 text-right border border-gray-400 text-xs">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewDoc.items as any[]).map((it: any, i: number) => (
                        <tr key={i}>
                          <td className="p-2 border border-gray-300 text-xs">{i + 1}</td>
                          <td className="p-2 border border-gray-300 text-xs">{it.name}</td>
                          <td className="p-2 border border-gray-300 text-xs text-right">{it.quantity}</td>
                          <td className="p-2 border border-gray-300 text-xs text-right">{fmtMoney(it.price)}</td>
                          <td className="p-2 border border-gray-300 text-xs text-right">{fmtMoney(it.sum)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p><b>Итого без НДС:</b> {fmtMoney(previewDoc.total_sum)} ₸</p>
                <p><b>НДС ({(previewDoc.nds_rate * 100).toFixed(0)}%):</b> {fmtMoney(previewDoc.nds_sum)} ₸</p>
                <p><b>Всего с НДС:</b> {fmtMoney(previewDoc.total_with_nds)} ₸</p>
                <p className="text-xs text-gray-500 mt-4">НДС рассчитан по ставке {(previewDoc.nds_rate * 100).toFixed(0)}% согласно НК РК 2026 (ЗРК 214-VIII)</p>
              </div>
              <div className="flex gap-3 mt-5 justify-end">
                <button onClick={() => { window.print(); }} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>🖨 Печать</button>
                <button onClick={() => setPreviewDoc(null)} className="px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Закрыть</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
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

      {/* Doc type grid */}
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

      {/* Documents table */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <table>
          <thead>
            <tr>
              {["", "Номер", "Дата", "Контрагент", "Сумма (с НДС)", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>
                  Документов пока нет. Нажмите на тип документа выше, чтобы создать первый.
                </td>
              </tr>
            ) : docs.map(d => {
              const dt = DOC_TYPES.find(t => t.key === d.doc_type);
              return (
                <tr key={d.id}>
                  <td className="p-2.5 text-base" style={{ borderBottom: "1px solid var(--brd)" }}>{dt?.icon}</td>
                  <td className="p-2.5 text-[13px] font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{d.doc_number}</td>
                  <td className="p-2.5 text-[13px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{d.doc_date}</td>
                  <td className="p-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--brd)" }}>{d.counterparty_name}</td>
                  <td className="p-2.5 text-[13px] font-bold" style={{ borderBottom: "1px solid var(--brd)" }}>{fmtMoney(d.total_with_nds)} ₸</td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <select value={d.status} onChange={e => updateStatus(d.id, e.target.value)}
                      className="text-[11px] font-semibold rounded-md px-2 py-1" style={{ width: "auto" }}>
                      <option value="draft">Черновик</option>
                      <option value="pending">Ожидает</option>
                      <option value="sent">Отправлен</option>
                      <option value="done">Проведён</option>
                      <option value="cancelled">Отменён</option>
                    </select>
                  </td>
                  <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                    <div className="flex gap-2">
                      <button onClick={() => setPreviewDoc(d)} className="bg-transparent border-none cursor-pointer text-xs font-semibold" style={{ color: "var(--accent)" }}>Открыть</button>
                      <button onClick={() => deleteDocument(d.id)} className="bg-transparent border-none cursor-pointer text-xs font-semibold" style={{ color: "#EF4444" }}>×</button>
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

// ─── Create Document Form ───
function CreateDocForm({ docType, counterparties, products, onSave, onCancel }: {
  docType: string;
  counterparties: Counterparty[];
  products: Product[];
  onSave: (doc: any) => void;
  onCancel: () => void;
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
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    next[i].sum = next[i].quantity * next[i].price;
    setItems(next);
  };
  const selectProduct = (i: number, pid: string) => {
    const p = products.find(x => x.id === pid);
    if (p) {
      const next = [...items];
      next[i] = { name: p.name, unit: p.unit, quantity: 1, price: Number(p.price), sum: Number(p.price) };
      setItems(next);
    }
  };

  const totalSum = items.reduce((a, it) => a + it.sum, 0);
  const ndsCalc = calcNDS(needsItems ? totalSum : Number(extra.amount || 0));

  const handleSave = () => {
    const now = new Date().toISOString().slice(0, 10);
    onSave({
      doc_type: docType,
      doc_number: `${docType.toUpperCase().slice(0, 3)}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      doc_date: now,
      counterparty_id: cpId || null,
      counterparty_name: cp?.name || extra.cpName || "",
      total_sum: ndsCalc.sumWithoutNDS,
      nds_sum: ndsCalc.nds,
      nds_rate: TAX.NDS,
      total_with_nds: ndsCalc.total,
      status: "draft",
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
      </div>

      {showAmt && (
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма (без НДС)</label>
          <input type="number" value={extra.amount || ""} onChange={e => setExtra({ ...extra, amount: e.target.value })} placeholder="0" />
        </div>
      )}

      {docType === "pp" && (
        <div>
          <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Назначение платежа</label>
          <input value={extra.purpose || ""} onChange={e => setExtra({ ...extra, purpose: e.target.value })} placeholder="Оплата по договору..." />
        </div>
      )}

      {needsItems && (
        <>
          <div className="text-[13px] font-bold mt-1">Товары / Услуги</div>
          {items.map((it, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-[2]">
                {i === 0 && <label className="block text-[10px] mb-1" style={{ color: "var(--t3)" }}>Из справочника</label>}
                <select onChange={e => selectProduct(i, e.target.value)} value="">
                  <option value="">Выбрать...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} — {fmtMoney(Number(p.price))} ₸</option>)}
                </select>
              </div>
              <div className="flex-[2]">
                {i === 0 && <label className="block text-[10px] mb-1" style={{ color: "var(--t3)" }}>Наименование</label>}
                <input value={it.name} onChange={e => updateRow(i, "name", e.target.value)} placeholder="Или введите вручную" />
              </div>
              <div className="w-20">
                {i === 0 && <label className="block text-[10px] mb-1" style={{ color: "var(--t3)" }}>Кол-во</label>}
                <input type="number" value={it.quantity} onChange={e => updateRow(i, "quantity", Number(e.target.value))} />
              </div>
              <div className="w-28">
                {i === 0 && <label className="block text-[10px] mb-1" style={{ color: "var(--t3)" }}>Цена</label>}
                <input type="number" value={it.price} onChange={e => updateRow(i, "price", Number(e.target.value))} />
              </div>
              <div className="w-24 text-right text-[13px] font-bold pb-2.5">{fmtMoney(it.sum)} ₸</div>
              <button onClick={() => removeRow(i)} className="bg-transparent border-none cursor-pointer text-lg pb-2" style={{ color: "#EF4444" }}>×</button>
            </div>
          ))}
          <button onClick={addRow} className="self-start px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
            style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>+ Добавить строку</button>
        </>
      )}

      {/* Totals */}
      <div className="flex justify-end gap-5 py-3 text-xs" style={{ borderTop: "1px solid var(--brd)", color: "var(--t3)" }}>
        <span>Итого: <b style={{ color: "var(--t1)" }}>{fmtMoney(ndsCalc.sumWithoutNDS)} ₸</b></span>
        <span>НДС {TAX.NDS * 100}%: <b style={{ color: "var(--t1)" }}>{fmtMoney(ndsCalc.nds)} ₸</b></span>
        <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>Всего: {fmtMoney(ndsCalc.total)} ₸</span>
      </div>

      <div className="flex gap-3 justify-end mt-2">
        <button onClick={onCancel} className="px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer"
          style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
        <button onClick={handleSave} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer"
          style={{ background: "var(--accent)" }}>Сформировать документ</button>
      </div>
    </div>
  );
}
