import { randomUUID } from "crypto";
import { parseQuestionnaire } from "@/lib/bid-scope";
import type { BidMaterialLine, BidMaterialTrade } from "@/types/bid";

/**
 * Remodel deliverables we enforce if the contractor (or their Q&A answers) name them.
 * Order: more specific patterns first where needed.
 */
const COVERAGE_RULES: {
  /** Match contractor text */
  pattern: RegExp;
  /** Must appear in a line name or notes (substring match, case-insensitive) */
  mustAppearInLines: RegExp;
  injectName: string;
  trade?: BidMaterialTrade;
  notes?: string;
}[] = [
  {
    pattern: /\bvanities\b|\bvanity\b/i,
    // Avoid treating "vanity faucet" alone as covering a full vanity — require cabinet/unit language.
    mustAppearInLines:
      /\bvanities\b|\bvanity\s+(cabinet|combo|unit|replacement|install|supply|sink)\b|\bvanity\s+—|bathroom\s+vanity\b|new\s+vanity\b|replace\s+(the\s+)?vanity\b/i,
    injectName: "Vanity — contractor-stated scope",
    trade: "cabinetry",
    notes: "Include per contractor scope; align finish and rough-in with existing bath.",
  },
  {
    pattern: /\bmedicine\s+cabinet\b/i,
    mustAppearInLines: /\bmedicine\s+cabinet\b/i,
    injectName: "Medicine cabinet — contractor-stated scope",
    trade: "cabinetry",
  },
  {
    pattern: /\btoilet\b|\bwater\s*closet\b|\bwc\b/i,
    mustAppearInLines: /\btoilet\b|\bwater\s*closet\b/i,
    injectName: "Toilet — contractor-stated scope",
    trade: "plumbing",
  },
  {
    pattern: /\bsink\b|\bundermount\b|\bvessel\s+sink\b/i,
    mustAppearInLines: /\bsink\b/i,
    injectName: "Sink — contractor-stated scope",
    trade: "plumbing",
  },
  {
    pattern: /\bfaucet\b/i,
    mustAppearInLines: /\bfaucet\b/i,
    injectName: "Faucet — contractor-stated scope",
    trade: "plumbing",
  },
  {
    pattern: /\bwalk-?in\s+shower\b|\bshower\b/i,
    mustAppearInLines: /\bshower\b/i,
    injectName: "Shower work — contractor-stated scope",
    trade: "tile",
  },
  {
    pattern: /\bbathtub\b|\bsoaking\s+tub\b|\btub\s+replacement\b|\btub\b/i,
    mustAppearInLines: /\bbathtub\b|\btub\b/i,
    injectName: "Tub — contractor-stated scope",
    trade: "plumbing",
  },
  {
    pattern: /\bcountertops?\b|\bquartz\b|\bgranite\b/i,
    mustAppearInLines: /\bcountertop\b|\bquartz\b|\bgranite\b/i,
    injectName: "Countertop — contractor-stated scope",
    trade: "cabinetry",
  },
  {
    pattern: /\bcabinets?\b|\bcabinetry\b|\bkitchen\s+cabinets?\b/i,
    mustAppearInLines: /\bcabinets?\b|\bcabinetry\b/i,
    injectName: "Cabinets / cabinetry — contractor-stated scope",
    trade: "cabinetry",
  },
  {
    pattern: /\bflooring\b|\brefinish\s+floors?\b|\bnew\s+floors?\b|\bfloor\s+tile\b/i,
    mustAppearInLines: /\bflooring\b|\bfloor(s)?\b/i,
    injectName: "Flooring — contractor-stated scope",
    trade: "flooring",
  },
  {
    pattern: /\bbacksplash\b/i,
    mustAppearInLines: /\bbacksplash\b/i,
    injectName: "Backsplash — contractor-stated scope",
    trade: "tile",
  },
  {
    pattern:
      /\bwall\s+tile\b|\bshower\s+tile\b|\bfloor\s+tile\b|\btile\s+work\b|\bretile\b|\btile\s+to\b|\bwith\s+tile\b/i,
    mustAppearInLines: /\btile\b/i,
    injectName: "Tile work — contractor-stated scope",
    trade: "tile",
  },
  {
    pattern: /\bmirror\b/i,
    mustAppearInLines: /\bmirror\b/i,
    injectName: "Mirror — contractor-stated scope",
    trade: "general",
  },
  {
    pattern: /\blighting\b|\bsconces?\b|\bfixture\s+replacement\b/i,
    mustAppearInLines: /\blighting\b|\bsconces?\b/i,
    injectName: "Lighting — contractor-stated scope",
    trade: "electrical",
  },
  {
    pattern: /\bpaint\b|\brepaint\b|\bfresh\s+paint\b|\bwall\s+paint\b/i,
    mustAppearInLines: /\bpaint\b/i,
    injectName: "Paint — contractor-stated scope",
    trade: "paint",
  },
  {
    pattern: /\bdemolition\b|\bgut\b|\bfull\s+gut\b/i,
    mustAppearInLines: /\bdemolition\b|\bgut\b/i,
    injectName: "Demolition / gut — contractor-stated scope",
    trade: "labor",
  },
];

function coverageTextFromBidFields(input: {
  scope_description: string;
  project_questionnaire?: unknown;
}): string {
  const parts: string[] = [];
  const base = input.scope_description?.trim() ?? "";
  if (base) parts.push(base);
  for (const q of parseQuestionnaire(input.project_questionnaire)) {
    const a = (q.answer ?? "").trim();
    if (a) parts.push(a);
    const other = q.other_text?.trim();
    if (other) parts.push(other);
  }
  return parts.join("\n\n");
}

function linesCoverNeedle(lines: BidMaterialLine[], needle: RegExp): boolean {
  for (const line of lines) {
    const blob = `${line.name} ${line.notes ?? ""}`;
    if (needle.test(blob)) return true;
  }
  return false;
}

/**
 * If the contractor named specific work in scope or Q&A but the AI line items omitted it,
 * append minimal lines so the estimate stays faithful.
 */
export function ensureContractorStatedScopeCoverage(
  input: {
    scope_description: string;
    project_questionnaire?: unknown;
  },
  lines: BidMaterialLine[],
): BidMaterialLine[] {
  const text = coverageTextFromBidFields(input);
  if (!text.trim()) return lines;

  const out = [...lines];
  const seenInject = new Set<string>();

  for (const rule of COVERAGE_RULES) {
    if (!rule.pattern.test(text)) continue;
    if (linesCoverNeedle(out, rule.mustAppearInLines)) continue;
    const key = rule.injectName;
    if (seenInject.has(key)) continue;
    seenInject.add(key);
    out.push({
      line_id: randomUUID(),
      name: rule.injectName,
      quantity: 1,
      unit: "ea",
      unit_price_usd: 0,
      extended_usd: 0,
      mockup_include: false,
      ...(rule.trade ? { trade: rule.trade } : {}),
      ...(rule.notes ? { notes: rule.notes } : {}),
    });
  }

  return out;
}
