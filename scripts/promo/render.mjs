#!/usr/bin/env node
/**
 * Рендер кадров промо-ролика из promo.html через Playwright (Chromium).
 * Анимация детерминированная: для каждого кадра вызывается window.seek(t).
 *
 * Использование:
 *   node render.mjs --format=horizontal
 *   node render.mjs --format=vertical --fps=30
 *   node render.mjs --html=promo-full-vertical.html --out=full-vertical --format=vertical
 *
 * Результат: frames/<out>/frame_00001.png ...
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORMATS = {
  horizontal: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 },
};

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
}

const format = arg("format", "horizontal");
const htmlFile = arg("html", "promo.html");
const outName = arg("out", format);
const fps = parseInt(arg("fps", "30"), 10);
const scale = parseFloat(arg("scale", "1"));

if (!FORMATS[format]) {
  console.error(`Неизвестный формат: ${format}. Доступно: ${Object.keys(FORMATS).join(", ")}`);
  process.exit(1);
}

const htmlPath = path.join(__dirname, htmlFile);
if (!fs.existsSync(htmlPath)) {
  console.error(`HTML не найден: ${htmlPath}`);
  process.exit(1);
}

const { width, height } = FORMATS[format];
const framesDir = path.join(__dirname, "frames", outName);
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const htmlUrl =
  pathToFileURL(htmlPath).href +
  `?capture=1&format=${format}` +
  (htmlFile.includes("full-vertical") ? "" : "");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: scale,
});

await page.goto(htmlUrl, { waitUntil: "networkidle" });
await page.waitForFunction("window.__promoReady === true && typeof window.seek === 'function'");

const boot = await page.evaluate(() => ({
  promoViz: !!window.PromoViz,
  vizBodies: document.querySelectorAll(".viz-body").length,
}));
if (!boot.promoViz || boot.vizBodies < 50) {
  console.error("Ошибка загрузки промо:", boot);
  const errs = await page.evaluate(() => window.__promoErrors || []);
  if (errs.length) console.error(errs);
  await browser.close();
  process.exit(1);
}

const duration = await page.evaluate(() => window.PROMO.duration);
const totalFrames = Math.ceil((duration / 1000) * fps);

const min = (duration / 60000).toFixed(1);
console.log(
  `${htmlFile} → ${outName} · ${width}x${height} · ${fps} fps · ${(duration / 1000).toFixed(0)} c (${min} мин) · ${totalFrames} кадров`
);

for (let i = 0; i < totalFrames; i++) {
  const t = (i / fps) * 1000;
  await page.evaluate((ms) => window.seek(ms), t);
  const file = path.join(framesDir, `frame_${String(i + 1).padStart(5, "0")}.png`);
  await page.screenshot({ path: file });
  if (i % 30 === 0 || i === totalFrames - 1) {
    process.stdout.write(`\r  кадр ${i + 1}/${totalFrames}`);
  }
}
process.stdout.write("\n");

await browser.close();
console.log(`Готово: ${framesDir}`);
