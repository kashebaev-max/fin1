// AI-actions: интерпретатор и исполнитель действий Жанары.
// Получает структурированное "намерение" от AI, показывает пользователю
// карточку подтверждения, и при подтверждении — выполняет.

import { SupabaseClient } from "@supabase/supabase-js";

// ═══ ТИПЫ ДЕЙСТВИЙ ═══

export type ActionType =
  | "create_journal_entry"
  | "create_invoice"
  | "create_payment"
  | "create_counterparty"
  | "create_employee_payment"
  | "mark_paid"
  | "dismiss_notification"
  | "run_depreciation"
  | "create_recurring_payment";

export interface AIAction {
  type: ActionType;
  description: string; // Человекочитаемое описание для подтверждения
  payload: any; // Параметры действия
  riskLevel: "low" | "medium" | "high"; // low = автоматически можно, high = двойное подтверждение
}

// ═══ ОПИСАНИЯ ДЕЙСТВИЙ (для system prompt) ═══

export const ACTION_DEFINITIONS = `
ДОСТУПНЫЕ ДЕЙСТВИЯ (только эти, никаких других):

1. create_journal_entry — создать бухгалтерскую проводку
   payload: {
     entry_date: "YYYY-MM-DD",
     debit_account: "1010",  // номер счёта
     credit_account: "5010",
     amount: 100000,
     description: "Внесение уставного капитала",
     doc_ref: "опц"  // ссылка на документ
   }

2. create_counterparty — добавить контрагента
   payload: {
     name: "ТОО Альфа",
     bin: "120340000000",  // 12 цифр или null
     counterparty_type: "client" | "supplier" | "both",
     phone: "опц",
     email: "опц",
     address: "опц"
   }

3. create_recurring_payment — добавить регулярный платёж
   payload: {
     description: "Аренда офиса",
     counterparty_name: "ТОО Арендодатель",
     amount: 250000,
     scheduled_date: "YYYY-MM-DD",
     payment_type: "outgoing" | "incoming"
   }

4. mark_paid — отметить платёж/счёт как оплаченный
   payload: {
     entity_type: "invoice" | "payment_schedule",
     entity_id: "uuid",
     payment_method: "cash" | "bank",
     paid_date: "YYYY-MM-DD"
   }

5. run_depreciation — запустить начисление амортизации за месяц
   payload: {
     period_month: 1-12,
     period_year: 2026
   }

6. dismiss_notification — отметить уведомление прочитанным/скрытым
   payload: {
     notification_id: "uuid",
     dismiss: true | false
   }

ВАЖНО:
- Если пользователь просит что-то, чего нет в этом списке — отвечай в чате обычным образом, не предлагай действие
- Числа в payload — это число (number), без кавычек, без пробелов, без символа ₸
- Даты — строго формат YYYY-MM-DD
- Если данных недостаточно (например, не указана сумма) — задай уточняющий вопрос в обычном чате, не возвращай действие
- Не выдумывай данные — используй то что в контексте бизнеса или то что пользователь сказал

ФОРМАТ ОТВЕТА КОГДА ЕСТЬ ДЕЙСТВИЕ:
В конце своего обычного текстового ответа добавь блок:

\`\`\`action
{
  "type": "create_journal_entry",
  "description": "Создать проводку Дт 1010 Кт 5010 на 100 000 ₸ — внесение уставного капитала",
  "payload": { ... },
  "riskLevel": "low"
}
\`\`\`

Только ОДИН блок на ответ. Не предлагай несколько действий за раз.

riskLevel:
- low: добавление контрагента, простая проводка <100 000 ₸
- medium: проводка 100k-1M, отметка оплаты, регулярный платёж
- high: проводка >1M, амортизация, массовые операции
`;

// ═══ ПАРСИНГ ДЕЙСТВИЯ ИЗ ОТВЕТА AI ═══

