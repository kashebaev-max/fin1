// Сборщик контекста бизнеса для AI Жанары.
// Собирает данные из разных таблиц в один структурированный объект.

import { SupabaseClient } from "@supabase/supabase-js";

export interface BusinessContext {
  generatedAt: string;
  user: {
    id: string;
    fullName: string | null;
    companyName: string | null;
    bin: string | null;
    taxRegime: string | null;
  };
  finance: {
    cash: number;
    bank: number;
    totalLiquid: number;
    receivables: number;
    payables: number;
    netPosition: number;
  };
  taxes: {
    vatDue: number;
    ipnDue: number;
    citDue: number;
    socialDue: number;
    nextFnoDeadlines: { form: string; deadline: string; daysLeft: number }[];
  };
  inventory: {
    totalValue: number;
    totalItems: number;
    lowStockItems: { name: string; qty: number; min: number }[];
    expiringSoon: { name: string; expiryDate: string; daysLeft: number }[];
    expired: { name: string; expiryDate: string; daysOverdue: number }[];
  };
  sales: {
    revenueMTD: number;
    revenueYTD: number;
    salesCount: number;
    topClients: { name: string; revenue: number }[];
  };
  expenses: {
    mtd: number;
    ytd: number;
  };
  hr: {
    employeesCount: number;
    activeEmployees: number;
    payrollMonthly: number;
    upcomingVacations: { employee: string; start: string; end: string }[];
  };
  documents: {
    draftCount: number;
    overdueByCustomers: { client: string; amount: number; daysOverdue: number }[];
    overduePayables: { supplier: string; amount: number; daysOverdue: number }[];
  };
  recurring: {
    upcomingPayments: { description: string; date: string; amount: number }[];
    overduePayments: { description: string; date: string; amount: number; daysOverdue: number }[];
  };
  recentActivity: {
    todayDocs: number;
    todayEntries: number;
    lastEntries: { date: string; description: string; amount: number }[];
  };
}

const TODAY = () => new Date().toISOString().slice(0, 10);
const DAYS_AGO = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const DAYS_FROM_NOW = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

