#!/usr/bin/env node

/**
 * 📸 Автоматическая генерация скриншотов для справочного центра Finstat.kz
 * 
 * Запуск:
 *   cd .scripts/screenshots
 *   npm install
 *   node generate-screenshots.js
 * 
 * Результат: ~115 скриншотов в public/help/
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════
// КОНФИГУРАЦИЯ — ИЗМЕНИТЕ ПОД СЕБЯ
// ═══════════════════════════════════════════

const CONFIG = {
  // URL вашей системы
  BASE_URL: process.env.FINSTAT_URL || "https://finstat.kz",
  
  // Тестовый аккаунт (создайте отдельный для скриншотов!)
  TEST_EMAIL: process.env.TEST_EMAIL || "test@finstat.kz",
  TEST_PASSWORD: process.env.TEST_PASSWORD || "TestPassword123",
  
  // Папка для сохранения скриншотов (относительно корня проекта)
  OUTPUT_DIR: path.resolve(__dirname, "../../public/help"),
  
  // Размер окна
  VIEWPORT: { width: 1440, height: 900 },
  
  // Тема (light / dark)
  THEME: "light",
  
  // Замедление действий (для отладки) — 0 для продакшна
  SLOW_MO: 100,
  
  // Headless (false — видим браузер, true — без UI)
  HEADLESS: false,
  
  // Таймауты
  PAGE_TIMEOUT: 30000,
  ACTION_TIMEOUT: 5000,
  
  // Пропустить какие-то разделы (если не нужны)
  // Пример: SKIP_SECTIONS: ['15-sono-submit'] — пропустить cabinet.salyk.kz
  SKIP_SECTIONS: [
    "15-sono-submit", // cabinet.salyk.kz — внешний сайт, нет доступа без ЭЦП
  ],
};

// ═══════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════

let totalScreenshots = 0;
let successCount = 0;
let skipCount = 0;
let errorCount = 0;
const errors = [];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function takeShot(page, fileName, description = "") {
  totalScreenshots++;
  const fullPath = path.join(CONFIG.OUTPUT_DIR, fileName);
  ensureDir(path.dirname(fullPath));
  
  try {
    // Ждём что страница не загружается
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    
    await page.screenshot({
      path: fullPath,
      fullPage: false,
    });
    
    console.log(`  ✅ ${fileName} ${description ? `— ${description}` : ""}`);
    successCount++;
    return true;
  } catch (err) {
    console.log(`  ❌ ${fileName} — ${err.message}`);
    errors.push({ file: fileName, error: err.message });
    errorCount++;
    return false;
  }
}

async function safeClick(page, selector, options = {}) {
  try {
    await page.click(selector, { timeout: CONFIG.ACTION_TIMEOUT, ...options });
    await page.waitForTimeout(500);
    return true;
  } catch (err) {
    console.log(`  ⚠ Не удалось кликнуть ${selector}: ${err.message}`);
    return false;
  }
}

async function safeFill(page, selector, value) {
  try {
    await page.fill(selector, value, { timeout: CONFIG.ACTION_TIMEOUT });
    return true;
  } catch (err) {
    console.log(`  ⚠ Не удалось заполнить ${selector}: ${err.message}`);
    return false;
  }
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { timeout: CONFIG.PAGE_TIMEOUT, waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    return true;
  } catch (err) {
    console.log(`  ⚠ Не удалось открыть ${url}: ${err.message}`);
    return false;
  }
}

function shouldSkip(sectionFolder) {
  return CONFIG.SKIP_SECTIONS.some(skip => sectionFolder.includes(skip));
}

async function section(name, folder, fn) {
  if (shouldSkip(folder)) {
    console.log(`\n⏭ Пропускаю раздел: ${name}\n`);
    skipCount++;
    return;
  }
  
  console.log(`\n📁 ${name}`);
  console.log("═".repeat(50));
  
  try {
    await fn();
  } catch (err) {
    console.log(`\n❌ Ошибка в разделе ${name}: ${err.message}\n`);
    errors.push({ section: name, error: err.message });
  }
}

// ═══════════════════════════════════════════
// СЦЕНАРИИ СКРИНШОТОВ
// ═══════════════════════════════════════════

async function login(page) {
  console.log("\n🔐 Вход в систему...");
  await safeGoto(page, `${CONFIG.BASE_URL}/auth`);
  await page.waitForTimeout(1000);
  
  // Заполняем форму входа
  await safeFill(page, 'input[type="email"]', CONFIG.TEST_EMAIL);
  await safeFill(page, 'input[type="password"]', CONFIG.TEST_PASSWORD);
  
  // Кликаем кнопку входа
  const loginButton = await page.$('button:has-text("Войти")');
  if (loginButton) {
    await loginButton.click();
  }
  
  // Ждём редирект на dashboard
  await page.waitForURL("**/dashboard**", { timeout: 10000 }).catch(() => {
    console.log("⚠ Редирект на dashboard не произошёл, продолжаем");
  });
  
  await page.waitForTimeout(2000);
  console.log("✅ Авторизованы\n");
}

