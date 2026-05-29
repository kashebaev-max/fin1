#!/usr/bin/env node
/**
 * Генерация иллюстраций для справочного центра (SVG → public/help/).
 * Запуск: node scripts/generate-help-screenshots.mjs
 * Для реальных скриншотов с prod: .scripts/screenshots/generate-screenshots.js (Playwright)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "help");
const W = 1280;
const H = 720;

const C = {
  bg: "#0f1117",
  sidebar: "#141720",
  card: "#1a1d27",
  brd: "#2a2f3d",
  t1: "#e8eaef",
  t2: "#9ca3af",
  t3: "#6b7280",
  accent: "#6366F1",
  purple: "#A855F7",
  green: "#10B981",
  red: "#EF4444",
  amber: "#F59E0B",
  portal: "#1e40af",
};

function esc(t) {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseManifest() {
  const text = fs.readFileSync(path.join(ROOT, "lib", "help-content.ts"), "utf8");
  const re = /screenshot: "\/help\/([^"]+)"/g;
  const paths = [];
  let m;
  while ((m = re.exec(text))) paths.push(m[1]);
  return [...new Set(paths)];
}

function titleFromPath(rel) {
  const name = path.basename(rel, ".svg").replace(/^\d+-/, "");
  const map = {
    homepage: "Главная страница finstat.kz",
    "login-button": "Кнопка «Войти»",
    "register-tab": "Регистрация",
    form: "Форма",
    "confirm-email": "Подтверждение email",
    dashboard: "Главная (дашборд)",
    "company-settings": "Настройки — реквизиты",
    "tax-mode": "Режим налогообложения",
    employees: "Сотрудники",
    counterparties: "Контрагенты",
    modules: "Управление модулями",
    sidebar: "Боковое меню",
    search: "Поиск модулей",
    header: "Шапка",
    "zhanara-button": "Кнопка Жанары",
    notifications: "Уведомления",
    collapse: "Свёрнутое меню",
    portal: "cabinet.salyk.kz",
  };
  return map[name] || name.replace(/-/g, " ");
}

function frame(children, badge = "Finstat.kz") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.accent}"/>
      <stop offset="100%" stop-color="${C.purple}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="0" y="0" width="${W}" height="36" fill="#0a0c10"/>
  <circle cx="20" cy="18" r="6" fill="#EF4444"/><circle cx="40" cy="18" r="6" fill="#F59E0B"/><circle cx="60" cy="18" r="6" fill="#10B981"/>
  <text x="90" y="22" fill="${C.t3}" font-family="Segoe UI, Arial, sans-serif" font-size="12">${esc(badge)}</text>
  ${children}
  <text x="${W - 16}" y="${H - 10}" text-anchor="end" fill="${C.t3}" font-family="Segoe UI, Arial, sans-serif" font-size="10">Иллюстрация интерфейса</text>
</svg>`;
}

function landingSvg(title) {
  return frame(`
  <rect x="0" y="36" width="${W}" height="${H - 36}" fill="url(#g)" opacity="0.15"/>
  <text x="${W / 2}" y="120" text-anchor="middle" fill="${C.t1}" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="700">Finstat.kz</text>
  <text x="${W / 2}" y="165" text-anchor="middle" fill="${C.t2}" font-family="Segoe UI, Arial, sans-serif" font-size="18">ERP и бухгалтерия для Казахстана · НК РК 2026</text>
  <rect x="${W / 2 - 90}" y="220" width="180" height="44" rx="10" fill="url(#g)"/>
  <text x="${W / 2}" y="248" text-anchor="middle" fill="#fff" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">Начать бесплатно</text>
  <rect x="${W - 130}" y="52" width="100" height="32" rx="8" fill="${C.card}" stroke="${C.purple}" stroke-width="2"/>
  <text x="${W - 80}" y="73" text-anchor="middle" fill="${C.purple}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">Войти</text>
  <text x="48" y="${H - 80}" fill="${C.t1}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600">${esc(title)}</text>
  `, "finstat.kz");
}

function authSvg(title) {
  const cx = W / 2;
  return frame(`
  <rect x="${cx - 220}" y="100" width="440" height="480" rx="16" fill="${C.card}" stroke="${C.brd}"/>
  <text x="${cx}" y="150" text-anchor="middle" fill="${C.t1}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700">Finstat.kz</text>
  <rect x="${cx - 180}" y="170" width="170" height="32" rx="8" fill="${C.accent}20" stroke="${C.accent}"/>
  <text x="${cx - 95}" y="191" text-anchor="middle" fill="${C.accent}" font-size="12" font-family="Segoe UI">Войти</text>
  <rect x="${cx + 10}" y="170" width="170" height="32" rx="8" fill="url(#g)"/>
  <text x="${cx + 95}" y="191" text-anchor="middle" fill="#fff" font-size="12" font-family="Segoe UI">Регистрация</text>
  <rect x="${cx - 180}" y="230" width="360" height="36" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="${cx - 165}" y="253" fill="${C.t3}" font-size="12" font-family="Segoe UI">Email</text>
  <rect x="${cx - 180}" y="280" width="360" height="36" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="${cx - 165}" y="303" fill="${C.t3}" font-size="12" font-family="Segoe UI">Пароль</text>
  <rect x="${cx - 180}" y="330" width="360" height="36" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="${cx - 165}" y="353" fill="${C.t3}" font-size="12" font-family="Segoe UI">ФИО · Организация · Телефон</text>
  <rect x="${cx - 180}" y="400" width="360" height="44" rx="10" fill="url(#g)"/>
  <text x="${cx}" y="428" text-anchor="middle" fill="#fff" font-size="14" font-weight="600" font-family="Segoe UI">Зарегистрироваться</text>
  <text x="48" y="${H - 80}" fill="${C.t1}" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600">${esc(title)}</text>
  `);
}

function portalSvg(title) {
  return frame(`
  <rect x="40" y="70" width="${W - 80}" height="${H - 120}" rx="12" fill="#f8fafc" stroke="${C.portal}"/>
  <rect x="40" y="70" width="${W - 80}" height="48" rx="12" fill="${C.portal}"/>
  <text x="60" y="100" fill="#fff" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600">cabinet.salyk.kz — КГД</text>
  <text x="60" y="160" fill="#1e293b" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="600">Налоговая отчётность</text>
  <rect x="60" y="190" width="280" height="40" rx="8" fill="#dbeafe" stroke="${C.portal}"/>
  <text x="75" y="215" fill="${C.portal}" font-size="13" font-family="Segoe UI">Импорт декларации (XML)</text>
  <rect x="60" y="250" width="200" height="36" rx="8" fill="${C.portal}"/>
  <text x="160" y="273" text-anchor="middle" fill="#fff" font-size="13" font-family="Segoe UI">Подписать ЭЦП</text>
  <text x="48" y="${H - 80}" fill="${C.t1}" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600">${esc(title)}</text>
  `, "cabinet.salyk.kz");
}

function zhanaraSvg(title) {
  return frame(`
  <rect x="220" y="56" width="${W - 240}" height="${H - 72}" rx="12" fill="${C.card}" stroke="${C.brd}"/>
  <rect x="0" y="36" width="200" height="${H - 36}" fill="${C.sidebar}"/>
  <text x="24" y="80" fill="${C.t1}" font-size="14" font-family="Segoe UI">⬡ Главная</text>
  <text x="24" y="110" fill="${C.t2}" font-size="12" font-family="Segoe UI">💼 Продажи</text>
  <text x="24" y="140" fill="${C.t2}" font-size="12" font-family="Segoe UI">📒 Бухгалтерия</text>
  <rect x="${W - 420}" y="80" width="380" height="${H - 120}" rx="12" fill="${C.bg}" stroke="${C.purple}" stroke-width="2"/>
  <text x="${W - 400}" y="115" fill="${C.purple}" font-size="16" font-weight="700" font-family="Segoe UI">✦ Жанара</text>
  <rect x="${W - 400}" y="140" width="300" height="56" rx="10" fill="${C.card}"/>
  <text x="${W - 385}" y="175" fill="${C.t2}" font-size="12" font-family="Segoe UI">Сколько НДС к уплате за квартал?</text>
  <rect x="${W - 400}" y="210" width="320" height="80" rx="10" fill="${C.purple}18" stroke="${C.purple}40"/>
  <text x="${W - 385}" y="240" fill="${C.t1}" font-size="11" font-family="Segoe UI">По вашим данным за период...</text>
  <text x="48" y="${H - 80}" fill="${C.t1}" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600">${esc(title)}</text>
  `);
}

function dashboardSvg(title, variant = "default") {
  const highlight = variant === "search" ? `<rect x="12" y="52" width="176" height="28" rx="6" fill="${C.accent}30" stroke="${C.accent}" stroke-width="2"/>` : "";
  const bell = variant === "notifications" ? `<circle cx="${W - 100}" cy="88" r="18" fill="${C.amber}30" stroke="${C.amber}" stroke-width="2"/>` : "";
  const janara = variant === "zhanara" ? `<circle cx="${W - 48}" cy="${H - 48}" r="28" fill="url(#g)" stroke="#fff" stroke-width="3"/>` : "";
  const collapsed = variant === "collapse" ? "" : `<text x="24" y="110" fill="${C.t2}" font-size="11" font-family="Segoe UI">Контрагенты</text>`;

  return frame(`
  <rect x="0" y="36" width="200" height="${H - 36}" fill="${C.sidebar}"/>
  <text x="24" y="72" fill="url(#g)" font-size="18" font-weight="700" font-family="Segoe UI">F</text>
  ${highlight}
  <text x="24" y="80" fill="${C.t1}" font-size="12" font-family="Segoe UI">⬡ Главная</text>
  ${collapsed}
  <text x="24" y="135" fill="${C.t2}" font-size="11" font-family="Segoe UI">📦 Склад</text>
  <text x="24" y="160" fill="${C.t2}" font-size="11" font-family="Segoe UI">📊 Налоги</text>
  <rect x="220" y="56" width="${W - 240}" height="48" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="240" y="86" fill="${C.t1}" font-size="14" font-weight="600" font-family="Segoe UI">Модуль</text>
  ${bell}
  <rect x="220" y="120" width="${W - 240}" height="${H - 140}" rx="12" fill="${C.card}" stroke="${C.brd}"/>
  <rect x="240" y="145" width="200" height="70" rx="8" fill="${C.bg}"/>
  <rect x="460" y="145" width="200" height="70" rx="8" fill="${C.bg}"/>
  <rect x="240" y="240" width="${W - 280}" height="180" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <line x1="260" y1="280" x2="900" y2="280" stroke="${C.brd}" stroke-width="1"/>
  <line x1="260" y1="320" x2="900" y2="320" stroke="${C.brd}" stroke-width="1"/>
  <line x1="260" y1="360" x2="900" y2="360" stroke="${C.brd}" stroke-width="1"/>
  ${janara}
  <text x="48" y="${H - 80}" fill="${C.t1}" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600">${esc(title)}</text>
  `);
}

function formSvg(title) {
  return frame(`
  <rect x="0" y="36" width="200" height="${H - 36}" fill="${C.sidebar}"/>
  <text x="24" y="80" fill="${C.t1}" font-size="12" font-family="Segoe UI">⬡ Главная</text>
  <rect x="240" y="80" width="480" height="${H - 120}" rx="12" fill="${C.card}" stroke="${C.purple}" stroke-width="2"/>
  <text x="260" y="115" fill="${C.t1}" font-size="15" font-weight="600" font-family="Segoe UI">Форма</text>
  <rect x="260" y="140" width="440" height="36" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <rect x="260" y="190" width="440" height="36" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <rect x="260" y="240" width="440" height="36" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <rect x="260" y="300" width="160" height="40" rx="10" fill="url(#g)"/>
  <text x="340" y="326" text-anchor="middle" fill="#fff" font-size="13" font-family="Segoe UI">Сохранить</text>
  <text x="48" y="${H - 80}" fill="${C.t1}" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="600">${esc(title)}</text>
  `);
}

function pickVariant(rel) {
  if (rel.includes("search")) return "search";
  if (rel.includes("notification")) return "notifications";
  if (rel.includes("zhanara") && rel.includes("03-interface")) return "zhanara";
  if (rel.includes("collapse")) return "collapse";
  return "default";
}

function pickTemplate(rel) {
  if (rel.startsWith("01-registration/")) {
    if (rel.includes("homepage")) return "landing";
    return "auth";
  }
  if (rel.startsWith("15-sono-submit/")) return "portal";
  if (rel.startsWith("16-zhanara/") || rel.startsWith("17-actions/")) return "zhanara";
  if (/form|mapping|upload|period|month|calculate|login|portal|import|sign|confirm|tab|profile-tab|open-settings|add-button|new\.png|02-new/.test(rel)) return "form";
  return "dashboard";
}

function generate(rel) {
  const title = titleFromPath(rel);
  const tpl = pickTemplate(rel);
  switch (tpl) {
    case "landing":
      return landingSvg(title);
    case "auth":
      return authSvg(title);
    case "portal":
      return portalSvg(title);
    case "zhanara":
      return zhanaraSvg(title);
    case "form":
      return formSvg(title);
    default:
      return dashboardSvg(title, pickVariant(rel));
  }
}

function main() {
  const manifest = parseManifest().map((p) => p.replace(/\.png$/, ".svg"));
  let n = 0;
  for (const rel of manifest) {
    const full = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, generate(rel), "utf8");
    n++;
  }
  console.log(`Generated ${n} SVG illustrations in public/help/`);
}

main();