export async function collectBusinessContext(supabase: SupabaseClient, userId: string): Promise<BusinessContext> {
  const today = TODAY();
  const monthStart = today.slice(0, 7) + "-01";
  const yearStart = today.slice(0, 4) + "-01-01";
  const in30Days = DAYS_FROM_NOW(30);

  // Параллельный сбор всего
  const [
    profileRes,
    journalRes,
    nomenclatureRes,
    batchesRes,
    employeesRes,
    docsRes,
    schedulesRes,
    vacationsRes,
    salesRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("journal_entries").select("*").eq("user_id", userId).order("entry_date", { ascending: false }).limit(500),
    supabase.from("nomenclature").select("*").eq("user_id", userId),
    supabase.from("stock_batches").select("*").eq("user_id", userId).eq("is_active", true).gt("current_quantity", 0),
    supabase.from("employees").select("*").eq("user_id", userId),
    supabase.from("documents").select("*").eq("user_id", userId).order("doc_date", { ascending: false }).limit(200),
    supabase.from("payment_schedules").select("*").eq("user_id", userId).eq("status", "pending").order("scheduled_date").limit(100),
    supabase.from("vacations").select("*").eq("user_id", userId).gte("end_date", today).order("start_date").limit(50),
    supabase.from("orders").select("*").eq("user_id", userId).gte("order_date", monthStart).limit(500),
  ]);

  const profile = profileRes.data || {};
  const entries = journalRes.data || [];
  const nomenclature = nomenclatureRes.data || [];
  const batches = batchesRes.data || [];
  const employees = employeesRes.data || [];
  const docs = docsRes.data || [];
  const schedules = schedulesRes.data || [];
  const vacations = vacationsRes.data || [];
  const orders = salesRes.data || [];

  // ═══ Расчёт сальдо по счетам ═══
  function getBalance(account: string): number {
    let bal = 0;
    entries.forEach(e => {
      if (String(e.debit_account) === account) bal += Number(e.amount);
      if (String(e.credit_account) === account) bal -= Number(e.amount);
    });
    return bal;
  }

  // Касса = 1010, банк = 1030+1040
  const cash = Math.max(0, getBalance("1010"));
  const bank = Math.max(0, getBalance("1030")) + Math.max(0, getBalance("1040"));

  // Дебиторка = 1210
  const receivables = Math.max(0, getBalance("1210") + getBalance("1280"));
  // Кредиторка = 3310
  const payables = Math.max(0, -getBalance("3310")) + Math.max(0, -getBalance("3380"));

  // Налоги к уплате (отрицательное сальдо)
  const vatDue = Math.max(0, -getBalance("3130"));
  const ipnDue = Math.max(0, -getBalance("3120"));
  const citDue = Math.max(0, -getBalance("3110"));
  const socialDue = Math.max(0, -getBalance("3150")) +
                    Math.max(0, -getBalance("3210")) +
                    Math.max(0, -getBalance("3220")) +
                    Math.max(0, -getBalance("3230"));

  // ═══ Сроки ФНО ═══
  const fnoDeadlines: { form: string; deadline: string; daysLeft: number }[] = [];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const quarterEndMonth = Math.floor(currentMonth / 3) * 3 + 2;
  const quarterDeadline = new Date(currentYear, quarterEndMonth + 1, 15);
  if (quarterDeadline > now) {
    fnoDeadlines.push({
      form: "ФНО 200 / 300 (квартальные)",
      deadline: quarterDeadline.toISOString().slice(0, 10),
      daysLeft: daysBetween(today, quarterDeadline.toISOString().slice(0, 10)),
    });
  }
  // Ежемесячная ФНО 910 — до 15 числа следующего месяца
  const fnoMonthly = new Date(currentYear, currentMonth + 1, 15);
  if (fnoMonthly > now) {
    fnoDeadlines.push({
      form: "ФНО 910 (ежемесячная)",
      deadline: fnoMonthly.toISOString().slice(0, 10),
      daysLeft: daysBetween(today, fnoMonthly.toISOString().slice(0, 10)),
    });
  }

  // ═══ Запасы ═══
  const totalStockValue = nomenclature.reduce((a, n) =>
    a + Number(n.quantity || 0) * Number(n.purchase_price || 0), 0);
  const lowStockItems = nomenclature
    .filter(n => n.min_stock && Number(n.quantity || 0) < Number(n.min_stock))
    .slice(0, 10)
    .map(n => ({ name: n.name, qty: Number(n.quantity || 0), min: Number(n.min_stock) }));

  const expiringSoon = batches
    .filter(b => b.expiry_date && b.expiry_date >= today && b.expiry_date <= in30Days)
    .slice(0, 10)
    .map(b => ({
      name: b.product_name,
      expiryDate: b.expiry_date,
      daysLeft: daysBetween(today, b.expiry_date),
    }));

  const expired = batches
    .filter(b => b.expiry_date && b.expiry_date < today)
    .slice(0, 10)
    .map(b => ({
      name: b.product_name,
      expiryDate: b.expiry_date,
      daysOverdue: daysBetween(b.expiry_date, today),
    }));

  // ═══ Продажи ═══
  const monthEntries = entries.filter(e => e.entry_date >= monthStart && e.entry_date <= today);
  const yearEntries = entries.filter(e => e.entry_date >= yearStart && e.entry_date <= today);
  const revenueMTD = monthEntries
    .filter(e => String(e.credit_account) === "6010")
    .reduce((a, e) => a + Number(e.amount), 0);
  const revenueYTD = yearEntries
    .filter(e => String(e.credit_account) === "6010")
    .reduce((a, e) => a + Number(e.amount), 0);
  const expensesMTD = monthEntries
    .filter(e => ["7010", "7110", "7210", "7310", "7990"].includes(String(e.debit_account)))
    .reduce((a, e) => a + Number(e.amount), 0);
  const expensesYTD = yearEntries
    .filter(e => ["7010", "7110", "7210", "7310", "7990"].includes(String(e.debit_account)))
    .reduce((a, e) => a + Number(e.amount), 0);

  // ═══ Топ клиенты по обороту ═══
  const clientRevenue: Record<string, number> = {};
  orders.forEach(o => {
    const name = o.client_name || o.counterparty_name || "Без имени";
    clientRevenue[name] = (clientRevenue[name] || 0) + Number(o.total_amount || 0);
  });
  const topClients = Object.entries(clientRevenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, revenue]) => ({ name, revenue }));

  // ═══ Кадры ═══
  const activeEmployees = employees.filter(e => e.is_active !== false);
  const payrollMonthly = activeEmployees.reduce((a, e) => a + Number(e.salary || 0), 0);
  const upcomingVacations = vacations.slice(0, 5).map(v => ({
    employee: v.employee_name,
    start: v.start_date,
    end: v.end_date,
  }));

  // ═══ Документы ═══
  const draftCount = docs.filter(d => d.status === "draft").length;

  // ═══ Просрочки ═══
  const overdue = schedules.filter(s => s.scheduled_date < today);
  const overdueByCustomers = overdue
    .filter(s => s.payment_type === "incoming")
    .slice(0, 5)
    .map(s => ({
      client: s.counterparty_name || "Покупатель",
      amount: Number(s.amount),
      daysOverdue: daysBetween(s.scheduled_date, today),
    }));
  const overduePayables = overdue
    .filter(s => s.payment_type !== "incoming")
    .slice(0, 5)
    .map(s => ({
      supplier: s.counterparty_name || "Поставщик",
      amount: Number(s.amount),
      daysOverdue: daysBetween(s.scheduled_date, today),
    }));

  const upcomingPayments = schedules
    .filter(s => s.scheduled_date >= today && s.scheduled_date <= in30Days)
    .slice(0, 10)
    .map(s => ({
      description: s.description || "Платёж",
      date: s.scheduled_date,
      amount: Number(s.amount),
    }));

  const overduePayments = overdue.slice(0, 10).map(s => ({
    description: s.description || "Просроченный платёж",
    date: s.scheduled_date,
    amount: Number(s.amount),
    daysOverdue: daysBetween(s.scheduled_date, today),
  }));

  // ═══ Активность ═══
  const todayDocs = docs.filter(d => d.doc_date === today).length;
  const todayEntries = entries.filter(e => e.entry_date === today).length;
  const lastEntries = entries.slice(0, 5).map(e => ({
    date: e.entry_date,
    description: e.description || "Без описания",
    amount: Number(e.amount),
  }));

  return {
    generatedAt: new Date().toISOString(),
    user: {
      id: userId,
      fullName: profile.full_name || null,
      companyName: profile.company_name || null,
      bin: profile.bin || null,
      taxRegime: profile.tax_regime || null,
    },
    finance: {
      cash,
      bank,
      totalLiquid: cash + bank,
      receivables,
      payables,
      netPosition: cash + bank + receivables - payables,
    },
    taxes: {
      vatDue, ipnDue, citDue, socialDue,
      nextFnoDeadlines: fnoDeadlines,
    },
    inventory: {
      totalValue: totalStockValue,
      totalItems: nomenclature.length,
      lowStockItems,
      expiringSoon,
      expired,
    },
    sales: {
      revenueMTD,
      revenueYTD,
      salesCount: orders.length,
      topClients,
    },
    expenses: {
      mtd: expensesMTD,
      ytd: expensesYTD,
    },
    hr: {
      employeesCount: employees.length,
      activeEmployees: activeEmployees.length,
      payrollMonthly,
      upcomingVacations,
    },
    documents: {
      draftCount,
      overdueByCustomers,
      overduePayables,
    },
    recurring: {
      upcomingPayments,
      overduePayments,
    },
    recentActivity: {
      todayDocs,
      todayEntries,
      lastEntries,
    },
  };
}

