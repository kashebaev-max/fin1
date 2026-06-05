import { HOME_MODULE, MODULE_GROUPS, PRESETS } from "@/lib/modules-config";

/** Группы модулей для лендинга (без админ-разделов). */
export function getPublicModuleGroups() {
  return MODULE_GROUPS.map((g) => ({
    key: g.key,
    name: g.key === "system" ? "Сервис и поддержка" : g.name,
    icon: g.icon,
    color: g.color,
    description: g.description ?? "",
    items: g.items.filter((i) => !i.adminOnly),
  })).filter((g) => g.items.length > 0);
}

export const PUBLIC_MODULE_COUNT =
  1 + getPublicModuleGroups().reduce((sum, g) => sum + g.items.length, 0);

export const LANDING_AREAS = [
  "CRM и продажи",
  "Склад",
  "Касса POS",
  "Банк",
  "Кадры",
  "Налоги",
  "Аналитика",
] as const;

export const LANDING_STATS = [
  { value: `${PUBLIC_MODULE_COUNT}+`, label: "модулей", sub: "От CRM до отчётности" },
  { value: String(getPublicModuleGroups().length), label: "разделов", sub: "Все процессы бизнеса" },
  { value: "12", label: "типов документов", sub: "Счета, акты, накладные" },
  { value: "30", label: "дней бесплатно", sub: "Полный доступ при старте" },
] as const;

/** Сквозные возможности — не дублируют карточки разделов. */
export const LANDING_CROSS_FEATURES = [
  {
    icon: "🔗",
    title: "Всё связано",
    desc: "Один документ обновляет продажи, склад, деньги, кадры и отчётность. Без двойного ввода и сверок в Excel.",
  },
  {
    icon: "📸",
    title: "OCR и сканер",
    desc: "Фото или PDF → AI распознаёт суммы, БИН и позиции. Контрагент, товары и проводки создаются за секунды.",
  },
  {
    icon: "✦",
    title: "AI Жанара",
    desc: "Консультант с доступом к вашим данным: дебиторка, оборот, сроки ФНО, зарплата — ответы и напоминания 24/7.",
  },
  {
    icon: "🏢",
    title: "Несколько компаний",
    desc: "ТОО, ИП и филиалы в одном аккаунте. Переключение организации — в один клик.",
  },
  {
    icon: "📥",
    title: "Миграция из 1С",
    desc: "Импорт справочников и документов из 1С, Excel и CSV. Быстрый переход без потери истории.",
  },
  {
    icon: "💳",
    title: "Оплата через Kaspi",
    desc: "Подписка 10 000 ₸/мес или 100 000 ₸/год. Оплата за 30 секунд, без счетов и бумажной волокиты.",
  },
] as const;

/** Пресеты для разных типов бизнеса (без «Все модули» и узкого ИП). */
export const LANDING_PRESETS = PRESETS.filter((p) =>
  ["small_business", "trading", "manufacturing", "services"].includes(p.key)
);

export const LANDING_FAQ_EXTRA = [
  {
    q: "Чем Finstat отличается от 1С?",
    a: "Finstat — облачная единая система ведения бизнеса: не нужно устанавливать программу, обновления по НК РК приходят автоматически, есть AI-помощник и OCR. Продажи, склад, финансы, кадры и налоги в одном интерфейсе — без отдельных конфигураций и дорогих доработок.",
  },
  {
    q: "Какие процессы бизнеса покрывает система?",
    a: "CRM и заказы, розница и POS, склад и производство, касса и банк, бухгалтерия и управленческая отчётность, кадры и зарплата, налоги и ФНО, аналитика и бюджет, документооборот и AI-автоматизация. Модули можно включать по потребности.",
  },
] as const;
