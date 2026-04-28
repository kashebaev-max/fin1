"use client";

// Карточка подтверждения AI-действия.
// Совместима с новым интерфейсом AIAction (поля risk, category).
// Используется как самостоятельный компонент или встроен в JanaraSidePanel.

import { useState } from "react";
import type { AIAction } from "@/lib/ai-actions";

interface ToolUseInput {
  id: string;
  name: string;
  input: any;
}

interface Props {
  // Поддерживаем оба варианта вызова — старый и новый
  action?: AIAction;           // старый стиль: передавалось целое действие
  toolUse?: ToolUseInput;      // новый стиль: tool_use от Claude
  parameters?: Record<string, any>; // параметры (для старого стиля)
  onConfirm: (params?: any) => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const RISK_STYLES = {
  low:    { bg: "#10B98115", border: "#10B981", text: "#10B981", label: "🟢 Безопасно", icon: "✓" },
  medium: { bg: "#F59E0B15", border: "#F59E0B", text: "#F59E0B", label: "🟡 Внимание",  icon: "⚠" },
  high:   { bg: "#EF444415", border: "#EF4444", text: "#EF4444", label: "🔴 Риск",       icon: "⚠⚠" },
};

const CATEGORY_LABELS: Record<string, string> = {
  "Контрагенты": "👥 Контрагенты",
  "Номенклатура": "📦 Номенклатура",
  "Кадры": "👤 Кадры",
  "Бухгалтерия": "📒 Бухгалтерия",
  "Продажи": "📋 Продажи",
  "ОС": "🏢 Основные средства",
  "Документы": "📝 Документы",
  "Финансы": "💰 Финансы",
};

export default function ActionConfirmCard({
  action,
  toolUse,
  parameters,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const [doubleConfirm, setDoubleConfirm] = useState(false);

  // Определяем источник данных: либо action, либо tool_use
  const actionKey = action?.key || toolUse?.name || "unknown";
  const actionName = action?.name || toolUse?.name || "Действие";
  const actionDescription = action?.description || "";
  const actionIcon = action?.icon || "🤖";
  const actionCategory = action?.category || "";
  const actionRisk = action?.risk || "medium";
  const params = parameters || toolUse?.input || {};

  const risk = RISK_STYLES[actionRisk] || RISK_STYLES.medium;
  const categoryLabel = CATEGORY_LABELS[actionCategory] || actionCategory;

  // Преобразуем параметры в человекочитаемый список
  const paramsList = Object.entries(params).map(([key, val]) => {
    const paramDef = action?.params?.find(p => p.name === key);
    return {
      label: paramDef?.description || key,
      value: typeof val === "number" ? val.toLocaleString("ru-RU") : String(val ?? ""),
    };
  });

  async function handleConfirm() {
    if (actionRisk === "high" && !doubleConfirm) {
      setDoubleConfirm(true);
      return;
    }
    await onConfirm(params);
  }

  return (
    <div style={{
      background: "var(--card)",
      border: `1px solid ${risk.border}40`,
      borderLeft: `3px solid ${risk.border}`,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
    }}>
      {/* Шапка */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{actionIcon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{actionName}</div>
          {actionDescription && (
            <div style={{ fontSize: 10, color: "var(--t3)" }}>{actionDescription}</div>
          )}
          {categoryLabel && (
            <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 2 }}>{categoryLabel}</div>
          )}
        </div>
        <span style={{
          fontSize: 9, fontWeight: 600,
          padding: "3px 7px", borderRadius: 4,
          background: risk.bg, color: risk.text,
        }}>
          {risk.label}
        </span>
      </div>

      {/* Параметры */}
      {paramsList.length > 0 && (
        <div style={{
          background: "var(--bg)",
          borderRadius: 6,
          padding: 8,
          fontSize: 11,
          color: "var(--t2)",
          marginBottom: 8,
        }}>
          {paramsList.map((p, idx) => (
            <div key={idx} style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "3px 0",
              borderBottom: idx < paramsList.length - 1 ? "1px solid var(--brd)" : "none",
            }}>
              <span style={{ color: "var(--t3)" }}>{p.label}:</span>
              <span style={{ fontWeight: 600, marginLeft: 8, textAlign: "right", wordBreak: "break-all" }}>
                {p.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Двойное подтверждение для high-risk */}
      {actionRisk === "high" && doubleConfirm && (
        <div style={{
          background: "#EF444415",
          border: "1px solid #EF444440",
          borderRadius: 6,
          padding: 8,
          fontSize: 11,
          color: "#EF4444",
          marginBottom: 8,
          fontWeight: 600,
        }}>
          ⚠⚠ Это действие с высоким риском. Подтвердите ещё раз.
        </div>
      )}

      {/* Кнопки */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleConfirm} disabled={loading}
          style={{
            flex: 1, padding: "8px", borderRadius: 8, border: "none",
            background: actionRisk === "high" && doubleConfirm
              ? "linear-gradient(135deg, #EF4444, #DC2626)"
              : "linear-gradient(135deg, #10B981, #059669)",
            color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}>
          {loading ? "..." : actionRisk === "high" && doubleConfirm ? "✓✓ Точно выполнить" : "✓ Выполнить"}
        </button>
        <button onClick={onCancel} disabled={loading}
          style={{
            flex: 1, padding: "8px", borderRadius: 8,
            background: "var(--card)", border: "1px solid var(--brd)",
            color: "var(--t2)", fontSize: 12, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}>
          ✗ Отменить
        </button>
      </div>
    </div>
  );
}
