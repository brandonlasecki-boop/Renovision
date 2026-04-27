import { lineShouldAutoEnableMockupInclude } from "@/lib/bid-mockup";
import {
  stripHomeDepotRetailFields,
  stripLowesRetailFields,
} from "@/lib/ai/homedepot-retail-query";
import type { HomeDepotSearchHit } from "@/lib/integrations/serpapi-homedepot";
import { normalizeHomedepotProductUrl } from "@/lib/integrations/serpapi-homedepot";
import type { LowesSearchHit } from "@/lib/integrations/serpapi-lowes";
import { normalizeShowerTileRetailUnitCost } from "@/lib/retail-tile-quantity";
import type { BidMaterialLine } from "@/types/bid";

/**
 * Treats shelf unit price as the homeowner-facing estimate per unit (no markup layer).
 */
function applyHomeDepotRetailToLineEstimate(
  line: BidMaterialLine,
  retailUnitUsd: number | null | undefined,
): void {
  if (retailUnitUsd == null || !Number.isFinite(retailUnitUsd) || retailUnitUsd < 0) {
    return;
  }
  const cost = Math.round(retailUnitUsd * 100) / 100;
  line.unit_cost_usd = cost;
  line.markup_pct = 0;
  const sell = cost;
  line.unit_price_usd = sell;
  const q = Math.max(0, Number(line.quantity) || 0);
  line.extended_usd = Math.round(q * sell * 100) / 100;
  delete line.pricing_approved;
}

/** Product title for the retailer whose unit price “won” for shelf pricing (HD vs Lowe’s). */
function shelfWinningProductTitle(line: BidMaterialLine): string {
  const ht = (line.hd_title ?? "").trim();
  const lt = (line.lw_title ?? "").trim();
  const hd = line.hd_unit_price_usd;
  const lw = line.lw_unit_price_usd;
  if (hd != null && lw != null && Number.isFinite(hd) && Number.isFinite(lw)) {
    return lw < hd - 1e-6 ? lt : ht;
  }
  if (lw != null && Number.isFinite(lw) && lt) return lt;
  return ht || lt;
}

const VANITY_STOCK_NOTE_TAG = "Retail sizing note:";

export function maybeAppendVanityStockNote(line: BidMaterialLine, vanityRunInches?: number): void {
  if (!vanityRunInches || vanityRunInches < 72) return;
  const blob = `${line.name} ${line.notes ?? ""}`;
  if (!/\bvanity\b/i.test(blob) || /\bvanity\s+top\b/i.test(blob)) return;
  if ((line.notes ?? "").includes(VANITY_STOCK_NOTE_TAG)) return;
  const ft = (vanityRunInches / 12).toFixed(1).replace(/\.0$/, "");
  const msg = `${VANITY_STOCK_NOTE_TAG} Measurements suggest a long cabinet run (~${ft} ft along the wall). Single-stock vanities rarely span that full width—paired cabinets, fillers, semi-custom, or shop-built millwork are common; verify shelf SKUs against field dimensions before ordering.`;
  line.notes = line.notes?.trim() ? `${line.notes.trim()}\n\n${msg}` : msg;
}

/** Sets unit sell/cost from one retailer only (after user picks a shelf SKU). */
export function applyShelfPriceFromChosenRetailer(
  line: BidMaterialLine,
  retailer: "home_depot" | "lowes",
): void {
  const u = retailer === "home_depot" ? line.hd_unit_price_usd : line.lw_unit_price_usd;
  applyHomeDepotRetailToLineEstimate(line, u ?? null);
  line.mockup_include = lineShouldAutoEnableMockupInclude(line);
  const title = retailer === "home_depot" ? (line.hd_title ?? "").trim() : (line.lw_title ?? "").trim();
  normalizeShowerTileRetailUnitCost(line, title);
}

/** Uses the lower of Home Depot and Lowe's shelf prices when both exist for material cost. */
export function applyRetailShelfFromLowest(line: BidMaterialLine): void {
  const hd = line.hd_unit_price_usd;
  const lw = line.lw_unit_price_usd;
  const candidates: number[] = [];
  if (hd != null && Number.isFinite(hd)) candidates.push(hd);
  if (lw != null && Number.isFinite(lw)) candidates.push(lw);
  if (candidates.length === 0) return;
  const best = Math.min(...candidates);
  applyHomeDepotRetailToLineEstimate(line, best);
  line.mockup_include = lineShouldAutoEnableMockupInclude(line);
  normalizeShowerTileRetailUnitCost(line, shelfWinningProductTitle(line));
}

