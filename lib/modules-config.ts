// Единый источник правды для модулей системы.
// Используется в:
//   - app/dashboard/layout.tsx (рендер сайдбара)
//   - app/dashboard/settings/modules/page.tsx (управление видимостью)

export interface ModuleItem {
  key: string;
  name: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
  required?: boolean; // нельзя выключить
  description?: string; // краткое описание для страницы управления
}

export interface ModuleGroup {
  key: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  items: ModuleItem[];
}

// Главная — обязательная, не выключается, не входит в группы
export const HOME_MODULE: ModuleItem = {
  key: "dashboard",
  name: "Главная",
  icon: "⬡",
  path: "/dashboard",
  required: true,
  description: "Стартовая страница с KPI",
};

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    key: "sales",
    name: "Продажи и CRM",
    icon: "💼",
    color: "#10B981",
    description: "Работа с клиентами, заказы, договоры",
    items: [
      { key: "crm", name: "CRM", icon: "💼", path: "/dashboard/crm", description: "Воронка сделок, лиды" },
      { key: "counterparties", name: "Контрагенты", icon: "👥", path: "/dashboard/counterparties", description: "Справочник клиентов и поставщиков" },
      { key: "contracts", name: "Договоры", icon: "📑", path: "/dashboard/contracts", description: "Договоры с клиентами и поставщиками" },
      { key: "orders", name: "Заказы", icon: "📋", path: "/dashboard/orders", description: "Заказы покупателей и поставщикам" },
      { key: "returns", name: "Возвраты", icon: "↩", path: "/dashboard/returns", description: "Возвраты от клиентов и поставщикам" },
      { key: "discounts", name: "Скидки и промо", icon: "🎁", path: "/dashboard/discounts", description: "Скидки, бонусы, карты лояльности" },
      { key: "sales-analytics", name: "Анализ продаж", icon: "🎯", path: "/dashboard/sales-analytics", description: "ABC/XYZ-анализ, прибыльность" },
    ],
  },
  {
    key: "retail",
    name: "Торговля",
    icon: "🛒",
    color: "#EC4899",
    description: "POS-касса и розница",
    items: [
      { key: "pos", name: "Касса POS", icon: "🛒", path: "/dashboard/pos", description: "Точка продаж, чеки" },
      { key: "retail", name: "Розница", icon: "🏬", path: "/dashboard/retail", description: "Розничные магазины и смены" },
    ],
  },
  {
    key: "warehouse",
    name: "Склад и номенклатура",
    icon: "▣",
    color: "#3B82F6",
    description: "Товары, остатки, движения, производство",
    items: [
      { key: "nomenclature", name: "Номенклатура", icon: "📚", path: "/dashboard/nomenclature", description: "Справочник товаров и услуг" },
      { key: "warehouse", name: "Склад", icon: "▣", path: "/dashboard/warehouse", description: "Остатки и движения товаров" },
      { key: "transfers", name: "Перемещения", icon: "🔁", path: "/dashboard/transfers", description: "Перемещение между складами" },
      { key: "inventory", name: "Инвентаризация", icon: "📋", path: "/dashboard/inventory", description: "Инвентаризационные акты, излишки/недостачи" },
      { key: "batches", name: "Партионный учёт", icon: "📦", path: "/dashboard/batches", description: "FIFO/LIFO/средняя, сроки годности" },
      { key: "assembly", name: "Комплектация", icon: "🔧", path: "/dashboard/assembly", description: "Сборка/разборка комплектов" },
      { key: "production", name: "Производство", icon: "🏭", path: "/dashboard/production", description: "Производственные операции, цеха" },
    ],
  },
  {
    key: "finance",
    name: "Деньги и банк",
    icon: "◆",
    color: "#F59E0B",
    description: "Касса, банк, валюты, регулярные платежи",
    items: [
      { key: "cashbox", name: "Касса", icon: "◉", path: "/dashboard/cashbox", description: "Приходные и расходные кассовые ордера" },
      { key: "bank", name: "Банк", icon: "◆", path: "/dashboard/bank", description: "Платёжные поручения" },
      { key: "bank-import", name: "Импорт выписки", icon: "📥", path: "/dashboard/bank-import", description: "Загрузка выписки из банка" },
      { key: "currency", name: "Валюты", icon: "💱", path: "/dashboard/currency", description: "Курсы валют и переоценка" },
      { key: "recurring", name: "Регулярные платежи", icon: "🔄", path: "/dashboard/recurring", description: "Аренда, подписки, лизинг" },
      { key: "business-trips", name: "Командировки", icon: "✈", path: "/dashboard/business-trips", description: "Авансовые отчёты, суточные" },
    ],
  },
  {
    key: "accounting",
    name: "Бухгалтерия",
    icon: "▦",
    color: "#6366F1",
    description: "Проводки, ОСВ, баланс, ОПУ",
    items: [
      { key: "accounting", name: "Журнал проводок", icon: "▦", path: "/dashboard/accounting", description: "Все бухгалтерские проводки" },
      { key: "turnover", name: "ОСВ", icon: "📒", path: "/dashboard/turnover", description: "Оборотно-сальдовая ведомость" },
      { key: "account-card", name: "Карточка счёта", icon: "📇", path: "/dashboard/account-card", description: "Все движения по выбранному счёту" },
      { key: "chess-board", name: "Шахматка", icon: "♟", path: "/dashboard/chess-board", description: "Матрица Дт × Кт" },
      { key: "financial-statements", name: "Баланс и ОПУ", icon: "📊", path: "/dashboard/financial-statements", description: "Формы 1 и 2 по НСФО" },
      { key: "assets", name: "Основные средства", icon: "🏗", path: "/dashboard/assets", description: "ОС и амортизация" },
    ],
  },
  {
    key: "hr",
    name: "Кадры и зарплата",
    icon: "◎",
    color: "#A855F7",
    description: "Сотрудники, ЗП, табель, отпуска",
    items: [
      { key: "hr", name: "Сотрудники и ЗП", icon: "◎", path: "/dashboard/hr", description: "Карточки сотрудников, расчёт ЗП" },
      { key: "timesheet", name: "Табель Т-13", icon: "🗓", path: "/dashboard/timesheet", description: "Учёт рабочего времени" },
      { key: "vacations", name: "Отпуска", icon: "🏖", path: "/dashboard/vacations", description: "График и расчёт отпускных" },
      { key: "hr-orders", name: "Кадровые приказы", icon: "📜", path: "/dashboard/hr-orders", description: "Т-1/Т-5/Т-6/Т-8" },
      { key: "deductions", name: "Удержания из ЗП", icon: "💸", path: "/dashboard/deductions", description: "Алименты, кредиты, исп. листы" },
    ],
  },
  {
    key: "tax",
    name: "Налоги и отчётность",
    icon: "⚖",
    color: "#EF4444",
    description: "ФНО, НК РК, ЭСФ",
    items: [
      { key: "reports", name: "Отчёты ФНО", icon: "▤", path: "/dashboard/reports", description: "ФНО 200/300/910 — авто-заполнение" },
      { key: "taxinfo", name: "НК РК 2026", icon: "⚖", path: "/dashboard/taxinfo", description: "Справочник Налогового кодекса" },
      { key: "edo", name: "ЭДО / ЭСФ", icon: "📨", path: "/dashboard/edo", description: "Электронный документооборот" },
      { key: "check", name: "Проверка БИН", icon: "🔍", path: "/dashboard/check", description: "Проверка контрагента в КГД" },
    ],
  },
  {
    key: "documents",
    name: "Документы",
    icon: "◈",
    color: "#0EA5E9",
    description: "Шаблоны и документооборот",
    items: [
      { key: "documents", name: "Документы", icon: "◈", path: "/dashboard/documents", description: "Шаблоны, договоры, акты" },
      { key: "workflow", name: "Документооборот", icon: "🛤", path: "/dashboard/workflow", description: "Маршруты согласования" },
      { key: "exports", name: "Экспорт отчётов", icon: "📤", path: "/dashboard/exports", description: "Скачивание отчётов в Excel и PDF" },
    ],
  },
  {
    key: "analytics",
    name: "Аналитика и планирование",
    icon: "📈",
    color: "#14B8A6",
    description: "Бюджет, управленческие отчёты, календарь",
    items: [
      { key: "analytics-charts", name: "Графики и аналитика", icon: "📊", path: "/dashboard/analytics-charts", description: "Визуализация всех ключевых показателей" },
      { key: "forecast", name: "Прогноз кэшфлоу", icon: "🔮", path: "/dashboard/forecast", description: "Прогноз баланса и кассового разрыва" },
      { key: "budgeting", name: "Бюджет", icon: "📊", path: "/dashboard/budgeting", description: "Бюджет доходов и расходов" },
      { key: "management-reports", name: "Управленческие отчёты", icon: "📈", path: "/dashboard/management-reports", description: "Cash flow, P&L, KPI" },
      { key: "calendar", name: "Календарь", icon: "📅", path: "/dashboard/calendar", description: "События, встречи, дедлайны" },
    ],
  },
  {
    key: "automation",
    name: "Автоматизация и AI",
    icon: "✦",
    color: "#8B5CF6",
    description: "AI-консультант, регламентные задания",
    items: [
      { key: "ai", name: "AI Жанара", icon: "✦", path: "/dashboard/ai", description: "AI-ассистент по налогам и учёту" },
      { key: "notifications", name: "Уведомления", icon: "🔔", path: "/dashboard/notifications", description: "Уведомления и напоминания от Жанары" },
      { key: "ai-actions", name: "Журнал действий ИИ", icon: "🤖", path: "/dashboard/ai-actions", description: "Аудит всех действий, выполненных Жанарой" },
      { key: "document-scanner", name: "Сканирование документов", icon: "📄", path: "/dashboard/document-scanner", description: "Загрузка PDF/фото → AI распознаёт и проводит" },
      { key: "scheduled-tasks", name: "Регламентные задания", icon: "⏱", path: "/dashboard/scheduled-tasks", description: "Автоматизация: амортизация, проверки и т.д." },
    ],
  },
  {
    key: "specifics",
    name: "Отраслевое",
    icon: "🏥",
    color: "#84CC16",
    description: "Специфика для разных отраслей",
    items: [
      { key: "industry", name: "Отрасли", icon: "🏥", path: "/dashboard/industry", description: "Преднастройки для медицины, общепита и др." },
      { key: "transport", name: "Транспорт", icon: "🚗", path: "/dashboard/transport", description: "Путевые листы, ГСМ, ТО" },
    ],
  },
  {
    key: "system",
    name: "Настройки",
    icon: "⚙",
    color: "#6B7280",
    description: "Системные настройки",
    items: [
      { key: "companies", name: "Организации", icon: "🏢", path: "/dashboard/companies", description: "Справочник фирм", required: true },
      { key: "settings", name: "Настройки", icon: "⚙", path: "/dashboard/settings", description: "Настройки профиля и системы", required: true },
      { key: "admin", name: "Админ-панель", icon: "🛡", path: "/dashboard/admin", adminOnly: true, description: "Управление пользователями (только админ)" },
    ],
  },
];

