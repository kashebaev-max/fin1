import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";

export const metadata: Metadata = {
  title: "Превью лендинга — Light Trust | Finstat.kz",
  robots: { index: false, follow: false },
};

export default function LandingV2PreviewPage() {
  return <LandingPage variant="light-trust" showPreviewBanner />;
}