// ─── 01. РЕГИСТРАЦИЯ ───
async function captureRegistration(page) {
  await section("01. Регистрация", "01-registration", async () => {
    // Выходим (если залогинены)
    await safeGoto(page, `${CONFIG.BASE_URL}/auth`);
    
    // 01 — главная (страница входа)
    await takeShot(page, "01-registration/01-homepage.png", "Страница входа");
    
    // 02 — кнопка Войти подсвечена (на самой странице авторизации)
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(b => {
        if (b.textContent.includes("Войти") || b.textContent.includes("Регистр")) {
          b.style.boxShadow = "0 0 0 4px #A855F780";
        }
      });
    });
    await takeShot(page, "01-registration/02-login-button.png", "Кнопки Войти/Регистрация");
    
    // Сбрасываем стили
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach(b => b.style.boxShadow = "");
    });
    
    // 03 — переключение на Регистрацию
    const regTab = await page.$('button:has-text("Регистрация"), a:has-text("Регистрация"), label:has-text("Регистрация")');
    if (regTab) {
      await regTab.click();
      await page.waitForTimeout(500);
    }
    await takeShot(page, "01-registration/03-register-tab.png", "Вкладка Регистрация активна");
    
    // 04 — заполнение формы
    await safeFill(page, 'input[type="email"]', "demo@finstat.kz");
    await safeFill(page, 'input[type="password"]', "DemoPass123");
    await safeFill(page, 'input[name="full_name"], input[placeholder*="ФИО"], input[placeholder*="Имя"]', "Иванов Иван Иванович");
    await safeFill(page, 'input[name="company_name"], input[placeholder*="Компания"], input[placeholder*="Организация"]', "ТОО Демо-Компания");
    await page.waitForTimeout(500);
    await takeShot(page, "01-registration/04-form.png", "Форма регистрации заполнена");
    
    // 05, 06 — пропускаем (подтверждение email + дашборд после входа сделаем отдельно)
    
    // Логинимся как тестовый пользователь
    await login(page);
    
    // 06 — дашборд
    await takeShot(page, "01-registration/06-dashboard.png", "Главный дашборд после входа");
  });
}

