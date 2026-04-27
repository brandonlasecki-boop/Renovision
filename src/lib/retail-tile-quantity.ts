import type { BidMaterialLine } from "@/types/bid";
import {
  inferFloorFieldTileOnlyFromLineText,
  inferShowerWallTileOnlyFromLineText,
  titleLooksLikeOnePieceWallsAndPanShowerKit,
} from "@/lib/integrations/retail-search-relevance";

/** Room measurement row: `- Bathroom: ~L x W ft (... ceiling ~H ft)` */
const BATH_ROOM_LINE_RE =
  /-\s*[^\n:]*(bathroom|bath|powder\s*room|wc|restroom)[^\n:]*:\s*~\s*([\d.]+)\s*x\s*([\d.]+)\s*ft\b/i;

/** Room measurement line for shower: `- Shower: ~L x W ft (... ceiling ~H ft)` */
const SHOWER_ROOM_LINE_RE =
  /-\s*[^\n:]*shower[^\n:]*:\s*~\s*([\d.]+)\s*x\s*([\d.]+)\s*ft[^\n]*/i;

/** e.g. narrative "Shower footprint ~5 x 3 ft" from scope or AI notes */
const SHOWER_FOOTPRINT_INLINE_RE = /\bshower[^\n]{0,100}~\s*([\d.]+)\s*x\s*([\d.]+)\s*ft\b/i;

function ceilingFtNearMatch(jobContext: string, fromIndex: number): number {
  const slice = jobContext.slice(Math.max(0, fromIndex - 20), fromIndex + 160);
  const m = /ceiling\s*~\s*([\d.]+)\s*ft/i.exec(slice);
  if (m) {
    const h = Number(m[1]);
    if (Number.isFinite(h) && h >= 6 && h <= 14) return h;
  }
  return 7.5;
}

export type TileFieldKind = "shower" | "bathroom_floor" | "bathroom_wall";

/** Bathroom footprint (sq ft) from the first bathroom-style room row in scope. */
export function estimateBathroomFootprintSqFt(jobContext: string): number | null {
  const m = BATH_ROOM_LINE_RE.exec(jobContext.replace(/\r\n/g, "\n"));
  if (!m) return null;
  const L = Number(m[2]);
  const W = Number(m[3]);
  if (!Number.isFinite(L) || !Number.isFinite(W) || L < 1.5 || W < 1.5 || L > 40 || W > 40) {
    return null;
  }
  return Math.round(L * W * 10) / 10;
}

/** Wall tile outside the shower: partial perimeter × height, openings/wainscot discount. */
function estimateBathroomWallTileFieldSqFt(jobContext: string): number | null {
  const jc = jobContext.replace(/\r\n/g, "\n");
  const m = BATH_ROOM_LINE_RE.exec(jc);
  if (!m) return null;
  const L = Number(m[2]);
  const W = Number(m[3]);
  if (!Number.isFinite(L) || !Number.isFinite(W) || L < 1.5 || W < 1.5 || L > 40 || W > 40) {
    return null;
  }
  const H = ceilingFtNearMatch(jc, m.index ?? 0);
  const wallGross = 2 * (L + W) * H;
  const partial = wallGross * 0.52;
  return Math.ceil(Math.min(420, partial));
}

/** Line text: bathroom wall / wainscot tile, not shower wet walls. */
function inferBathroomWallTileOnlyFromLineText(lineText: string): boolean {
  const L = lineText.toLowerCase().replace(/\s+/g, " ");
  if (!/\b(tile|tiles|porcelain|ceramic)\b/.test(L)) return false;
  if (/\b(shower|alcove|wet\s*area|tub\s+surround|shower\s+niche)\b/i.test(lineText)) return false;
  if (inferFloorFieldTileOnlyFromLineText(lineText) && !/\bwall\b|\bwainscot|wainscoting|backsplash\b/i.test(lineText)) {
    return false;
  }
  if (
    /\b(bathroom|bath|powder\s*room)\b/i.test(lineText) &&
    /\bwall\s+tile\b|\bwainscot|tile\s+on\s+(?:the\s+)?walls?\b|\bhalf\s*[\s-]*wall\b|\bbacksplash\b/i.test(lineText)
  ) {
    return true;
  }
  return false;
}

