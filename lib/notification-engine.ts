// Автоматический генератор уведомлений.
// Запускается при загрузке dashboard и проверяет критичные ситуации.
// Использует правила (быстро, без AI). AI-проверка — отдельно.

import { SupabaseClient } from "@supabase/supabase-js";
import { collectBusinessContext, BusinessContext } from "./ai-context";

interface NotificationDraft {
  category: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  relatedModule?: string;
  dedup_key?: string; // уникальный ключ, чтобы не дублировать
  expires_at?: string;
}

const TODAY = () => new Date().toISOString().slice(0, 10);
const NOW = () => new Date();

function daysFromNow(date: string): number {
  const today = new Date(TODAY());
  const target = new Date(date);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString("ru-RU") + " ₸";
}

// ═══ ПРАВИЛА ═══

function checkTaxDeadlines(ctx: BusinessContext): NotificationDraft[] {
  const result: NotificationDraft[] = [];
  const now = NOW();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  for (const deadline of ctx.taxes.nextFnoDeadlines) {
    const days = deadline.daysLeft;
    let severity: "critical" | "warning" | "info" = "info";
    if (days <= 2) severity = "critical";
    else if (days <= 7) severity = "warning";
    else if (days > 14) continue; // не уведомляем, если ещё много

    const formKey = deadline.form.replace(/[^а-яёa-z0-9]/gi, "_").toLowerCase();
    result.push({
      category: "tax_deadline",
      severity,
      title: `${deadline.form}: осталось ${days} дн.`,
      message: `Срок сдачи ${deadline.deadline}. Не забудьте сформировать декларацию.`,
      actionLabel: "Открыть отчёты ФНО",
      actionUrl: "/dashboard/reports",
      relatedModule: "reports",
      dedup_key: `fno_${formKey}_${yearMonth}`,
      expires_at: new Date(deadline.deadline).toISOString(),
    });
  }

  // Налоги к уплате
  if (ctx.taxes.vatDue > 0) {
    result.push({
      category: "tax_deadline",
      severity: ctx.taxes.vatDue > 1000000 ? "warning" : "info",
      title: `НДС к уплате: ${formatMoney(ctx.taxes.vatDue)}`,
      message: "Накоплена задолженность по НДС. Подготовьте платёж до сдачи декларации.",
      actionLabel: "Перейти в банк",
      actionUrl: "/dashboard/bank",
      relatedModule: "bank",
      dedup_key: `tax_vat_${yearMonth}`,
    });
  }
  if (ctx.taxes.ipnDue > 0) {
    result.push({
      category: "tax_deadline",
      severity: "info",
      title: `ИПН к уплате: ${formatMoney(ctx.taxes.ipnDue)}`,
      message: "Удержанный с зарплат ИПН готов к перечислению.",
      actionLabel: "Перейти в банк",
      actionUrl: "/dashboard/bank",
      relatedModule: "bank",
      dedup_key: `tax_ipn_${yearMonth}`,
    });
  }

  return result;
}

function checkCashFlow(ctx: BusinessContext): NotificationDraft[] {
  const result: NotificationDraft[] = [];
  const yearMonth = NOW().toISOString().slice(0, 7);

  // Низкая ликвидность относительно обязательств
  const liquid = ctx.finance.totalLiquid;
  const totalDue = ctx.finance.payables + ctx.taxes.vatDue + ctx.taxes.ipnDue + ctx.taxes.citDue + ctx.taxes.socialDue;

  if (totalDue > 0 && liquid < totalDue * 0.5 && liquid < totalDue) {
    result.push({
      category: "cashflow",
      severity: "warning",
      title: `Денег может не хватить на обязательства`,
      message: `Свободные средства: ${formatMoney(liquid)}. К уплате: ${formatMoney(totalDue)} (поставщики + налоги). Кассовый разрыв возможен.`,
      actionLabel: "Управленческие отчёты",
      actionUrl: "/dashboard/management-reports",
      relatedModule: "management-reports",
      dedup_key: `cashflow_warn_${yearMonth}`,
    });
  }

  // Слишком много дебиторки
  if (ctx.finance.receivables > liquid * 2 && ctx.finance.receivables > 1000000) {
    result.push({
      category: "cashflow",
      severity: "warning",
      title: `Большая дебиторка: ${formatMoney(ctx.finance.receivables)}`,
      message: `Дебиторская задолженность в 2+ раза больше свободных средств. Проверьте, не пора ли напомнить клиентам об оплате.`,
      actionLabel: "Открыть заказы",
      actionUrl: "/dashboard/orders",
      relatedModule: "orders",
      dedup_key: `large_receivables_${yearMonth}`,
    });
  }

  return result;
}

