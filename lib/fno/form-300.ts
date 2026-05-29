// Форма 300.00 — Декларация по налогу на добавленную стоимость (НДС).
// Сдаётся ежеквартально всеми плательщиками НДС (оборот > 10 000 МРП = 43 250 000 ₸).

import { SupabaseClient } from "@supabase/supabase-js";

export interface F300Data {
  // Реквизиты
  tin: string;
  taxpayer_name: string;
  
  // Период
  year: number;
  quarter: 1 | 2 | 3 | 4;
  
  declaration_type: "initial" | "additional" | "corrective";
  
  // ═══ РАЗДЕЛ 1: ОБЛАГАЕМЫЕ ОБОРОТЫ ═══
  
  // 300.00.001 — Реализация по ставке 16% (стандартная)
  sales_16_amount: number;      // оборот без НДС
  sales_16_vat: number;         // НДС начисленный (16%)
  
  // 300.00.002 — Реализация по ставке 12% (для отдельных категорий)
  sales_12_amount: number;
  sales_12_vat: number;
  
  // 300.00.003 — Реализация по ставке 0% (экспорт, международные перевозки)
  sales_0_amount: number;
  
  // 300.00.004 — Освобождённые от НДС обороты
  sales_exempt_amount: number;
  
  // ИТОГО облагаемые обороты
  total_taxable_amount: number;
  total_output_vat: number;     // итоговый НДС с продаж
  
  // ═══ РАЗДЕЛ 2: ПРИОБРЕТЕНИЯ ═══
  
  // 300.00.013 — Приобретения с НДС от плательщиков НДС
  purchases_with_vat_amount: number;     // оборот без НДС
  purchases_input_vat: number;            // НДС к зачёту
  
  // 300.00.014 — Приобретения от неплательщиков (без НДС)
  purchases_no_vat_amount: number;
  
  // 300.00.015 — Импорт товаров с НДС
  imports_amount: number;
  imports_vat: number;
  
  // 300.00.016 — Освобождённые приобретения
  purchases_exempt_amount: number;
  
  // ИТОГО приобретения
  total_purchases_amount: number;
  total_input_vat: number;       // итоговый НДС к зачёту
  
  // ═══ РАЗДЕЛ 3: РАСЧЁТ ═══
  
  // 300.00.021 — НДС к уплате (если положительный) или к возмещению (если отрицательный)
  vat_to_pay: number;            // total_output_vat - total_input_vat
  
  // Превышение зачётного над начисленным (к возмещению из бюджета)
  vat_to_refund: number;
  
  // Сальдо с прошлого периода (если было превышение зачёта)
  carry_over_from_previous: number;
  
  // ИТОГО к уплате/возмещению с учётом сальдо
  final_amount: number;
  is_to_pay: boolean;            // true если к уплате, false если к возмещению
  
  // ═══ ПРИЛОЖЕНИЕ F1 — ПРИОБРЕТЕНИЯ ═══
  // Детальный реестр счетов-фактур поставщиков
  purchase_invoices: {
    invoice_number: string;
    invoice_date: string;
    supplier_bin: string;
    supplier_name: string;
    amount_without_vat: number;
    vat_amount: number;
    total_amount: number;
    description: string;
  }[];
  
  // ═══ ПРИЛОЖЕНИЕ F2 — РЕАЛИЗАЦИЯ ═══
  // Детальный реестр выставленных счетов-фактур
  sales_invoices: {
    invoice_number: string;
    invoice_date: string;
    buyer_bin: string;
    buyer_name: string;
    amount_without_vat: number;
    vat_amount: number;
    total_amount: number;
    vat_rate: number;
    description: string;
  }[];
}

const FORM_CODE = "300.00";
const FORM_NAME = "Декларация по налогу на добавленную стоимость";

// ═══ АВТОМАТИЧЕСКИЙ РАСЧЁТ из учётных данных ═══

