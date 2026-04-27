import type { BidMaterialLine } from "@/types/bid";

export type BathroomShowcaseSlot =
  | "floor"
  | "shower"
  | "vanity"
  | "faucet"
  | "lighting"
  | "toilet"
  | "mirror"
  | "other";

const SLOT_ORDER: Record<BathroomShowcaseSlot, number> = {
  floor: 0,
  shower: 1,
  vanity: 2,
  faucet: 3,
  lighting: 4,
  toilet: 5,
  mirror: 6,
  other: 7,
};

/**
 * Groups a quote line into a homeowner-facing “main feature” bucket for cards and sorting.
 */
export function bathroomShowcaseSlotForLine(line: BidMaterialLine): BathroomShowcaseSlot {
  const t = `${line.name} ${line.notes ?? ""}`.toLowerCase();

  if (/\btoilet\b|\bwater\s*closet\b|\bwc\b/i.test(t) && !/\bvanity\b/i.test(t)) {
    return "toilet";
  }
  if (
    /\b(sconce|pendant|chandelier|vanity\s*light|bath\s*light|ceiling\s*light|recessed\s*light|light\s*fixture|led\s*mirror)\b/i.test(
      t,
    )
  ) {
    return "lighting";
  }
  if (/\bmedicine\s*cabinet\b|\b(led\s+)?mirror\b|\bframed\s*mirror\b/i.test(t) && !/\bvanity\s+cabinet\b/i.test(t)) {
    return "mirror";
  }
  if (
    /\b(lavatory|bathroom)\s+faucet\b|\bshower\s+(head|system|trim|valve)\b|\bmixing\s+valve\b|\btrim\s+kit\b/i.test(
      t,
    ) &&
    !/\bvanity\s+cabinet\b/i.test(t)
  ) {
    return "faucet";
  }
  if (
    /\bvanity\b/i.test(t) &&
    !/\bvanity\s+light\b/i.test(t) &&
    (/\bcabinet\b|\bcombo\b|\bintegrated\b|\bdouble\s+sink\b/i.test(t) || /\bvanity\s+(cabinet|unit)\b/i.test(t))
  ) {
    return "vanity";
  }
  if (
    /\b(shower|tub|tile|pan|enclosure|glass|schluter|waterproof|backer|membrane|surround)\b/i.test(t) ||
    line.trade === "tile"
  ) {
    return "shower";
  }
  if (/\b(floor|flooring)\b/i.test(t) && /\b(tile|porcelain|ceramic|lvp|vinyl|plank)\b/i.test(t)) {
    return "floor";
  }
  if (line.trade === "flooring" || (/\bfloor\b/i.test(t) && /\b(tile|porcelain|ceramic)\b/i.test(t))) {
    return "floor";
  }
  return "other";
}

export function bathroomShowcaseSlotLabel(slot: BathroomShowcaseSlot): string {
  switch (slot) {
    case "floor":
      return "Floor";
    case "shower":
      return "Shower & tile";
    case "vanity":
      return "Vanity";
    case "faucet":
      return "Faucet & shower trim";
    case "lighting":
      return "Lighting";
    case "toilet":
      return "Toilet";
    case "mirror":
      return "Mirror";
    default:
      return "Materials";
  }
}

export function bathroomShowcaseSortKey(line: BidMaterialLine): number {
  return SLOT_ORDER[bathroomShowcaseSlotForLine(line)] ?? 99;
}
