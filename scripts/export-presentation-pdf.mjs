#!/usr/bin/env node
/**
 * Экспорт локальной презентации в PDF (не для сайта).
 *   node scripts/export-presentation-pdf.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PRES = path.join(ROOT, "presentation");
const HTML = path.join(PRES, "index.html");
const OUT = path.join(PRES, "finstat-presentation.pdf");

const playwrightEntry = path.join(ROOT, "scripts", "promo", "node_modules", "playwright", "index.mjs");
if (!fs.existsSync(playwrightEntry)) {
  console.error("Playwright не найден. Выполните: cd scripts/promo && npm install && npx playwright install chromium");
  process.exit(1);
}
if (!fs.existsSync(HTML)) {
  console.error("Нет presentation/index.html — сначала: npm run presentation:build");
  process.exit(1);
}

const { chromium } = await import(pathToFileURL(playwrightEntry).href);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});

const url = pathToFileURL(HTML).href;
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelectorAll(".slide").length > 0);
await page.evaluate(() => document.fonts?.ready);
await page.waitForTimeout(400);

await page.pdf({
  path: OUT,
  width: "1920px",
  height: "1080px",
  printBackground: true,
  preferCSSPageSize: false,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

await browser.close();

const publicPdf = path.join(ROOT, "public", "presentation", "finstat-presentation.pdf");
fs.mkdirSync(path.dirname(publicPdf), { recursive: true });
fs.copyFileSync(OUT, publicPdf);

const sizeMb = (fs.statSync(OUT).size / (1024 * 1024)).toFixed(2);
console.log(`PDF сохранён: ${OUT} (${sizeMb} MB)`);
console.log(`На сайте: ${publicPdf}`);
