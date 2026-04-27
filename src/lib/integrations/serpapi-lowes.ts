/**
 * Lowe's product discovery via SerpApi Google search (`site:lowes.com`).
 * SerpApi does not offer a dedicated Lowe's engine; results are best-effort — verify on lowes.com.
 */

import { lineQualifiesForHomeDepotPricing } from "@/lib/integrations/serpapi-homedepot";
import {
  compareRetailTitleScores,
  inferFloorFieldTileOnlyFromLineText,
  inferShowerWallTileOnlyFromLineText,
  inferSiteBuiltShowerTileWallLineRetail,
  scoreRetailProductTitleForLine,
  shouldApplyRetailSealantCaulkTitleHardGate,
  shouldApplyRetailShowerWetAreaShellTitleHardGate,
  shouldApplyRetailTileFieldTitleHardGate,
  shouldApplyRetailToiletFixtureTitleHardGate,
  titlePassesRetailSealantCaulkHardGate,
  titlePassesRetailShowerWetAreaShellHardGate,
  titlePassesRetailTileFieldHardGate,
  titlePassesRetailToiletFixtureHardGate,
  type RetailTitleScoreHint,
} from "@/lib/integrations/retail-search-relevance";
import { productTitleIsPrefabShowerWallKit } from "@/lib/retail-tile-quantity";
import type { BidMaterialTrade } from "@/types/bid";