// ─── 02. ПЕРВАЯ НАСТРОЙКА ───
async function captureFirstSetup(page) {
  await section("02. Первая настройка", "02-first-setup", async () => {
    // 01 — настройки компании
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/settings`);
    await takeShot(page, "02-first-setup/01-company-settings.png", "Профиль компании");
    
    // 02 — режим налогообложения
    await page.evaluate(() => {
      const select = document.querySelector('select[name*="tax"], select[name*="mode"]');
      if (select) select.style.boxShadow = "0 0 0 4px #A855F780";
    });
    await takeShot(page, "02-first-setup/02-tax-mode.png", "Режим налогообложения");
    
    // 03 — сотрудники
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/hr`);
    await takeShot(page, "02-first-setup/03-employees.png", "Список сотрудников");
    
    // 04 — контрагенты
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/counterparties`);
    await takeShot(page, "02-first-setup/04-counterparties.png", "Список контрагентов");
    
    // 05 — управление модулями
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/settings/modules`);
    await page.waitForTimeout(1000);
    await takeShot(page, "02-first-setup/05-modules.png", "Управление модулями");
  });
}

// ─── 03. ИНТЕРФЕЙС ───
async function captureInterface(page) {
  await section("03. Обзор интерфейса", "03-interface", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard`);
    
    // 01 — общий вид с акцентом на sidebar
    await takeShot(page, "03-interface/01-sidebar.png", "Sidebar навигация");
    
    // 02 — поиск
    const searchInput = await page.$('input[placeholder*="оиск"]');
    if (searchInput) {
      await searchInput.fill("конт");
      await page.waitForTimeout(500);
    }
    await takeShot(page, "03-interface/02-search.png", "Поиск модулей");
    
    if (searchInput) await searchInput.fill("");
    
    // 03 — шапка
    await takeShot(page, "03-interface/03-header.png", "Шапка страницы");
    
    // 04 — кнопка Жанары
    await page.evaluate(() => {
      const btn = document.querySelector('[class*="janara"], [class*="JanaraButton"]');
      if (btn) btn.style.boxShadow = "0 0 0 6px #A855F780";
    });
    await takeShot(page, "03-interface/04-zhanara-button.png", "Кнопка Жанара");
    
    // 05 — уведомления
    const bell = await page.$('[class*="notification"], [class*="bell"]');
    if (bell) {
      await bell.click();
      await page.waitForTimeout(500);
    }
    await takeShot(page, "03-interface/05-notifications.png", "Уведомления");
    
    // Закрываем уведомления
    await page.keyboard.press("Escape");
    
    // 06 — свёрнутый sidebar
    const collapseBtn = await page.$('[class*="logo"], [class*="brand"]');
    if (collapseBtn) {
      await collapseBtn.click();
      await page.waitForTimeout(500);
    }
    await takeShot(page, "03-interface/06-collapse.png", "Свёрнутый sidebar");
    
    // Возвращаем как было
    if (collapseBtn) await collapseBtn.click();
  });
}

// ─── 04. ПРОФИЛЬ КОМПАНИИ ───
async function captureProfile(page) {
  await section("04. Профиль компании", "04-profile", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard`);
    
    // 01 — клик на настройки в меню
    await takeShot(page, "04-profile/01-open-settings.png", "Главная страница");
    
    // 02 — открыты настройки
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/settings`);
    await takeShot(page, "04-profile/02-profile-tab.png", "Профиль компании открыт");
    
    // 03, 04, 05, 06 — формы заполнены (требуют тестовых данных в системе)
    await takeShot(page, "04-profile/03-basic-info.png", "Основные данные");
    await takeShot(page, "04-profile/04-bank.png", "Банковские реквизиты");
    await takeShot(page, "04-profile/05-director.png", "ФИО директора");
    await takeShot(page, "04-profile/06-save.png", "Кнопка Сохранить");
  });
}

// ─── 05. КОНТРАГЕНТЫ ───
async function captureCounterparties(page) {
  await section("05. Контрагенты", "05-counterparties", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/counterparties`);
    
    await takeShot(page, "05-counterparties/01-list.png", "Список контрагентов");
    
    // Подсвечиваем кнопку Добавить
    await page.evaluate(() => {
      const btn = document.querySelector('button:not([disabled])');
      const buttons = document.querySelectorAll('button');
      buttons.forEach(b => {
        if (b.textContent.includes("Добавить") || b.textContent.includes("+")) {
          b.style.boxShadow = "0 0 0 4px #A855F780";
        }
      });
    });
    await takeShot(page, "05-counterparties/02-add-button.png", "Кнопка Добавить подсвечена");
    
    // Открываем форму
    const addBtn = await page.$('button:has-text("Добавить"), button:has-text("+ Контрагент")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1000);
    }
    await takeShot(page, "05-counterparties/03-form.png", "Форма добавления");
    
    // Возврат к списку
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await takeShot(page, "05-counterparties/04-saved.png", "Список после добавления");
    
    // Поиск
    const searchInput = await page.$('input[placeholder*="оиск"], input[type="search"]');
    if (searchInput) {
      await searchInput.fill("Альфа");
      await page.waitForTimeout(500);
    }
    await takeShot(page, "05-counterparties/05-search.png", "Поиск работает");
  });
}

