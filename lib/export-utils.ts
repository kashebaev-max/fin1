// Универсальные утилиты экспорта в Excel (через CSV+BOM) и PDF (через print).
// Работают полностью на клиенте, без серверных функций.

// ═══ ТИПЫ ═══

export interface ExportColumn<T = any> {
  key: keyof T | string;
  label: string;
  align?: "left" | "right" | "center";
  format?: (value: any, row: T) => string; // кастомное форматирование
  width?: number; // для PDF — ширина колонки в %
}

export interface ExportOptions<T = any> {
  fileName: string; // без расширения
  title: string; // заголовок отчёта (для PDF и в shapeкe Excel)
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  totals?: Record<string, number | string>; // итоговая строка
  meta?: Record<string, string>; // дополнительные пары "ключ-значение" в шапке
  groupBy?: keyof T | string; // группировка по полю
}

// ═══ УТИЛИТЫ ═══

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Если содержит кавычки, точки с запятой, запятые, переводы строк — оборачиваем
  if (/[",;\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(d: Date = new Date()): string {
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

// ═══ ЭКСПОРТ В EXCEL (через CSV с UTF-8 BOM) ═══
// Excel правильно читает CSV если в начале UTF-8 BOM (\ufeff) и разделитель — точка с запятой

export function exportToExcel<T = any>(opts: ExportOptions<T>): void {
  const { fileName, title, subtitle, columns, rows, totals, meta } = opts;

  const lines: string[] = [];

  // Шапка
  lines.push(escapeCsvCell(title));
  if (subtitle) lines.push(escapeCsvCell(subtitle));
  lines.push(escapeCsvCell(`Сформировано: ${formatDate()}`));
  if (meta) {
    Object.entries(meta).forEach(([k, v]) => {
      lines.push(`${escapeCsvCell(k)};${escapeCsvCell(v)}`);
    });
  }
  lines.push(""); // пустая строка

  // Заголовки
  lines.push(columns.map(c => escapeCsvCell(c.label)).join(";"));

  // Данные
  rows.forEach(row => {
    const cells = columns.map(c => {
      const val = (row as any)[c.key];
      const formatted = c.format ? c.format(val, row) : val;
      return escapeCsvCell(formatted);
    });
    lines.push(cells.join(";"));
  });

  // Итоги
  if (totals && Object.keys(totals).length > 0) {
    lines.push(""); // пустая строка
    const totalCells = columns.map(c => {
      if (totals[c.key as string] !== undefined) {
        return escapeCsvCell(totals[c.key as string]);
      }
      return "";
    });
    lines.push(totalCells.join(";"));
  }

  const csvContent = "\ufeff" + lines.join("\r\n"); // BOM для UTF-8
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ═══ ЭКСПОРТ В PDF (через печать стилизованной страницы) ═══

export function exportToPDF<T = any>(opts: ExportOptions<T>): void {
  const { title, subtitle, columns, rows, totals, meta, groupBy } = opts;

  // Группируем строки если задано groupBy
  let groupedRows: { groupName: string; rows: T[] }[] = [];
  if (groupBy) {
    const groups: Record<string, T[]> = {};
    rows.forEach(row => {
      const key = String((row as any)[groupBy] || "Без группы");
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    groupedRows = Object.entries(groups).map(([groupName, rows]) => ({ groupName, rows }));
  }

  // Считаем оптимальные ширины колонок
  const totalSpecifiedWidth = columns.reduce((a, c) => a + (c.width || 0), 0);
  const remainingCols = columns.filter(c => !c.width).length;
  const remainingWidth = Math.max(0, 100 - totalSpecifiedWidth);
  const defaultWidth = remainingCols > 0 ? remainingWidth / remainingCols : 0;

  function buildTableRows(items: T[]): string {
    return items.map((row, i) => {
      const cells = columns.map(c => {
        const val = (row as any)[c.key];
        const formatted = c.format ? c.format(val, row) : (val ?? "");
        const align = c.align || "left";
        return `<td style="text-align:${align};padding:4px 6px;border-bottom:1px solid #E5E7EB;">${escapeHtml(String(formatted))}</td>`;
      }).join("");
      return `<tr style="background:${i % 2 === 0 ? '#FFF' : '#F9FAFB'};">${cells}</tr>`;
    }).join("");
  }

  const headerRow = `<tr>${columns.map(c => {
    const w = c.width || defaultWidth;
    return `<th style="text-align:${c.align || 'left'};padding:6px;background:#1F2937;color:#FFF;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;${w ? `width:${w}%;` : ''}">${escapeHtml(c.label)}</th>`;
  }).join("")}</tr>`;

  // Тело таблицы — с группировкой или без
  let bodyRows = "";
  if (groupedRows.length > 0) {
    bodyRows = groupedRows.map(g => {
      return `<tr><td colspan="${columns.length}" style="background:#E0E7FF;color:#3730A3;padding:6px 8px;font-weight:700;font-size:11px;">${escapeHtml(g.groupName)} (${g.rows.length})</td></tr>${buildTableRows(g.rows)}`;
    }).join("");
  } else {
    bodyRows = buildTableRows(rows);
  }

  const totalsRow = totals && Object.keys(totals).length > 0
    ? `<tr style="background:#F3F4F6;border-top:2px solid #1F2937;">${columns.map(c => {
        const v = totals[c.key as string];
        return `<td style="padding:8px 6px;font-weight:700;font-size:11px;text-align:${c.align || 'left'};">${v !== undefined ? escapeHtml(String(v)) : ''}</td>`;
      }).join("")}</tr>`
    : "";

  const metaHtml = meta && Object.keys(meta).length > 0
    ? `<div style="margin:10px 0 16px;font-size:10px;color:#6B7280;">
        ${Object.entries(meta).map(([k, v]) => `<div><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</div>`).join("")}
      </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 1cm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 11px;
      color: #1F2937;
      margin: 0;
      padding: 20px;
    }
    .header {
      border-bottom: 2px solid #1F2937;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .title {
      font-size: 18px;
      font-weight: 800;
      margin: 0 0 4px;
    }
    .subtitle {
      font-size: 12px;
      color: #4B5563;
      margin: 0;
    }
    .generated {
      font-size: 9px;
      color: #6B7280;
      margin-top: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #E5E7EB;
      font-size: 9px;
      color: #9CA3AF;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}
    <div class="generated">Сформировано: ${formatDate()}</div>
  </div>

  ${metaHtml}

  <table>
    <thead>${headerRow}</thead>
    <tbody>${bodyRows}${totalsRow}</tbody>
  </table>

  <div class="footer">
    Finstat.kz · НК РК 2026 · Документ сформирован автоматически
  </div>

  <script>
    window.addEventListener("load", function() {
      setTimeout(function() {
        window.print();
        setTimeout(function() {
          window.close();
        }, 500);
      }, 250);
    });
  </script>
</body>
</html>`;

  // Открываем в новом окне для печати
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Браузер заблокировал всплывающее окно. Разрешите всплывающие окна для finstat.kz и попробуйте снова.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ═══ ХЕЛПЕРЫ ДЛЯ ТИПИЧНЫХ КОЛОНОК ═══

export const colMoney = <T = any>(key: keyof T | string, label: string): ExportColumn<T> => ({
  key,
  label,
  align: "right",
  format: (v) => {
    const n = Number(v);
    if (isNaN(n)) return "0";
    return fmtMoney(n);
  },
});

export const colDate = <T = any>(key: keyof T | string, label: string): ExportColumn<T> => ({
  key,
  label,
  format: (v) => {
    if (!v) return "";
    if (typeof v === "string") return v.length >= 10 ? v.slice(0, 10) : v;
    return new Date(v).toISOString().slice(0, 10);
  },
});

export const colText = <T = any>(key: keyof T | string, label: string, align?: "left" | "right" | "center"): ExportColumn<T> => ({
  key,
  label,
  align: align || "left",
});

export const colNumber = <T = any>(key: keyof T | string, label: string): ExportColumn<T> => ({
  key,
  label,
  align: "right",
  format: (v) => Number(v || 0).toLocaleString("ru-RU"),
});
