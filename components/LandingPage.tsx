"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLandingTheme, type LandingVariant } from "@/lib/landing-theme";
import { getLandingImages } from "@/lib/landing-images";
import {
  getPublicModuleGroups,
  LANDING_AREAS,
  LANDING_CROSS_FEATURES,
  LANDING_FAQ_EXTRA,
  LANDING_PRESETS,
  LANDING_STATS,
} from "@/lib/landing-content";
import LandingVisual from "@/components/LandingVisual";

const MODULE_GROUPS_LANDING = getPublicModuleGroups();

type Props = {
  variant?: LandingVariant;
  showPreviewBanner?: boolean;
};

export default function LandingPage({ variant = "default", showPreviewBanner = false }: Props) {
  const landing = getLandingTheme(variant);
  const images = getLandingImages(variant);
  const [theme, setTheme] = useState<"light" | "dark">(landing.preferLight ? "light" : "dark");

  useEffect(() => {
    if (landing.preferLight) {
      document.documentElement.setAttribute("data-theme", "light");
      document.documentElement.setAttribute("data-landing", "light-trust");
      setTheme("light");
      return () => {
        document.documentElement.removeAttribute("data-landing");
      };
    }
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("finerp-theme") : null;
    const t = saved === "light" ? "light" : "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, [landing.preferLight]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    if (typeof window !== "undefined") window.localStorage.setItem("finerp-theme", next);
  }

  return (
    <div style={{ background: "var(--bg)", color: "var(--t1)", minHeight: "100vh" }}>
      {showPreviewBanner && (
        <div
          className="sticky top-0 z-20 flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 text-center"
          style={{ background: landing.ctaGradient, color: "#fff", fontSize: 12 }}
        >
          <span className="font-semibold">Превью дизайна • Вариант 2 — Light Trust</span>
          <Link href="/" className="underline font-medium" style={{ color: "#fff" }}>
            ← Текущий лендинг
          </Link>
        </div>
      )}
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--brd)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 10, backdropFilter: "blur(8px)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center font-extrabold text-white" style={{ width: 36, height: 36, borderRadius: 10, background: landing.gradient, fontSize: 16 }}>F</div>
            <div>
              <div className="text-lg font-extrabold">Finstat.kz</div>
              <div className="text-[9px] tracking-widest" style={{ color: "var(--t3)" }}>ЕДИНАЯ СИСТЕМА ДЛЯ БИЗНЕСА</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#modules" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>Модули</a>
            <a href="#features" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>Возможности</a>
            <a href="#ocr" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>OCR</a>
            <a href="#ai" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>AI Жанара</a>
            <a href="#faq" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>FAQ</a>
            <Link href="/presentation" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>Презентация системы</Link>

            {!landing.preferLight && (
              <button onClick={toggleTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer border-none"
                style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)", fontSize: 12 }}>
                <span style={{ fontSize: 14 }}>{theme === "dark" ? "☀️" : "🌙"}</span>
                <span className="font-medium">{theme === "dark" ? "Светлая" : "Тёмная"}</span>
              </button>
            )}

            <Link
              href="/auth"
              className="no-underline px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer inline-block"
              style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}
            >
              Войти
            </Link>
            <Link
              href="/auth"
              className="no-underline px-5 py-2 rounded-lg text-white text-xs font-semibold cursor-pointer inline-block"
              style={{ background: landing.gradient }}
            >
              Начать бесплатно
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6" style={{ background: landing.heroBadge.bg, border: `1px solid ${landing.heroBadge.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: landing.heroBadge.color, letterSpacing: "0.05em" }}>⚡ НОВЫЙ НАЛОГОВЫЙ КОДЕКС РК 2026 • ЗРК 214-VIII</span>
        </div>
        <h1 className="text-5xl font-extrabold mb-6" style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Умный помощник<br />
          <span style={{ background: landing.gradientText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            для вашего бизнеса
          </span>
        </h1>
        <p className="text-lg mb-6 max-w-2xl mx-auto" style={{ color: "var(--t2)" }}>
          CRM, торговля, склад, деньги, кадры, налоги и аналитика — в одном окне.<br />
          Для предпринимателей, менеджеров и бухгалтерии в Казахстане. НК РК 2026.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mb-8 max-w-3xl mx-auto">
          {LANDING_AREAS.map((area) => (
            <span
              key={area}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}
            >
              {area}
            </span>
          ))}
        </div>
        <div className="flex gap-3 justify-center mb-6">
          <Link
            href="/auth"
            className="no-underline px-8 py-4 rounded-xl text-white font-semibold cursor-pointer inline-block"
            style={{ background: landing.gradient, fontSize: 15 }}
          >
            Начать бесплатно →
          </Link>
          <Link
            href="/presentation"
            className="no-underline px-8 py-4 rounded-xl font-semibold cursor-pointer inline-block"
            style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 15 }}
          >
            Презентация системы
          </Link>
        </div>
        <div className="text-xs mb-10" style={{ color: "var(--t3)" }}>
          ✓ Без установки &nbsp;&nbsp; ✓ Замена 1С и Excel &nbsp;&nbsp; ✓ Kaspi-оплата &nbsp;&nbsp; ✓ Поддержка 💬 на сайте
        </div>
        <div className="max-w-4xl mx-auto">
          <LandingVisual src={images.hero} alt="Главная панель Finstat — KPI, графики и рекомендации Жанары" priority />
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {LANDING_STATS.map((s, i) => (
            <div key={i} className="rounded-xl p-5 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-3xl font-extrabold mb-1" style={{ background: landing.gradientText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.value}</div>
              <div className="text-sm font-bold">{s.label}</div>
              <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules map */}
      <section id="modules" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold mb-3" style={{ letterSpacing: "-0.02em" }}>
            Все процессы бизнеса — в одной системе
          </h2>
          <p className="text-sm max-w-2xl mx-auto" style={{ color: "var(--t2)" }}>
            {MODULE_GROUPS_LANDING.length} разделов и {LANDING_STATS[0].value} модулей: от первого лида до сдачи ФНО
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULE_GROUPS_LANDING.map((g) => (
            <div
              key={g.key}
              className="rounded-xl p-5"
              style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: `3px solid ${g.color}` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{g.icon}</span>
                <span className="text-sm font-bold">{g.name}</span>
                <span className="text-[10px] font-bold ml-auto px-2 py-0.5 rounded-full" style={{ background: `${g.color}22`, color: g.color }}>
                  {g.items.length}
                </span>
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--t3)", lineHeight: 1.55 }}>
                {g.description}
              </p>
              <div className="flex flex-wrap gap-1">
                {g.items.slice(0, 5).map((it) => (
                  <span
                    key={it.key}
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "var(--bg)", color: "var(--t2)", border: "1px solid var(--brd)" }}
                  >
                    {it.name}
                  </span>
                ))}
                {g.items.length > 5 && (
                  <span className="text-[9px] px-1.5 py-0.5" style={{ color: "var(--t3)" }}>
                    +{g.items.length - 5}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ╔══════════════════════════════════════════════╗ */}
      {/* ║   НОВАЯ СЕКЦИЯ: OCR СКАНЕР                  ║ */}
      {/* ╚══════════════════════════════════════════════╝ */}
      <section id="ocr" className="max-w-6xl mx-auto px-6 py-16">
        {/* Badge */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: landing.ocrBadge.bg, border: `1px solid ${landing.ocrBadge.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: landing.ocrBadge.color, letterSpacing: "0.05em" }}>📸 НОВОЕ • AI VISION</span>
          </div>
        </div>

        {/* Заголовок */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold mb-4" style={{ letterSpacing: "-0.03em", lineHeight: 1.15 }}>
            Сфотографировал чек —<br />
            <span style={{ background: landing.ocrHeadlineGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              готовая запись за 10 секунд
            </span>
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--t2)" }}>
            AI Жанара читает любой документ. Распознаёт суммы, БИН, даты, позиции — <br />
            и сама создаёт записи в системе. Никакого ручного ввода.
          </p>
        </div>

        <div className="mb-12 max-w-4xl mx-auto">
          <LandingVisual src={images.ocr} alt="Сканер документов: фото счёта и автоматическое распознавание с проводками" />
        </div>

        {/* 3-шаговая визуализация */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { 
              step: "1", 
              icon: "📷", 
              title: "Сфотографируй", 
              desc: "Открой камеру телефона или загрузи JPG/PNG/PDF. Подойдёт любой документ — чек, счёт-фактура, накладная, акт.",
              color: landing.stepColors[0]
            },
            { 
              step: "2", 
              icon: "✦", 
              title: "AI распознаёт", 
              desc: "Claude Vision API за 5-10 секунд извлекает поставщика, БИН, дату, позиции, НДС 16%, итоговую сумму.",
              color: landing.stepColors[1]
            },
            { 
              step: "3", 
              icon: "✓", 
              title: "Записи готовы", 
              desc: "Один клик — в системе готовы контрагент, товары и проводки. Склад, финансы и отчётность обновляются автоматически.",
              color: landing.stepColors[2]
            },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-6 relative" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: `3px solid ${s.color}` }}>
              <div className="flex items-center justify-center font-extrabold text-white mb-4" style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)`, fontSize: 18 }}>{s.step}</div>
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="text-base font-bold mb-2">{s.title}</div>
              <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Сравнение времени */}
        <div className="rounded-2xl p-8 mb-10" style={{ background: landing.ocrCompareBg, border: `1px solid ${landing.ocrCompareLabel}30` }}>
          <div className="text-center text-xs font-bold tracking-widest mb-6" style={{ color: landing.ocrCompareLabel }}>✦ ЭКОНОМИЯ ВРЕМЕНИ</div>
          <div className="grid grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid #EF444440" }}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: 20 }}>❌</span>
                <span className="text-sm font-bold" style={{ color: "#EF4444" }}>В 1С вручную</span>
              </div>
              <div className="text-3xl font-extrabold mb-2" style={{ color: "#EF4444" }}>5 минут</div>
              <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                Открыть → выбрать тип документа → создать контрагента → создать товары → провести → проверить
              </div>
            </div>
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid #10B98140" }}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: 20 }}>✅</span>
                <span className="text-sm font-bold" style={{ color: "#10B981" }}>В Finstat через AI</span>
              </div>
              <div className="text-3xl font-extrabold mb-2" style={{ color: "#10B981" }}>10 секунд</div>
              <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                📸 Сфотографировал → ✦ AI распознал → ✓ Создал в системе. Всё.
              </div>
            </div>
          </div>
          <div className="text-center mt-6">
            <div className="text-sm font-bold" style={{ background: landing.gradientText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              В 30 раз быстрее. На каждом документе экономишь 4 минуты.
            </div>
          </div>
        </div>

        {/* Что распознаёт */}
        <div className="text-center mb-4">
          <div className="text-xs font-bold tracking-widest mb-3" style={{ color: "var(--t3)" }}>РАСПОЗНАЁТ ВСЕ ТИПЫ ДОКУМЕНТОВ</div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { icon: "📋", name: "Счёт-фактура / ЭСФ" },
            { icon: "🧾", name: "Кассовые чеки" },
            { icon: "📦", name: "Накладные" },
            { icon: "📄", name: "Акты" },
            { icon: "📜", name: "Договоры" },
            { icon: "💰", name: "Платёжные поручения" },
          ].map((t, i) => (
            <div key={i} className="rounded-xl p-3 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-2xl mb-1">{t.icon}</div>
              <div className="text-[10px] font-semibold" style={{ color: "var(--t2)" }}>{t.name}</div>
            </div>
          ))}
        </div>

        {/* Powered by */}
        <div className="text-center mt-8 text-xs" style={{ color: "var(--t3)" }}>
          ✦ Powered by <b style={{ color: "var(--t2)" }}>Anthropic Claude</b> — самый продвинутый AI в мире
        </div>
      </section>

      {/* AI Жанара spotlight */}
      <section id="ai" className="max-w-6xl mx-auto px-6 py-16">
        <div className="rounded-2xl p-12 text-center" style={{ background: landing.aiBlock.bg, border: `1px solid ${landing.aiBlock.border}` }}>
          <div className="text-xs font-bold tracking-widest mb-3" style={{ color: landing.aiBlock.label }}>✦ AI ЖАНАРА</div>
          <h2 className="text-3xl font-extrabold mb-4" style={{ letterSpacing: "-0.02em" }}>AI-ассистент для вашего бизнеса</h2>
          <p className="text-base mb-8 max-w-2xl mx-auto" style={{ color: "var(--t2)" }}>
            Жанара не просто отвечает на вопросы — она <b>видит все процессы</b> в вашей системе,<br />
            анализирует данные и <b>подсказывает, что важно не упустить</b>.
          </p>

          <div className="mb-10 max-w-3xl mx-auto text-left">
            <LandingVisual src={images.zhanara} alt="Чат с AI Жанарой — вопросы по дебиторке и рекомендации" />
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto mb-6">
            <div className="p-4 rounded-xl text-left" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-xl mb-2">💬</div>
              <div className="text-sm font-bold mb-1" style={{ color: "var(--t1)" }}>Консультации</div>
              <div className="text-xs" style={{ color: "var(--t3)" }}>По налогам, зарплатам, проводкам, отчётности. Все нормы НК РК 2026.</div>
            </div>
            <div className="p-4 rounded-xl text-left" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-xl mb-2">👁</div>
              <div className="text-sm font-bold mb-1" style={{ color: "var(--t1)" }}>Мониторинг</div>
              <div className="text-xs" style={{ color: "var(--t3)" }}>Видит документы, проводки, остатки, зарплаты — анализирует ваш бизнес в реальном времени.</div>
            </div>
            <div className="p-4 rounded-xl text-left" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-xl mb-2">🔔</div>
              <div className="text-sm font-bold mb-1" style={{ color: "var(--t1)" }}>Напоминания</div>
              <div className="text-xs" style={{ color: "var(--t3)" }}>Предупреждает о сроках сдачи ФНО, платежах, дебиторке — ничего не пропустите.</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-3xl mx-auto mb-6">
            {[
              "«Какой оборот и маржа за квартал?»",
              "«Сколько осталось на складе?»",
              "«Когда платить НДС и зарплату?»",
            ].map((q, i) => (
              <div key={i} className="p-3 rounded-lg text-xs italic" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}>{q}</div>
            ))}
          </div>
          <div className="text-xs" style={{ color: "var(--t3)" }}>Уникальный AI-ассистент в Казахстане с полным доступом к вашим данным</div>
        </div>
      </section>

      {/* ╔══════════════════════════════════════════════╗ */}
      {/* ║   НОВАЯ СЕКЦИЯ: КАДРЫ И ЗП                  ║ */}
      {/* ╚══════════════════════════════════════════════╝ */}
      <section id="hr" className="max-w-6xl mx-auto px-6 py-16">
        {/* Badge */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: landing.hrBadge.bg, border: `1px solid ${landing.hrBadge.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: landing.hrBadge.color, letterSpacing: "0.05em" }}>👥 КАДРЫ + ЗП</span>
          </div>
        </div>

        {/* Заголовок */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold mb-4" style={{ letterSpacing: "-0.03em", lineHeight: 1.15 }}>
            Кадры без головной боли.<br />
            <span style={{ background: landing.hrHeadlineGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Расчёты — за вас по ТК РК
            </span>
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--t2)" }}>
            Табель Т-13 автозаполняется на весь месяц. Отпускные и больничные<br />
            рассчитываются автоматически по всем нормам ТК РК.
          </p>
        </div>

        <div className="mb-12 max-w-4xl mx-auto">
          <LandingVisual src={images.payroll} alt="Модуль зарплаты: табель, начисления и проводки" />
        </div>

        {/* 3 главных фичи */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {/* Табель */}
          <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: `3px solid ${landing.accent}` }}>
            <div className="text-3xl mb-3">⏰</div>
            <div className="text-base font-bold mb-2">Табель учёта</div>
            <div className="text-xs mb-4" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
              Автозаполнение всех 31 дня одним кликом. Праздники РК 2026 учтены. Графики 5/2, 6/1, сменные.
            </div>
            <div className="flex flex-wrap gap-1">
              {["Я", "В", "П", "О", "Б", "ОТ", "ПР", "К"].map(c => (
                <span key={c} className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", color: "var(--t2)", border: "1px solid var(--brd)" }}>{c}</span>
              ))}
            </div>
          </div>

          {/* Отпуска */}
          <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: `3px solid ${landing.accent2}` }}>
            <div className="text-3xl mb-3">🏖</div>
            <div className="text-base font-bold mb-2">Отпуска</div>
            <div className="text-xs mb-4" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
              Автоматический расчёт отпускных по ст. 88 ТК РК. Контроль 24-дневного остатка по каждому сотруднику.
            </div>
            <div className="flex flex-col gap-1 text-[10px]" style={{ color: "var(--t2)" }}>
              <div>✓ Средний дневной заработок</div>
              <div>✓ ИПН 10% + ОПВ 10% + ВОСМС 2%</div>
              <div>✓ Сумма к выплате на руки</div>
            </div>
          </div>

          {/* Больничные */}
          <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: "3px solid #EF4444" }}>
            <div className="text-3xl mb-3">🤒</div>
            <div className="text-base font-bold mb-2">Больничные</div>
            <div className="text-xs mb-4" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
              По стажу 60%/80%/100% автоматом. Делим на 3 дня работодателя и остаток за счёт ГФСС.
            </div>
            <div className="flex flex-col gap-1 text-[10px]" style={{ color: "var(--t2)" }}>
              <div>🏢 1-3 день — работодатель</div>
              <div>🏛 С 4 дня — ГФСС</div>
              <div>📊 Стаж определяет процент</div>
            </div>
          </div>
        </div>

        {/* WOW блок: всё связано */}
        <div className="rounded-2xl p-8" style={{ background: landing.hrFlowBg, border: `1px solid ${landing.hrBadge.border}` }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div>
              <div className="text-xs font-bold tracking-widest mb-2" style={{ color: "#10B981" }}>✦ ВСЁ СВЯЗАНО</div>
              <div className="text-lg font-bold mb-2">От табеля до проводок —<br/>одним движением</div>
              <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                Заполнил табель → начислил ЗП → провёл в системе. Никаких Excel-таблиц и сверок.
              </div>
            </div>
            <div className="col-span-2">
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { icon: "⏰", label: "Табель", color: landing.accent },
                  { icon: "→", label: "", color: "var(--t3)" },
                  { icon: "💰", label: "ЗП", color: landing.accent2 },
                  { icon: "→", label: "", color: "var(--t3)" },
                  { icon: "📊", label: "Проводки", color: "#10B981" },
                  { icon: "→", label: "", color: "var(--t3)" },
                  { icon: "📋", label: "ФНО 200", color: "#F59E0B" },
                ].map((s, i) => (
                  s.icon === "→" ? (
                    <span key={i} className="text-base" style={{ color: "var(--t3)" }}>→</span>
                  ) : (
                    <div key={i} className="rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: "var(--card)", border: `1px solid ${s.color}40` }}>
                      <span className="text-base">{s.icon}</span>
                      <span className="text-xs font-bold" style={{ color: s.color }}>{s.label}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold mb-3" style={{ letterSpacing: "-0.02em" }}>Почему одной системы достаточно</h2>
          <p className="text-sm" style={{ color: "var(--t2)" }}>
            Не набор разрозненных сервисов — единая база данных для всего бизнеса
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LANDING_CROSS_FEATURES.map((f, i) => {
            const color = landing.featureColors[i] ?? landing.accent;
            return (
              <div key={i} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: `3px solid ${color}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{f.icon}</span>
                  <span className="text-sm font-bold">{f.title}</span>
                </div>
                <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Business presets */}
      <section id="business" className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold mb-3" style={{ letterSpacing: "-0.02em" }}>Подходит разному бизнесу</h2>
          <p className="text-sm" style={{ color: "var(--t2)" }}>
            Включайте только нужные модули — торговля, производство, услуги или малый бизнес
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {LANDING_PRESETS.map((p) => (
            <div key={p.key} className="rounded-xl p-5 flex gap-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-3xl flex-shrink-0">{p.icon}</div>
              <div>
                <div className="text-sm font-bold mb-1">{p.name}</div>
                <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>{p.description}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold mb-3" style={{ letterSpacing: "-0.02em" }}>Почему Finstat.kz?</h2>
          <p className="text-sm" style={{ color: "var(--t2)" }}>Современная платформа для ведения бизнеса в Казахстане</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: "🌐", title: "Работает в браузере", desc: "Ничего не нужно устанавливать. Открыли finstat.kz — и работаете. Хоть с ноутбука, хоть с телефона." },
            { icon: "⚡", title: "Всегда актуальные обновления", desc: "НК РК меняется — система обновляется автоматически. Никаких принудительных перезагрузок и пауз в работе." },
            { icon: "🧠", title: "AI-помощник Жанара", desc: "Отвечает на вопросы, анализирует процессы, напоминает о сроках — помогает бизнесу работать быстрее." },
            { icon: "🇰🇿", title: "Казахстанский продукт", desc: "Разработано в Казахстане для Казахстана. Понимаем специфику бизнеса и налогов РК." },
            { icon: "📱", title: "Мобильный доступ", desc: "Продажи, склад, касса и отчёты — с телефона. Сканируйте документы камерой на месте." },
            { icon: "🔒", title: "Безопасность данных", desc: "Данные хранятся на защищённых серверах. Резервное копирование автоматическое. Только вы видите свои данные." },
          ].map((b, i) => (
            <div key={i} className="rounded-xl p-5 flex gap-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-3xl flex-shrink-0">{b.icon}</div>
              <div>
                <div className="text-sm font-bold mb-1">{b.title}</div>
                <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold mb-3" style={{ letterSpacing: "-0.02em" }}>Частые вопросы</h2>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { q: "Для кого подходит Finstat.kz?", a: "Для предпринимателей, собственников и команд, которым нужна единая система ведения бизнеса: продажи, склад, деньги, кадры, налоги и отчётность в одном месте. Также для бухгалтеров и финансовых специалистов, которые хотят работать быстрее и без лишних программ." },
            ...LANDING_FAQ_EXTRA,
            { q: "Как работает OCR сканер документов?", a: "Сфотографируйте чек, счёт-фактуру или накладную с телефона — или загрузите JPG/PNG/PDF. AI на основе Claude Vision за 5-10 секунд распознаёт поставщика, БИН, дату, позиции, НДС. Подтверждаете — и в системе уже готовы контрагент, товары и проводки." },
            { q: "Мои данные в безопасности?", a: "Да. Данные хранятся на защищённых серверах (Frankfurt, EU). Каждый пользователь видит только свои данные. Резервное копирование автоматическое." },
            { q: "Как подготовить отчёт ФНО?", a: "Система автоматически собирает данные за период из проводок и документов, рассчитывает суммы по НК РК 2026 и формирует XML для загрузки в личный кабинет КГД. Сдача в налоговый орган выполняется вами — как при работе с любой учётной программой." },
            { q: "Работает ли на телефоне?", a: "Да, полноценно. Открываете finstat.kz в браузере телефона и получаете всю систему в кармане. Особенно удобно сканировать документы через камеру." },
            { q: "Что с обновлениями при изменении НК РК?", a: "Обновления автоматические. В день вступления в силу нового закона — система уже работает по новым правилам." },
            { q: "Сколько стоит подписка?", a: "30 дней бесплатно при регистрации. После — 10 000 ₸/мес или 100 000 ₸/год (экономия 16.7%). Оплата через Kaspi за 30 секунд." },
            { q: "На каких языках поддержка?", a: "Поддержка доступна на русском и казахском языках. Интерфейс — на русском." },
          ].map((f, i) => (
            <details key={i} className="rounded-xl p-4 cursor-pointer" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <summary className="text-sm font-semibold" style={{ color: "var(--t1)" }}>{f.q}</summary>
              <div className="text-xs mt-3" style={{ color: "var(--t2)", lineHeight: 1.6 }}>{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="rounded-2xl p-12" style={{ background: landing.ctaGradient }}>
          <h2 className="text-3xl font-extrabold mb-4 text-white" style={{ letterSpacing: "-0.02em" }}>Ведите бизнес в одной системе</h2>
          <p className="text-base mb-6 text-white opacity-90">30 дней бесплатно. CRM, склад, финансы, кадры и налоги — без установки и долгих внедрений.</p>
          <Link
            href="/auth"
            className="no-underline px-8 py-4 rounded-xl font-semibold cursor-pointer inline-block"
            style={{ background: "#fff", color: landing.ctaButtonText, fontSize: 15 }}
          >
            Начать сейчас →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--brd)" }}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="text-xs" style={{ color: "var(--t3)" }}>
            © 2026 Finstat.kz — единая система ведения бизнеса. Казахстан • НК РК 2026
          </div>
          <div className="flex gap-4 flex-wrap">
            <Link href="/presentation" className="text-xs no-underline" style={{ color: "var(--t2)" }}>Презентация системы</Link>
            <Link href="/auth" className="text-xs no-underline" style={{ color: "var(--t2)" }}>Войти</Link>
            <Link href="/legal/terms" className="text-xs no-underline" style={{ color: "var(--t2)" }}>Оферта</Link>
            <Link href="/legal/privacy" className="text-xs no-underline" style={{ color: "var(--t2)" }}>Конфиденциальность</Link>
            <a href="mailto:info@finstat.kz" className="text-xs no-underline" style={{ color: "var(--t2)" }}>info@finstat.kz</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
