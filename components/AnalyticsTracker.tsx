"use client";

// Авто-трекер. Встраивается в layout.tsx и автоматически
// фиксирует каждый просмотр страницы.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    
    // Не отслеживаем технические страницы
    if (pathname.startsWith("/api") || pathname.includes("_next") || pathname === "/auth") return;
    
    // Небольшая задержка чтобы document.title успел установиться
    const timer = setTimeout(() => {
      trackPageView(pathname);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
