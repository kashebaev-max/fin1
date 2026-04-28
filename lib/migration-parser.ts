// Универсальный парсер форматов миграции из 1С.
// Поддерживает: CSV (любая кодировка), XLSX (через SheetJS из CDN), XML 1С (КАЗ/УТ).

export interface ParsedFile {
  format: "csv" | "xlsx" | "xml_1c" | "unknown";
  sheets?: { name: string; rows: any[][] }[]; // для XLSX — несколько листов
  rows: any[][]; // основные данные (массив массивов)
  headers: string[]; // первая строка
  fileName: string;
  encoding: string;
  totalRows: number;
}

// ═══ ОПРЕДЕЛЕНИЕ КОДИРОВКИ ═══
// 1С часто выгружает в windows-1251 для старых баз

async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

function detectEncoding(bytes: Uint8Array): "utf-8" | "windows-1251" {
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return "utf-8";
  }

  // Эвристика: считаем кириллицу
  let cp1251Score = 0;
  let utf8Score = 0;
  const sample = Math.min(bytes.length, 1000);

  for (let i = 0; i < sample; i++) {
    const b = bytes[i];
    // Кириллица в windows-1251 — 0xC0-0xFF (без специальных)
    if (b >= 0xC0 && b <= 0xFF) cp1251Score++;
    // В UTF-8 кириллица — двухбайтовая последовательность 0xD0-0xD3
    if (b === 0xD0 || b === 0xD1) {
      if (i + 1 < sample && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xBF) {
        utf8Score++;
        i++; // пропускаем второй байт
      }
    }
  }

  return utf8Score > cp1251Score ? "utf-8" : "windows-1251";
}

function decodeBytes(bytes: Uint8Array, encoding: string): string {
  try {
    const decoder = new TextDecoder(encoding);
    return decoder.decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// ═══ ПАРСЕР CSV ═══

function parseCSV(text: string, delimiter: string = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cell += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      // Skip \r\n
      if (char === "\r" && nextChar === "\n") i++;
      i++;
      continue;
    }
    cell += char;
    i++;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

// ═══ XML парсер для выгрузок 1С ═══

function parseXML1C(xmlText: string): { headers: string[]; rows: any[][] } {
  // 1С выгружает XML в формате CommerceML или своих структур.
  // Нам нужно вытащить строки с одинаковой структурой.

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const rows: any[][] = [];
  const headersSet = new Set<string>();

  // Стандартные теги 1С: <Контрагент>, <Товар>, <Документ>, <Сотрудник>
  // Берём детей корневого элемента
  const root = doc.documentElement;
  if (!root) return { headers: [], rows: [] };

  // Ищем "записи" — это могут быть <Контрагент>, <Объект>, <Запись> и т.д.
  // Рекурсивно собираем все элементы 2-3 уровня
  const candidates: Element[] = [];
  
  function collectRecords(parent: Element, depth: number) {
    if (depth > 4) return;
    const children = Array.from(parent.children);
    
    // Если все дети одного типа — это и есть наши записи
    if (children.length > 1) {
      const tagNames = new Set(children.map(c => c.tagName));
      if (tagNames.size === 1 && children[0].children.length > 0) {
        candidates.push(...children);
        return;
      }
    }
    
    for (const child of children) {
      collectRecords(child, depth + 1);
    }
  }
  
  collectRecords(root, 0);

  // Собираем все возможные ключи (атрибуты и теги-дети)
  for (const record of candidates.slice(0, 1000)) {
    Array.from(record.attributes).forEach(attr => headersSet.add(attr.name));
    Array.from(record.children).forEach(child => {
      if (child.children.length === 0) {
        headersSet.add(child.tagName);
      } else {
        // Вложенные структуры (Реквизиты, Контакты)
        Array.from(child.children).forEach(sub => {
          if (sub.children.length === 0) {
            headersSet.add(`${child.tagName}.${sub.tagName}`);
          }
        });
      }
    });
  }

  const headers = Array.from(headersSet);

  // Извлекаем значения
  for (const record of candidates) {
    const row: any[] = [];
    for (const header of headers) {
      let value = "";

      // Сначала пробуем атрибут
      if (record.hasAttribute(header)) {
        value = record.getAttribute(header) || "";
      } else if (header.includes(".")) {
        // Вложенный путь
        const [parent, child] = header.split(".");
        const parentEl = record.querySelector(parent);
        if (parentEl) {
          const childEl = parentEl.querySelector(child);
          if (childEl) value = childEl.textContent || "";
        }
      } else {
        const el = record.querySelector(header);
        if (el) value = el.textContent || "";
      }
      row.push(value.trim());
    }
    rows.push(row);
  }

  return { headers, rows };
}

// ═══ XLSX парсер через SheetJS (загрузка из CDN при первом использовании) ═══

let xlsxLoaded = false;
async function loadXLSX(): Promise<any> {
  if (xlsxLoaded && (window as any).XLSX) return (window as any).XLSX;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => {
      xlsxLoaded = true;
      resolve((window as any).XLSX);
    };
    script.onerror = () => reject(new Error("Не удалось загрузить SheetJS"));
    document.head.appendChild(script);
  });
}

