"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("finerp-theme") : null;
    const t = saved === "light" ? "light" : "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    if (typeof window !== "undefined") window.localStorage.setItem("finerp-theme", next);
  }

  return (
    <div style={{ background: "var(--bg)", color: "var(--t1)", minHeight: "100vh" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--brd)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 10, backdropFilter: "blur(8px)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center font-extrabold text-white" style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366F1, #A855F7)", fontSize: 16 }}>F</div>
            <div>
              <div className="text-lg font-extrabold">Finstat.kz</div>
              <div className="text-[9px] tracking-widest" style={{ color: "var(--t3)" }}>НК РК 2026</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#features" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>Возможности</a>
            <a href="#ai" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>AI Жанара</a>
            <a href="#faq" className="text-xs font-medium no-underline" style={{ color: "var(--t2)" }}>FAQ</a>

            {/* Theme toggle with label */}
            <button onClick={toggleTheme}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer border-none"
              style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)", fontSize: 12 }}>
              <span style={{ fontSize: 14 }}>{theme === "dark" ? "☀️" : "🌙"}</span>
              <span className="font-medium">{theme === "dark" ? "Светлая" : "Тёмная"}</span>
            </button>

            <Link href="/auth" className="no-underline">
              <button className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Войти</button>
            </Link>
            <Link href="/auth" className="no-underline">
              <button className="px-5 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)" }}>Начать бесплатно</button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6" style={{ background: "#F59E0B15", border: "1px solid #F59E0B30" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", letterSpacing: "0.05em" }}>⚡ НОВЫЙ НАЛОГОВЫЙ КОДЕКС РК 2026 • ЗРК 214-VIII</span>
        </div>
        <h1 className="text-5xl font-extrabold mb-6" style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Умный помощник<br />
          <span style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            для вашего бухгалтера
          </span>
        </h1>
        <p className="text-lg mb-8 max-w-2xl mx-auto" style={{ color: "var(--t2)" }}>
          Современная ERP-система для бизнеса Казахстана. Всё по НК РК 2026.<br />
          Автоматизирует рутину, контролирует сроки, помогает не упустить важное.
        </p>
        <div className="flex gap-3 justify-center mb-6">
          <Link href="/auth" className="no-underline">
            <button className="px-8 py-4 rounded-xl text-white font-semibold border-none cursor-pointer" style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)", fontSize: 15 }}>
              Начать бесплатно →
            </button>
          </Link>
          <a href="#features" className="no-underline">
            <button className="px-8 py-4 rounded-xl font-semibold cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 15 }}>
              Посмотреть возможности
            </button>
          </a>
        </div>
        <div className="text-xs" style={{ color: "var(--t3)" }}>
          ✓ Без установки &nbsp;&nbsp; ✓ Работает в браузере &nbsp;&nbsp; ✓ Данные под защитой &nbsp;&nbsp; ✓ Поддержка на русском и казахском
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-4 gap-4">
          {[
            { value: "13", label: "модулей", sub: "Всё необходимое" },
            { value: "12", label: "типов документов", sub: "Счета, акты, накладные" },
            { value: "100%", label: "по НК РК 2026", sub: "НДС 16%, новые ставки" },
            { value: "24/7", label: "AI-помощник", sub: "Жанара всегда на связи" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-5 text-center" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
              <div className="text-3xl font-extrabold mb-1" style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{s.value}</div>
              <div className="text-sm font-bold">{s.label}</div>
              <div className="text-[11px] mt-1" style={{ color: "var(--t3)" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* AI Жанара spotlight */}
      <section id="ai" className="max-w-6xl mx-auto px-6 py-16">
        <div className="rounded-2xl p-12 text-center" style={{ background: "linear-gradient(135deg, #6366F110, #A855F710)", border: "1px solid #A855F730" }}>
          <div className="text-xs font-bold tracking-widest mb-3" style={{ color: "#A855F7" }}>✦ AI ЖАНАРА</div>
          <h2 className="text-3xl font-extrabold mb-4" style={{ letterSpacing: "-0.02em" }}>Умный AI-ассистент для бухгалтера</h2>
          <p className="text-base mb-8 max-w-2xl mx-auto" style={{ color: "var(--t2)" }}>
            Жанара не просто отвечает на вопросы — она <b>видит все процессы</b> в вашей системе,<br />
            анализирует данные и <b>подсказывает, что важно не упустить</b>.
          </p>

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
              "«Что у меня по дебиторке?»",
              "«Когда сдавать ФНО 300?»",
              "«Какой оборот за март?»",
            ].map((q, i) => (
              <div key={i} className="p-3 rounded-lg text-xs italic" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t2)" }}>{q}</div>
            ))}
          </div>
          <div className="text-xs" style={{ color: "var(--t3)" }}>Уникальный AI-ассистент в Казахстане с полным доступом к вашим данным</div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold mb-3" style={{ letterSpacing: "-0.02em" }}>Всё в одной системе</h2>
          <p className="text-sm" style={{ color: "var(--t2)" }}>13 модулей связаны между собой — один документ обновляет всю систему</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: "◈", title: "12 типов документов", desc: "Счета, счёт-фактуры (ст.412 НК), накладные, акты, договоры, ПКО/РКО, платёжные поручения, ТТН", color: "#6366F1" },
            { icon: "▦", title: "Полная бухгалтерия", desc: "Журнал проводок, ОСВ, анализ счёта, акт сверки, баланс — всё автоматически из документов", color: "#8B5CF6" },
            { icon: "▣", title: "Склад с контролем", desc: "Остатки, поступление, возвраты, инвентаризация. Документы автоматически обновляют склад", color: "#F59E0B" },
            { icon: "💳", title: "Зарплата по НК 2026", desc: "ИПН 10%/15%, ОПВ 10%, ВОСМС 2%, вычет 30 МРП. Приказы, табель, отпуска, больничные", color: "#EC4899" },
            { icon: "🏗", title: "Основные средства", desc: "Приём к учёту, автоматическая амортизация прямолинейным методом, остаточная стоимость", color: "#10B981" },
            { icon: "📅", title: "Календарь бухгалтера", desc: "Все сроки сдачи ФНО 910, 200, 300, 100 на 2026 год с напоминаниями", color: "#3B82F6" },
            { icon: "⚖", title: "Справочник НК РК 2026", desc: "Все ставки (НДС 16%, ИПН, КПН, ОПВР 3.5%, СН 6%), режимы СНР, МРП 4325 ₸", color: "#A855F7" },
            { icon: "📋", title: "Автозаполнение ФНО", desc: "ФНО 910 (упрощёнка 4%), ФНО 200 (ИПН/СН), ФНО 300 (НДС 16%), ФНО 100 (КПН 20%)", color: "#F97316" },
            { icon: "🔍", title: "Проверка контрагентов", desc: "Анализ БИН, определение типа и даты регистрации, прямые ссылки на реестры КГД МФ РК", color: "#06B6D4" },
          ].map((f, i) => (
            <div key={i} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderTop: `3px solid ${f.color}` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{f.icon}</span>
                <span className="text-sm font-bold">{f.title}</span>
              </div>
              <div className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold mb-3" style={{ letterSpacing: "-0.02em" }}>Почему Finstat.kz?</h2>
          <p className="text-sm" style={{ color: "var(--t2)" }}>Современный инструмент для казахстанского бухгалтера и предпринимателя</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: "🌐", title: "Работает в браузере", desc: "Ничего не нужно устанавливать. Открыли finstat.kz — и работаете. Хоть с ноутбука, хоть с телефона." },
            { icon: "⚡", title: "Всегда актуальные обновления", desc: "НК РК меняется — система обновляется автоматически. Никаких принудительных перезагрузок и пауз в работе." },
            { icon: "🧠", title: "AI-помощник Жанара", desc: "Отвечает на вопросы, анализирует процессы, напоминает о сроках — помогает бухгалтеру работать быстрее." },
            { icon: "🇰🇿", title: "Казахстанский продукт", desc: "Разработано в Казахстане для Казахстана. Понимаем специфику бизнеса и налогов РК." },
            { icon: "📱", title: "Мобильный доступ", desc: "Смотрите остатки в кассе, создавайте документы, проверяйте отчёты — прямо со смартфона." },
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
            { q: "Для кого подходит Finstat.kz?", a: "Для бухгалтеров, которые хотят работать быстрее и с меньшим количеством ошибок. Также для предпринимателей и собственников бизнеса, которые хотят видеть состояние своих финансов в режиме реального времени. Система упрощает работу бухгалтера, но не заменяет его полностью." },
            { q: "Мои данные в безопасности?", a: "Да. Данные хранятся на защищённых серверах (Frankfurt, EU). Каждый пользователь видит только свои данные. Резервное копирование автоматическое." },
            { q: "Как подготовить отчёт ФНО?", a: "Автоматически. Система собирает все данные за период из проводок и документов. Нужно только проверить и отправить в КГД." },
            { q: "Работает ли на телефоне?", a: "Да, полноценно. Открываете finstat.kz в браузере телефона и получаете всю систему в кармане." },
            { q: "Что с обновлениями при изменении НК РК?", a: "Обновления автоматические. В день вступления в силу нового закона — система уже работает по новым правилам." },
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
        <div className="rounded-2xl p-12" style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)" }}>
          <h2 className="text-3xl font-extrabold mb-4 text-white" style={{ letterSpacing: "-0.02em" }}>Попробуйте бесплатно</h2>
          <p className="text-base mb-6 text-white opacity-90">Никаких обязательств. Полный доступ к функционалу. Начните за минуту.</p>
          <Link href="/auth" className="no-underline">
            <button className="px-8 py-4 rounded-xl font-semibold border-none cursor-pointer" style={{ background: "#fff", color: "#6366F1", fontSize: 15 }}>
              Начать сейчас →
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--brd)" }}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="text-xs" style={{ color: "var(--t3)" }}>
            © 2026 Finstat.kz. Все права защищены. Казахстан • НК РК 2026
          </div>
          <div className="flex gap-4">
            <Link href="/auth" className="text-xs no-underline" style={{ color: "var(--t2)" }}>Войти</Link>
            <a href="mailto:info@finstat.kz" className="text-xs no-underline" style={{ color: "var(--t2)" }}>info@finstat.kz</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