export async function calculate300(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4
): Promise<F300Data> {
  const startMonth = (quarter - 1) * 3;
  const endMonth = quarter * 3 - 1;
  const startDate = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
  const endMonthDate = new Date(year, endMonth + 1, 0); // последний день квартала
  const endDate = endMonthDate.toISOString().slice(0, 10);

  // Профиль
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();

  // Все проводки за период
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", userId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  // ═══ РАЗДЕЛ 1: ПРОДАЖИ (выходной НДС) ═══
  // Логика: продажи отражаются на счёте 6010, НДС — на счёте 3130 (Кт)
  // Чтобы понять стандарт/льгота — смотрим на номенклатуру или признак заказа
  
  let sales16VAT = 0;
  let sales16Amount = 0;
  let sales12Amount = 0;
  let sales12VAT = 0;
  let sales0Amount = 0;
  let salesExempt = 0;

  (entries || []).forEach(e => {
    const cr = String(e.credit_account || "");
    const amt = Number(e.amount || 0);
    
    if (cr === "6010") {
      // По умолчанию считаем как 16%, если в описании нет указания
      const desc = String(e.description || "").toLowerCase();
      if (desc.includes("экспорт") || desc.includes("0%")) {
        sales0Amount += amt;
      } else if (desc.includes("освобожд") || desc.includes("льгот")) {
        salesExempt += amt;
      } else if (desc.includes("12%")) {
        sales12Amount += amt;
        sales12VAT += amt * 0.12;
      } else {
        sales16Amount += amt;
        sales16VAT += amt * 0.16;
      }
    }
    
    // НДС начисленный (Кт 3130) — берём прямо из проводок
    if (cr === "3130") {
      // Уже учли в sales16VAT/sales12VAT, но если есть прямые проводки начисления:
      // Дт 1210 Кт 3130 — НДС с реализации (без счёта 6010 рядом)
    }
  });

  // ═══ РАЗДЕЛ 2: ПРИОБРЕТЕНИЯ (входной НДС) ═══
  // Закупки: Дт 1310/7210/2410 Кт 3310 — основная сумма
  //         Дт 1420 Кт 3310 — НДС к зачёту
  
  let purchasesWithVATAmount = 0;
  let purchasesInputVAT = 0;
  let purchasesNoVATAmount = 0;
  let importsAmount = 0;
  let importsVAT = 0;
  let purchasesExempt = 0;

  // Группируем по doc_ref чтобы найти связанные проводки
  const docGroups: Record<string, any[]> = {};
  (entries || []).forEach(e => {
    const ref = e.doc_ref || `auto_${e.id}`;
    if (!docGroups[ref]) docGroups[ref] = [];
    docGroups[ref].push(e);
  });

  Object.values(docGroups).forEach(group => {
    let mainAmount = 0;
    let vatAmount = 0;
    let isImport = false;
    let isPurchase = false;

    group.forEach(e => {
      const dr = String(e.debit_account || "");
      const cr = String(e.credit_account || "");
      const amt = Number(e.amount || 0);
      const desc = String(e.description || "").toLowerCase();

      if (desc.includes("импорт") || desc.includes("ввоз")) isImport = true;

      // Дт 1310/7210/7110/7990/2410 Кт 3310 — основное приобретение
      if (["1310", "1320", "1330", "7210", "7110", "7990", "2410"].includes(dr) && cr === "3310") {
        mainAmount += amt;
        isPurchase = true;
      }

      // Дт 1420 — НДС к зачёту
      if (dr === "1420") {
        vatAmount += amt;
        isPurchase = true;
      }
    });

    if (isPurchase) {
      if (isImport) {
        importsAmount += mainAmount;
        importsVAT += vatAmount;
      } else if (vatAmount > 0) {
        purchasesWithVATAmount += mainAmount;
        purchasesInputVAT += vatAmount;
      } else {
        purchasesNoVATAmount += mainAmount;
      }
    }
  });

  // ═══ РЕЕСТРЫ ИЗ ЗАКАЗОВ И КОНТРАГЕНТОВ ═══
  // Для приложения F1 (приобретения) и F2 (реализация)
  
  // F2 — реализация: берём из orders с типом продажи
  const { data: salesOrders } = await supabase
    .from("orders")
    .select("*, counterparties(name, bin)")
    .eq("user_id", userId)
    .gte("order_date", startDate)
    .lte("order_date", endDate);

  const sales_invoices = (salesOrders || []).map(o => {
    const total = Number(o.total_amount || 0);
    const vatRate = Number(o.vat_rate || 16);
    const vat = total * vatRate / (100 + vatRate);
    return {
      invoice_number: o.order_number || o.id?.slice(0, 8) || "",
      invoice_date: o.order_date || "",
      buyer_bin: o.counterparties?.bin || o.client_bin || "",
      buyer_name: o.counterparties?.name || o.client_name || "—",
      amount_without_vat: Math.round(total - vat),
      vat_amount: Math.round(vat),
      total_amount: total,
      vat_rate: vatRate,
      description: o.description || "Реализация",
    };
  });

  // F1 — приобретения: берём из document_scans (распознанные счета-фактуры)
  const { data: scans } = await supabase
    .from("document_scans")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "imported")
    .gte("uploaded_at", startDate);

  const purchase_invoices = (scans || [])
    .filter(s => s.detected_doc_type === "invoice")
    .map(s => {
      const data = s.extracted_data || {};
      return {
        invoice_number: data.doc_number || "",
        invoice_date: data.doc_date || s.uploaded_at?.slice(0, 10) || "",
        supplier_bin: data.seller?.bin || "",
        supplier_name: data.seller?.name || "—",
        amount_without_vat: Number(data.total_without_vat || 0),
        vat_amount: Number(data.vat_amount || 0),
        total_amount: Number(data.total_with_vat || 0),
        description: "Приобретение",
      };
    });

  const total_taxable_amount = sales16Amount + sales12Amount + sales0Amount;
  const total_output_vat = sales16VAT + sales12VAT;
  const total_purchases_amount = purchasesWithVATAmount + purchasesNoVATAmount + importsAmount;
  const total_input_vat = purchasesInputVAT + importsVAT;
  
  const vat_to_pay = total_output_vat - total_input_vat;

  return {
    tin: profile?.bin || "",
    taxpayer_name: profile?.company_name || profile?.full_name || "",
    year,
    quarter,
    declaration_type: "initial",
    
    sales_16_amount: Math.round(sales16Amount),
    sales_16_vat: Math.round(sales16VAT),
    sales_12_amount: Math.round(sales12Amount),
    sales_12_vat: Math.round(sales12VAT),
    sales_0_amount: Math.round(sales0Amount),
    sales_exempt_amount: Math.round(salesExempt),
    total_taxable_amount: Math.round(total_taxable_amount),
    total_output_vat: Math.round(total_output_vat),
    
    purchases_with_vat_amount: Math.round(purchasesWithVATAmount),
    purchases_input_vat: Math.round(purchasesInputVAT),
    purchases_no_vat_amount: Math.round(purchasesNoVATAmount),
    imports_amount: Math.round(importsAmount),
    imports_vat: Math.round(importsVAT),
    purchases_exempt_amount: Math.round(purchasesExempt),
    total_purchases_amount: Math.round(total_purchases_amount),
    total_input_vat: Math.round(total_input_vat),
    
    vat_to_pay: Math.round(vat_to_pay > 0 ? vat_to_pay : 0),
    vat_to_refund: Math.round(vat_to_pay < 0 ? -vat_to_pay : 0),
    carry_over_from_previous: 0,
    final_amount: Math.round(Math.abs(vat_to_pay)),
    is_to_pay: vat_to_pay >= 0,
    
    purchase_invoices,
    sales_invoices,
  };
}

