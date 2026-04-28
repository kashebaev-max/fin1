"use client";

import { useState } from "react";
import type { AIAction } from "@/lib/ai-actions";

interface Props {
  action: AIAction;
  onConfirm: () => Promise<void>;
  onReject: () => void;
  executed?: boolean;
  result?: { success: boolean; message: string } | null;
}

const RISK_STYLES: Record<string, { color: string; label: string; emoji: string }> = {
  low: { color: "#10B981", label: "Низкий риск", emoji: "✅" },
  medium: { color: "#F59E0B", label: "Средний риск", emoji: "⚠" },
  high: { color: "#EF4444", label: "Высокий риск", emoji: "🔴" },
};

const ACTION_LABELS: Record<string, string> = {
  create_journal_entry: "Бухгалтерская проводка",
  create_invoice: "Создание счёта",
  create_payment: "Создание платежа",
  create_counterparty: "Добавление контрагента",
  create_employee_payment: "Выплата сотруднику",
  mark_paid: "Отметка об оплате",
  dismiss_notification: "Скрытие уведомления",
  run_depreciation: "Начисление амортизации",
  create_recurring_payment: "Регулярный платёж",
};

export default function ActionConfirmCard({ action, onConfirm, onReject, executed, result }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [doubleConfirm, setDoubleConfirm] = useState(false);

  const risk = RISK_STYLES[action.riskLevel] || RISK_STYLES.medium;
  const actionLabel = ACTION_LABELS[action.type] || action.type;

  async function handleConfirm() {
    if (action.riskLevel === "high" && !doubleConfirm) {
      setDoubleConfirm(true);
      return;
    }
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  }

  // Если уже выполнено — показываем результат
  if (executed && result) {
    return (
      <div className="rounded-xl p-3" style={{
        background: result.success ? "#10B98115" : "#EF444415",
        border: `1px solid ${result.success ? "#10B98140" : "#EF444440"}`,
        borderLeft: `3px solid ${result.success ? "#10B981" : "#EF4444"}`,
      }}>
        <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: result.success ? "#10B981" : "#EF4444" }}>
          <span>{result.success ? "✅" : "❌"}</span>
          <span>{result.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-3 my-2" style={{
      background: "var(--card)",
      border: `1px solid ${risk.color}40`,
      borderLeft: `3px solid ${risk.color}`,
    }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontSize: 14 }}>{risk.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: risk.color }}>
            ✦ Жанара предлагает действие
          </div>
          <div className="text-[10px]" style={{ color: "var(--t3)" }}>
            {actionLabel} · {risk.label}
          </div>
        </div>
      </div>

      <div className="text-[12px] mb-2.5" style={{ color: "var(--t1)", lineHeight: 1.5 }}>
        {action.description}
      </div>

      {/* Раскрываемые детали */}
      <details style={{ marginBottom: 10 }}>
        <summary className="cursor-pointer text-[10px]" style={{ color: "var(--t3)" }}>
          Показать данные →
        </summary>
        <pre style={{
          marginTop: 6,
          padding: 8,
          background: "var(--bg)",
          borderRadius: 6,
          fontSize: 10,
          overflow: "auto",
          maxHeight: 200,
          color: "var(--t2)",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
        }}>{JSON.stringify(action.payload, null, 2)}</pre>
      </details>

      {doubleConfirm && action.riskLevel === "high" && (
        <div className="rounded-lg p-2 mb-2" style={{ background: "#EF444420", border: "1px solid #EF444460" }}>
          <div className="text-[11px] font-bold mb-1" style={{ color: "#EF4444" }}>⚠ Высокий риск</div>
          <div className="text-[10px]" style={{ color: "var(--t2)" }}>
            Это действие может затронуть много данных или существенно повлиять на учёт. Точно подтверждаете?
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="cursor-pointer border-none rounded-lg flex-1 font-semibold"
          style={{
            padding: "7px 12px",
            background: doubleConfirm ? "#EF4444" : risk.color,
            color: "#fff",
            fontSize: 11,
            opacity: confirming ? 0.5 : 1,
          }}>
          {confirming
            ? "Выполняю..."
            : doubleConfirm
              ? "🔴 ДА, ТОЧНО ВЫПОЛНИТЬ"
              : "✓ Подтвердить и выполнить"}
        </button>
        <button
          onClick={onReject}
          disabled={confirming}
          className="cursor-pointer border-none rounded-lg"
          style={{
            padding: "7px 12px",
            background: "transparent",
            color: "var(--t3)",
            fontSize: 11,
            border: "1px solid var(--brd)",
          }}>
          Отмена
        </button>
      </div>
    </div>
  );
}
