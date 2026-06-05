#!/usr/bin/env node
/**
 * Собирает презентацию: локально (presentation/) и для сайта (public/presentation/).
 *   node scripts/build-presentation.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PRES = path.join(ROOT, "presentation");
const ASSETS = path.join(PRES, "assets");
const PUBLIC = path.join(ROOT, "public", "presentation");
const PUBLIC_ASSETS = path.join(PUBLIC, "assets");

const COPIES = [
  ["public/landing/dark/hero-dashboard.svg", "hero-dashboard.svg"],
  ["public/landing/dark/payroll.svg", "payroll.svg"],
  ["public/landing/dark/zhanara-chat.svg", "zhanara-chat.svg"],
  ["public/landing/dark/ocr-scanner.svg", "ocr-scanner.svg"],
  ["public/help/03-interface/01-sidebar.svg", "sidebar.svg"],
  ["public/help/08-stock/01-list.svg", "stock.svg"],
  ["public/help/10-osv/01-table.svg", "osv.svg"],
  ["public/help/13-fno/01-overview.svg", "fno.svg"],
  ["public/help/06-orders/02-new.svg", "order-new.svg"],
  ["public/help/02-first-setup/05-modules.svg", "modules.svg"],
  ["public/help/18-migration/02-open.svg", "migration.svg"],
];

function copyAssets(dir) {
  fs.mkdirSync(dir, { recursive: true });
  let ok = 0;
  for (const [src, dest] of COPIES) {
    const from = path.join(ROOT, src);
    const to = path.join(dir, dest);
    if (!fs.existsSync(from)) {
      console.warn("Пропуск (нет файла):", src);
      continue;
    }
    fs.copyFileSync(from, to);
    ok++;
  }
  const extra = ["crm.svg", "pos.svg", "bank.svg", "analytics.svg"];
  for (const name of extra) {
    const from = path.join(ASSETS, name);
    const to = path.join(dir, name);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, to);
      ok++;
    }
  }
  return ok;
}

copyAssets(ASSETS);
const ok = copyAssets(PUBLIC_ASSETS);

const indexSrc = path.join(PRES, "index.html");
if (fs.existsSync(indexSrc)) {
  fs.mkdirSync(PUBLIC, { recursive: true });
  fs.copyFileSync(indexSrc, path.join(PUBLIC, "index.html"));
}

const pdfSrc = path.join(PRES, "finstat-presentation.pdf");
if (fs.existsSync(pdfSrc)) {
  fs.copyFileSync(pdfSrc, path.join(PUBLIC, "finstat-presentation.pdf"));
}

console.log(`Локально: ${PRES}`);
console.log(`На сайте: ${PUBLIC}`);
console.log(`Скопировано ${ok} изображений в каждую папку assets/`);
console.log("Откройте: /presentation/ или presentation/index.html");
