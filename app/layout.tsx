import type { Metadata } from "next";
import "./globals.css";
import AnalyticsTracker from "@/components/AnalyticsTracker";

export const metadata: Metadata = {
  title: "Finstat.kz — Единая система ведения бизнеса | Казахстан",
  description: "Единая система ведения бизнеса: продажи, склад, финансы, кадры, налоги и аналитика в одном окне. AI-помощник Жанара. НК РК 2026.",
  keywords: "ведение бизнеса казахстан, ERP казахстан, учёт и CRM, НК РК 2026, finstat.kz, управление бизнесом",
  authors: [{ name: "Finstat.kz" }],
  alternates: { canonical: "https://finstat.kz" },
  openGraph: {
    title: "Finstat.kz — Единая система ведения бизнеса",
    description: "Продажи, склад, финансы, кадры, налоги и аналитика — всё связано. AI Жанара, 60+ модулей, НК РК 2026.",
    url: "https://finstat.kz",
    siteName: "Finstat.kz",
    locale: "ru_KZ",
    type: "website",
    images: [{ url: "https://finstat.kz/og-image.png", width: 1200, height: 630, alt: "Finstat.kz" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Finstat.kz — Единая система ведения бизнеса",
    description: "60+ модулей для бизнеса в Казахстане. НК РК 2026, AI Жанара.",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  );
}