function mergeLowesRetailHint(
  line: { name: string; notes?: string; trade?: BidMaterialTrade } | undefined,
  base?: RetailTitleScoreHint,
): RetailTitleScoreHint | undefined {
  const out: RetailTitleScoreHint = { ...(base ?? {}) };
  const t = line?.trade;
  if (t && t !== "general") out.lineTrade = t;
  const lt = line ? `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ").trim() : "";
  if (lt && inferShowerWallTileOnlyFromLineText(lt)) {
    out.showerWallTileOnly = true;
  }
  if (lt && inferSiteBuiltShowerTileWallLineRetail(lt) && !inferShowerWallTileOnlyFromLineText(lt)) {
    out.siteBuiltShowerTileWalls = true;
  }
  if (lt && inferFloorFieldTileOnlyFromLineText(lt)) {
    out.floorFieldTileOnly = true;
  }
  if (
    out.minVanityCabinetWidthInches == null &&
    out.maxVanityCabinetWidthInches == null &&
    out.lineTrade == null &&
    !out.showerWallTileOnly &&
    !out.floorFieldTileOnly &&
    !out.siteBuiltShowerTileWalls
  ) {
    return undefined;
  }
  return out;
}

const SERPAPI_SEARCH = "https://serpapi.com/search.json";

export { lineQualifiesForHomeDepotPricing as lineQualifiesForLowesPricing };

export type LowesSearchHit = {
  title: string;
  link: string;
  price_usd: number;
  price_raw?: string;
  price_was_usd?: number;
  percentage_off?: number;
  price_badge?: string | null;
  product_id?: string;
  image_url?: string;
};

function stripPrefabWallKitsForSiteBuiltShowerTileLowes<T extends { h: LowesSearchHit }>(
  lineText: string,
  scored: T[],
): T[] {
  if (!inferSiteBuiltShowerTileWallLineRetail(lineText)) return scored;
  const noPrefab = scored.filter((x) => !productTitleIsPrefabShowerWallKit(x.h.title));
  return noPrefab.length > 0 ? noPrefab : scored;
}

export function normalizeLowesProductUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    const withProto =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const u = new URL(withProto);
    if (!u.hostname.toLowerCase().includes("lowes.com")) return trimmed;
    u.protocol = "https:";
    if (u.hostname.toLowerCase() === "m.lowes.com") u.hostname = "www.lowes.com";
    return u.toString();
  } catch {
    return trimmed;
  }
}

/** Typical PDP: /pd/slug/501234567 */
export function extractLowesProductIdFromUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const u = new URL(withProto);
    if (!u.hostname.toLowerCase().includes("lowes.com")) return null;
    const segs = u.pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1];
    if (last && /^\d{6,12}$/.test(last)) return last;
  } catch {
    /* ignore */
  }
  return null;
}

/** Pull first plausible USD amount from free text (snippet / rich result). */
function extractPriceFromSnippetText(text: string): number | null {
  const re = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/g;
  let best: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = Number.parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0.01 && n < 500_000) {
      best = n;
      break;
    }
  }
  return best;
}

function isLowesProductPath(link: string): boolean {
  try {
    const u = new URL(link);
    return /\/pd\//i.test(u.pathname);
  } catch {
    return /\/pd\//i.test(link);
  }
}

/** SerpApi/Google sometimes nest thumbnail URLs in arrays of arrays of strings. */
function collectHttpUrlsFromThumbnailsField(raw: unknown, out: string[]): void {
  if (typeof raw === "string" && raw.trim().startsWith("http")) {
    out.push(raw.trim());
    return;
  }
  if (!Array.isArray(raw)) return;
  for (const item of raw) {
    collectHttpUrlsFromThumbnailsField(item, out);
  }
}

function pushImageObjectFields(rec: Record<string, unknown>, out: string[]): void {
  for (const k of ["link", "url", "src", "original", "thumbnail"]) {
    const v = rec[k];
    if (typeof v === "string" && v.trim().startsWith("http")) out.push(v.trim());
  }
}

/**
 * Collects image URL candidates from one SerpApi Google `organic_results` row (same shapes as
 * the Home Depot Serp integration uses). Google often omits `thumbnail` for some rows;
 * `serpapi_thumbnail`, `thumbnails`, or `images` may still carry a usable product image.
 */
export function pickLowesGoogleOrganicProductImageUrl(
  organicRow: Record<string, unknown>,
): string | undefined {
  const candidates: string[] = [];
  const t0 = organicRow.thumbnail;
  if (typeof t0 === "string" && t0.trim().startsWith("http")) candidates.push(t0.trim());
  const t1 = organicRow.serpapi_thumbnail;
  if (typeof t1 === "string" && t1.trim().startsWith("http")) candidates.push(t1.trim());
  collectHttpUrlsFromThumbnailsField(organicRow.thumbnails, candidates);
  const imgs = organicRow.images;
  if (Array.isArray(imgs)) {
    for (const item of imgs) {
      if (typeof item === "string" && item.trim().startsWith("http")) {
        candidates.push(item.trim());
        continue;
      }
      if (item && typeof item === "object") {
        pushImageObjectFields(item as Record<string, unknown>, candidates);
      }
    }
  }
  const inline = organicRow.inline_images;
  if (Array.isArray(inline)) {
    for (const item of inline) {
      if (item && typeof item === "object") {
        pushImageObjectFields(item as Record<string, unknown>, candidates);
      }
    }
  }

  for (const c of candidates) {
    if (isAllowedLowesProductImageUrl(c)) return c;
  }
  return undefined;
}

function richSnippetToText(r: unknown): string {
  if (!r || typeof r !== "object") return "";
  try {
    return JSON.stringify(r);
  } catch {
    return "";
  }
}

function priceFromOrganicFields(o: Record<string, unknown>, title: string, snippet: string): number | null {
  const blob = `${snippet} ${richSnippetToText(o.rich_snippet)} ${title}`;
  const fromText = extractPriceFromSnippetText(blob);
  if (fromText != null) return fromText;
  const pr = o.price;
  if (typeof pr === "number" && Number.isFinite(pr) && pr > 0.01 && pr < 500_000) return pr;
  if (typeof pr === "string") {
    const n = Number.parseFloat(pr.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0.01 && n < 500_000) return n;
  }
  return null;
}

function organicRecordToHit(o: Record<string, unknown>): LowesSearchHit | null {
  const linkRaw = typeof o.link === "string" ? o.link.trim() : "";
  if (!linkRaw.startsWith("http") || !/lowes\.com/i.test(linkRaw)) return null;
  if (!isLowesProductPath(linkRaw)) return null;

  const title =
    typeof o.title === "string"
      ? o.title.replace(/\s*[-|]\s*Lowe'?s.*$/i, "").trim().slice(0, 500)
      : "Product";
  const snippet = typeof o.snippet === "string" ? o.snippet : "";
  const priceUsd = priceFromOrganicFields(o, title, snippet);
  if (priceUsd == null) return null;

  const link = normalizeLowesProductUrl(linkRaw);
  const id = extractLowesProductIdFromUrl(link) ?? undefined;
  const thumb = pickLowesGoogleOrganicProductImageUrl(o);
  const price_raw = `$${priceUsd.toFixed(2)}`;

  return {
    title: title || "Product",
    link,
    price_usd: Math.round(priceUsd * 100) / 100,
    price_raw,
    ...(id ? { product_id: id } : {}),
    ...(thumb ? { image_url: thumb } : {}),
  };
}

function collectOrganicResults(json: Record<string, unknown>): Record<string, unknown>[] {
  const org = json.organic_results;
  if (!Array.isArray(org)) return [];
  const out: Record<string, unknown>[] = [];
  for (const r of org) {
    if (r && typeof r === "object") out.push(r as Record<string, unknown>);
  }
  return out;
}

export function isAllowedLowesProductImageUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h.includes("lowes.com")) return true;
    if (h.endsWith(".lowes.com")) return true;
    if (h === "embed.widencdn.net") return true;
    if (h.endsWith(".scene7.com")) return true;
    if (h === "encrypted-tbn0.gstatic.com" || h.endsWith(".gstatic.com")) return true;
    /** Google image cache — common in organic `thumbnail` for retail SERPs. */
    if (/^lh\d+\.googleusercontent\.com$/i.test(h)) return true;
    if (h.endsWith("serpapi.com")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Search Lowe's product pages via Google `site:lowes.com` (SerpApi `engine=google`).
 */
export async function searchLowesProduct(
  query: string,
  options?: {
    preferSale?: boolean;
    line?: { name: string; notes?: string; trade?: BidMaterialTrade };
    /** Skip these Lowe's item numbers (digits) so replace-search returns a different SKU. */
    excludeProductIds?: string[];
    minVanityCabinetWidthInches?: number;
    maxVanityCabinetWidthInches?: number;
  },
): Promise<LowesSearchHit | null> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not set.");
  }

  const q = query.trim().slice(0, 200);
  if (!q) return null;

  const fullQuery = `${q} site:lowes.com`;

  const params = new URLSearchParams({
    engine: "google",
    q: fullQuery,
    api_key: apiKey,
    num: "10",
    gl: "us",
    hl: "en",
  });

  const res = await fetch(`${SERPAPI_SEARCH}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpApi error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (json.error) {
    throw new Error(String(json.error));
  }

  const organic = collectOrganicResults(json);
  const preferSale = options?.preferSale === true;

  const hits: LowesSearchHit[] = [];
  for (const o of organic) {
    const hit = organicRecordToHit(o);
    if (hit) hits.push(hit);
  }

  if (hits.length === 0) return null;

  const exclude = new Set<string>();
  for (const id of options?.excludeProductIds ?? []) {
    const d = String(id).replace(/\D/g, "");
    if (d.length >= 6 && d.length <= 12) exclude.add(d);
  }

  const line = options?.line;
  const lineText = line
    ? `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ").trim()
    : "";

  const baseHint: RetailTitleScoreHint = {};
  if (options?.minVanityCabinetWidthInches != null && options.minVanityCabinetWidthInches > 0) {
    baseHint.minVanityCabinetWidthInches = options.minVanityCabinetWidthInches;
  }
  if (options?.maxVanityCabinetWidthInches != null && options.maxVanityCabinetWidthInches > 0) {
    baseHint.maxVanityCabinetWidthInches = options.maxVanityCabinetWidthInches;
  }
  const hint = mergeLowesRetailHint(line, Object.keys(baseHint).length > 0 ? baseHint : undefined);

  let ordered = hits;
  if (lineText) {
    let scored = hits.map((h) => ({
      h,
      s: scoreRetailProductTitleForLine(lineText, h.title, hint),
    }));
    scored.sort((a, b) => compareRetailTitleScores(a.s, b.s));
    if (shouldApplyRetailTileFieldTitleHardGate(lineText, hint)) {
      const gated = scored.filter((x) => titlePassesRetailTileFieldHardGate(x.h.title));
      if (gated.length > 0) scored = gated;
    }
    if (shouldApplyRetailSealantCaulkTitleHardGate(lineText)) {
      const gated = scored.filter((x) => titlePassesRetailSealantCaulkHardGate(x.h.title));
      if (gated.length > 0) scored = gated;
    }
    if (shouldApplyRetailToiletFixtureTitleHardGate(lineText)) {
      const gated = scored.filter((x) => titlePassesRetailToiletFixtureHardGate(x.h.title));
      if (gated.length > 0) scored = gated;
    }
    if (shouldApplyRetailShowerWetAreaShellTitleHardGate(lineText)) {
      const gated = scored.filter((x) => titlePassesRetailShowerWetAreaShellHardGate(x.h.title));
      if (gated.length > 0) scored = gated;
    }
    scored = stripPrefabWallKitsForSiteBuiltShowerTileLowes(lineText, scored);
    ordered = scored.map((x) => x.h);
  }

  if (exclude.size > 0) {
    ordered = ordered.filter((h) => {
      const pid = h.product_id?.replace(/\D/g, "") ?? extractLowesProductIdFromUrl(h.link);
      return !pid || !exclude.has(pid);
    });
  }
  if (ordered.length === 0) return null;

  if (!preferSale) return ordered[0] ?? null;

  const saleHit = ordered.find(
    (h) =>
      (h.price_was_usd != null && h.price_was_usd > h.price_usd) ||
      (h.percentage_off != null && h.percentage_off > 0) ||
      (h.price_badge != null && String(h.price_badge).trim().length > 0),
  );
  return saleHit ?? ordered[0] ?? null;
}

/** Up to `max` distinct Lowe's hits for UI pickers (same search as {@link searchLowesProduct}). */
export async function searchLowesProductCandidates(
  query: string,
  options?: {
    preferSale?: boolean;
    line?: { name: string; notes?: string; trade?: BidMaterialTrade };
    excludeProductIds?: string[];
    max?: number;
    minVanityCabinetWidthInches?: number;
    maxVanityCabinetWidthInches?: number;
  },
): Promise<LowesSearchHit[]> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not set.");
  }

  const q = query.trim().slice(0, 200);
  if (!q) return [];

  const fullQuery = `${q} site:lowes.com`;
  const params = new URLSearchParams({
    engine: "google",
    q: fullQuery,
    api_key: apiKey,
    num: "12",
    gl: "us",
    hl: "en",
  });

  const res = await fetch(`${SERPAPI_SEARCH}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpApi error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (json.error) {
    throw new Error(String(json.error));
  }

  const organic = collectOrganicResults(json);
  const preferSale = options?.preferSale === true;
  const rawHits: LowesSearchHit[] = [];
  for (const o of organic) {
    const hit = organicRecordToHit(o);
    if (hit) rawHits.push(hit);
  }
  if (rawHits.length === 0) return [];

  const exclude = new Set<string>();
  for (const id of options?.excludeProductIds ?? []) {
    const d = String(id).replace(/\D/g, "");
    if (d.length >= 6 && d.length <= 12) exclude.add(d);
  }

  const line = options?.line;
  const lineText = line
    ? `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ").trim()
    : "";
  const baseHint: RetailTitleScoreHint = {};
  if (options?.minVanityCabinetWidthInches != null && options.minVanityCabinetWidthInches > 0) {
    baseHint.minVanityCabinetWidthInches = options.minVanityCabinetWidthInches;
  }
  if (options?.maxVanityCabinetWidthInches != null && options.maxVanityCabinetWidthInches > 0) {
    baseHint.maxVanityCabinetWidthInches = options.maxVanityCabinetWidthInches;
  }
  const hint = mergeLowesRetailHint(line, Object.keys(baseHint).length > 0 ? baseHint : undefined);

  let ordered = rawHits;
  if (lineText) {
    let scored = rawHits.map((h) => ({
      h,
      s: scoreRetailProductTitleForLine(lineText, h.title, hint),
    }));
    scored.sort((a, b) => compareRetailTitleScores(a.s, b.s));
    if (shouldApplyRetailTileFieldTitleHardGate(lineText, hint)) {
      const gated = scored.filter((x) => titlePassesRetailTileFieldHardGate(x.h.title));
      if (gated.length > 0) scored = gated;
    }
    if (shouldApplyRetailSealantCaulkTitleHardGate(lineText)) {
      const gated = scored.filter((x) => titlePassesRetailSealantCaulkHardGate(x.h.title));
      if (gated.length > 0) scored = gated;
    }
    if (shouldApplyRetailToiletFixtureTitleHardGate(lineText)) {
      const gated = scored.filter((x) => titlePassesRetailToiletFixtureHardGate(x.h.title));
      if (gated.length > 0) scored = gated;
    }
    if (shouldApplyRetailShowerWetAreaShellTitleHardGate(lineText)) {
      const gated = scored.filter((x) => titlePassesRetailShowerWetAreaShellHardGate(x.h.title));
      if (gated.length > 0) scored = gated;
    }
    scored = stripPrefabWallKitsForSiteBuiltShowerTileLowes(lineText, scored);
    ordered = scored.map((x) => x.h);
  }

  let filtered = ordered;
  if (exclude.size > 0) {
    filtered = ordered.filter((h) => {
      const pid = h.product_id?.replace(/\D/g, "") ?? extractLowesProductIdFromUrl(h.link);
      return !pid || !exclude.has(pid);
    });
  }

  const max = Math.min(6, Math.max(1, options?.max ?? 3));
  const out: LowesSearchHit[] = [];
  const seen = new Set<string>();
  for (const h of filtered) {
    const pid = h.product_id?.replace(/\D/g, "") ?? extractLowesProductIdFromUrl(h.link) ?? h.link;
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push(h);
    if (out.length >= max) break;
  }
  if (!preferSale) return out;

  const saleFirst = [...out].sort((a, b) => {
    const as =
      (a.price_was_usd != null && a.price_was_usd > a.price_usd) ||
      (a.percentage_off != null && a.percentage_off > 0)
        ? 1
        : 0;
    const bs =
      (b.price_was_usd != null && b.price_was_usd > b.price_usd) ||
      (b.percentage_off != null && b.percentage_off > 0)
        ? 1
        : 0;
    if (as !== bs) return bs - as;
    return 0;
  });
  return saleFirst;
}

/**
 * Resolve a pasted Lowe's URL to shelf pricing using Google search for that item number / URL.
 */
export async function fetchLowesProductFromUrl(
  rawUrl: string,
): Promise<LowesSearchHit | null> {
  const id = extractLowesProductIdFromUrl(rawUrl);
  const q = id ? `${id} site:lowes.com` : `${rawUrl.trim()} site:lowes.com`.slice(0, 200);
  return searchLowesProduct(q, { preferSale: false });
}