/**
 * Approximate wall + floor tile field for a shower alcove (sq ft), with 12% waste.
 * Uses the first "Shower" row in room measurements block when present.
 */
export function estimateShowerTileFieldSqFt(jobContext: string): number | null {
  const jc = jobContext.replace(/\r\n/g, "\n");
  const m = SHOWER_ROOM_LINE_RE.exec(jc) ?? SHOWER_FOOTPRINT_INLINE_RE.exec(jc);
  if (!m) return null;
  const L = Number(m[1]);
  const W = Number(m[2]);
  if (!Number.isFinite(L) || !Number.isFinite(W) || L < 2 || W < 1.5 || L > 30 || W > 30) {
    return null;
  }
  const H = ceilingFtNearMatch(jc, m.index ?? 0);
  const wallsSqFt = 2 * (L + W) * H;
  const floorSqFt = L * W;
  const raw = wallsSqFt + floorSqFt;
  return Math.ceil(raw * 1.12);
}

export function lineIsShowerWallOrFloorTile(line: BidMaterialLine): boolean {
  const blob = `${line.name} ${line.notes ?? ""}`.toLowerCase();
  const tradeOk = line.trade === "tile" || /\b(tile|porcelain|ceramic)\b/.test(blob);
  if (!tradeOk) return false;
  return (
    /\b(shower|alcove|wet\s*area)\b/i.test(blob) &&
    /\b(wall|walls|floor|surround|pan|enclosure)\b/i.test(blob)
  );
}

export function tileFieldKindForRetailQuantity(line: BidMaterialLine): TileFieldKind | null {
  const blob = `${line.name} ${line.notes ?? ""}`;
  const L = blob.toLowerCase();
  const tradeOk = line.trade === "tile" || /\b(tile|porcelain|ceramic)\b/.test(L);
  if (!tradeOk) return null;
  if (lineIsShowerWallOrFloorTile(line)) return "shower";
  if (!/\b(bathroom|bath|powder|wc|restroom)\b/i.test(blob)) return null;
  if (inferFloorFieldTileOnlyFromLineText(blob)) return "bathroom_floor";
  if (inferBathroomWallTileOnlyFromLineText(blob)) return "bathroom_wall";
  if (inferShowerWallTileOnlyFromLineText(blob)) return "shower";
  if (/\b(tile|tiles|porcelain|ceramic)\b/.test(L)) return "bathroom_floor";
  return null;
}

export function lineUsesTileFieldRetailQuantity(line: BidMaterialLine): boolean {
  return tileFieldKindForRetailQuantity(line) != null;
}

export function estimateTileFieldSqFtForLine(jobContext: string, line: BidMaterialLine): number | null {
  const kind = tileFieldKindForRetailQuantity(line);
  if (kind == null) return null;
  if (kind === "shower") return estimateShowerTileFieldSqFt(jobContext);
  const footprint = estimateBathroomFootprintSqFt(jobContext);
  if (footprint == null) return null;
  if (kind === "bathroom_floor") return Math.ceil(footprint * 1.15);
  return estimateBathroomWallTileFieldSqFt(jobContext);
}

/**
 * Parses "sq ft per case" / "case covers X sq ft" from retailer titles so we can convert
 * shelf **case** prices to **per sq ft** when the estimate line is priced in sq ft.
 */
