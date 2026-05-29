"use client";

import { exportToExcel, exportToPDF, type ExportOptions } from "@/lib/export-utils";

interface Props<T = any> {
  options: ExportOptions<T>;
  showExcel?: boolean;
  showPDF?: boolean;
  size?: "sm" | "md";
  align?: "left" | "right";
}

/**
 * Готовый компонент с кнопками экспорта.
 * Использование:
 *
 * <ExportButtons options={{
 *   fileName: "turnover-2026",
 *   title: "Оборотно-сальдовая ведомость",
 *   subtitle: "За период 01.01.2026 - 31.12.2026",
 *   columns: [
 *     colText("account", "Счёт"),
 *     colText("name", "Наименование"),
 *     colMoney("debit", "Дебет"),
 *     colMoney("credit", "Кредит"),
 *   ],
 *   rows: data,
 *   totals: { name: "ИТОГО", debit: total, credit: total },
 * }} />
 */
export default function ExportButtons<T = any>({
  options,
  showExcel = true,
  showPDF = true,
  size = "sm",
  align = "right",
}: Props<T>) {
  const padding = size === "sm" ? "5px 10px" : "8px 14px";
  const fontSize = size === "sm" ? 11 : 12;

  return (
    <div className="flex gap-2" style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
      {showExcel && (
        <button
          onClick={() => exportToExcel(options)}
          title="Скачать как CSV/Excel"
          className="cursor-pointer rounded-lg flex items-center gap-1.5 transition-all border-none"
          style={{
            padding,
            fontSize,
            fontWeight: 600,
            background: "#10B98120",
            color: "#10B981",
          }}>
          <span>📊</span>
          <span>Excel</span>
        </button>
      )}
      {showPDF && (
        <button
          onClick={() => exportToPDF(options)}
          title="Скачать как PDF / Печать"
          className="cursor-pointer rounded-lg flex items-center gap-1.5 transition-all border-none"
          style={{
            padding,
            fontSize,
            fontWeight: 600,
            background: "#EF444420",
            color: "#EF4444",
          }}>
          <span>📄</span>
          <span>PDF</span>
        </button>
      )}
    </div>
  );
}
