#!/usr/bin/env node
/**
 * Полный конвейер промо-ролика: рендер кадров (render.mjs) → склейка в MP4 (ffmpeg).
 * Делает оба формата (горизонтальный + вертикальный) по умолчанию.
 *
 *   node make-promo.mjs                 # оба формата
 *   node make-promo.mjs --format=vertical
 *   node make-promo.mjs --skip-render   # только пересобрать MP4 из готовых кадров
 *
 * Музыка: положите файл music.mp3 рядом — он добавится фоном (обрежется по длине видео).
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
}
const has = (flag) => process.argv.includes(`--${flag}`);

const fps = parseInt(arg("fps", "30"), 10);
const only = arg("format", null);
const formats = only ? [only] : ["horizontal", "vertical"];
const skipRender = has("skip-render");

const outDir = path.join(__dirname, "out");
fs.mkdirSync(outDir, { recursive: true });

const music = path.join(__dirname, "music.mp3");
const hasMusic = fs.existsSync(music);

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit" });
  if (res.error) throw res.error;
  return res.status;
}

function ffmpegAvailable() {
  const res = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return !res.error && res.status === 0;
}

for (const format of formats) {
  if (!skipRender) {
    console.log(`\n=== Рендер кадров: ${format} ===`);
    const status = run(node, [path.join(__dirname, "render.mjs"), `--format=${format}`, `--fps=${fps}`]);
    if (status !== 0) {
      console.error("Рендер кадров не удался. Установлен ли Playwright? (npm install && npx playwright install chromium)");
      process.exit(1);
    }
  }

  const framesDir = path.join(__dirname, "frames", format);
  const pattern = path.join(framesDir, "frame_%05d.png");
  const outFile = path.join(outDir, `finstat-promo-${format}.mp4`);

  if (!fs.existsSync(framesDir)) {
    console.error(`Нет кадров для ${format}: ${framesDir}. Запустите без --skip-render.`);
    continue;
  }

  if (!ffmpegAvailable()) {
    console.error("\nffmpeg не найден в PATH. Кадры готовы в:", framesDir);
    console.error("Установите ffmpeg (https://ffmpeg.org/download.html) и запустите: node make-promo.mjs --skip-render");
    continue;
  }

  console.log(`\n=== Склейка MP4: ${format}${hasMusic ? " + музыка" : ""} ===`);
  const args = ["-y", "-framerate", String(fps), "-i", pattern];
  if (hasMusic) args.push("-i", music);
  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "medium",
    "-crf", "20",
    "-movflags", "+faststart"
  );
  if (hasMusic) {
    args.push("-c:a", "aac", "-b:a", "160k", "-shortest");
  }
  args.push(outFile);

  const status = run("ffmpeg", args);
  if (status === 0) console.log("✅", outFile);
  else console.error("ffmpeg вернул ошибку для", format);
}

console.log("\nГотово. Файлы в:", outDir);