export function parseCaseCoverageSqFtFromProductTitle(title: string): number | null {
  const T = title.trim();
  if (!T) return null;
  const t = T.toLowerCase();
  const patterns: RegExp[] = [
    /(\d+(?:\.\d+)?)\s*sq\.?\s*ft\.?\s*(?:\/|per)\s*(?:case|carton|box|ctn)\b/i,
    /(?:case|carton|box)\s*(?:of|covers)\s*~?\s*(\d+(?:\.\d+)?)\s*sq\.?\s*ft/i,
    /(\d+(?:\.\d+)?)\s*sq\.?\s*ft\.?\s*each\s*(?:case|carton|box)\b/i,
    /covers\s*(\d+(?:\.\d+)?)\s*sq\.?\s*ft/i,
    /\b(\d+(?:\.\d+)?)\s*sq\.?\s*ft\.?\s*per\s*(?:case|carton|box)\b/i,
  ];
  for (const re of patterns) {
    const m = T.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 3 && n <= 200) return n;
    }
  }
  if (/\b(case|carton|box)\b/i.test(t) && /\bsq\.?\s*ft\b/i.test(t)) {
    const m2 = t.match(/\b(\d+(?:\.\d+)?)\s*sq\.?\s*ft\b/);
    if (m2) {
      const n = Number(m2[1]);
      if (Number.isFinite(n) && n >= 3 && n <= 200) return n;
    }
  }
  return null;
}

/** Title suggests the shelf price is for a case/carton, not one sq ft. */
export function productTitleLooksCaseOrCartonTilePrice(title: string): boolean {
  const t = title.toLowerCase();
  if (!/\b(case|carton|box|ctn|pieces?\s+per|tiles?\s+per)\b/i.test(t)) return false;
  return /\bsq\.?\s*ft\b/i.test(t) || /\b\d+\s*(?:piece|pc|tiles?)\b/i.test(t);
}

/**
 * Prefab shower wall systems (acrylic/Fiberglass/glue-up kits) are priced per kit or per sheet —
 * not like field tile counted by shower sq ft ÷ tile size.
 */
export function productTitleIsPrefabShowerWallKit(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return false;
  if (titleLooksLikeOnePieceWallsAndPanShowerKit(title)) return true;
  if (/\bwedi\b/.test(t) && /\b(shower|tub|surround|wall|kit|board|panel)\b/.test(t)) return true;
  if (/\b(shower\s+and\s+tub\s+surround|tub\s+and\s+shower\s+surround|tub\s+surround\s+kit|shower\s+wall\s+kit)\b/.test(
    t,
  )) {
    return true;
  }
  if (/\bglue[\s-]*up\b/.test(t)) return true;
  if (/\b(shower|tub)\s+wall\s+set\b/.test(t)) return true;
  if (/\b(acrylic|fiberglass)\b/.test(t) && /\b(alcove\s+)?shower\s+wall\b/.test(t)) return true;
  if (/\b(acrylic|fiberglass)\b/.test(t) && /\bwall\s+set\b/.test(t) && /\bshower\b/.test(t)) {
    return true;
  }
  if (/\bfrp\b/.test(t) && /\b(wall|shower|panel)\b/.test(t)) return true;
  if (/\b(four|4)\s*[-]?\s*piece\b/.test(t) && /\b(acrylic|fiberglass)\b/.test(t) && /\bshower\b/.test(t)) {
    return true;
  }
  if (/\bacrylic\b/.test(t) && /\balcove\b/.test(t) && /\b(shower\s+wall|wall\s+set)\b/.test(t)) {
    return true;
  }
  return false;
}

/**
 * After `fetch prices`, Home Depot is merged first then Lowe's — `adjustShowerTileQuantity` was
 * called again with only the **last** hit title, so a Lowe's string without "Glue Up" could still
 * run field-tile math while `hd_title` still described an acrylic kit. Any attached shelf title can
 * veto that bump.
 */
export function retailAttachedProductLooksPrefabShowerKit(
  line: BidMaterialLine,
  justAttachedProductTitle?: string,
): boolean {
  const seen = new Set<string>();
  for (const raw of [justAttachedProductTitle, line.hd_title, line.lw_title]) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || seen.has(s)) continue;
    seen.add(s);
    if (productTitleIsPrefabShowerWallKit(s)) return true;
  }
  return false;
}

/**
 * Nominal **width** from titles like `32 in. W x 72 in. H` (first `… in W` wins — not the 12×24 tile parser).
 */
export function parseShowerKitNominalWidthInchesFromTitle(title: string): number | null {
  const T = title.trim();
  if (!T) return null;
  let m = /\b(\d{1,3}(?:\.\d+)?)\s*in\.?\s*W\b/i.exec(T);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 24 && n <= 120) return n;
  }
  m = /\bW\s*[:\s-]*(\d{1,3}(?:\.\d+)?)\s*-?\s*in\b/i.exec(T);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 24 && n <= 120) return n;
  }
  return null;
}