/**
 * When both Home Depot and Lowe's are linked, keep only the winning shelf listing on the line
 * (lowest unit shelf price; tie or missing price on one side → Home Depot). Re-applies sell/cost
 * from that retailer only.
 */
export function collapseLineToSingleWinningRetailer(line: BidMaterialLine): void {
  const hdUrl = (line.hd_product_url ?? "").trim();
  const lwUrl = (line.lw_product_url ?? "").trim();
  if (!hdUrl || !lwUrl) return;

  const hp = line.hd_unit_price_usd;
  const lp = line.lw_unit_price_usd;
  const hdOk = hp != null && Number.isFinite(hp);
  const lwOk = lp != null && Number.isFinite(lp);

  let winner: "home_depot" | "lowes";
  if (hdOk && lwOk) {
    winner = lp < hp - 1e-6 ? "lowes" : "home_depot";
  } else if (lwOk && !hdOk) {
    winner = "lowes";
  } else if (hdOk && !lwOk) {
    winner = "home_depot";
  } else {
    winner = "home_depot";
  }

  const stripped =
    winner === "lowes" ? stripHomeDepotRetailFields(line) : stripLowesRetailFields(line);
  for (const k of Object.keys(line)) {
    if (!(k in stripped)) delete (line as Record<string, unknown>)[k];
  }
  Object.assign(line, stripped);
  applyShelfPriceFromChosenRetailer(line, winner);
}

export function mergeHomeDepotSearchHitIntoLine(line: BidMaterialLine, hit: HomeDepotSearchHit): void {
  line.hd_product_url = normalizeHomedepotProductUrl(hit.link, {
    productId: hit.product_id,
    title: hit.title,
  });
  line.hd_title = hit.title;
  line.hd_unit_price_usd = hit.price_usd;
  line.hd_price_raw = hit.price_raw;
  if (hit.price_was_usd != null && hit.price_was_usd > hit.price_usd) {
    line.hd_price_was_usd = hit.price_was_usd;
  } else {
    delete line.hd_price_was_usd;
  }
  if (hit.percentage_off != null && hit.percentage_off > 0) {
    line.hd_percentage_off = hit.percentage_off;
  } else {
    delete line.hd_percentage_off;
  }
  if (hit.price_badge != null && String(hit.price_badge).trim()) {
    line.hd_price_badge = String(hit.price_badge).trim().slice(0, 80);
  } else {
    delete line.hd_price_badge;
  }
  line.hd_product_id = hit.product_id;
  line.hd_fetched_at = new Date().toISOString();
  if (hit.image_url) {
    line.hd_image_url = hit.image_url;
  } else {
    delete line.hd_image_url;
  }
}

export function mergeLowesSearchHitIntoLine(line: BidMaterialLine, hit: LowesSearchHit): void {
  line.lw_product_url = hit.link;
  line.lw_title = hit.title;
  line.lw_unit_price_usd = hit.price_usd;
  line.lw_price_raw = hit.price_raw;
  if (hit.price_was_usd != null && hit.price_was_usd > hit.price_usd) {
    line.lw_price_was_usd = hit.price_was_usd;
  } else {
    delete line.lw_price_was_usd;
  }
  if (hit.percentage_off != null && hit.percentage_off > 0) {
    line.lw_percentage_off = hit.percentage_off;
  } else {
    delete line.lw_percentage_off;
  }
  if (hit.price_badge != null && String(hit.price_badge).trim()) {
    line.lw_price_badge = String(hit.price_badge).trim().slice(0, 80);
  } else {
    delete line.lw_price_badge;
  }
  line.lw_product_id = hit.product_id;
  line.lw_fetched_at = new Date().toISOString();
  if (hit.image_url) {
    line.lw_image_url = hit.image_url;
  } else {
    delete line.lw_image_url;
  }
}

export function applySerpHomeDepotHitToLine(line: BidMaterialLine, hit: HomeDepotSearchHit): void {
  mergeHomeDepotSearchHitIntoLine(line, hit);
  applyRetailShelfFromLowest(line);
}

export function applySerpLowesHitToLine(line: BidMaterialLine, hit: LowesSearchHit): void {
  mergeLowesSearchHitIntoLine(line, hit);
  applyRetailShelfFromLowest(line);
}
