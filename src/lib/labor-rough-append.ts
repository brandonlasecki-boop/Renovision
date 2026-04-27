import { randomUUID } from "crypto";
import type { BidMaterialLine, BidMaterialTrade } from "@/types/bid";

const TRADES_FOR_ROUGH_LABOR: BidMaterialTrade[] = [
  "tile",
  "plumbing",
  "electrical",
  "paint",
  "hvac",
  "drywall",
  "flooring",
  "cabinetry",
];

const LABOR_FACTOR: Partial<Record<BidMaterialTrade, number>> = {
  tile: 0.42,
  plumbing: 0.4,
  electrical: 0.38,
  paint: 0.22,
  hvac: 0.3,
  drywall: 0.5,
  flooring: 0.35,
  cabinetry: 0.35,
};

const LABOR_NAME: Partial<Record<BidMaterialTrade, string>> = {
  tile: "Rough tile labor (field install, typical bath)",
  plumbing: "Rough plumbing labor (fixtures, hookups, testing)",
  electrical: "Rough electrical labor (devices, terminations, typical bath)",
  paint: "Rough painting labor (walls/trim, typical bath)",
  hvac: "Rough HVAC labor (bath exhaust / minor duct, typical)",
  drywall: "Rough drywall labor (patch/repair, typical bath)",
  flooring: "Rough flooring labor (underlayment + install, typical)",
  cabinetry: "Rough cabinet / vanity labor (install, level, typical)",
};

const LABOR_KEYWORDS: Partial<Record<BidMaterialTrade, RegExp>> = {
  tile: /\b(tile|tiling|grout|backsplash)\b/i,
  plumbing: /\b(plumb|rough\s*in|drain|supply|fixture)\b/i,
  electrical: /\b(electric|wiring|receptacle|gfci|devices?)\b/i,
  paint: /\b(paint|painting|primer)\b/i,
  hvac: /\b(hvac|exhaust\s*fan|ventilation|duct)\b/i,
  drywall: /\b(drywall|sheetrock|mud|tape)\b/i,
  flooring: /\b(floor(?:ing)?|lvp|laminate|hardwood\s+floor)\b/i,
  cabinetry: /\b(cabinet|vanity\s+cabinet|vanity\s+combo|millwork)\b/i,
};

function lineLooksInstallableMaterial(line: BidMaterialLine): boolean {
  const t = line.trade ?? "general";
  if (t === "labor" || t === "permits" || t === "other") return false;
  const blob = `${line.name} ${line.notes ?? ""}`.toLowerCase();
  if (/\bdemo(?:lition)?\b|\bhaul(?:ing)?\b|\bdisposal\b|\bdump\b|\btip\s+fee\b|\bpermit\b|\bfee\b\s*only\b/i.test(blob)) {
    return false;
  }
  return true;
}

function sumMaterialExtendedForTrade(lines: BidMaterialLine[], trade: BidMaterialTrade): number {
  let s = 0;
  for (const l of lines) {
    if ((l.trade ?? "general") !== trade) continue;
    if (!lineLooksInstallableMaterial(l)) continue;
    const ext = Number(l.extended_usd);
    if (Number.isFinite(ext) && ext > 0) s += ext;
  }
  return Math.round(s * 100) / 100;
}

function hasRoughLaborForTrade(lines: BidMaterialLine[], trade: BidMaterialTrade): boolean {
  const kw = LABOR_KEYWORDS[trade];
  if (!kw) return false;
  return lines.some((l) => {
    if ((l.trade ?? "general") !== "labor") return false;
    const blob = `${l.name} ${l.notes ?? ""}`;
    return kw.test(blob);
  });
}

function roughLaborUsd(trade: BidMaterialTrade, materialExtended: number): number {
  const f = LABOR_FACTOR[trade] ?? 0.32;
  const raw = materialExtended * f;
  return Math.round(Math.min(12_000, Math.max(250, raw)));
}

/**
 * After per-line pricing, append one **labor** line per trade that has priced material lines
 * but no matching rough labor line yet (demo-only projects stay unchanged).
 */
export function appendMissingRoughLaborLines(lines: BidMaterialLine[]): BidMaterialLine[] {
  const tradesPresent = new Set<BidMaterialTrade>();
  for (const l of lines) {
    const tr = l.trade ?? "general";
    if (!TRADES_FOR_ROUGH_LABOR.includes(tr)) continue;
    if (!lineLooksInstallableMaterial(l)) continue;
    const ext = Number(l.extended_usd);
    const q = Math.max(0, Number(l.quantity) || 0);
    const uc = Number(l.unit_cost_usd);
    const hasPrice =
      (Number.isFinite(ext) && ext > 0) || (Number.isFinite(uc) && uc > 0 && q > 0 && Number.isFinite(l.unit_price_usd));
    if (!hasPrice) continue;
    tradesPresent.add(tr);
  }

  const out = [...lines];
  for (const trade of tradesPresent) {
    if (hasRoughLaborForTrade(out, trade)) continue;
    const materialSum = sumMaterialExtendedForTrade(out, trade);
    if (materialSum < 120) continue;
    const bump = roughLaborUsd(trade, materialSum);
    if (bump < 150) continue;
    const name = LABOR_NAME[trade] ?? `Rough ${trade} labor (typical install)`;
    out.push({
      line_id: randomUUID(),
      name,
      quantity: 1,
      unit: "ea",
      trade: "labor",
      unit_cost_usd: bump,
      markup_pct: 0,
      unit_price_usd: bump,
      extended_usd: bump,
      notes: "Ballpark install labor only — adjust for local rates and site conditions.",
    });
  }
  return out;
}