async function parseXLSX(file: File): Promise<{ sheets: { name: string; rows: any[][] }[] }> {
  const XLSX = await loadXLSX();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheets = workbook.SheetNames.map((name: string) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    return { name, rows };
  });

  return { sheets };
}

// ═══ ОПРЕДЕЛЕНИЕ ФОРМАТА ═══

function detectFormat(fileName: string, firstBytes: Uint8Array): ParsedFile["format"] {
  const lower = fileName.toLowerCase();
  
  if (lower.endsWith(".xml")) return "xml_1c";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";

  // Проверка по содержимому
  const start = decodeBytes(firstBytes.slice(0, 100), "utf-8");
  if (start.trim().startsWith("<?xml")) return "xml_1c";
  if (firstBytes[0] === 0x50 && firstBytes[1] === 0x4B) return "xlsx"; // PK = zip = xlsx
  
  return "csv"; // по умолчанию пробуем csv
}

// ═══ ГЛАВНАЯ ФУНКЦИЯ ═══

export async function parseFile(file: File, options?: {
  delimiter?: string;
  encoding?: string;
  sheetName?: string;
}): Promise<ParsedFile> {
  const bytes = await readFileAsBytes(file);
  const format = detectFormat(file.name, bytes);

  if (format === "xlsx") {
    const { sheets } = await parseXLSX(file);
    const sheet = options?.sheetName
      ? sheets.find(s => s.name === options.sheetName) || sheets[0]
      : sheets[0];
    const headers = (sheet.rows[0] || []).map(String);
    const rows = sheet.rows.slice(1);
    return {
      format: "xlsx",
      sheets,
      rows,
      headers,
      fileName: file.name,
      encoding: "utf-8",
      totalRows: rows.length,
    };
  }

  if (format === "xml_1c") {
    const text = decodeBytes(bytes, "utf-8");
    const { headers, rows } = parseXML1C(text);
    return {
      format: "xml_1c",
      rows,
      headers,
      fileName: file.name,
      encoding: "utf-8",
      totalRows: rows.length,
    };
  }

  // CSV
  const encoding = options?.encoding || detectEncoding(bytes);
  const text = decodeBytes(bytes, encoding);
  
  // Авто-определение разделителя
  let delimiter = options?.delimiter;
  if (!delimiter) {
    const firstLine = text.split("\n")[0] || "";
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    delimiter = tabs > semicolons && tabs > commas ? "\t" : (semicolons >= commas ? ";" : ",");
  }

  const allRows = parseCSV(text, delimiter);
  const headers = (allRows[0] || []).map(String);
  const rows = allRows.slice(1).filter(r => r.some(c => String(c).trim() !== ""));

  return {
    format: "csv",
    rows,
    headers,
    fileName: file.name,
    encoding,
    totalRows: rows.length,
  };
}

// ═══ ШАБЛОНЫ МАППИНГА ═══
// Для каждого типа сущности — какие имена полей в 1С → в наши поля

export interface FieldMapping {
  systemField: string; // куда импортировать
  systemLabel: string;
  required: boolean;
  sourceField: string | null; // откуда брать (имя колонки)
  defaultValue?: string; // значение по умолчанию если не нашли
}

export const COUNTERPARTY_FIELDS: Omit<FieldMapping, "sourceField">[] = [
  { systemField: "name", systemLabel: "Наименование", required: true },
  { systemField: "bin", systemLabel: "БИН/ИИН", required: false },
  { systemField: "counterparty_type", systemLabel: "Тип (client/supplier/both)", required: false, defaultValue: "both" },
  { systemField: "phone", systemLabel: "Телефон", required: false },
  { systemField: "email", systemLabel: "Email", required: false },
  { systemField: "address", systemLabel: "Адрес", required: false },
  { systemField: "director_name", systemLabel: "Руководитель", required: false },
  { systemField: "bank_account", systemLabel: "ИИК/БСО", required: false },
  { systemField: "bank_name", systemLabel: "Банк", required: false },
];

export const NOMENCLATURE_FIELDS: Omit<FieldMapping, "sourceField">[] = [
  { systemField: "name", systemLabel: "Наименование", required: true },
  { systemField: "code", systemLabel: "Код / артикул", required: false },
  { systemField: "unit", systemLabel: "Единица измерения", required: false, defaultValue: "шт" },
  { systemField: "purchase_price", systemLabel: "Закупочная цена", required: false },
  { systemField: "sale_price", systemLabel: "Цена продажи", required: false },
  { systemField: "quantity", systemLabel: "Остаток", required: false, defaultValue: "0" },
  { systemField: "category", systemLabel: "Категория / группа", required: false },
  { systemField: "vat_rate", systemLabel: "Ставка НДС (%)", required: false, defaultValue: "16" },
  { systemField: "min_stock", systemLabel: "Минимальный остаток", required: false },
];

