export type LandingVariant = "default" | "light-trust";

export type LandingTheme = {
  variant: LandingVariant;
  /** Force light CSS theme (no dark toggle emphasis) */
  preferLight: boolean;
  gradient: string;
  gradientText: string;
  accent: string;
  accent2: string;
  heroBadge: { bg: string; border: string; color: string };
  ocrBadge: { bg: string; border: string; color: string };
  ocrHeadlineGradient: string;
  ocrCompareBg: string;
  ocrCompareLabel: string;
  aiBlock: { bg: string; border: string; label: string };
  hrBadge: { bg: string; border: string; color: string };
  hrHeadlineGradient: string;
  hrFlowBg: string;
  ctaGradient: string;
  ctaButtonText: string;
  featureColors: string[];
  stepColors: [string, string, string];
};

const DEFAULT_FEATURE_COLORS = [
  "#6366F1", "#8B5CF6", "#F59E0B", "#EC4899", "#10B981", "#3B82F6", "#A855F7", "#F97316", "#06B6D4",
];

export function getLandingTheme(variant: LandingVariant): LandingTheme {
  if (variant === "light-trust") {
    const teal = "#0F766E";
    const mint = "#14B8A6";
    return {
      variant,
      preferLight: true,
      gradient: `linear-gradient(135deg, ${teal}, ${mint})`,
      gradientText: `linear-gradient(135deg, ${teal}, ${mint})`,
      accent: teal,
      accent2: mint,
      heroBadge: { bg: "#CCFBF1", border: `${mint}50`, color: teal },
      ocrBadge: { bg: "#CCFBF1", border: `${mint}50`, color: teal },
      ocrHeadlineGradient: `linear-gradient(135deg, ${teal}, ${mint})`,
      ocrCompareBg: `linear-gradient(135deg, ${teal}10, ${mint}10)`,
      ocrCompareLabel: teal,
      aiBlock: { bg: `linear-gradient(135deg, ${teal}10, ${mint}10)`, border: `${teal}35`, label: teal },
      hrBadge: { bg: "#D1FAE5", border: "#10B98145", color: "#059669" },
      hrHeadlineGradient: "linear-gradient(135deg, #059669, #0D9488)",
      hrFlowBg: "linear-gradient(135deg, #10B98112, #0D948812)",
      ctaGradient: `linear-gradient(135deg, ${teal}, ${mint})`,
      ctaButtonText: teal,
      featureColors: [teal, "#0D9488", "#0891B2", "#059669", "#10B981", "#0284C7", "#0F766E", "#CA8A04", "#64748B"],
      stepColors: [teal, mint, "#10B981"],
    };
  }

  return {
    variant: "default",
    preferLight: false,
    gradient: "linear-gradient(135deg, #6366F1, #A855F7)",
    gradientText: "linear-gradient(135deg, #6366F1, #A855F7)",
    accent: "#6366F1",
    accent2: "#A855F7",
    heroBadge: { bg: "#F59E0B15", border: "#F59E0B30", color: "#F59E0B" },
    ocrBadge: { bg: "#A855F715", border: "#A855F730", color: "#A855F7" },
    ocrHeadlineGradient: "linear-gradient(135deg, #A855F7, #EC4899)",
    ocrCompareBg: "linear-gradient(135deg, #A855F710, #6366F110)",
    ocrCompareLabel: "#A855F7",
    aiBlock: { bg: "linear-gradient(135deg, #6366F110, #A855F710)", border: "#A855F730", label: "#A855F7" },
    hrBadge: { bg: "#10B98115", border: "#10B98140", color: "#10B981" },
    hrHeadlineGradient: "linear-gradient(135deg, #10B981, #06B6D4)",
    hrFlowBg: "linear-gradient(135deg, #10B98110, #06B6D410)",
    ctaGradient: "linear-gradient(135deg, #6366F1, #A855F7)",
    ctaButtonText: "#6366F1",
    featureColors: DEFAULT_FEATURE_COLORS,
    stepColors: ["#A855F7", "#6366F1", "#10B981"],
  };
}