// Краткая текстовая версия для системного промпта Жанары
export function contextToText(ctx: BusinessContext): string {
  const lines: string[] = [];
  lines.push(`СОСТОЯНИЕ БИЗНЕСА на ${ctx.generatedAt.slice(0, 16).replace("T", " ")}:`);
  lines.push(`Компания: ${ctx.user.companyName || "—"} (БИН: ${ctx.user.bin || "—"}, режим: ${ctx.user.taxRegime || "—"})`);
  lines.push(`Пользователь: ${ctx.user.fullName || "—"}`);
  lines.push("");
  lines.push("💰 ФИНАНСЫ:");
  lines.push(`  Касса: ${ctx.finance.cash.toLocaleString("ru-RU")} ₸ | Банк: ${ctx.finance.bank.toLocaleString("ru-RU")} ₸`);
  lines.push(`  Дебиторка: ${ctx.finance.receivables.toLocaleString("ru-RU")} ₸ | Кредиторка: ${ctx.finance.payables.toLocaleString("ru-RU")} ₸`);
  lines.push(`  Чистая позиция: ${ctx.finance.netPosition.toLocaleString("ru-RU")} ₸`);
  lines.push("");
  lines.push("📊 ПРОДАЖИ И РАСХОДЫ:");
  lines.push(`  Выручка с начала месяца: ${ctx.sales.revenueMTD.toLocaleString("ru-RU")} ₸`);
  lines.push(`  Выручка с начала года: ${ctx.sales.revenueYTD.toLocaleString("ru-RU")} ₸`);
  lines.push(`  Расходы месяца: ${ctx.expenses.mtd.toLocaleString("ru-RU")} ₸`);
  if (ctx.sales.topClients.length > 0) {
    lines.push(`  Топ клиенты: ${ctx.sales.topClients.slice(0, 3).map(c => `${c.name} (${c.revenue.toLocaleString("ru-RU")} ₸)`).join(", ")}`);
  }
  lines.push("");
  lines.push("📑 НАЛОГИ К УПЛАТЕ:");
  lines.push(`  НДС: ${ctx.taxes.vatDue.toLocaleString("ru-RU")} ₸ | ИПН: ${ctx.taxes.ipnDue.toLocaleString("ru-RU")} ₸ | КПН: ${ctx.taxes.citDue.toLocaleString("ru-RU")} ₸ | Соц.: ${ctx.taxes.socialDue.toLocaleString("ru-RU")} ₸`);
  if (ctx.taxes.nextFnoDeadlines.length > 0) {
    lines.push(`  Ближайшие ФНО:`);
    ctx.taxes.nextFnoDeadlines.forEach(d => {
      lines.push(`    • ${d.form}: до ${d.deadline} (${d.daysLeft} дн.)`);
    });
  }
  lines.push("");
  lines.push("📦 СКЛАД:");
  lines.push(`  Стоимость остатков: ${ctx.inventory.totalValue.toLocaleString("ru-RU")} ₸ (${ctx.inventory.totalItems} позиций)`);
  if (ctx.inventory.lowStockItems.length > 0) {
    lines.push(`  ⚠ ${ctx.inventory.lowStockItems.length} позиций ниже минимума: ${ctx.inventory.lowStockItems.slice(0, 3).map(i => `${i.name} (${i.qty}/${i.min})`).join(", ")}`);
  }
  if (ctx.inventory.expired.length > 0) {
    lines.push(`  ❌ Просрочено партий: ${ctx.inventory.expired.length}`);
  }
  if (ctx.inventory.expiringSoon.length > 0) {
    lines.push(`  ⏰ Истекают в 30 дней: ${ctx.inventory.expiringSoon.length} партий`);
  }
  lines.push("");
  lines.push("👥 КАДРЫ:");
  lines.push(`  Сотрудников: ${ctx.hr.activeEmployees}/${ctx.hr.employeesCount} | Месячный ФОТ: ${ctx.hr.payrollMonthly.toLocaleString("ru-RU")} ₸`);
  if (ctx.hr.upcomingVacations.length > 0) {
    lines.push(`  Отпуска: ${ctx.hr.upcomingVacations.slice(0, 3).map(v => `${v.employee} (${v.start} — ${v.end})`).join("; ")}`);
  }
  lines.push("");
  lines.push("📋 ДОКУМЕНТЫ И ПЛАТЕЖИ:");
  if (ctx.documents.draftCount > 0) lines.push(`  ⚠ Непроведённых документов: ${ctx.documents.draftCount}`);
  if (ctx.documents.overdueByCustomers.length > 0) {
    const total = ctx.documents.overdueByCustomers.reduce((a, c) => a + c.amount, 0);
    lines.push(`  Просрочка от клиентов: ${ctx.documents.overdueByCustomers.length} счетов на ${total.toLocaleString("ru-RU")} ₸`);
  }
  if (ctx.recurring.overduePayments.length > 0) {
    const total = ctx.recurring.overduePayments.reduce((a, p) => a + p.amount, 0);
    lines.push(`  Просроченные нами: ${ctx.recurring.overduePayments.length} на ${total.toLocaleString("ru-RU")} ₸`);
  }
  if (ctx.recurring.upcomingPayments.length > 0) {
    lines.push(`  Ближайшие платежи (30 дн.): ${ctx.recurring.upcomingPayments.length}`);
  }
  lines.push("");
  lines.push("📅 СЕГОДНЯ:");
  lines.push(`  Документов создано: ${ctx.recentActivity.todayDocs} | Проводок: ${ctx.recentActivity.todayEntries}`);

  return lines.join("\n");
}