/** Longer in-wall span of the shower footprint (inches), from room measurements `~L x W ft`. */
export function estimateShowerAlcoveMaxWallInches(jobContext: string): number | null {
  const jc = jobContext.replace(/\r\n/g, "\n");
  const m = SHOWER_ROOM_LINE_RE.exec(jc) ?? SHOWER_FOOTPRINT_INLINE_RE.exec(jc);
  if (!m) return null;
  const Lft = Number(m[1]);
  const Wft = Number(m[2]);
  if (!Number.isFinite(Lft) || !Number.isFinite(Wft)) return null;
  if (Lft < 2 || Wft < 1.5 || Lft > 30 || Wft > 30) return null;
  return Math.max(Lft, Wft) * 12;
}

/** Prefer a kit-looking title that also yields a parseable width for math. */
export function pickRetailTitleForPrefabShowerKitDimension(
  line: BidMaterialLine,
  justAttachedProductTitle?: string,
): string {
  const order = [justAttachedProductTitle, line.hd_title, line.lw_title];
  for (const raw of order) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || !productTitleIsPrefabShowerWallKit(s)) continue;
    if (parseShowerKitNominalWidthInchesFromTitle(s) != null) return s;
  }
  for (const raw of order) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s && productTitleIsPrefabShowerWallKit(s)) return s;
  }
  return (
    (typeof justAttachedProductTitle === "string" ? justAttachedProductTitle.trim() : "") ||
    (line.hd_title ?? "").trim() ||
    (line.lw_title ?? "").trim()
  );
}

/**
 * One prefab kit usually covers one alcove when the long wall is within ~1.5× the nominal catalog width;
 * beyond that, assume multiple kits (ceil(opening / nominal width)), capped for safety.
 */
function applyPrefabShowerKitEaQuantityFromJobContext(
  line: BidMaterialLine,
  jobContext: string,
  productTitle?: string,
): void {
  const unitLower = (line.unit ?? "ea").trim().toLowerCase();
  if (!/\b(ea|each|kit|set|box)\b/i.test(unitLower)) return;

  const title = pickRetailTitleForPrefabShowerKitDimension(line, productTitle);
  const kitW = parseShowerKitNominalWidthInchesFromTitle(title);
  const openingIn = estimateShowerAlcoveMaxWallInches(jobContext);

  if (kitW == null || openingIn == null) {
    const qBad = Math.max(0, Number(line.quantity) || 0);
    if (qBad > 6) line.quantity = 1;
    return;
  }

  const fitsOneKitBand = kitW * 1.5;
  let kits: number;
  if (openingIn <= fitsOneKitBand) {
    kits = 1;
  } else {
    kits = Math.min(8, Math.max(2, Math.ceil(openingIn / kitW)));
  }
  line.quantity = kits;
}

