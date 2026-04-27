import { randomUUID } from "crypto";
import { isVanityCabinetMaterialLine } from "@/lib/ai/bid-questions";
import { normalizeMaterialTrade, refineMaterialTradeFromLineName } from "@/lib/bid-scope";
import type { BidMaterialLine, BidMaterialTrade } from "@/types/bid";

const CHAT_MODEL = "gpt-4o";

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

/**
 * Text-only: turn scope + Q&A into line items grouped by trade (quantities & units; prices left at 0 for a later pricing step).
 */
export async function fetchScopeBreakdownLinesFromOpenAI(params: {
  apiKey: string;
  compositeScope: string;
}): Promise<BidMaterialLine[]> {
  const { apiKey, compositeScope } = params;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.25,
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            `You are an expert US residential remodeling estimator. Your job is faithful scope: the contractor's written scope and answers must be reflected in line items — never silently drop a named deliverable.`,
            `Given the project context below, output a JSON object ONLY (no markdown) with shape:`,
            `{"lines":[{"name":"string","trade":"general|electrical|plumbing|hvac|drywall|flooring|paint|cabinetry|tile|labor|permits|other","quantity":1,"unit":"ea","notes":"optional string"}]}`,
            `Rules:`,
            `- The section titled "Contractor-stated scope" is authoritative for WHAT work is in the job. If it names a vanity, toilet, tub, shower, tile, cabinets, countertop, flooring, mirror, lighting, or demo, you MUST include at least one line item that clearly references that work (by name in the line title or notes). Do not omit named fixtures or finishes because follow-up Q&A focused on other details.`,
            `- Vague bathroom remodel language (e.g. "modern bathroom", "update this bath", "bathroom refresh") without an explicit fixture list: still include full wet-area scope — at minimum one line for shower OR tub/shower surround (supply/install or demo+rebuild as appropriate), toilet, vanity/sink, exhaust fan, lighting rough/finish, waterproofing/wet-area prep, wall/floor tile or surround as implied, and accessories — use notes like "assumed from bath remodel; confirm with photos" rather than omitting shower/tub/wet-area work.`,
            `- Vanity wording: If the scope says "vanity" or "bathroom vanity" but does NOT say "vanity top", "countertop only", or "replace the top", treat it as a full vanity cabinet or vanity+sink unit — not a vanity top SKU. Name lines accordingly (e.g. supply/install vanity cabinet or combo).`,
            `- Vanity + faucet (read Q&A carefully):`,
            `  - If Q&A says the faucet is **included with the vanity / combo / all-in-one package** (or "comes with faucet"), do **NOT** add a second priced scope line for supply of that same faucet — put a short note on the vanity line like "Faucet included in vanity SKU — verify package" instead. Still allow a small **labor-only** line for hookups if scope separates rough-in from trim.`,
            `  - If Q&A says **separate faucet**, **new faucet**, or **reuse existing faucet**, keep a clear **plumbing** line for that faucet (supply and/or install) with a title that cannot be mistaken for a vanity cabinet (e.g. "Supply/install lavatory faucets — deck-mount (vanity run)" or "Install homeowner-supplied vanity faucets"). Never use a vague combined title like "Supply and install vanity deck-mount faucets" that reads like a full vanity.`,
            `  - If Q&A is silent on faucet but scope requires a new vanity: default to **one** vanity cabinet/combo line plus **one** faucet line only when a separate faucet is typical; otherwise one vanity line with notes "confirm faucet package".`,
            `  - Never collapse into a single line that drops the vanity cabinet when the scope already required a vanity. Follow-up answers about faucets ADD detail; they do not replace vanity scope.`,
            `- Floor / field tile lines: titles must be clearly **floor** or **room field** tile (e.g. "Install bathroom floor tile", "Porcelain floor tile — main bath"). Do **NOT** put vanity, cabinet, sink, combo, or lavatory wording in a floor-tile line — that line is for tile SKUs only.`,
            `- Double vanity / two sinks / "his and hers": when the job clearly has two basins on one vanity run, the **faucet** line quantity should be **2** (ea) unless scope says one shared faucet.`,
            `- Master remodel estimator: Organize mentally by phases (demo, rough-in trades, fixtures, finishes, punch) and ensure every deliverable implied by scope + Q&A appears as a line or clear notes — no orphaned scope.`,
            `- Line count: For any multi-step remodel (bath, kitchen, addition, multi-room), output at least 12 lines and usually 18–35. Never output fewer than 10 lines unless the scope is literally a single trivial task (e.g. replace one outlet only). If you are tempted to use one "catch-all" line, split it into phase-based lines instead (demo, rough-in, finishes, fixtures, cleanup).`,
            `- Interior painting: If walls or ceilings are painted, include separate lines for (1) surface prep & primer coat(s) as applicable, (2) finish coat(s) for walls/ceilings (split by area if needed), (3) paint supplies & consumables (rollers, brushes, tape, floor protection, misc. small materials). Do not collapse those into a single vague "Paint" line unless the scope explicitly says one lump-sum paint package.`,
            `- Vanity + countertop (e.g. quartz): Include distinct lines where applicable — remove/dispose existing vanity (if implied), vanity cabinet install, quartz slab fabrication & install (or supply + install), sink & faucet connection, water supply & drain hookups if separate from cabinet line, sealant/caulk at counter & splash, miscellaneous install materials (shims, fasteners, brackets as needed). Avoid one line that says only "Install vanity" with no countertop or plumbing detail when the scope names quartz or a new top.`,
            `- Countertop vs vanity overlap: Do NOT add a separate granite/quartz/countertop line for the vanity top if you already have a line for a full vanity cabinet, vanity combo, or vanity replacement that includes a top — that would double-count the same surface. The vanity line should mention integrated top in notes if applicable. Only add a standalone countertop line when the scope explicitly calls out slab-only work (e.g. replace top only, countertop without new vanity) or a separate counter run (kitchen island, etc.).`,
            `- trade must be one of the enum values above. Use trade consistently with what is being bought/installed on that line:`,
            `  - Wall/floor/shower **tile**, grout, waterproofing, backer board, Schluter/trim for wet areas → trade \`tile\`.`,
            `  - **Vanity cabinet** / vanity combo / medicine cabinet (wood or cabinet box) → \`cabinetry\` — even if a drafter might label it "plumbing" by mistake. Never put a **vanity cabinet or vanity+sink combo** on trade \`plumbing\`; use \`cabinetry\` for the box/combo and \`plumbing\` only for faucets, valves, drains, supplies, or trim kits.`,
            `  - **Faucets**, valves, drains, traps, supply lines, toilet, tub/shower trim where the purchasable SKU is plumbing → \`plumbing\`. A line that is only "vanity faucets" or "supply/install vanity faucets" must be \`plumbing\`, not \`tile\` or \`cabinetry\`.`,
            `- Do not put shower or floor **tile** scope on the same trade as a **vanity cabinet** line — they are different material searches.`,
            `- quantity and unit: realistic (e.g. sq ft, LF, hours, ea).`,
            `- Set unit_price_usd and extended_usd to 0 mentally — omit them; we only need scope items.`,
            `- Name lines clearly (e.g. "GFCI protected branch circuit — bath vanity").`,
            `- NO duplicate or overlapping scope for the same physical work. Each distinct deliverable appears ONCE.`,
            `- Combining trades: Only merge lines when they describe the exact same installation twice (e.g. duplicate "install vanity"). Do NOT merge different phases: demo, rough plumbing, countertop install, and finish paint stay separate lines even if they mention the same room.`,
            `- For one fixture (e.g. one bath vanity), do not output two competing install lines under plumbing and cabinetry for the same unit — use one coordinated install line plus separate lines for other phases (demo, counter, paint, supplies).`,
            ``,
            `--- Project context ---`,
            compositeScope.slice(0, 24000),
          ].join("\n"),
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Could not parse breakdown JSON.");
  }

  const list = parsed.lines;
  if (!Array.isArray(list)) {
    return [];
  }

  const out: BidMaterialLine[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const trade = refineMaterialTradeFromLineName(
      name,
      normalizeMaterialTrade(o.trade) as BidMaterialTrade,
    );
    const quantity =
      typeof o.quantity === "number" ? o.quantity : Number(o.quantity) || 1;
    const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim() : "ea";
    const notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim() : undefined;
    const line_id = randomUUID();
    out.push({
      line_id,
      name,
      quantity: Math.max(0, quantity),
      unit,
      unit_price_usd: 0,
      extended_usd: 0,
      mockup_include: false,
      ...(trade !== "general" ? { trade } : {}),
      ...(notes ? { notes } : {}),
    });
  }

  const deduped = dedupeOverlappingScopeLines(out);
  const noDupVanity = dedupeRedundantVanityCabinetLines(deduped);
  return adjustScopeLinesForVanityFaucetSemantics(noDupVanity, compositeScope);
}

