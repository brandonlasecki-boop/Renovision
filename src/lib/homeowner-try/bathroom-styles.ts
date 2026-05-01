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
    /** Broad style anchor for UI + estimator fallback — mid-market bands with a modest range. */
    estimateMin: 9500,
    estimateMax: 15500,
    materialMin: 3500,
    materialMax: 6500,
    laborMin: 4500,
    laborMax: 7000,
    fixturesMin: 1500,
    fixturesMax: 2000,
    scopeSeed:
      "spa retreat bathroom with bright tones, natural light feel, hotel-inspired finishes, calming shower tile, and updated shower door/glass hardware finish while keeping the same shower footprint",
  },
  {
    id: "clean_refresh",
    name: "Clean Refresh",
    subtitle: "Simple, modern, budget-conscious",
    estimateMin: 4800,
    estimateMax: 7800,
    materialMin: 1700,
    materialMax: 3200,
    laborMin: 2200,
    laborMax: 3400,
    fixturesMin: 900,
    fixturesMax: 1200,
    scopeSeed: "clean refresh bathroom with simple modern finishes and budget-conscious upgrades",
  },
  {
    id: "luxury_escape",
    name: "Luxury Escape",
    subtitle: "Premium finishes, dramatic upgrade",
    estimateMin: 15000,
    estimateMax: 22000,
    materialMin: 5500,
    materialMax: 8500,
    laborMin: 7500,
    laborMax: 10500,
    fixturesMin: 2000,
    fixturesMax: 3000,
    scopeSeed: "luxury escape bathroom with premium materials, dramatic contrast, and upscale detailing",
  },
  {
    id: "bold_modern",
    name: "Bold Modern",
    subtitle: "Dark accents, sleek fixtures",
    estimateMin: 9500,
    estimateMax: 14500,
    materialMin: 3500,
    materialMax: 5500,
    laborMin: 4500,
    laborMax: 6500,
    fixturesMin: 1500,
    fixturesMax: 2500,
    scopeSeed: "bold modern bathroom with dark accents, sleek fixtures, and sharp contemporary lines",
  },
  {
    id: "warm_minimalist",
    name: "Warm Minimalist",
    subtitle: "Wood tones, soft neutrals",
    estimateMin: 8500,
    estimateMax: 13500,
    materialMin: 3200,
    materialMax: 5000,
    laborMin: 4200,
    laborMax: 6000,
    fixturesMin: 1100,
    fixturesMax: 2500,
    scopeSeed: "warm minimalist bathroom with wood tones, soft neutral palette, and clean simple shapes",
  },
  {
    id: "coastal_beach_house",
    name: "Coastal Beach House",
    subtitle: "Bright, airy, beach-inspired",
    estimateMin: 8000,
    estimateMax: 12500,
    materialMin: 3000,
    materialMax: 4800,
    laborMin: 4000,
    laborMax: 5700,
    fixturesMin: 1000,
    fixturesMax: 2000,
    scopeSeed:
      "coastal beach house bathroom with light airy colors, soft blue and sand tones, light wood or white vanity, bright natural-feeling tile, woven textures, and relaxed beach-house character while preserving layout",
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