export function parseActionFromReply(reply: string): { textBefore: string; action: AIAction | null } {
  // Ищем блок ```action ... ``` в ответе
  const actionMatch = reply.match(/```action\s*([\s\S]+?)\s*```/);
  if (!actionMatch) return { textBefore: reply, action: null };

  const textBefore = reply.slice(0, actionMatch.index).trim();
  try {
    const action = JSON.parse(actionMatch[1].trim()) as AIAction;
    // Базовая валидация
    if (!action.type || !action.description || !action.payload) {
      return { textBefore: reply, action: null };
    }
    if (!action.riskLevel) action.riskLevel = "medium";
    return { textBefore, action };
  } catch {
    return { textBefore: reply, action: null };
  }
}

// ═══ ИСПОЛНИТЕЛЬ ДЕЙСТВИЙ ═══

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  entityType?: string;
  entityId?: string;
}

export async function executeAction(
  supabase: SupabaseClient,
  userId: string,
  action: AIAction
): Promise<ExecutionResult> {
  try {
    switch (action.type) {
      case "create_journal_entry":
        return await executeJournalEntry(supabase, userId, action.payload);

      case "create_counterparty":
        return await executeCreateCounterparty(supabase, userId, action.payload);

      case "create_recurring_payment":
        return await executeCreateRecurringPayment(supabase, userId, action.payload);

      case "mark_paid":
        return await executeMarkPaid(supabase, userId, action.payload);

      case "run_depreciation":
        return await executeRunDepreciation(supabase, userId, action.payload);

      case "dismiss_notification":
        return await executeDismissNotification(supabase, userId, action.payload);

      default:
        return { success: false, message: `Неподдерживаемый тип действия: ${action.type}` };
    }
  } catch (err: any) {
    return { success: false, message: `Ошибка выполнения: ${err.message || err}` };
  }
}

// ═══ КОНКРЕТНЫЕ ИСПОЛНИТЕЛИ ═══

async function executeJournalEntry(supabase: SupabaseClient, userId: string, p: any): Promise<ExecutionResult> {
  if (!p.entry_date || !p.debit_account || !p.credit_account || !p.amount) {
    return { success: false, message: "Не хватает обязательных полей: дата, Дт, Кт, сумма" };
  }
  const { data, error } = await supabase.from("journal_entries").insert({
    user_id: userId,
    entry_date: p.entry_date,
    debit_account: String(p.debit_account),
    credit_account: String(p.credit_account),
    amount: Number(p.amount),
    description: p.description || null,
    doc_ref: p.doc_ref || null,
  }).select().single();

  if (error) return { success: false, message: error.message };
  return {
    success: true,
    message: `✅ Создана проводка Дт ${p.debit_account} Кт ${p.credit_account} на ${Number(p.amount).toLocaleString("ru-RU")} ₸`,
    entityType: "journal_entry",
    entityId: data.id,
  };
}

async function executeCreateCounterparty(supabase: SupabaseClient, userId: string, p: any): Promise<ExecutionResult> {
  if (!p.name) return { success: false, message: "Не указано наименование" };

  const { data, error } = await supabase.from("counterparties").insert({
    user_id: userId,
    name: p.name,
    bin: p.bin || null,
    counterparty_type: p.counterparty_type || "client",
    phone: p.phone || null,
    email: p.email || null,
    address: p.address || null,
    is_active: true,
  }).select().single();

  if (error) return { success: false, message: error.message };
  return {
    success: true,
    message: `✅ Контрагент «${p.name}» добавлен`,
    entityType: "counterparty",
    entityId: data.id,
  };
}

async function executeCreateRecurringPayment(supabase: SupabaseClient, userId: string, p: any): Promise<ExecutionResult> {
  if (!p.description || !p.amount || !p.scheduled_date) {
    return { success: false, message: "Не хватает: описание, сумма, дата" };
  }
  const { data, error } = await supabase.from("payment_schedules").insert({
    user_id: userId,
    description: p.description,
    counterparty_name: p.counterparty_name || null,
    amount: Number(p.amount),
    scheduled_date: p.scheduled_date,
    payment_type: p.payment_type || "outgoing",
    status: "pending",
  }).select().single();

  if (error) return { success: false, message: error.message };
  return {
    success: true,
    message: `✅ Платёж «${p.description}» на ${Number(p.amount).toLocaleString("ru-RU")} ₸ запланирован на ${p.scheduled_date}`,
    entityType: "payment_schedule",
    entityId: data.id,
  };
}