/**
 * When the model emits two lines that both price the same vanity cabinet (e.g. plumbing + cabinetry),
 * keep a single line so retail search and totals are not duplicated.
 */
export function dedupeRedundantVanityCabinetLines(lines: BidMaterialLine[]): BidMaterialLine[] {
  const vanityLines = lines.filter((l) => isVanityCabinetMaterialLine(l));
  if (vanityLines.length <= 1) return lines;

  vanityLines.sort((a, b) => {
    if (a.trade === "cabinetry" && b.trade !== "cabinetry") return -1;
    if (b.trade === "cabinetry" && a.trade !== "cabinetry") return 1;
    const ac =
      /\b(cabinet|combo|unit)\b/i.test(a.name) ? 2 : /\bbathroom\s+vanity\b/i.test(a.name) ? 1 : 0;
    const bc =
      /\b(cabinet|combo|unit)\b/i.test(b.name) ? 2 : /\bbathroom\s+vanity\b/i.test(b.name) ? 1 : 0;
    if (bc !== ac) return bc - ac;
    return b.name.length - a.name.length;
  });

  const keep = vanityLines[0]!;
  const dropIds = new Set(
    vanityLines
      .slice(1)
      .map((l) => l.line_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  return lines.filter((l) => !l.line_id || !dropIds.has(l.line_id));
}

/** Bumps faucet qty for double vanities; keeps faucet lines from reading like duplicate vanity SKUs. */
export function adjustScopeLinesForVanityFaucetSemantics(
  lines: BidMaterialLine[],
  compositeScope: string,
): BidMaterialLine[] {
  const c = compositeScope.toLowerCase();
  const doubleBasin = /\b(double|dual|two[\s-]+sink|2[\s-]*sink|his\s+and\s+hers|twin\s+basin)\b/i.test(
    c,
  );
  return lines.map((l) => {
    const name = l.name.toLowerCase();
    const vanityFaucetLine =
      /\bfaucets?\b/i.test(name) &&
      !/\bshowerhead|shower\s+only|tub\s+spout\b/i.test(name) &&
      (l.trade === "plumbing" || l.trade === "general" || !l.trade);
    if (!vanityFaucetLine) return l;

    let next = { ...l, trade: "plumbing" as const };
    if (/\bvanity\s+cabinet\b|\bvanity\s+combo\b|\bfull\s+vanity\b/i.test(name)) {
      let cleaned = l.name
        .replace(/\bvanity\s+cabinet\b/gi, "")
        .replace(/\bvanity\s+combo\b/gi, "")
        .replace(/\bfull\s+vanity\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length < 8) {
        cleaned = "Supply/install vanity faucets (trim & connections)";
      }
      next.name = cleaned.slice(0, 200);
    }
    if (doubleBasin && !/\b(shower|tub)\b/i.test(name) && (Number(next.quantity) || 0) < 2) {
      next.quantity = 2;
      next.unit = next.unit?.trim() || "ea";
    }
    return next;
  });
}

const SCOPE_DEDUPE_STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "at",
  "by",
  "per",
  "ea",
  "each",
  "new",
]);