// ─── 06. ЗАКАЗЫ ───
async function captureOrders(page) {
  await section("06. Заказы", "06-orders", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/orders`);
    
    await takeShot(page, "06-orders/01-list.png", "Список заказов");
    await takeShot(page, "06-orders/02-new.png", "Новый заказ");
    await takeShot(page, "06-orders/03-select-client.png", "Выбор клиента");
    await takeShot(page, "06-orders/04-items.png", "Добавление позиций");
    await takeShot(page, "06-orders/05-totals.png", "Суммы и НДС");
    await takeShot(page, "06-orders/06-save.png", "Сохранение заказа");
    await takeShot(page, "06-orders/07-documents.png", "Формирование документов");
  });
}

// ─── 07. НОМЕНКЛАТУРА ───
async function captureNomenclature(page) {
  await section("07. Номенклатура", "07-nomenclature", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/nomenclature`);
    
    await takeShot(page, "07-nomenclature/01-list.png", "Список товаров");
    
    const addBtn = await page.$('button:has-text("Добавить"), button:has-text("+")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1000);
    }
    await takeShot(page, "07-nomenclature/02-form.png", "Форма добавления");
    await takeShot(page, "07-nomenclature/03-min-stock.png", "Минимальный остаток");
    
    await page.keyboard.press("Escape");
    await takeShot(page, "07-nomenclature/04-saved.png", "После сохранения");
  });
}

// ─── 08. СКЛАД ───
async function captureWarehouse(page) {
  await section("08. Склад и остатки", "08-stock", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/warehouse`);
    
    await takeShot(page, "08-stock/01-list.png", "Остатки на складе");
    await takeShot(page, "08-stock/02-colors.png", "Цветовая индикация");
    
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/incoming`);
    await takeShot(page, "08-stock/03-incoming.png", "Поступления");
    
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/orders`);
    await takeShot(page, "08-stock/04-outgoing.png", "Расходы (заказы)");
  });
}

// ─── 09. ПРОВОДКИ ───
async function captureEntries(page) {
  await section("09. Бухгалтерские проводки", "09-entries", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/accounting`);
    
    await takeShot(page, "09-entries/01-list.png", "Журнал проводок");
    
    const addBtn = await page.$('button:has-text("Добавить"), button:has-text("+ Проводку")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1000);
    }
    await takeShot(page, "09-entries/02-form.png", "Форма проводки");
    
    await page.keyboard.press("Escape");
    await takeShot(page, "09-entries/03-examples.png", "Примеры проводок");
    await takeShot(page, "09-entries/04-result.png", "Результат");
  });
}

