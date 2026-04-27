/**
 * Live SerpApi smoke: five homeowner-style remodel bundles → Home Depot / Lowe’s picks.
 * Validates title relevance scores, duplicate SKU avoidance, and plumbing-vs-vanity separation.
 *
 * Requires: SERPAPI_API_KEY (and optional SERPAPI_HOME_DEPOT_ZIP for localization).
 * Run once: npx vitest run src/lib/integrations/retail-journey-smoke.integration.test.ts
 * Five consecutive passes: npm run retail:smoke:loop
 */
import { describe, expect, it } from "vitest";
import type { BidMaterialLine } from "@/types/bid";
import {
  buildFallbackSearchQuery,
  enhanceRetailSearchQuery,
  extractVanityCabinetRunWidthInchesFromJobContext,
  vanityWidthSerpOptionsForLine,
} from "@/lib/ai/homedepot-retail-query";
import { buildLineSearchQuery, searchHomeDepotProduct } from "@/lib/integrations/serpapi-homedepot";
import { scoreRetailProductTitleForLine } from "@/lib/integrations/retail-search-relevance";
import { searchLowesProduct } from "@/lib/integrations/serpapi-lowes";

const SERP = Boolean(process.env.SERPAPI_API_KEY?.trim());

const MIN_SCORE = 36;
/** SerpApi + scoring can exceed Vitest’s default 5s on slow networks. */
const SERP_IT_MS = 90_000;

