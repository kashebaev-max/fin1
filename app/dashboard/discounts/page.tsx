"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "discounts" | "cards" | "transactions";

const DISCOUNT_TYPES: Record<string, { name: string; icon: string; color: string; suffix: string }> = {
  percent: { name: "Процент", icon: "🎯", color: "#10B981", suffix: "%" },
  fixed: { name: "Фиксированная", icon: "💸", color: "#F59E0B", suffix: "₸" },
  cumulative: { name: "Накопительная", icon: "📈", color: "#A855F7", suffix: "%" },
  bonus: { name: "Бонусы", icon: "⭐", color: "#EC4899", suffix: "%" },
  gift: { name: "Подарок", icon: "🎁", color: "#EF4444", suffix: "" },
};

const CONDITION_TYPES: Record<string, string> = {
  always: "Всегда",
  min_amount: "От суммы",
  min_quantity: "От количества",
  category: "Категория товара",
  product: "Конкретный товар",
  customer_group: "Группа клиентов",
  card: "По карте лояльности",
};

const CARD_TYPES: Record<string, { name: string; color: string; defaultDiscount: number; defaultBonus: number }> = {
  bronze: { name: "Bronze", color: "#CD7F32", defaultDiscount: 0, defaultBonus: 1 },
  silver: { name: "Silver", color: "#C0C0C0", defaultDiscount: 3, defaultBonus: 2 },
  gold: { name: "Gold", color: "#FFD700", defaultDiscount: 5, defaultBonus: 3 },
  platinum: { name: "Platinum", color: "#E5E4E2", defaultDiscount: 7, defaultBonus: 5 },
  vip: { name: "VIP", color: "#A855F7", defaultDiscount: 10, defaultBonus: 7 },
};