// ─── 10. ОСВ ───
async function captureOSV(page) {
  await section("10. Оборотно-сальдовая ведомость", "10-osv", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/turnover`);
    
    await takeShot(page, "10-osv/01-table.png", "ОСВ таблица");
    await takeShot(page, "10-osv/02-period.png", "Выбор периода");
    await takeShot(page, "10-osv/03-columns.png", "Колонки ОСВ");
    
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/account-card`);
    await takeShot(page, "10-osv/04-card.png", "Карточка счёта");
    
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/exports`);
    await takeShot(page, "10-osv/05-export.png", "Экспорт в Excel");
  });
}

// ─── 11. СОТРУДНИКИ ───
async function captureEmployees(page) {
  await section("11. Сотрудники", "11-employees", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/hr`);
    
    await takeShot(page, "11-employees/01-list.png", "Список сотрудников");
    
    const addBtn = await page.$('button:has-text("Добавить")');
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(1000);
    }
    await takeShot(page, "11-employees/02-form.png", "Форма сотрудника");
    
    await page.keyboard.press("Escape");
    
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/doc-generator`);
    await takeShot(page, "11-employees/03-order.png", "Генератор приказа Т-1");
  });
}

// ─── 12. ЗАРПЛАТА ───
async function capturePayroll(page) {
  await section("12. Расчёт зарплаты", "12-payroll", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/hr-orders`);
    
    await takeShot(page, "12-payroll/01-page.png", "Страница ЗП");
    await takeShot(page, "12-payroll/02-month.png", "Выбор месяца");
    await takeShot(page, "12-payroll/03-calculate.png", "Расчёт автоматически");
    await takeShot(page, "12-payroll/04-results.png", "Результаты расчёта");
    await takeShot(page, "12-payroll/05-entries.png", "Создание проводок");
    await takeShot(page, "12-payroll/06-statements.png", "Платёжная ведомость");
  });
}

// ─── 13. ФНО ОБЗОР ───
async function captureFNOOverview(page) {
  await section("13. Обзор форм ФНО", "13-fno", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/sono`);
    
    await takeShot(page, "13-fno/01-overview.png", "Главная СОНО");
    
    // Делаем по одному скриншоту каждой формы
    const forms = [
      ["910.00", "13-fno/02-form-910.png"],
      ["200.00", "13-fno/03-form-200.png"],
      ["300.00", "13-fno/04-form-300.png"],
      ["100.00", "13-fno/05-form-100.png"],
      ["700.00", "13-fno/06-form-700.png"],
    ];
    
    for (const [formCode, filePath] of forms) {
      // Кликаем на вкладку "+ Создать"
      const createTab = await page.$('button:has-text("Создать"), [role="tab"]:has-text("Создать")');
      if (createTab) {
        await createTab.click();
        await page.waitForTimeout(500);
      }
      
      // Выбираем форму
      const select = await page.$('select');
      if (select) {
        await select.selectOption({ value: formCode });
        await page.waitForTimeout(500);
      }
      
      await takeShot(page, filePath, `Форма ${formCode}`);
    }
  });
}

// ─── 14. СОЗДАНИЕ ФНО ───
async function captureSonoCreate(page) {
  await section("14. Создание декларации СОНО", "14-sono-create", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/sono`);
    
    await takeShot(page, "14-sono-create/01-open.png", "Модуль СОНО открыт");
    
    // Календарь
    const calendarTab = await page.$('button:has-text("Календарь")');
    if (calendarTab) await calendarTab.click();
    await page.waitForTimeout(500);
    await takeShot(page, "14-sono-create/02-calendar.png", "Календарь сроков");
    
    // Создать
    const createTab = await page.$('button:has-text("Создать")');
    if (createTab) await createTab.click();
    await page.waitForTimeout(500);
    await takeShot(page, "14-sono-create/03-create-tab.png", "Вкладка Создать");
    
    await takeShot(page, "14-sono-create/04-form-period.png", "Выбор формы и периода");
    
    // Расчёт
    const calcBtn = await page.$('button:has-text("Рассчитать")');
    if (calcBtn) {
      await calcBtn.click();
      await page.waitForTimeout(3000);
    }
    await takeShot(page, "14-sono-create/05-calculate.png", "Кнопка Рассчитать");
    await takeShot(page, "14-sono-create/06-results.png", "Результаты расчёта");
    
    // AI совет
    const adviceBtn = await page.$('button:has-text("Совет Жанары")');
    if (adviceBtn) {
      await adviceBtn.click();
      await page.waitForTimeout(5000);
    }
    await takeShot(page, "14-sono-create/07-advice.png", "Совет Жанары");
    
    await takeShot(page, "14-sono-create/08-download.png", "Скачать XML");
  });
}