function checkOverduePayments(ctx: BusinessContext): NotificationDraft[] {
  const result: NotificationDraft[] = [];

  if (ctx.documents.overdueByCustomers.length > 0) {
    const total = ctx.documents.overdueByCustomers.reduce((a, c) => a + c.amount, 0);
    const worst = ctx.documents.overdueByCustomers[0];
    result.push({
      category: "overdue_receivable",
      severity: total > 1000000 ? "critical" : "warning",
      title: `Просрочка от ${ctx.documents.overdueByCustomers.length} клиентов: ${formatMoney(total)}`,
      message: `Самая большая: ${worst.client} — ${formatMoney(worst.amount)} (просрочка ${worst.daysOverdue} дн.). Свяжитесь и напомните.`,
      actionLabel: "Открыть CRM",
      actionUrl: "/dashboard/crm",
      relatedModule: "crm",
      dedup_key: `overdue_recv_${TODAY()}`,
    });
  }

  if (ctx.recurring.overduePayments.length > 0) {
    const total = ctx.recurring.overduePayments.reduce((a, p) => a + p.amount, 0);
    result.push({
      category: "overdue_payable",
      severity: "warning",
      title: `${ctx.recurring.overduePayments.length} просроченных платежей нам`,
      message: `Не оплачено вовремя на ${formatMoney(total)}. Это может ухудшить отношения с поставщиками и привести к пеням.`,
      actionLabel: "Регулярные платежи",
      actionUrl: "/dashboard/recurring",
      relatedModule: "recurring",
      dedup_key: `overdue_pay_${TODAY()}`,
    });
  }

  return result;
}

function checkInventory(ctx: BusinessContext): NotificationDraft[] {
  const result: NotificationDraft[] = [];

  if (ctx.inventory.expired.length > 0) {
    result.push({
      category: "expired_batch",
      severity: "critical",
      title: `${ctx.inventory.expired.length} партий просрочены`,
      message: `Эти товары нельзя продавать — нужно списать. Просрочка от ${ctx.inventory.expired[0].daysOverdue} дн.`,
      actionLabel: "Партионный учёт",
      actionUrl: "/dashboard/batches",
      relatedModule: "batches",
      dedup_key: `expired_batches_${TODAY()}`,
    });
  }

  if (ctx.inventory.expiringSoon.length > 0) {
    const soonest = ctx.inventory.expiringSoon[0];
    result.push({
      category: "expiring_batch",
      severity: soonest.daysLeft <= 7 ? "warning" : "info",
      title: `${ctx.inventory.expiringSoon.length} партий истекают в 30 дней`,
      message: `Ближайшая: ${soonest.name} — через ${soonest.daysLeft} дн. Проведите распродажу или акцию.`,
      actionLabel: "Партионный учёт",
      actionUrl: "/dashboard/batches",
      relatedModule: "batches",
      dedup_key: `expiring_batches_${TODAY()}`,
    });
  }

  if (ctx.inventory.lowStockItems.length > 0) {
    const worst = ctx.inventory.lowStockItems[0];
    result.push({
      category: "low_stock",
      severity: worst.qty === 0 ? "warning" : "info",
      title: `${ctx.inventory.lowStockItems.length} позиций ниже минимума`,
      message: `Например: ${worst.name} (остаток ${worst.qty}, минимум ${worst.min}). Время заказать у поставщиков.`,
      actionLabel: "Номенклатура",
      actionUrl: "/dashboard/nomenclature",
      relatedModule: "nomenclature",
      dedup_key: `low_stock_${TODAY()}`,
    });
  }

  return result;
}

function checkDocuments(ctx: BusinessContext): NotificationDraft[] {
  const result: NotificationDraft[] = [];
  const yearMonth = NOW().toISOString().slice(0, 7);

  if (ctx.documents.draftCount >= 5) {
    result.push({
      category: "unposted_doc",
      severity: ctx.documents.draftCount >= 20 ? "warning" : "info",
      title: `${ctx.documents.draftCount} непроведённых документов`,
      message: `Их нужно проверить и провести, иначе они не попадут в учёт и отчётность.`,
      actionLabel: "Документы",
      actionUrl: "/dashboard/documents",
      relatedModule: "documents",
      dedup_key: `unposted_${yearMonth}`,
    });
  }

  return result;
}

