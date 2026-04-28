// Форма 700.00 — Декларация по налогу на имущество, транспортные средства и землю.
// Сдаётся раз в год до 31 марта следующего года.

import { SupabaseClient } from "@supabase/supabase-js";

export interface PropertyTaxItem {
  asset_id: string;
  name: string;
  cadastral_number: string;
  initial_cost: number;        // первоначальная стоимость
  residual_value_start: number; // остаточная стоимость на начало года
  residual_value_end: number;   // остаточная стоимость на конец года
  average_value: number;        // среднегодовая стоимость = (start + end) / 2
  tax_rate: number;             // 1.5% стандартная ставка
  tax_amount: number;           // налог = average × rate / 100
}

export interface VehicleTaxItem {
  asset_id: string;
  name: string;
  registration_number: string;
  vehicle_type: string;
  engine_volume?: number;       // для легковых
  engine_power?: number;        // для других
  load_capacity?: number;       // для грузовых (т)
  seats?: number;               // для автобусов
  year_made: number;
  age_years: number;            // возраст ТС
  base_rate_mrp: number;        // ставка в МРП (по мощности/типу)
  age_coefficient: number;      // понижающий коэффициент по возрасту
  tax_amount: number;           // итоговый налог
}

export interface LandTaxItem {
  asset_id: string;
  name: string;
  cadastral_number: string;
  region: string;
  category: string;
  area_sqm: number;
  area_ha: number;              // в гектарах
  rate_per_unit: number;        // ставка за единицу
  tax_amount: number;
}

export interface F700Data {
  // Реквизиты
  tin: string;
  taxpayer_name: string;
  
  // Период
  year: number;
  declaration_type: "initial" | "additional" | "corrective";
  
  // ═══ ИМУЩЕСТВО ═══
  property_items: PropertyTaxItem[];
  property_total_average_value: number;
  property_tax_total: number;
  
  // ═══ ТРАНСПОРТ ═══
  vehicle_items: VehicleTaxItem[];
  vehicle_tax_total: number;
  
  // ═══ ЗЕМЛЯ ═══
  land_items: LandTaxItem[];
  land_total_area_ha: number;
  land_tax_total: number;
  
  // ИТОГО
  total_tax: number;
  
  // Авансовые платежи (предполагается что были уплачены равными долями)
  advance_payments_paid: number;
  
  // К доплате/возврату
  to_pay: number;
  to_refund: number;
  is_to_pay: boolean;
}

const FORM_CODE = "700.00";
const FORM_NAME = "Декларация по налогу на имущество, транспортные средства и землю";

const MRP_2026 = 4325; // МРП на 2026 год
const PROPERTY_TAX_RATE = 1.5; // 1.5% стандартная ставка налога на имущество для юр.лиц

// ═══ СТАВКИ НАЛОГА НА ТРАНСПОРТ (ст. 492 НК РК, ставки в МРП) ═══

interface VehicleRate {
  type: string;
  // Ставка зависит от объёма двигателя (легковые) или мощности/тоннажа
  ranges: { min: number; max: number; rate_mrp: number }[];
  unit: "engine_volume" | "engine_power" | "load_capacity" | "seats";
}

const VEHICLE_RATES: Record<string, VehicleRate> = {
  car: {
    type: "Легковые",
    unit: "engine_volume",
    ranges: [
      { min: 0,    max: 1100, rate_mrp: 1   },
      { min: 1100, max: 1500, rate_mrp: 2   },
      { min: 1500, max: 2000, rate_mrp: 3   },
      { min: 2000, max: 2500, rate_mrp: 6   },
      { min: 2500, max: 3000, rate_mrp: 9   },
      { min: 3000, max: 4000, rate_mrp: 15  },
      { min: 4000, max: 99999, rate_mrp: 117 },
    ],
  },
  truck: {
    type: "Грузовые",
    unit: "load_capacity", // тонны
    ranges: [
      { min: 0, max: 1.5,   rate_mrp: 3  },
      { min: 1.5, max: 5.0, rate_mrp: 5  },
      { min: 5.0, max: 99,  rate_mrp: 7  },
    ],
  },
  bus: {
    type: "Автобусы",
    unit: "seats",
    ranges: [
      { min: 0,  max: 12, rate_mrp: 9  },
      { min: 12, max: 25, rate_mrp: 14 },
      { min: 25, max: 999, rate_mrp: 20 },
    ],
  },
  motorcycle: {
    type: "Мотоциклы",
    unit: "engine_volume",
    ranges: [
      { min: 0,   max: 200,  rate_mrp: 0.1 },
      { min: 200, max: 1000, rate_mrp: 1   },
      { min: 1000, max: 99999, rate_mrp: 2 },
    ],
  },
  tractor: {
    type: "Тракторы и спецтехника",
    unit: "engine_power",
    ranges: [
      { min: 0,   max: 100, rate_mrp: 1 },
      { min: 100, max: 999, rate_mrp: 2 },
    ],
  },
  special: {
    type: "Специальные ТС",
    unit: "engine_power",
    ranges: [
      { min: 0,   max: 999, rate_mrp: 4 },
    ],
  },
  water: {
    type: "Водный транспорт",
    unit: "engine_power",
    ranges: [
      { min: 0,   max: 999, rate_mrp: 6 },
    ],
  },
  air: {
    type: "Воздушный транспорт",
    unit: "engine_power",
    ranges: [
      { min: 0,   max: 999999, rate_mrp: 8 },
    ],
  },
};