// Уплощённый список всех модулей
export const ALL_MODULES: ModuleItem[] = [
  HOME_MODULE,
  ...MODULE_GROUPS.flatMap(g => g.items),
];

// Хелперы

export function isModuleEnabled(moduleKey: string, disabledList: string[]): boolean {
  return !disabledList.includes(moduleKey);
}

// Какие модули не могут быть выключены
export function isModuleRequired(moduleKey: string): boolean {
  if (moduleKey === HOME_MODULE.key) return true;
  for (const group of MODULE_GROUPS) {
    const item = group.items.find(i => i.key === moduleKey);
    if (item?.required) return true;
  }
  return false;
}

// Пресеты — наборы для разных типов бизнеса
export const PRESETS: { key: string; name: string; icon: string; description: string; disabled: string[] }[] = [
  {
    key: "all",
    name: "Все модули",
    icon: "🌟",
    description: "Полная функциональность системы (по умолчанию)",
    disabled: [],
  },
  {
    key: "small_business",
    name: "Малый бизнес",
    icon: "🏪",
    description: "Базовый учёт без производства, партий, бюджета и сложной аналитики",
    disabled: [
      "production", "batches", "assembly", "transfers",
      "budgeting", "management-reports",
      "edo", "workflow", "industry", "transport",
      "chess-board", "financial-statements",
      "deductions", "hr-orders",
      "scheduled-tasks",
    ],
  },
  {
    key: "trading",
    name: "Торговая компания",
    icon: "📦",
    description: "Оптовая/розничная торговля без производства",
    disabled: ["production", "transport", "industry"],
  },
  {
    key: "manufacturing",
    name: "Производство",
    icon: "🏭",
    description: "Производственное предприятие с полным циклом",
    disabled: ["pos", "retail"],
  },
  {
    key: "services",
    name: "Услуги",
    icon: "💼",
    description: "Услуговая компания: без склада и производства",
    disabled: [
      "warehouse", "transfers", "inventory", "batches",
      "assembly", "production", "pos", "retail",
      "discounts", "transport",
    ],
  },
  {
    key: "ip_simple",
    name: "ИП (упрощёнка)",
    icon: "👤",
    description: "Самый простой набор для ИП на упрощёнке",
    disabled: [
      "production", "batches", "assembly", "transfers",
      "budgeting", "management-reports", "edo", "workflow",
      "industry", "transport", "chess-board", "financial-statements",
      "deductions", "hr-orders", "vacations", "timesheet",
      "scheduled-tasks", "discounts", "sales-analytics",
      "contracts", "returns",
    ],
  },
];