/** e.g. "12 in x 24 in" or "12x24 in" → sq inches per tile */
function parseTileSizeSqInchesFromTitle(title: string): number | null {
  const T = title.toLowerCase();
  const m =
    T.match(/\b(\d{1,2})\s*(?:in|"|inch(?:es)?)\s*[x×]\s*(\d{1,2})\s*(?:in|"|inch(?:es)?)\b/i) ||
    T.match(/\b(\d{1,2})\s*[x×]\s*(\d{1,2})\s*(?:in|"|inch(?:es)?)\b/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 2 || b < 2 || a > 48 || b > 48) {
    return null;
  }
  return a * b;
}

/**
 * When retail attaches field tile for shower or **bathroom** floor/wall lines, bump quantity
 * from a placeholder to a rough sq ft takeoff (or piece count when unit is `ea`).
 */
export function adjustShowerTileQuantityAfterRetailAttach(params: {
  line: BidMaterialLine;
  jobContext: string;
  productTitle?: string;
}): void {
  const { line, jobContext, productTitle } = params;
  if (!lineUsesTileFieldRetailQuantity(line)) return;
  if (retailAttachedProductLooksPrefabShowerKit(line, productTitle)) {
    applyPrefabShowerKitEaQuantityFromJobContext(line, jobContext, productTitle);
    return;
  }
  const fieldSqFt = estimateTileFieldSqFtForLine(jobContext, line);
  if (fieldSqFt == null) return;

  const unitRaw = (line.unit ?? "ea").trim();
  const unitLower = unitRaw.toLowerCase();
  const isSqUnit = /\b(sq\.?\s*ft|sf|sqft)\b/i.test(unitLower);
  const q = Math.max(0, Number(line.quantity) || 0);
  const titleRaw = productTitle ?? line.hd_title ?? line.lw_title ?? "";
  const title = titleRaw.toLowerCase();
  const titleSuggestsCaseSold = productTitleLooksCaseOrCartonTilePrice(titleRaw);
  const priceLooksPerSqFt =
    !titleSuggestsCaseSold &&
    (/\b(price|only)\b[^.]{0,40}\bper\s*sq\.?\s*ft\b/i.test(title) ||
      /\bper\s*sq\.?\s*ft\b/i.test(title) ||
      /\b\/\s*sq\.?\s*ft\b/i.test(title) ||
      /\bsq\.?\s*ft\.?\s*each\b/i.test(title));

  if (isSqUnit || priceLooksPerSqFt) {
    if (q < fieldSqFt * 0.55) {
      line.quantity = fieldSqFt;
      if (!isSqUnit) line.unit = "sq ft";
    }
    return;
  }

  if (q <= 2 && /\b(ea|each|piece|pc|sheet)\b/i.test(unitLower)) {
    const sqIn = parseTileSizeSqInchesFromTitle(title) ?? 12 * 24;
    const tilesNeeded = Math.ceil((fieldSqFt * 144) / sqIn);
    if (tilesNeeded > q) {
      line.quantity = Math.max(q, tilesNeeded);
    }
  }
}

/**
 * After shelf price is applied: if the line is field tile in **sq ft** but the
 * listing price is **per case**, convert unit cost to $/sq ft using case coverage from the title.
 */
export function normalizeShowerTileRetailUnitCost(line: BidMaterialLine, productTitle: string): void {
  if (!lineUsesTileFieldRetailQuantity(line)) return;
  if (retailAttachedProductLooksPrefabShowerKit(line, productTitle)) return;
  const u = (line.unit ?? "").trim().toLowerCase();
  if (!/\b(sq\.?\s*ft|sf|sqft)\b/i.test(u)) return;
  const cost = Number(line.unit_cost_usd);
  if (!Number.isFinite(cost) || cost <= 0) return;
  const title = productTitle.trim();
  if (!title) return;
  const t = title.toLowerCase();
  const coverage = parseCaseCoverageSqFtFromProductTitle(title);
  const caseLike =
    coverage != null &&
    coverage > 0 &&
    (productTitleLooksCaseOrCartonTilePrice(title) ||
      /\b(per\s+case|\/\s*case|each\s+case|case\s+price)\b/i.test(t));

  if (caseLike && coverage != null) {
    const perSq = Math.round((cost / coverage) * 10000) / 10000;
    if (perSq >= 0.2 && perSq < cost && cost / perSq <= 300) {
      line.unit_cost_usd = perSq;
      line.markup_pct = 0;
      line.unit_price_usd = perSq;
      const q = Math.max(0, Number(line.quantity) || 0);
      line.extended_usd = Math.round(q * perSq * 100) / 100;
    }
    return;
  }

  if (cost > 28 && !/\b(mosaic|accent|decorative)\b/i.test(t)) {
    for (const c of [16, 12, 15, 10.67, 11.25, 13.5, 14, 18, 20, 8.52, 9.6]) {
      const perSq = cost / c;
      if (perSq >= 0.75 && perSq <= 24) {
        line.unit_cost_usd = Math.round(perSq * 10000) / 10000;
        line.markup_pct = 0;
        line.unit_price_usd = line.unit_cost_usd;
        const q = Math.max(0, Number(line.quantity) || 0);
        line.extended_usd = Math.round(q * line.unit_cost_usd * 100) / 100;
        break;
      }
    }
  }
}