// ═══ ВАЛИДАЦИЯ ═══

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validate300(data: F300Data): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.tin || data.tin.length !== 12) {
    errors.push("БИН/ИИН должен содержать 12 цифр");
  }
  if (!data.taxpayer_name) {
    errors.push("Не указано наименование налогоплательщика");
  }

  // Проверка ставки НДС
  const expected16VAT = data.sales_16_amount * 0.16;
  if (Math.abs(data.sales_16_vat - expected16VAT) > expected16VAT * 0.05 && data.sales_16_amount > 0) {
    warnings.push(`НДС 16% (${data.sales_16_vat.toLocaleString("ru-RU")} ₸) не совпадает с расчётным (${Math.round(expected16VAT).toLocaleString("ru-RU")} ₸)`);
  }

  // Если оборот < 10 000 МРП за год (43.25 млн ₸ в 2026) — может не быть плательщиком НДС
  const TAX_FREE_LIMIT_QUARTER = 10000 * 4325 / 4; // ~10.8 млн ₸ за квартал
  const totalSales = data.sales_16_amount + data.sales_12_amount + data.sales_0_amount + data.sales_exempt_amount;
  if (totalSales < TAX_FREE_LIMIT_QUARTER) {
    warnings.push(`Оборот за квартал (${totalSales.toLocaleString("ru-RU")} ₸) ниже порога обязательной регистрации НДС. Если не зарегистрированы как плательщик НДС — эту декларацию не сдают.`);
  }

  // Превышение входного НДС над выходным (возмещение)
  if (data.vat_to_refund > 0) {
    warnings.push(`У вас превышение зачётного НДС (${data.vat_to_refund.toLocaleString("ru-RU")} ₸ к возмещению из бюджета). Это редкая ситуация — проверьте правильно ли отражены продажи. Возмещение требует отдельной процедуры.`);
  }

  // Если НДС к уплате очень большой при малом обороте
  if (data.vat_to_pay > totalSales * 0.20) {
    warnings.push(`НДС к уплате необычно большой (${data.vat_to_pay.toLocaleString("ru-RU")} ₸ при обороте ${totalSales.toLocaleString("ru-RU")} ₸). Проверьте отражение приобретений с НДС — возможно не все счета-фактуры поставщиков учтены.`);
  }

  // Проверка реестров
  if (data.sales_16_amount > 0 && data.sales_invoices.length === 0) {
    warnings.push("Есть оборот по реализации, но нет ни одного счёта-фактуры в реестре F2. Подтянулись только из учёта без детализации.");
  }
  if (data.purchases_input_vat > 0 && data.purchase_invoices.length === 0) {
    warnings.push("Есть зачётный НДС, но нет приобретений в реестре F1. Используйте сканер документов для распознавания счетов-фактур поставщиков.");
  }

  // Проверка соответствия счетов-фактур
  const f2Total = data.sales_invoices.reduce((a, i) => a + i.amount_without_vat, 0);
  if (data.sales_16_amount > 0 && Math.abs(f2Total - data.sales_16_amount - data.sales_12_amount - data.sales_0_amount) > data.sales_16_amount * 0.10) {
    warnings.push(`Сумма реестра F2 (${f2Total.toLocaleString("ru-RU")} ₸) отличается от облагаемых оборотов на >10%. Возможно, не все продажи попали в заказы.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ═══ ГЕНЕРАЦИЯ XML ═══

function escapeXml(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtNum(n: number): string {
  return Math.round(n).toString();
}

export function generate300XML(data: F300Data): string {
  const periodCode = `Q${data.quarter}-${data.year}`;
  const declTypeCode = data.declaration_type === "initial" ? "1" : data.declaration_type === "additional" ? "2" : "3";

  // Реестр приобретений (F1)
  const f1Rows = data.purchase_invoices.map((inv, i) => `
    <Row number="${i + 1}">
      <InvoiceNumber>${escapeXml(inv.invoice_number)}</InvoiceNumber>
      <InvoiceDate>${escapeXml(inv.invoice_date)}</InvoiceDate>
      <SupplierBIN>${escapeXml(inv.supplier_bin)}</SupplierBIN>
      <SupplierName>${escapeXml(inv.supplier_name)}</SupplierName>
      <AmountWithoutVAT>${fmtNum(inv.amount_without_vat)}</AmountWithoutVAT>
      <VATAmount>${fmtNum(inv.vat_amount)}</VATAmount>
      <TotalAmount>${fmtNum(inv.total_amount)}</TotalAmount>
      <Description>${escapeXml(inv.description)}</Description>
    </Row>`).join("");

  // Реестр реализации (F2)
  const f2Rows = data.sales_invoices.map((inv, i) => `
    <Row number="${i + 1}">
      <InvoiceNumber>${escapeXml(inv.invoice_number)}</InvoiceNumber>
      <InvoiceDate>${escapeXml(inv.invoice_date)}</InvoiceDate>
      <BuyerBIN>${escapeXml(inv.buyer_bin)}</BuyerBIN>
      <BuyerName>${escapeXml(inv.buyer_name)}</BuyerName>
      <AmountWithoutVAT>${fmtNum(inv.amount_without_vat)}</AmountWithoutVAT>
      <VATAmount>${fmtNum(inv.vat_amount)}</VATAmount>
      <TotalAmount>${fmtNum(inv.total_amount)}</TotalAmount>
      <VATRate>${inv.vat_rate}</VATRate>
      <Description>${escapeXml(inv.description)}</Description>
    </Row>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Declaration xmlns="urn:kgd.gov.kz:fno:300:v8"
             FormCode="${FORM_CODE}"
             Period="${escapeXml(periodCode)}"
             DeclarationType="${declTypeCode}"
             Year="${data.year}"
             Quarter="${data.quarter}">
  
  <Taxpayer>
    <TIN>${escapeXml(data.tin)}</TIN>
    <Name>${escapeXml(data.taxpayer_name)}</Name>
  </Taxpayer>
  
  <!-- Раздел 1: Облагаемые обороты -->
  <Section1_TaxableSales>
    <!-- 300.00.001 - Реализация по 16% -->
    <Sales16>
      <Amount>${fmtNum(data.sales_16_amount)}</Amount>
      <VAT>${fmtNum(data.sales_16_vat)}</VAT>
    </Sales16>
    
    <!-- 300.00.002 - Реализация по 12% -->
    <Sales12>
      <Amount>${fmtNum(data.sales_12_amount)}</Amount>
      <VAT>${fmtNum(data.sales_12_vat)}</VAT>
    </Sales12>
    
    <!-- 300.00.003 - Реализация по 0% (экспорт) -->
    <Sales0>
      <Amount>${fmtNum(data.sales_0_amount)}</Amount>
    </Sales0>
    
    <!-- 300.00.004 - Освобождённые обороты -->
    <SalesExempt>
      <Amount>${fmtNum(data.sales_exempt_amount)}</Amount>
    </SalesExempt>
    
    <Total>
      <TotalAmount>${fmtNum(data.total_taxable_amount)}</TotalAmount>
      <TotalOutputVAT>${fmtNum(data.total_output_vat)}</TotalOutputVAT>
    </Total>
  </Section1_TaxableSales>
  
  <!-- Раздел 2: Приобретения -->
  <Section2_Purchases>
    <!-- 300.00.013 - Приобретения с НДС -->
    <PurchasesWithVAT>
      <Amount>${fmtNum(data.purchases_with_vat_amount)}</Amount>
      <InputVAT>${fmtNum(data.purchases_input_vat)}</InputVAT>
    </PurchasesWithVAT>
    
    <!-- 300.00.014 - Приобретения без НДС -->
    <PurchasesNoVAT>
      <Amount>${fmtNum(data.purchases_no_vat_amount)}</Amount>
    </PurchasesNoVAT>
    
    <!-- 300.00.015 - Импорт -->
    <Imports>
      <Amount>${fmtNum(data.imports_amount)}</Amount>
      <VAT>${fmtNum(data.imports_vat)}</VAT>
    </Imports>
    
    <!-- 300.00.016 - Освобождённые приобретения -->
    <PurchasesExempt>
      <Amount>${fmtNum(data.purchases_exempt_amount)}</Amount>
    </PurchasesExempt>
    
    <Total>
      <TotalAmount>${fmtNum(data.total_purchases_amount)}</TotalAmount>
      <TotalInputVAT>${fmtNum(data.total_input_vat)}</TotalInputVAT>
    </Total>
  </Section2_Purchases>
  
  <!-- Раздел 3: Расчёт -->
  <Section3_Calculation>
    <!-- 300.00.021 - НДС к уплате -->
    <VATToPay>${fmtNum(data.vat_to_pay)}</VATToPay>
    
    <!-- 300.00.022 - НДС к возмещению -->
    <VATToRefund>${fmtNum(data.vat_to_refund)}</VATToRefund>
    
    <CarryOverFromPrevious>${fmtNum(data.carry_over_from_previous)}</CarryOverFromPrevious>
    
    <FinalAmount IsToPay="${data.is_to_pay}">${fmtNum(data.final_amount)}</FinalAmount>
  </Section3_Calculation>
  
  <!-- Приложение F1: Реестр приобретений -->
  <AppendixF1_Purchases>
    <RecordCount>${data.purchase_invoices.length}</RecordCount>${f1Rows}
  </AppendixF1_Purchases>
  
  <!-- Приложение F2: Реестр реализации -->
  <AppendixF2_Sales>
    <RecordCount>${data.sales_invoices.length}</RecordCount>${f2Rows}
  </AppendixF2_Sales>
  
  <Metadata>
    <GeneratedBy>Finstat.kz</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <Version>1.0</Version>
  </Metadata>
</Declaration>`;

  return xml;
}

// ═══ ОПИСАНИЕ ФОРМЫ ═══

export const F300_INFO = {
  code: FORM_CODE,
  name: FORM_NAME,
  description: "Декларация по НДС. Сдаётся ежеквартально плательщиками НДС (оборот > 10 000 МРП = 43 250 000 ₸).",
  period_type: "quarter" as const,
  due_day: 15,
  due_month_offset: 2,
  rate_info: "Стандартная ставка 16% (с 2026), пониженная 12%, экспорт 0%, освобождённые операции",
};
