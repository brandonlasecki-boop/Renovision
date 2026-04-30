export type BathroomStyleId =
  | "spa_retreat"
  | "clean_refresh"
  | "luxury_escape"
  | "bold_modern"
  | "warm_minimalist"
  | "coastal_beach_house";

export type BathroomStyleConfig = {
  id: BathroomStyleId;
  name: string;
  subtitle: string;
  estimateMin: number;
  estimateMax: number;
  materialMin: number;
  materialMax: number;
  laborMin: number;
  laborMax: number;
  fixturesMin: number;
  fixturesMax: number;
  scopeSeed: string;
  /** When true, style appears on /try only for admin viewers until launched. */
  adminOnly?: boolean;
};

export const BATHROOM_STYLES: BathroomStyleConfig[] = [
  {
    id: "spa_retreat",
    name: "Spa Retreat",
    subtitle: "Calm, bright, hotel-inspired",
    /** Broad style anchor for UI + estimator fallback — kept below old “full gut” bands so image estimates bias mid-market. */
    estimateMin: 12000,
    estimateMax: 24000,
    materialMin: 4500,
    materialMax: 9000,
    laborMin: 5500,
    laborMax: 12000,
    fixturesMin: 1500,
    fixturesMax: 4000,
    scopeSeed:
      "spa retreat bathroom with bright tones, natural light feel, hotel-inspired finishes, calming shower tile, and updated shower door/glass hardware finish while keeping the same shower footprint",
  },
  {
    id: "clean_refresh",
    name: "Clean Refresh",
    subtitle: "Simple, modern, budget-conscious",
    estimateMin: 6500,
    estimateMax: 13000,
    materialMin: 2200,
    materialMax: 5000,
    laborMin: 2800,
    laborMax: 6500,
    fixturesMin: 800,
    fixturesMax: 2200,
    scopeSeed: "clean refresh bathroom with simple modern finishes and budget-conscious upgrades",
  },
  {
    id: "luxury_escape",
    name: "Luxury Escape",
    subtitle: "Premium finishes, dramatic upgrade",
    estimateMin: 22000,
    estimateMax: 40000,
    materialMin: 8000,
    materialMax: 15000,
    laborMin: 11000,
    laborMax: 20000,
    fixturesMin: 3200,
    fixturesMax: 7500,
    scopeSeed: "luxury escape bathroom with premium materials, dramatic contrast, and upscale detailing",
  },
  {
    id: "bold_modern",
    name: "Bold Modern",
    subtitle: "Dark accents, sleek fixtures",
    estimateMin: 12000,
    estimateMax: 23000,
    materialMin: 4500,
    materialMax: 9000,
    laborMin: 6000,
    laborMax: 11000,
    fixturesMin: 1500,
    fixturesMax: 4000,
    scopeSeed: "bold modern bathroom with dark accents, sleek fixtures, and sharp contemporary lines",
  },
  {
    id: "warm_minimalist",
    name: "Warm Minimalist",
    subtitle: "Wood tones, soft neutrals",
    estimateMin: 11000,
    estimateMax: 20000,
    materialMin: 4000,
    materialMax: 7500,
    laborMin: 5500,
    laborMax: 10000,
    fixturesMin: 1500,
    fixturesMax: 3800,
    scopeSeed: "warm minimalist bathroom with wood tones, soft neutral palette, and clean simple shapes",
  },
  {
    id: "coastal_beach_house",
    name: "Coastal Beach House",
    subtitle: "Bright, airy, beach-inspired (admin preview)",
    estimateMin: 10000,
    estimateMax: 20000,
    materialMin: 3800,
    materialMax: 7500,
    laborMin: 5000,
    laborMax: 9500,
    fixturesMin: 1400,
    fixturesMax: 3500,
    scopeSeed:
      "coastal beach house bathroom with light airy colors, soft blue and sand tones, light wood or white vanity, bright natural-feeling tile, woven textures, and relaxed beach-house character while preserving layout",
    adminOnly: true,
  },
];

export function getBathroomStyleById(id: string): BathroomStyleConfig | null {
  return BATHROOM_STYLES.find((s) => s.id === id) ?? null;
}

/** Styles shown on /try style picker (optionally include admin-only previews). */
export function getTryPageBathroomStyles(options: { includeAdminOnly: boolean }): BathroomStyleConfig[] {
  if (options.includeAdminOnly) return BATHROOM_STYLES;
  return BATHROOM_STYLES.filter((s) => !s.adminOnly);
}

/** DB `selected_style` is usually the style display name; accept id as well. */
export function resolveBathroomStyleIdFromGeneration(stored: string | null | undefined): BathroomStyleId {
  const v = String(stored ?? "").trim();
  if (!v) return "clean_refresh";
  if (getBathroomStyleById(v)) return v as BathroomStyleId;
  const byName = BATHROOM_STYLES.find((s) => s.name === v);
  return byName?.id ?? "clean_refresh";
}