// ─── 16. ЖАНАРА ───
async function captureZhanara(page) {
  await section("16. AI Жанара", "16-zhanara", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard`);
    
    // Открываем Жанару через кнопку
    const zhanaraBtn = await page.$('[class*="janara"], [class*="JanaraButton"], button:has-text("Жанара"), button:has-text("✦")');
    if (zhanaraBtn) {
      await zhanaraBtn.click();
      await page.waitForTimeout(1500);
    }
    await takeShot(page, "16-zhanara/01-intro.png", "Открытая Жанара");
    
    // Закрываем
    await page.keyboard.press("Escape");
    
    // 02 — кнопка крупным планом
    await page.evaluate(() => {
      const btn = document.querySelector('[class*="janara"], [class*="JanaraButton"]');
      if (btn) {
        btn.style.boxShadow = "0 0 0 8px #A855F780";
        btn.style.transform = "scale(1.5)";
      }
    });
    await takeShot(page, "16-zhanara/02-button.png", "Кнопка Жанара крупно");
    
    // 03 — контекст: открываем какой-то модуль и Жанару
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/counterparties`);
    const zhanaraBtn2 = await page.$('[class*="janara"], button:has-text("✦")');
    if (zhanaraBtn2) {
      await zhanaraBtn2.click();
      await page.waitForTimeout(1500);
    }
    await takeShot(page, "16-zhanara/03-context.png", "Контекстная помощь");
    
    // 04 — диалог
    await takeShot(page, "16-zhanara/04-questions.png", "Примеры вопросов");
    
    await page.keyboard.press("Escape");
    
    // 05 — главная страница
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/ai`);
    await takeShot(page, "16-zhanara/05-main-page.png", "Главная страница Жанары");
  });
}

// ─── 17. AI ДЕЙСТВИЯ ───
async function captureAIActions(page) {
  await section("17. AI Действия", "17-actions", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/ai-actions`);
    
    await takeShot(page, "17-actions/01-overview.png", "AI Действия");
    await takeShot(page, "17-actions/02-entry.png", "Создание проводки");
    await takeShot(page, "17-actions/03-confirm.png", "Подтверждение действия");
    await takeShot(page, "17-actions/04-log.png", "Журнал действий");
  });
}

