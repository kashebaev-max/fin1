"use client";

// Лёгкие SVG-графики без внешних зависимостей.
// Поддерживают темы, адаптивные размеры, цветовые палитры.

import { useState, useMemo } from "react";

// ═══ Утилиты ═══

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return Math.round(n).toLocaleString("ru-RU");
}

function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

const PALETTE = [
  "#6366F1", "#10B981", "#F59E0B", "#EC4899", "#3B82F6",
  "#A855F7", "#EF4444", "#14B8A6", "#F97316", "#8B5CF6",
  "#0EA5E9", "#84CC16", "#DC2626", "#7C3AED", "#06B6D4",
];

// ═══ ChartCard ═══
// Контейнер для графика с заголовком и легендой

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
  legend?: { label: string; color: string }[];
  badge?: { text: string; color: string };
}

export function ChartCard({ title, subtitle, children, height = 280, legend, badge }: ChartCardProps) {
  return (
    <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-bold">{title}</div>
          {subtitle && <div className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>{subtitle}</div>}
        </div>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: badge.color + "20", color: badge.color }}>
            {badge.text}
          </span>
        )}
      </div>

      <div style={{ height }}>{children}</div>

      {legend && legend.length > 0 && (
        <div className="flex gap-3 flex-wrap mt-3 pt-3" style={{ borderTop: "1px solid var(--brd)" }}>
          {legend.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
              <span className="text-[10px]" style={{ color: "var(--t3)" }}>{l.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ BarChart ═══
// Столбчатая диаграмма

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  formatValue?: (v: number) => string;
  height?: number;
  horizontal?: boolean;
  showValues?: boolean;
}

export function BarChart({ data, formatValue = fmtMoney, height = 240, horizontal = false, showValues = true }: BarChartProps) {
  if (data.length === 0) return <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>Нет данных</div>;

  const max = Math.max(...data.map(d => d.value), 0);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;

  if (horizontal) {
    // Горизонтальная версия - удобно для топ-10 чего-то
    return (
      <div style={{ height, overflow: "auto" }}>
        <div className="flex flex-col gap-1.5">
          {data.map((d, i) => {
            const w = max > 0 ? (d.value / max) * 100 : 0;
            const color = d.color || PALETTE[i % PALETTE.length];
            return (
              <div key={i}>
                <div className="flex justify-between mb-0.5 items-end">
                  <span className="text-[10px] truncate" style={{ color: "var(--t2)", maxWidth: "70%" }}>{d.label}</span>
                  {showValues && <span className="text-[10px] font-bold" style={{ color }}>{formatValue(d.value)}</span>}
                </div>
                <div style={{ height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${w}%`,
                    background: color,
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Вертикальная версия
  const barWidth = 100 / data.length;

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 100`} preserveAspectRatio="none">
      {/* Сетка */}
      {[0, 25, 50, 75, 100].map(y => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--brd)" strokeWidth="0.1" opacity="0.5" />
      ))}

      {data.map((d, i) => {
        const h = (Math.abs(d.value) / range) * 80;
        const y = d.value >= 0 ? (max / range) * 80 - h : (max / range) * 80;
        const color = d.color || PALETTE[i % PALETTE.length];

        return (
          <g key={i}>
            <rect
              x={i * barWidth + 1}
              y={y + 5}
              width={barWidth - 2}
              height={h}
              fill={color}
              opacity="0.9"
              rx="0.5"
            >
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

// Подписи под BarChart (отдельно — потому что viewBox другой)
export function BarChartLabels({ labels }: { labels: string[] }) {
  return (
    <div className="flex justify-around mt-1" style={{ paddingLeft: 4, paddingRight: 4 }}>
      {labels.map((l, i) => (
        <div key={i} className="text-[9px] text-center" style={{ color: "var(--t3)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</div>
      ))}
    </div>
  );
}

// ═══ LineChart ═══
// Линейный график (для трендов)

interface LineChartProps {
  data: { label: string; value: number }[];
  color?: string;
  formatValue?: (v: number) => string;
  height?: number;
  smooth?: boolean;
  showArea?: boolean;
  compareData?: { label: string; value: number }[]; // вторая линия для сравнения
  compareColor?: string;
}

export function LineChart({
  data, color = "#6366F1", formatValue = fmtMoney, height = 240,
  smooth = true, showArea = true, compareData, compareColor = "#10B981"
}: LineChartProps) {
  if (data.length === 0) return <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>Нет данных</div>;

  const allValues = [...data.map(d => d.value), ...(compareData?.map(d => d.value) || [])];
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const range = max - min || 1;

  function pointsToPath(arr: { value: number }[]): string {
    if (arr.length === 0) return "";
    const points = arr.map((d, i) => {
      const x = (i / Math.max(arr.length - 1, 1)) * 100;
      const y = 95 - ((d.value - min) / range) * 85;
      return [x, y];
    });

    if (!smooth || points.length < 2) {
      return points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
    }

    // Плавная кривая (catmull-rom -> bezier)
    let path = `M${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return path;
  }

  const mainPath = pointsToPath(data);
  const comparePath = compareData ? pointsToPath(compareData) : "";

  // Area path (для заливки под линией)
  const mainAreaPath = mainPath ? `${mainPath} L100,100 L0,100 Z` : "";

  return (
    <svg width="100%" height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      {/* Сетка */}
      {[10, 30, 50, 70, 90].map(y => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--brd)" strokeWidth="0.15" opacity="0.4" />
      ))}

      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {showArea && mainAreaPath && (
        <path d={mainAreaPath} fill="url(#areaGradient)" />
      )}

      {comparePath && (
        <path d={comparePath} fill="none" stroke={compareColor} strokeWidth="0.5" strokeDasharray="1,1" opacity="0.7" vectorEffect="non-scaling-stroke" />
      )}

      <path d={mainPath} fill="none" stroke={color} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />

      {/* Точки на линии */}
      {data.map((d, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * 100;
        const y = 95 - ((d.value - min) / range) * 85;
        return (
          <circle key={i} cx={x} cy={y} r="0.8" fill={color} vectorEffect="non-scaling-stroke">
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

// ═══ PieChart / DonutChart ═══

interface PieChartProps {
  data: { label: string; value: number; color?: string }[];
  formatValue?: (v: number) => string;
  size?: number;
  donut?: boolean;
  showLegend?: boolean;
}

export function PieChart({ data, formatValue = fmtMoney, size = 220, donut = true, showLegend = true }: PieChartProps) {
  if (data.length === 0) return <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>Нет данных</div>;

  const total = data.reduce((a, d) => a + d.value, 0);
  if (total <= 0) return <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>Все значения равны нулю</div>;

  const cx = 50, cy = 50;
  const r = donut ? 35 : 40;
  const innerR = donut ? 22 : 0;

  let angle = -90; // начинаем сверху
  const segments = data.map((d, i) => {
    const portion = d.value / total;
    const segAngle = portion * 360;
    const startAngle = angle;
    const endAngle = angle + segAngle;
    angle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = segAngle > 180 ? 1 : 0;

    let path: string;
    if (donut) {
      const ix1 = cx + innerR * Math.cos(endRad);
      const iy1 = cy + innerR * Math.sin(endRad);
      const ix2 = cx + innerR * Math.cos(startRad);
      const iy2 = cy + innerR * Math.sin(startRad);
      path = `M${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} L${ix1},${iy1} A${innerR},${innerR} 0 ${largeArc} 0 ${ix2},${iy2} Z`;
    } else {
      path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
    }

    return {
      ...d,
      path,
      portion,
      color: d.color || PALETTE[i % PALETTE.length],
    };
  });

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg width={size} height={size} viewBox="0 0 100 100">
        {segments.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} opacity="0.92">
            <title>{`${s.label}: ${formatValue(s.value)} (${(s.portion * 100).toFixed(1)}%)`}</title>
          </path>
        ))}
        {donut && (
          <text x="50" y="52" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--t1)">
            {formatValue(total)}
          </text>
        )}
      </svg>

      {showLegend && (
        <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
          {segments.slice(0, 8).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ color: "var(--t2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              <span style={{ color: "var(--t3)" }}>{(s.portion * 100).toFixed(0)}%</span>
              <span style={{ color: s.color, fontWeight: 600 }}>{formatValue(s.value)}</span>
            </div>
          ))}
          {segments.length > 8 && (
            <div className="text-[10px]" style={{ color: "var(--t3)" }}>+ ещё {segments.length - 8}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══ SparkLine ═══
// Маленький мини-график для KPI-карточек

interface SparkLineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}

export function SparkLine({ data, color = "#6366F1", height = 30, width = 80 }: SparkLineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 90 - 5;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ═══ HeatmapGrid ═══
// Тепловая карта (например, активность по дням)

interface HeatmapProps {
  data: { date: string; value: number }[];
  daysCount?: number;
  formatValue?: (v: number) => string;
}

export function HeatmapGrid({ data, daysCount = 30, formatValue = fmtNumber }: HeatmapProps) {
  // data: массив за последние daysCount дней
  if (data.length === 0) return <div className="text-center py-12 text-xs" style={{ color: "var(--t3)" }}>Нет данных</div>;

  const max = Math.max(...data.map(d => d.value), 1);

  function intensity(v: number): string {
    const ratio = v / max;
    if (ratio === 0) return "var(--brd)";
    const opacity = Math.max(0.15, ratio);
    return `rgba(99, 102, 241, ${opacity})`;
  }

  // Группируем по неделям
  const days = data.slice(-daysCount);

  return (
    <div className="flex gap-0.5 flex-wrap">
      {days.map((d, i) => (
        <div
          key={i}
          title={`${d.date}: ${formatValue(d.value)}`}
          style={{
            width: 14,
            height: 14,
            borderRadius: 2,
            background: intensity(d.value),
          }}
        />
      ))}
    </div>
  );
}

// ═══ ProgressBar ═══
// Прогресс-бар с подписью

interface ProgressBarProps {
  current: number;
  target: number;
  label?: string;
  color?: string;
  formatValue?: (v: number) => string;
  showPercent?: boolean;
}

export function ProgressBar({ current, target, label, color = "#6366F1", formatValue = fmtMoney, showPercent = true }: ProgressBarProps) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const barColor = pct >= 100 ? "#10B981" : pct >= 70 ? color : pct >= 30 ? "#F59E0B" : "#EF4444";

  return (
    <div>
      {label && (
        <div className="flex justify-between mb-1">
          <span className="text-[11px]" style={{ color: "var(--t2)" }}>{label}</span>
          <span className="text-[11px] font-bold" style={{ color: barColor }}>
            {formatValue(current)} / {formatValue(target)} {showPercent && `(${pct.toFixed(0)}%)`}
          </span>
        </div>
      )}
      <div style={{ height: 8, background: "var(--bg)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 4, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

// ═══ KPICard ═══
// Универсальная KPI-карточка с трендом

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: number; // в процентах
  trendLabel?: string; // "vs прошлый месяц"
  sparkData?: number[];
  color?: string;
  icon?: string;
}

export function KPICard({ label, value, unit, trend, trendLabel, sparkData, color = "#6366F1", icon }: KPICardProps) {
  const trendColor = trend === undefined ? "var(--t3)" : trend >= 0 ? "#10B981" : "#EF4444";
  const trendIcon = trend === undefined ? "" : trend >= 0 ? "▲" : "▼";

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px]" style={{ color: "var(--t3)" }}>
          {icon && <span style={{ marginRight: 4 }}>{icon}</span>}
          {label}
        </div>
        {sparkData && sparkData.length >= 2 && <SparkLine data={sparkData} color={color} />}
      </div>
      <div className="flex items-baseline gap-1">
        <div className="text-xl font-bold" style={{ color }}>{value}</div>
        {unit && <div className="text-[11px]" style={{ color: "var(--t3)" }}>{unit}</div>}
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] font-bold" style={{ color: trendColor }}>{trendIcon} {Math.abs(trend).toFixed(1)}%</span>
          {trendLabel && <span className="text-[10px]" style={{ color: "var(--t3)" }}>{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
