"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { fmtMoney } from "@/lib/tax2026";
import { exportToExcel, exportToPDF, colText, colMoney, colDate, colNumber, type ExportOptions } from "@/lib/export-utils";

const ACCOUNTS_2026: Record<string, string> = {
  "1010": "Касса", "1030": "Расчётный счёт", "1040": "Валютный счёт",
  "1210": "Дебиторская задолженность", "1280": "Прочая дебиторка",
  "1310": "Сырьё и материалы", "1320": "Готовая продукция", "1330": "Товары",
  "2410": "Основные средства", "2420": "Амортизация ОС",
  "3110": "КПН", "3120": "ИПН", "3130": "НДС",
  "3150": "Социальный налог", "3210": "ОПВ", "3220": "ОПВР", "3230": "СО",
  "3310": "Краткосрочная кредиторка", "3350": "ЗП к выплате", "3380": "Прочая кредиторка",
  "5010": "Уставный капитал", "5510": "Нераспределённая прибыль",
  "6010": "Доход от реализации",
  "7010": "Себестоимость", "7110": "Расходы по реализации",
  "7210": "Адм. расходы", "7310": "Финансовые расходы", "7990": "Прочие расходы",
};

interface ReportInfo {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

const REPORTS: ReportInfo[] = [
  { key: "turnover", name: "ОСВ — Оборотно-сальдовая ведомость", description: "Сальдо и обороты по всем счетам", icon: "📒", color: "#6366F1" },
  { key: "journal", name: "Журнал проводок", description: "Все хозяйственные операции", icon: "📋", color: "#3B82F6" },
  { key: "counterparties", name: "Реестр контрагентов", description: "Полный список клиентов и поставщиков", icon: "👥", color: "#10B981" },
  { key: "nomenclature", name: "Номенклатура с остатками", description: "Все товары с ценами и остатками", icon: "📦", color: "#F59E0B" },
  { key: "employees", name: "Список сотрудников", description: "Сотрудники с окладами и ИИН", icon: "👨‍💼", color: "#A855F7" },
  { key: "orders", name: "Реестр заказов", description: "Все заказы за период", icon: "📋", color: "#EC4899" },
  { key: "schedules", name: "График платежей", description: "Запланированные и выполненные платежи", icon: "📅", color: "#14B8A6" },
];

export default function ExportsCentralPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [companyName, setCompanyName] = useState("");
  const [bin, setBin] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: profile } = await supabase.from("profiles").select("company_name, bin").eq("id", user.id).single();
    if (profile) {
      setCompanyName(profile.company_name || "");
      setBin(profile.bin || "");
    }
  }

  function commonMeta(): Record<string, string> {
    return {
      "Организация": companyName || "—",
      "БИН": bin || "—",
      "Период": `${year} год`,
    };
  }

  // ═══ ОСВ ═══
  async function exportTurnover(format: "excel" | "pdf") {
    setExporting("turnover-" + format);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const { data: entries } = await supabase.from("journal_entries")
      .select("*").eq("user_id", userId).gte("entry_date", yearStart).lte("entry_date", yearEnd);

    // Считаем сальдо и обороты по счетам
    const accountsMap: Record<string, { debit_turnover: number; credit_turnover: number; balance: number }> = {};
    (entries || []).forEach(e => {
      const dr = String(e.debit_account || "");
      const cr = String(e.credit_account || "");
      const amt = Number(e.amount || 0);
      if (dr) {
        if (!accountsMap[dr]) accountsMap[dr] = { debit_turnover: 0, credit_turnover: 0, balance: 0 };
        accountsMap[dr].debit_turnover += amt;
        accountsMap[dr].balance += amt;
      }
      if (cr) {
        if (!accountsMap[cr]) accountsMap[cr] = { debit_turnover: 0, credit_turnover: 0, balance: 0 };
        accountsMap[cr].credit_turnover += amt;
        accountsMap[cr].balance -= amt;
      }
    });

    const rows = Object.entries(accountsMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([account, vals]) => ({
        account,
        name: ACCOUNTS_2026[account] || "—",
        debit_turnover: vals.debit_turnover,
        credit_turnover: vals.credit_turnover,
        balance_debit: vals.balance > 0 ? vals.balance : 0,
        balance_credit: vals.balance < 0 ? -vals.balance : 0,
      }));

    const totalDebitTurn = rows.reduce((a, r) => a + r.debit_turnover, 0);
    const totalCreditTurn = rows.reduce((a, r) => a + r.credit_turnover, 0);
    const totalDebitBal = rows.reduce((a, r) => a + r.balance_debit, 0);
    const totalCreditBal = rows.reduce((a, r) => a + r.balance_credit, 0);

    const opts: ExportOptions = {
      fileName: `OSV-${year}`,
      title: "Оборотно-сальдовая ведомость",
      subtitle: `За ${year} год`,
      meta: commonMeta(),
      columns: [
        colText("account", "Счёт", "left"),
        colText("name", "Наименование"),
        colMoney("debit_turnover", "Оборот Дт"),
        colMoney("credit_turnover", "Оборот Кт"),
        colMoney("balance_debit", "Сальдо Дт"),
        colMoney("balance_credit", "Сальдо Кт"),
      ],
      rows,
      totals: {
        name: "ИТОГО",
        debit_turnover: fmtMoney(totalDebitTurn),
        credit_turnover: fmtMoney(totalCreditTurn),
        balance_debit: fmtMoney(totalDebitBal),
        balance_credit: fmtMoney(totalCreditBal),
      },
    };

    if (format === "excel") exportToExcel(opts);
    else exportToPDF(opts);
    setExporting(null);
  }

  // ═══ ЖУРНАЛ ПРОВОДОК ═══
  async function exportJournal(format: "excel" | "pdf") {
    setExporting("journal-" + format);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const { data: entries } = await supabase.from("journal_entries")
      .select("*").eq("user_id", userId)
      .gte("entry_date", yearStart).lte("entry_date", yearEnd)
      .order("entry_date", { ascending: false }).limit(2000);

    const total = (entries || []).reduce((a, e) => a + Number(e.amount), 0);

    const opts: ExportOptions = {
      fileName: `Journal-${year}`,
      title: "Журнал проводок",
      subtitle: `За ${year} год · ${entries?.length || 0} записей`,
      meta: commonMeta(),
      columns: [
        colDate("entry_date", "Дата"),
        colText("doc_ref", "Документ"),
        colText("debit_account", "Дт", "center"),
        colText("credit_account", "Кт", "center"),
        colMoney("amount", "Сумма"),
        colText("description", "Описание"),
      ],
      rows: entries || [],
      totals: {
        description: "ИТОГО",
        amount: fmtMoney(total),
      },
    };

    if (format === "excel") exportToExcel(opts);
    else exportToPDF(opts);
    setExporting(null);
  }

  // ═══ КОНТРАГЕНТЫ ═══
  async function exportCounterparties(format: "excel" | "pdf") {
    setExporting("counterparties-" + format);
    const { data } = await supabase.from("counterparties")
      .select("*").eq("user_id", userId).order("name");

    const opts: ExportOptions = {
      fileName: "Counterparties",
      title: "Реестр контрагентов",
      subtitle: `Всего: ${data?.length || 0}`,
      meta: commonMeta(),
      columns: [
        colText("name", "Наименование"),
        colText("bin", "БИН/ИИН", "center"),
        colText("counterparty_type", "Тип"),
        colText("phone", "Телефон"),
        colText("email", "Email"),
        colText("address", "Адрес"),
      ],
      rows: data || [],
    };

    if (format === "excel") exportToExcel(opts);
    else exportToPDF(opts);
    setExporting(null);
  }

  // ═══ НОМЕНКЛАТУРА ═══
  async function exportNomenclature(format: "excel" | "pdf") {
    setExporting("nomenclature-" + format);
    const { data } = await supabase.from("nomenclature")
      .select("*").eq("user_id", userId).order("name");

    const totalQty = (data || []).reduce((a, n) => a + Number(n.quantity || 0), 0);
    const totalValue = (data || []).reduce((a, n) => a + Number(n.quantity || 0) * Number(n.purchase_price || 0), 0);

    const rows = (data || []).map(n => ({
      ...n,
      total_value: Number(n.quantity || 0) * Number(n.purchase_price || 0),
    }));

    const opts: ExportOptions = {
      fileName: "Nomenclature",
      title: "Номенклатура с остатками",
      subtitle: `Всего позиций: ${data?.length || 0}`,
      meta: commonMeta(),
      columns: [
        colText("code", "Код", "center"),
        colText("name", "Наименование"),
        colText("unit", "Ед."),
        colNumber("quantity", "Остаток"),
        colMoney("purchase_price", "Закуп. цена"),
        colMoney("sale_price", "Цена продажи"),
        colMoney("total_value", "Стоимость"),
      ],
      rows,
      totals: {
        name: "ИТОГО",
        quantity: totalQty.toLocaleString("ru-RU"),
        total_value: fmtMoney(totalValue),
      },
    };

    if (format === "excel") exportToExcel(opts);
    else exportToPDF(opts);
    setExporting(null);
  }

  // ═══ СОТРУДНИКИ ═══
  async function exportEmployees(format: "excel" | "pdf") {
    setExporting("employees-" + format);
    const { data } = await supabase.from("employees")
      .select("*").eq("user_id", userId).order("full_name");

    const totalSalary = (data || []).filter(e => e.is_active !== false).reduce((a, e) => a + Number(e.salary || 0), 0);

    const rows = (data || []).map(e => ({
      ...e,
      status: e.is_active === false ? "Уволен" : "Активен",
    }));

    const opts: ExportOptions = {
      fileName: "Employees",
      title: "Список сотрудников",
      subtitle: `Активных: ${(data || []).filter(e => e.is_active !== false).length} из ${data?.length || 0}`,
      meta: commonMeta(),
      columns: [
        colText("full_name", "ФИО"),
        colText("iin", "ИИН", "center"),
        colText("position", "Должность"),
        colText("department", "Подразделение"),
        colDate("hire_date", "Дата приёма"),
        colMoney("salary", "Оклад"),
        colText("status", "Статус", "center"),
      ],
      rows,
      totals: {
        position: "ИТОГО ФОТ:",
        salary: fmtMoney(totalSalary),
      },
    };

    if (format === "excel") exportToExcel(opts);
    else exportToPDF(opts);
    setExporting(null);
  }

  // ═══ ЗАКАЗЫ ═══
  async function exportOrders(format: "excel" | "pdf") {
    setExporting("orders-" + format);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const { data } = await supabase.from("orders")
      .select("*").eq("user_id", userId)
      .gte("order_date", yearStart).lte("order_date", yearEnd)
      .order("order_date", { ascending: false });

    const total = (data || []).reduce((a, o) => a + Number(o.total_amount || 0), 0);

    const opts: ExportOptions = {
      fileName: `Orders-${year}`,
      title: "Реестр заказов",
      subtitle: `За ${year} год · ${data?.length || 0} заказов`,
      meta: commonMeta(),
      columns: [
        colText("order_number", "№"),
        colDate("order_date", "Дата"),
        colText("client_name", "Клиент"),
        colText("status", "Статус", "center"),
        colMoney("total_amount", "Сумма"),
        colText("payment_status", "Оплата", "center"),
      ],
      rows: data || [],
      totals: {
        client_name: "ИТОГО:",
        total_amount: fmtMoney(total),
      },
    };

    if (format === "excel") exportToExcel(opts);
    else exportToPDF(opts);
    setExporting(null);
  }

  // ═══ ГРАФИК ПЛАТЕЖЕЙ ═══
  async function exportSchedules(format: "excel" | "pdf") {
    setExporting("schedules-" + format);
    const { data } = await supabase.from("payment_schedules")
      .select("*").eq("user_id", userId).order("scheduled_date");

    const total = (data || []).reduce((a, s) => a + Number(s.amount || 0), 0);

    const rows = (data || []).map(s => ({
      ...s,
      direction: s.payment_type === "incoming" ? "Поступление" : "Выплата",
    }));

    const opts: ExportOptions = {
      fileName: "PaymentSchedule",
      title: "График платежей",
      subtitle: `Всего: ${data?.length || 0}`,
      meta: commonMeta(),
      columns: [
        colDate("scheduled_date", "Дата"),
        colText("description", "Описание"),
        colText("counterparty_name", "Контрагент"),
        colText("direction", "Направление", "center"),
        colMoney("amount", "Сумма"),
        colText("status", "Статус", "center"),
      ],
      rows,
      totals: {
        counterparty_name: "ИТОГО:",
        amount: fmtMoney(total),
      },
    };

    if (format === "excel") exportToExcel(opts);
    else exportToPDF(opts);
    setExporting(null);
  }

  const exporters: Record<string, (f: "excel" | "pdf") => Promise<void>> = {
    turnover: exportTurnover,
    journal: exportJournal,
    counterparties: exportCounterparties,
    nomenclature: exportNomenclature,
    employees: exportEmployees,
    orders: exportOrders,
    schedules: exportSchedules,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Центральная страница экспорта. Выберите отчёт и формат — получите файл с шапкой компании, итогами и красивым форматированием.
      </div>

      {/* Параметры */}
      <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div>
          <div className="text-[10px] mb-1" style={{ color: "var(--t3)" }}>Период</div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 130 }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y} год</option>)}
          </select>
        </div>
        <div className="flex-1">
          <div className="text-[10px] mb-0.5" style={{ color: "var(--t3)" }}>Будет в шапке отчёта:</div>
          <div className="text-[12px] font-semibold">{companyName || "—"}</div>
          <div className="text-[10px]" style={{ color: "var(--t3)" }}>БИН: {bin || "—"}</div>
        </div>
      </div>

      {/* Список отчётов */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {REPORTS.map(report => {
          const isExporting = exporting?.startsWith(report.key);
          return (
            <div key={report.key} className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${report.color}` }}>
              <div className="flex items-start gap-3 mb-3">
                <span style={{ fontSize: 24 }}>{report.icon}</span>
                <div className="flex-1">
                  <div className="text-[13px] font-bold">{report.name}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>{report.description}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => exporters[report.key]?.("excel")}
                  disabled={isExporting}
                  className="flex-1 cursor-pointer rounded-lg flex items-center justify-center gap-1.5 transition-all border-none font-semibold"
                  style={{
                    padding: "8px 12px",
                    fontSize: 11,
                    background: "#10B98120",
                    color: "#10B981",
                    opacity: isExporting ? 0.5 : 1,
                  }}>
                  <span>📊</span>
                  <span>{exporting === `${report.key}-excel` ? "Скачиваю..." : "Excel"}</span>
                </button>
                <button
                  onClick={() => exporters[report.key]?.("pdf")}
                  disabled={isExporting}
                  className="flex-1 cursor-pointer rounded-lg flex items-center justify-center gap-1.5 transition-all border-none font-semibold"
                  style={{
                    padding: "8px 12px",
                    fontSize: 11,
                    background: "#EF444420",
                    color: "#EF4444",
                    opacity: isExporting ? 0.5 : 1,
                  }}>
                  <span>📄</span>
                  <span>{exporting === `${report.key}-pdf` ? "Печатаю..." : "PDF"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Excel</b> — скачается CSV-файл с UTF-8 BOM. Открывается в Excel, LibreOffice, Google Sheets — кириллица не поплывёт.<br/>
        💡 <b>PDF</b> — откроется новое окно с готовой страницей. Нажмите «Сохранить как PDF» в диалоге печати браузера.<br/>
        💡 <b>Все отчёты</b> содержат шапку с названием компании, БИН, периодом и итогами.<br/>
        💡 Если PDF не открывается — разрешите всплывающие окна для finstat.kz в настройках браузера.
      </div>
    </div>
  );
}
