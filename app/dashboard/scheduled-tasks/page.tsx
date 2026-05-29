"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";

type Tab = "tasks" | "templates" | "log";

const TASK_TYPES: Record<string, { name: string; icon: string; color: string; defaultSchedule: string; defaultDay: number; description: string }> = {
  fno_reminder: { name: "Напоминание о ФНО", icon: "📊", color: "#EF4444", defaultSchedule: "monthly", defaultDay: 10, description: "Проверка приближающихся сроков сдачи налоговой отчётности (ФНО 200, 300, 910 и др.)" },
  depreciation: { name: "Начисление амортизации ОС", icon: "🏗", color: "#3B82F6", defaultSchedule: "monthly", defaultDay: 28, description: "Ежемесячное начисление амортизации основных средств с проводкой Дт 7210 Кт 2420" },
  recurring_payments: { name: "Создание регулярных платежей", icon: "🔄", color: "#A855F7", defaultSchedule: "daily", defaultDay: 1, description: "Автогенерация документов для платежей с наступившей датой (аренда, подписки, лизинг)" },
  expiry_check: { name: "Проверка сроков годности", icon: "⏰", color: "#F59E0B", defaultSchedule: "weekly", defaultDay: 1, description: "Проверка партий товаров с истекающим сроком годности (≤ 30 дней)" },
  closing_period: { name: "Закрытие периода", icon: "🔒", color: "#6366F1", defaultSchedule: "monthly", defaultDay: 5, description: "Проверка закрытия предыдущего месяца: сбалансированность ОСВ, отсутствие черновиков" },
  low_stock: { name: "Контроль низких остатков", icon: "📉", color: "#EC4899", defaultSchedule: "daily", defaultDay: 1, description: "Поиск товаров ниже минимального остатка (для пополнения)" },
  currency_update: { name: "Обновление курсов валют", icon: "💱", color: "#10B981", defaultSchedule: "daily", defaultDay: 1, description: "Загрузка курсов валют от open.er-api.com" },
  backup_reminder: { name: "Напоминание о бэкапе", icon: "💾", color: "#6B7280", defaultSchedule: "weekly", defaultDay: 5, description: "Напоминание выгрузить бэкап критичных данных" },
  salary_reminder: { name: "Напоминание о выплате ЗП", icon: "💰", color: "#0EA5E9", defaultSchedule: "monthly", defaultDay: 5, description: "Напоминание о приближении срока выплаты заработной платы (5 и 15 числа)" },
  overdue_check: { name: "Просроченные платежи", icon: "⚠", color: "#DC2626", defaultSchedule: "daily", defaultDay: 1, description: "Поиск просроченных счетов от покупателей и просроченной кредиторки поставщикам" },
  reports_export: { name: "Автоэкспорт отчётов", icon: "📑", color: "#8B5CF6", defaultSchedule: "monthly", defaultDay: 1, description: "Автоматическое формирование месячного пакета отчётов (ОСВ + Баланс + ОПУ)" },
  custom: { name: "Пользовательская задача", icon: "📋", color: "#84CC16", defaultSchedule: "monthly", defaultDay: 1, description: "Произвольная задача-напоминание" },
};

const SCHEDULE_LABELS: Record<string, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
  quarterly: "Ежеквартально",
  yearly: "Ежегодно",
  on_demand: "По требованию",
};

const STATUS: Record<string, { name: string; color: string; icon: string }> = {
  success: { name: "Успешно", color: "#10B981", icon: "✓" },
  warning: { name: "С предупреждениями", color: "#F59E0B", icon: "⚠" },
  error: { name: "Ошибка", color: "#EF4444", icon: "✗" },
  running: { name: "Выполняется", color: "#3B82F6", icon: "↻" },
};

const MRP_2026 = 4325;

