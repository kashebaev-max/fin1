"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { getSubscriptionInfo, type SubscriptionInfo } from "@/lib/subscription";

type ReadOnlyContextValue = {
  loading: boolean;
  info: SubscriptionInfo | null;
  isReadOnly: boolean;
  isActive: boolean;
  /** Блокирует мутацию и показывает диалог. Возвращает true если можно продолжать. */
  ensureCanWrite: () => boolean;
  promptSubscribe: () => void;
};

const ReadOnlyContext = createContext<ReadOnlyContextValue | null>(null);

export function ReadOnlyProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setInfo(null);
      setLoading(false);
      return;
    }
    const sub = await getSubscriptionInfo(supabase, user.id);
    setInfo(sub);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isReadOnly = info?.is_read_only ?? false;
  const isActive = info?.is_active ?? false;

  const promptSubscribe = useCallback(() => {
    const ok = window.confirm(
      "⛔ Действие недоступно\n\nТестовый период или подписка закончились. Доступен только просмотр данных.\n\nПерейти к оформлению подписки?"
    );
    if (ok) router.push("/dashboard/subscription");
  }, [router]);

  const ensureCanWrite = useCallback(() => {
    if (loading) return false;
    if (!isReadOnly) return true;
    promptSubscribe();
    return false;
  }, [loading, isReadOnly, promptSubscribe]);

  return (
    <ReadOnlyContext.Provider
      value={{ loading, info, isReadOnly, isActive, ensureCanWrite, promptSubscribe }}
    >
      {children}
    </ReadOnlyContext.Provider>
  );
}

export function useReadOnly() {
  const ctx = useContext(ReadOnlyContext);
  if (!ctx) {
    throw new Error("useReadOnly must be used within ReadOnlyProvider");
  }
  return ctx;
}

/** Опционально — для компонентов вне провайдера */
export function useReadOnlyOptional() {
  return useContext(ReadOnlyContext);
}
