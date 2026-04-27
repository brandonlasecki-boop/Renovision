/**
 * Scores SerpApi product titles against a material line so we don't pick
 * unrelated categories (e.g. vanity sink when the line is vanity lights).
 */

import type { BidMaterialTrade } from "@/types/bid";

export type RetailTitleScoreHint = {
  /** When set for vanity cabinet lines, titles near this width (in.) score higher; tiny vanities score lower. */
  minVanityCabinetWidthInches?: number;
  /** When set, penalize vanity SKUs clearly wider than this (previous vanity size / wall band). */
  maxVanityCabinetWidthInches?: number;
  /** When set, strongly steer away from other trades' SKUs (tile vs vanity, etc.). */
  lineTrade?: BidMaterialTrade;
  /** Shower / wet-area wall tile line — penalize floor-only or wrong-field tile SKUs. */
  showerWallTileOnly?: boolean;
  /**
   * Tub/shower conversion with **field tile on walls** (often with pan) — apply tile-field Serp gates,
   * but do not treat every SKU as wall tile (pans / drains still allowed).
   */
  siteBuiltShowerTileWalls?: boolean;
  /** Bathroom / room field floor tile — penalize wall-only, backsplash-only, or shower-wall SKUs. */
  floorFieldTileOnly?: boolean;
  /** Approximate shower pan/base long side in inches from photo-derived or homeowner-entered measurements. */
  showerBaseTargetLengthInches?: number;
  /** Approximate shower pan/base short side in inches from photo-derived or homeowner-entered measurements. */
  showerBaseTargetWidthInches?: number;
};

type RetailDimensionPair = { lengthInches: number; widthInches: number };

/** Line text is shower (or wet) tile work, not floor tile or pan-only. */
export function inferShowerWallTileOnlyFromLineText(lineText: string): boolean {
  const L = norm(lineText);
  /**
   * Tub-to-shower + new pan + wall tile is a **mixed** scope (pan/base + tile). Do not treat as
   * shower-wall-tile-only for SerpApi — that hard gate would strip shower bases from results.
   */
  if (
    /\b(shower\s+pan|shower\s+base|new\s+pan\b|\bpan\b|receptor)\b/i.test(L) &&
    /\b(tile|tiles|porcelain|ceramic|wall)\b/i.test(L)
  ) {
    return false;
  }
  if (!/\b(tile|tiles|porcelain|ceramic)\b/.test(L)) return false;
  if (!/\b(shower|alcove|wet)\b/.test(L)) {
    /** "Tub-to-shower … tile walls" — `shower` may only appear inside `tub-to-shower`. */
    if (!/\b(tub[\s-]+to[\s-]+shower|shower\s+conversion)\b/i.test(lineText)) return false;
  }
  if (/\b(floor\s+tile|shower\s+floor|flooring|pan\s+only)\b/.test(L)) return false;
  if (/\bwall\b|\bsurround\b|\bniche\b|\benclosure\b|\bwet\s+wall\b|\bshower\s+tile\b/i.test(lineText)) return true;
  if (/\b(tub|shower)\s+wall\b/i.test(lineText)) return true;
  if (/\b(tile\s+walls?|wall\s+tile)\b/i.test(lineText)) return true;
  if (/\bshower\b.*\btile\b|\btile\b.*\bshower\b/i.test(lineText) && !/\bfloor\b/.test(L)) return true;
  return false;
}

/**
 * Tub/shower conversion (or new shower wet area) where the contractor expects **field tile on walls**,
 * often alongside a pan/base. Unlike {@link inferShowerWallTileOnlyFromLineText}, this stays **true**
 * when the line also names a shower pan — so Serp tile-field gates still drop prefab glue-up / surround
 * kits (e.g. wedi wall boards) that are not porcelain/ceramic tile.
 */
export function inferSiteBuiltShowerTileWallLineRetail(lineText: string): boolean {
  const L = norm(lineText);
  if (!/\b(tile|tiles|porcelain|ceramic|mosaic)\b/.test(L)) return false;
  const conversion =
    /\b(tub[\s-]+to[\s-]+shower|tub\s+to\s+shower|shower\s+conversion|convert(?:ing)?\s+(?:the\s+)?(?:tub|bathtub)\s+to)\b/i.test(
      lineText,
    ) || /\bshower\s+conversion\b/i.test(L);
  const showerJob =
    conversion ||
    (/\b(new|replace|install)\b/i.test(L) && /\b(shower|alcove|wet\s*area)\b/i.test(L));
  if (!showerJob) return false;
  const wallTile =
    /\b(tile\s+walls?|wall\s+tile|tile\s+wall|walls?\s+with\s+tile|wet\s+wall|shower\s+wall|shower\s+tile)\b/i.test(
      lineText,
    ) ||
    (/\b(tile|tiles|porcelain|ceramic)\b/i.test(L) && /\bwall\b/i.test(L));
  if (!wallTile) return false;
  return true;
}

