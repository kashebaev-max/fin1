/**
 * Данные модулей Finstat.kz для полного промо-ролика (синхронизировано с lib/modules-config.ts)
 */
export const HOME_MODULE = {
  key: "dashboard",
  name: "Главная",
  icon: "⬡",
  description: "KPI, графики, сводка по бизнесу",
};

export const MODULE_GROUPS = [
  {
    key: "sales",
    name: "Продажи и CRM",
    icon: "💼",
    color: "#10B981",
    items: [
      { key: "crm", name: "CRM", icon: "💼", desc: "Воронка сделок, лиды, этапы" },
      { key: "counterparties", name: "Контрагенты", icon: "👥", desc: "Клиенты и поставщики, БИН, договоры" },
      { key: "contracts", name: "Договоры", icon: "📑", desc: "Договоры с контрагентами" },
      { key: "orders", name: "Заказы", icon: "📋", desc: "Заказы покупателей и поставщикам" },
      { key: "returns", name: "Возвраты", icon: "↩", desc: "Возвраты от клиентов и поставщикам" },
      { key: "discounts", name: "Скидки и промо", icon: "🎁", desc: "Скидки, бонусы, лояльность" },
      { key: "sales-analytics", name: "Анализ продаж", icon: "🎯", desc: "ABC/XYZ, прибыльность" },
    ],
  },
  {
    key: "retail",
    name: "Торговля",
    icon: "🛒",
    color: "#EC4899",
    items: [
      { key: "pos", name: "Касса POS", icon: "🛒", desc: "Точка продаж, чеки, оплата" },
      { key: "retail", name: "Розница", icon: "🏬", desc: "Магазины, смены, Z-отчёты" },
    ],
  },
  {
    key: "warehouse",
    name: "Склад и номенклатура",
    icon: "▣",
    color: "#3B82F6",
    items: [
      { key: "nomenclature", name: "Номенклатура", icon: "📚", desc: "Товары, услуги, штрихкоды" },
      { key: "warehouse", name: "Склад", icon: "▣", desc: "Остатки, приход, расход" },
      { key: "transfers", name: "Перемещения", icon: "🔁", desc: "Между складами" },
      { key: "inventory", name: "Инвентаризация", icon: "📋", desc: "Акты, излишки, недостачи" },
      { key: "batches", name: "Партионный учёт", icon: "📦", desc: "FIFO, сроки годности" },
      { key: "assembly", name: "Комплектация", icon: "🔧", desc: "Сборка и разборка комплектов" },
      { key: "production", name: "Производство", icon: "🏭", desc: "Заказы на производство, цеха" },
    ],
  },
  {
    key: "finance",
    name: "Деньги и банк",
    icon: "◆",
    color: "#F59E0B",
    items: [
      { key: "cashbox", name: "Касса", icon: "◉", desc: "ПКО и РКО, кассовая книга" },
      { key: "bank", name: "Банк", icon: "◆", desc: "Платёжные поручения" },
      { key: "bank-import", name: "Импорт выписки", icon: "📥", desc: "Загрузка выписки из банка" },
      { key: "currency", name: "Валюты", icon: "💱", desc: "Курсы, переоценка" },
      { key: "recurring", name: "Регулярные платежи", icon: "🔄", desc: "Аренда, подписки, лизинг" },
      { key: "business-trips", name: "Командировки", icon: "✈", desc: "Авансовые отчёты, суточные" },
    ],
  },
  {
    key: "accounting",
    name: "Бухгалтерия",
    icon: "▦",
    color: "#6366F1",
    items: [
      { key: "accounting", name: "Журнал проводок", icon: "▦", desc: "Все бухгалтерские проводки" },
      { key: "turnover", name: "ОСВ", icon: "📒", desc: "Оборотно-сальдовая ведомость" },
      { key: "account-card", name: "Карточка счёта", icon: "📇", desc: "Движения по счёту" },
      { key: "chess-board", name: "Шахматка", icon: "♟", desc: "Матрица Дт × Кт" },
      { key: "financial-statements", name: "Баланс и ОПУ", icon: "📊", desc: "Формы 1 и 2 по НСФО" },
      { key: "assets", name: "Основные средства", icon: "🏗", desc: "ОС и амортизация" },
    ],
  },
  {
    key: "hr",
    name: "Кадры и зарплата",
    icon: "◎",
    color: "#A855F7",
    items: [
      { key: "hr", name: "Сотрудники и ЗП", icon: "◎", desc: "Начисление зарплаты по НК 2026" },
      { key: "timesheet", name: "Табель Т-13", icon: "🗓", desc: "Учёт рабочего времени" },
      { key: "vacations", name: "Отпуска", icon: "🏖", desc: "Отпускные, график отпусков" },
      { key: "hr-orders", name: "Кадровые приказы", icon: "📜", desc: "Т-1, Т-5, Т-6, Т-8" },
      { key: "deductions", name: "Удержания из ЗП", icon: "💸", desc: "Алименты, кредиты, исп. листы" },
      { key: "sick-leaves", name: "Больничные", icon: "🤒", desc: "Расчёт по стажу 60/80/100%" },
    ],
  },
  {
    key: "tax",
    name: "Налоги и отчётность",
    icon: "⚖",
    color: "#EF4444",
    items: [
      { key: "reports", name: "Отчёты ФНО", icon: "▤", desc: "ФНО 200/300/910/100" },
      { key: "taxinfo", name: "НК РК 2026", icon: "⚖", desc: "Справочник Налогового кодекса" },
      { key: "edo", name: "ЭДО / ЭСФ", icon: "📨", desc: "Электронные счета-фактуры" },
      { key: "check", name: "Проверка БИН", icon: "🔍", desc: "Реестр Минюста, наименование ЮЛ" },
    ],
  },
  {
    key: "documents",
    name: "Документы",
    icon: "◈",
    color: "#0EA5E9",
    items: [
      { key: "documents", name: "Документы", icon: "◈", desc: "12 типов: счета, накладные, акты" },
      { key: "workflow", name: "Документооборот", icon: "🛤", desc: "Маршруты согласования" },
      { key: "exports", name: "Экспорт отчётов", icon: "📤", desc: "Excel и PDF" },
      { key: "doc-generator", name: "Генератор документов", icon: "📝", desc: "AI: договоры, акты, счета" },
      { key: "sono", name: "СОНО (подача ФНО)", icon: "📤", desc: "XML для личного кабинета КГД" },
    ],
  },
  {
    key: "analytics",
    name: "Аналитика и планирование",
    icon: "📈",
    color: "#14B8A6",
    items: [
      { key: "analytics-charts", name: "Графики и аналитика", icon: "📊", desc: "KPI, тренды, визуализация" },
      { key: "forecast", name: "Прогноз кэшфлоу", icon: "🔮", desc: "Кассовый разрыв, прогноз" },
      { key: "budgeting", name: "Бюджет", icon: "📊", desc: "Бюджет доходов и расходов" },
      { key: "management-reports", name: "Управленческие отчёты", icon: "📈", desc: "Cash flow, P&L" },
      { key: "calendar", name: "Календарь", icon: "📅", desc: "Сроки ФНО, дедлайны, события" },
    ],
  },
  {
    key: "automation",
    name: "Автоматизация и AI",
    icon: "✦",
    color: "#8B5CF6",
    items: [
      { key: "ai", name: "AI Жанара", icon: "✦", desc: "Консультант по налогам и учёту" },
      { key: "notifications", name: "Уведомления", icon: "🔔", desc: "Напоминания от Жанары" },
      { key: "ai-actions", name: "Журнал действий ИИ", icon: "🤖", desc: "Аудит действий AI" },
      { key: "document-scanner", name: "Сканирование документов", icon: "📄", desc: "PDF/фото → проводки" },
      { key: "scheduled-tasks", name: "Регламентные задания", icon: "⏱", desc: "Амортизация, проверки" },
      { key: "migration", name: "Миграция из 1С", icon: "📥", desc: "Импорт 1С / Excel / CSV" },
      { key: "scan", name: "Сканер документов", icon: "📸", desc: "OCR через камеру телефона" },
    ],
  },
  {
    key: "specifics",
    name: "Отраслевое",
    icon: "🏥",
    color: "#84CC16",
    items: [
      { key: "industry", name: "Отрасли", icon: "🏥", desc: "Медицина, общепит, услуги" },
      { key: "transport", name: "Транспорт", icon: "🚗", desc: "Путевые листы, ГСМ, ТО" },
    ],
  },
  {
    key: "system",
    name: "Настройки и сервис",
    icon: "⚙",
    color: "#6B7280",
    items: [
      { key: "help", name: "Справочный центр", icon: "📚", desc: "Инструкции по всем модулям" },
      { key: "companies", name: "Организации", icon: "🏢", desc: "Несколько компаний в одном аккаунте" },
      { key: "settings", name: "Настройки", icon: "⚙", desc: "Модули, профиль, подписка" },
      { key: "support", name: "Поддержка", icon: "💬", desc: "Виджет обращений, ответ на e-mail" },
    ],
  },
];

/** Примеры строк в мок-таблице по модулю */
export const MOCK_ROWS = {
  crm: ["Лид: ТОО «Алма»", "Сделка: 2.4 млн ₸", "Этап: Переговоры"],
  counterparties: ["ТОО «Фарма-Life»", "БИН 110640020454", "Поставщик + клиент"],
  orders: ["Заказ №1247", "Сумма 890 000 ₸", "Статус: Отгружен"],
  warehouse: ["Товар: Молоко 3.2%", "Остаток: 1 240 шт", "Резерв: 80 шт"],
  hr: ["Иванов А.С.", "Оклад 450 000 ₸", "ИПН 10%, ОПВ 10%"],
  reports: ["ФНО 300 — НДС", "К уплате: 1 120 000 ₸", "Срок: 25.04.2026"],
  pos: ["Чек №004521", "Сумма 12 450 ₸", "Kaspi QR"],
  default: ["Документ проведён", "Проводки созданы", "Склад обновлён"],
};