export default function DiscountsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("discounts");
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  // Discount form
  const [showDiscForm, setShowDiscForm] = useState(false);
  const [editingDisc, setEditingDisc] = useState<any>(null);
  const emptyDisc = {
    code: "", name: "", discount_type: "percent",
    value: "10",
    condition_type: "always",
    min_amount: "", min_quantity: "",
    valid_from: "", valid_to: "",
    max_uses: "", per_customer_limit: "",
    is_active: true, is_combinable: false,
    description: "",
  };
  const [discForm, setDiscForm] = useState(emptyDisc);

  // Card form
  const [showCardForm, setShowCardForm] = useState(false);
  const emptyCard = {
    card_number: "",
    customer_id: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    card_type: "silver",
    discount_percent: "3",
    bonus_percent: "2",
    expiry_date: "",
    notes: "",
  };
  const [cardForm, setCardForm] = useState(emptyCard);

  // Bonus transaction
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusForm, setBonusForm] = useState({ card_id: "", trans_type: "earn", amount: "", description: "", doc_ref: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [d, c, t, cp] = await Promise.all([
      supabase.from("discounts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("loyalty_cards").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("loyalty_transactions").select("*").eq("user_id", user.id).order("trans_date", { ascending: false }).limit(100),
      supabase.from("counterparties").select("*").eq("user_id", user.id),
    ]);
    setDiscounts(d.data || []);
    setCards(c.data || []);
    setTransactions(t.data || []);
    setCounterparties(cp.data || []);
  }

  // ═══ СКИДКИ ═══
  function startCreateDisc() {
    setEditingDisc(null);
    setDiscForm({ ...emptyDisc, code: `PROMO-${Math.floor(Math.random() * 9000) + 1000}` });
    setShowDiscForm(true);
  }

  function startEditDisc(d: any) {
    setEditingDisc(d);
    setDiscForm({
      code: d.code || "", name: d.name, discount_type: d.discount_type,
      value: String(d.value),
      condition_type: d.condition_type || "always",
      min_amount: String(d.min_amount || ""),
      min_quantity: String(d.min_quantity || ""),
      valid_from: d.valid_from || "", valid_to: d.valid_to || "",
      max_uses: String(d.max_uses || ""),
      per_customer_limit: String(d.per_customer_limit || ""),
      is_active: !!d.is_active,
      is_combinable: !!d.is_combinable,
      description: d.description || "",
    });
    setShowDiscForm(true);
  }

  async function saveDisc() {
    if (!discForm.name) { setMsg("❌ Укажите название"); setTimeout(() => setMsg(""), 3000); return; }
    const data = {
      user_id: userId,
      code: discForm.code || null,
      name: discForm.name,
      discount_type: discForm.discount_type,
      value: Number(discForm.value),
      condition_type: discForm.condition_type,
      min_amount: discForm.min_amount ? Number(discForm.min_amount) : null,
      min_quantity: discForm.min_quantity ? Number(discForm.min_quantity) : null,
      valid_from: discForm.valid_from || null,
      valid_to: discForm.valid_to || null,
      max_uses: discForm.max_uses ? Number(discForm.max_uses) : null,
      per_customer_limit: discForm.per_customer_limit ? Number(discForm.per_customer_limit) : null,
      is_active: discForm.is_active,
      is_combinable: discForm.is_combinable,
      description: discForm.description || null,
    };
    if (editingDisc) await supabase.from("discounts").update(data).eq("id", editingDisc.id);
    else await supabase.from("discounts").insert(data);
    setMsg(`✅ ${editingDisc ? "Обновлено" : "Создано"}: ${discForm.name}`);
    setShowDiscForm(false); setEditingDisc(null); load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteDisc(id: string) {
    if (!confirm("Удалить скидку?")) return;
    await supabase.from("discounts").delete().eq("id", id);
    load();
  }

  async function toggleDisc(d: any) {
    await supabase.from("discounts").update({ is_active: !d.is_active }).eq("id", d.id);
    load();
  }

  // ═══ КАРТЫ ═══
  function startCreateCard() {
    const num = `LC-${Date.now().toString().slice(-9)}`;
    setCardForm({ ...emptyCard, card_number: num });
    setShowCardForm(true);
  }

  function selectCustomer(id: string) {
    const c = counterparties.find(x => x.id === id);
    if (c) setCardForm({ ...cardForm, customer_id: id, customer_name: c.name, customer_phone: c.phone || "", customer_email: c.email || "" });
    else setCardForm({ ...cardForm, customer_id: "" });
  }

  function selectCardType(type: string) {
    const t = CARD_TYPES[type];
    setCardForm({
      ...cardForm,
      card_type: type,
      discount_percent: String(t.defaultDiscount),
      bonus_percent: String(t.defaultBonus),
    });
  }

  async function saveCard() {
    if (!cardForm.card_number || !cardForm.customer_name) {
      setMsg("❌ Укажите номер карты и имя клиента"); setTimeout(() => setMsg(""), 3000); return;
    }
    await supabase.from("loyalty_cards").insert({
      user_id: userId,
      card_number: cardForm.card_number,
      customer_id: cardForm.customer_id || null,
      customer_name: cardForm.customer_name,
      customer_phone: cardForm.customer_phone || null,
      customer_email: cardForm.customer_email || null,
      card_type: cardForm.card_type,
      discount_percent: Number(cardForm.discount_percent),
      bonus_percent: Number(cardForm.bonus_percent),
      expiry_date: cardForm.expiry_date || null,
      notes: cardForm.notes,
    });
    setMsg(`✅ Карта ${cardForm.card_number} выпущена`);
    setShowCardForm(false);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteCard(id: string) {
    if (!confirm("Удалить карту? История бонусов также удалится.")) return;
    await supabase.from("loyalty_cards").delete().eq("id", id);
    load();
  }

  async function toggleCard(c: any) {
    await supabase.from("loyalty_cards").update({ is_active: !c.is_active }).eq("id", c.id);
    load();
  }

  // ═══ БОНУСЫ ═══
  async function processBonus() {
    if (!bonusForm.card_id || !bonusForm.amount) {
      setMsg("❌ Выберите карту и укажите сумму"); setTimeout(() => setMsg(""), 3000); return;
    }
    const amount = Number(bonusForm.amount);
    const card = cards.find(c => c.id === bonusForm.card_id);
    if (!card) return;

    // Записываем транзакцию
    await supabase.from("loyalty_transactions").insert({
      user_id: userId,
      card_id: bonusForm.card_id,
      trans_type: bonusForm.trans_type,
      amount,
      doc_ref: bonusForm.doc_ref || null,
      description: bonusForm.description || null,
    });

    // Обновляем баланс карты
    let newBalance = Number(card.bonus_balance);
    if (bonusForm.trans_type === "earn" || bonusForm.trans_type === "adjust") newBalance += amount;
    else newBalance = Math.max(0, newBalance - amount);

    await supabase.from("loyalty_cards").update({ bonus_balance: newBalance }).eq("id", bonusForm.card_id);

    setMsg(`✅ ${bonusForm.trans_type === "earn" ? "Начислено" : "Списано"} ${amount} бонусов`);
    setBonusForm({ card_id: "", trans_type: "earn", amount: "", description: "", doc_ref: "" });
    setShowBonusForm(false);
    load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteTrans(id: string) {
    if (!confirm("Удалить транзакцию? Баланс карты НЕ будет пересчитан автоматически.")) return;
    await supabase.from("loyalty_transactions").delete().eq("id", id);
    load();
  }

  // KPI
  const today = new Date().toISOString().slice(0, 10);
  const activeDiscounts = discounts.filter(d => {
    if (!d.is_active) return false;
    if (d.valid_from && d.valid_from > today) return false;
    if (d.valid_to && d.valid_to < today) return false;
    return true;
  }).length;
  const activeCards = cards.filter(c => c.is_active).length;
  const totalBonusBalance = cards.reduce((a, c) => a + Number(c.bonus_balance || 0), 0);
  const monthEarn = transactions.filter(t => t.trans_type === "earn" && t.trans_date >= new Date().toISOString().slice(0, 7) + "-01").reduce((a, t) => a + Number(t.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Скидки и промо-акции, карты лояльности, бонусные баллы. Условия применения, сроки действия, лимиты использования.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>🎯 Активных скидок</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{activeDiscounts}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {discounts.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #FFD700" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>💳 Активных карт</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{activeCards}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Всего: {cards.length}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EC4899" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⭐ Баланс бонусов</div>
          <div className="text-xl font-bold" style={{ color: "#EC4899" }}>{fmtMoney(totalBonusBalance)}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>На всех картах</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #A855F7" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📈 Начислено за месяц</div>
          <div className="text-xl font-bold" style={{ color: "#A855F7" }}>{fmtMoney(monthEarn)}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Бонусов</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["discounts", `🎯 Скидки и промо (${discounts.length})`],
          ["cards", `💳 Карты лояльности (${cards.length})`],
          ["transactions", `⭐ История бонусов (${transactions.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ СКИДКИ ═══ */}
      {tab === "discounts" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>5 типов: процент / фиксированная / накопительная / бонусы / подарок</div>
            <button onClick={startCreateDisc} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Новая скидка</button>
          </div>

          {showDiscForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">{editingDisc ? "Редактирование скидки" : "Новая скидка / акция"}</div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Промокод</label><input value={discForm.code} onChange={e => setDiscForm({ ...discForm, code: e.target.value.toUpperCase() })} /></div>
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название *</label><input value={discForm.name} onChange={e => setDiscForm({ ...discForm, name: e.target.value })} placeholder="Скидка 10% на школьные товары" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип скидки</label>
                  <select value={discForm.discount_type} onChange={e => setDiscForm({ ...discForm, discount_type: e.target.value })}>
                    {Object.entries(DISCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Значение</label>
                  <div className="flex gap-1 items-center">
                    <input type="number" step="0.01" value={discForm.value} onChange={e => setDiscForm({ ...discForm, value: e.target.value })} style={{ flex: 1 }} />
                    <span className="text-xs" style={{ color: "var(--t3)" }}>{DISCOUNT_TYPES[discForm.discount_type]?.suffix}</span>
                  </div>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Условие</label>
                  <select value={discForm.condition_type} onChange={e => setDiscForm({ ...discForm, condition_type: e.target.value })}>
                    {Object.entries(CONDITION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {discForm.condition_type === "min_amount" && (
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Мин. сумма (₸)</label><input type="number" value={discForm.min_amount} onChange={e => setDiscForm({ ...discForm, min_amount: e.target.value })} /></div>
                )}
                {discForm.condition_type === "min_quantity" && (
                  <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Мин. количество</label><input type="number" value={discForm.min_quantity} onChange={e => setDiscForm({ ...discForm, min_quantity: e.target.value })} /></div>
                )}
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Действует с</label><input type="date" value={discForm.valid_from} onChange={e => setDiscForm({ ...discForm, valid_from: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Действует по</label><input type="date" value={discForm.valid_to} onChange={e => setDiscForm({ ...discForm, valid_to: e.target.value })} /></div>
                <div></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Макс. использований всего</label><input type="number" value={discForm.max_uses} onChange={e => setDiscForm({ ...discForm, max_uses: e.target.value })} placeholder="не ограничено" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Лимит на клиента</label><input type="number" value={discForm.per_customer_limit} onChange={e => setDiscForm({ ...discForm, per_customer_limit: e.target.value })} placeholder="не ограничено" /></div>
                <div className="flex items-end gap-3" style={{ paddingBottom: 8 }}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={discForm.is_active} onChange={e => setDiscForm({ ...discForm, is_active: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">Активна</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={discForm.is_combinable} onChange={e => setDiscForm({ ...discForm, is_combinable: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    <span className="text-xs">Комбинируется</span>
                  </label>
                </div>
                <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={discForm.description} onChange={e => setDiscForm({ ...discForm, description: e.target.value })} /></div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveDisc} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
                <button onClick={() => { setShowDiscForm(false); setEditingDisc(null); }} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
            <table>
              <thead><tr>{["Код", "Название", "Тип", "Значение", "Условие", "Период", "Использовано", "Статус", ""].map(h => (
                <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {discounts.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет скидок. Создайте первую.</td></tr>
                ) : discounts.map(d => {
                  const t = DISCOUNT_TYPES[d.discount_type] || DISCOUNT_TYPES.percent;
                  const isExp = d.valid_to && d.valid_to < today;
                  return (
                    <tr key={d.id}>
                      <td className="p-2.5 text-[12px] font-mono font-semibold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>{d.code || "—"}</td>
                      <td className="p-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{d.name}</td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: t.color + "20", color: t.color }}>{t.icon} {t.name}</span>
                      </td>
                      <td className="p-2.5 text-[13px] font-bold" style={{ color: t.color, borderBottom: "1px solid var(--brd)" }}>{Number(d.value).toFixed(2)}{t.suffix}</td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                        {CONDITION_TYPES[d.condition_type] || "—"}
                        {d.min_amount && <div>от {fmtMoney(Number(d.min_amount))} ₸</div>}
                        {d.min_quantity && <div>от {d.min_quantity} ед.</div>}
                      </td>
                      <td className="p-2.5 text-[11px]" style={{ color: isExp ? "#EF4444" : "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                        {d.valid_from && d.valid_to ? `${d.valid_from} → ${d.valid_to}` : d.valid_to ? `до ${d.valid_to}` : "бессрочно"}
                      </td>
                      <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                        {d.current_uses || 0}{d.max_uses ? ` / ${d.max_uses}` : ""}
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => toggleDisc(d)} className="text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer border-none" style={{ background: d.is_active ? "#10B98120" : "#6B728020", color: d.is_active ? "#10B981" : "#6B7280" }}>
                          {d.is_active ? "✓ Вкл" : "○ Выкл"}
                        </button>
                      </td>
                      <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                        <button onClick={() => startEditDisc(d)} className="text-[11px] cursor-pointer border-none bg-transparent mr-2" style={{ color: "var(--accent)" }}>✏</button>
                        <button onClick={() => deleteDisc(d.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ КАРТЫ ═══ */}
      {tab === "cards" && (
        <>
          <div className="flex justify-between">
            <div className="text-xs" style={{ color: "var(--t3)" }}>5 уровней карт: Bronze / Silver / Gold / Platinum / VIP</div>
            <button onClick={startCreateCard} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>+ Выпустить карту</button>
          </div>

          {showCardForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">Новая карта лояльности</div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Номер карты</label><input value={cardForm.card_number} onChange={e => setCardForm({ ...cardForm, card_number: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Уровень карты</label>
                  <select value={cardForm.card_type} onChange={e => selectCardType(e.target.value)}>
                    {Object.entries(CARD_TYPES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Срок действия</label><input type="date" value={cardForm.expiry_date} onChange={e => setCardForm({ ...cardForm, expiry_date: e.target.value })} /></div>
                <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Клиент из справочника</label>
                  <select value={cardForm.customer_id} onChange={e => selectCustomer(e.target.value)}>
                    <option value="">— Выбрать или ввести данные ниже —</option>
                    {counterparties.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО клиента *</label><input value={cardForm.customer_name} onChange={e => setCardForm({ ...cardForm, customer_name: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Телефон</label><input value={cardForm.customer_phone} onChange={e => setCardForm({ ...cardForm, customer_phone: e.target.value })} placeholder="+7" /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Email</label><input type="email" value={cardForm.customer_email} onChange={e => setCardForm({ ...cardForm, customer_email: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Скидка по карте, %</label><input type="number" step="0.01" value={cardForm.discount_percent} onChange={e => setCardForm({ ...cardForm, discount_percent: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Бонусы за покупки, %</label><input type="number" step="0.01" value={cardForm.bonus_percent} onChange={e => setCardForm({ ...cardForm, bonus_percent: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={cardForm.notes} onChange={e => setCardForm({ ...cardForm, notes: e.target.value })} /></div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveCard} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>💳 Выпустить карту</button>
                <button onClick={() => setShowCardForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          {/* Bonus form */}
          {showBonusForm && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-sm font-bold mb-3">⭐ Операция с бонусами</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Карта</label>
                  <select value={bonusForm.card_id} onChange={e => setBonusForm({ ...bonusForm, card_id: e.target.value })}>
                    <option value="">— Выбрать —</option>
                    {cards.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.card_number} • {c.customer_name} (баланс: {fmtMoney(Number(c.bonus_balance))})</option>)}
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Операция</label>
                  <select value={bonusForm.trans_type} onChange={e => setBonusForm({ ...bonusForm, trans_type: e.target.value })}>
                    <option value="earn">📈 Начислить</option>
                    <option value="spend">📉 Списать</option>
                    <option value="adjust">⚙ Корректировка</option>
                    <option value="expire">⏰ Сгорание</option>
                  </select>
                </div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Сумма бонусов</label><input type="number" value={bonusForm.amount} onChange={e => setBonusForm({ ...bonusForm, amount: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>№ документа</label><input value={bonusForm.doc_ref} onChange={e => setBonusForm({ ...bonusForm, doc_ref: e.target.value })} /></div>
                <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={bonusForm.description} onChange={e => setBonusForm({ ...bonusForm, description: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={processBonus} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "var(--accent)" }}>Провести</button>
                <button onClick={() => setShowBonusForm(false)} className="px-4 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {cards.length === 0 ? (
              <div className="col-span-3 rounded-xl p-8 text-center text-sm" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>Нет карт лояльности</div>
            ) : cards.map(c => {
              const t = CARD_TYPES[c.card_type] || CARD_TYPES.silver;
              return (
                <div key={c.id} className="rounded-xl p-4" style={{ background: `linear-gradient(135deg, ${t.color}30, ${t.color}10)`, border: `2px solid ${t.color}80` }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.color }}>{t.name} CARD</div>
                      <div className="text-base font-bold font-mono">{c.card_number}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => toggleCard(c)} className="text-[10px] px-2 py-0.5 rounded cursor-pointer border-none" style={{ background: c.is_active ? "#10B98120" : "#6B728020", color: c.is_active ? "#10B981" : "#6B7280" }}>
                        {c.is_active ? "Активна" : "Заблок."}
                      </button>
                      <button onClick={() => deleteCard(c.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </div>
                  </div>
                  <div className="text-sm font-bold mb-1">{c.customer_name}</div>
                  {c.customer_phone && <div className="text-[11px]" style={{ color: "var(--t2)" }}>📞 {c.customer_phone}</div>}

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
                    <div>
                      <div className="text-[9px]" style={{ color: "var(--t3)" }}>СКИДКА</div>
                      <div className="text-sm font-bold">{c.discount_percent}%</div>
                    </div>
                    <div>
                      <div className="text-[9px]" style={{ color: "var(--t3)" }}>БОНУСЫ</div>
                      <div className="text-sm font-bold">{c.bonus_percent}%</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
                    <div className="text-[9px]" style={{ color: "var(--t3)" }}>БАЛАНС БОНУСОВ</div>
                    <div className="text-base font-bold" style={{ color: "#EC4899" }}>⭐ {fmtMoney(Number(c.bonus_balance))} ₸</div>
                    <div className="text-[10px]" style={{ color: "var(--t3)" }}>Покупок: {c.purchases_count} • Сумма: {fmtMoney(Number(c.total_purchases))} ₸</div>
                  </div>
                </div>
              );
            })}
          </div>

          {cards.length > 0 && (
            <button onClick={() => setShowBonusForm(!showBonusForm)} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer self-start" style={{ background: "#EC4899" }}>
              ⭐ Начислить / Списать бонусы
            </button>
          )}
        </>
      )}

      {/* ═══ ИСТОРИЯ ═══ */}
      {tab === "transactions" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">⭐ История операций с бонусами (последние 100)</div>
          <table>
            <thead><tr>{["Дата", "Карта", "Клиент", "Операция", "Сумма", "Документ", "Описание", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет операций</td></tr>
              ) : transactions.map(t => {
                const card = cards.find(c => c.id === t.card_id);
                const isPlus = t.trans_type === "earn" || t.trans_type === "adjust";
                return (
                  <tr key={t.id}>
                    <td className="p-2.5 text-[12px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{t.trans_date}</td>
                    <td className="p-2.5 text-[11px] font-mono" style={{ borderBottom: "1px solid var(--brd)" }}>{card?.card_number || "—"}</td>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>{card?.customer_name || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: isPlus ? "#10B98120" : "#EF444420", color: isPlus ? "#10B981" : "#EF4444" }}>
                        {t.trans_type === "earn" ? "📈 Начислено" : t.trans_type === "spend" ? "📉 Списано" : t.trans_type === "expire" ? "⏰ Сгорело" : "⚙ Корр."}
                      </span>
                    </td>
                    <td className="p-2.5 text-[13px] font-bold" style={{ color: isPlus ? "#10B981" : "#EF4444", borderBottom: "1px solid var(--brd)" }}>{isPlus ? "+" : "−"}{fmtMoney(Number(t.amount))}</td>
                    <td className="p-2.5 text-[11px] font-mono" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{t.doc_ref || "—"}</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{t.description || "—"}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => deleteTrans(t.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
