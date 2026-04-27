/**
 * Home Depot product search via SerpApi (https://serpapi.com) — not an official THD API.
 * Requires SERPAPI_API_KEY. Results are best-effort; always verify price and SKU on homedepot.com.
 */

import type { BidMaterialTrade } from "@/types/bid";
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
  titlePassesRetailShowerBaseDimensionHardGate,
  titlePassesRetailShowerWetAreaShellHardGate,
  titlePassesRetailTileFieldHardGate,
  titlePassesRetailToiletFixtureHardGate,
  type RetailTitleScoreHint,
} from "@/lib/integrations/retail-search-relevance";
import { productTitleIsPrefabShowerWallKit } from "@/lib/retail-tile-quantity";

const SERPAPI_SEARCH = "https://serpapi.com/search.json";
const DEFAULT_SERPAPI_FETCH_TIMEOUT_MS = 15_000;

/** Labor and permit lines are skipped — no retail SKU to match. */
export function lineQualifiesForHomeDepotPricing(trade?: BidMaterialTrade): boolean {
  const t = trade ?? "general";
  return t !== "labor" && t !== "permits";
}

export type HomeDepotSearchHit = {
  title: string;
  link: string;
  price_usd: number;
  price_raw?: string;
  /** Prior shelf price when item is on promotion (SerpApi `price_was`). */
  price_was_usd?: number;
  percentage_off?: number;
  price_badge?: string | null;
  product_id?: string;
  /** CDN URL from SerpApi (typically images.thdstatic.com) — catalog product photo. */
  image_url?: string;
};

/** Only allow known Home Depot image CDNs (avoid open redirect / SSRF if a malicious URL were stored). */
export function isAllowedHomedepotProductImageUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return (
      h === "images.thdstatic.com" ||
      h.endsWith(".thdstatic.com") ||
      /** SerpApi / storefront sometimes serve the same asset tree from GCP (Netify: images.homedepot-static.com). */
      h === "images.homedepot-static.com" ||
      h.endsWith(".homedepot-static.com") ||
      h === "images.homedepot.com" ||
      h.endsWith(".images.homedepot.com")
    );
  } catch {
    return false;
  }
}

/** Walk SerpApi `thumbnails` — often `[[ "url", ... ]]` (nested arrays of strings). */
function collectUrlsFromThumbnailsField(raw: unknown, out: string[]): void {
  if (typeof raw === "string" && raw.startsWith("http")) {
    out.push(raw);
    return;
  }
  if (!Array.isArray(raw)) return;
  for (const item of raw) {
    collectUrlsFromThumbnailsField(item, out);
  }
}

/** SerpApi search uses `thumbnails`; product API uses `images` / `thumbnail`. */
function extractProductImageUrl(hit: Record<string, unknown>): string | undefined {
  const candidates: string[] = [];
  const t1 = hit.thumbnail;
  if (typeof t1 === "string" && t1.startsWith("http")) candidates.push(t1);
  const t2 = hit.serpapi_thumbnail;
  if (typeof t2 === "string" && t2.startsWith("http")) candidates.push(t2);
  collectUrlsFromThumbnailsField(hit.thumbnails, candidates);
  const imgs = hit.images;
  if (Array.isArray(imgs)) {
    for (const item of imgs) {
      if (typeof item === "string" && item.startsWith("http")) {
        candidates.push(item);
        continue;
      }
      if (item && typeof item === "object") {
        const u = (item as Record<string, unknown>).link;
        if (typeof u === "string" && u.startsWith("http")) candidates.push(u);
        const v = (item as Record<string, unknown>).url;
        if (typeof v === "string" && v.startsWith("http")) candidates.push(v);
      }
    }
  }
  for (const c of candidates) {
    if (isAllowedHomedepotProductImageUrl(c)) return c.trim();
  }
  return undefined;
}

/**
 * SerpApi often returns `apionline.homedepot.com` (API/CDN). That host returns Akamai "Access Denied"
 * in a normal browser. Rewrite to the public `www.homedepot.com` storefront; same `/p/...` path works.
 */