function checkSalaryDue(ctx: BusinessContext): NotificationDraft[] {
  const result: NotificationDraft[] = [];
  const dayOfMonth = NOW().getDate();
  const yearMonth = NOW().toISOString().slice(0, 7);

  if (ctx.hr.activeEmployees > 0) {
    // Аванс — 15-го (за 2-3 дня до)
    if (dayOfMonth >= 12 && dayOfMonth <= 14) {
      result.push({
        category: "salary_due",
        severity: dayOfMonth === 14 ? "warning" : "info",
        title: `Скоро аванс — 15-го числа`,
        message: `${ctx.hr.activeEmployees} сотрудников ждут выплату. Проверьте табель и подготовьте деньги.`,
        actionLabel: "Кадры и ЗП",
        actionUrl: "/dashboard/hr",
        relatedModule: "hr",
        dedup_key: `salary_advance_${yearMonth}`,
      });
    }
    // Окончательная — 5-го следующего месяца (за 2-3 дня до)
    if (dayOfMonth >= 2 && dayOfMonth <= 4) {
      result.push({
        category: "salary_due",
        severity: dayOfMonth === 4 ? "warning" : "info",
        title: `Скоро срок выплаты ЗП — 5-го числа`,
        message: `Окончательный расчёт за прошлый месяц для ${ctx.hr.activeEmployees} сотрудников.`,
        actionLabel: "Кадры и ЗП",
        actionUrl: "/dashboard/hr",
        relatedModule: "hr",
        dedup_key: `salary_final_${yearMonth}`,
      });
    }
  }

  return result;
}

function checkPositive(ctx: BusinessContext): NotificationDraft[] {
  const result: NotificationDraft[] = [];

  // Если всё хорошо и нет других уведомлений — мотивирующее success
  // (Эта функция вызывается только если массив других уведомлений пустой)
  return [
    {
      category: "general",
      severity: "success",
      title: `Всё в порядке`,
      message: `Жанара проверила бизнес — критичных проблем не найдено. Так держать!`,
      dedup_key: `all_good_${TODAY()}`,
      expires_at: new Date(Date.now() + 86400000).toISOString(), // на день
    },
  ];
}

// ═══ ГЛАВНАЯ ФУНКЦИЯ ═══

export async function generateRuleBasedNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<{ created: number; skipped: number }> {
  // 1. Собираем контекст
  const ctx = await collectBusinessContext(supabase, userId);

  // 2. Применяем все правила
  const drafts: NotificationDraft[] = [
    ...checkTaxDeadlines(ctx),
    ...checkCashFlow(ctx),
    ...checkOverduePayments(ctx),
    ...checkInventory(ctx),
    ...checkDocuments(ctx),
    ...checkSalaryDue(ctx),
  ];

  // 3. Если нет проблем — добавляем success
  const hasCriticalOrWarning = drafts.some(d => d.severity === "critical" || d.severity === "warning");
  if (!hasCriticalOrWarning && drafts.length === 0) {
    drafts.push(...checkPositive(ctx));
  }

  // 4. Получаем существующие активные dedup_keys
  const { data: existing } = await supabase
    .from("notifications")
    .select("dedup_key")
    .eq("user_id", userId)
    .eq("is_dismissed", false)
    .not("dedup_key", "is", null);

  const existingKeys = new Set((existing || []).map(n => n.dedup_key));

  // 5. Фильтруем — оставляем только новые
  const toInsert = drafts.filter(d => !d.dedup_key || !existingKeys.has(d.dedup_key));

  let created = 0;
  if (toInsert.length > 0) {
    const records = toInsert.map(d => ({
      user_id: userId,
      source: "system" as const,
      category: d.category,
      severity: d.severity,
      title: d.title,
      message: d.message,
      action_label: d.actionLabel || null,
      action_url: d.actionUrl || null,
      related_module: d.relatedModule || null,
      dedup_key: d.dedup_key || null,
      expires_at: d.expires_at || null,
    }));
    const { data: inserted } = await supabase.from("notifications").insert(records).select();
    created = inserted?.length || 0;
  }

  // 6. Обновляем notification_runs
  await supabase.from("notification_runs").upsert({
    user_id: userId,
    last_check_at: new Date().toISOString(),
    notifications_created: created,
  }, { onConflict: "user_id" });

  return { created, skipped: drafts.length - toInsert.length };
}

// Должна ли запускаться проверка (раз в час максимум)
export async function shouldRunCheck(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("notification_runs")
    .select("last_check_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return true;
  const lastCheck = new Date(data.last_check_at);
  const minutesAgo = (Date.now() - lastCheck.getTime()) / 60000;
  return minutesAgo >= 60;
}