async function executeMarkPaid(supabase: SupabaseClient, userId: string, p: any): Promise<ExecutionResult> {
  if (!p.entity_id || !p.entity_type) {
    return { success: false, message: "Не указано что отмечать" };
  }
  const today = p.paid_date || new Date().toISOString().slice(0, 10);

  if (p.entity_type === "payment_schedule") {
    const { error } = await supabase.from("payment_schedules").update({
      status: "paid",
      paid_date: today,
      paid_method: p.payment_method || "bank",
    }).eq("id", p.entity_id).eq("user_id", userId);
    if (error) return { success: false, message: error.message };
    return { success: true, message: `✅ Платёж отмечен оплаченным`, entityType: "payment_schedule", entityId: p.entity_id };
  }

  return { success: false, message: `Неподдерживаемый тип сущности: ${p.entity_type}` };
}

async function executeRunDepreciation(supabase: SupabaseClient, userId: string, p: any): Promise<ExecutionResult> {
  const { data: assets } = await supabase.from("fixed_assets")
    .select("*").eq("user_id", userId).eq("is_active", true);
  if (!assets || assets.length === 0) return { success: true, message: "Нет активных ОС для амортизации" };

  let processed = 0;
  let totalDep = 0;
  const today = new Date().toISOString().slice(0, 10);
  const month = p.period_month || new Date().getMonth() + 1;
  const year = p.period_year || new Date().getFullYear();
  const period = `${year}-${String(month).padStart(2, "0")}`;

  for (const a of assets) {
    const monthly = Number(a.monthly_depreciation || 0);
    if (monthly <= 0) continue;
    const newAcc = Number(a.accumulated_depreciation || 0) + monthly;
    if (newAcc >= Number(a.initial_cost || 0)) continue;

    await supabase.from("fixed_assets").update({
      accumulated_depreciation: newAcc,
      residual_value: Number(a.initial_cost) - newAcc,
    }).eq("id", a.id);

    await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: today,
      doc_ref: `Аморт-${period}`,
      debit_account: "7210",
      credit_account: "2420",
      amount: monthly,
      description: `Амортизация ОС: ${a.name}`,
    });

    totalDep += monthly;
    processed++;
  }

  return {
    success: true,
    message: `✅ Начислена амортизация по ${processed} ОС за ${period} на ${totalDep.toLocaleString("ru-RU")} ₸`,
    data: { processed, totalDep, period },
  };
}

async function executeDismissNotification(supabase: SupabaseClient, userId: string, p: any): Promise<ExecutionResult> {
  if (!p.notification_id) return { success: false, message: "Не указан ID уведомления" };
  const { error } = await supabase.from("notifications")
    .update({ is_dismissed: !!p.dismiss })
    .eq("id", p.notification_id)
    .eq("user_id", userId);
  if (error) return { success: false, message: error.message };
  return { success: true, message: p.dismiss ? "✅ Уведомление скрыто" : "✅ Уведомление возвращено" };
}

// ═══ ЛОГИРОВАНИЕ ═══

export async function logProposed(
  supabase: SupabaseClient,
  userId: string,
  userRequest: string,
  action: AIAction,
  module: string
): Promise<string | null> {
  const { data } = await supabase.from("ai_actions_log").insert({
    user_id: userId,
    action_type: action.type,
    user_request: userRequest,
    proposed_action: action as any,
    triggered_from_module: module,
    status: "proposed",
  }).select("id").single();
  return data?.id || null;
}

export async function logExecuted(
  supabase: SupabaseClient,
  logId: string,
  result: ExecutionResult
) {
  await supabase.from("ai_actions_log").update({
    status: result.success ? "executed" : "failed",
    result_summary: result.message,
    result_data: result.data || null,
    error_message: result.success ? null : result.message,
    related_entity_type: result.entityType || null,
    related_entity_id: result.entityId || null,
    confirmed_at: new Date().toISOString(),
    executed_at: new Date().toISOString(),
  }).eq("id", logId);
}

export async function logRejected(supabase: SupabaseClient, logId: string) {
  await supabase.from("ai_actions_log").update({
    status: "rejected",
    confirmed_at: new Date().toISOString(),
  }).eq("id", logId);
}