function slugifyHomeDepotProductTitle(title: string): string {
  return title
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

export function normalizeHomedepotProductUrl(
  raw: string,
  opts?: { productId?: string | number; title?: string },
): string {
  const trimmed = raw.trim();
  const extractedPid = trimmed ? extractHomedepotProductIdFromUrl(trimmed) : null;
  const pidRaw =
    opts?.productId != null ? String(opts.productId).replace(/\D/g, "") : (extractedPid ?? "");
  const pid = pidRaw.length >= 6 && pidRaw.length <= 12 ? pidRaw : "";
  const titleSlug = opts?.title ? slugifyHomeDepotProductTitle(opts.title) : "";
  if (!trimmed) {
    return pid ? `https://www.homedepot.com/p/${titleSlug || "Product"}/${pid}` : raw;
  }
  try {
    const withProto =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const u = new URL(withProto);
    const host = u.hostname.toLowerCase();
    if (!host.endsWith("homedepot.com")) return trimmed;

    if (host === "apionline.homedepot.com" || host.startsWith("apionline.")) {
      u.hostname = "www.homedepot.com";
    }
    u.protocol = "https:";
    if (pid) {
      const segments = u.pathname.split("/").filter(Boolean);
      const hasProductPath = segments[0]?.toLowerCase() === "p";
      const urlPid = extractHomedepotProductIdFromUrl(u.toString());
      if (!hasProductPath || urlPid !== pid || host.startsWith("apionline.")) {
        return `https://www.homedepot.com/p/${titleSlug || "Product"}/${pid}`;
      }
    }
    return u.toString();
  } catch {
    return pid ? `https://www.homedepot.com/p/${titleSlug || "Product"}/${pid}` : trimmed;
  }
}

/**
 * Extracts numeric Home Depot product id from a storefront or mobile URL.
 * Typical path: /p/Product-Name/206667220
 */
export function extractHomedepotProductIdFromUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const u = new URL(withProto);
    const host = u.hostname.toLowerCase();
    if (!host.endsWith("homedepot.com")) return null;

    const segments = u.pathname.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d{6,12}$/.test(segments[i])) return segments[i];
    }

    for (const key of ["productId", "omsid", "itemId"]) {
      const v = u.searchParams.get(key);
      if (!v) continue;
      const digits = v.replace(/\D/g, "");
      if (digits.length >= 6 && digits.length <= 12) return digits;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parsePriceUsd(p: unknown): number | null {
  if (typeof p === "number" && Number.isFinite(p) && p >= 0) return p;
  if (typeof p === "string") {
    const n = Number.parseFloat(p.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    for (const k of ["value", "amount", "current", "final", "price", "display", "currency_value"]) {
      const n = parsePriceUsd(o[k]);
      if (n != null) return n;
    }
  }
  return null;
}

function serpApiFetchSignal(): AbortSignal | undefined {
  const raw = process.env.SERPAPI_FETCH_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  const ms = Number.isFinite(n)
    ? Math.max(3_000, Math.min(60_000, Math.floor(n)))
    : DEFAULT_SERPAPI_FETCH_TIMEOUT_MS;
  if (
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
  ) {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

/** SerpApi / THD payloads sometimes move list price off `price` — try common aliases. */
function extractHomeDepotProductPriceUsd(o: Record<string, unknown>): number | null {
  const keys = [
    "price",
    "primary_price",
    "final_price",
    "current_price",
    "unit_price",
    "list_price",
    "sell_price",
    "customer_price",
  ];
  for (const k of keys) {
    const v = parsePriceUsd(o[k]);
    if (v != null) return v;
  }
  return null;
}

function isOnSaleProduct(o: Record<string, unknown>): boolean {
  const price = extractHomeDepotProductPriceUsd(o);
  const was = parsePriceUsd(o.price_was);
  if (price != null && was != null && was > price + 0.009) return true;
  const pctRaw = o.percentage_off;
  const pct =
    typeof pctRaw === "number"
      ? pctRaw
      : typeof pctRaw === "string"
        ? Number.parseFloat(pctRaw)
        : NaN;
  if (Number.isFinite(pct) && pct > 0) return true;
  const badge = o.price_badge;
  if (typeof badge === "string" && badge.trim().length > 0) return true;
  const saving = o.price_saving;
  if (typeof saving === "number" && saving > 0) return true;
  return false;
}

/** SerpApi sometimes lists extras outside `products` — merge and de-dupe by product id or link. */
function eachProductLikeRowFromHomeDepotSearchJson(json: Record<string, unknown>): Record<string, unknown>[] {
  const keys = ["products", "related_products", "sponsored_products"] as const;
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const k of keys) {
    const arr = json[k];
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      const link = typeof o.link === "string" ? o.link : "";
      const pid = o.product_id != null ? String(o.product_id).replace(/\D/g, "") : "";
      const dedupe = (pid.length >= 6 ? pid : "") || link.slice(0, 120);
      if (!dedupe || seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(o);
    }
  }
  return out;
}

function collectPricedProducts(json: Record<string, unknown>): Record<string, unknown>[] {
  const rows = eachProductLikeRowFromHomeDepotSearchJson(json);
  const out: Record<string, unknown>[] = [];
  for (const o of rows) {
    const link = typeof o.link === "string" && o.link.startsWith("http") ? o.link : null;
    if (!link) continue;
    const priceUsd = extractHomeDepotProductPriceUsd(o);
    if (priceUsd == null) continue;
    out.push({ ...o, price: priceUsd });
  }
  return out;
}

function productRecordTitle(hit: Record<string, unknown>): string {
  const t = hit.title;
  if (typeof t === "string" && t.trim()) return t.trim();
  const n = hit.name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return "";
}

function productRecordHomedepotId(hit: Record<string, unknown>): string | null {
  const raw = hit.product_id;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = String(Math.trunc(raw)).replace(/\D/g, "");
    if (d.length >= 6 && d.length <= 12) return d;
  }
  if (typeof raw === "string" && raw.trim()) {
    const d = raw.replace(/\D/g, "");
    if (d.length >= 6 && d.length <= 12) return d;
  }
  const link = typeof hit.link === "string" ? hit.link : "";
  return link ? extractHomedepotProductIdFromUrl(link) : null;
}

/**
 * Picks a search result: uses line text to avoid wrong categories (e.g. sink vs vanity light).
 * Optionally prefer the first item that looks on sale among the best-scoring candidates.
 * `excludeIds` skips SKUs (e.g. when replacing a product so the same result is not re-selected).
 */
function mergeRetailScoreHint(
  line: { name: string; notes?: string; trade?: BidMaterialTrade } | undefined,
  scoreHint?: RetailTitleScoreHint,
): RetailTitleScoreHint | undefined {
  const out: RetailTitleScoreHint = { ...(scoreHint ?? {}) };
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

/** Drop foam / glue-up surround kits when the line is field tile on shower walls (e.g. tub-to-shower + tile walls). */
function stripPrefabWallKitsForSiteBuiltShowerTileLine<
  T extends { p: Record<string, unknown> },
>(lineText: string, scored: T[]): T[] {
  if (!inferSiteBuiltShowerTileWallLineRetail(lineText)) return scored;
  const noPrefab = scored.filter((x) => !productTitleIsPrefabShowerWallKit(productRecordTitle(x.p)));
  return noPrefab.length > 0 ? noPrefab : scored;
}

function pickBestPricedProduct(
  json: Record<string, unknown>,
  preferSale: boolean,
  line?: { name: string; notes?: string; trade?: BidMaterialTrade },
  excludeIds?: Set<string>,
  scoreHint?: RetailTitleScoreHint,
): Record<string, unknown> | null {
  let list = collectPricedProducts(json);
  if (list.length === 0) return null;

  if (excludeIds && excludeIds.size > 0) {
    list = list.filter((p) => {
      const pid = productRecordHomedepotId(p);
      return !pid || !excludeIds.has(pid);
    });
  }
  if (list.length === 0) return null;

  const lineText = line
    ? `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ").trim()
    : "";

  if (!lineText) {
    if (!preferSale) return list[0];
    const saleHit = list.find(isOnSaleProduct);
    return saleHit ?? list[0];
  }

  const hint = mergeRetailScoreHint(line, scoreHint);
  let scored = list.map((p) => ({
    p,
    s: scoreRetailProductTitleForLine(lineText, productRecordTitle(p), hint),
  }));
  scored.sort((a, b) => compareRetailTitleScores(a.s, b.s));

  if (shouldApplyRetailTileFieldTitleHardGate(lineText, hint)) {
    const gated = scored.filter((x) => titlePassesRetailTileFieldHardGate(productRecordTitle(x.p)));
    if (gated.length > 0) scored = gated;
  }

  if (shouldApplyRetailSealantCaulkTitleHardGate(lineText)) {
    const gated = scored.filter((x) => titlePassesRetailSealantCaulkHardGate(productRecordTitle(x.p)));
    if (gated.length > 0) scored = gated;
  }

  if (shouldApplyRetailToiletFixtureTitleHardGate(lineText)) {
    const gated = scored.filter((x) => titlePassesRetailToiletFixtureHardGate(productRecordTitle(x.p)));
    if (gated.length > 0) scored = gated;
  }

  if (shouldApplyRetailShowerWetAreaShellTitleHardGate(lineText)) {
    const gated = scored.filter((x) => titlePassesRetailShowerWetAreaShellHardGate(productRecordTitle(x.p)));
    if (gated.length > 0) scored = gated;
  }

  const dimensionGated = scored.filter((x) =>
    titlePassesRetailShowerBaseDimensionHardGate(productRecordTitle(x.p), hint),
  );
  if (dimensionGated.length !== scored.length) {
    scored = dimensionGated;
  }

  scored = stripPrefabWallKitsForSiteBuiltShowerTileLine(lineText, scored);
  if (scored.length === 0) return null;

  const topScore = scored[0]?.s ?? 0;
  const band = scored.filter((x) => x.s >= topScore - 12);

  if (!preferSale) {
    return band[0]?.p ?? scored[0]!.p;
  }

  const saleInBand = band.find((x) => isOnSaleProduct(x.p));
  if (saleInBand) return saleInBand.p;
  const saleAny = scored.find((x) => isOnSaleProduct(x.p));
  return saleAny?.p ?? scored[0]!.p;
}

/** Top distinct SKUs after title scoring — for UI pickers (e.g. first 3 matches). */
function pickTopDistinctPricedProducts(
  json: Record<string, unknown>,
  preferSale: boolean,
  line: { name: string; notes?: string; trade?: BidMaterialTrade } | undefined,
  excludeIds: Set<string> | undefined,
  limit: number,
  scoreHint?: RetailTitleScoreHint,
): Record<string, unknown>[] {
  let list = collectPricedProducts(json);
  if (list.length === 0) return [];

  if (excludeIds && excludeIds.size > 0) {
    list = list.filter((p) => {
      const pid = productRecordHomedepotId(p);
      return !pid || !excludeIds.has(pid);
    });
  }
  if (list.length === 0) return [];

  const lineText = line
    ? `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ").trim()
    : "";
  if (!lineText) {
    const out: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const p of list) {
      if (preferSale && out.length === 0) {
        const sale = list.find(isOnSaleProduct);
        if (sale) {
          const id = productRecordHomedepotId(sale) ?? productRecordTitle(sale);
          if (!seen.has(id)) {
            seen.add(id);
            out.push(sale);
          }
        }
      }
      const pid = productRecordHomedepotId(p) ?? productRecordTitle(p);
      if (seen.has(pid)) continue;
      seen.add(pid);
      out.push(p);
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
  }

  const hint = mergeRetailScoreHint(line, scoreHint);
  let scored = list.map((p) => ({
    p,
    s: scoreRetailProductTitleForLine(lineText, productRecordTitle(p), hint),
    sale: isOnSaleProduct(p),
  }));
  scored.sort((a, b) => {
    if (preferSale && a.sale !== b.sale) return a.sale ? -1 : 1;
    return compareRetailTitleScores(a.s, b.s);
  });

  if (shouldApplyRetailTileFieldTitleHardGate(lineText, hint)) {
    const gated = scored.filter((x) => titlePassesRetailTileFieldHardGate(productRecordTitle(x.p)));
    if (gated.length > 0) scored = gated;
  }

  if (shouldApplyRetailSealantCaulkTitleHardGate(lineText)) {
    const gated = scored.filter((x) => titlePassesRetailSealantCaulkHardGate(productRecordTitle(x.p)));
    if (gated.length > 0) scored = gated;
  }

  if (shouldApplyRetailToiletFixtureTitleHardGate(lineText)) {
    const gated = scored.filter((x) => titlePassesRetailToiletFixtureHardGate(productRecordTitle(x.p)));
    if (gated.length > 0) scored = gated;
  }

  if (shouldApplyRetailShowerWetAreaShellTitleHardGate(lineText)) {
    const gated = scored.filter((x) => titlePassesRetailShowerWetAreaShellHardGate(productRecordTitle(x.p)));
    if (gated.length > 0) scored = gated;
  }

  const dimensionGated = scored.filter((x) =>
    titlePassesRetailShowerBaseDimensionHardGate(productRecordTitle(x.p), hint),
  );
  if (dimensionGated.length !== scored.length) {
    scored = dimensionGated;
  }

  scored = stripPrefabWallKitsForSiteBuiltShowerTileLine(lineText, scored);
  if (scored.length === 0) return [];

  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const x of scored) {
    const pid = productRecordHomedepotId(x.p) ?? productRecordTitle(x.p);
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push(x.p);
    if (out.length >= limit) break;
  }
  return out;
}

function formatHdShelfPriceRaw(params: {
  priceUsd: number;
  priceWasUsd?: number;
  percentageOff?: number;
  badge?: string | null;
}): string {
  const { priceUsd, priceWasUsd, percentageOff, badge } = params;
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const parts: string[] = [];
  const onSale = priceWasUsd != null && priceWasUsd > priceUsd + 0.009;
  if (onSale) {
    parts.push(`Was ${fmt(priceWasUsd!)}`, `Now ${fmt(priceUsd)}`);
  } else {
    parts.push(fmt(priceUsd));
  }
  if (percentageOff != null && percentageOff > 0) {
    parts.push(`${Math.round(percentageOff)}% off`);
  }
  if (typeof badge === "string" && badge.trim()) {
    parts.push(badge.trim());
  }
  return parts.join(" · ");
}

/** SerpApi product detail sometimes nests sale info under `promotion`. */
function enrichHitFromPromotion(hit: Record<string, unknown>): void {
  const prom = hit.promotion;
  if (!prom || typeof prom !== "object") return;
  const o = prom as Record<string, unknown>;
  if (hit.price_was == null && o.original != null) {
    const w = parsePriceUsd(o.original);
    if (w != null) hit.price_was = w;
  }
  if (hit.percentage_off == null && o.percentage != null) {
    const p = typeof o.percentage === "number" ? o.percentage : Number(o.percentage);
    if (Number.isFinite(p)) hit.percentage_off = p;
  }
}

function homeDepotProductRecordToHit(hit: Record<string, unknown>): HomeDepotSearchHit | null {
  enrichHitFromPromotion(hit);
  const link = typeof hit.link === "string" && hit.link.startsWith("http") ? hit.link : null;
  if (!link) return null;

  const title = typeof hit.title === "string" ? hit.title.trim() : "Product";
  const priceUsd = extractHomeDepotProductPriceUsd(hit);
  if (priceUsd == null) return null;

  const priceWasUsd = parsePriceUsd(hit.price_was) ?? undefined;
  const pctRaw = hit.percentage_off;
  const percentageOff =
    typeof pctRaw === "number"
      ? pctRaw
      : typeof pctRaw === "string"
        ? Number.parseFloat(pctRaw)
        : undefined;
  const price_badge =
    typeof hit.price_badge === "string"
      ? hit.price_badge.trim()
      : hit.price_badge === null
        ? null
        : undefined;

  const price_raw = formatHdShelfPriceRaw({
    priceUsd,
    priceWasUsd,
    percentageOff: Number.isFinite(percentageOff) ? percentageOff : undefined,
    badge: price_badge,
  });

  const product_id =
    typeof hit.product_id === "string"
      ? hit.product_id
      : typeof hit.product_id === "number" && Number.isFinite(hit.product_id)
        ? String(Math.trunc(hit.product_id))
        : undefined;
  const image_url = extractProductImageUrl(hit);

  return {
    title: title.slice(0, 500),
    link: normalizeHomedepotProductUrl(link, { productId: product_id, title }),
    price_usd: Math.round(priceUsd * 100) / 100,
    price_raw,
    ...(priceWasUsd != null ? { price_was_usd: Math.round(priceWasUsd * 100) / 100 } : {}),
    ...(Number.isFinite(percentageOff) && (percentageOff as number) > 0
      ? { percentage_off: Math.round(percentageOff as number) }
      : {}),
    ...(price_badge !== undefined ? { price_badge } : {}),
    ...(product_id ? { product_id } : {}),
    ...(image_url ? { image_url } : {}),
  };
}

async function fetchHomeDepotSearchEngineJson(
  apiKey: string,
  query: string,
  opts: { deliveryZip?: string; storeId?: string },
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    engine: "home_depot",
    q: query.trim().slice(0, 200),
    country: "us",
    api_key: apiKey,
  });
  if (opts.deliveryZip?.trim()) {
    params.set("delivery_zip", opts.deliveryZip.trim().slice(0, 10));
  }
  if (opts.storeId?.trim()) {
    params.set("store_id", opts.storeId.trim());
  }

  const res = await fetch(`${SERPAPI_SEARCH}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: serpApiFetchSignal(),
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
  return json;
}

/**
 * Returns a search hit for a query (US store by default).
 * When `preferSale` is true, uses the first result that looks on sale (was price, % off, or badge), else first priced.
 * Retries with no ZIP and/or a simpler line-based query when the catalog returns no priced rows (ZIP localization can empty results).
 */
export async function searchHomeDepotProduct(
  query: string,
  options?: {
    deliveryZip?: string;
    storeId?: string;
    preferSale?: boolean;
    /** When set, product titles are scored against this line to reduce category mismatches. */
    line?: { name: string; notes?: string; trade?: BidMaterialTrade };
    /** Skip these Home Depot numeric product IDs (digits only), e.g. when replacing the current SKU. */
    excludeProductIds?: string[];
    /** Prefer vanity cabinet SKUs near this width when scoring titles (from room measurements). */
    minVanityCabinetWidthInches?: number;
    /** Penalize vanity SKUs wider than this when scoring titles (previous size / wall band). */
    maxVanityCabinetWidthInches?: number;
    /** Prefer shower bases/pans close to this long side from room measurements. */
    showerBaseTargetLengthInches?: number;
    /** Prefer shower bases/pans close to this short side from room measurements. */
    showerBaseTargetWidthInches?: number;
  },
): Promise<HomeDepotSearchHit | null> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not set.");
  }

  const q = query.trim().slice(0, 200);
  if (!q) return null;

  const preferSale = options?.preferSale === true;
  const exclude = new Set<string>();
  for (const id of options?.excludeProductIds ?? []) {
    const d = String(id).replace(/\D/g, "");
    if (d.length >= 6 && d.length <= 12) exclude.add(d);
  }
  const baseHint: RetailTitleScoreHint = {};
  if (options?.minVanityCabinetWidthInches != null && options.minVanityCabinetWidthInches > 0) {
    baseHint.minVanityCabinetWidthInches = options.minVanityCabinetWidthInches;
  }
  if (options?.maxVanityCabinetWidthInches != null && options.maxVanityCabinetWidthInches > 0) {
    baseHint.maxVanityCabinetWidthInches = options.maxVanityCabinetWidthInches;
  }
  if (options?.showerBaseTargetLengthInches != null && options.showerBaseTargetLengthInches > 0) {
    baseHint.showerBaseTargetLengthInches = options.showerBaseTargetLengthInches;
  }
  if (options?.showerBaseTargetWidthInches != null && options.showerBaseTargetWidthInches > 0) {
    baseHint.showerBaseTargetWidthInches = options.showerBaseTargetWidthInches;
  }
  const hint = mergeRetailScoreHint(
    options?.line,
    Object.keys(baseHint).length > 0 ? baseHint : undefined,
  );

  type Attempt = { q: string; deliveryZip?: string };
  const attempts: Attempt[] = [];
  const seen = new Set<string>();
  const addAttempt = (a: Attempt) => {
    const sig = `${a.q.trim().toLowerCase()}|${a.deliveryZip ?? ""}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    attempts.push(a);
  };

  addAttempt({ q, deliveryZip: options?.deliveryZip });
  if (options?.deliveryZip?.trim()) {
    addAttempt({ q, deliveryZip: undefined });
  }
  const lineQ = options?.line
    ? buildLineSearchQuery(options.line).replace(/\s+/g, " ").trim().slice(0, 160)
    : "";
  if (lineQ.length > 4 && lineQ.toLowerCase() !== q.trim().toLowerCase()) {
    addAttempt({ q: lineQ, deliveryZip: undefined });
  }

  const storeId = options?.storeId;
  for (const att of attempts) {
    const json = await fetchHomeDepotSearchEngineJson(apiKey, att.q, {
      deliveryZip: att.deliveryZip,
      storeId,
    });
    const raw = pickBestPricedProduct(json, preferSale, options?.line, exclude, hint);
    if (!raw) continue;
    const hit = homeDepotProductRecordToHit(raw);
    if (hit) return hit;
  }

  return null;
}

