"use client";

import { useState } from "react";
import DocumentScanner from "./DocumentScanner";

// Кнопка для запуска сканера. 
// Размещается в layout dashboard (рядом с уведомлениями).

export default function ScannerButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}
        title="Сканировать документ через AI"
        className="cursor-pointer rounded-lg flex items-center gap-1.5"
        style={{
          padding: "6px 12px",
          background: "linear-gradient(135deg, #A855F7, #6366F1)",
          color: "#fff",
          border: "none",
          fontSize: 11,
          fontWeight: 600,
        }}>
        <span style={{ fontSize: 14 }}>📸</span>
        <span className="hidden sm:inline">Сканировать</span>
      </button>

      <DocumentScanner isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
