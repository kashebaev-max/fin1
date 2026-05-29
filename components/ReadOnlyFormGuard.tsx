"use client";

import { type ReactNode, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useReadOnly } from "@/lib/read-only-context";

/**
 * Перехватывает submit форм и клики по кнопкам сохранения в основной области дашборда.
 * Навигация и billing/subscription не блокируются.
 */
export default function ReadOnlyFormGuard({ children }: { children: ReactNode }) {
  const { isReadOnly, loading, promptSubscribe } = useReadOnly();
  const pathname = usePathname();

  const isExempt =
    pathname.startsWith("/dashboard/subscription") ||
    pathname.startsWith("/dashboard/billing") ||
    pathname.startsWith("/dashboard/admin") ||
    pathname.startsWith("/dashboard/help");

  const handleCapture = useCallback(
    (e: React.SyntheticEvent) => {
      if (loading || !isReadOnly || isExempt) return;

      const target = e.target as HTMLElement;
      if (target.closest("[data-readonly-allow]")) return;

      if (e.type === "submit") {
        e.preventDefault();
        e.stopPropagation();
        promptSubscribe();
        return;
      }

      const btn = target.closest("button");
      if (!btn || btn.disabled) return;
      if (btn.closest("aside")) return;
      if (btn.getAttribute("data-readonly-allow") !== null) return;

      const type = (btn.getAttribute("type") || "submit").toLowerCase();
      if (type === "button") {
        const label = (btn.textContent || "").toLowerCase();
        const isMutate =
          /сохран|созда|добав|удал|провест|оформ|начисл|загруз|импорт|оплат|отправ|подтверд|выполн|списан|приём|принять|зарегистр/.test(
            label
          );
        if (!isMutate) return;
      }

      e.preventDefault();
      e.stopPropagation();
      promptSubscribe();
    },
    [loading, isReadOnly, isExempt, promptSubscribe]
  );

  return (
    <div onSubmitCapture={handleCapture} onClickCapture={handleCapture}>
      {children}
    </div>
  );
}