/** Words that often indicate the same fixture/area when repeated across lines. */
const SCOPE_STRONG_WORDS = new Set([
  "vanity",
  "toilet",
  "sink",
  "faucet",
  "shower",
  "tub",
  "cabinet",
  "cabinetry",
  "counter",
  "countertop",
  "tile",
  "flooring",
  "floor",
  "demolition",
  "drywall",
  "window",
  "door",
  "light",
  "lighting",
  "backsplash",
]);

function tokenizeScopeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !SCOPE_DEDUPE_STOP.has(w));
}

function scopeNameNormKey(name: string): string {
  return tokenizeScopeName(name).sort().join(" ");
}

/**
 * True when `a` describes the same scope as `b` in fewer words (subset / high overlap).
 * Token order: `a` should be the name with fewer or equal tokens (caller sorts by length first).
 */
function redundantShorterVsLonger(a: string, b: string): boolean {
  if (scopeNameNormKey(a) === scopeNameNormKey(b)) return true;
  const ts = tokenizeScopeName(a);
  const tl = tokenizeScopeName(b);
  if (ts.length === 0 || tl.length === 0) return false;
  if (ts.length > tl.length) {
    return redundantShorterVsLonger(b, a);
  }
  const setL = new Set(tl);
  let inter = 0;
  for (const w of ts) {
    if (setL.has(w)) inter++;
  }
  const recall = inter / ts.length;
  if (recall >= 0.88) return true;
  let strongOverlap = false;
  for (const w of ts) {
    if (SCOPE_STRONG_WORDS.has(w) && setL.has(w)) {
      strongOverlap = true;
      break;
    }
  }
  if (recall >= 0.55 && strongOverlap) return true;
  return ts.every((w) => setL.has(w)) && ts.length < tl.length;
}

/**
 * Removes overlapping duplicate scope lines (e.g. "Install new vanity" + "Install vanity, sink and faucet").
 * Preserves first-seen order from the original AI output.
 */
export function dedupeOverlappingScopeLines(lines: BidMaterialLine[]): BidMaterialLine[] {
  if (lines.length <= 1) return lines;

  const sorted = [...lines].sort((a, b) => {
    const ta = tokenizeScopeName(a.name).length;
    const tb = tokenizeScopeName(b.name).length;
    if (tb !== ta) return tb - ta;
    return b.name.length - a.name.length;
  });

  const kept: BidMaterialLine[] = [];
  for (const line of sorted) {
    const filtered = kept.filter((k) => !redundantShorterVsLonger(k.name, line.name));
    kept.length = 0;
    kept.push(...filtered);

    const subsumed = kept.some((k) => redundantShorterVsLonger(line.name, k.name));
    if (subsumed) continue;
    kept.push(line);
  }

  const idSet = new Set(
    kept.map((l) => l.line_id).filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  return lines.filter((l) => l.line_id && idSet.has(l.line_id));
}