// Понижающий коэффициент по возрасту ТС (для легковых)
function getAgeCoefficient(vehicleType: string, ageYears: number): number {
  if (vehicleType !== "car" || ageYears < 6) return 1.0;
  if (ageYears < 16) return 0.7;
  return 0.3;
}

// Расчёт налога на одно ТС
function calculateVehicleTax(asset: any): VehicleTaxItem {
  const type = asset.vehicle_type || "car";
  const rateConfig = VEHICLE_RATES[type] || VEHICLE_RATES.car;
  
  let unitValue = 0;
  if (rateConfig.unit === "engine_volume") unitValue = Number(asset.vehicle_engine_volume || 0);
  else if (rateConfig.unit === "engine_power") unitValue = Number(asset.vehicle_engine_power || 0);
  else if (rateConfig.unit === "load_capacity") unitValue = Number(asset.vehicle_load_capacity || 0);
  else if (rateConfig.unit === "seats") unitValue = Number(asset.vehicle_seats || 0);

  // Находим подходящий диапазон
  const range = rateConfig.ranges.find(r => unitValue >= r.min && unitValue < r.max) || rateConfig.ranges[0];
  const baseRate = range.rate_mrp;
  
  const yearMade = Number(asset.vehicle_year_made || new Date().getFullYear());
  const ageYears = new Date().getFullYear() - yearMade;
  const ageCoef = getAgeCoefficient(type, ageYears);
  
  // Налог = МРП × ставка × возрастной коэффициент
  const taxAmount = MRP_2026 * baseRate * ageCoef;

  return {
    asset_id: asset.id,
    name: asset.name,
    registration_number: asset.vehicle_registration_number || "",
    vehicle_type: type,
    engine_volume: asset.vehicle_engine_volume,
    engine_power: asset.vehicle_engine_power,
    load_capacity: asset.vehicle_load_capacity,
    seats: asset.vehicle_seats,
    year_made: yearMade,
    age_years: ageYears,
    base_rate_mrp: baseRate,
    age_coefficient: ageCoef,
    tax_amount: Math.round(taxAmount),
  };
}

// ═══ СТАВКИ НАЛОГА НА ЗЕМЛЮ (упрощённо, ст. 503-510 НК РК) ═══
// В реальности ставки зависят от региона, кадастровой стоимости, балла бонитета.
// Используем средние ставки.

const LAND_RATES: Record<string, number> = {
  agricultural: 0.5,    // ₸/га (для с/х земель — низкая)
  settlements: 5.79,    // ₸/кв.м (для земель населённых пунктов)
  industrial: 0.5,      // ₸/кв.м (промышленность)
  special: 0.5,         // ₸/кв.м (особого назначения)
  forest: 0.05,         // ₸/га (лесной фонд)
  water: 0.05,          // ₸/га (водный фонд)
  reserve: 0,           // ₸ (запас, не облагается)
};

function calculateLandTax(asset: any): LandTaxItem {
  const category = asset.land_category || "settlements";
  const areaSqm = Number(asset.land_area_sqm || 0);
  const areaHa = areaSqm / 10000;
  
  let rate = LAND_RATES[category] || 0;
  let taxAmount = 0;
  
  // Для с/х и лесных — расчёт по гектарам
  if (category === "agricultural" || category === "forest" || category === "water") {
    taxAmount = areaHa * rate;
  } else {
    // Для остальных — по кв.м.
    taxAmount = areaSqm * rate;
  }

  return {
    asset_id: asset.id,
    name: asset.name,
    cadastral_number: asset.land_cadastral_number || "",
    region: asset.land_region || "—",
    category,
    area_sqm: areaSqm,
    area_ha: Number(areaHa.toFixed(4)),
    rate_per_unit: rate,
    tax_amount: Math.round(taxAmount),
  };
}

