import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finstat.kz — Бухгалтерия для бизнеса Казахстана | НК РК 2026",
  description: "Современная ERP-система: бухгалтерия, склад, касса, документы. AI-помощник Жанара. Все расчёты по Налоговому Кодексу РК 2026 (НДС 16%).",
  keywords: "бухгалтерия казахстан, НК РК 2026, ERP казахстан, НДС 16%, онлайн бухгалтерия, finstat.kz",
  authors: [{ name: "Finstat.kz" }],
  alternates: { canonical: "https://finstat.kz" },
  openGraph: {
    title: "Finstat.kz — Бухгалтерия, которой не нужен бухгалтер",
    description: "ERP-система для бизнеса Казахстана. НК РК 2026, AI-помощник Жанара, 12 типов документов.",
    url: "https://finstat.kz",
    siteName: "Finstat.kz",
    locale: "ru_KZ",
    type: "website",
    images: [{ url: "https://finstat.kz/og-image.png", width: 1200, height: 630, alt: "Finstat.kz" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Finstat.kz — Бухгалтерия для бизнеса Казахстана",
    description: "НК РК 2026, AI-помощник Жанара, 12 типов документов.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="dark">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
