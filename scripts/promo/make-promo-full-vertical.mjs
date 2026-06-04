#!/usr/bin/env node
/**
 * Полный промо-ролик (все модули), только вертикальный формат 1080×1920.
 *
 *   node make-promo-full-vertical.mjs
 *   node make-promo-full-vertical.mjs --skip-render
 *   node make-promo-full-vertical.mjs --fps=24   # быстрее рендер
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
const has = (f) => process.argv.includes(`--${f}`);

const fps = parseInt(arg("fps", "30"), 10);
const skipRender = has("skip-render");
const outDir = path.join(__dirname, "out");
const outFile = path.join(outDir, "finstat-promo-full-vertical.mp4");
const framesDir = path.join(__dirname, "frames", "full-vertical");
const music = path.join(__dirname, "music.mp3");
const hasMusic = fs.existsSync(music);

fs.mkdirSync(outDir, { recursive: true });

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit" });
  if (res.error) throw res.error;
  return res.status;
}

function ffmpegOk() {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return !r.error && r.status === 0;
}

if (!skipRender) {
  console.log("=== Полный обзор Finstat (вертикаль) — рендер кадров ===");
  console.log("Ожидайте ~5–15 минут в зависимости от CPU...\n");
  const st = run(node, [
    path.join(__dirname, "render.mjs"),
    "--html=promo-full-vertical.html",
    "--out=full-vertical",
    "--format=vertical",
    `--fps=${fps}`,
  ]);
  if (st !== 0) process.exit(1);
}

if (!fs.existsSync(framesDir)) {
  console.error("Нет кадров:", framesDir);
  process.exit(1);
}

if (!ffmpegOk()) {
  console.error("\nffmpeg не найден. Кадры:", framesDir);
  console.error("Установите ffmpeg и: node make-promo-full-vertical.mjs --skip-render");
  process.exit(1);
}

console.log("\n=== Склейка MP4 ===");
const pattern = path.join(framesDir, "frame_%05d.png");
const args = ["-y", "-framerate", String(fps), "-i", pattern];
if (hasMusic) args.push("-i", music);
args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20", "-movflags", "+faststart");
if (hasMusic) args.push("-c:a", "aac", "-b:a", "160k", "-shortest");
args.push(outFile);

const st = run("ffmpeg", args);
if (st === 0) {
  console.log("\n✅ Готово:", outFile);
  const stat = fs.statSync(outFile);
  console.log("   Размер:", (stat.size / 1024 / 1024).toFixed(1), "MB");
} else {
  process.exit(1);
}
