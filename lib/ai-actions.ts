// Полный реестр AI-действий с УСТОЙЧИВОЙ К ОТСУТСТВИЮ ПОЛЕЙ логикой.
// Если в схеме БД нет какого-то поля — оно просто не передаётся.

import type { SupabaseClient } from "@supabase/supabase-js";

export type RiskLevel = "low" | "medium" | "high";

export interface AIActionParam {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "enum";
  required: boolean;
  description: string;
  enum_values?: string[];
  default?: any;
}

export interface AIAction {
  key: string;
  category: string;
  icon: string;
  name: string;
  description: string;
  risk: RiskLevel;
  params: AIActionParam[];
  ai_description: string;
  executor: (supabase: SupabaseClient, userId: string, params: any) => Promise<{
    success: boolean;
    message: string;
    data?: any;
  }>;
}

// ═══════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function logAction(
  supabase: SupabaseClient,
  userId: string,
  actionKey: string,
  params: any,
  result: any
) {
  try {
    await supabase.from("ai_actions_log").insert({
      user_id: userId,
      action_key: actionKey,
      params,
      result,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to log AI action:", e);
  }
}

// Удаляет undefined/null значения из объекта
function cleanObject(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in obj) {
    const val = obj[key];
    if (val !== undefined && val !== null && val !== "") {
      result[key] = val;
    }
  }
  return result;
}

// Умная вставка: пробует вставить, если ошибка из-за поля — удаляет его и пробует снова
async function smartInsert(
  supabase: SupabaseClient,
  table: string,
  data: Record<string, any>,
  maxRetries: number = 5
): Promise<{ success: boolean; data?: any; error?: string }> {
  let currentData = cleanObject(data);
  let attempts = 0;

  while (attempts < maxRetries) {
    const result = await supabase.from(table).insert(currentData).select().single();
    
    if (!result.error) {
      return { success: true, data: result.data };
    }

    const errMsg = result.error.message || "";
    
    // Парсим имя поля из ошибки PostgreSQL
    // "Could not find the 'X' column of 'Y' in the schema cache"
    // "column \"X\" of relation \"Y\" does not exist"
    const fieldMatch = errMsg.match(/['"]([\w_]+)['"]\s+(?:column|of)/i)
                   || errMsg.match(/column\s+['"]([\w_]+)['"]/i)
                   || errMsg.match(/'([\w_]+)' column/i);
    
    if (fieldMatch && fieldMatch[1] && currentData[fieldMatch[1]] !== undefined) {
      // Удаляем проблемное поле и пробуем снова
      const fieldToRemove = fieldMatch[1];
      const newData = { ...currentData };
      delete newData[fieldToRemove];
      currentData = newData;
      attempts++;
      console.warn(`smartInsert: removed field "${fieldToRemove}" from ${table} insert (attempt ${attempts})`);
      continue;
    }
    
    // Не удалось распарсить ошибку — возвращаем как есть
    return { success: false, error: errMsg };
  }

  return { success: false, error: "Превышено количество попыток вставки" };
}

// ═══════════════════════════════════════════
// 1. КОНТРАГЕНТЫ
// ═══════════════════════════════════════════

const createCounterparty: AIAction = {
  key: "create_counterparty",
  category: "Контрагенты",
  icon: "👥",
  name: "Создать контрагента",
  description: "Добавляет нового клиента или поставщика в справочник",
  risk: "low",
  ai_description: "Use this to create a new counterparty (client or supplier). Required: name. Optional: bin, type, address, phone, email, director_name.",
  params: [
    { name: "name", type: "string", required: true, description: "Наименование организации" },
    { name: "bin", type: "string", required: false, description: "БИН/ИИН (12 цифр)" },
    { name: "counterparty_type", type: "enum", required: false, description: "Тип контрагента", enum_values: ["client", "supplier", "both"], default: "both" },
    { name: "address", type: "string", required: false, description: "Юридический адрес" },
    { name: "phone", type: "string", required: false, description: "Телефон" },
    { name: "email", type: "string", required: false, description: "Email" },
    { name: "director_name", type: "string", required: false, description: "ФИО директора" },
  ],
  executor: async (supabase, userId, params) => {
    if (!params.name) return { success: false, message: "Не указано наименование" };

    const { data: existing } = await supabase
      .from("counterparties")
      .select("id, name")
      .eq("user_id", userId)
      .ilike("name", params.name)
      .maybeSingle();

    if (existing) {
      return { success: false, message: `Контрагент «${params.name}» уже существует (ID: ${existing.id.slice(0, 8)})` };
    }

    const result = await smartInsert(supabase, "counterparties", {
      user_id: userId,
      name: params.name,
      bin: params.bin,
      counterparty_type: params.counterparty_type || "both",
      address: params.address,
      phone: params.phone,
      email: params.email,
      director_name: params.director_name,
      is_active: true,
    });

    if (!result.success) return { success: false, message: `Ошибка: ${result.error}` };

    await logAction(supabase, userId, "create_counterparty", params, { id: result.data.id });
    return { success: true, message: `✅ Контрагент «${params.name}» создан`, data: result.data };
  },
};

// ═══════════════════════════════════════════
// 2. НОМЕНКЛАТУРА (товары/услуги)
// ═══════════════════════════════════════════

const createNomenclature: AIAction = {
  key: "create_nomenclature",
  category: "Номенклатура",
  icon: "📦",
  name: "Создать товар/услугу",
  description: "Добавляет товар или услугу в справочник",
  risk: "low",
  ai_description: "Use this to create a new product or service. Required: name. Specify type='service' for services or type='product' for goods.",
  params: [
    { name: "name", type: "string", required: true, description: "Наименование" },
    { name: "code", type: "string", required: false, description: "Артикул/код" },
    { name: "unit", type: "string", required: false, description: "Единица измерения", default: "шт" },
    { name: "purchase_price", type: "number", required: false, description: "Цена закупки" },
    { name: "sale_price", type: "number", required: false, description: "Цена продажи" },
    { name: "quantity", type: "number", required: false, description: "Текущий остаток", default: 0 },
    { name: "vat_rate", type: "number", required: false, description: "Ставка НДС (%)", default: 16 },
    { name: "category", type: "string", required: false, description: "Категория/группа" },
    { name: "min_stock", type: "number", required: false, description: "Минимальный остаток" },
    { name: "type", type: "enum", required: false, description: "Тип: товар или услуга", enum_values: ["product", "service"], default: "product" },
  ],
  executor: async (supabase, userId, params) => {
    if (!params.name) return { success: false, message: "Не указано наименование" };

    const { data: existing } = await supabase
      .from("nomenclature")
      .select("id, name")
      .eq("user_id", userId)
      .ilike("name", params.name)
      .maybeSingle();

    if (existing) {
      return { success: false, message: `Товар/услуга «${params.name}» уже существует` };
    }

    const result = await smartInsert(supabase, "nomenclature", {
      user_id: userId,
      name: params.name,
      code: params.code,
      unit: params.unit || "шт",
      purchase_price: params.purchase_price,
      sale_price: params.sale_price,
      quantity: params.quantity || 0,
      vat_rate: params.vat_rate ?? 16,
      category: params.category,
      min_stock: params.min_stock,
      type: params.type || "product",
    });

    if (!result.success) return { success: false, message: `Ошибка: ${result.error}` };

    await logAction(supabase, userId, "create_nomenclature", params, { id: result.data.id });
    return { 
      success: true, 
      message: `✅ ${params.type === "service" ? "Услуга" : "Товар"} «${params.name}» создан${params.type === "service" ? "а" : ""}`, 
      data: result.data 
    };
  },
};

// ═══════════════════════════════════════════
// 3. СОТРУДНИКИ
// ═══════════════════════════════════════════

const createEmployee: AIAction = {
  key: "create_employee",
  category: "Кадры",
  icon: "👤",
  name: "Принять сотрудника",
  description: "Добавляет нового сотрудника в штат",
  risk: "medium",
  ai_description: "Use this to add a new employee. Required: full_name. Recommended: iin, position, salary, hire_date.",
  params: [
    { name: "full_name", type: "string", required: true, description: "ФИО" },
    { name: "iin", type: "string", required: false, description: "ИИН (12 цифр)" },
    { name: "position", type: "string", required: false, description: "Должность" },
    { name: "department", type: "string", required: false, description: "Подразделение" },
    { name: "salary", type: "number", required: false, description: "Оклад" },
    { name: "hire_date", type: "date", required: false, description: "Дата приёма" },
    { name: "phone", type: "string", required: false, description: "Телефон" },
    { name: "email", type: "string", required: false, description: "Email" },
  ],
  executor: async (supabase, userId, params) => {
    if (!params.full_name) return { success: false, message: "Не указано ФИО" };

    if (params.iin) {
      const { data: existing } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("user_id", userId)
        .eq("iin", params.iin)
        .maybeSingle();
      if (existing) {
        return { success: false, message: `Сотрудник с ИИН ${params.iin} уже есть: «${existing.full_name}»` };
      }
    }

    const result = await smartInsert(supabase, "employees", {
      user_id: userId,
      full_name: params.full_name,
      iin: params.iin,
      position: params.position,
      department: params.department,
      salary: params.salary || 0,
      hire_date: params.hire_date || todayDate(),
      phone: params.phone,
      email: params.email,
      is_active: true,
    });

    if (!result.success) return { success: false, message: `Ошибка: ${result.error}` };

    await logAction(supabase, userId, "create_employee", params, { id: result.data.id });
    return { success: true, message: `✅ Сотрудник «${params.full_name}» принят на работу`, data: result.data };
  },
};

// ═══════════════════════════════════════════
// 4. БУХГАЛТЕРСКИЕ ПРОВОДКИ
// ═══════════════════════════════════════════

const createJournalEntry: AIAction = {
  key: "create_journal_entry",
  category: "Бухгалтерия",
  icon: "📒",
  name: "Создать проводку",
  description: "Создаёт бухгалтерскую проводку Дебет/Кредит",
  risk: "medium",
  ai_description: "Create accounting journal entry. Required: entry_date, debit_account, credit_account, amount, description.",
  params: [
    { name: "entry_date", type: "date", required: true, description: "Дата проводки" },
    { name: "debit_account", type: "string", required: true, description: "Счёт Дебет" },
    { name: "credit_account", type: "string", required: true, description: "Счёт Кредит" },
    { name: "amount", type: "number", required: true, description: "Сумма" },
    { name: "description", type: "string", required: true, description: "Содержание операции" },
    { name: "doc_ref", type: "string", required: false, description: "Ссылка на документ" },
  ],
  executor: async (supabase, userId, params) => {
    if (!params.entry_date || !params.debit_account || !params.credit_account || !params.amount || !params.description) {
      return { success: false, message: "Не все обязательные поля заполнены" };
    }

    const result = await smartInsert(supabase, "journal_entries", {
      user_id: userId,
      entry_date: params.entry_date,
      debit_account: String(params.debit_account),
      credit_account: String(params.credit_account),
      amount: Number(params.amount),
      description: params.description,
      doc_ref: params.doc_ref,
    });

    if (!result.success) return { success: false, message: `Ошибка: ${result.error}` };

    await logAction(supabase, userId, "create_journal_entry", params, { id: result.data.id });
    return { 
      success: true, 
      message: `✅ Проводка создана: Дт ${params.debit_account} Кт ${params.credit_account} на ${Number(params.amount).toLocaleString("ru-RU")} ₸`, 
      data: result.data 
    };
  },
};

// ═══════════════════════════════════════════
// 5. ЗАКАЗЫ
// ═══════════════════════════════════════════

const createOrder: AIAction = {
  key: "create_order",
  category: "Продажи",
  icon: "📋",
  name: "Создать заказ",
  description: "Создаёт заказ на продажу клиенту",
  risk: "medium",
  ai_description: "Create a sales order. Required: counterparty_name, total_amount.",
  params: [
    { name: "counterparty_name", type: "string", required: true, description: "Наименование клиента" },
    { name: "order_date", type: "date", required: false, description: "Дата заказа" },
    { name: "total_amount", type: "number", required: true, description: "Общая сумма (с НДС)" },
    { name: "vat_rate", type: "number", required: false, description: "Ставка НДС", default: 16 },
    { name: "description", type: "string", required: false, description: "Описание" },
    { name: "order_number", type: "string", required: false, description: "Номер заказа" },
  ],
  executor: async (supabase, userId, params) => {
    if (!params.counterparty_name || !params.total_amount) {
      return { success: false, message: "Укажите контрагента и сумму" };
    }

    const { data: cp } = await supabase
      .from("counterparties")
      .select("id, name, bin")
      .eq("user_id", userId)
      .ilike("name", `%${params.counterparty_name}%`)
      .maybeSingle();

    if (!cp) {
      return { success: false, message: `Контрагент «${params.counterparty_name}» не найден. Сначала создайте его.` };
    }

    const orderNumber = params.order_number || `ORD-${Date.now().toString().slice(-6)}`;

    const result = await smartInsert(supabase, "orders", {
      user_id: userId,
      counterparty_id: cp.id,
      order_number: orderNumber,
      order_date: params.order_date || todayDate(),
      total_amount: Number(params.total_amount),
      vat_rate: params.vat_rate ?? 16,
      description: params.description || `Реализация ${cp.name}`,
      status: "draft",
      client_name: cp.name,
      client_bin: cp.bin,
    });

    if (!result.success) return { success: false, message: `Ошибка: ${result.error}` };

    await logAction(supabase, userId, "create_order", params, { id: result.data.id });
    return { 
      success: true, 
      message: `✅ Заказ ${orderNumber} для «${cp.name}» создан на сумму ${Number(params.total_amount).toLocaleString("ru-RU")} ₸`, 
      data: result.data 
    };
  },
};

// ═══════════════════════════════════════════
// 6. ОСНОВНЫЕ СРЕДСТВА
// ═══════════════════════════════════════════

const createFixedAsset: AIAction = {
  key: "create_fixed_asset",
  category: "ОС",
  icon: "🏢",
  name: "Создать основное средство",
  description: "Регистрирует новое основное средство",
  risk: "medium",
  ai_description: "Register a new fixed asset. Required: name, initial_cost.",
  params: [
    { name: "name", type: "string", required: true, description: "Наименование" },
    { name: "initial_cost", type: "number", required: true, description: "Первоначальная стоимость" },
    { name: "category", type: "string", required: false, description: "Категория" },
    { name: "depreciation_group", type: "number", required: false, description: "Группа амортизации (1-4)", default: 4 },
    { name: "depreciation_rate", type: "number", required: false, description: "Норма амортизации (%)" },
    { name: "acquisition_date", type: "date", required: false, description: "Дата приобретения" },
    { name: "tax_object_type", type: "enum", required: false, description: "Тип для налога", enum_values: ["property", "vehicle", "land", "none"], default: "none" },
  ],
  executor: async (supabase, userId, params) => {
    if (!params.name || !params.initial_cost) {
      return { success: false, message: "Укажите наименование и стоимость" };
    }

    const groupRates: any = { 1: 10, 2: 25, 3: 40, 4: 15 };
    const group = params.depreciation_group || 4;
    const rate = params.depreciation_rate || groupRates[group] || 15;

    const result = await smartInsert(supabase, "fixed_assets", {
      user_id: userId,
      name: params.name,
      initial_cost: Number(params.initial_cost),
      current_cost: Number(params.initial_cost),
      category: params.category,
      depreciation_group: group,
      depreciation_rate: rate,
      acquisition_date: params.acquisition_date || todayDate(),
      tax_object_type: params.tax_object_type || "none",
      status: "active",
    });

    if (!result.success) return { success: false, message: `Ошибка: ${result.error}` };

    await logAction(supabase, userId, "create_fixed_asset", params, { id: result.data.id });
    return { 
      success: true, 
      message: `✅ ОС «${params.name}» зарегистрировано на сумму ${Number(params.initial_cost).toLocaleString("ru-RU")} ₸`, 
      data: result.data 
    };
  },
};

// ═══════════════════════════════════════════
// 7. ДОКУМЕНТЫ
// ═══════════════════════════════════════════

const generateDocument: AIAction = {
  key: "generate_document",
  category: "Документы",
  icon: "📝",
  name: "Сформировать документ",
  description: "Создаёт документ (счёт, акт, договор) по шаблону",
  risk: "low",
  ai_description: "Generate a business document from template.",
  params: [
    { name: "document_type", type: "enum", required: true, description: "Тип документа", enum_values: ["invoice", "act", "contract", "delivery_note"] },
    { name: "counterparty_name", type: "string", required: true, description: "Контрагент" },
    { name: "title", type: "string", required: false, description: "Заголовок документа" },
    { name: "amount", type: "number", required: false, description: "Сумма" },
    { name: "service_description", type: "string", required: false, description: "Описание услуг/товаров" },
  ],
  executor: async (supabase, userId, params) => {
    if (!params.document_type || !params.counterparty_name) {
      return { success: false, message: "Укажите тип документа и контрагента" };
    }

    const typeNames: any = {
      invoice: "Счёт на оплату",
      act: "Акт выполненных работ",
      contract: "Договор",
      delivery_note: "Накладная",
    };

    const title = params.title || `${typeNames[params.document_type] || "Документ"} для ${params.counterparty_name}`;

    const result = await smartInsert(supabase, "generated_documents", {
      user_id: userId,
      template_name: typeNames[params.document_type] || "Документ",
      title,
      final_content: `${title}\n\nКонтрагент: ${params.counterparty_name}\n${params.amount ? `Сумма: ${Number(params.amount).toLocaleString("ru-RU")} ₸\n` : ""}${params.service_description || ""}`,
      generation_method: "ai_freeform",
      ai_prompt: `Document type: ${params.document_type}, counterparty: ${params.counterparty_name}`,
    });

    if (!result.success) return { success: false, message: `Ошибка: ${result.error}` };

    await logAction(supabase, userId, "generate_document", params, { id: result.data.id });
    return { 
      success: true, 
      message: `✅ Документ «${title}» создан. Откройте Генератор документов для редактирования.`, 
      data: result.data 
    };
  },
};

// ═══════════════════════════════════════════
// 8. ПЛАТЕЖИ
// ═══════════════════════════════════════════

const recordPayment: AIAction = {
  key: "record_payment",
  category: "Финансы",
  icon: "💰",
  name: "Зарегистрировать платёж",
  description: "Регистрирует платёж + создаёт проводку",
  risk: "medium",
  ai_description: "Record incoming or outgoing payment with auto-journal entry.",
  params: [
    { name: "payment_type", type: "enum", required: true, description: "Тип платежа", enum_values: ["incoming", "outgoing"] },
    { name: "amount", type: "number", required: true, description: "Сумма" },
    { name: "payment_date", type: "date", required: false, description: "Дата платежа" },
    { name: "counterparty_name", type: "string", required: true, description: "Контрагент" },
    { name: "method", type: "enum", required: false, description: "Способ", enum_values: ["bank", "cash"], default: "bank" },
    { name: "description", type: "string", required: false, description: "Назначение платежа" },
  ],
  executor: async (supabase, userId, params) => {
    if (!params.amount || !params.counterparty_name) {
      return { success: false, message: "Укажите сумму и контрагента" };
    }

    const isIncoming = params.payment_type === "incoming";
    const method = params.method || "bank";
    const moneyAccount = method === "cash" ? "1010" : "1030";
    const counterAccount = isIncoming ? "1210" : "3310";

    const result = await smartInsert(supabase, "journal_entries", {
      user_id: userId,
      entry_date: params.payment_date || todayDate(),
      debit_account: isIncoming ? moneyAccount : counterAccount,
      credit_account: isIncoming ? counterAccount : moneyAccount,
      amount: Number(params.amount),
      description: params.description || `${isIncoming ? "Получено от" : "Оплачено"} ${params.counterparty_name}`,
    });

    if (!result.success) return { success: false, message: `Ошибка: ${result.error}` };

    await logAction(supabase, userId, "record_payment", params, { id: result.data.id });

    return {
      success: true,
      message: `✅ ${isIncoming ? "Поступление" : "Списание"} ${Number(params.amount).toLocaleString("ru-RU")} ₸ зарегистрировано (${method === "cash" ? "касса" : "банк"})`,
      data: result.data,
    };
  },
};

// ═══════════════════════════════════════════
// РЕЕСТР
// ═══════════════════════════════════════════

export const ALL_AI_ACTIONS: AIAction[] = [
  createCounterparty,
  createNomenclature,
  createEmployee,
  createJournalEntry,
  createOrder,
  createFixedAsset,
  generateDocument,
  recordPayment,
];

export function findAction(key: string): AIAction | null {
  return ALL_AI_ACTIONS.find(a => a.key === key) || null;
}

export function getActionsDescriptionForAI(): string {
  return ALL_AI_ACTIONS.map(action => {
    const paramsList = action.params.map(p => 
      `${p.name}${p.required ? "*" : ""} (${p.type}${p.enum_values ? ": " + p.enum_values.join("/") : ""})`
    ).join(", ");
    return `- ${action.key}: ${action.ai_description}\n  Параметры: ${paramsList}`;
  }).join("\n\n");
}

export function getActionsAsTools() {
  return ALL_AI_ACTIONS.map(action => {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const param of action.params) {
      let schema: any = { description: param.description };
      
      if (param.type === "string" || param.type === "date") {
        schema.type = "string";
      } else if (param.type === "number") {
        schema.type = "number";
      } else if (param.type === "boolean") {
        schema.type = "boolean";
      } else if (param.type === "enum") {
        schema.type = "string";
        schema.enum = param.enum_values;
      }

      properties[param.name] = schema;
      if (param.required) required.push(param.name);
    }

    return {
      name: action.key,
      description: action.ai_description,
      input_schema: {
        type: "object",
        properties,
        required,
      },
    };
  });
}
