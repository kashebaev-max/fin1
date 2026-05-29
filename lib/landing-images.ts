import type { LandingVariant } from "@/lib/landing-theme";

export type LandingImages = {
  hero: string;
  ocr: string;
  zhanara: string;
  payroll: string;
};

export function getLandingImages(variant: LandingVariant): LandingImages {
  const theme = variant === "light-trust" ? "light" : "dark";
  const base = `/landing/${theme}`;
  return {
    hero: `${base}/hero-dashboard.svg`,
    ocr: `${base}/ocr-scanner.svg`,
    zhanara: `${base}/zhanara-chat.svg`,
    payroll: `${base}/payroll.svg`,
  };
}
