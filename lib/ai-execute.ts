// Помощник выполнения tool_use вызовов от Жанары на фронте.
// Принимает tool_use → запускает executor из ai-actions.ts → возвращает результат.

import type { SupabaseClient } from "@supabase/supabase-js";
import { findAction } from "@/lib/ai-actions";

export interface ToolUse {
  id: string;
  name: string;       // ключ действия (create_counterparty и т.д.)
  input: any;         // параметры
}

export interface ToolResult {
  tool_use_id: string;
  content: string;    // текстовый результат для Жанары
  success: boolean;
  data?: any;
}

// Выполнение одного tool_use
export async function executeToolUse(
  supabase: SupabaseClient,
  userId: string,
  toolUse: ToolUse
): Promise<ToolResult> {
  const action = findAction(toolUse.name);

  if (!action) {
    return {
      tool_use_id: toolUse.id,
      content: `❌ Действие "${toolUse.name}" не найдено в системе.`,
      success: false,
    };
  }

  try {
    const result = await action.executor(supabase, userId, toolUse.input);

    return {
      tool_use_id: toolUse.id,
      content: result.success
        ? `${result.message}${result.data ? ` (ID: ${result.data.id?.slice(0, 8)})` : ""}`
        : `❌ ${result.message}`,
      success: result.success,
      data: result.data,
    };
  } catch (err: any) {
    return {
      tool_use_id: toolUse.id,
      content: `❌ Ошибка выполнения: ${err.message || String(err)}`,
      success: false,
    };
  }
}

// Выполнение нескольких tool_use одновременно
export async function executeAllTools(
  supabase: SupabaseClient,
  userId: string,
  toolUses: ToolUse[]
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const tu of toolUses) {
    const result = await executeToolUse(supabase, userId, tu);
    results.push(result);
  }

  return results;
}

// Преобразование результатов в формат для отправки обратно Жанаре
export function buildToolResultsMessage(toolUses: ToolUse[], results: ToolResult[]) {
  return {
    role: "user" as const,
    content: results.map(r => ({
      type: "tool_result" as const,
      tool_use_id: r.tool_use_id,
      content: r.content,
    })),
  };
}

// Описание действия по ключу для UI
export function describeActionForUI(toolUse: ToolUse): {
  icon: string;
  title: string;
  description: string;
  paramsList: { label: string; value: string }[];
  risk: "low" | "medium" | "high";
} {
  const action = findAction(toolUse.name);
  if (!action) {
    return {
      icon: "❓",
      title: toolUse.name,
      description: "Неизвестное действие",
      paramsList: [],
      risk: "medium",
    };
  }

  // Параметры в человекочитаемом виде
  const paramsList = Object.entries(toolUse.input || {}).map(([key, val]) => {
    const paramDef = action.params.find(p => p.name === key);
    return {
      label: paramDef?.description || key,
      value: typeof val === "number" ? val.toLocaleString("ru-RU") : String(val),
    };
  });

  return {
    icon: action.icon,
    title: action.name,
    description: action.description,
    paramsList,
    risk: action.risk,
  };
}