// ═══ АВТОМАТИЧЕСКИЙ РАСЧЁТ из учётных данных ═══

export async function calculate700(
  supabase: SupabaseClient,
  userId: string,
  year: number
): Promise<F700Data> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();

  // Получаем все ОС с tax_object_type
  const { data: assets } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("user_id", userId);

  // ═══ ИМУЩЕСТВО ═══
  const propertyAssets = (assets || []).filter(a => 
    a.tax_object_type === "property" || a.property_taxable === true
  );
  
  const property_items: PropertyTaxItem[] = propertyAssets.map(a => {
    const initialCost = Number(a.initial_cost || 0);
    const accumulatedDepStart = Number(a.accumulated_depreciation_start_year || 0);
    const accumulatedDepEnd = Number(a.accumulated_depreciation || 0);
    const residualStart = Math.max(0, initialCost - accumulatedDepStart);
    const residualEnd = Math.max(0, initialCost - accumulatedDepEnd);
    const averageValue = (residualStart + residualEnd) / 2;
    const taxAmount = averageValue * PROPERTY_TAX_RATE / 100;
    
    return {
      asset_id: a.id,
      name: a.name,
      cadastral_number: a.property_cadastral_number || "",
      initial_cost: Math.round(initialCost),
      residual_value_start: Math.round(residualStart),
      residual_value_end: Math.round(residualEnd),
      average_value: Math.round(averageValue),
      tax_rate: PROPERTY_TAX_RATE,
      tax_amount: Math.round(taxAmount),
    };
  });
  
  const property_total_average_value = property_items.reduce((s, i) => s + i.average_value, 0);
  const property_tax_total = property_items.reduce((s, i) => s + i.tax_amount, 0);

  // ═══ ТРАНСПОРТ ═══
  const vehicleAssets = (assets || []).filter(a => 
    a.tax_object_type === "vehicle" && a.vehicle_type
  );
  
  const vehicle_items: VehicleTaxItem[] = vehicleAssets.map(calculateVehicleTax);
  const vehicle_tax_total = vehicle_items.reduce((s, i) => s + i.tax_amount, 0);

  // ═══ ЗЕМЛЯ ═══
  const landAssets = (assets || []).filter(a => 
    a.tax_object_type === "land" && a.land_area_sqm
  );
  
  const land_items: LandTaxItem[] = landAssets.map(calculateLandTax);
  const land_total_area_ha = land_items.reduce((s, i) => s + i.area_ha, 0);
  const land_tax_total = land_items.reduce((s, i) => s + i.tax_amount, 0);

  // ИТОГО
  const total_tax = property_tax_total + vehicle_tax_total + land_tax_total;

  // Авансовые платежи (берём из проводок Дт 3160 - налоги на имущество/транспорт/землю)
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("amount, debit_account")
    .eq("user_id", userId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .or("debit_account.eq.3160,debit_account.eq.3170,debit_account.eq.3180");
  
  const advance_payments_paid = (entries || []).reduce((s, e) => s + Number(e.amount || 0), 0);

  const balance = total_tax - advance_payments_paid;
  const to_pay = balance > 0 ? balance : 0;
  const to_refund = balance < 0 ? -balance : 0;

  return {
    tin: profile?.bin || "",
    taxpayer_name: profile?.company_name || profile?.full_name || "",
    year,
    declaration_type: "initial",
    
    property_items,
    property_total_average_value: Math.round(property_total_average_value),
    property_tax_total: Math.round(property_tax_total),
    
    vehicle_items,
    vehicle_tax_total: Math.round(vehicle_tax_total),
    
    land_items,
    land_total_area_ha: Number(land_total_area_ha.toFixed(4)),
    land_tax_total: Math.round(land_tax_total),
    
    total_tax: Math.round(total_tax),
    advance_payments_paid: Math.round(advance_payments_paid),
    to_pay: Math.round(to_pay),
    to_refund: Math.round(to_refund),
    is_to_pay: balance >= 0,
  };
}

