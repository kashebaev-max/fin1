#!/usr/bin/env node
/**
 * Иллюстрации для лендинга (тёмная и светлая темы).
 * node scripts/generate-landing-images.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const W = 1200;
const H = 680;
const FF = "Segoe UI, Arial, sans-serif";

const PALETTES = {
  dark: {
    bg: "#0f1117",
    sidebar: "#141720",
    card: "#1a1d27",
    brd: "#2a2f3d",
    t1: "#e8eaef",
    t2: "#9ca3af",
    t3: "#6b7280",
    accent: "#6366F1",
    accent2: "#A855F7",
    green: "#10B981",
    red: "#EF4444",
    amber: "#F59E0B",
    blue: "#3B82F6",
    chrome: "#0a0c10",
  },
  light: {
    bg: "#F8FAFC",
    sidebar: "#FFFFFF",
    card: "#FFFFFF",
    brd: "#E2E8F0",
    t1: "#0F172A",
    t2: "#64748B",
    t3: "#94A3B8",
    accent: "#0F766E",
    accent2: "#14B8A6",
    green: "#059669",
    red: "#DC2626",
    amber: "#D97706",
    blue: "#0284C7",
    chrome: "#E2E8F0",
  },
};

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function frame(C, body, badge = "Finstat.kz — демо") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.accent}"/>
      <stop offset="100%" stop-color="${C.accent2}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" rx="16" fill="${C.bg}"/>
  <rect x="0" y="0" width="${W}" height="32" rx="16" fill="${C.chrome}"/>
  <circle cx="18" cy="16" r="5" fill="#EF4444"/><circle cx="34" cy="16" r="5" fill="#F59E0B"/><circle cx="50" cy="16" r="5" fill="#10B981"/>
  <text x="72" y="20" fill="${C.t3}" font-family="${FF}" font-size="11">${esc(badge)}</text>
  ${body}
</svg>`;
}

function sidebar(C, active = "Главная") {
  const items = ["⬡ Главная", "📸 Сканер", "👥 Контрагенты", "📒 Проводки", "◎ Зарплата"];
  let menu = "";
  items.forEach((item, i) => {
    const y = 72 + i * 30;
    const on = item.includes(active);
    if (on) menu += `<rect x="8" y="${y - 16}" width="164" height="26" rx="6" fill="${C.accent}22"/>`;
    menu += `<text x="22" y="${y}" fill="${on ? C.accent : C.t2}" font-family="${FF}" font-size="11" font-weight="${on ? "600" : "400"}">${esc(item)}</text>`;
  });
  return `
  <rect x="12" y="40" width="180" height="${H - 52}" rx="10" fill="${C.sidebar}" stroke="${C.brd}"/>
  <text x="28" y="64" fill="url(#g)" font-size="16" font-weight="700" font-family="${FF}">F</text>
  ${menu}`;
}

function sceneHero(C) {
  const body = `
  ${sidebar(C, "Главная")}
  <rect x="208" y="48" width="${W - 220}" height="40" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="224" y="74" fill="${C.t1}" font-size="13" font-weight="600" font-family="${FF}">Главная</text>
  <text x="${W - 100}" y="74" fill="${C.t2}" font-size="10" font-family="${FF}">ТОО «Демо»</text>
  <rect x="224" y="100" width="200" height="64" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="238" y="122" fill="${C.t3}" font-size="9" font-family="${FF}">Касса</text>
  <text x="238" y="148" fill="${C.green}" font-size="18" font-weight="700" font-family="${FF}">1,24 млн ₸</text>
  <rect x="440" y="100" width="200" height="64" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="454" y="122" fill="${C.t3}" font-size="9" font-family="${FF}">Банк</text>
  <text x="454" y="148" fill="${C.blue}" font-size="18" font-weight="700" font-family="${FF}">8,56 млн ₸</text>
  <rect x="656" y="100" width="200" height="64" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="670" y="122" fill="${C.t3}" font-size="9" font-family="${FF}">Дебиторка</text>
  <text x="670" y="148" fill="${C.amber}" font-size="18" font-weight="700" font-family="${FF}">2,31 млн ₸</text>
  <rect x="872" y="100" width="200" height="64" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="886" y="122" fill="${C.t3}" font-size="9" font-family="${FF}">НДС 16%</text>
  <text x="886" y="148" fill="${C.accent2}" font-size="18" font-weight="700" font-family="${FF}">486 400 ₸</text>
  <rect x="224" y="180" width="520" height="200" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="238" y="204" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Выручка по месяцам</text>
  ${[42, 58, 51, 72, 68].map((v, i) => {
    const bh = v * 1.6;
    const bx = 250 + i * 88;
    return `<rect x="${bx}" y="${360 - bh}" width="56" height="${bh}" rx="4" fill="url(#g)" opacity="0.85"/>`;
  }).join("")}
  <rect x="760" y="180" width="${W - 772}" height="200" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="774" y="204" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Жанара рекомендует</text>
  <text x="774" y="232" fill="${C.t2}" font-size="10" font-family="${FF}">• Срок ФНО 200 — 5 дней</text>
  <text x="774" y="254" fill="${C.t2}" font-size="10" font-family="${FF}">• Дебиторка ТОО Альфа</text>
  <text x="774" y="276" fill="${C.t2}" font-size="10" font-family="${FF}">• Низкий остаток на складе</text>
  <rect x="224" y="396" width="${W - 236}" height="160" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="238" y="420" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Последние документы</text>
  <text x="238" y="448" fill="${C.t2}" font-size="10" font-family="${FF}">СФ-0042 · 486 400 ₸ · проведён</text>
  <text x="238" y="470" fill="${C.t2}" font-size="10" font-family="${FF}">INV-5785 · 1 160 ₸ · черновик</text>
  <circle cx="${W - 48}" cy="${H - 48}" r="24" fill="url(#g)" filter="url(#shadow)"/>
  <text x="${W - 48}" y="${H - 42}" text-anchor="middle" fill="#fff" font-size="16">✦</text>`;
  return frame(C, body);
}

function sceneOcr(C) {
  const body = `
  <rect x="40" y="56" width="340" height="520" rx="12" fill="${C.card}" stroke="${C.brd}" filter="url(#shadow)"/>
  <text x="56" y="84" fill="${C.t1}" font-size="13" font-weight="600" font-family="${FF}">📄 Счёт-фактура</text>
  <rect x="56" y="100" width="308" height="380" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="72" y="130" fill="${C.t2}" font-size="10" font-family="${FF}">ТОО «Альфа-Сервис»</text>
  <text x="72" y="150" fill="${C.t3}" font-size="9" font-family="${FF}">БИН 123456789012</text>
  <line x1="72" y1="170" x2="348" y2="170" stroke="${C.brd}"/>
  <text x="72" y="200" fill="${C.t2}" font-size="9" font-family="${FF}">Бумага А4 · 10 шт · 12 500 ₸</text>
  <text x="72" y="222" fill="${C.t2}" font-size="9" font-family="${FF}">НДС 16% · 2 000 ₸</text>
  <text x="72" y="260" fill="${C.t1}" font-size="11" font-weight="700" font-family="${FF}">Итого: 14 500 ₸</text>
  <rect x="56" y="500" width="120" height="32" rx="8" fill="url(#g)"/>
  <text x="116" y="520" text-anchor="middle" fill="#fff" font-size="10" font-weight="600" font-family="${FF}">📷 Сфотографировать</text>
  <text x="400" y="100" fill="${C.accent}" font-size="28" font-family="${FF}">→</text>
  <rect x="440" y="56" width="${W - 480}" height="520" rx="12" fill="${C.card}" stroke="${C.accent}55" stroke-width="2" filter="url(#shadow)"/>
  <text x="460" y="88" fill="${C.t1}" font-size="14" font-weight="700" font-family="${FF}">✦ AI распознал за 8 сек</text>
  <rect x="460" y="108" width="140" height="28" rx="14" fill="${C.green}22"/>
  <text x="530" y="126" text-anchor="middle" fill="${C.green}" font-size="10" font-weight="600" font-family="${FF}">Уверенность 94%</text>
  ${[
    ["Поставщик", "ТОО «Альфа-Сервис»"],
    ["БИН", "123456789012"],
    ["Дата", "29.05.2026"],
    ["Сумма", "14 500 ₸"],
    ["НДС 16%", "2 000 ₸"],
  ].map(([l, v], i) => `
  <text x="460" y="${168 + i * 36}" fill="${C.t3}" font-size="10" font-family="${FF}">${esc(l)}</text>
  <text x="620" y="${168 + i * 36}" fill="${C.t1}" font-size="11" font-weight="600" font-family="${FF}">${esc(v)}</text>`).join("")}
  <rect x="460" y="380" width="${W - 500}" height="120" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="476" y="404" fill="${C.t1}" font-size="11" font-weight="600" font-family="${FF}">Проводка</text>
  <text x="476" y="428" fill="${C.t2}" font-size="10" font-family="${FF}">Дт 1330 Товары — 12 500 ₸</text>
  <text x="476" y="448" fill="${C.t2}" font-size="10" font-family="${FF}">Дт 1420 НДС — 2 000 ₸</text>
  <text x="476" y="468" fill="${C.t2}" font-size="10" font-family="${FF}">Кт 3310 Кредиторка — 14 500 ₸</text>
  <rect x="460" y="520" width="200" height="40" rx="10" fill="url(#g)"/>
  <text x="560" y="545" text-anchor="middle" fill="#fff" font-size="12" font-weight="600" font-family="${FF}">Импортировать в систему</text>`;
  return frame(C, body, "Сканер документов");
}

function sceneZhanara(C) {
  const body = `
  ${sidebar(C, "Главная")}
  <rect x="208" y="48" width="${W - 220}" height="40" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="224" y="74" fill="${C.t1}" font-size="13" font-weight="600" font-family="${FF}">AI Жанара</text>
  <rect x="720" y="100" width="${W - 740}" height="${H - 120}" rx="14" fill="${C.card}" stroke="${C.brd}" filter="url(#shadow)"/>
  <rect x="720" y="100" width="${W - 740}" height="44" rx="14" fill="url(#g)"/>
  <text x="740" y="128" fill="#fff" font-size="13" font-weight="700" font-family="${FF}">✦ Жанара</text>
  <text x="${W - 60}" y="128" text-anchor="end" fill="#ffffff99" font-size="10" font-family="${FF}">онлайн</text>
  <rect x="736" y="160" width="280" height="56" rx="10" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="752" y="184" fill="${C.t2}" font-size="10" font-family="${FF}">Что у меня по дебиторке за май?</text>
  <rect x="736" y="228" width="420" height="120" rx="10" fill="${C.accent}12" stroke="${C.accent}40"/>
  <text x="752" y="252" fill="${C.t1}" font-size="10" font-weight="600" font-family="${FF}">Жанара</text>
  <text x="752" y="274" fill="${C.t2}" font-size="10" font-family="${FF}">Дебиторка: 2 310 720 ₸ (3 контрагента).</text>
  <text x="752" y="294" fill="${C.t2}" font-size="10" font-family="${FF}">Просрочка: ТОО «Альфа» — 12 дней, 2,3 млн ₸.</text>
  <text x="752" y="314" fill="${C.amber}" font-size="10" font-family="${FF}">Рекомендую направить акт сверки.</text>
  <rect x="736" y="368" width="200" height="36" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="752" y="390" fill="${C.t3}" font-size="10" font-family="${FF}">Спросите Жанару…</text>
  <rect x="224" y="100" width="480" height="200" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="238" y="128" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Контекст вашего бизнеса</text>
  <text x="238" y="156" fill="${C.t2}" font-size="10" font-family="${FF}">Документы · Проводки · Склад · Зарплата</text>
  <text x="238" y="180" fill="${C.t2}" font-size="10" font-family="${FF}">НК РК 2026 · сроки ФНО · напоминания</text>`;
  return frame(C, body, "AI Жанара");
}

function scenePayroll(C) {
  const body = `
  ${sidebar(C, "Зарплата")}
  <rect x="208" y="48" width="${W - 220}" height="40" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="224" y="74" fill="${C.t1}" font-size="13" font-weight="600" font-family="${FF}">Зарплата · май 2026</text>
  <rect x="224" y="100" width="${W - 236}" height="420" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="238" y="128" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Табель Т-13 · автозаполнение</text>
  ${["Я", "Я", "В", "П", "Я", "Я", "В"].map((c, i) =>
    `<rect x="${250 + i * 44}" y="150" width="36" height="28" rx="4" fill="${c === "П" ? C.amber + "33" : C.bg}" stroke="${C.brd}"/><text x="${268 + i * 44}" y="168" text-anchor="middle" fill="${C.t1}" font-size="10" font-family="${FF}">${c}</text>`
  ).join("")}
  <text x="238" y="220" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Начисление</text>
  <text x="238" y="248" fill="${C.t2}" font-size="10" font-family="${FF}">ИПН 10% · ОПВ 10% · ВОСМС 2% · на руки</text>
  <text x="238" y="280" fill="${C.green}" font-size="20" font-weight="700" font-family="${FF}">4 850 000 ₸ к выплате</text>
  <rect x="238" y="320" width="180" height="36" rx="8" fill="url(#g)"/>
  <text x="328" y="343" text-anchor="middle" fill="#fff" font-size="11" font-weight="600" font-family="${FF}">Провести в бухгалтерию</text>`;
  return frame(C, body, "Кадры и зарплата");
}

function sceneCrm(C) {
  const body = `
  ${sidebar(C, "Контрагенты")}
  <rect x="208" y="48" width="${W - 220}" height="40" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="224" y="74" fill="${C.t1}" font-size="13" font-weight="600" font-family="${FF}">CRM · Воронка продаж</text>
  <rect x="224" y="100" width="360" height="420" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  ${[
    ["Лиды", "52", 1],
    ["Переговоры", "18", 0.68],
    ["Счёт выставлен", "9", 0.42],
    ["Оплачено", "6", 0.28],
  ].map(([l, n, w], i) => `
  <text x="238" y="${140 + i * 72}" fill="${C.t2}" font-size="10" font-family="${FF}">${esc(l)}</text>
  <rect x="360" y="${124 + i * 72}" width="${Math.round(280 * w)}" height="28" rx="6" fill="url(#g)" opacity="0.9"/>
  <text x="660" y="${144 + i * 72}" fill="${C.t1}" font-size="11" font-weight="700" font-family="${FF}">${esc(n)}</text>`).join("")}
  <rect x="600" y="100" width="${W - 620}" height="200" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="616" y="128" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Заказы</text>
  <text x="616" y="156" fill="${C.t2}" font-size="10" font-family="${FF}">№1247 · 890 000 ₸ · отгружен</text>
  <text x="616" y="178" fill="${C.t2}" font-size="10" font-family="${FF}">№1251 · 2 400 000 ₸ · в работе</text>
  <rect x="600" y="320" width="${W - 620}" height="200" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="616" y="348" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Контрагенты</text>
  <text x="616" y="376" fill="${C.t2}" font-size="10" font-family="${FF}">ТОО «Алма» · клиент</text>
  <text x="616" y="398" fill="${C.t2}" font-size="10" font-family="${FF}">ТОО «Фарма-Life» · поставщик</text>`;
  return frame(C, body, "Продажи и CRM");
}

function scenePos(C) {
  const body = `
  <rect x="80" y="80" width="440" height="480" rx="16" fill="${C.card}" stroke="${C.brd}" filter="url(#shadow)"/>
  <text x="100" y="118" fill="${C.t1}" font-size="16" font-weight="700" font-family="${FF}">🛒 Касса POS</text>
  <text x="100" y="148" fill="${C.t3}" font-size="10" font-family="${FF}">Смена №12 · кассир Айгуль</text>
  ${["Молоко 3.2%", "Хлеб белый", "Масло 200г"].map((n, i) => `
  <text x="100" y="${190 + i * 32}" fill="${C.t2}" font-size="11" font-family="${FF}">${esc(n)}</text>
  <text x="480" y="${190 + i * 32}" text-anchor="end" fill="${C.t1}" font-size="11" font-family="${FF}">${[450, 280, 890][i]} ₸</text>`).join("")}
  <line x1="100" y1="300" x2="500" y2="300" stroke="${C.brd}"/>
  <text x="100" y="336" fill="${C.t1}" font-size="14" font-weight="700" font-family="${FF}">Итого</text>
  <text x="480" y="336" text-anchor="end" fill="${C.green}" font-size="18" font-weight="700" font-family="${FF}">12 450 ₸</text>
  <rect x="100" y="360" width="400" height="44" rx="10" fill="${C.accent}22" stroke="${C.accent}"/>
  <text x="300" y="388" text-anchor="middle" fill="${C.accent}" font-size="12" font-weight="700" font-family="${FF}">Kaspi QR · оплатить</text>
  <rect x="540" y="80" width="${W - 580}" height="480" rx="12" fill="${C.card}" stroke="${C.brd}"/>
  <text x="560" y="118" fill="${C.t1}" font-size="14" font-weight="600" font-family="${FF}">После оплаты автоматически</text>
  <text x="560" y="152" fill="${C.t2}" font-size="10" font-family="${FF}">✓ Чек пробит</text>
  <text x="560" y="176" fill="${C.t2}" font-size="10" font-family="${FF}">✓ Склад списан</text>
  <text x="560" y="200" fill="${C.t2}" font-size="10" font-family="${FF}">✓ Выручка в KPI</text>
  <text x="560" y="224" fill="${C.t2}" font-size="10" font-family="${FF}">✓ Z-отчёт смены</text>`;
  return frame(C, body, "Торговля и POS");
}

function sceneBank(C) {
  const body = `
  ${sidebar(C, "Проводки")}
  <rect x="208" y="48" width="${W - 220}" height="40" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="224" y="74" fill="${C.t1}" font-size="13" font-weight="600" font-family="${FF}">Банк · платёжные поручения</text>
  <rect x="224" y="100" width="${W - 236}" height="420" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="238" y="128" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Выписка импортирована · 248 операций</text>
  ${[
    ["Поступление", "ТОО «Алма»", "+4 200 000 ₸", C.green],
    ["Оплата", "Аренда офиса", "−350 000 ₸", C.red],
    ["Оплата", "НДС к уплате", "−1 120 000 ₸", C.amber],
  ].map(([t, n, s, col], i) => `
  <text x="238" y="${168 + i * 56}" fill="${C.t3}" font-size="9" font-family="${FF}">${esc(t)}</text>
  <text x="320" y="${168 + i * 56}" fill="${C.t1}" font-size="10" font-family="${FF}">${esc(n)}</text>
  <text x="${W - 60}" y="${168 + i * 56}" text-anchor="end" fill="${col}" font-size="11" font-weight="700" font-family="${FF}">${esc(s)}</text>`).join("")}
  <rect x="238" y="360" width="220" height="36" rx="8" fill="url(#g)"/>
  <text x="348" y="383" text-anchor="middle" fill="#fff" font-size="11" font-weight="600" font-family="${FF}">Сопоставить с документами</text>`;
  return frame(C, body, "Деньги и банк");
}

function sceneAnalytics(C) {
  const body = `
  ${sidebar(C, "Главная")}
  <rect x="208" y="48" width="${W - 220}" height="40" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="224" y="74" fill="${C.t1}" font-size="13" font-weight="600" font-family="${FF}">Аналитика и бюджет</text>
  <rect x="224" y="100" width="280" height="80" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="238" y="122" fill="${C.t3}" font-size="9" font-family="${FF}">Выручка YTD</text>
  <text x="238" y="158" fill="${C.green}" font-size="20" font-weight="700" font-family="${FF}">14,2 млн ₸</text>
  <rect x="520" y="100" width="280" height="80" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="534" y="122" fill="${C.t3}" font-size="9" font-family="${FF}">EBITDA</text>
  <text x="534" y="158" fill="${C.accent}" font-size="20" font-weight="700" font-family="${FF}">3,85 млн ₸</text>
  <rect x="816" y="100" width="${W - 828}" height="80" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="830" y="122" fill="${C.t3}" font-size="9" font-family="${FF}">Cash</text>
  <text x="830" y="158" fill="${C.blue}" font-size="20" font-weight="700" font-family="${FF}">2,4 млн ₸</text>
  <rect x="224" y="196" width="520" height="220" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="238" y="220" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">P&L · план vs факт</text>
  ${[0.72, 0.58, 0.74].map((v, i) => `
  <rect x="${250 + i * 160}" y="${380 - v * 140}" width="100" height="${v * 140}" rx="6" fill="url(#g)" opacity="${0.5 + i * 0.15}"/>`).join("")}
  <rect x="760" y="196" width="${W - 772}" height="220" rx="10" fill="${C.card}" stroke="${C.brd}"/>
  <text x="774" y="220" fill="${C.t1}" font-size="12" font-weight="600" font-family="${FF}">Прогноз кэшфлоу</text>
  <polyline points="774,380 820,340 870,350 920,300 980,280 1040,260 1100,240" fill="none" stroke="${C.accent}" stroke-width="3"/>`;
  return frame(C, body, "Аналитика");
}

const FILES = {
  "hero-dashboard.svg": sceneHero,
  "ocr-scanner.svg": sceneOcr,
  "zhanara-chat.svg": sceneZhanara,
  "payroll.svg": scenePayroll,
};

const PRESENTATION_FILES = {
  "crm.svg": sceneCrm,
  "pos.svg": scenePos,
  "bank.svg": sceneBank,
  "analytics.svg": sceneAnalytics,
};

for (const [theme, C] of Object.entries(PALETTES)) {
  const dir = path.join(ROOT, "public", "landing", theme);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, fn] of Object.entries(FILES)) {
    fs.writeFileSync(path.join(dir, name), fn(C), "utf8");
  }
}

const presDir = path.join(ROOT, "presentation", "assets");
fs.mkdirSync(presDir, { recursive: true });
for (const [name, fn] of Object.entries(PRESENTATION_FILES)) {
  fs.writeFileSync(path.join(presDir, name), fn(PALETTES.dark), "utf8");
}

console.log("Landing images → public/landing/dark|light/ (4 files each)");
console.log("Presentation images → presentation/assets/ (crm, pos, bank, analytics)");