function line(over: Partial<BidMaterialLine> & Pick<BidMaterialLine, "name">): BidMaterialLine {
  return {
    name: over.name,
    quantity: 1,
    unit: "ea",
    unit_price_usd: 0,
    extended_usd: 0,
    line_id: over.line_id ?? `smoke-${Math.random().toString(36).slice(2, 10)}`,
    ...over,
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchHdForLine(
  jobContext: string,
  line: BidMaterialLine,
): Promise<{ id: string; title: string; score: number }> {
  const run = extractVanityCabinetRunWidthInchesFromJobContext(jobContext);
  const enhanceOpts = run != null ? { vanityRunWidthInches: run } : undefined;
  let q = buildFallbackSearchQuery(jobContext, line, undefined, run);
  if (!q.trim()) q = buildLineSearchQuery(line);
  q = enhanceRetailSearchQuery(q, line, enhanceOpts);
  const widthOpt = vanityWidthSerpOptionsForLine(line, run, jobContext);
  const hint: Parameters<typeof scoreRetailProductTitleForLine>[2] = {
    lineTrade: line.trade,
    ...(widthOpt.minVanityCabinetWidthInches != null
      ? { minVanityCabinetWidthInches: widthOpt.minVanityCabinetWidthInches }
      : {}),
    ...(widthOpt.maxVanityCabinetWidthInches != null
      ? { maxVanityCabinetWidthInches: widthOpt.maxVanityCabinetWidthInches }
      : {}),
  };
  const hit = await searchHomeDepotProduct(q, {
    line: { name: line.name, notes: line.notes, trade: line.trade },
    ...widthOpt,
  });
  expect(hit, `Home Depot: no hit for line "${line.name.slice(0, 60)}"`).not.toBeNull();
  const lineText = `${line.name} ${line.notes ?? ""}`.replace(/\s+/g, " ").trim();
  const score = scoreRetailProductTitleForLine(lineText, hit!.title, hint);
  expect(score, `Weak title match (${score}) for "${hit!.title.slice(0, 80)}"`).toBeGreaterThanOrEqual(
    MIN_SCORE,
  );
  const id = String(hit!.product_id ?? "").replace(/\D/g, "") || hit!.title.slice(0, 40);
  return { id, title: hit!.title, score };
}

describe.skipIf(!SERP)("Retail journey smoke (live SerpApi × 5 homeowner bundles)", () => {
  it(
    "01 — Bath: vanity cabinet + deck-mount faucets + rough plumbing (no duplicate vanity SKUs)",
    async () => {
    const jobContext = [
      "Primary bathroom remodel for the Johnsons.",
      "Measurements: Vanity / cabinet run: ~ 8 x 5 ft.",
      "Shower stays; focus on vanity wall and fixtures.",
    ].join("\n");

    const lines = [
      line({
        name: "Supply and install double vanity cabinet with integrated sinks",
        trade: "cabinetry",
      }),
      line({
        name: "Supply and install lavatory faucets — deck-mount (vanity run)",
        trade: "plumbing",
      }),
      line({
        name: "Install plumbing connections for vanity and shower",
        trade: "plumbing",
      }),
    ];

    const hits: { id: string; title: string; score: number }[] = [];
    for (const L of lines) {
      hits.push(await fetchHdForLine(jobContext, L));
      await sleep(450);
    }
    const ids = hits.map((h) => h.id);
    expect(new Set(ids).size, `Expected 3 distinct HD picks, got: ${hits.map((h) => h.title).join(" | ")}`).toBe(
      3,
    );
    const faucetTitle = hits[1]!.title.toLowerCase();
    expect(
      /\b(faucet|widespread|centerset|lavatory|handle|spout)\b/i.test(faucetTitle) ||
        !/\b(bath\s+vanity|vanity\s+cabinet|double\s+vanity)\b/i.test(faucetTitle),
    ).toBe(true);
    const roughTitle = hits[2]!.title.toLowerCase();
    expect(
      /\b(valve|supply|pex|brass|compression|fitting|connector|connectors?|stop|elbow|nipple|rough|adapter|drain|trap|hose|flex|coupling|tee|union|nut|washer|gasket|flange|braided|shank|pvc|cpvc|push|sharkbite|o-?ring)\b/i.test(
        roughTitle,
      ),
    ).toBe(true);
    },
    SERP_IT_MS,
  );

  it(
    "02 — Kitchen: sink + pull-down faucet (distinct SKUs)",
    async () => {
    const jobContext = "Kitchen refresh. Customer keeps existing counters; swap sink and faucet only.";
    const lines = [
      line({ name: "Install undermount stainless steel kitchen sink 30 inch single bowl", trade: "plumbing" }),
      line({ name: "Supply and install pull-down kitchen faucet chrome single handle", trade: "plumbing" }),
    ];
    const hits: { id: string; title: string; score: number }[] = [];
    for (const L of lines) {
      hits.push(await fetchHdForLine(jobContext, L));
      await sleep(450);
    }
    expect(new Set(hits.map((h) => h.id)).size).toBe(2);
    },
    SERP_IT_MS,
  );

  it(
    "03 — Shower wall tile (HD)",
    async () => {
    const jobContext = "Hall bathroom. New walk-in shower; tile walls to ceiling white or light gray.";
    const L = line({
      name: "Install porcelain shower wall tile 12x24 matte white",
      trade: "tile",
    });
    const h = await fetchHdForLine(jobContext, L);
    expect(/\b(tile|porcelain|ceramic|wall|sq\.?\s*ft|case)\b/i.test(h.title)).toBe(true);
    },
    SERP_IT_MS,
  );

  it(
    "04 — Bathroom floor tile (HD)",
    async () => {
    const jobContext = "Small bathroom. Replace floor tile only; walls untouched.";
    const L = line({
      name: "Install bathroom floor porcelain tile wood-look plank 6x24",
      trade: "tile",
    });
    const h = await fetchHdForLine(jobContext, L);
    expect(/\b(floor|tile|porcelain|ceramic|sq\.?\s*ft|case)\b/i.test(h.title)).toBe(true);
    await sleep(300);
    },
    SERP_IT_MS,
  );

  it(
    "05 — Vanity light at Lowe’s (site:lowes.com)",
    async () => {
    const jobContext = "Powder room update. Paint and new vanity light; no plumbing relocation.";
    const L = line({
      name: "Install brushed nickel vanity light fixture 3-light bath bar",
      trade: "electrical",
    });
    const run = extractVanityCabinetRunWidthInchesFromJobContext(jobContext);
    const enhanceOpts = run != null ? { vanityRunWidthInches: run } : undefined;
    let q = buildFallbackSearchQuery(jobContext, L, undefined, run);
    if (!q.trim()) q = buildLineSearchQuery(L);
    q = enhanceRetailSearchQuery(q, L, enhanceOpts);
    const hit = await searchLowesProduct(q, {
      line: { name: L.name, notes: L.notes, trade: L.trade },
      ...vanityWidthSerpOptionsForLine(L, run, jobContext),
    });
    expect(hit, "Lowe's: no hit for vanity light line").not.toBeNull();
    const lineText = `${L.name} ${L.notes ?? ""}`.replace(/\s+/g, " ").trim();
    const score = scoreRetailProductTitleForLine(lineText, hit!.title, { lineTrade: L.trade });
    expect(score).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(/\b(light|fixture|sconce|vanity|bath|led|lamp)\b/i.test(hit!.title)).toBe(true);
    },
    SERP_IT_MS,
  );
});