/**
 * Same search as {@link searchHomeDepotProduct}, but returns up to `max` distinct priced SKUs for UI selection.
 */
export async function searchHomeDepotProductCandidates(
  query: string,
  options?: {
    deliveryZip?: string;
    storeId?: string;
    preferSale?: boolean;
    line?: { name: string; notes?: string; trade?: BidMaterialTrade };
    excludeProductIds?: string[];
    max?: number;
    minVanityCabinetWidthInches?: number;
    maxVanityCabinetWidthInches?: number;
    showerBaseTargetLengthInches?: number;
    showerBaseTargetWidthInches?: number;
  },
): Promise<HomeDepotSearchHit[]> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not set.");
  }

  const q = query.trim().slice(0, 200);
  if (!q) return [];

  const params = new URLSearchParams({
    engine: "home_depot",
    q,
    country: "us",
    api_key: apiKey,
  });
  if (options?.deliveryZip?.trim()) {
    params.set("delivery_zip", options.deliveryZip.trim().slice(0, 10));
  }
  if (options?.storeId?.trim()) {
    params.set("store_id", options.storeId.trim());
  }

  const res = await fetch(`${SERPAPI_SEARCH}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: serpApiFetchSignal(),
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

  const preferSale = options?.preferSale === true;
  const exclude = new Set<string>();
  for (const id of options?.excludeProductIds ?? []) {
    const d = String(id).replace(/\D/g, "");
    if (d.length >= 6 && d.length <= 12) exclude.add(d);
  }
  const max = Math.min(6, Math.max(1, options?.max ?? 3));
  const baseHint: RetailTitleScoreHint = {};
  if (options?.minVanityCabinetWidthInches != null && options.minVanityCabinetWidthInches > 0) {
    baseHint.minVanityCabinetWidthInches = options.minVanityCabinetWidthInches;
  }
  if (options?.maxVanityCabinetWidthInches != null && options.maxVanityCabinetWidthInches > 0) {
    baseHint.maxVanityCabinetWidthInches = options.maxVanityCabinetWidthInches;
  }
  if (options?.showerBaseTargetLengthInches != null && options.showerBaseTargetLengthInches > 0) {
    baseHint.showerBaseTargetLengthInches = options.showerBaseTargetLengthInches;
  }
  if (options?.showerBaseTargetWidthInches != null && options.showerBaseTargetWidthInches > 0) {
    baseHint.showerBaseTargetWidthInches = options.showerBaseTargetWidthInches;
  }
  const hint = mergeRetailScoreHint(
    options?.line,
    Object.keys(baseHint).length > 0 ? baseHint : undefined,
  );
  const rawList = pickTopDistinctPricedProducts(
    json,
    preferSale,
    options?.line,
    exclude,
    max,
    hint,
  );
  const hits: HomeDepotSearchHit[] = [];
  for (const raw of rawList) {
    const h = homeDepotProductRecordToHit(raw);
    if (h) hits.push(h);
  }
  return hits;
}

/**
 * Product detail page via SerpApi `engine=home_depot_product` (use after user pastes a product URL).
 */
export async function fetchHomeDepotProductByProductId(
  productId: string,
  options?: { deliveryZip?: string },
): Promise<HomeDepotSearchHit | null> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not set.");
  }

  const id = productId.replace(/\D/g, "");
  if (id.length < 6) return null;

  const params = new URLSearchParams({
    engine: "home_depot_product",
    product_id: id,
    country: "us",
    api_key: apiKey,
  });
  if (options?.deliveryZip?.trim()) {
    params.set("delivery_zip", options.deliveryZip.trim().slice(0, 10));
  }

  const res = await fetch(`${SERPAPI_SEARCH}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: serpApiFetchSignal(),
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

  const pr = json.product_results;
  if (!pr || typeof pr !== "object" || Array.isArray(pr)) return null;
  const hit = pr as Record<string, unknown>;

  const linkRaw =
    typeof hit.link === "string" && hit.link.startsWith("http")
      ? hit.link
      : typeof hit.canonical_link === "string" && hit.canonical_link.startsWith("http")
        ? hit.canonical_link
        : null;
  if (!linkRaw) return null;

  const title =
    typeof hit.title === "string"
      ? hit.title.trim()
      : typeof hit.name === "string"
        ? hit.name.trim()
        : "Product";
  hit.title = title;
  hit.link = linkRaw;

  const priceUsd =
    extractHomeDepotProductPriceUsd(hit) ??
    parsePriceUsd(hit.primary_price) ??
    parsePriceUsd(hit.price_string);
  if (priceUsd == null) return null;

  if (hit.price == null) hit.price = priceUsd;

  const product_id =
    typeof hit.product_id === "string"
      ? hit.product_id
      : typeof hit.product_id === "number"
        ? String(hit.product_id)
        : id;
  hit.product_id = product_id;

  const mapped = homeDepotProductRecordToHit(hit);
  if (!mapped) return null;
  return { ...mapped, product_id: mapped.product_id ?? String(product_id) };
}

/**
 * Final gate before showing or saving a Home Depot product: the candidate must resolve through
 * SerpApi's product endpoint and expose a catalog image for the line-item card/mockup.
 */
export async function verifyHomeDepotSearchHitForProductLink(
  hit: HomeDepotSearchHit,
  options?: { deliveryZip?: string },
): Promise<HomeDepotSearchHit | null> {
  const productId =
    hit.product_id?.replace(/\D/g, "") || extractHomedepotProductIdFromUrl(hit.link);
  if (!productId) return null;
  const verified = await fetchHomeDepotProductByProductId(productId, options);
  if (!verified?.image_url?.trim()) return null;
  return verified;
}

export function buildLineSearchQuery(line: { name: string; notes?: string }): string {
  const parts = [line.name.trim(), (line.notes ?? "").trim()].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
}
