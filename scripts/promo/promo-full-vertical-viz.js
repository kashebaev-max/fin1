/**
 * Уникальные визуализации для каждого модуля полного вертикального промо.
 */
(function () {
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  /** @type {Record<string, object>} */
  var F = {
    crm: { t: "funnel", steps: [["Лиды", 52], ["Квалификация", 31], ["Предложение", 18], ["Сделка", 9]], color: "#10B981" },
    counterparties: { t: "kpi4", items: [["Клиенты", 284, ""], ["Поставщики", 96, ""], ["С БИН", 312, ""], ["Договоры", 178, ""]] },
    contracts: { t: "big", label: "Договоры на сумму", value: 24800000, suffix: " ₸", delta: "+12%" },
    orders: { t: "chart", labels: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн"], bars: [0.42, 0.58, 0.51, 0.74, 0.68, 0.92] },
    returns: { t: "dual", a: ["Возвраты", "47 шт", "890 000 ₸"], b: ["% от продаж", "1,2%", ""] },
    discounts: { t: "ring", pct: 73, label: "Активных промо", sub: "18 акций" },
    "sales-analytics": { t: "hbars", rows: [["A-класс", 0.82, "68% выручки"], ["B-класс", 0.55, "24%"], ["C-класс", 0.28, "8%"]] },
    pos: { t: "ticker", label: "Чек №004521", value: 12450, suffix: " ₸", sub: "Kaspi QR · 14:32" },
    retail: { t: "kpi4", items: [["Смена", "№12", ""], ["Чеков", 847, ""], ["Выручка", 4200000, " ₸"], ["Z-отчёт", "✓", ""]] },
    nomenclature: { t: "big", label: "Позиций в каталоге", value: 3847, suffix: "", delta: "+124 за месяц" },
    warehouse: { t: "hbars", rows: [["Молоко 3.2%", 0.92, "1 240 шт"], ["Хлеб", 0.45, "580 шт"], ["Масло", 0.78, "320 шт"], ["Сыр", 0.61, "210 шт"]] },
    transfers: { t: "list", items: [["🔁", "Алматы → Астана", "240 шт"], ["🔁", "Склад №2 → №1", "85 шт"], ["✓", "Проведено сегодня", "3 док."]] },
    inventory: { t: "ring", pct: 94, label: "Инвентаризация", sub: "излишек +12 400 ₸" },
    batches: { t: "list", items: [["📦", "Партия B-2026-04", "FIFO"], ["⏳", "Срок до 15.08", "142 дн."], ["⚠", "Истекает скоро", "8 поз."]] },
    assembly: { t: "dual", a: ["Комплект", "Набор «Офис»"], b: ["Себестоимость", "18 400 ₸"] },
    production: { t: "chart", labels: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"], bars: [0.35, 0.72, 0.68, 0.8, 0.9, 0.4] },
    cashbox: { t: "big", label: "Касса за день", value: 1850000, suffix: " ₸", delta: "ПКО 12 · РКО 3" },
    bank: { t: "chart", labels: ["1", "5", "10", "15", "20", "25"], bars: [0.3, 0.55, 0.48, 0.85, 0.6, 0.95] },
    "bank-import": { t: "list", items: [["📥", "Строк в выписке", "248"], ["✓", "Сопоставлено", "241"], ["₸", "Поступления", "4,2 млн"]] },
    currency: { t: "dual", a: ["USD", "512,4 ₸"], b: ["EUR", "558,1 ₸"] },
    recurring: { t: "cal", highlight: [3, 10, 17, 25], label: "Аренда · 25-е число" },
    "business-trips": { t: "list", items: [["✈", "Командировка", "Астана"], ["₸", "Суточные", "18 600"], ["📋", "Аванс", "120 000 ₸"]] },
    accounting: { t: "matrix", title: "Проводки за месяц", cells: [["Дт 1310", "4,2 млн"], ["Кт 3350", "4,2 млн"], ["Дт 7210", "890 тыс"], ["Кт 1310", "890 тыс"]] },
    turnover: { t: "big", label: "Оборот по счёту 1310", value: 12400000, suffix: " ₸", delta: "Сальдо Дт" },
    "account-card": { t: "spark", label: "Счёт 3350 · Кредиторка", values: [0.3, 0.45, 0.42, 0.58, 0.55, 0.72, 0.68, 0.85], end: 2400000 },
    "chess-board": { t: "matrix", title: "Шахматка Дт×Кт", cells: [["1310", "3350"], ["7210", "1310"], ["3350", "6110"], ["1310", "7210"]] },
    "financial-statements": { t: "kpi4", items: [["Активы", 45200000, " ₸"], ["Обязательства", 18100000, " ₸"], ["Капитал", 27100000, " ₸"], ["Чистая прибыль", 3850000, " ₸"]] },
    assets: { t: "hbars", rows: [["Здание", 0.88, "аморт. 2%"], ["Оборудование", 0.62, "аморт. 15%"], ["Авто", 0.41, "аморт. 20%"]] },
    hr: { t: "big", label: "Фонд оплаты труда", value: 12400000, suffix: " ₸", delta: "47 сотрудников" },
    timesheet: { t: "cal", highlight: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12], label: "Табель Т-13 · 168 ч" },
    vacations: { t: "list", items: [["🏖", "Иванов А.", "14 дн."], ["🏖", "Серова М.", "7 дн."], ["₸", "Отпускные", "186 000 ₸"]] },
    "hr-orders": { t: "list", items: [["📜", "Приказ Т-1", "Приём"], ["📜", "Т-5", "Перевод"], ["📜", "Т-6", "Увольнение"]] },
    deductions: { t: "chart", labels: ["ИПН", "ОПВ", "ОСМС", "ВОСМС", "ИПН удерж"], bars: [0.7, 0.65, 0.4, 0.35, 0.5] },
    "sick-leaves": { t: "big", label: "Больничный к выплате", value: 186400, suffix: " ₸", delta: "Стаж 8 лет · 80%" },
    reports: { t: "kpi4", items: [["ФНО 300", 1120000, " ₸"], ["ФНО 200", "—", ""], ["ФНО 910", "—", ""], ["Срок", "25.04", ""]] },
    taxinfo: { t: "big", label: "НК РК 2026", value: 2026, suffix: "", delta: "Ст. 241–250 НДС 16%" },
    edo: { t: "kpi4", items: [["ЭСФ отправлено", 124, ""], ["Подписано", 118, ""], ["Ожидает", 6, ""], ["Отклонено", 0, ""]] },
    check: { t: "dual", a: ["БИН", "110640020454"], b: ["ЮЛ", "ТОО «Фарма-Life»"] },
    documents: { t: "kpi4", items: [["Счета", 89, ""], ["Накладные", 156, ""], ["Акты", 42, ""], ["Всего", 287, ""]] },
    workflow: { t: "funnel", steps: [["Черновик", 24], ["Согласование", 12], ["Подпись", 5], ["Проведён", 18]], color: "#0EA5E9" },
    exports: { t: "dual", a: ["Excel", "48 файлов"], b: ["PDF", "31 файл"] },
    "doc-generator": { t: "big", label: "AI сгенерировал", value: 127, suffix: " документов", delta: "договор · акт · счёт" },
    sono: { t: "ring", pct: 100, label: "XML для КГД", sub: "ФНО 300 готова" },
    "analytics-charts": { t: "chart", labels: ["Q1", "Q2", "Q3", "Q4", "Q1", "Q2"], bars: [0.5, 0.62, 0.58, 0.78, 0.72, 0.95] },
    forecast: { t: "spark", label: "Кэшфлоу прогноз", values: [0.4, 0.35, 0.5, 0.45, 0.7, 0.65, 0.9, 0.85], end: 8200000 },
    budgeting: { t: "hbars", rows: [["Выручка", 0.92, "план 14,2 млн"], ["Себестоимость", 0.58, "план 6,1 млн"], ["Маржа", 0.74, "факт 8,1 млн"]] },
    "management-reports": { t: "kpi4", items: [["Выручка", 14200000, " ₸"], ["Себест.", 6800000, " ₸"], ["EBITDA", 3850000, " ₸"], ["Cash", 2400000, " ₸"]] },
    calendar: { t: "cal", highlight: [5, 15, 25, 28], label: "ФНО · зарплата · НДС" },
    ai: { t: "chat", q: "Ставка НДС в 2026?", a: "16% — ст. 241 НК РК" },
    notifications: { t: "list", items: [["🔔", "Срок ФНО 300", "3 дня"], ["🔔", "Дебиторка", "+420 тыс"], ["✓", "Выписка импорт", "готово"]] },
    "ai-actions": { t: "list", items: [["🤖", "Создана проводка", "14:02"], ["🤖", "Подсказка НДС", "13:58"], ["🤖", "Экспорт ОСВ", "09:15"]] },
    "document-scanner": { t: "scan", amount: 2480000 },
    "scheduled-tasks": { t: "list", items: [["⏱", "Амортизация ОС", "01:00"], ["⏱", "Курсы НБРК", "09:00"], ["⏱", "Резерв копия", "23:00"]] },
    migration: { t: "big", label: "Импортировано из 1С", value: 18420, suffix: " записей", delta: "справочники + документы" },
    scan: { t: "dual", a: ["Сканов", "34"], b: ["OCR точность", "98%"] },
    industry: { t: "kpi4", items: [["Медицина", "✓", ""], ["Общепит", "✓", ""], ["Услуги", "✓", ""], ["Торговля", "✓", ""]] },
    transport: { t: "chart", labels: ["Пн", "Вт", "Ср", "Чт", "Пт"], bars: [0.6, 0.75, 0.7, 0.82, 0.55] },
    help: { t: "big", label: "Статей в справке", value: 186, suffix: "", delta: "видео + скриншоты" },
    companies: { t: "kpi4", items: [["ТОО «Алма»", "активна", ""], ["ИП Касым", "активна", ""], ["ТОО Beta", "архив", ""], ["Всего", "3", ""]] },
    settings: { t: "list", items: [["⚙", "Модули включены", "58/61"], ["👤", "Профиль", "kashebaev@gmail.com"], ["💳", "Подписка", "активна"]] },
    support: { t: "big", label: "Обращений решено", value: 98, suffix: "%", delta: "виджет 💬 на сайте" },
  };

  function barsHtml(bars, color) {
    return bars
      .map(function (h, i) {
        return '<div class="bar" data-bar="' + i + '" style="background:linear-gradient(180deg,' + (color || "var(--accent)") + ',var(--purple))"></div>';
      })
      .join("");
  }

  function render(key, accent) {
    var d = F[key];
    if (!d) {
      d = { t: "kpi4", items: [["Модуль", 0, key], ["Статус", 0, "активен"], ["Записей", 100, ""], ["Обновлено", 0, "сегодня"]] };
    }
    accent = accent || "var(--accent)";
    var wrap = '<div class="viz-body" data-viz="' + d.t + '" data-key="' + esc(key) + '">';

    if (d.t === "kpi4") {
      wrap +=
        '<div class="kpis kpis-lg">' +
        d.items
          .map(function (it, i) {
            var isNum = typeof it[1] === "number";
            var suf = it[2] || "";
            return (
              '<div class="card kpi" data-el="k' +
              i +
              '"><div class="lbl">' +
              esc(it[0]) +
              '</div><div class="val" style="color:' +
              accent +
              '"' +
              (isNum ? ' data-c="' + it[1] + '" data-suffix="' + esc(suf) + '"' : "") +
              ">" +
              (isNum ? "0" + esc(suf) : esc(String(it[1]) + suf)) +
              "</div></div>"
            );
          })
          .join("") +
        "</div>";
    } else if (d.t === "chart") {
      wrap +=
        '<div class="chart chart-lg" data-el="chart">' +
        barsHtml(d.bars, accent) +
        "</div>" +
        (d.labels
          ? '<div class="chart-labels">' + d.labels.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("") + "</div>"
          : "");
    } else if (d.t === "big") {
      wrap +=
        '<div class="viz-big" data-el="big">' +
        '<div class="viz-big-lbl">' +
        esc(d.label) +
        '</div><div class="viz-big-num" data-c="' +
        d.value +
        '" data-suffix="' +
        esc(d.suffix || "") +
        '" style="color:' +
        accent +
        '">0' +
        esc(d.suffix || "") +
        '</div><div class="viz-big-delta">' +
        esc(d.delta || "") +
        "</div></div>";
    } else if (d.t === "dual") {
      wrap +=
        '<div class="viz-dual">' +
        '<div class="card viz-dual-box" data-el="da"><div class="lbl">' +
        esc(d.a[0]) +
        '</div><div class="val">' +
        esc(d.a[1]) +
        (d.a[2] ? '<span class="sub2">' + esc(d.a[2]) + "</span>" : "") +
        '</div></div><div class="card viz-dual-box" data-el="db"><div class="lbl">' +
        esc(d.b[0]) +
        '</div><div class="val">' +
        esc(d.b[1]) +
        (d.b[2] ? '<span class="sub2">' + esc(d.b[2]) + "</span>" : "") +
        "</div></div></div>";
    } else if (d.t === "funnel") {
      var max = d.steps[0][1];
      wrap += '<div class="viz-funnel" data-el="funnel">';
      d.steps.forEach(function (s, i) {
        var w = Math.round((s[1] / max) * 100);
        wrap +=
          '<div class="f-step" data-step="' +
          i +
          '"><span class="f-lbl">' +
          esc(s[0]) +
          '</span><div class="f-bar-wrap"><div class="f-bar" data-fw="' +
          w +
          '" style="background:' +
          (d.color || accent) +
          '"></div></div><span class="f-num">' +
          s[1] +
          "</span></div>";
      });
      wrap += "</div>";
    } else if (d.t === "hbars") {
      wrap += '<div class="viz-hbars" data-el="hbars">';
      d.rows.forEach(function (r, i) {
        wrap +=
          '<div class="hb-row" data-hb="' +
          i +
          '"><span class="hb-lbl">' +
          esc(r[0]) +
          '</span><div class="hb-track"><div class="hb-fill" data-hp="' +
          Math.round(r[1] * 100) +
          '" style="background:' +
          accent +
          '"></div></div><span class="hb-val">' +
          esc(r[2]) +
          "</span></div>";
      });
      wrap += "</div>";
    } else if (d.t === "ring") {
      var r = 88;
      var c = 2 * Math.PI * r;
      wrap +=
        '<div class="viz-ring" data-el="ring"><svg viewBox="0 0 200 200" class="ring-svg">' +
        '<circle cx="100" cy="100" r="' +
        r +
        '" fill="none" stroke="#1C2233" stroke-width="18"/>' +
        '<circle cx="100" cy="100" r="' +
        r +
        '" fill="none" stroke="' +
        accent +
        '" stroke-width="18" stroke-linecap="round" ' +
        'stroke-dasharray="' +
        c +
        '" stroke-dashoffset="' +
        c +
        '" data-ring-c="' +
        c +
        '" data-ring-pct="' +
        d.pct +
        '" transform="rotate(-90 100 100)"/></svg>' +
        '<div class="ring-center"><div class="ring-pct" data-ring-num>0%</div><div class="ring-lbl">' +
        esc(d.label) +
        '</div><div class="ring-sub">' +
        esc(d.sub || "") +
        "</div></div></div>";
    } else if (d.t === "spark") {
      wrap +=
        '<div class="viz-spark" data-el="spark" data-spark-values="' +
        encodeURIComponent(JSON.stringify(d.values)) +
        '"><div class="spark-lbl">' +
        esc(d.label) +
        '</div><svg class="spark-svg" viewBox="0 0 400 120" preserveAspectRatio="none"><polyline data-spark-line fill="none" stroke="' +
        accent +
        '" stroke-width="4" points=""/></svg><div class="spark-end" data-c="' +
        d.end +
        '" data-suffix=" ₸" style="color:' +
        accent +
        '">0 ₸</div></div>';
    } else if (d.t === "matrix") {
      wrap += '<div class="viz-matrix"><div class="matrix-title">' + esc(d.title) + '</div><div class="matrix-grid">';
      d.cells.forEach(function (cell, i) {
        wrap +=
          '<div class="matrix-cell" data-mc="' +
          i +
          '"><span class="mc-a">' +
          esc(cell[0]) +
          '</span><span class="mc-b">' +
          esc(cell[1]) +
          "</span></div>";
      });
      wrap += "</div></div>";
    } else if (d.t === "list") {
      wrap += '<div class="viz-list" data-el="list">';
      d.items.forEach(function (it, i) {
        wrap +=
          '<div class="list-row" data-li="' +
          i +
          '"><span class="li-ic">' +
          esc(it[0]) +
          '</span><span class="li-txt">' +
          esc(it[1]) +
          '</span><span class="li-val">' +
          esc(it[2]) +
          "</span></div>";
      });
      wrap += "</div>";
    } else if (d.t === "ticker") {
      wrap +=
        '<div class="viz-ticker" data-el="tick"><div class="tick-lbl">' +
        esc(d.label) +
        '</div><div class="tick-num" data-c="' +
        d.value +
        '" data-suffix="' +
        esc(d.suffix) +
        '" style="color:' +
        accent +
        '">0' +
        esc(d.suffix) +
        '</div><div class="tick-sub">' +
        esc(d.sub || "") +
        "</div></div>";
    } else if (d.t === "cal") {
      wrap += '<div class="viz-cal" data-el="cal"><div class="cal-lbl">' + esc(d.label) + '</div><div class="cal-grid">';
      for (var day = 1; day <= 28; day++) {
        var hi = d.highlight && d.highlight.indexOf(day) >= 0;
        wrap += '<div class="cal-day' + (hi ? " hi" : "") + '" data-day="' + day + '">' + day + "</div>";
      }
      wrap += "</div></div>";
    } else if (d.t === "chat") {
      wrap +=
        '<div class="viz-chat" data-el="chat"><div class="bubble q" data-el="q">' +
        esc(d.q) +
        '</div><div class="bubble a" data-el="a">' +
        esc(d.a) +
        "</div></div>";
    } else if (d.t === "scan") {
      wrap +=
        '<div class="viz-scan-row" data-el="scan"><div class="doc doc-lg"><div style="font-weight:800;font-size:22px;margin-bottom:12px">СЧЁТ-ФАКТУРА</div>' +
        '<div class="line" style="width:90%"></div><div class="line" style="width:75%"></div><div class="line" style="width:85%"></div>' +
        '<div class="scanline" data-el="scanln"></div></div>' +
        '<div class="viz-big" style="flex:1"><div class="viz-big-lbl">Сумма</div><div class="viz-big-num" data-c="' +
        d.amount +
        '" data-suffix=" ₸" style="color:' +
        accent +
        '">0 ₸</div></div></div>';
    }

    return wrap + "</div>";
  }

  function anim(el, key, p, utils) {
    var body = el.querySelector(".viz-body");
    if (!body) return;
    var t = body.getAttribute("data-viz");
    var reveal = utils.reveal;
    var fmt = utils.fmt;
    var easeOut = utils.easeOut;
    var clamp = utils.clamp;
    var lerp = utils.lerp;

    if (t === "kpi4" || t === "chart" || t === "big" || t === "ticker" || t === "spark" || t === "scan") {
      var cnt = clamp((p - 0.12) / 0.42, 0, 1);
      body.querySelectorAll("[data-c]").forEach(function (n) {
        var target = +n.getAttribute("data-c");
        var suf = n.getAttribute("data-suffix") || "";
        n.textContent = fmt(target * easeOut(cnt)) + suf;
      });
    }

    if (t === "chart") {
      var spec = F[key];
      if (spec && spec.bars) {
        spec.bars.forEach(function (h, k) {
          var bp = clamp((p - 0.15 - k * 0.04) / 0.35, 0, 1);
          var bar = body.querySelector('[data-bar="' + k + '"]');
          if (bar) bar.style.height = easeOut(bp) * h * 100 + "%";
        });
      }
      reveal(body.querySelector(".chart"), p, { delay: 0.2, dy: 30 });
    }

    if (t === "funnel") {
      body.querySelectorAll(".f-bar").forEach(function (bar, k) {
        var w = +bar.getAttribute("data-fw") || 0;
        var bp = clamp((p - 0.1 - k * 0.06) / 0.35, 0, 1);
        bar.style.width = easeOut(bp) * w + "%";
      });
      reveal(body.querySelector(".viz-funnel"), p, { delay: 0.15 });
    }

    if (t === "hbars") {
      body.querySelectorAll(".hb-fill").forEach(function (fill, k) {
        var hp = +fill.getAttribute("data-hp") || 0;
        var bp = clamp((p - 0.12 - k * 0.05) / 0.38, 0, 1);
        fill.style.width = easeOut(bp) * hp + "%";
      });
      reveal(body, p, { delay: 0.1 });
    }

    if (t === "ring") {
      var circ = body.querySelector("[data-ring-c]");
      var pctEl = body.querySelector("[data-ring-num]");
      if (circ) {
        var c = +circ.getAttribute("data-ring-c");
        var pct = +circ.getAttribute("data-ring-pct") || 0;
        var bp = easeOut(clamp((p - 0.15) / 0.45, 0, 1));
        circ.style.strokeDashoffset = c * (1 - (pct / 100) * bp);
        if (pctEl) pctEl.textContent = Math.round(pct * bp) + "%";
      }
      reveal(body, p, { delay: 0.1 });
    }

    if (t === "spark") {
      var sparkEl = body.querySelector("[data-spark-values]");
      var line = body.querySelector("[data-spark-line]");
      if (sparkEl && line) {
        var vals = JSON.parse(decodeURIComponent(sparkEl.getAttribute("data-spark-values")));
        var w = 400,
          h = 120,
          pad = 8;
        var pts = vals
          .map(function (v, i) {
            var x = pad + (i / (vals.length - 1)) * (w - 2 * pad);
            var y = h - pad - v * (h - 2 * pad);
            return x + "," + y;
          })
          .join(" ");
        var bp = easeOut(clamp((p - 0.1) / 0.5, 0, 1));
        var n = Math.max(2, Math.floor(vals.length * bp));
        line.setAttribute("points", pts.split(" ").slice(0, n).join(" "));
      }
      reveal(body.querySelector(".viz-spark"), p, { delay: 0.12 });
    }

    if (t === "matrix") {
      body.querySelectorAll(".matrix-cell").forEach(function (cell, k) {
        reveal(cell, p, { delay: 0.08 + k * 0.05, dy: 16 });
      });
    }

    if (t === "list") {
      body.querySelectorAll(".list-row").forEach(function (row, k) {
        reveal(row, p, { delay: 0.1 + k * 0.07, dy: 20 });
      });
    }

    if (t === "dual") {
      reveal(body.querySelector('[data-el="da"]'), p, { delay: 0.15, dy: 24 });
      reveal(body.querySelector('[data-el="db"]'), p, { delay: 0.28, dy: 24 });
    }

    if (t === "cal") {
      body.querySelectorAll(".cal-day.hi").forEach(function (day, k) {
        var bp = clamp((p - 0.15 - k * 0.03) / 0.3, 0, 1);
        day.style.opacity = easeOut(bp);
        day.style.transform = "scale(" + lerp(0.7, 1, easeOut(bp)) + ")";
      });
      reveal(body.querySelector(".cal-lbl"), p, { delay: 0.05 });
    }

    if (t === "chat") {
      reveal(body.querySelector('[data-el="q"]'), p, { delay: 0.1 });
      reveal(body.querySelector('[data-el="a"]'), p, { delay: 0.35 });
    }

    if (t === "scan") {
      var sp = clamp((p - 0.12) / 0.45, 0, 1);
      var scanln = body.querySelector('[data-el="scanln"]');
      if (scanln) {
        scanln.style.top = lerp(0, 280, sp) + "px";
        scanln.style.opacity = sp > 0 && sp < 1 ? 1 : 0.6;
      }
      reveal(body.querySelector(".doc"), p, { delay: 0 });
      reveal(body.querySelector(".viz-big"), p, { delay: 0.45 });
    }

  }

  window.PromoViz = { render: render, anim: anim, FEATURE: F };
})();