/** Room / bathroom floor field tile (not shower walls or backsplash-only lines). */
export function inferFloorFieldTileOnlyFromLineText(lineText: string): boolean {
  const L = norm(lineText);
  if (
    /\b(shower\s+wall|tub\s+surround|wet\s+wall|alcove\s+wall)\b/i.test(lineText) &&
    /\bnot\s+floor\b|\bwalls?\s+only\b|\bwall\s+only\b/i.test(lineText)
  ) {
    return false;
  }
  if (!/\b(tile|tiles|porcelain|ceramic)\b/.test(L)) return false;
  if (/\b(shower\s+wall|tub\s+surround|backsplash|wall\s+tile|wet\s+wall|shower\s+niche)\b/i.test(lineText)) {
    if (!/\bfloor\b/.test(L) && !/\bfloor\s+tile\b/i.test(lineText)) return false;
  }
  if (
    /\bfloor\s+tile\b|\bporcelain\s+floor\b|\bceramic\s+floor\b|\btile\s+for\s+the\s+floor\b|\btile\s+.*\bfloor\b|\bfloor(?:ing)?\b.*\b(tile|tiles|porcelain|ceramic)\b/i.test(
      lineText,
    )
  ) {
    return true;
  }
  if (/\b(bathroom|bath|kitchen|mudroom)\s+floor\b/i.test(lineText) && /\b(tile|tiles|porcelain|ceramic)\b/i.test(L)) {
    return true;
  }
  return false;
}

/**
 * Line is buying **sealant / caulk / silicone** (or tub-tile caulk), not a vanity cabinet.
 * Phrases like "for vanity and shower" mean **where it is used**, not the product category.
 */
export function lineTextImpliesSealantCaulkPrimaryRetail(lineText: string): boolean {
  const L = norm(lineText);
  if (!/\b(sealants?|caulk|silicone|polyseam|kitchen\s+and\s+bath|tub\s+and\s+tile)\b/i.test(L)) {
    return false;
  }
  if (/\b(remove|stripping|strip|demo|tear)\b.*\b(caulk|sealant)\b/i.test(lineText)) return false;
  if (
    /\bvanity\s+cabinet\b|\bvanity\s+combo\b|\binstall\s+(?:the\s+)?(?:new\s+)?(?:bathroom\s+)?vanity\s+cabinet\b/i.test(
      lineText,
    )
  ) {
    return false;
  }
  return true;
}

/** When true, Serp results should be filtered to titles that look like caulk/sealant SKUs. */
export function shouldApplyRetailSealantCaulkTitleHardGate(lineText: string): boolean {
  return lineTextImpliesSealantCaulkPrimaryRetail(lineText);
}

/** Product title looks like a sealant/caulk SKU (not a vanity, toilet, or faucet). */
export function titlePassesRetailSealantCaulkHardGate(productTitle: string): boolean {
  const T = norm(productTitle);
  if (
    /\b(bathroom\s+vanity|bath\s+vanity|vanity\s+cabinet|vanity\s+combo|vanity\s+with\s+sink|sink\s+base|one\s*-?\s*piece\s+toilet|lavatory\s+faucet)\b/i.test(
      T,
    )
  ) {
    return false;
  }
  return /\b(caulk|sealant|silicone|polyseam|lexel|kitchen\s+and\s+bath|tub\s+and\s+tile|latex|waterproof(?:ing)?\s+sealant)\b/i.test(
    T,
  );
}

/**
 * Line is buying a **toilet fixture** (bowl/tank/one-piece), not only wax rings, flappers, or repair kits.
 */
export function lineImpliesToiletFixturePrimaryRetail(lineText: string): boolean {
  const L = norm(lineText);
  if (!/\btoilet\b/i.test(L)) return false;
  if (/\btoilet\s+paper|tp\s+holder|paper\s+holder\b/i.test(L)) return false;

  if (
    /\b(fill\s+valve|flush\s+valve|flapper|wax\s+ring|tank\s+lever|bolt\s+kit|trip\s+lever|toilet\s+handle|toilet\s+seat\s+only|repair\s+kit|tank\s+to\s+bowl|gasket\s+kit|universal\s+repair)\b/i.test(
      L,
    )
  ) {
    if (/\bnew\s+toilet\b|\bcomplete\s+toilet\b|\bwhole\s+toilet\b|\btoilet\s+fixture\b/i.test(L)) {
      return true;
    }
    if (
      /\breplace\s+(?:the\s+)?toilet\b/i.test(L) &&
      !/\breplace\s+toilet\s+(flapper|fill|wax|seat|handle)\b/i.test(L)
    ) {
      return true;
    }
    if (/\b(install|supply\s+and\s+install)\b/i.test(L) && /\bnew\s+toilet\b/i.test(L)) return true;
    return false;
  }

  return /\b(install|supply\s+and\s+install|replace|replacement|remov(?:e|ing)\s+and\s+install|new\s+toilet)\b/i.test(
    L,
  );
}

/** Toilet tank / bowl repair consumables — not a full toilet fixture SKU. */
export function titleLooksLikeToiletRepairOrPartsKit(productTitle: string): boolean {
  const T = norm(productTitle);
  if (!T) return false;
  if (/\b(one[\s-]piece|two[\s-]piece)\s+toilet\b/i.test(T) && !/\brepair\s+kit\b/i.test(T)) return false;
  if (/\bcomplete\s+toilet\b/i.test(T) && !/\brepair\b/i.test(T)) return false;

  return (
    /\brepair\s+kit\b/i.test(T) ||
    /\bcomplete\s+toilet\s+repair\b/i.test(T) ||
    /\btoilet\s+repair\b/i.test(T) ||
    /\b(tank|toilet)\s+(rebuild|service|parts?)\s+kit\b/i.test(T) ||
    /\b(fill|flush)\s+valve\b/i.test(T) ||
    /\bflapper\b/i.test(T) ||
    /\bwax\s+ring(s)?\b/i.test(T) ||
    /\btank\s+lever\b/i.test(T) ||
    /\btrip\s+lever\b/i.test(T) ||
    /\btoilet\s+tank\s+only\b/i.test(T) ||
    (/\buniversal\b/i.test(T) && /\b(toilet|tank)\b/i.test(T) && /\b(kit|gasket|seal|repair)\b/i.test(T))
  );
}

