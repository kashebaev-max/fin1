/**
 * Движок полного вертикального промо Finstat.kz — все модули системы.
 */
(function () {
  var DUR = {
    intro: 4500,
    dashboard: 5000,
    highlight: 5000,
    group: 2400,
    feature: 3000,
    mega: 10000,
    extras: 4500,
    cta: 5000,
  };
  var FADE = 380;

  var MODULE_GROUPS = [
    { key: "sales", name: "Продажи и CRM", icon: "💼", color: "#10B981", items: [
      { key: "crm", name: "CRM", icon: "💼", desc: "Воронка сделок, лиды" },
      { key: "counterparties", name: "Контрагенты", icon: "👥", desc: "Клиенты и поставщики" },
      { key: "contracts", name: "Договоры", icon: "📑", desc: "Договоры с контрагентами" },
      { key: "orders", name: "Заказы", icon: "📋", desc: "Заказы покупателей" },
      { key: "returns", name: "Возвраты", icon: "↩", desc: "Возвраты товаров" },
      { key: "discounts", name: "Скидки и промо", icon: "🎁", desc: "Скидки и лояльность" },
      { key: "sales-analytics", name: "Анализ продаж", icon: "🎯", desc: "ABC/XYZ анализ" },
    ]},
    { key: "retail", name: "Торговля", icon: "🛒", color: "#EC4899", items: [
      { key: "pos", name: "Касса POS", icon: "🛒", desc: "Чеки, оплата Kaspi" },
      { key: "retail", name: "Розница", icon: "🏬", desc: "Смены, Z-отчёты" },
    ]},
    { key: "warehouse", name: "Склад", icon: "▣", color: "#3B82F6", items: [
      { key: "nomenclature", name: "Номенклатура", icon: "📚", desc: "Товары и услуги" },
      { key: "warehouse", name: "Склад", icon: "▣", desc: "Остатки и движения" },
      { key: "transfers", name: "Перемещения", icon: "🔁", desc: "Между складами" },
      { key: "inventory", name: "Инвентаризация", icon: "📋", desc: "Акты сверки" },
      { key: "batches", name: "Партионный учёт", icon: "📦", desc: "FIFO, сроки" },
      { key: "assembly", name: "Комплектация", icon: "🔧", desc: "Сборка комплектов" },
      { key: "production", name: "Производство", icon: "🏭", desc: "Производственные заказы" },
    ]},
    { key: "finance", name: "Деньги и банк", icon: "◆", color: "#F59E0B", items: [
      { key: "cashbox", name: "Касса", icon: "◉", desc: "ПКО и РКО" },
      { key: "bank", name: "Банк", icon: "◆", desc: "Платёжные поручения" },
      { key: "bank-import", name: "Импорт выписки", icon: "📥", desc: "Выписка из банка" },
      { key: "currency", name: "Валюты", icon: "💱", desc: "Курсы валют" },
      { key: "recurring", name: "Регулярные платежи", icon: "🔄", desc: "Аренда, лизинг" },
      { key: "business-trips", name: "Командировки", icon: "✈", desc: "Авансовые отчёты" },
    ]},
    { key: "accounting", name: "Бухгалтерия", icon: "▦", color: "#6366F1", items: [
      { key: "accounting", name: "Журнал проводок", icon: "▦", desc: "Бухгалтерские проводки" },
      { key: "turnover", name: "ОСВ", icon: "📒", desc: "Оборотно-сальдовая" },
      { key: "account-card", name: "Карточка счёта", icon: "📇", desc: "Движения по счёту" },
      { key: "chess-board", name: "Шахматка", icon: "♟", desc: "Дт × Кт" },
      { key: "financial-statements", name: "Баланс и ОПУ", icon: "📊", desc: "Формы 1 и 2" },
      { key: "assets", name: "Основные средства", icon: "🏗", desc: "ОС и амортизация" },
    ]},
    { key: "hr", name: "Кадры и зарплата", icon: "◎", color: "#A855F7", items: [
      { key: "hr", name: "Сотрудники и ЗП", icon: "◎", desc: "Зарплата НК 2026" },
      { key: "timesheet", name: "Табель Т-13", icon: "🗓", desc: "Рабочее время" },
      { key: "vacations", name: "Отпуска", icon: "🏖", desc: "Отпускные" },
      { key: "hr-orders", name: "Кадровые приказы", icon: "📜", desc: "Т-1, Т-5, Т-6" },
      { key: "deductions", name: "Удержания", icon: "💸", desc: "Алименты, кредиты" },
      { key: "sick-leaves", name: "Больничные", icon: "🤒", desc: "Расчёт больничных" },
    ]},
    { key: "tax", name: "Налоги", icon: "⚖", color: "#EF4444", items: [
      { key: "reports", name: "Отчёты ФНО", icon: "▤", desc: "910, 200, 300, 100" },
      { key: "taxinfo", name: "НК РК 2026", icon: "⚖", desc: "Справочник НК" },
      { key: "edo", name: "ЭДО / ЭСФ", icon: "📨", desc: "Электронные СФ" },
      { key: "check", name: "Проверка БИН", icon: "🔍", desc: "Гос. реестр ЮЛ" },
    ]},
    { key: "documents", name: "Документы", icon: "◈", color: "#0EA5E9", items: [
      { key: "documents", name: "Документы", icon: "◈", desc: "12 типов документов" },
      { key: "workflow", name: "Документооборот", icon: "🛤", desc: "Согласование" },
      { key: "exports", name: "Экспорт", icon: "📤", desc: "Excel и PDF" },
      { key: "doc-generator", name: "Генератор", icon: "📝", desc: "AI-документы" },
      { key: "sono", name: "СОНО", icon: "📤", desc: "XML в КГД" },
    ]},
    { key: "analytics", name: "Аналитика", icon: "📈", color: "#14B8A6", items: [
      { key: "analytics-charts", name: "Графики", icon: "📊", desc: "KPI и тренды" },
      { key: "forecast", name: "Прогноз", icon: "🔮", desc: "Кэшфлоу" },
      { key: "budgeting", name: "Бюджет", icon: "📊", desc: "БДР" },
      { key: "management-reports", name: "Упр. отчёты", icon: "📈", desc: "P&L, Cash flow" },
      { key: "calendar", name: "Календарь", icon: "📅", desc: "Сроки ФНО" },
    ]},
    { key: "automation", name: "AI и автоматизация", icon: "✦", color: "#8B5CF6", items: [
      { key: "ai", name: "AI Жанара", icon: "✦", desc: "AI-консультант" },
      { key: "notifications", name: "Уведомления", icon: "🔔", desc: "Напоминания" },
      { key: "ai-actions", name: "Журнал ИИ", icon: "🤖", desc: "Аудит AI" },
      { key: "document-scanner", name: "Сканирование", icon: "📄", desc: "PDF → проводки" },
      { key: "scheduled-tasks", name: "Регламент", icon: "⏱", desc: "Автозадания" },
      { key: "migration", name: "Миграция 1С", icon: "📥", desc: "Импорт данных" },
      { key: "scan", name: "Сканер OCR", icon: "📸", desc: "Камера телефона" },
    ]},
    { key: "specifics", name: "Отраслевое", icon: "🏥", color: "#84CC16", items: [
      { key: "industry", name: "Отрасли", icon: "🏥", desc: "Преднастройки" },
      { key: "transport", name: "Транспорт", icon: "🚗", desc: "Путевые листы" },
    ]},
    { key: "system", name: "Сервис", icon: "⚙", color: "#6B7280", items: [
      { key: "help", name: "Справка", icon: "📚", desc: "Справочный центр" },
      { key: "companies", name: "Организации", icon: "🏢", desc: "Мульти-компания" },
      { key: "settings", name: "Настройки", icon: "⚙", desc: "Модули и профиль" },
      { key: "support", name: "Поддержка", icon: "💬", desc: "Виджет на сайте" },
    ]},
  ];

  var MOCK = {
    crm: [["Лид", "ТОО «Алма»"], ["Сделка", "2.4 млн ₸"], ["Этап", "Переговоры"]],
    hr: [["Сотрудник", "Иванов А.С."], ["Оклад", "450 000 ₸"], ["ИПН", "10%"]],
    warehouse: [["Товар", "Молоко 3.2%"], ["Остаток", "1 240 шт"], ["Резерв", "80"]],
    reports: [["ФНО 300", "НДС 16%"], ["К уплате", "1 120 000 ₸"], ["Срок", "25.04"]],
    pos: [["Чек", "№004521"], ["Сумма", "12 450 ₸"], ["Оплата", "Kaspi QR"]],
    check: [["БИН", "110640020454"], ["ЮЛ", "ТОО «Фарма-Life»"], ["Риск", "Низкий"]],
    default: [["Статус", "Проведено"], ["Проводки", "Созданы"], ["Склад", "Обновлён"]],
  };

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function fmt(n) { return Math.round(n).toLocaleString("ru-RU"); }
  function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  function buildTimeline() {
    var list = [];
    list.push({ type: "intro", dur: DUR.intro });
    list.push({ type: "dashboard", dur: DUR.dashboard });
    list.push({ type: "highlight", id: "ocr", dur: DUR.highlight });
    list.push({ type: "highlight", id: "zhanara", dur: DUR.highlight });
    list.push({ type: "highlight", id: "bin", dur: DUR.highlight });
    var gi = 0;
    MODULE_GROUPS.forEach(function (g) {
      gi++;
      list.push({ type: "group", group: g, gi: gi, gtotal: MODULE_GROUPS.length, dur: DUR.group });
      g.items.forEach(function (it, fi) {
        list.push({ type: "feature", group: g, item: it, fi: fi + 1, ftotal: g.items.length, dur: DUR.feature });
      });
    });
    list.push({ type: "mega", dur: DUR.mega });
    list.push({ type: "extras", dur: DUR.extras });
    list.push({ type: "cta", dur: DUR.cta });
    return list;
  }

  function mockRows(key) {
    var rows = MOCK[key] || MOCK.default;
    return rows.map(function (r) {
      return '<div class="mrow"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>';
    }).join("");
  }

  function htmlFor(def) {
    if (def.type === "intro") {
      return '<div class="v" style="align-items:center;text-align:center">' +
        '<div class="logo" data-el="logo">₸</div>' +
        '<div class="h1" data-el="t1">Finstat<span style="color:var(--accent)">.kz</span></div>' +
        '<div class="sub" data-el="t2">Полный обзор системы</div>' +
        '<div class="sub" data-el="t3" style="font-size:20px;margin-top:8px">60+ модулей · НК РК 2026 · AI</div></div>';
    }
    if (def.type === "dashboard") {
      return '<div class="v">' +
        '<div class="h2" data-el="h">Главная панель</div>' +
        '<div class="sub">KPI и аналитика в реальном времени</div>' +
        '<div class="kpis">' +
        '<div class="card kpi" data-el="k0"><div class="lbl">Выручка</div><div class="val" style="color:var(--green)" data-c="14200000">0 ₸</div></div>' +
        '<div class="card kpi" data-el="k1"><div class="lbl">Прибыль</div><div class="val" data-c="3850000">0 ₸</div></div>' +
        '<div class="card kpi" data-el="k2"><div class="lbl">Налоги</div><div class="val" data-c="1120000">0 ₸</div></div>' +
        '<div class="card kpi" data-el="k3"><div class="lbl">Дебиторка</div><div class="val" data-c="2400000">0 ₸</div></div>' +
        '</div><div class="card chart" data-el="chart">' +
        [0.4,0.55,0.48,0.72,0.65,0.88].map(function(_,i){return '<div class="bar" data-bar="'+i+'"></div>';}).join("") +
        '</div></div>';
    }
    if (def.type === "highlight" && def.id === "ocr") {
      return '<div class="v"><div class="h2">Скан документа</div><div class="sub">OCR → контрагент → проводки</div>' +
        '<div class="flex-row"><div class="doc" data-el="doc"><div style="font-weight:700;margin-bottom:8px">СЧЁТ-ФАКТУРА</div>' +
        '<div class="line" style="width:85%"></div><div class="line" style="width:70%"></div><div class="line" style="width:90%"></div>' +
        '<div class="scanline" data-el="scan"></div></div>' +
        '<div class="card mock flex-col" style="flex:1" data-el="fields">' +
        mockRows("default") + '</div></div></div>';
    }
    if (def.type === "highlight" && def.id === "zhanara") {
      return '<div class="v"><div class="h2" style="color:var(--purple)">✦ AI Жанара</div><div class="sub">Вопросы по налогам и учёту</div>' +
        '<div class="flex-col" data-el="chat">' +
        '<div class="bubble q" data-el="q">Сколько НДС заплатить в квартале?</div>' +
        '<div class="bubble a" data-el="a"><span data-el="typ">...</span><span data-el="ans" style="display:none">НДС к уплате: <b style="color:var(--green)">1 120 000 ₸</b>. Срок — 25 число.</span></div></div></div>';
    }
    if (def.type === "highlight" && def.id === "bin") {
      return '<div class="v"><div class="h2">Проверка БИН</div><div class="sub">Гос. реестр data.egov.kz</div>' +
        '<div class="card" style="padding:20px;font-size:28px;font-weight:800;letter-spacing:.1em;font-family:monospace" data-el="bin">—</div>' +
        '<div class="card mock" data-el="res" style="opacity:0">' + mockRows("check") + '</div></div>';
    }
    if (def.type === "group") {
      var g = def.group;
      return '<div class="v" style="align-items:center;text-align:center">' +
        '<div class="counter">Раздел ' + def.gi + ' / ' + def.gtotal + '</div>' +
        '<div class="gbar" style="background:' + g.color + '" data-el="bar"></div>' +
        '<div class="gicon" data-el="ic">' + g.icon + '</div>' +
        '<div class="h1" data-el="nm">' + esc(g.name) + '</div>' +
        '<div class="sub" data-el="cnt">' + g.items.length + ' модулей в разделе</div></div>';
    }
    if (def.type === "feature") {
      var g = def.group, it = def.item;
      return '<div class="v">' +
        '<div class="counter" style="color:' + g.color + '">' + esc(g.name) + ' · ' + def.fi + '/' + def.ftotal + '</div>' +
        '<div class="feat-head">' +
        '<div class="feat-ic" style="background:' + g.color + '22;border:1px solid ' + g.color + '55" data-el="ic">' + it.icon + '</div>' +
        '<div><div class="h2" data-el="nm" style="font-size:36px">' + esc(it.name) + '</div>' +
        '<div class="sub" data-el="ds">' + esc(it.desc) + '</div></div></div>' +
        '<div class="card mock" data-el="mock">' + mockRows(it.key) + '</div></div>';
    }
    if (def.type === "mega") {
      var all = [];
      MODULE_GROUPS.forEach(function (g) {
        g.items.forEach(function (it) {
          all.push('<div class="card m" data-mega><span class="ic">' + it.icon + '</span>' + esc(it.name) + '</div>');
        });
      });
      all.push('<div class="card m" data-mega><span class="ic">⬡</span>Главная</div>');
      return '<div class="v"><div class="h2" data-el="h">60+ модулей</div><div class="sub">Всё связано в одной системе</div>' +
        '<div class="mega" data-el="mega">' + all.join("") + '</div></div>';
    }
    if (def.type === "extras") {
      return '<div class="v" style="align-items:center;text-align:center">' +
        '<div class="h2" data-el="h">Ещё возможности</div>' +
        '<div class="card mock" style="width:100%;text-align:left" data-el="e0">' +
        '<div class="mrow"><span class="k">Подписка</span><span class="v">10 000 ₸/мес · Kaspi</span></div>' +
        '<div class="mrow"><span class="k">Триал</span><span class="v">30 дней бесплатно</span></div>' +
        '<div class="mrow"><span class="k">Поддержка</span><span class="v">Виджет 💬 на сайте</span></div>' +
        '<div class="mrow"><span class="k">Миграция</span><span class="v">Импорт из 1С / Excel</span></div></div></div>';
    }
    if (def.type === "cta") {
      return '<div class="v" style="align-items:center;text-align:center">' +
        '<div class="logo" data-el="logo" style="width:72px;height:72px;font-size:40px">₸</div>' +
        '<div class="h1" data-el="t1">30 дней бесплатно</div>' +
        '<div class="sub" data-el="t2">finstat.kz · без установки</div>' +
        '<div class="cta-btn" data-el="btn">Начать сейчас →</div></div>';
    }
    return '<div class="v"><div class="h2">Finstat.kz</div></div>';
  }

  function reveal(el, p, opts) {
    if (!el) return;
    opts = opts || {};
    var delay = opts.delay || 0, span = opts.span || 0.35, dy = opts.dy != null ? opts.dy : 22;
    var local = clamp((p - delay) / span, 0, 1);
    var e = easeOut(local);
    el.style.opacity = e;
    el.style.transform = "translateY(" + lerp(dy, 0, e) + "px)";
  }

  function animScene(el, def, p) {
    if (def.type === "intro") {
      reveal(el.querySelector('[data-el="logo"]'), p, { delay: 0.05 });
      reveal(el.querySelector('[data-el="t1"]'), p, { delay: 0.2 });
      reveal(el.querySelector('[data-el="t2"]'), p, { delay: 0.35 });
      reveal(el.querySelector('[data-el="t3"]'), p, { delay: 0.48 });
    } else if (def.type === "dashboard") {
      reveal(el.querySelector('[data-el="h"]'), p, { delay: 0 });
      var cnt = clamp((p - 0.15) / 0.45, 0, 1);
      el.querySelectorAll("[data-c]").forEach(function (n) {
        var t = +n.getAttribute("data-c");
        n.textContent = fmt(t * easeOut(cnt)) + " ₸";
      });
      el.querySelectorAll("[data-bar]").forEach(function (b, k) {
        var h = [0.4,0.55,0.48,0.72,0.65,0.88][k];
        var bp = clamp((p - 0.2 - k * 0.04) / 0.35, 0, 1);
        b.style.height = (easeOut(bp) * h * 100) + "%";
      });
    } else if (def.type === "highlight" && def.id === "ocr") {
      reveal(el.querySelector('[data-el="doc"]'), p, { delay: 0 });
      var sp = clamp((p - 0.15) / 0.45, 0, 1);
      var scan = el.querySelector('[data-el="scan"]');
      if (scan) { scan.style.top = lerp(0, 300, sp) + "px"; scan.style.opacity = sp > 0 && sp < 1 ? 1 : 0; }
      reveal(el.querySelector('[data-el="fields"]'), p, { delay: 0.5 });
    } else if (def.type === "highlight" && def.id === "zhanara") {
      reveal(el.querySelector('[data-el="q"]'), p, { delay: 0.1 });
      reveal(el.querySelector('[data-el="a"]'), p, { delay: 0.3 });
      var typ = el.querySelector('[data-el="typ"]'), ans = el.querySelector('[data-el="ans"]');
      if (p > 0.55) { if (typ) typ.style.display = "none"; if (ans) ans.style.display = "inline"; }
      else { if (typ) typ.style.display = "inline"; if (ans) ans.style.display = "none"; }
    } else if (def.type === "highlight" && def.id === "bin") {
      var full = "110640020454";
      var n = Math.floor(clamp((p - 0.1) / 0.35, 0, 1) * full.length);
      var binEl = el.querySelector('[data-el="bin"]');
      if (binEl) binEl.textContent = full.slice(0, n) || "—";
      reveal(el.querySelector('[data-el="res"]'), p, { delay: 0.55 });
    } else if (def.type === "group") {
      reveal(el.querySelector('[data-el="bar"]'), p, { delay: 0, dy: 0 });
      reveal(el.querySelector('[data-el="ic"]'), p, { delay: 0.1 });
      reveal(el.querySelector('[data-el="nm"]'), p, { delay: 0.22 });
      reveal(el.querySelector('[data-el="cnt"]'), p, { delay: 0.38 });
    } else if (def.type === "feature") {
      reveal(el.querySelector('[data-el="ic"]'), p, { delay: 0.05, dy: 16 });
      reveal(el.querySelector('[data-el="nm"]'), p, { delay: 0.15 });
      reveal(el.querySelector('[data-el="ds"]'), p, { delay: 0.25 });
      reveal(el.querySelector('[data-el="mock"]'), p, { delay: 0.38 });
    } else if (def.type === "mega") {
      reveal(el.querySelector('[data-el="h"]'), p, { delay: 0 });
      var mega = el.querySelector('[data-el="mega"]');
      if (mega) {
        var scroll = lerp(0, Math.max(0, mega.scrollHeight - mega.clientHeight), clamp((p - 0.15) / 0.75, 0, 1));
        mega.scrollTop = scroll;
      }
      el.querySelectorAll("[data-mega]").forEach(function (m, k) {
        var bp = clamp((p - 0.05 - k * 0.008) / 0.25, 0, 1);
        m.style.opacity = easeOut(bp);
      });
    } else if (def.type === "extras") {
      reveal(el.querySelector('[data-el="h"]'), p, { delay: 0 });
      reveal(el.querySelector('[data-el="e0"]'), p, { delay: 0.2 });
    } else if (def.type === "cta") {
      reveal(el.querySelector('[data-el="logo"]'), p, { delay: 0 });
      reveal(el.querySelector('[data-el="t1"]'), p, { delay: 0.15 });
      reveal(el.querySelector('[data-el="t2"]'), p, { delay: 0.3 });
      reveal(el.querySelector('[data-el="btn"]'), p, { delay: 0.45 });
    }
  }

  // ─── Build DOM & timeline ───
  var TIMELINE = buildTimeline();
  var SCENES = [];
  var t = 0;
  TIMELINE.forEach(function (def, i) {
    SCENES.push({ t0: t, t1: t + def.dur, def: def, index: i });
    t += def.dur;
  });
  var DURATION = t;

  var stage = document.getElementById("stage");
  var sceneEls = [];
  TIMELINE.forEach(function (def, i) {
    var sec = document.createElement("section");
    sec.className = "scene";
    sec.setAttribute("data-scene", i);
    sec.innerHTML = htmlFor(def);
    stage.appendChild(sec);
    sceneEls.push(sec);
  });

  window.PROMO = { duration: DURATION, fps: 30, scenes: SCENES.length, modules: TIMELINE.filter(function(d){return d.type==="feature";}).length };

  window.seek = function (ms) {
    ms = clamp(ms, 0, DURATION);
    for (var i = 0; i < SCENES.length; i++) {
      var s = SCENES[i];
      var el = sceneEls[i];
      var op = 0;
      if (ms >= s.t0 - FADE && ms <= s.t1 + FADE) {
        op = Math.min(clamp((ms - s.t0 + FADE) / FADE, 0, 1), clamp((s.t1 + FADE - ms) / FADE, 0, 1));
      }
      el.style.opacity = op;
      el.style.visibility = op > 0.001 ? "visible" : "hidden";
      if (op > 0.001) {
        var p = clamp((ms - s.t0) / (s.t1 - s.t0), 0, 1);
        animScene(el, s.def, p);
      }
    }
  };

  window.__promoReady = true;
  var params = new URLSearchParams(location.search);
  if (!params.has("capture")) {
    var start = null;
    function loop(ts) {
      if (!start) start = ts;
      window.seek((ts - start) % (DURATION + 1200));
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  } else {
    window.seek(0);
  }

  console.log("Finstat full promo: " + (DURATION/1000/60).toFixed(1) + " min, " + SCENES.length + " scenes, " + window.PROMO.modules + " modules");
})();
