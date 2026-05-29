#!/usr/bin/env node
/**
 * Иллюстрации справочного центра с образцами данных (KPI, таблицы, графики).
 * node scripts/generate-help-screenshots.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "help");
const W = 1280;
const H = 720;
const FF = "Segoe UI, Arial, sans-serif";

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
  blue: "#3B82F6",
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
  return name.replace(/-/g, " ");
}

// ─── Примитивы UI ───

function kpi(x, y, w, h, label, value, sub, color = C.accent) {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="${x + 14}" y="${y + 22}" fill="${C.t3}" font-family="${FF}" font-size="10">${esc(label)}</text>
  <text x="${x + 14}" y="${y + 48}" fill="${color}" font-family="${FF}" font-size="20" font-weight="700">${esc(value)}</text>
  <text x="${x + 14}" y="${y + 64}" fill="${C.t2}" font-family="${FF}" font-size="9">${esc(sub)}</text>`;
}

function barChart(x, y, w, h, bars, title = "Выручка по месяцам") {
  const max = Math.max(...bars.map((b) => b.v), 1);
  const pad = 36;
  const chartH = h - pad - 24;
  const barW = (w - 40) / bars.length - 8;
  let barsSvg = "";
  bars.forEach((b, i) => {
    const bh = Math.max(4, (b.v / max) * chartH);
    const bx = x + 20 + i * (barW + 8);
    const by = y + pad + chartH - bh;
    barsSvg += `
    <rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="4" fill="${b.color || C.accent}" opacity="0.9"/>
    <text x="${bx + barW / 2}" y="${y + h - 8}" text-anchor="middle" fill="${C.t3}" font-family="${FF}" font-size="9">${esc(b.label)}</text>`;
  });
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="${x + 14}" y="${y + 20}" fill="${C.t1}" font-family="${FF}" font-size="12" font-weight="600">${esc(title)}</text>
  ${barsSvg}
  <line x1="${x + 14}" y1="${y + pad + chartH}" x2="${x + w - 14}" y2="${y + pad + chartH}" stroke="${C.brd}"/>`;
}

function lineChart(x, y, w, h, points, title = "Динамика") {
  const pad = { t: 28, r: 16, b: 28, l: 48 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = cw / (points.length - 1);
  let d = "";
  points.forEach((v, i) => {
    const px = x + pad.l + i * step;
    const py = y + pad.t + ch - ((v - min) / range) * ch;
    d += (i === 0 ? "M" : "L") + `${px},${py} `;
  });
  const area = d + ` L ${x + pad.l + cw},${y + pad.t + ch} L ${x + pad.l},${y + pad.t + ch} Z`;
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="${x + 14}" y="${y + 18}" fill="${C.t1}" font-family="${FF}" font-size="12" font-weight="600">${esc(title)}</text>
  <path d="${area}" fill="${C.accent}" opacity="0.15"/>
  <path d="${d}" fill="none" stroke="${C.accent}" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="${x + pad.l}" y1="${y + pad.t + ch}" x2="${x + pad.l + cw}" y2="${y + pad.t + ch}" stroke="${C.brd}"/>`;
}

function donut(x, y, r, pct, label, color = C.green) {
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return `
  <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${C.brd}" stroke-width="12"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
    stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${x} ${y})"/>
  <text x="${x}" y="${y + 5}" text-anchor="middle" fill="${C.t1}" font-family="${FF}" font-size="14" font-weight="700">${pct}%</text>
  <text x="${x}" y="${y + r + 22}" text-anchor="middle" fill="${C.t3}" font-family="${FF}" font-size="9">${esc(label)}</text>`;
}

function table(x, y, w, h, headers, rows, title = "") {
  const colW = (w - 24) / headers.length;
  let head = "";
  headers.forEach((h, i) => {
    head += `<text x="${x + 12 + i * colW}" y="${y + (title ? 36 : 22)}" fill="${C.t3}" font-family="${FF}" font-size="9" font-weight="600">${esc(h)}</text>`;
  });
  let body = "";
  rows.forEach((row, ri) => {
    const ry = y + (title ? 48 : 34) + ri * 28;
    row.forEach((cell, ci) => {
      const fill = ci === row.length - 1 && String(cell).includes("₸") ? C.t1 : C.t2;
      const weight = ci === 0 ? "600" : "400";
      body += `<text x="${x + 12 + ci * colW}" y="${ry}" fill="${fill}" font-family="${FF}" font-size="10" font-weight="${weight}">${esc(cell)}</text>`;
    });
    if (ri < rows.length - 1) {
      body += `<line x1="${x + 8}" y1="${ry + 10}" x2="${x + w - 8}" y2="${ry + 10}" stroke="${C.brd}" opacity="0.6"/>`;
    }
  });
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.bg}" stroke="${C.brd}"/>
  ${title ? `<text x="${x + 14}" y="${y + 20}" fill="${C.t1}" font-family="${FF}" font-size="12" font-weight="600">${esc(title)}</text>` : ""}
  ${head}
  ${body}`;
}

function input(x, y, w, label, value) {
  return `
  <text x="${x}" y="${y - 4}" fill="${C.t3}" font-family="${FF}" font-size="10">${esc(label)}</text>
  <rect x="${x}" y="${y}" width="${w}" height="34" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="${x + 12}" y="${y + 22}" fill="${C.t1}" font-family="${FF}" font-size="11">${esc(value)}</text>`;
}

function sidebar(active = "Главная", collapsed = false) {
  if (collapsed) {
    return `<rect x="0" y="36" width="56" height="${H - 36}" fill="${C.sidebar}"/>
    <text x="28" y="72" text-anchor="middle" fill="url(#g)" font-size="16" font-family="${FF}">F</text>
    <text x="28" y="110" text-anchor="middle" fill="${C.t2}" font-size="14">⬡</text>
    <text x="28" y="140" text-anchor="middle" fill="${C.t2}" font-size="14">👥</text>`;
  }
  const items = ["⬡ Главная", "👥 Контрагенты", "📋 Заказы", "📦 Склад", "📒 Проводки", "◎ Сотрудники", "📊 СОНО"];
  let menu = "";
  items.forEach((item, i) => {
    const y = 80 + i * 28;
    const on = item.includes(active) || (active === "Главная" && i === 0);
    if (on) menu += `<rect x="8" y="${y - 14}" width="184" height="24" rx="6" fill="${C.accent}25"/>`;
    menu += `<text x="24" y="${y}" fill="${on ? C.accent : C.t2}" font-family="${FF}" font-size="11" font-weight="${on ? "600" : "400"}">${esc(item)}</text>`;
  });
  return `
  <rect x="0" y="36" width="200" height="${H - 36}" fill="${C.sidebar}"/>
  <text x="24" y="68" fill="url(#g)" font-size="18" font-weight="700" font-family="${FF}">F</text>
  <rect x="12" y="52" width="176" height="28" rx="6" fill="${C.card}" stroke="${C.brd}"/>
  <text x="24" y="71" fill="${C.t3}" font-size="10" font-family="${FF}">🔍 контрагент</text>
  ${menu}`;
}

function headerBar(title = "Главная", extra = "") {
  return `
  <rect x="220" y="56" width="${W - 240}" height="48" rx="8" fill="${C.card}" stroke="${C.brd}"/>
  <text x="240" y="86" fill="${C.t1}" font-size="14" font-weight="600" font-family="${FF}">${esc(title)}</text>
  <text x="${W - 120}" y="86" fill="${C.t2}" font-size="11" font-family="${FF}">ТОО «Демо» · НДС</text>
  <circle cx="${W - 56}" cy="80" r="14" fill="${C.amber}30" stroke="${C.amber}"/>
  <text x="${W - 56}" y="84" text-anchor="middle" fill="${C.amber}" font-size="12">🔔</text>
  ${extra}`;
}

function janaraBtn() {
  return `<circle cx="${W - 48}" cy="${H - 48}" r="26" fill="url(#g)"/><text x="${W - 48}" y="${H - 42}" text-anchor="middle" fill="#fff" font-size="18">✦</text>`;
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
  <text x="90" y="22" fill="${C.t3}" font-family="${FF}" font-size="12">${esc(badge)}</text>
  ${children}
  <text x="${W - 16}" y="${H - 10}" text-anchor="end" fill="${C.t3}" font-family="${FF}" font-size="10">Демо-данные для обучения</text>
</svg>`;
}

function caption(title) {
  return `<text x="48" y="${H - 72}" fill="${C.t1}" font-family="${FF}" font-size="18" font-weight="600">${esc(title)}</text>`;
}

// ─── Сцены ───

function sceneDashboard(title, variant) {
  const bellOpen =
    variant === "notifications"
      ? `<rect x="${W - 280}" y="108" width="240" height="140" rx="10" fill="${C.card}" stroke="${C.amber}"/>
         <text x="${W - 265}" y="132" fill="${C.amber}" font-size="11" font-weight="600">🔔 Уведомления</text>
         <text x="${W - 265}" y="152" fill="${C.t2}" font-size="10">Срок ФНО 200.00 — 5 дн.</text>
         <text x="${W - 265}" y="172" fill="${C.t2}" font-size="10">Низкий остаток: Бумага А4</text>
         <text x="${W - 265}" y="192" fill="${C.t2}" font-size="10">Дебиторка: ТОО Альфа 2.3M ₸</text>`
      : "";
  const searchHi =
    variant === "search"
      ? `<rect x="12" y="52" width="176" height="28" rx="6" fill="${C.accent}40" stroke="${C.accent}" stroke-width="2"/>`
      : "";

  return frame(`
  ${sidebar(variant === "search" ? "Контрагенты" : "Главная", variant === "collapse")}
  ${searchHi}
  ${headerBar("Главная", bellOpen)}
  ${kpi(240, 118, 230, 72, "Касса", "1 240 000 ₸", "↑ 12% к прошлому мес.", C.green)}
  ${kpi(486, 118, 230, 72, "Банк", "8 560 000 ₸", "остаток на 29.05", C.blue)}
  ${kpi(732, 118, 230, 72, "Дебиторка", "2 310 720 ₸", "3 контрагента", C.amber)}
  ${kpi(978, 118, 230, 72, "НДС к уплате", "486 400 ₸", "1 кв. 2026", C.purple)}
  ${barChart(240, 204, 520, 200, [
    { label: "Янв", v: 42, color: C.accent },
    { label: "Фев", v: 58, color: C.accent },
    { label: "Мар", v: 51, color: C.accent },
    { label: "Апр", v: 72, color: C.purple },
    { label: "Май", v: 68, color: C.purple },
  ], "Выручка, тыс. ₸")}
  ${table(780, 204, 428, 200, ["Контрагент", "Сумма", "Срок"], [
    ["ТОО «Альфа»", "2 310 720 ₸", "просроч. 12 дн."],
    ["ИП Сейтова", "580 000 ₸", "до 05.06"],
    ["ТОО «Бета»", "120 000 ₸", "до 15.06"],
  ], "Главные должники")}
  ${lineChart(240, 418, 520, 160, [12, 18, 15, 22, 28, 24, 32, 30, 35, 38, 42, 45], "Оборот за 12 мес., млн ₸")}
  ${table(780, 418, 428, 160, ["Документ", "Сумма", "Статус"], [
    ["INV-2026-5785", "1 160 ₸", "проведён"],
    ["СФ-0042", "486 400 ₸", "черновик"],
    ["АКТ-118", "2 100 000 ₸", "проведён"],
  ], "Последние документы")}
  ${janaraBtn()}
  ${caption(title)}
  `);
}

function sceneTable(title, moduleName) {
  const rows = [
    ["ТОО «Альфа-Сервис»", "123456789012", "Клиент", "2 310 720 ₸"],
    ["ИП Сейтова А.К.", "901234567890", "Клиент", "580 000 ₸"],
    ["ТОО «Бета Трейд»", "987654321098", "Поставщик", "−420 000 ₸"],
    ["ТОО «Гамма»", "555555555555", "Оба", "95 000 ₸"],
    ["ТОО «Дельта»", "111222333444", "Поставщик", "−180 500 ₸"],
  ];
  return frame(`
  ${sidebar(moduleName)}
  ${headerBar(moduleName)}
  <rect x="240" y="118" width="${W - 260}" height="${H - 200}" rx="12" fill="${C.card}" stroke="${C.brd}"/>
  <rect x="960" y="128" width="140" height="36" rx="8" fill="url(#g)"/>
  <text x="1030" y="151" text-anchor="middle" fill="#fff" font-size="11" font-weight="600">+ Добавить</text>
  ${table(252, 178, W - 284, 380, ["Наименование", "БИН", "Тип", "Баланс"], rows)}
  ${caption(title)}
  ${janaraBtn()}
  `);
}

function sceneForm(title, fields) {
  const defaults = fields || [
    ["Наименование", 'ТОО «Альфа-Сервис»'],
    ["БИН", "123456789012"],
    ["Адрес", "г. Алматы, ул. Абая 150"],
    ["Телефон", "+7 707 123 45 67"],
    ["Email", "info@alpha-demo.kz"],
  ];
  let inputs = "";
  defaults.forEach((f, i) => {
    inputs += input(260, 150 + i * 52, 440, f[0], f[1]);
  });
  return frame(`
  ${sidebar()}
  ${headerBar("Форма")}
  <rect x="240" y="118" width="500" height="${H - 200}" rx="12" fill="${C.card}" stroke="${C.purple}" stroke-width="2"/>
  <text x="260" y="142" fill="${C.t1}" font-size="14" font-weight="600">${esc(title)}</text>
  ${inputs}
  <rect x="260" y="${150 + defaults.length * 52 + 8}" width="140" height="38" rx="10" fill="url(#g)"/>
  <text x="330" y="${150 + defaults.length * 52 + 32}" text-anchor="middle" fill="#fff" font-size="12" font-weight="600">Сохранить</text>
  ${barChart(760, 140, 460, 220, [
    { label: "Пн", v: 35 }, { label: "Вт", v: 48 }, { label: "Ср", v: 42 },
    { label: "Чт", v: 55 }, { label: "Пт", v: 62 },
  ], "Активность за неделю")}
  ${lineChart(760, 380, 460, 200, [8, 12, 10, 15, 18, 22, 20], "Тренд продаж")}
  ${caption(title)}
  `);
}

function scenePayroll(title) {
  return frame(`
  ${sidebar("◎ Сотрудники")}
  ${headerBar("Расчёт зарплаты")}
  ${kpi(240, 118, 200, 68, "Сотрудников", "12", "активных", C.blue)}
  ${kpi(456, 118, 200, 68, "ФОТ", "4 850 000 ₸", "май 2026", C.purple)}
  ${kpi(672, 118, 200, 68, "ИПН", "412 300 ₸", "к уплате", C.amber)}
  ${kpi(888, 118, 200, 68, "ОПВ+СН", "892 100 ₸", "взносы", C.green)}
  ${table(240, 200, 620, 280, ["Сотрудник", "Оклад", "ИПН", "На руки"], [
    ["Касымова А.С.", "450 000 ₸", "38 250 ₸", "387 400 ₸"],
    ["Нурланов Б.К.", "380 000 ₸", "29 100 ₸", "328 500 ₸"],
    ["Ахметова Д.М.", "520 000 ₸", "48 600 ₸", "445 200 ₸"],
    ["Иванов П.С.", "410 000 ₸", "33 800 ₸", "358 900 ₸"],
  ], "Ведомость за май 2026")}
  ${barChart(880, 200, 328, 280, [
    { label: "ОПВ", v: 45, color: C.green },
    { label: "СН", v: 30, color: C.blue },
    { label: "ИПН", v: 55, color: C.amber },
    { label: "ВОСМС", v: 20, color: C.purple },
  ], "Структура удержаний, тыс. ₸")}
  ${caption(title)}
  `);
}

function sceneFno(title) {
  return frame(`
  ${sidebar("📊 СОНО")}
  ${headerBar("Формы ФНО")}
  ${kpi(240, 118, 180, 70, "910.00", "4% Упрощ.", "до 15.08", C.green)}
  ${kpi(432, 118, 180, 70, "200.00", "Соц.налоги", "до 15.05", C.amber)}
  ${kpi(624, 118, 180, 70, "300.00", "НДС 16%", "до 15.05", C.purple)}
  ${kpi(816, 118, 180, 70, "100.00", "КПН 20%", "до 31.03", C.blue)}
  ${barChart(240, 200, 500, 200, [
    { label: "Q1", v: 40 }, { label: "Q2", v: 65 }, { label: "Q3", v: 55 }, { label: "Q4", v: 70 },
  ], "Налоговая нагрузка по кварталам, тыс. ₸")}
  ${donut(920, 300, 52, 72, "Сдано в срок", C.green)}
  ${table(1000, 200, 208, 200, ["Форма", "Статус"], [
    ["200.00 Q1", "✓ XML готов"],
    ["300.00 Q1", "⏳ расчёт"],
    ["910 H1", "— не срок"],
  ])}
  ${caption(title)}
  `);
}

function sceneSono(title) {
  return frame(`
  ${sidebar("📊 СОНО")}
  ${headerBar("СОНО — подача ФНО")}
  <rect x="240" y="118" width="380" height="320" rx="10" fill="${C.bg}" stroke="${C.brd}"/>
  <text x="260" y="142" fill="${C.t1}" font-size="12" font-weight="600">📅 Календарь сроков</text>
  <text x="260" y="168" fill="${C.red}" font-size="10">🔴 200.00 — просрочено 2 дн.</text>
  <text x="260" y="190" fill="${C.amber}" font-size="10">🟡 300.00 — осталось 5 дн.</text>
  <text x="260" y="212" fill="${C.green}" font-size="10">🟢 910.00 — до 15.08</text>
  ${barChart(260, 230, 340, 120, [
    { label: "ИПН", v: 55, color: C.amber },
    { label: "СН", v: 40, color: C.green },
    { label: "ОПВ", v: 48, color: C.blue },
    { label: "НДС", v: 70, color: C.purple },
  ], "ФНО 200.00 — суммы, тыс. ₸")}
  <rect x="640" y="118" width="${W - 660}" height="320" rx="10" fill="${C.bg}" stroke="${C.purple}"/>
  <text x="660" y="142" fill="${C.purple}" font-size="12" font-weight="600">Расчёт 200.00 · Q1 2026</text>
  ${kpi(660, 155, 160, 58, "ИПН", "412 300 ₸", "", C.amber)}
  ${kpi(832, 155, 160, 58, "СН", "291 000 ₸", "", C.green)}
  ${kpi(1004, 155, 160, 58, "ОПВ", "485 000 ₸", "", C.blue)}
  ${lineChart(660, 230, 500, 120, [20, 28, 35, 42, 48, 52], "Начисления по месяцам")}
  <rect x="660" y="370" width="200" height="36" rx="8" fill="url(#g)"/>
  <text x="760" y="393" text-anchor="middle" fill="#fff" font-size="11">📥 Скачать XML</text>
  ${caption(title)}
  `);
}

function sceneMigration(title) {
  const pct = title.includes("progress") ? 65 : 100;
  return frame(`
  ${sidebar()}
  ${headerBar("Миграция из 1С")}
  <rect x="240" y="140" width="${W - 280}" height="80" rx="8" fill="${C.bg}" stroke="${C.brd}"/>
  <rect x="260" y="168" width="${(W - 320) * pct / 100}" height="24" rx="6" fill="url(#g)"/>
  <text x="260" y="158" fill="${C.t2}" font-size="10">Импорт контрагентов: ${pct}%</text>
  ${table(240, 240, 480, 280, ["Статус", "Кол-во"], [
    ["✅ Импортировано", "847"],
    ["⏭ Пропущено", "23"],
    ["🔁 Дубликаты", "12"],
    ["❌ Ошибки", "3"],
  ])}
  ${barChart(740, 240, 468, 280, [
    { label: "Контр.", v: 85, color: C.green },
    { label: "Номенкл.", v: 62, color: C.accent },
    { label: "Сотрудн.", v: 45, color: C.blue },
    { label: "Проводки", v: 90, color: C.purple },
  ], "Импорт по типам данных")}
  ${caption(title)}
  `);
}

function sceneZhanara(title) {
  return frame(`
  ${sidebar()}
  ${headerBar("AI Жанара")}
  <rect x="${W - 430}" y="110" width="400" height="${H - 150}" rx="12" fill="${C.card}" stroke="${C.purple}" stroke-width="2"/>
  <text x="${W - 410}" y="138" fill="${C.purple}" font-size="14" font-weight="700">✦ Жанара</text>
  <rect x="${W - 410}" y="152" width="280" height="44" rx="10" fill="${C.bg}"/>
  <text x="${W - 395}" y="180" fill="${C.t2}" font-size="11">Сколько НДС к уплате за 1 кв.?</text>
  <rect x="${W - 410}" y="208" width="360" height="90" rx="10" fill="${C.purple}18" stroke="${C.purple}40"/>
  <text x="${W - 395}" y="232" fill="${C.t1}" font-size="11">НДС к уплате: 486 400 ₸</text>
  <text x="${W - 395}" y="252" fill="${C.t2}" font-size="10">Исходящий 1 240 000 − входящий 753 600</text>
  <text x="${W - 395}" y="272" fill="${C.t2}" font-size="10">Срок сдачи 300.00: до 15.05</text>
  ${barChart(240, 120, 480, 200, [
    { label: "НДС", v: 70, color: C.purple },
    { label: "ИПН", v: 45, color: C.amber },
    { label: "КПН", v: 30, color: C.blue },
  ], "Налоги, тыс. ₸")}
  ${lineChart(240, 340, 480, 180, [15, 22, 18, 28, 35, 32, 40], "Выручка по неделям, млн ₸")}
  ${kpi(740, 120, 200, 72, "Выручка МТД", "12.4M ₸", "+18%", C.green)}
  ${kpi(960, 120, 200, 72, "Расходы", "8.1M ₸", "май", C.amber)}
  ${caption(title)}
  ${janaraBtn()}
  `);
}

function landingSvg(title) {
  return frame(`
  <rect x="0" y="36" width="${W}" height="${H - 36}" fill="url(#g)" opacity="0.12"/>
  <text x="${W / 2}" y="110" text-anchor="middle" fill="${C.t1}" font-size="40" font-weight="700">Finstat.kz</text>
  <text x="${W / 2}" y="150" text-anchor="middle" fill="${C.t2}" font-size="16">ERP · НК РК 2026 · НДС 16%</text>
  ${barChart(200, 200, 420, 180, [
    { label: "Учёт", v: 80 }, { label: "ФНО", v: 65 }, { label: "ЗП", v: 55 }, { label: "Склад", v: 70 },
  ], "Возможности системы")}
  ${lineChart(660, 200, 480, 180, [10, 25, 40, 55, 70, 85, 95], "Рост эффективности, %")}
  <rect x="${W / 2 - 100}" y="420" width="200" height="44" rx="10" fill="url(#g)"/>
  <text x="${W / 2}" y="448" text-anchor="middle" fill="#fff" font-size="14" font-weight="600">Начать бесплатно — 30 дней</text>
  ${caption(title)}
  `, "finstat.kz");
}

function authSvg(title, filled = true) {
  const cx = W / 2;
  const vals = filled
    ? [
        ["Email", "demo@finstat.kz"],
        ["Пароль", "••••••••••"],
        ["ФИО", "Иванов Иван Иванович"],
        ["Организация", 'ТОО «Демо-Компания»'],
        ["Телефон", "87001234567"],
      ]
    : [["Email", ""], ["Пароль", ""]];
  let fields = "";
  vals.forEach((v, i) => {
    fields += input(cx - 180, 210 + i * 48, 360, v[0], v[1] || " ");
  });
  return frame(`
  <rect x="${cx - 220}" y="90" width="440" height="520" rx="16" fill="${C.card}" stroke="${C.brd}"/>
  <text x="${cx}" y="130" text-anchor="middle" fill="${C.t1}" font-size="20" font-weight="700">Finstat.kz</text>
  <rect x="${cx - 175}" y="148" width="165" height="30" rx="8" fill="${C.accent}20" stroke="${C.accent}"/>
  <text x="${cx - 92}" y="168" text-anchor="middle" fill="${C.accent}" font-size="11">Войти</text>
  <rect x="${cx + 10}" y="148" width="165" height="30" rx="8" fill="url(#g)"/>
  <text x="${cx + 92}" y="168" text-anchor="middle" fill="#fff" font-size="11">Регистрация</text>
  ${fields}
  <rect x="${cx - 180}" y="470" width="360" height="42" rx="10" fill="url(#g)"/>
  <text x="${cx}" y="497" text-anchor="middle" fill="#fff" font-size="13" font-weight="600">Зарегистрироваться</text>
  ${barChart(cx + 240, 120, 280, 200, [
    { label: "Янв", v: 30 }, { label: "Фев", v: 45 }, { label: "Мар", v: 52 },
  ], "Демо-дашборд")}
  ${caption(title)}
  `);
}

function portalSvg(title) {
  return frame(`
  <rect x="40" y="70" width="${W - 80}" height="${H - 120}" rx="12" fill="#f1f5f9" stroke="${C.portal}"/>
  <rect x="40" y="70" width="${W - 80}" height="44" fill="${C.portal}"/>
  <text x="60" y="98" fill="#fff" font-size="15" font-weight="600">cabinet.salyk.kz</text>
  ${table(60, 130, 500, 200, ["Поле", "Значение"], [
    ["Форма", "200.00"],
    ["Период", "Q1 2026"],
    ["ИПН", "412 300 ₸"],
    ["СН", "291 000 ₸"],
  ], "Импортированная декларация")}
  ${barChart(580, 130, 380, 200, [
    { label: "ИПН", v: 55 }, { label: "СН", v: 38 }, { label: "ОПВ", v: 48 },
  ], "Суммы в XML")}
  <rect x="60" y="360" width="180" height="36" rx="8" fill="${C.portal}"/>
  <text x="150" y="383" text-anchor="middle" fill="#fff" font-size="12">Подписать ЭЦП</text>
  ${caption(title)}
  `, "cabinet.salyk.kz");
}

function sceneStock(title) {
  return frame(`
  ${sidebar("📦 Склад")}
  ${headerBar("Остатки на складе")}
  ${table(240, 118, 520, 240, ["Товар", "Остаток", "Мин.", "Статус"], [
    ["Бумага А4", "8 шт", "20", "🔴 мало"],
    ["Картридж HP", "45 шт", "10", "🟢 норма"],
    ["Степлер", "3 шт", "5", "🟡 внимание"],
    ["Папки", "120 шт", "30", "🟢 норма"],
  ], "Остатки")}
  ${barChart(780, 118, 428, 240, [
    { label: "Норма", v: 70, color: C.green },
    { label: "Мало", v: 25, color: C.amber },
    { label: "Нет", v: 8, color: C.red },
  ], "Статусы остатков, %")}
  ${lineChart(240, 380, 968, 200, [100, 85, 72, 68, 55, 48, 42], "Движение товара за неделю")}
  ${caption(title)}
  `);
}

function sceneOsv(title) {
  return frame(`
  ${sidebar("📒 Проводки")}
  ${headerBar("ОСВ")}
  ${table(240, 118, 700, 300, ["Счёт", "Дебет", "Кредит", "Сальдо"], [
    ["1010 Касса", "5 240 000", "4 000 000", "1 240 000 Д"],
    ["1030 Банк", "18 200 000", "9 640 000", "8 560 000 Д"],
    ["1210 Дебиторы", "3 100 000", "789 280", "2 310 720 Д"],
    ["6010 Выручка", "0", "24 500 000", "24 500 000 К"],
  ], "Оборотно-сальдовая ведомость")}
  ${barChart(960, 118, 248, 300, [
    { label: "1010", v: 35 }, { label: "1030", v: 85 }, { label: "1210", v: 55 }, { label: "6010", v: 95 },
  ], "Обороты, млн ₸")}
  ${lineChart(240, 440, 968, 160, [8, 12, 15, 14, 18, 22, 20, 25], "Сальдо 1030 по дням")}
  ${caption(title)}
  `);
}

function pickScene(rel) {
  if (rel.startsWith("01-registration/")) {
    if (rel.includes("homepage")) return "landing";
    if (rel.includes("06-dashboard")) return "dashboard";
    return "auth";
  }
  if (rel.startsWith("15-sono-submit/")) return "portal";
  if (rel.startsWith("16-zhanara/") || rel.startsWith("17-actions/")) return "zhanara";
  if (rel.startsWith("12-payroll/")) return "payroll";
  if (rel.startsWith("13-fno/") || rel.startsWith("14-sono")) return rel.startsWith("14-sono") ? "sono" : "fno";
  if (rel.startsWith("18-migration/")) return "migration";
  if (rel.startsWith("08-stock/")) return "stock";
  if (rel.startsWith("10-osv/")) return "osv";
  if (/form|mapping|upload|add-button|02-new|03-form|profile|open-settings|tab|login|import|sign|confirm|period|month|calculate|director|bank|basic/.test(rel)) return "form";
  if (/list|employees|counterparties|orders|nomenclature|entries|exports|documents|log/.test(rel)) return "table";
  if (rel.includes("06-dashboard") || rel.startsWith("03-interface/")) return "dashboard";
  return "dashboard";
}

function generate(rel) {
  const title = titleFromPath(rel);
  const scene = pickScene(rel);
  const variant = rel.includes("search") ? "search" : rel.includes("notification") ? "notifications" : rel.includes("collapse") ? "collapse" : "default";

  switch (scene) {
    case "landing":
      return landingSvg(title);
    case "auth":
      return authSvg(title);
    case "portal":
      return portalSvg(title);
    case "zhanara":
      return sceneZhanara(title);
    case "payroll":
      return scenePayroll(title);
    case "fno":
      return sceneFno(title);
    case "sono":
      return sceneSono(title);
    case "migration":
      return sceneMigration(title);
    case "stock":
      return sceneStock(title);
    case "osv":
      return sceneOsv(title);
    case "form":
      return sceneForm(title);
    case "table": {
      const mod = rel.includes("counterparties") ? "Контрагенты" : rel.includes("orders") ? "Заказы" : rel.includes("nomenclature") ? "Номенклатура" : rel.includes("employees") || rel.includes("hr") ? "Сотрудники" : "Модуль";
      return sceneTable(title, mod);
    }
    case "dashboard":
    default:
      return sceneDashboard(title, variant);
  }
}

function main() {
  const manifest = parseManifest();
  for (const rel of manifest) {
    const full = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, generate(rel), "utf8");
  }
  console.log(`Generated ${manifest.length} SVG illustrations with sample data in public/help/`);
}

main();