/** Full toilet / bowl+tank style product (not a small-parts kit). */
export function titleLooksLikeToiletFixtureSku(productTitle: string): boolean {
  if (titleLooksLikeToiletRepairOrPartsKit(productTitle)) return false;
  const T = norm(productTitle);
  return (
    /\b(one[\s-]piece|two[\s-]piece|elongated|round\s+front|chair\s+height|comfort\s+height|skirted)\s+toilet\b/i.test(
      T,
    ) ||
    /\btoilet\s*\(?\s*bowl\b/i.test(T) ||
    (/\btoilet\b/i.test(T) &&
      /\b(gpf|gallons\s+per\s+flush|ada|watersense|high\s+efficiency|chair\s+height)\b/i.test(T)) ||
    /\btoilet\s+only\b|\btoilet\s+package\b/i.test(T)
  );
}

export function shouldApplyRetailToiletFixtureTitleHardGate(lineText: string): boolean {
  return lineImpliesToiletFixturePrimaryRetail(lineText);
}

export function titlePassesRetailToiletFixtureHardGate(productTitle: string): boolean {
  return !titleLooksLikeToiletRepairOrPartsKit(productTitle);
}

/**
 * Tub → shower, new shower pan/base, or shower/tub wet shell work — **not** a toilet supply line.
 * Used to drop toilet SKUs from Serp results and to penalize them in title scoring.
 */
export function lineImpliesShowerWetAreaShellRetail(lineText: string): boolean {
  if (lineImpliesToiletFixturePrimaryRetail(lineText)) return false;
  const L = norm(lineText);
  const tubToShower =
    /\b(tub[\s-]+to[\s-]+shower|tub\s+to\s+shower|convert(?:ing)?\s+(?:the\s+)?(?:tub|bathtub)\s+to\s+(?:a\s+)?shower|shower\s+conversion|tub[\s-]*shower\s+conversion)\b/i.test(
      lineText,
    ) || /\bshower\s+conversion\b/i.test(L);
  const panCue =
    /\b(shower\s+pan|shower\s+base|acrylic\s+shower|fiberglass\s+shower|tile[-\s]?ready\s+pan|shower\s+floor|new\s+pan\b|curbed?\s+pan|shower\s+receptor)\b/i.test(
      L,
    );
  const wallCue =
    inferShowerWallTileOnlyFromLineText(lineText) ||
    /\b(tile\s+walls?|shower\s+wall|tub\s+wall|wet\s+wall|shower\s+surround|alcove\s+tile)\b/i.test(lineText);
  if (tubToShower) return true;
  if (panCue && (wallCue || /\btile\b/.test(L) || /\bshower\b/i.test(L))) return true;
  return false;
}

/** Line is likely buying a shower pan/base/receptor or tub-to-shower footprint, not only trim/drain/tile. */
export function lineImpliesShowerPanOrBaseRetail(lineText: string): boolean {
  if (lineImpliesToiletFixturePrimaryRetail(lineText)) return false;
  const L = norm(lineText);
  if (/\b(drain|valve|trim|cartridge|door|glass|enclosure|shower\s+head|faucet)\b/i.test(L)) {
    if (!/\b(shower\s+pan|shower\s+base|receptor|tub[\s-]+to[\s-]+shower|shower\s+conversion)\b/i.test(L)) {
      return false;
    }
  }
  return /\b(shower\s+pan|shower\s+base|shower\s+receptor|shower\s+floor|single\s+threshold\s+shower|tile[-\s]?ready\s+pan|tub[\s-]+to[\s-]+shower|shower\s+conversion)\b/i.test(
    L,
  );
}

/** Serp post-filter: drop full toilet / bowl SKUs when the line is wet shell (pan/tile/tub-to-shower). */
export function shouldApplyRetailShowerWetAreaShellTitleHardGate(lineText: string): boolean {
  return lineImpliesShowerWetAreaShellRetail(lineText);
}

export function titlePassesRetailShowerWetAreaShellHardGate(productTitle: string): boolean {
  if (titleLooksLikeToiletFixtureSku(productTitle)) return false;
  const T = norm(productTitle);
  if (/\b(one[\s-]piece|two[\s-]piece|elongated|round\s+front|comfort\s+height|chair\s+height)\s+toilet\b/i.test(T)) {
    return false;
  }
  if (/\btoilet\s+bowl\b/i.test(T) && !/\brepair\b/i.test(T)) return false;
  if (/\btoilet\b/i.test(T) && /\b(gpf|gallons\s+per\s+flush|ada|watersense)\b/i.test(T)) return false;
  return true;
}

function parseRetailDimensionPairInches(text: string): RetailDimensionPair | undefined {
  const t = text.replace(/\s+/g, " ");
  const m =
    /\b(\d{2,3}(?:\.\d+)?)\s*(?:in\.?|inch(?:es)?|["”])?\s*(?:x|×|by)\s*(\d{2,3}(?:\.\d+)?)\s*(?:in\.?|inch(?:es)?|["”])\b/i.exec(
      t,
    ) ||
    /\b(\d{2,3}(?:\.\d+)?)\s*(?:in\.?|inch(?:es)?|["”])\s*(?:x|×|by)\s*(\d{2,3}(?:\.\d+)?)\b/i.exec(
      t,
    );
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  if (a < 18 || b < 18 || a > 96 || b > 96) return undefined;
  return {
    lengthInches: Math.round(Math.max(a, b)),
    widthInches: Math.round(Math.min(a, b)),
  };
}

function titleLooksLikeShowerBaseOrPanSku(productTitle: string): boolean {
  const T = norm(productTitle);
  if (/\b(tile|tiles|porcelain|ceramic|mosaic|grout|thinset|mortar|membrane)\b/i.test(T)) {
    return false;
  }
  return /\b(shower\s+base|shower\s+pan|shower\s+receptor|single\s+threshold|double\s+threshold|neo[\s-]?angle\s+base|center\s+drain|left\s+drain|right\s+drain)\b/i.test(
    T,
  );
}

export function titlePassesRetailShowerBaseDimensionHardGate(
  productTitle: string,
  hint?: RetailTitleScoreHint,
): boolean {
  const targetL = hint?.showerBaseTargetLengthInches;
  const targetW = hint?.showerBaseTargetWidthInches;
  if (targetL == null || targetW == null) return true;
  if (!titleLooksLikeShowerBaseOrPanSku(productTitle)) return true;
  const dims = parseRetailDimensionPairInches(productTitle);
  if (!dims) return true;

  const productTooLarge = dims.lengthInches > targetL + 2 || dims.widthInches > targetW + 2;
  const productTooSmall = dims.lengthInches < targetL - 6 || dims.widthInches < targetW - 4;
  return !productTooLarge && !productTooSmall;
}

/** SerpApi post-filter: drop titles that are not sellable wall/floor tile when the line is tile-field work. */
export function shouldApplyRetailTileFieldTitleHardGate(
  lineText: string,
  hint?: RetailTitleScoreHint,
): boolean {
  if (
    hint?.showerWallTileOnly === true ||
    hint?.floorFieldTileOnly === true ||
    hint?.siteBuiltShowerTileWalls === true
  ) {
    return true;
  }
  if (inferSiteBuiltShowerTileWallLineRetail(lineText) && !lineImpliesShowerPanOrBaseRetail(lineText)) {
    return true;
  }
  if (hint?.lineTrade === "tile") {
    return (
      inferShowerWallTileOnlyFromLineText(lineText) || inferFloorFieldTileOnlyFromLineText(lineText)
    );
  }
  return false;
}

/**
 * True when the retail title looks like porcelain/ceramic/mosaic tile (not doors, vanities, valves, etc.).
 */
/** One-SKU alcove / solid-surface shower systems (walls + pan) — not field tile + separate pan for “tile walls” scopes. */
export function titleLooksLikeOnePieceWallsAndPanShowerKit(productTitle: string): boolean {
  const T = norm(productTitle);
  if (!T) return false;
  if (/\balcove\s+shower\s+kit\b/i.test(T)) return true;
  if (/\bshower\s+kit\b/i.test(T) && /\b(with\s+walls|walls?\s+and|wall\s+panels?)\b/i.test(T)) return true;
  if (/\bsolid\s+composite\s+stone\b/i.test(T) && /\b(shower|alcove)\b/i.test(T)) return true;
  if (/\bcomposite\s+stone\b/i.test(T) && /\b(alcove\s+)?shower\s+kit\b/i.test(T)) return true;
  if (/\bone[\s-]piece\s+shower\b/i.test(T) && /\b(wall|kit|alcove)\b/i.test(T)) return true;
  return false;
}

export function titlePassesRetailTileFieldHardGate(productTitle: string): boolean {
  const T = norm(productTitle);
  if (!T) return false;

  /** “Subway” as a **tile style** — not the “Subway 32 in. x 60 in. … shower kit” product family name. */
  const subwayLooksLikeBrandNotTileStyle =
    /\bsubway\s+\d{1,3}\s*(?:in\.?|inches|"|'')\s*x\s*\d{1,3}\s*(?:in\.?|inches|"|'')/i.test(T) ||
    (/\bsubway\b/i.test(T) && /\bshower\s+kit\b/i.test(T));
  const hasSubwayTileCue =
    !subwayLooksLikeBrandNotTileStyle &&
    (/\bsubway\s+tile\b/i.test(T) ||
      (/\bsubway\b/i.test(T) && /\b(ceramic|porcelain|mosaic|wall|floor|field)\s+tile\b/i.test(T)));

  const hasTileMaterial =
    /\b(porcelain|ceramic|mosaic|travertine|slate|quartzite|terrazzo|quarry|marble\s+look|stone\s+look|wood\s+look|peel[\s-](?:and|n)[\s-]stick|wall\s+tile|floor\s+tile|field\s+tile|backsplash\s+tile)\b/i.test(
      T,
    ) ||
    hasSubwayTileCue ||
    (/\btiles?\b/i.test(T) &&
      /\b(sq\.?\s*ft|sqft|case|carton|pieces?\s+per|coverage|per\s+case|sheet|mesh[\s-]mount)\b/i.test(T));

  if (!hasTileMaterial) return false;

  if (titleLooksLikeOnePieceWallsAndPanShowerKit(productTitle)) return false;

  const blockedNonTile =
    /\b(shower\s+door|shower\s+doors|frameless\s+glass|glass\s+enclosure|bypass\s+door|neo[\s-]?angle\s+door)\b/i.test(
      T,
    ) ||
    /\b(bathroom\s+vanity|vanity\s+cabinet|vanity\s+combo|one[\s-]piece\s+toilet|toilet\s+tank|lavatory\s+faucets?|bath\s+faucet|mixing\s+valve|tub\s+spout|rough[\s-]in\s+valve)\b/i.test(
      T,
    ) ||
    (/\b(shower\s+base|shower\s+pan|acrylic\s+shower|fiberglass\s+shower)\b/i.test(T) &&
      !/\b(tile|porcelain|ceramic|mosaic)\b/i.test(T)) ||
    /** Prefab wall / foam surround systems — not field tile for “tile walls” scopes. */
    (/\b(wedi\b|shower\s+and\s+tub\s+surround|tub\s+and\s+shower\s+surround|tub\s+surround\s+kit|shower\s+wall\s+kit)\b/i.test(
      T,
    ) &&
      !/\b(porcelain|ceramic|mosaic)\s+tile\b/i.test(T)) ||
    (/\b(glue[\s-]*up|snap[\s-]*fit)\b/i.test(T) && /\b(shower|tub)\s+wall\b/i.test(T));

  if (blockedNonTile) return false;
  return true;
}

/** First plausible cabinet width in inches from a retail title (e.g. "60 in", 60", "60 inch"). */
export function extractPrimaryWidthInchesFromProductTitle(title: string): number | undefined {
  const m =
    title.match(/\b(\d{2,3})\s*(?:in\.?|inch(?:es)?)\b/i) ||
    title.match(/\b(\d{2,3})\s*["']\b/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 18 || n > 144) return undefined;
  return n;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Line text implies **electrical lighting** SKUs — not generic “fixtures” (shower trim kits,
 * plumbing fixtures, etc.).
 */
export function lineImpliesLightingFixture(lineText: string): boolean {
  const t = lineText;
  if (/\b(light\s+switch|switch\s+plate|dimmer\s+switch)\b/i.test(t)) return false;
  if (
    /\b(shower|tub|bath)\b/i.test(t) &&
    /\b(trim|trim\s+kit|mixing|thermostatic|pressure|valve|cartridge|diverter|spout|rough|heads?|rain\s+head)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  if (/\bminor\s+plumbing\b|\bplumbing\s+adjustments?\b|\bplumbing\s+connections?\b|\brough[\s-]?in\b/i.test(t)) {
    if (!/\b(vanity\s+lights?|sconce|chandelier|pendant|recessed\s+lights?|ceiling\s+lights?)\b/i.test(t)) {
      return false;
    }
  }
  if (
    /\b(vanity\s+lights?|bath(?:room)?\s+lights?|wall\s+sconce|ceiling\s+lights?|recessed\s+lights?|pendants?|chandeliers?|lighting\s+fixtures?\s+for|led\s+(?:bath|vanity)?\s*light|light\s+bar|bath\s+light\s+bar|sconces?|luminaires?)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\blight(?:s|ing)?\b/i.test(t) && /\b(fixtures?|sconce|luminaire)\b/i.test(t)) return true;
  if (/\b(under|in)\s*cabinet\s+lights?\b|\btoe\s*kick\s+lights?\b/i.test(t)) return true;
  return false;
}

/** Product title looks like a plumbing fixture / cabinet, not a light. */
function titleLooksPlumbingNotLighting(title: string): boolean {
  const T = norm(title);
  const hasLightCue =
    /\b(light|lights|lighting|sconce|led|lamp|luminaire|fixture|vanity\s+light|bath\s+light|wall\s+mount|bar\s+light)\b/i.test(
      T,
    );
  if (hasLightCue) return false;
  return /\b(sink|faucets?|basin|vanity\s+cabinet|bathroom\s+vanity|vanity\s+combo|toilet|bathtub|tub\s+and|shower\s+head|rough\s+in\s+valve)\b/i.test(
    T,
  );
}

/** Line is clearly about plumbing / basin, not lighting. */
function lineImpliesPlumbingProduct(lineText: string): boolean {
  const t = norm(lineText);
  if (lineImpliesLightingFixture(lineText)) return false;
  if (
    /\b(shower|tub)\b/i.test(lineText) &&
    /\b(trim|trim\s+kit|fixtures?|valve|cartridge|mixing|thermostatic|diverter|spout|rough|heads?)\b/i.test(
      lineText,
    )
  ) {
    return true;
  }
  if (
    /\b(sink|faucets?|faucet\b|lavatory|basin|toilet|bathtub|shower\s+head|rough\s*in|p-trap|drains?|mixing\s+valve|shower\s+valve|supply\s+lines?|plumbing\s+connections?|water\s+lines?|angle\s+stops?)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bplumbing\b/.test(t) && /\b(connections?|rough|stub|supply|install|adjustments?)\b/.test(t)) return true;
  return false;
}

/** Title looks like lighting only (no sink). */
function titleLooksLighting(title: string): boolean {
  const T = norm(title);
  if (/\b(sink|faucets?|basin|toilet)\b/i.test(T)) return false;
  return /\b(light|sconce|led|fixture|lamp|luminaire|vanity\s+light|bath\s+light|wall\s+mount)\b/i.test(
    T,
  );
}

function titleLooksLikeTileOrWetPrepMaterial(title: string): boolean {
  const T = norm(title);
  return /\b(tile|tiles|porcelain|ceramic|mosaic|subway|backsplash|grout|thinset|mortar|membrane|waterproof(?:ing)?|backer|durock|hardiebacker|schluter|kerdi|redgard|pan\s+liner|niche)\b/i.test(
    T,
  );
}

/** Vanity / bath cabinet SKU, not a faucet trim or tile. */
function titleLooksVanityCabinetOrCombo(title: string): boolean {
  const T = norm(title);
  if (titleLooksLikeTileOrWetPrepMaterial(title) && !/\bvanity\b/i.test(T)) return false;
  return /\b(bathroom\s+vanity|bath\s+vanity|vanity\s+cabinet|vanity\s+combo|vanity\s+with\s+sink|double\s+vanity|single\s+vanity)\b/i.test(
    T,
  );
}

function titleLooksBathFaucetSku(title: string): boolean {
  const T = norm(title);
  if (/\b(shower\s+only|tub\s+spout|rough\s*-?\s*in\s+valve\s+only)\b/i.test(T)) return false;
  return /\b(faucets?|widespread|centerset|single\s+handle|lavatory|bath\s+faucet|sink\s+faucet)\b/i.test(
    T,
  );
}

/**
 * Higher = better match. Neutral ~50. Strong mismatches go very low.
 */
export function scoreRetailProductTitleForLine(
  lineText: string,
  productTitle: string,
  hint?: RetailTitleScoreHint,
): number {
  const L = norm(lineText);
  const T = norm(productTitle);
  let score = 50;

  const minTarget = hint?.minVanityCabinetWidthInches;
  const maxTarget = hint?.maxVanityCabinetWidthInches;
  const vanityCabinetLine =
    /\bvanity\b/i.test(lineText) &&
    !/\bvanity\s+top\b/i.test(lineText) &&
    !/\btop\s+only\b|\bcountertop\s+only\b/i.test(lineText) &&
    (/\b(cabinet|combo|sink\s+base|bathroom\s+vanity)\b/i.test(lineText) ||
      hint?.lineTrade === "cabinetry");
  if (minTarget != null && minTarget >= 42 && vanityCabinetLine) {
    const tw = extractPrimaryWidthInchesFromProductTitle(productTitle);
    if (tw != null) {
      if (tw < minTarget * 0.45) score -= 62;
      else if (tw < minTarget * 0.62) score -= 48;
      else if (tw < minTarget * 0.78) score -= 32;
      else if (tw >= minTarget * 0.92) score += 28;
      else if (tw >= minTarget * 0.82) score += 16;
    } else if (titleLooksVanityCabinetOrCombo(productTitle)) {
      score -= 18;
    }
  }

  if (maxTarget != null && maxTarget >= 36 && vanityCabinetLine) {
    const twM = extractPrimaryWidthInchesFromProductTitle(productTitle);
    if (twM != null && twM > maxTarget) {
      if (twM >= maxTarget * 1.22) score -= 58;
      else if (twM >= maxTarget * 1.12) score -= 40;
      else if (twM > maxTarget * 1.04) score -= 24;
    }
  }

  const vanityTopLine =
    minTarget != null &&
    minTarget >= 42 &&
    (/\bvanity\s+top\b/i.test(lineText) ||
      (/\bcountertop\b/i.test(lineText) && /\b(vanity|bathroom|bath)\b/i.test(lineText))) &&
    !/\bkitchen\b/i.test(lineText);
  if (vanityTopLine) {
    const tw = extractPrimaryWidthInchesFromProductTitle(productTitle);
    if (tw != null) {
      if (tw < minTarget * 0.5) score -= 55;
      else if (tw < minTarget * 0.68) score -= 40;
      else if (tw < minTarget * 0.82) score -= 24;
      else if (tw >= minTarget * 0.92) score += 22;
      else if (tw >= minTarget * 0.85) score += 12;
    }
    if (maxTarget != null && maxTarget >= 36) {
      const twT = extractPrimaryWidthInchesFromProductTitle(productTitle);
      if (twT != null && twT > maxTarget) {
        if (twT >= maxTarget * 1.15) score -= 36;
        else if (twT > maxTarget * 1.05) score -= 20;
      }
    }
  }

  const lineDoubleVanityCabinet =
    vanityCabinetLine &&
    /\b(double\s+vanity|double\s+sink|integrated\s+sinks?|two\s*sink|dual\s*sink|vanity\s+with\s+integrated)\b/i.test(
      lineText,
    );
  if (lineDoubleVanityCabinet && titleLooksVanityCabinetOrCombo(productTitle)) {
    if (/\b(single\s+sink|single\s+vanity|one\s*-?\s*sink|1\s*-?\s*sink)\b/i.test(T)) {
      score -= 72;
    }
    if (/\b(double|dual|two\s*sink|double\s*bowl|double\s*sink|integrated)\b/i.test(T)) {
      score += 34;
    }
    const twd = extractPrimaryWidthInchesFromProductTitle(productTitle);
    if (twd != null && twd <= 42 && !/\b(double|dual|two|integrated)\b/i.test(T)) {
      score -= 44;
    }
  }

  if (lineImpliesLightingFixture(lineText)) {
    if (titleLooksPlumbingNotLighting(productTitle)) {
      score -= 88;
    }
    if (/\b(light|sconce|fixture|led|vanity\s+light|bath\s+light)\b/i.test(T)) {
      score += 42;
    }
    if (/\b(sink|faucet|basin)\b/i.test(T) && !/\b(light|sconce|fixture|led)\b/i.test(T)) {
      score -= 92;
    }
  }

  if (lineTextImpliesSealantCaulkPrimaryRetail(lineText)) {
    if (titleLooksVanityCabinetOrCombo(productTitle)) {
      score -= 96;
    }
    if (/\b(bathroom\s+vanity|vanity\s+cabinet)\b/i.test(T) && !/\b(caulk|sealant|silicone)\b/i.test(T)) {
      score -= 92;
    }
    if (/\b(toilet|lavatory|widespread|centerset|shower\s+door)\b/i.test(T) && !/\b(caulk|sealant|silicone)\b/i.test(T)) {
      score -= 72;
    }
    if (/\b(caulk|sealant|silicone|polyseam|kitchen\s+and\s+bath|tub\s+and\s+tile)\b/i.test(T)) {
      score += 38;
    }
  }

  if (lineImpliesPlumbingProduct(lineText) && !lineImpliesLightingFixture(lineText)) {
    if (titleLooksLighting(productTitle) && !/\b(sink|faucets?|drains?)\b/i.test(T)) {
      let pen = 58;
      if (/\b(shower|tub)\b/i.test(L) && /\b(trim|fixtures?|valve|cartridge|mixing|spout)\b/i.test(L)) {
        pen = 94;
      }
      score -= pen;
    }
  }

  const lineTileFromText =
    /\b(tile|tiles|flooring|floor\s+tile|backsplash|ceramic|porcelain)\b/i.test(L);
  const lineTile = lineTileFromText || hint?.lineTrade === "tile";

  if (lineTile && /\b(light|fixture|sconce|led\s+bulb)\b/i.test(T) && !/\b(tile|plank|sq\.?\s*ft)\b/i.test(T)) {
    score -= 40;
  }

  const lineShowerWalls =
    lineTile &&
    /\b(shower|alcove|wet)\b/i.test(L) &&
    /\b(wall|walls|surround|niche|enclosure)\b/i.test(L) &&
    !/\bshower\s+floor\b|\bpan\s+only\b/i.test(L);
  const lineShowerTileMount =
    hint?.showerWallTileOnly === true ||
    (lineTile &&
      /\b(shower|alcove|wet)\b/i.test(L) &&
      /\btile\b/i.test(L) &&
      !/\b(floor\s+tile|flooring|shower\s+floor|pan\s+only)\b/i.test(L) &&
      inferShowerWallTileOnlyFromLineText(lineText));
  const titleLooksFloorFieldTile =
    /\b(floor\s+tile|floor\s+porcelain|ceramic\s+floor|porcelain\s+floor)\b/i.test(T) &&
    !/\b(wall|shower|backsplash|subway)\b/i.test(T);

  const lineFloorTileField =
    lineTile &&
    (/\bfloor\s+tile\b|\btile\b.*\bfloor\b|\bfloor(?:ing)?\b.*\b(tile|porcelain|ceramic)\b|\binstall\s+floor\b/i.test(
      L,
    ) ||
      (/\bfloor(?:ing)?\b/i.test(L) &&
        /\b(tile|porcelain|ceramic|plank|lvt)\b/i.test(L) &&
        !/\b(shower|wall\s+tile|backsplash|tub\s+surround|wet\s+wall)\b/i.test(L)));
  const floorFieldOnly = lineFloorTileField || hint?.floorFieldTileOnly === true;

  if (lineTile) {
    if (lineFloorTileField && titleLooksVanityCabinetOrCombo(productTitle)) {
      score -= 92;
    }
    if (
      lineFloorTileField &&
      /\b(vanity|vanities|cabinet|combo|lavatory|sink\s+base)\b/i.test(T) &&
      !titleLooksLikeTileOrWetPrepMaterial(productTitle)
    ) {
      score -= 88;
    }
    const looksWrongCategory =
      (titleLooksVanityCabinetOrCombo(productTitle) ||
        (/\b(vanity|vanities)\b/i.test(T) &&
          /\b(cabinet|combo|sink)\b/i.test(T) &&
          !titleLooksLikeTileOrWetPrepMaterial(productTitle))) &&
      !/\b(tile|porcelain|ceramic|mosaic|niche|schluter)\b/i.test(T);
    if (looksWrongCategory) {
      score -= 78;
    }
    if (lineShowerWalls && titleLooksFloorFieldTile) {
      score -= 68;
    }
    if (lineShowerTileMount && titleLooksFloorFieldTile) {
      score -= 82;
    }
    if (lineShowerTileMount && /\b(backsplash)\b/i.test(T) && !/\b(shower|wall|wet|bath)\b/i.test(T)) {
      score -= 62;
    }
    if (
      floorFieldOnly &&
      /\b(shower\s+wall|tub\s+surround|backsplash|wall\s+tile)\b/i.test(T) &&
      !/\bfloor\b/i.test(T)
    ) {
      score -= 72;
    }
    if ((lineShowerTileMount || hint?.showerWallTileOnly === true) && !titlePassesRetailTileFieldHardGate(productTitle)) {
      score -= 88;
    }
    if (floorFieldOnly && !titlePassesRetailTileFieldHardGate(productTitle)) {
      score -= 88;
    }
    if (
      lineShowerTileMount &&
      /\b(subway)\b/i.test(L) &&
      /\b(large\s*format|12\s*x\s*24|18\s*x\s*18|24\s*x\s*24)\b/i.test(T) &&
      !/\bsubway\b/i.test(L)
    ) {
      score -= 42;
    }
    if (lineShowerWalls && /\b(outdoor|patio|garage|basement\s+floor)\b/i.test(T)) {
      score -= 55;
    }
    if (/\b(faucets?|widespread|centerset|lavatory)\b/i.test(T) && !titleLooksLikeTileOrWetPrepMaterial(productTitle)) {
      score -= 52;
    }
  }

  const lineShowerValveOrTrim =
    /\b(shower|tub|wet)\b/i.test(L) &&
    /\b(valve|trim|cartridge|thermostatic|pressure|mixing|diverter|fixtures?)\b/i.test(L) &&
    !/\b(tile|drain\s+waste|waste\s+and\s+overflow|p-trap)\b/i.test(L);
  if (lineShowerValveOrTrim) {
    if (titleLooksLighting(productTitle) && /\b(vanity\s+light|bath\s+light|sconce|led\s+.*\blight\b|wall\s+light)\b/i.test(T)) {
      score -= 95;
    }
    if (
      /\b(double\s*bowl|kitchen\s*sink|lavatory\s+sink|bathroom\s+sink\s+bowl|drain\s*assembly|sink\s*drain|pop-?up)\b/i.test(
        T,
      ) &&
      !/\b(shower|valve|trim|thermostatic|pressure|mixing|diverter)\b/i.test(T)
    ) {
      score -= 88;
    }
    if (/\b(shower\s+valve|mixing\s+valve|thermostatic|pressure\s+balance|trim\s+kit|tub\s+spout)\b/i.test(T)) {
      score += 26;
    }
  }

  const lineFaucetRetail =
    /\bfaucets?\b/i.test(L) &&
    !lineImpliesLightingFixture(lineText) &&
    (/\bvanity\b/i.test(L) || hint?.lineTrade === "plumbing" || lineImpliesPlumbingProduct(lineText));
  if (lineFaucetRetail) {
    if (titleLooksVanityCabinetOrCombo(productTitle) && !titleLooksBathFaucetSku(productTitle)) {
      score -= 72;
    }
    if (
      /\b(includes?\s+faucet|with\s+faucet|faucets?\s+included|all[\s-]in[\s-]one|combo\s+with\s+faucet)\b/i.test(
        T,
      ) &&
      titleLooksVanityCabinetOrCombo(productTitle)
    ) {
      score -= 58;
    }
    if (titleLooksBathFaucetSku(productTitle)) {
      score += 22;
    }
  }

  const lineRoughPlumbing =
    /\bplumbing\s+connections?\b|\brough[\s-]?in\b|\bstub\s+outs?\b|\bsupply\s+stops?\b|\bwater\s+lines?\b/i.test(
      L,
    ) ||
    (/\binstall\b/.test(L) && /\bplumbing\b/.test(L) && /\bconnections?\b/.test(L));
  if (lineRoughPlumbing) {
    if (
      titleLooksVanityCabinetOrCombo(productTitle) &&
      !/\b(valve|supply|angle|stop|rough|connector|p-trap|drain|mixing|trim\s+kit)\b/i.test(T)
    ) {
      score -= 82;
    }
  }

  const lineCabinetry =
    (hint?.lineTrade === "cabinetry" && !lineRoughPlumbing) ||
    (/\b(vanity|cabinet)\b/i.test(L) &&
      !/\bfaucets?\b/i.test(L) &&
      !lineTileFromText &&
      !lineRoughPlumbing);
  if (lineCabinetry && hint?.lineTrade !== "tile") {
    if (titleLooksLikeTileOrWetPrepMaterial(productTitle) && !/\bvanity|cabinet|combo|sink\b/i.test(T)) {
      score -= 48;
    }
  }

  if (lineImpliesToiletFixturePrimaryRetail(lineText)) {
    if (titleLooksLikeToiletRepairOrPartsKit(productTitle)) {
      score -= 98;
    }
    if (titleLooksLikeToiletFixtureSku(productTitle)) {
      score += 42;
    }
  }

  if (hint?.siteBuiltShowerTileWalls === true && titleLooksLikeOnePieceWallsAndPanShowerKit(productTitle)) {
    score -= 110;
  }

  if (lineImpliesShowerWetAreaShellRetail(lineText)) {
    if (
      /\b(shower\s+pan|shower\s+base|shower\s+receptor|single\s+threshold|acrylic\s+shower|fiberglass\s+shower)\b/i.test(
        T,
      )
    ) {
      score += 44;
    }
    if (titleLooksLikeToiletFixtureSku(productTitle)) {
      score -= 100;
    } else if (/\btoilet\b/i.test(T) && !titleLooksLikeToiletRepairOrPartsKit(productTitle)) {
      score -= 88;
    }
  }

  if (lineImpliesShowerPanOrBaseRetail(lineText)) {
    const targetL = hint?.showerBaseTargetLengthInches;
    const targetW = hint?.showerBaseTargetWidthInches;
    if (targetL != null && targetW != null && titleLooksLikeShowerBaseOrPanSku(productTitle)) {
      if (titlePassesRetailShowerBaseDimensionHardGate(productTitle, hint)) {
        score += 32;
      } else {
        score -= 105;
      }
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function compareRetailTitleScores(a: number, b: number): number {
  return b - a;
}
