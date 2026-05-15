// Хелперы для работы с историей переписки Жанары.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  tool_uses?: any[];
  model_used?: string;
  created_at?: string;
}

export async function loadChatHistory(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.reverse().map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    tool_uses: m.tool_uses,
    model_used: m.model_used,
    created_at: m.created_at,
  }));
}

export async function saveChatMessage(
  supabase: SupabaseClient,
  userId: string,
  message: ChatMessage
): Promise<string | null> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      user_id: userId,
      role: message.role,
      content: message.content,
      tool_uses: message.tool_uses || null,
      model_used: message.model_used || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save chat message:", error);
    return null;
  }

  return data?.id || null;
}

export async function clearChatHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to clear chat history:", error);
    return false;
  }

  return true;
}
