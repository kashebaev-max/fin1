"use client";

// Старая страница /dashboard/warehouse удалена.
// Все товары и остатки теперь в /dashboard/nomenclature.
// Этот редирект сохраняет совместимость со старыми ссылками.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WarehouseRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/nomenclature");
  }, [router]);

  return (
    <div className="flex items-center justify-center" style={{ minHeight: 400 }}>
      <div className="text-center">
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔄</div>
        <div className="text-sm font-bold mb-2">Перенаправление...</div>
        <div className="text-[12px]" style={{ color: "var(--t3)" }}>
          Раздел «Склад» объединён с «Номенклатура».
        </div>
      </div>
    </div>
  );
}