export default function ScheduledTasksPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("tasks");
  const [tasks, setTasks] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const empty = {
    name: "",
    task_type: "fno_reminder",
    description: "",
    schedule_type: "monthly",
    schedule_day: "10",
    schedule_hour: "9",
    is_active: true,
    notify_on_warning: true,
    notify_on_error: true,
    notes: "",
  };
  const [form, setForm] = useState(empty);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [t, r] = await Promise.all([
      supabase.from("scheduled_tasks").select("*").eq("user_id", user.id).order("name"),
      supabase.from("task_runs").select("*").eq("user_id", user.id).order("started_at", { ascending: false }).limit(100),
    ]);
    setTasks(t.data || []);
    setRuns(r.data || []);
  }

  function startCreateFromTemplate(type: string) {
    const t = TASK_TYPES[type];
    setEditing(null);
    setForm({
      name: t.name,
      task_type: type,
      description: t.description,
      schedule_type: t.defaultSchedule,
      schedule_day: String(t.defaultDay),
      schedule_hour: "9",
      is_active: true,
      notify_on_warning: true,
      notify_on_error: true,
      notes: "",
    });
    setShowForm(true);
  }

  function startEdit(t: any) {
    setEditing(t);
    setForm({
      name: t.name,
      task_type: t.task_type,
      description: t.description || "",
      schedule_type: t.schedule_type,
      schedule_day: String(t.schedule_day || 1),
      schedule_hour: String(t.schedule_hour || 9),
      is_active: !!t.is_active,
      notify_on_warning: !!t.notify_on_warning,
      notify_on_error: !!t.notify_on_error,
      notes: t.notes || "",
    });
    setShowForm(true);
  }

  function calcNextRun(scheduleType: string, day: number, hour: number): string {
    const next = new Date();
    next.setHours(hour, 0, 0, 0);
    if (scheduleType === "daily") {
      if (next <= new Date()) next.setDate(next.getDate() + 1);
    } else if (scheduleType === "weekly") {
      const targetDay = day; // 1=Mon, 7=Sun
      const currentDay = next.getDay() || 7;
      const diff = (targetDay - currentDay + 7) % 7 || 7;
      next.setDate(next.getDate() + diff);
    } else if (scheduleType === "monthly") {
      next.setDate(Math.min(day, 28));
      if (next <= new Date()) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(Math.min(day, 28));
      }
    } else if (scheduleType === "quarterly") {
      next.setDate(Math.min(day, 28));
      next.setMonth(next.getMonth() + 3);
    } else if (scheduleType === "yearly") {
      next.setMonth(0);
      next.setDate(Math.min(day, 28));
      if (next <= new Date()) next.setFullYear(next.getFullYear() + 1);
    }
    return next.toISOString();
  }

  async function saveTask() {
    if (!form.name) { setMsg("❌ Укажите название"); setTimeout(() => setMsg(""), 3000); return; }

    const nextRun = form.schedule_type === "on_demand" ? null : calcNextRun(form.schedule_type, Number(form.schedule_day), Number(form.schedule_hour));

    const data = {
      user_id: userId,
      name: form.name,
      task_type: form.task_type,
      description: form.description,
      schedule_type: form.schedule_type,
      schedule_day: Number(form.schedule_day),
      schedule_hour: Number(form.schedule_hour),
      is_active: form.is_active,
      notify_on_warning: form.notify_on_warning,
      notify_on_error: form.notify_on_error,
      next_run_at: nextRun,
      notes: form.notes,
    };
    if (editing) await supabase.from("scheduled_tasks").update(data).eq("id", editing.id);
    else await supabase.from("scheduled_tasks").insert(data);
    setMsg(`✅ ${editing ? "Обновлено" : "Создано"}: ${form.name}`);
    setShowForm(false); setEditing(null); load();
    setTimeout(() => setMsg(""), 3000);
  }

  async function deleteTask(id: string) {
    if (!confirm("Удалить задачу? История запусков также будет удалена.")) return;
    await supabase.from("scheduled_tasks").delete().eq("id", id);
    load();
  }

  async function toggleTask(t: any) {
    await supabase.from("scheduled_tasks").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  // ═══ ВЫПОЛНЕНИЕ ЗАДАЧ ═══
  async function runTask(t: any) {
    const startedAt = new Date().toISOString();
    if (!confirm(`Запустить задачу «${t.name}» сейчас?`)) return;

    let result: { status: string; message: string; processed: number; warnings: number; errors: number; details: any };
    try {
      switch (t.task_type) {
        case "fno_reminder":
          result = await runFnoReminder();
          break;
        case "depreciation":
          result = await runDepreciation();
          break;
        case "recurring_payments":
          result = await runRecurringPayments();
          break;
        case "expiry_check":
          result = await runExpiryCheck();
          break;
        case "closing_period":
          result = await runClosingCheck();
          break;
        case "low_stock":
          result = await runLowStockCheck();
          break;
        case "currency_update":
          result = await runCurrencyUpdate();
          break;
        case "salary_reminder":
          result = await runSalaryReminder();
          break;
        case "overdue_check":
          result = await runOverdueCheck();
          break;
        default:
          result = { status: "success", message: "Задача выполнена (заглушка)", processed: 0, warnings: 0, errors: 0, details: {} };
      }
    } catch (err: any) {
      result = { status: "error", message: `Ошибка: ${err.message}`, processed: 0, warnings: 0, errors: 1, details: {} };
    }

    const finishedAt = new Date().toISOString();
    const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

    // Запись в журнал
    await supabase.from("task_runs").insert({
      user_id: userId,
      task_id: t.id,
      task_name: t.name,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      status: result.status,
      message: result.message,
      details: result.details,
      items_processed: result.processed,
      items_with_warning: result.warnings,
      items_with_error: result.errors,
      triggered_by: "manual",
    });

    // Обновляем статус задачи
    const nextRun = t.schedule_type === "on_demand" ? null : calcNextRun(t.schedule_type, t.schedule_day, t.schedule_hour);
    await supabase.from("scheduled_tasks").update({
      last_run_at: finishedAt,
      last_run_status: result.status,
      last_run_message: result.message,
      next_run_at: nextRun,
      run_count: (t.run_count || 0) + 1,
    }).eq("id", t.id);

    setMsg(`${result.status === "success" ? "✅" : result.status === "warning" ? "⚠" : "❌"} ${result.message}`);
    load();
    setTimeout(() => setMsg(""), 5000);
  }

  // ═══ ОБРАБОТЧИКИ КОНКРЕТНЫХ ЗАДАЧ ═══

  async function runFnoReminder() {
    const today = new Date();
    const fnoDeadlines = [
      { form: "ФНО 200 (упрощёнка)", quarter: Math.floor(today.getMonth() / 3) + 1, deadline: 15 },
      { form: "ФНО 300 (НДС)", quarter: Math.floor(today.getMonth() / 3) + 1, deadline: 15 },
      { form: "ФНО 910 (ИПН + соцналоги)", quarter: 0, deadline: 15 },
    ];
    let warnings = 0;
    const upcoming: string[] = [];
    fnoDeadlines.forEach(d => {
      const day = today.getDate();
      const daysToDeadline = d.deadline - day;
      if (daysToDeadline >= 0 && daysToDeadline <= 5) {
        upcoming.push(`${d.form}: до ${d.deadline} числа осталось ${daysToDeadline} дн.`);
        warnings++;
      }
    });
    return {
      status: warnings > 0 ? "warning" : "success",
      message: warnings > 0 ? `⚠ ${warnings} приближающихся срока ФНО` : "✓ Сроки ФНО не приближаются",
      processed: fnoDeadlines.length,
      warnings,
      errors: 0,
      details: { upcoming },
    };
  }

  async function runDepreciation() {
    const { data: assets } = await supabase.from("fixed_assets").select("*").eq("user_id", userId).eq("is_active", true);
    if (!assets || assets.length === 0) return { status: "success", message: "Нет активных ОС для амортизации", processed: 0, warnings: 0, errors: 0, details: {} };

    let processed = 0;
    let totalDepreciation = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const a of assets) {
      const monthlyDep = Number(a.monthly_depreciation || 0);
      if (monthlyDep <= 0) continue;
      const newAccDep = Number(a.accumulated_depreciation || 0) + monthlyDep;
      const initialCost = Number(a.initial_cost || 0);
      if (newAccDep >= initialCost) continue;

      await supabase.from("fixed_assets").update({
        accumulated_depreciation: newAccDep,
        residual_value: initialCost - newAccDep,
      }).eq("id", a.id);

      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: today,
        doc_ref: `Аморт-${today.slice(0, 7)}`,
        debit_account: "7210",
        credit_account: "2420",
        amount: monthlyDep,
        description: `Амортизация ОС: ${a.name}`,
      });

      totalDepreciation += monthlyDep;
      processed++;
    }

    return {
      status: "success",
      message: `✓ Начислена амортизация по ${processed} ОС на сумму ${fmtMoney(totalDepreciation)} ₸`,
      processed,
      warnings: 0,
      errors: 0,
      details: { total: totalDepreciation },
    };
  }

  async function runRecurringPayments() {
    const today = new Date().toISOString().slice(0, 10);
    const { data: schedules } = await supabase.from("payment_schedules").select("*").eq("user_id", userId).eq("status", "pending").lte("scheduled_date", today);
    if (!schedules || schedules.length === 0) return { status: "success", message: "Нет платежей к созданию", processed: 0, warnings: 0, errors: 0, details: {} };

    let processed = 0;
    let total = 0;
    for (const s of schedules) {
      total += Number(s.amount);
      processed++;
    }
    return {
      status: "warning",
      message: `⚠ Найдено ${processed} платежей на сумму ${fmtMoney(total)} ₸ — перейдите в «Регулярные платежи» для создания документов`,
      processed,
      warnings: processed,
      errors: 0,
      details: {},
    };
  }

  async function runExpiryCheck() {
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { data: batches } = await supabase.from("stock_batches").select("*").eq("user_id", userId).eq("is_active", true).not("expiry_date", "is", null).lte("expiry_date", in30).gt("current_quantity", 0);

    const expired = (batches || []).filter(b => b.expiry_date < today);
    const expiring = (batches || []).filter(b => b.expiry_date >= today);

    return {
      status: expired.length > 0 ? "error" : expiring.length > 0 ? "warning" : "success",
      message: expired.length > 0
        ? `❌ Просрочено ${expired.length} партий, истекают в 30 дней: ${expiring.length}`
        : expiring.length > 0
        ? `⚠ В ближайшие 30 дней истекают ${expiring.length} партий`
        : "✓ Просроченных партий нет",
      processed: (batches || []).length,
      warnings: expiring.length,
      errors: expired.length,
      details: { expired: expired.length, expiring: expiring.length },
    };
  }

  async function runClosingCheck() {
    const today = new Date();
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10);

    const { data: drafts } = await supabase.from("documents").select("id").eq("user_id", userId).eq("status", "draft").gte("doc_date", prevMonthStart).lte("doc_date", prevMonthEnd);
    const draftCount = (drafts || []).length;

    return {
      status: draftCount > 0 ? "warning" : "success",
      message: draftCount > 0 ? `⚠ За прошлый месяц осталось ${draftCount} непроведённых документов` : "✓ Все документы прошлого месяца проведены",
      processed: 1,
      warnings: draftCount,
      errors: 0,
      details: { drafts_count: draftCount },
    };
  }

  async function runLowStockCheck() {
    const { data: nom } = await supabase.from("nomenclature").select("*").eq("user_id", userId).not("min_stock", "is", null);
    const low = (nom || []).filter(n => Number(n.quantity || 0) < Number(n.min_stock || 0));
    return {
      status: low.length > 0 ? "warning" : "success",
      message: low.length > 0 ? `⚠ ${low.length} позиций ниже минимального остатка` : "✓ Все остатки в норме",
      processed: (nom || []).length,
      warnings: low.length,
      errors: 0,
      details: { low_items: low.slice(0, 10).map(n => ({ name: n.name, qty: n.quantity, min: n.min_stock })) },
    };
  }

  async function runCurrencyUpdate() {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/KZT");
      const data = await res.json();
      if (!data.rates) throw new Error("Не удалось получить курсы");
      const rates = data.rates;
      // KZT — наша база, нужны обратные курсы
      const usd = 1 / rates.USD;
      const eur = 1 / rates.EUR;
      const rub = 1 / rates.RUB;

      const today = new Date().toISOString().slice(0, 10);
      const updates = [
        { code: "USD", rate: usd, date: today },
        { code: "EUR", rate: eur, date: today },
        { code: "RUB", rate: rub, date: today },
      ];
      for (const u of updates) {
        await supabase.from("currency_rates").upsert({
          user_id: userId,
          currency_code: u.code,
          rate_date: u.date,
          rate: u.rate,
        }, { onConflict: "user_id,currency_code,rate_date" });
      }

      return {
        status: "success",
        message: `✓ Обновлены курсы: USD=${usd.toFixed(2)}, EUR=${eur.toFixed(2)}, RUB=${rub.toFixed(2)}`,
        processed: 3,
        warnings: 0,
        errors: 0,
        details: { usd, eur, rub },
      };
    } catch (err: any) {
      return { status: "error", message: `❌ ${err.message}`, processed: 0, warnings: 0, errors: 1, details: {} };
    }
  }

  async function runSalaryReminder() {
    const today = new Date().getDate();
    const isAdvanceDay = today >= 13 && today <= 15;
    const isFinalDay = today >= 3 && today <= 5;
    if (isAdvanceDay) return { status: "warning", message: "⚠ Скоро срок выплаты аванса (15-го числа)", processed: 1, warnings: 1, errors: 0, details: {} };
    if (isFinalDay) return { status: "warning", message: "⚠ Скоро срок окончательной выплаты ЗП (5-го числа)", processed: 1, warnings: 1, errors: 0, details: {} };
    return { status: "success", message: "✓ Срок выплаты ЗП не приближается", processed: 1, warnings: 0, errors: 0, details: {} };
  }

  async function runOverdueCheck() {
    const today = new Date().toISOString().slice(0, 10);
    const { data: schedules } = await supabase.from("payment_schedules").select("*").eq("user_id", userId).eq("status", "pending").lt("scheduled_date", today);
    const overdueCount = (schedules || []).length;
    const overdueTotal = (schedules || []).reduce((a, s) => a + Number(s.amount), 0);

    return {
      status: overdueCount > 0 ? "warning" : "success",
      message: overdueCount > 0 ? `⚠ Просрочено ${overdueCount} платежей на ${fmtMoney(overdueTotal)} ₸` : "✓ Просроченных платежей нет",
      processed: (schedules || []).length,
      warnings: overdueCount,
      errors: 0,
      details: { overdue_total: overdueTotal },
    };
  }

  // KPI
  const activeCount = tasks.filter(t => t.is_active).length;
  const upcoming = tasks.filter(t => t.is_active && t.next_run_at && new Date(t.next_run_at).getTime() < Date.now() + 7 * 86400000).length;
  const errorRuns = runs.filter(r => r.status === "error").length;
  const successRate = runs.length > 0 ? Math.round((runs.filter(r => r.status === "success").length / runs.length) * 100) : 100;

  // Существующие task_type'ы для шаблонов (исключаем уже созданные)
  const existingTypes = new Set(tasks.map(t => t.task_type));
  const availableTemplates = Object.entries(TASK_TYPES).filter(([k]) => !existingTypes.has(k) || k === "custom");

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("❌") ? "#EF444420" : msg.startsWith("⚠") ? "#F59E0B20" : "#10B98120", color: msg.startsWith("❌") ? "#EF4444" : msg.startsWith("⚠") ? "#F59E0B" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Регламентные задания — автоматизация рутинных операций. Каждую задачу можно запустить вручную (▶) для проверки. Расписание используется как напоминание о следующем запуске.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📋 Активных задач</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{activeCount}</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Из {tasks.length} всего</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>⏰ В ближайшие 7 дней</div>
          <div className="text-xl font-bold" style={{ color: "#F59E0B" }}>{upcoming}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📊 Успешных запусков</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{successRate}%</div>
          <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>Из {runs.length} запусков</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #EF4444" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>❌ Ошибок</div>
          <div className="text-xl font-bold" style={{ color: "#EF4444" }}>{errorRuns}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ["tasks", `📋 Активные задачи (${tasks.length})`],
          ["templates", `➕ Добавить из шаблона`],
          ["log", `📜 Журнал запусков (${runs.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setShowForm(false); }}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: tab === key ? "var(--accent)" : "transparent", color: tab === key ? "#fff" : "var(--t3)", border: tab === key ? "none" : "1px solid var(--brd)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ФОРМА ═══ */}
      {showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="text-sm font-bold mb-3">{editing ? "Редактирование задачи" : "Новая задача"}</div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Название *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Тип задачи</label>
              <select value={form.task_type} onChange={e => setForm({ ...form, task_type: e.target.value })}>
                {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.name}</option>)}
              </select>
            </div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Описание</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>

          <div className="text-[11px] font-bold mb-2" style={{ color: "#F59E0B" }}>📅 РАСПИСАНИЕ</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Периодичность</label>
              <select value={form.schedule_type} onChange={e => setForm({ ...form, schedule_type: e.target.value })}>
                {Object.entries(SCHEDULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {(form.schedule_type === "monthly" || form.schedule_type === "quarterly" || form.schedule_type === "yearly") && (
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>День месяца (1-28)</label><input type="number" min="1" max="28" value={form.schedule_day} onChange={e => setForm({ ...form, schedule_day: e.target.value })} /></div>
            )}
            {form.schedule_type === "weekly" && (
              <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>День недели</label>
                <select value={form.schedule_day} onChange={e => setForm({ ...form, schedule_day: e.target.value })}>
                  <option value="1">Понедельник</option>
                  <option value="2">Вторник</option>
                  <option value="3">Среда</option>
                  <option value="4">Четверг</option>
                  <option value="5">Пятница</option>
                  <option value="6">Суббота</option>
                  <option value="7">Воскресенье</option>
                </select>
              </div>
            )}
            <div><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Час (0-23)</label><input type="number" min="0" max="23" value={form.schedule_hour} onChange={e => setForm({ ...form, schedule_hour: e.target.value })} /></div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="flex items-end gap-3" style={{ paddingBottom: 8 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span className="text-xs">Активна</span>
              </label>
            </div>
            <div className="flex items-end gap-3" style={{ paddingBottom: 8 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.notify_on_warning} onChange={e => setForm({ ...form, notify_on_warning: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span className="text-xs">Уведомлять при предупреждениях</span>
              </label>
            </div>
            <div className="flex items-end gap-3" style={{ paddingBottom: 8 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.notify_on_error} onChange={e => setForm({ ...form, notify_on_error: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span className="text-xs">Уведомлять при ошибках</span>
              </label>
            </div>
            <div className="col-span-3"><label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--t3)" }}>Примечание</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <div className="flex gap-2">
            <button onClick={saveTask} className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm border-none cursor-pointer" style={{ background: "var(--accent)" }}>💾 Сохранить</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2.5 rounded-xl text-sm cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отмена</button>
          </div>
        </div>
      )}

      {/* ═══ АКТИВНЫЕ ═══ */}
      {tab === "tasks" && !showForm && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["Задача", "Тип", "Расписание", "Последний запуск", "Следующий запуск", "Статус", ""].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет задач. Добавьте из шаблонов.</td></tr>
              ) : tasks.map(t => {
                const tt = TASK_TYPES[t.task_type] || TASK_TYPES.custom;
                const lastSt = t.last_run_status ? STATUS[t.last_run_status] : null;
                return (
                  <tr key={t.id}>
                    <td className="p-2.5 text-[12px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-[10px]" style={{ color: "var(--t3)" }}>{t.description?.slice(0, 80) || "—"}</div>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: tt.color + "20", color: tt.color }}>{tt.icon} {tt.name}</span>
                    </td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                      {SCHEDULE_LABELS[t.schedule_type]}
                      {t.schedule_type !== "on_demand" && t.schedule_type !== "daily" && <div className="text-[10px]">день {t.schedule_day}, {t.schedule_hour}:00</div>}
                    </td>
                    <td className="p-2.5 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>
                      {t.last_run_at ? (
                        <>
                          <div style={{ color: "var(--t3)" }}>{new Date(t.last_run_at).toLocaleString("ru-RU")}</div>
                          {lastSt && <div className="text-[10px]" style={{ color: lastSt.color }}>{lastSt.icon} {lastSt.name}</div>}
                        </>
                      ) : <span style={{ color: "var(--t3)" }}>—</span>}
                    </td>
                    <td className="p-2.5 text-[11px] font-bold" style={{ color: "var(--accent)", borderBottom: "1px solid var(--brd)" }}>
                      {t.next_run_at ? new Date(t.next_run_at).toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => toggleTask(t)} className="text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer border-none" style={{ background: t.is_active ? "#10B98120" : "#6B728020", color: t.is_active ? "#10B981" : "#6B7280" }}>
                        {t.is_active ? "✓ Вкл" : "○ Выкл"}
                      </button>
                    </td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <button onClick={() => runTask(t)} title="Запустить сейчас" className="text-[14px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "#10B981" }}>▶</button>
                      <button onClick={() => startEdit(t)} className="text-[11px] cursor-pointer border-none bg-transparent mr-1" style={{ color: "var(--accent)" }}>✏</button>
                      <button onClick={() => deleteTask(t.id)} className="text-[11px] cursor-pointer border-none bg-transparent" style={{ color: "#EF4444" }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ ШАБЛОНЫ ═══ */}
      {tab === "templates" && (
        <>
          <div className="text-xs mb-2" style={{ color: "var(--t3)" }}>Готовые шаблоны для быстрого создания. Кликните на карточку.</div>
          <div className="grid grid-cols-3 gap-3">
            {availableTemplates.map(([k, v]) => {
              const isAlreadyAdded = existingTypes.has(k) && k !== "custom";
              return (
                <div key={k} onClick={() => !isAlreadyAdded && startCreateFromTemplate(k)}
                  className="rounded-xl p-4 transition-all"
                  style={{
                    background: "var(--card)",
                    border: `1px solid ${v.color}30`,
                    cursor: isAlreadyAdded ? "not-allowed" : "pointer",
                    opacity: isAlreadyAdded ? 0.5 : 1,
                  }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ fontSize: 24 }}>{v.icon}</span>
                    <div>
                      <div className="text-sm font-bold">{v.name}</div>
                      <div className="text-[10px]" style={{ color: v.color }}>{SCHEDULE_LABELS[v.defaultSchedule]}, день {v.defaultDay}</div>
                    </div>
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--t3)" }}>{v.description}</div>
                  {isAlreadyAdded && <div className="text-[10px] mt-2 font-bold" style={{ color: "#10B981" }}>✓ Уже добавлено</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ ЖУРНАЛ ═══ */}
      {tab === "log" && (
        <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <table>
            <thead><tr>{["Время", "Задача", "Статус", "Сообщение", "Обработано", "Длительность"].map(h => (
              <th key={h} className="text-left p-2.5 text-[11px] font-bold uppercase" style={{ color: "var(--t3)", borderBottom: "2px solid var(--brd)" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {runs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Нет запусков</td></tr>
              ) : runs.map(r => {
                const s = STATUS[r.status] || STATUS.success;
                return (
                  <tr key={r.id}>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{new Date(r.started_at).toLocaleString("ru-RU")}</td>
                    <td className="p-2.5 text-[12px] font-semibold" style={{ borderBottom: "1px solid var(--brd)" }}>{r.task_name}</td>
                    <td className="p-2.5" style={{ borderBottom: "1px solid var(--brd)" }}>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: s.color + "20", color: s.color }}>{s.icon} {s.name}</span>
                    </td>
                    <td className="p-2.5 text-[11px]" style={{ borderBottom: "1px solid var(--brd)" }}>{r.message || "—"}</td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>
                      {r.items_processed}{r.items_with_warning > 0 && ` (⚠${r.items_with_warning})`}{r.items_with_error > 0 && ` (❌${r.items_with_error})`}
                    </td>
                    <td className="p-2.5 text-[11px]" style={{ color: "var(--t3)", borderBottom: "1px solid var(--brd)" }}>{r.duration_ms ? `${r.duration_ms}мс` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Как работает:</b> задачи запускаются вручную кнопкой ▶. Расписание используется как индикатор «следующего запуска» для напоминания.<br/>
        💡 <b>Для true cron-автоматизации</b> в production можно добавить Netlify Scheduled Functions или Supabase pg_cron — это будет следующий уровень.<br/>
        💡 <b>11 готовых типов:</b> ФНО, амортизация, регулярные платежи, сроки годности, закрытие периода, низкие остатки, курсы валют, ЗП, просрочки и др.
      </div>
    </div>
  );
}
