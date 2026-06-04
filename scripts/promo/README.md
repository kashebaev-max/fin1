# Промо-ролик Finstat.kz

Рекламный ролик с интерфейсом программы — собирается **из кода**: анимация
(`promo.html`) → кадры (Playwright/Chromium) → видео MP4 (ffmpeg) с фоновой музыкой.

Делается **два формата** сразу:
- `finstat-promo-horizontal.mp4` — 1920×1080 (YouTube, сайт)
- `finstat-promo-vertical.mp4` — 1080×1920 (Reels / TikTok / Shorts)

Содержание (общий обзор, ~25 c): логотип → дашборд с KPI → скан документа (OCR) →
AI-помощник Жанара → проверка БИН → модули → призыв «30 дней бесплатно».

---

## Быстрый просмотр без рендера

Просто откройте `promo.html` в браузере — анимация проигрывается в цикле.
Для вертикального вида: `promo.html?format=vertical`.
Это можно записать любым экранным рекордером, если не хотите ставить ffmpeg.

---

## Полная сборка MP4

### 1. Установить зависимости (один раз)

```bash
cd scripts/promo
npm install
npx playwright install chromium
```

Установить **ffmpeg** (если ещё нет):
- Windows: https://ffmpeg.org/download.html → добавить в PATH (проверка: `ffmpeg -version`)
- или `choco install ffmpeg` / `scoop install ffmpeg`

### 2. (необязательно) Музыка

Положите royalty-free трек в `scripts/promo/music.mp3` — он добавится фоном и
обрежется по длине видео. Источники: YouTube Audio Library, Pixabay Music, Mixkit.

### 3. Собрать

```bash
npm run promo              # оба формата
# или по отдельности:
npm run promo:horizontal
npm run promo:vertical
```

Готовые файлы — в `scripts/promo/out/`.

---

## Полный обзор (все модули, только вертикаль)

Ролик **~4 минуты**, 1080×1920 — каждый модуль системы (60+ экранов):
разделы из меню → заголовок группы → каждый модуль с мок-интерфейсом → общая сетка → CTA.

**Просмотр в браузере (без установки):** откройте `promo-full-vertical.html` — анимация
идёт в цикле (~4 мин).

**Сборка MP4:**

```bash
cd scripts/promo
npm install
npx playwright install chromium
npm run promo:full-vertical
```

Результат: `out/finstat-promo-full-vertical.mp4`

Ускорить рендер (меньше fps): `node make-promo-full-vertical.mjs --fps=24`

Пересобрать MP4 из уже отрендеренных кадров (например, после добавления музыки):

```bash
npm run promo:rebuild
npm run promo:full-vertical:rebuild   # полный вертикальный ролик
```

---

## Параметры

```bash
node make-promo.mjs --format=vertical   # только один формат
node make-promo.mjs --fps=30            # частота кадров (по умолчанию 30)
node make-promo.mjs --skip-render       # только склейка из готовых кадров
```

---

## Как изменить содержание

Весь сценарий — в `promo.html`:
- массив `SCENES` (тайминги сцен в мс) — длительность и порядок;
- секции `<section class="scene" data-scene="N">` — что показано в кадре;
- функция `renderScene(i, p)` — анимация внутри сцены (p = прогресс 0..1).

Тексты (выручка, БИН, наименование, призыв) меняются прямо в разметке сцен.
Цвета берутся из CSS-переменных в начале файла (совпадают с темой приложения).

---

## Если нет ffmpeg/Playwright

`make-promo.mjs` сам подскажет, чего не хватает. Кадры всё равно сохранятся в
`frames/<format>/` — из них можно собрать видео в любом редакторе (CapCut,
DaVinci Resolve) или онлайн-сервисе.
