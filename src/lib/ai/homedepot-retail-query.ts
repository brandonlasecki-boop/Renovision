import type { BidMaterialLine, BidMaterialTrade } from "@/types/bid";
import {
  inferFloorFieldTileOnlyFromLineText,
  inferShowerWallTileOnlyFromLineText,
  lineImpliesShowerPanOrBaseRetail,
  lineImpliesLightingFixture,
  lineImpliesToiletFixturePrimaryRetail,
  lineTextImpliesSealantCaulkPrimaryRetail,
  type RetailTitleScoreHint,
} from "@/lib/integrations/retail-search-relevance";

const LINE = (line: { name: string; notes?: string }) =>
  `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ").trim();

/**
 * True when we should rewrite / widen the Serp query toward a **vanity cabinet or combo** SKU
 * (not faucets, not rough-in plumbing, not “vanity run” location text alone).
 */
export function lineImpliesVanityCabinetRetailQuery(line: {
  name: string;
  notes?: string;
  trade?: BidMaterialTrade;
}): boolean {
  const t = LINE(line);
  if (!t) return false;
  if (lineImpliesLightingFixture(t)) return false;
  if (/\bplumbing\s+connections?\b|\brough[\s-]?in\b|\bstub\s+outs?\b|\bsupply\s+stops?\b|\bwater\s+lines?\b/i.test(t)) {
    return false;
  }
  if (
    /\bfaucets?\b|\blavatory\b|\bdeck[\s-]?mount\b|\bcenterset\b|\bwidespread\b|\bbath\s+faucet\b/i.test(t) &&
    !/\bvanity\s+cabinet\b|\bcabinet\s+with\b|\bdouble\s+vanity\s+cabinet\b|\bintegrated\s+sinks?\b/i.test(t)
  ) {
    return false;
  }
  if (!/\bvanity\b/i.test(t)) return false;
  const topOnly =
    /\bvanity\s+top\b|\bvanity\s+countertop\b|\bcountertop\s+only\b|\b(?:just\s+)?replace\s+(?:the\s+)?(?:vanity\s+)?top\b/i.test(
      t,
    );
  if (topOnly) return false;
  return (
    /\b(cabinet|combo|sink\s+base|bathroom\s+vanity|integrated\s+sinks?|double\s+vanity|single\s+vanity)\b/i.test(
      t,
    ) || line.trade === "cabinetry"
  );
}

/**
 * Minimum vanity cabinet width hint for title scoring: uses job run when present,
 * otherwise **60"** when the line clearly names a double / integrated-sink cabinet.
 */
export function minVanityCabinetInchesForLineRetail(
  line: { name: string; notes?: string; trade?: BidMaterialTrade },
  vanityRunFromJob?: number,
): number | undefined {
  if (!lineImpliesVanityCabinetRetailQuery(line)) return undefined;
  const t = LINE(line).toLowerCase();
  const impliedDouble =
    /\bdouble\s+vanity\b|\bdouble\s+sink\b|\bintegrated\s+sinks?\b|\btwo\s*sink\s+vanity\b|\bvanity\s+with\s+integrated\b/i.test(
      t,
    );
  if (impliedDouble) {
    if (vanityRunFromJob != null && vanityRunFromJob >= 54) return vanityRunFromJob;
    return 60;
  }
  if (vanityRunFromJob != null && vanityRunFromJob >= 42) return vanityRunFromJob;
  return undefined;
}

/** SerpApi title scoring: only apply measured vanity **width** bias on true cabinet lines. */
export function vanityWidthSerpOptionsForLine(
  line: { name: string; notes?: string; trade?: BidMaterialTrade },
  vanityRunInches?: number,
  jobContext?: string,
): { minVanityCabinetWidthInches?: number; maxVanityCabinetWidthInches?: number } {
  const min = minVanityCabinetInchesForLineRetail(line, vanityRunInches);
  const max = lineImpliesVanityCabinetRetailQuery(line)
    ? resolveMaxVanityCabinetWidthInchesForRetail(line, vanityRunInches, jobContext, min)
    : undefined;
  const out: { minVanityCabinetWidthInches?: number; maxVanityCabinetWidthInches?: number } = {};
  if (min != null && min >= 42) out.minVanityCabinetWidthInches = min;
  if (max != null && max >= 36) out.maxVanityCabinetWidthInches = max;
  if (
    out.minVanityCabinetWidthInches != null &&
    out.maxVanityCabinetWidthInches != null &&
    out.maxVanityCabinetWidthInches < out.minVanityCabinetWidthInches
  ) {
    delete out.maxVanityCabinetWidthInches;
  }
  return out;
}

function parseShowerBaseDimensionsInchesFromText(text: string): {
  lengthInches: number;
  widthInches: number;
} | undefined {
  const t = text.replace(/\s+/g, " ");
  let m: RegExpExecArray | null =
    /\b(\d{2,3}(?:\.\d+)?)\s*(?:in\.?|inch(?:es)?|["”])?\s*(?:x|×|by)\s*(\d{2,3}(?:\.\d+)?)\s*(?:in\.?|inch(?:es)?|["”])\b/i.exec(
      t,
    );
  let multiplier = 1;
  if (!m) {
    m =
      /\b(?:shower|pan|base|receptor)[^.\n]{0,80}?\b(\d(?:\.\d+)?)\s*(?:x|×|by)\s*(\d(?:\.\d+)?)\s*(?:ft|feet|foot)\b/i.exec(
        t,
      ) ||
      /\b(?:shower|pan|base|receptor)[^.\n]{0,80}?\b(\d(?:\.\d+)?)\s*(?:ft|feet|foot)\s*(?:x|×|by)\s*(\d(?:\.\d+)?)\s*(?:ft|feet|foot)\b/i.exec(
        t,
      ) ||
      /\b(\d(?:\.\d+)?)\s*(?:x|×|by)\s*(\d(?:\.\d+)?)\s*(?:ft|feet|foot)\b[^.\n]{0,80}?\b(?:shower|pan|base|receptor)\b/i.exec(
        t,
      ) ||
      /\b(\d(?:\.\d+)?)\s*(?:ft|feet|foot)\s*(?:x|×|by)\s*(\d(?:\.\d+)?)\s*(?:ft|feet|foot)\b[^.\n]{0,80}?\b(?:shower|pan|base|receptor)\b/i.exec(
        t,
      );
    multiplier = 12;
  }
  if (!m) return undefined;
  const a = Number(m[1]) * multiplier;
  const b = Number(m[2]) * multiplier;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  if (a < 18 || b < 18 || a > 120 || b > 120) return undefined;
  return {
    lengthInches: Math.round(Math.max(a, b)),
    widthInches: Math.round(Math.min(a, b)),
  };
}

function extractShowerBaseDimensionsInchesFromJobContext(jobContext: string): {
  lengthInches: number;
  widthInches: number;
} | undefined {
  const lines = jobContext.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (!/\b(shower|pan|base|receptor|tub[\s-]+to[\s-]+shower)\b/i.test(line)) continue;
    const dims = parseShowerBaseDimensionsInchesFromText(line);
    if (dims) return dims;
  }
  return parseShowerBaseDimensionsInchesFromText(jobContext);
}

export function showerBaseSerpOptionsForLine(
  line: { name: string; notes?: string; trade?: BidMaterialTrade },
  jobContext?: string,
): { showerBaseTargetLengthInches?: number; showerBaseTargetWidthInches?: number } {
  const lineText = LINE(line);
  if (!lineImpliesShowerPanOrBaseRetail(lineText)) return {};
  const dims =
    parseShowerBaseDimensionsInchesFromText(lineText) ||
    (jobContext ? extractShowerBaseDimensionsInchesFromJobContext(jobContext) : undefined);
  if (!dims) return {};
  return {
    showerBaseTargetLengthInches: dims.lengthInches,
    showerBaseTargetWidthInches: dims.widthInches,
  };
}

/** Hint object for {@link scoreRetailProductTitleForLine} — mirrors SerpApi merge logic. */
export function buildRetailTitleScoreHint(
  line: { name: string; notes?: string; trade?: BidMaterialTrade },
  vanityRunInches?: number,
  jobContext?: string,
): RetailTitleScoreHint | undefined {
  const out: RetailTitleScoreHint = {};
  if (line.trade && line.trade !== "general") out.lineTrade = line.trade;
  const lt = LINE(line);
  if (inferShowerWallTileOnlyFromLineText(lt)) out.showerWallTileOnly = true;
  if (inferFloorFieldTileOnlyFromLineText(lt)) out.floorFieldTileOnly = true;
  const vw = vanityWidthSerpOptionsForLine(line, vanityRunInches, jobContext);
  if (vw.minVanityCabinetWidthInches != null) out.minVanityCabinetWidthInches = vw.minVanityCabinetWidthInches;
  if (vw.maxVanityCabinetWidthInches != null) out.maxVanityCabinetWidthInches = vw.maxVanityCabinetWidthInches;
  const showerDims = showerBaseSerpOptionsForLine(line, jobContext);
  if (showerDims.showerBaseTargetLengthInches != null) {
    out.showerBaseTargetLengthInches = showerDims.showerBaseTargetLengthInches;
  }
  if (showerDims.showerBaseTargetWidthInches != null) {
    out.showerBaseTargetWidthInches = showerDims.showerBaseTargetWidthInches;
  }
  if (
    out.lineTrade == null &&
    !out.showerWallTileOnly &&
    !out.floorFieldTileOnly &&
    out.minVanityCabinetWidthInches == null &&
    out.maxVanityCabinetWidthInches == null &&
    out.showerBaseTargetLengthInches == null &&
    out.showerBaseTargetWidthInches == null
  ) {
    return undefined;
  }
  return out;
}

const HD_QUERY_MODEL = "gpt-4o-mini";

/**
 * Parses composite job context for a vanity/cabinet run row (~L x W ft) and returns
 * the longer run dimension in inches (wall direction), when present.
 */
export function extractVanityCabinetRunWidthInchesFromJobContext(jobContext: string): number | undefined {
  const jc = jobContext.replace(/\r\n/g, "\n");
  const m =
    /\bvanity[^\n]{0,100}:\s*~\s*([\d.]+)\s*x\s*([\d.]+)\s*ft\b/i.exec(jc) ||
    /Vanity\s*\/\s*cabinet\s*run[^:]{0,60}:\s*~\s*([\d.]+)\s*x\s*([\d.]+)\s*ft\b/i.exec(jc);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const major = Math.max(a, b);
  if (major < 0.5 || major > 30) return undefined;
  return Math.round(major * 12);
}

/**
 * Pulls a minimum vanity/cabinet **width in inches** from free text (replacement prompts, notes).
 * Only runs when the text clearly refers to a vanity/cabinet so we do not treat unrelated dimensions
 * (e.g. tile, towel bar) as cabinet width.
 */
export function extractMinVanityCabinetWidthInchesFromRetailText(text: string): number | undefined {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  const vanityCtx =
    /\bvanity\b|\bcabinet\s*(?:run)?\b|\bbathroom\s+cabinet\b|\bvanities\b|\bdouble\s+vanity\b|\bvanity\s+cabinet\b/i.test(
      t,
    );
  if (!vanityCtx) return undefined;

  const candidates: number[] = [];
  const push = (n: number) => {
    if (!Number.isFinite(n)) return;
    const r = Math.round(n);
    if (r >= 30 && r <= 156) candidates.push(r);
  };

  let m: RegExpExecArray | null;
  const reAtLeast =
    /\b(?:at\s*least|atleast|minimum|min\.?|no\s+less\s+than|greater\s+than|more\s+than|over|>=?)\s*(\d{2,3})\s*(?:"|''|inch(?:es)?|ins?\b)?\b/gi;
  while ((m = reAtLeast.exec(t)) !== null) push(Number(m[1]));

  /** Width before unit; avoid trailing `\b` after `inch` — it can fail next to some punctuation / unicode dash. */
  const reInches =
    /\b(\d{2,3})\s*(?:"|''|inch(?:es)?|in\.|ins?\b)(?:\s*wide|\s*w\.?)?(?=\s|[,;.!?():–—\-]|$)/gi;
  while ((m = reInches.exec(t)) !== null) push(Number(m[1]));

  const reGlued = /\b(\d{2,3})in(?=\s|[.,;]|$|[A-Za-z])/gi;
  while ((m = reGlued.exec(t)) !== null) push(Number(m[1]));

  const reWide = /\b(\d{2,3})\s*wide\b/gi;
  while ((m = reWide.exec(t)) !== null) push(Number(m[1]));

  /** "vanity at least 100" / "vanity minimum 84" (number after keyword). */
  const reVanityThenAtLeast =
    /\bvanity(?:\s+cabinet)?\b[^.]{0,80}?\b(?:at\s*least|atleast|minimum|min\.?)\s*(\d{2,3})\b/gi;
  while ((m = reVanityThenAtLeast.exec(t)) !== null) push(Number(m[1]));

  if (!candidates.length) return undefined;
  return Math.max(...candidates);
}

/** Combine measured job run width with widths parsed from user replacement text (use the larger). */
export function mergeVanityRunWidthInchesForRetail(
  fromJob?: number,
  fromUserText?: number,
): number | undefined {
  const a = fromJob != null && Number.isFinite(fromJob) ? fromJob : undefined;
  const b = fromUserText != null && Number.isFinite(fromUserText) ? fromUserText : undefined;
  if (a == null && b == null) return undefined;
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/** Prior / existing vanity cabinet width from scope, questionnaire, or notes (inches). */
export function extractPreviousVanityCabinetWidthInchesFromJobContext(jobContext: string): number | undefined {
  const jc = jobContext.replace(/\r\n/g, "\n");
  const patterns = [
    /\b(?:previous|old|existing|prior|original)\s+[^\n]{0,120}?\bvanity[^\n]{0,90}?\b(\d{2,3})\s*(?:"|''|inch(?:es)?|in\.?)\b/i,
    /\bvanity[^\n]{0,60}?\b(?:was|were|measured|about|around|roughly|~)\s*(\d{2,3})\s*(?:"|''|inch(?:es)?|in\.?)\b/i,
    /\b(?:replace|replacing)\s+(?:a\s+|the\s+)?(\d{2,3})\s*(?:"|''|inch(?:es)?|in\.?)[^\n]{0,50}\bvanity\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(jc);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 24 && n <= 120) return Math.round(n);
    }
  }
  const band = /\b(\d{2,3})\s*(?:-|–|to)\s*(\d{2,3})\s*(?:"|''|inch(?:es)?|in\.?)\s*(?:wide\s+)?(?:bathroom\s+)?vanity\b/i.exec(
    jc,
  );
  if (band) {
    const hi = Math.max(Number(band[1]), Number(band[2]));
    if (Number.isFinite(hi) && hi >= 24 && hi <= 120) return Math.round(hi);
  }
  return undefined;
}

export function extractHardMaxVanityCabinetWidthInchesFromJobContext(jobContext: string): number | undefined {
  const jc = jobContext.replace(/\r\n/g, "\n");
  const m =
    /\b(?:max|maximum|no\s+larger|at\s+most|up\s+to)\s+(\d{2,3})\s*(?:"|''|inch(?:es)?|in\.?)[^\n]{0,90}?\bvanity\b/i.exec(
      jc,
    ) ||
    /\bvanity[^\n]{0,100}?\b(?:max|maximum|no\s+larger|at\s+most|up\s+to)\s+(\d{2,3})\s*(?:"|''|inch(?:es)?|in\.?)\b/i.exec(
      jc,
    );
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 30 && n <= 144) return Math.round(n);
  }
  return undefined;
}

/**
 * Upper bound (in.) for vanity title scoring: narrative (previous / max phrasing), wall run,
 * or a tight band from the minimum width on single vanities when nothing else is known.
 */
export function resolveMaxVanityCabinetWidthInchesForRetail(
  line: { name: string; notes?: string; trade?: BidMaterialTrade },
  vanityRunInches: number | undefined,
  jobContext: string | undefined,
  minVanityInches: number | undefined,
): number | undefined {
  const jc = (jobContext ?? "").replace(/\r\n/g, "\n").trim();
  const lineText = `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ");
  const lineDouble =
    /\b(double\s+vanity|double\s+sink|integrated\s+sinks?|two\s*sink|dual\s*sink)\b/i.test(lineText);

  const hard = jc ? extractHardMaxVanityCabinetWidthInchesFromJobContext(jc) : undefined;
  const prev = jc ? extractPreviousVanityCabinetWidthInchesFromJobContext(jc) : undefined;
  const fromNarrative = hard ?? (prev != null ? prev + 12 : undefined);

  const structural =
    vanityRunInches != null && vanityRunInches >= 42 ? Math.max(42, vanityRunInches - 3) : undefined;

  const caps: number[] = [];
  if (fromNarrative != null) caps.push(fromNarrative);
  if (structural != null) caps.push(structural);
  if (
    !lineDouble &&
    minVanityInches != null &&
    minVanityInches >= 30 &&
    minVanityInches <= 54 &&
    fromNarrative == null &&
    structural == null
  ) {
    caps.push(minVanityInches + 16);
  }
  if (caps.length === 0) return undefined;
  const raw = Math.min(...caps);
  /** Do not cap search below an explicit large minimum (e.g. user asked 100" but job text still mentions an old 36" vanity). */
  if (minVanityInches != null && minVanityInches >= 60 && raw < minVanityInches) {
    return undefined;
  }
  return raw;
}