// ─── 18. МИГРАЦИЯ ───
async function captureMigration(page) {
  await section("18. Миграция из 1С", "18-migration", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/migration`);
    
    await takeShot(page, "18-migration/01-prepare.png", "Подготовка из 1С");
    await takeShot(page, "18-migration/02-open.png", "Модуль миграции");
    await takeShot(page, "18-migration/03-type.png", "Выбор типа данных");
    await takeShot(page, "18-migration/04-upload.png", "Загрузка файла");
    await takeShot(page, "18-migration/05-mapping.png", "Маппинг полей");
    await takeShot(page, "18-migration/06-fix-mapping.png", "Исправление маппинга");
    await takeShot(page, "18-migration/07-duplicates.png", "Стратегия дублей");
    await takeShot(page, "18-migration/08-progress.png", "Прогресс импорта");
    await takeShot(page, "18-migration/09-result.png", "Результат");
  });
}

// ─── 19. ЭКСПОРТ ───
async function captureExports(page) {
  await section("19. Экспорт отчётов", "19-exports", async () => {
    await safeGoto(page, `${CONFIG.BASE_URL}/dashboard/exports`);
    
    await takeShot(page, "19-exports/01-page.png", "Страница экспорта");
    await takeShot(page, "19-exports/02-reports.png", "Список отчётов");
    await takeShot(page, "19-exports/03-period.png", "Выбор периода");
    await takeShot(page, "19-exports/04-download.png", "Кнопки Excel/PDF");
  });
}

// ═══════════════════════════════════════════
// ГЛАВНАЯ ФУНКЦИЯ
// ═══════════════════════════════════════════

async function main() {
  console.log("\n");
  console.log("═══════════════════════════════════════════");
  console.log("  📸 Finstat.kz Screenshot Generator");
  console.log("═══════════════════════════════════════════");
  console.log(`URL:        ${CONFIG.BASE_URL}`);
  console.log(`Email:      ${CONFIG.TEST_EMAIL}`);
  console.log(`Output:     ${CONFIG.OUTPUT_DIR}`);
  console.log(`Viewport:   ${CONFIG.VIEWPORT.width}x${CONFIG.VIEWPORT.height}`);
  console.log(`Theme:      ${CONFIG.THEME}`);
  console.log(`Headless:   ${CONFIG.HEADLESS}`);
  console.log("═══════════════════════════════════════════\n");
  
  ensureDir(CONFIG.OUTPUT_DIR);
  
  const browser = await chromium.launch({
    headless: CONFIG.HEADLESS,
    slowMo: CONFIG.SLOW_MO,
  });
  
  const context = await browser.newContext({
    viewport: CONFIG.VIEWPORT,
    locale: "ru-RU",
  });
  
  const page = await context.newPage();
  
  // Устанавливаем тему через localStorage
  await page.addInitScript((theme) => {
    window.localStorage.setItem("finerp-theme", theme);
  }, CONFIG.THEME);
  
  const startTime = Date.now();
  
  try {
    // 01. Регистрация (включает первый логин)
    await captureRegistration(page);
    
    // Все остальные разделы (требуют авторизации)
    await captureFirstSetup(page);
    await captureInterface(page);
    await captureProfile(page);
    await captureCounterparties(page);
    await captureOrders(page);
    await captureNomenclature(page);
    await captureWarehouse(page);
    await captureEntries(page);
    await captureOSV(page);
    await captureEmployees(page);
    await capturePayroll(page);
    await captureFNOOverview(page);
    await captureSonoCreate(page);
    // 15-sono-submit пропускаем (внешний сайт)
    await captureZhanara(page);
    await captureAIActions(page);
    await captureMigration(page);
    await captureExports(page);
    
  } catch (err) {
    console.error("\n💥 Критическая ошибка:", err);
    errors.push({ critical: err.message });
  }
  
  await browser.close();
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log("\n");
  console.log("═══════════════════════════════════════════");
  console.log("  📊 Итоги");
  console.log("═══════════════════════════════════════════");
  console.log(`Всего попыток:      ${totalScreenshots}`);
  console.log(`✅ Успешно:         ${successCount}`);
  console.log(`⏭ Пропущено:       ${skipCount}`);
  console.log(`❌ Ошибок:          ${errorCount}`);
  console.log(`⏱ Время:           ${duration}с`);
  console.log("═══════════════════════════════════════════\n");
  
  if (errors.length > 0) {
    console.log("⚠ Список ошибок:");
    errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.file || e.section || "Critical"}: ${e.error}`);
    });
    console.log("");
  }
  
  console.log(`📁 Скриншоты сохранены в: ${CONFIG.OUTPUT_DIR}\n`);
  console.log("Следующие шаги:");
  console.log("  1. Проверить скриншоты в public/help/");
  console.log("  2. Подкорректировать те которые не получились");
  console.log("  3. git add public/help/");
  console.log('  4. git commit -m "feat: автогенерированные скриншоты для help"');
  console.log("  5. git push");
  console.log("");
}

main().catch(err => {
  console.error("💥 Fatal:", err);
  process.exit(1);
});