// ═══ ВАЛИДАЦИЯ ═══

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validate700(data: F700Data): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.tin || data.tin.length !== 12) {
    errors.push("БИН должен содержать 12 цифр");
  }
  if (!data.taxpayer_name) {
    errors.push("Не указано наименование организации");
  }

  // Если вообще нет налогооблагаемых объектов
  if (data.property_items.length === 0 && data.vehicle_items.length === 0 && data.land_items.length === 0) {
    warnings.push("Нет налогооблагаемых объектов. Если есть имущество/транспорт/земля — отметьте их в карточке ОС, выбрав tax_object_type.");
  }

  // Проверка имущества
  data.property_items.forEach(p => {
    if (!p.cadastral_number) {
      warnings.push(`«${p.name}» — не указан кадастровый номер. Обязательно для подачи декларации.`);
    }
    if (p.average_value === 0) {
      warnings.push(`«${p.name}» — среднегодовая стоимость = 0. Возможно, ОС полностью самортизировано.`);
    }
  });

  // Проверка транспорта
  data.vehicle_items.forEach(v => {
    if (!v.registration_number) {
      warnings.push(`«${v.name}» — не указан гос. номер ТС.`);
    }
    if (!v.year_made || v.year_made < 1950) {
      warnings.push(`«${v.name}» — некорректный год выпуска (${v.year_made}).`);
    }
    if (v.vehicle_type === "car" && !v.engine_volume) {
      warnings.push(`«${v.name}» — для легкового авто нужен объём двигателя в куб.см.`);
    }
    if (v.vehicle_type === "truck" && !v.load_capacity) {
      warnings.push(`«${v.name}» — для грузового нужна грузоподъёмность в тоннах.`);
    }
  });

  // Проверка земли
  data.land_items.forEach(l => {
    if (!l.cadastral_number) {
      warnings.push(`Земельный участок «${l.name}» — не указан кадастровый номер.`);
    }
    if (l.area_sqm === 0) {
      errors.push(`Земельный участок «${l.name}» — не указана площадь.`);
    }
    if (!l.region) {
      warnings.push(`Земельный участок «${l.name}» — не указан регион. Влияет на ставку.`);
    }
  });

  // Подозрительно большие или малые суммы
  if (data.total_tax > 50_000_000) {
    warnings.push(`Налог получился очень большим (${data.total_tax.toLocaleString("ru-RU")} ₸). Проверьте остаточную стоимость имущества.`);
  }

  // Авансы превышают начисление
  if (data.advance_payments_paid > data.total_tax * 1.5 && data.advance_payments_paid > 0) {
    warnings.push(`Авансовые платежи (${data.advance_payments_paid.toLocaleString("ru-RU")} ₸) сильно превышают начисление (${data.total_tax.toLocaleString("ru-RU")} ₸). Возможно ошибка в проводках или к возврату из бюджета.`);
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

export function generate700XML(data: F700Data): string {
  const declTypeCode = data.declaration_type === "initial" ? "1" : data.declaration_type === "additional" ? "2" : "3";

  const propertyXml = data.property_items.map((p, i) => `
    <Property number="${i + 1}">
      <Name>${escapeXml(p.name)}</Name>
      <CadastralNumber>${escapeXml(p.cadastral_number)}</CadastralNumber>
      <InitialCost>${fmtNum(p.initial_cost)}</InitialCost>
      <ResidualValueStart>${fmtNum(p.residual_value_start)}</ResidualValueStart>
      <ResidualValueEnd>${fmtNum(p.residual_value_end)}</ResidualValueEnd>
      <AverageValue>${fmtNum(p.average_value)}</AverageValue>
      <TaxRate>${p.tax_rate}</TaxRate>
      <TaxAmount>${fmtNum(p.tax_amount)}</TaxAmount>
    </Property>`).join("");

  const vehicleXml = data.vehicle_items.map((v, i) => `
    <Vehicle number="${i + 1}">
      <Name>${escapeXml(v.name)}</Name>
      <RegistrationNumber>${escapeXml(v.registration_number)}</RegistrationNumber>
      <Type>${escapeXml(v.vehicle_type)}</Type>
      ${v.engine_volume ? `<EngineVolume>${v.engine_volume}</EngineVolume>` : ""}
      ${v.engine_power ? `<EnginePower>${v.engine_power}</EnginePower>` : ""}
      ${v.load_capacity ? `<LoadCapacity>${v.load_capacity}</LoadCapacity>` : ""}
      ${v.seats ? `<Seats>${v.seats}</Seats>` : ""}
      <YearMade>${v.year_made}</YearMade>
      <AgeYears>${v.age_years}</AgeYears>
      <BaseRateMRP>${v.base_rate_mrp}</BaseRateMRP>
      <AgeCoefficient>${v.age_coefficient}</AgeCoefficient>
      <TaxAmount>${fmtNum(v.tax_amount)}</TaxAmount>
    </Vehicle>`).join("");

  const landXml = data.land_items.map((l, i) => `
    <Land number="${i + 1}">
      <Name>${escapeXml(l.name)}</Name>
      <CadastralNumber>${escapeXml(l.cadastral_number)}</CadastralNumber>
      <Region>${escapeXml(l.region)}</Region>
      <Category>${escapeXml(l.category)}</Category>
      <AreaSqm>${l.area_sqm}</AreaSqm>
      <AreaHa>${l.area_ha}</AreaHa>
      <RatePerUnit>${l.rate_per_unit}</RatePerUnit>
      <TaxAmount>${fmtNum(l.tax_amount)}</TaxAmount>
    </Land>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Declaration xmlns="urn:kgd.gov.kz:fno:700:v8"
             FormCode="${FORM_CODE}"
             Year="${data.year}"
             DeclarationType="${declTypeCode}">
  
  <Taxpayer>
    <TIN>${escapeXml(data.tin)}</TIN>
    <Name>${escapeXml(data.taxpayer_name)}</Name>
  </Taxpayer>
  
  <!-- Раздел 1: Налог на имущество -->
  <Section1_Property>
    <ItemsCount>${data.property_items.length}</ItemsCount>
    <TotalAverageValue>${fmtNum(data.property_total_average_value)}</TotalAverageValue>
    <TotalTax>${fmtNum(data.property_tax_total)}</TotalTax>
    <Items>${propertyXml}
    </Items>
  </Section1_Property>
  
  <!-- Раздел 2: Налог на транспорт -->
  <Section2_Vehicles>
    <ItemsCount>${data.vehicle_items.length}</ItemsCount>
    <TotalTax>${fmtNum(data.vehicle_tax_total)}</TotalTax>
    <Items>${vehicleXml}
    </Items>
  </Section2_Vehicles>
  
  <!-- Раздел 3: Земельный налог -->
  <Section3_Land>
    <ItemsCount>${data.land_items.length}</ItemsCount>
    <TotalAreaHa>${data.land_total_area_ha}</TotalAreaHa>
    <TotalTax>${fmtNum(data.land_tax_total)}</TotalTax>
    <Items>${landXml}
    </Items>
  </Section3_Land>
  
  <!-- Итого -->
  <Total>
    <TotalTaxAmount>${fmtNum(data.total_tax)}</TotalTaxAmount>
    <AdvancePaymentsPaid>${fmtNum(data.advance_payments_paid)}</AdvancePaymentsPaid>
    <FinalAmount IsToPay="${data.is_to_pay}">${fmtNum(data.is_to_pay ? data.to_pay : data.to_refund)}</FinalAmount>
  </Total>
  
  <Metadata>
    <GeneratedBy>Finstat.kz</GeneratedBy>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <Version>1.0</Version>
  </Metadata>
</Declaration>`;

  return xml;
}

export const F700_INFO = {
  code: FORM_CODE,
  name: FORM_NAME,
  description: "Декларация по налогам на имущество, транспорт и землю. Сдаётся раз в год до 31 марта.",
  period_type: "year" as const,
  due_day: 31,
  due_month_offset: 3,
  rate_info: "Имущество — 1.5% от среднегодовой остаточной стоимости. Транспорт — по мощности в МРП. Земля — по категории и площади.",
};

// ═══ СПРАВОЧНИКИ ДЛЯ UI ═══

export const VEHICLE_TYPES_LIST = [
  { value: "car", label: "🚗 Легковой автомобиль" },
  { value: "truck", label: "🚛 Грузовой автомобиль" },
  { value: "bus", label: "🚌 Автобус" },
  { value: "motorcycle", label: "🏍 Мотоцикл" },
  { value: "tractor", label: "🚜 Трактор / спецтехника" },
  { value: "special", label: "🚧 Специальное ТС" },
  { value: "water", label: "🚤 Водный транспорт" },
  { value: "air", label: "✈ Воздушный транспорт" },
];

export const LAND_CATEGORIES_LIST = [
  { value: "agricultural", label: "🌾 Сельхоз. назначения" },
  { value: "settlements", label: "🏘 Земли населённых пунктов" },
  { value: "industrial", label: "🏭 Промышленность" },
  { value: "special", label: "🛡 Особого назначения" },
  { value: "forest", label: "🌲 Лесной фонд" },
  { value: "water", label: "💧 Водный фонд" },
  { value: "reserve", label: "📋 Запас (не облагается)" },
];
