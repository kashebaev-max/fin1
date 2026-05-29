"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import JanaraSidePanel from "./JanaraSidePanel";
import { getModuleKeyFromPath, getModuleContext } from "@/lib/module-contexts";

export default function JanaraButton() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Не показывать на странице AI (там и так чат)
  if (pathname === "/dashboard/ai") return null;

  const moduleKey = getModuleKeyFromPath(pathname);
  const ctx = getModuleContext(moduleKey);

  return (
    <>
      {/* Плавающая кнопка */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="cursor-pointer border-none flex items-center gap-2 transition-all"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "linear-gradient(135deg, #A855F7, #6366F1)",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: 28,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(168, 85, 247, 0.4)",
            zIndex: 40,
          }}
          title={ctx ? `Спросить Жанару про ${ctx.name}` : "Спросить Жанару"}>
          <span style={{ fontSize: 18 }}>✦</span>
          <span>Спросить Жанару</span>
        </button>
      )}

      {/* Выезжающая панель */}
      {open && <JanaraSidePanel onClose={() => setOpen(false)} moduleKey={moduleKey} />}
    </>
  );
}
