import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinERP — Бухгалтерия для бизнеса Казахстана | НК РК 2026",
  description: "Современная ERP-система: бухгалтерия, склад, касса, банк, кадры, документы. НДС 16%, ИПН, КПН по Налоговому Кодексу РК 2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