export const EMPLOYEE_FIELDS: Omit<FieldMapping, "sourceField">[] = [
  { systemField: "full_name", systemLabel: "ФИО", required: true },
  { systemField: "iin", systemLabel: "ИИН", required: false },
  { systemField: "position", systemLabel: "Должность", required: false },
  { systemField: "department", systemLabel: "Подразделение", required: false },
  { systemField: "salary", systemLabel: "Оклад", required: false, defaultValue: "0" },
  { systemField: "hire_date", systemLabel: "Дата приёма", required: false },
  { systemField: "phone", systemLabel: "Телефон", required: false },
  { systemField: "email", systemLabel: "Email", required: false },
];

export const JOURNAL_ENTRY_FIELDS: Omit<FieldMapping, "sourceField">[] = [
  { systemField: "entry_date", systemLabel: "Дата проводки", required: true },
  { systemField: "debit_account", systemLabel: "Счёт Дебет", required: true },
  { systemField: "credit_account", systemLabel: "Счёт Кредит", required: true },
  { systemField: "amount", systemLabel: "Сумма", required: true },
  { systemField: "description", systemLabel: "Содержание операции", required: false },
  { systemField: "doc_ref", systemLabel: "Ссылка на документ", required: false },
];

// ═══ АВТО-МАППИНГ ПОЛЕЙ ═══
// Эвристика: пытаемся понять какая колонка соответствует какому полю

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["наименование", "название", "name", "имя", "компания", "контрагент", "товар", "номенклатура", "услуга"],
  bin: ["бин", "иин", "bin", "rnn", "рнн", "ин/iin", "binnumber"],
  full_name: ["фио", "сотрудник", "работник", "полное имя", "fullname", "name"],
  iin: ["иин", "iin", "ин"],
  phone: ["телефон", "phone", "tel", "тел"],
  email: ["email", "почта", "e-mail", "электронная почта"],
  address: ["адрес", "address", "юр. адрес", "юр.адрес", "юрадрес", "местонахождение"],
  director_name: ["руководитель", "директор", "представитель", "ceo", "director"],
  position: ["должность", "должн", "position", "title"],
  department: ["подразделение", "отдел", "department", "цех"],
  salary: ["оклад", "зарплата", "salary", "зп", "размер оплаты"],
  hire_date: ["дата приёма", "дата приема", "принят", "hire_date", "hire date", "дата начала"],
  unit: ["ед", "единица", "ед.", "ед.изм", "ед. изм.", "единица измерения", "unit"],
  code: ["код", "артикул", "code", "sku", "код товара"],
  purchase_price: ["цена закупки", "закуп", "себестоимость", "purchase", "cost", "входная цена"],
  sale_price: ["цена продажи", "цена реализации", "цена", "розничная", "sale", "price"],
  quantity: ["остаток", "количество", "кол-во", "кол.", "qty", "quantity", "stock"],
  category: ["категория", "группа", "category", "тип", "вид"],
  vat_rate: ["ндс", "ставка ндс", "vat", "vat rate", "налог"],
  min_stock: ["мин остаток", "минимальный остаток", "min stock", "min_stock"],
  entry_date: ["дата", "date", "период", "период регистрации"],
  debit_account: ["дебет", "дт", "debit", "счёт дебет", "счет дебет"],
  credit_account: ["кредит", "кт", "credit", "счёт кредит", "счет кредит"],
  amount: ["сумма", "amount", "сумма документа", "сумма операции"],
  description: ["содержание", "комментарий", "примечание", "описание", "description", "наименование операции"],
  doc_ref: ["документ", "регистратор", "doc", "ref", "ссылка"],
  bank_account: ["иик", "счёт в банке", "счет в банке", "бик/иик", "iik", "банковский счёт"],
  bank_name: ["банк", "bank", "наименование банка"],
  counterparty_type: ["тип", "вид контрагента", "type"],
};

export function autoMapFields(
  sourceHeaders: string[],
  targetFields: Omit<FieldMapping, "sourceField">[]
): FieldMapping[] {
  return targetFields.map(target => {
    const aliases = FIELD_ALIASES[target.systemField] || [];
    const allKeywords = [target.systemField, target.systemLabel.toLowerCase(), ...aliases];

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const header of sourceHeaders) {
      const lowerHeader = String(header).toLowerCase().trim();
      
      for (const keyword of allKeywords) {
        const k = keyword.toLowerCase();
        let score = 0;
        if (lowerHeader === k) score = 100;
        else if (lowerHeader.includes(k)) score = 60;
        else if (k.includes(lowerHeader) && lowerHeader.length > 2) score = 40;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = header;
        }
      }
    }

    return {
      ...target,
      sourceField: bestScore >= 40 ? bestMatch : null,
    };
  });
}