/** Lines that are not shoppable retail SKUs — skip SerpApi search. */
const SKIP_LINE_PATTERNS: RegExp[] = [
  /\bddemolition\b/i,
  /\bdemolition\b/i,
  /\bdemolishing\b/i,
  /\bdemolish(?:es|ed|ing)?\b/i,
  /\bdeconstruction\b/i,
  /\bdemo\s*[#\-–:]\s*/i,
  /\bdemo\b\s*(?:work|bathroom|kitchen|phase|and|\/)/i,
  /\bdemo\b.*\b(remove|tear|strip|existing|fixtures?|walls?|tile)\b/i,
  /\bremove\s+existing\b/i,
  /\bremove\s+(?:and\s+)?(?:tear|demolish)/i,
  /\bremove\s+(?:existing\s+)?(?:bathroom|fixtures|vanity|tub|shower|toilet|tile|surround)\b/i,
  /\btear\s*-?\s*down\b/i,
  /\btear\s*-?\s*out\b/i,
  /\brip\s*-?\s*out\b/i,
  /\bstrip\s*-?\s*out\b/i,
  /\bgutt(?:ing)?\b/i,
  /\bcut\s*-?\s*out\b/i,
  /\bjack\s*hammer/i,
  /\bhaul(ing)?\s+(away|off)\b/i,
  /\bdumpster\b/i,
  /\bdisposal\b/i,
  /\bpermit(\s+fee)?\b/i,
  /\binspection\s+fee\b/i,
  /\bengineering(\s+fee)?\b/i,
  /\bsupervision\b/i,
  /\bproject\s+management\b/i,
  /\bcoordination\s+fee\b/i,
  /\bmobilization\b/i,
  /\bcleanup\s+only\b/i,
  /\blabor\s+only\b/i,
  /\bgut\s+(the\s+)?(bathroom|kitchen|room)/i,
  /\b(misc|miscellaneous)\s+(installation\s+)?(fasteners|hardware|supplies|consumables)\b/i,
  /\b(all|misc|miscellaneous)\s+(required\s+)?(fasteners|screws|anchors|nails|hardware)\b/i,
  /\bfasteners?\s*(?:,|&|and)\s*(screws|anchors|nails|hardware)\b/i,
  /\bscrews\s*(?:,|&|and)\s*fasteners\b/i,
  /\binstallation\s+fasteners\b/i,
  /\bas\s+needed\s+for\s+installation\b/i,
  /covers?\s*:.+\b(fastener|screw|anchor|nail|hardware)\b.+,.*\b(fastener|screw|anchor|bolt)\b/i,
];

function normalizeLineTextForHd(line: { name: string; notes?: string }): string {
  return `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ").trim();
}

export function heuristicShouldSkipHomeDepotSearch(line: {
  name: string;
  notes?: string;
}): boolean {
  const t = normalizeLineTextForHd(line);
  return SKIP_LINE_PATTERNS.some((re) => re.test(t));
}

/** Clear SerpApi Home Depot fields when a line no longer qualifies or search is skipped. */
export function stripHomeDepotRetailFields(line: BidMaterialLine): BidMaterialLine {
  const out = { ...line };
  delete out.hd_product_url;
  delete out.hd_title;
  delete out.hd_unit_price_usd;
  delete out.hd_price_raw;
  delete out.hd_product_id;
  delete out.hd_fetched_at;
  delete out.hd_image_url;
  delete out.hd_price_was_usd;
  delete out.hd_percentage_off;
  delete out.hd_price_badge;
  if (out.mockup_shelf_retailer === "hd") {
    delete out.mockup_shelf_retailer;
  }
  return out;
}

/** Clear SerpApi Lowe's fields when a line no longer qualifies or search is skipped. */
export function stripLowesRetailFields(line: BidMaterialLine): BidMaterialLine {
  const out = { ...line };
  delete out.lw_product_url;
  delete out.lw_title;
  delete out.lw_unit_price_usd;
  delete out.lw_price_raw;
  delete out.lw_product_id;
  delete out.lw_fetched_at;
  delete out.lw_image_url;
  delete out.lw_price_was_usd;
  delete out.lw_percentage_off;
  delete out.lw_price_badge;
  if (out.mockup_shelf_retailer === "lw") {
    delete out.mockup_shelf_retailer;
  }
  return out;
}

/** Prefer full vanity SKUs over vanity tops when scope/line implies a cabinet/unit. */
export function normalizeVanityHomeDepotQuery(
  q: string,
  line: { name: string; notes?: string; trade?: BidMaterialTrade },
): string {
  const t = LINE(line);
  if (lineImpliesLightingFixture(t)) {
    return q.trim().replace(/\s+/g, " ").slice(0, 200);
  }
  if (!lineImpliesVanityCabinetRetailQuery(line)) {
    return q.trim().replace(/\s+/g, " ").slice(0, 200);
  }

  let out = q.trim().replace(/\s+/g, " ");
  if (/\bvanity\s+top\b/i.test(out)) {
    out = out.replace(/\bvanity\s+top\b/gi, "bathroom vanity cabinet");
  }
  if (!/\b(cabinet|combo|with\s+sink)\b/i.test(out)) {
    out = `${out} bathroom vanity cabinet sink`.replace(/\s+/g, " ").trim();
  }
  return out.slice(0, 200);
}

/**
 * Adds product-type hints for niche fixtures (e.g. square LED bathroom mirrors) so SerpApi
 * queries match shoppable SKUs.
 */
export function enhanceRetailSearchQuery(
  q: string,
  line: { name: string; notes?: string; trade?: BidMaterialTrade },
  opts?: { vanityRunWidthInches?: number },
): string {
  let out = normalizeVanityHomeDepotQuery(q, line);
  const t = LINE(line);
  if (lineTextImpliesSealantCaulkPrimaryRetail(t)) {
    const lead = "bathroom kitchen silicone sealant caulk waterproof";
    out = `${lead} ${out}`.replace(/\s+/g, " ").trim().slice(0, 200);
  }
  if (lineImpliesToiletFixturePrimaryRetail(t)) {
    const o = out.toLowerCase();
    if (
      !/\b(one[\s-]?piece|two[\s-]?piece|elongated|comfort\s+height|chair\s+height|gpf|complete\s+toilet|toilet\s+bowl)\b/i.test(
        o,
      )
    ) {
      out = `${out} two piece elongated toilet 1.28 gpf complete`.replace(/\s+/g, " ").trim().slice(0, 200);
    }
  }
  const tl = t.toLowerCase();
  const wIn = opts?.vanityRunWidthInches;
  const impliedDouble =
    /\bdouble\s+vanity\b|\bdouble\s+sink\b|\bintegrated\s+sinks?\b|\bvanity\s+with\s+integrated\b/i.test(tl);
  if (wIn != null && wIn >= 42 && lineImpliesVanityCabinetRetailQuery(line)) {
    if (!new RegExp(`\\b${wIn}\\s*in`, "i").test(out)) {
      const dbl = wIn >= 60 || impliedDouble ? " double sink" : "";
      out = `${out} ${wIn} inch wide bathroom vanity${dbl}`.replace(/\s+/g, " ").trim();
    }
  } else if (lineImpliesVanityCabinetRetailQuery(line) && impliedDouble) {
    const o = out.toLowerCase();
    if (!/\b(double|dual|two\s*sink|two\s*basin|60|72|84)\b/.test(o)) {
      out = `${out} double sink two basin bathroom vanity 60 inch`.replace(/\s+/g, " ").trim();
    }
  }
  if (/\btowel\s*warmer\b|\bheated\s*towel\s*rack\b|\bheated\s*towel\b/i.test(t)) {
    if (!/\b(heated|warmer)\b/i.test(out)) {
      out = `${out} heated towel warmer rack wall mount`.trim();
    }
    out = out.replace(/\s+/g, " ").trim();
  }
  if (/\bsmart\s*mirror\b|\bled\s+mirror\b|\bbacklit\s+mirror\b|\bled\s+vanity\s+mirror\b/i.test(t)) {
    if (/\bsquare\b|\b\d+\s*(?:in|"|inch|inches)\s*x\s*\d+\s*(?:in|"|inch|inches)/i.test(t)) {
      if (!/\bsquare\b/i.test(out)) {
        out = `${out} square`.trim();
      }
    }
    if (!/\b(led|smart|backlit)\b/i.test(out)) {
      out = `${out} LED smart`.trim();
    }
    if (!/\b(bathroom|bath)\b/i.test(out) && /\bbath(?:room)?\b/i.test(tl)) {
      out = `${out} bathroom`.trim();
    }
    out = out.replace(/\s+/g, " ").trim();
  }
  if (lineImpliesLightingFixture(t)) {
    let o = out;
    if (!/\b(light|lights|sconce|fixture|led|bath)\b/i.test(o)) {
      o = `${o} bathroom vanity light fixture wall`.trim();
    }
    out = o.replace(/\s+/g, " ").trim();
  }
  if (inferShowerWallTileOnlyFromLineText(t)) {
    if (!/\b(porcelain|ceramic|mosaic|wall\s+tile|shower)\b/i.test(out)) {
      out = `${out} shower wall porcelain ceramic tile`.trim();
    }
    out = out.replace(/\s+/g, " ").trim();
  }
  if (inferFloorFieldTileOnlyFromLineText(t)) {
    if (!/\b(floor|porcelain|ceramic)\b/i.test(out)) {
      out = `${out} bathroom floor porcelain ceramic tile`.trim();
    }
    out = out.replace(/\s+/g, " ").trim();
  }
  return out.slice(0, 200);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const slice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type ChatImagePart = {
  type: "image_url";
  image_url: { url: string; detail: "low" | "high" | "auto" };
};

type ChatTextPart = { type: "text"; text: string };

const RETAIL_QUERY_JOB_CHARS_NO_VISION = 6500;
const RETAIL_QUERY_JOB_CHARS_WITH_VISION = 4200;

/**
 * Uses job context + line to either skip retail search or produce a tight product search string.
 * Falls back to heuristic-only when apiKey is missing.
 */
export async function suggestHomeDepotSearchOrSkip(params: {
  apiKey: string | undefined;
  /** Composite: initial scope, Q&A, measurements, walkthrough (`buildCompositeScopeDescription`). */
  jobContext: string;
  bidTitle: string;
  line: { name: string; notes?: string; trade?: BidMaterialTrade };
  /** When set, user is replacing an existing HD match — prioritize this text in `q`. */
  replacementInstructions?: string;
  /** Signed HTTPS URLs — job **before** photos (max 4 used). Enables vision on the retail query model. */
  beforePhotoUrls?: string[];
  /** Signed URL for **this line's** contractor reference image (`reference_storage_path`), when present. */
  lineReferenceImageUrl?: string | null;
  /** Numbered list of all estimate lines (name + line notes) so `q` stays specific and avoids duplicate SKUs. */
  quoteLinesSummary?: string;
  /** Optional override for latency-sensitive UI flows. */
  timeoutMs?: number;
}): Promise<{ skip: boolean; searchQuery?: string; reason?: string }> {
  const replacement = params.replacementInstructions?.trim().slice(0, 500);
  const isReplacement = Boolean(replacement);
  const vanityFromJob = extractVanityCabinetRunWidthInchesFromJobContext(params.jobContext);
  const vanityFromReplacement = replacement
    ? extractMinVanityCabinetWidthInchesFromRetailText(replacement)
    : undefined;
  const vanityRunInches = mergeVanityRunWidthInchesForRetail(vanityFromJob, vanityFromReplacement);
  const enhanceOpts =
    vanityRunInches != null ? { vanityRunWidthInches: vanityRunInches } : undefined;

  if (!isReplacement && heuristicShouldSkipHomeDepotSearch(params.line)) {
    return { skip: true, reason: "heuristic_non_retail" };
  }

  const apiKey = params.apiKey?.trim();
  if (!apiKey) {
    const q = buildFallbackSearchQuery(params.jobContext, params.line, replacement, vanityRunInches);
    return { skip: false, searchQuery: q };
  }

  const beforeUrls = (params.beforePhotoUrls ?? []).filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 4);
  const lineRefUrl =
    typeof params.lineReferenceImageUrl === "string" &&
    params.lineReferenceImageUrl.startsWith("http")
      ? params.lineReferenceImageUrl
      : null;
  const hasVision = beforeUrls.length > 0 || Boolean(lineRefUrl);
  const jobLimit = hasVision ? RETAIL_QUERY_JOB_CHARS_WITH_VISION : RETAIL_QUERY_JOB_CHARS_NO_VISION;

  const jobSnippet = [
    params.bidTitle ? `Bid title: ${params.bidTitle}` : "",
    params.jobContext.trim().slice(0, jobLimit),
  ]
    .filter(Boolean)
    .join("\n\n");

  const quoteBlock = (params.quoteLinesSummary ?? "").trim().slice(0, 8500);

  const baseSystem = [
    "You help contractors pick Home Depot retail search strings (US).",
    "Return JSON only.",
    'If the line is NOT a purchasable product or material (demolition, tear-out, demo phase, gutting, rip-out, hauling, dumpster, permits, inspections, pure labor, supervision, engineering, project management, disposal labor), respond: {"skip":true,"reason":"short"}',
    'If it IS something you buy at a home center (fixtures, finishes, pipe, wire, tile, tools, consumables, bags, blades, etc.), respond: {"skip":false,"q":"12 words max, concrete product search, use job context (e.g. bathroom vs kitchen)."}',
    'If the line name or notes mention demolition, demo, gut, remove existing, haul-away, or similar — you MUST respond {"skip":true} even if the job is a remodel.',
    'If the line is a catch-all (e.g. "misc fasteners", "screws & anchors as needed", "covers: multiple screw types") with no single buying SKU, respond {"skip":true}. Home Depot search cannot match a basket line.',
    "Vanity: If the line describes a full vanity replacement/install and does NOT say vanity top/countertop only, q must target a bathroom vanity cabinet or vanity+sink combo — not a vanity top SKU. Vanities often exclude faucets; do not assume the SKU includes a faucet.",
    "Double / integrated-sink / two-basin vanity lines: q MUST include double sink or two basin (and usually 60–96 inch width) so results are not a single small 24–36 inch vanity unless the line explicitly says powder room or small vanity.",
    "When the job context includes a measured vanity/cabinet RUN width (feet or inches), q MUST repeat that approximate WIDTH in inches (e.g. 96 inch, 72 inch double) so search hits are full-width cabinets, not small parts or 19 inch components.",
    "Smart / LED / backlit mirrors: q must name the product (LED bathroom mirror, smart mirror), the room if bath, and shape (square, round, or dimensions) when the line specifies it — generic 'mirror' often misses SKUs.",
    "Bath lighting / vanity lights / sconces / fixtures: q must describe a light fixture (sconce, vanity light bar, LED bath light) — never a sink, faucet, toilet, or vanity cabinet SKU unless the line explicitly names plumbing.",
    "Trade `tile` (or line is clearly shower/floor/wall tile): q must target tile, porcelain/ceramic field tile, mosaic, grout, waterproofing, backer board, membrane, or Schluter/trim for wet areas — never a bathroom vanity cabinet, sink, faucet, or toilet unless that exact fixture is what this line is buying.",
    "Shower / tub wall TILE (not pan, not doors): q MUST include wall tile, porcelain, ceramic, or mosaic — never shower doors, glass enclosures, acrylic surrounds, drains, mixing valves, or vanity cabinets.",
    "When the line is **new shower pan AND tile walls** (or tub-to-shower + field tile on walls): q must target **separate** pan/base/receptor AND/OR **field wall tile** — never a **single-SKU alcove shower kit** with molded/composite/solid walls + pan (e.g. “alcove shower kit with walls”, “solid composite stone … shower kit”).",
    "Bathroom or room FLOOR tile: q MUST include floor tile or porcelain/ceramic floor tile — not shower wall tile, backsplash-only tile, or cabinetry.",
    "Trade `cabinetry` (vanity cabinet, combo, medicine cabinet): q targets cabinets/vanity units or cabinet hardware — not bulk shower floor tile unless the line explicitly says tile for the vanity area.",
    "Trade `plumbing` when the line is faucets/valves/drains: q must be the fitting (e.g. centerset bath faucet, widespread faucet) — not a vanity cabinet SKU. If the line text is only 'vanity faucets' / 'supply and install vanity faucets', q is a bathroom faucet, not a vanity cabinet.",
    "If the line mentions '(vanity run)' or 'at vanity' only as **where** a faucet or trim installs — but the line is **faucets / lavatory / deck-mount** — q is still a faucet SKU, never a vanity cabinet.",
    "Rough-in / 'plumbing connections' / supply lines / stub-outs for vanity+shower: q targets valves, supplies, traps, or rough-in kits — not a finished vanity cabinet unless the line explicitly buys a cabinet.",
    "Sealant / caulk / silicone (including 'for vanity and shower', 'at counter', 'tub and tile'): q MUST lead with caulk or silicone sealant (kitchen & bath, tub & tile, waterproof) — **vanity** or **shower** here means where it is applied, NOT a vanity cabinet, faucet, or shower door SKU.",
    "Toilet **fixture** lines (install/replace/new toilet, supply and install toilet): q must target a **complete toilet** SKU (one-piece or two-piece bowl+tank, elongated/round/comfort height, GPF) — never a toilet **repair kit**, fill valve, flapper, wax ring, tank rebuild kit, or universal toilet repair kit unless the line explicitly buys only that part.",
    "When a **Full quote (all lines)** section is present: each row is a different purchase. Form `q` only for **THIS line** (below). Avoid a search string that would return the same big-ticket SKU another line is already buying unless both lines explicitly buy that same item (e.g. matching sconces).",
    "When **before job photos** are attached: infer room type, obvious existing fixtures, and finishes only — `q` must still be a concrete Home Depot **product search string**, not a description of the photo.",
    "When a **Line reference image** is attached after site photos: use it for finish, color, or product shape for **this line only** — still output retailer search tokens in `q`.",
  ];

  const replacementSystem = isReplacement
    ? [
        "Replacement mode: the line already had a Home Depot product linked; the contractor wants a different SKU.",
        'You MUST respond {"skip":false,"q":"..."} with a tight search string unless the request is truly impossible as one retail product.',
        "PRIORITIZE the replacement request when forming q; combine it with the line name and job context.",
        "The search must target a DIFFERENT SKU than the current listing — include distinguishing details from the request: width in inches, single vs double bowl, depth, finish, or model family. Generic queries often repeat the same top result.",
        "When the replacement text gives a vanity or cabinet **minimum width in inches** (e.g. at least 100 inch, 100in wide), repeat that width explicitly in q (e.g. 100 inch bathroom vanity cabinet double sink) so results are full-width units, not small parts.",
      ]
    : [];

  const userParts = [
    "--- Initial scope + project Q&A + measurements + walkthrough (composite) ---",
    jobSnippet,
    "",
    ...(quoteBlock
      ? ["--- Full quote (all lines — each row is its own scope; avoid duplicate SKUs vs other rows) ---", quoteBlock, ""]
      : []),
    "--- THIS line's scope (prioritize for `q`) ---",
    `Name: ${params.line.name}`,
    `Notes: ${params.line.notes ?? ""}`,
    `Trade: ${params.line.trade ?? "general"}`,
  ];
  if (vanityRunInches != null && lineImpliesVanityCabinetRetailQuery(params.line)) {
    userParts.push(
      "",
      `Measurement hint: vanity/cabinet run along the wall is about ${vanityRunInches} inches — include that width (or "double vanity") in q when this line is a vanity cabinet.`,
    );
  }
  if (replacement) {
    userParts.push("", "--- Replacement request (what to find instead) ---", replacement);
  }

  const userText = userParts.join("\n");
  const userMessage:
    | string
    | Array<ChatTextPart | ChatImagePart> = (() => {
    if (!hasVision) return userText;
    const parts: Array<ChatTextPart | ChatImagePart> = [{ type: "text", text: userText }];
    for (const url of beforeUrls) {
      parts.push({ type: "image_url", image_url: { url, detail: "low" } });
    }
    if (lineRefUrl) {
      parts.push({
        type: "image_url",
        image_url: { url: lineRefUrl, detail: "low" },
      });
    }
    return parts;
  })();

  const timeoutRaw = process.env.RETAIL_QUERY_OPENAI_TIMEOUT_MS?.trim();
  const timeoutMs = params.timeoutMs ?? Number(timeoutRaw);
  const openAiMs = Number.isFinite(timeoutMs)
    ? Math.min(90_000, Math.max(5_000, Math.floor(timeoutMs)))
    : 22_000;
  const signal =
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
      ? AbortSignal.timeout(openAiMs)
      : (() => {
          const c = new AbortController();
          setTimeout(() => c.abort(), openAiMs);
          return c.signal;
        })();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: HD_QUERY_MODEL,
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: [...baseSystem, ...replacementSystem].join(" "),
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI retail query failed: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return {
      skip: false,
      searchQuery: buildFallbackSearchQuery(
        params.jobContext,
        params.line,
        replacement,
        vanityRunInches,
      ),
    };
  }

  if (parsed.skip === true && !isReplacement) {
    return {
      skip: true,
      reason: typeof parsed.reason === "string" ? parsed.reason : "model_skip",
    };
  }

  const q =
    typeof parsed.q === "string"
      ? parsed.q.trim().slice(0, 200)
      : typeof parsed.searchQuery === "string"
        ? parsed.searchQuery.trim().slice(0, 200)
        : "";

  if (!q) {
    return {
      skip: false,
      searchQuery: buildFallbackSearchQuery(
        params.jobContext,
        params.line,
        replacement,
        vanityRunInches,
      ),
    };
  }

  return { skip: false, searchQuery: enhanceRetailSearchQuery(q, params.line, enhanceOpts) };
}

/** When OpenAI is unavailable or errors: short context hint + line text. */
export function buildFallbackSearchQuery(
  jobContext: string,
  line: { name: string; notes?: string; trade?: BidMaterialTrade },
  replacementExtra?: string,
  vanityRunWidthInches?: number,
): string {
  const jc = jobContext.toLowerCase();
  let hint = "";
  if (/\bbathroom\b/.test(jc)) hint = "bathroom";
  else if (/\bkitchen\b/.test(jc)) hint = "kitchen";
  else if (/\bexterior\b|\bdeck\b|\broof\b/.test(jc)) hint = "";

  const core = [line.name.trim(), (line.notes ?? "").trim()].filter(Boolean).join(" ");
  const extra = replacementExtra?.trim().slice(0, 500);
  const merged = [hint, core, extra].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const vo =
    vanityRunWidthInches != null ? { vanityRunWidthInches: vanityRunWidthInches } : undefined;
  return enhanceRetailSearchQuery(merged, line, vo);
}
