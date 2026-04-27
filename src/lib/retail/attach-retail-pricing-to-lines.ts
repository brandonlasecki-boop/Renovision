import {
  applyOpenAiHomedepotProductUrlToLine,
  fetchRetailHomedepotDirectLinksBatch,
  isAllowedHomedepotDirectProductPageUrl,
  type RetailHomedepotDirectLinkRow,
} from "@/lib/ai/retail-hd-openai-direct-links";
import { pickHomeDepotUrlProbeHitOrNull } from "@/lib/ai/retail-hd-url-probe-hit-picker";
import {
  checkHomedepotProductPageReachability,
  fetchRetailHomedepotUrlPlanBatch,
  type RetailHomedepotUrlPlanEntry,
  type RetailHomedepotUrlProbeRow,
} from "@/lib/ai/retail-homedepot-url-probe";
import { fetchRetailSerpQueryPlanBatch } from "@/lib/ai/retail-serp-query-plan";
import {
  fetchRetailShelfVisionProductFitValidations,
  type RetailShelfVisionProductRow,
} from "@/lib/ai/retail-product-shelf-vision-validator";
import { fetchRetailShelfMatchCorrections } from "@/lib/ai/retail-shelf-match-validator";
import { catalogRetailImageUrlForMockup } from "@/lib/bid-mockup";
import {
  buildFallbackSearchQuery,
  buildRetailTitleScoreHint,
  enhanceRetailSearchQuery,
  extractVanityCabinetRunWidthInchesFromJobContext,
  heuristicShouldSkipHomeDepotSearch,
  stripHomeDepotRetailFields,
  stripLowesRetailFields,
  showerBaseSerpOptionsForLine,
  suggestHomeDepotSearchOrSkip,
  vanityWidthSerpOptionsForLine,
} from "@/lib/ai/homedepot-retail-query";
import { shouldSkipRetailSearchForVanityCabinetDueToCustomMillwork } from "@/lib/ai/bid-questions";
import { refineMaterialTradeFromLineName } from "@/lib/bid-scope";
import { retailImageUrlForLightbox } from "@/lib/integrations/retail-product-image-lightbox";
import {
  buildLineSearchQuery,
  extractHomedepotProductIdFromUrl,
  fetchHomeDepotProductByProductId,
  lineQualifiesForHomeDepotPricing,
  searchHomeDepotProduct,
  searchHomeDepotProductCandidates,
  verifyHomeDepotSearchHitForProductLink,
} from "@/lib/integrations/serpapi-homedepot";
import { searchLowesProduct } from "@/lib/integrations/serpapi-lowes";
import { scoreRetailProductTitleForLine } from "@/lib/integrations/retail-search-relevance";
import { adjustShowerTileQuantityAfterRetailAttach } from "@/lib/retail-tile-quantity";
import type { BidMaterialLine, BidMaterialTrade, ProjectQuestionnaireItem } from "@/types/bid";
import {
  buildQuoteLinesSummaryForRetailAi,
  normalizeRetailSkuDigits,
  normalizeUsZipForHd,
} from "@/lib/retail/retail-pricing-helpers";
import { isRetailSerpDisabled } from "@/lib/retail/retail-serp-config";
import {
  applyRetailShelfFromLowest,
  collapseLineToSingleWinningRetailer,
  maybeAppendVanityStockNote,
  mergeHomeDepotSearchHitIntoLine,
  mergeLowesSearchHitIntoLine,
} from "@/lib/retail/shelf-line-merge";

/** Max SerpApi calls per retailer per bulk fetch (Home Depot and Lowe's each get their own budget). */
const HD_FETCH_MAX_SERPCALLS_PER_RETAILER = 30;
const RETAIL_SHELF_REFINE_MAX_SERPS = 12;
const RETAIL_SHELF_VALIDATE_MAX_LINES = 45;

type RetailSuggestPack =
  | { ok: true; suggestion: Awaited<ReturnType<typeof suggestHomeDepotSearchOrSkip>> }
  | { ok: false };

/** Draft query aligned with the per-line Serp branch (used for batch validation input). */
function resolveDraftQueryBeforeSerpBatch(
  copy: BidMaterialLine,
  pack: RetailSuggestPack | undefined,
  jobContext: string,
  vanityRunInches: number | undefined,
): { draftQ: string; suggestSkip: boolean; suggestFailed: boolean } {
  if (!pack || !pack.ok) {
    if (heuristicShouldSkipHomeDepotSearch(copy)) {
      return { draftQ: "", suggestSkip: true, suggestFailed: false };
    }
    let q = buildFallbackSearchQuery(jobContext, copy, undefined, vanityRunInches);
    if (!q) q = buildLineSearchQuery(copy);
    return { draftQ: q.trim(), suggestSkip: false, suggestFailed: true };
  }
  if (pack.suggestion.skip) {
    return { draftQ: "", suggestSkip: true, suggestFailed: false };
  }
  return {
    draftQ: (pack.suggestion.searchQuery ?? "").trim(),
    suggestSkip: false,
    suggestFailed: false,
  };
}

async function runPoolWithIndex<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const results: R[] = new Array(n);
  if (n === 0) return results;
  const conc = Math.max(1, Math.min(16, Math.floor(concurrency) || 4));
  let nextIndex = 0;
  async function runWorker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= n) break;
      results[i] = await worker(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, n) }, () => runWorker()));
  return results;
}

export type AttachRetailPricingToLinesParams = {
  lines: BidMaterialLine[];
  jobContext: string;
  bidTitle: string;
  beforePhotoUrls: string[];
  lineRefByLineId: Record<string, string>;
  quoteLinesSummary: string;
  questionnaireRows?: ProjectQuestionnaireItem[] | undefined;
  sitePostalCode?: string | null;
  preferSale?: boolean;
  wantHd?: boolean;
  wantLowes?: boolean;
  /** When true, skips the batched OpenAI shelf validation + extra HD searches (faster for /try). */
  skipShelfMatchValidation?: boolean;
  /** When true, skips the batched OpenAI Home Depot URL probe (faster for /try). */
  skipRetailUrlProbe?: boolean;
};

/** Per-line output from the OpenAI Home Depot URL plan (for contractor verification in UI). */
export type RetailUrlProbeReportRow = {
  plan_index: number;
  line_name: string;
  shoppable_hd: boolean;
  homedepot_urls: string[];
  /** SerpApi search hits offered to the model (ground truth links). */
  serp_candidate_urls?: string[];
};

export type AttachRetailPricingToLinesResult = {
  lines: BidMaterialLine[];
  updated: number;
  updated_hd: number;
  updated_lowes: number;
  skipped: number;
  failed: { name: string; reason: string }[];
  sale_matches: number;
  retail_validation_corrections: number;
  /** Home Depot lines replaced after vision + before-photo validation + a better Serp hit. */
  retail_vision_validation_corrections: number;
  /** Home Depot lines where the first priced hit came from AI-suggested product URL(s) + Serp product engine. */
  retail_url_probe_hits: number;
  /** OpenAI plan: which lines were shoppable + raw homedepot.com URLs suggested (empty when probe off). */
  retail_url_probe_report: RetailUrlProbeReportRow[];
};

/**
 * Serp + OpenAI retail query pass over material lines (shared by contractor bids and homeowner try).
 * Mutates a deep copy of `lines` and returns the updated array.
 */
export async function attachRetailPricingToLines(
  params: AttachRetailPricingToLinesParams,
): Promise<AttachRetailPricingToLinesResult> {
  const lines = params.lines.map((l) => ({ ...l }));
  const jobContext = params.jobContext;
  const bidTitle = params.bidTitle.trim() || "Estimate";
  const beforePhotoUrls = params.beforePhotoUrls;
  const lineRefByLineId = params.lineRefByLineId;
  const quoteLinesSummary =
    params.quoteLinesSummary.trim().length > 0
      ? params.quoteLinesSummary
      : buildQuoteLinesSummaryForRetailAi(lines);

  const vanityRunInches = extractVanityCabinetRunWidthInchesFromJobContext(jobContext);
  const zipFromBid = normalizeUsZipForHd(params.sitePostalCode);
  const zipFromEnv = normalizeUsZipForHd(process.env.SERPAPI_HOME_DEPOT_ZIP);
  const deliveryZip = zipFromBid ?? zipFromEnv;
  const zipOpt = deliveryZip ? { deliveryZip } : undefined;

  const failed: { name: string; reason: string }[] = [];
  let updated = 0;
  let updatedHd = 0;
  let updatedLowes = 0;
  let skipped = 0;
  let hdSerpCalls = 0;
  let lowesSerpCalls = 0;
  let saleMatches = 0;
  let retailValidationCorrections = 0;
  let retailVisionValidationCorrections = 0;
  let retailUrlProbeHits = 0;
  let retailUrlProbeReport: RetailUrlProbeReportRow[] = [];
  const preferSale = params.preferSale === true;
  const wantHd = params.wantHd !== false;
  const wantLowes = params.wantLowes === true;
  const serpOff = isRetailSerpDisabled();
  const wantLowesEffective = wantLowes && !serpOff;
  const questionnaireRows = params.questionnaireRows;

  /**
   * Bulk fetch may refresh only one retailer; stale fields from the other store would still
   * win in applyRetailShelfFromLowest / collapseLineToSingleWinningRetailer and drive the wrong
   * tab for “Find similar” (extra Serp calls the user did not opt into).
   */
  if (!wantLowesEffective) {
    for (let i = 0; i < lines.length; i++) {
      lines[i] = stripLowesRetailFields(lines[i]!);
    }
  }
  if (!wantHd) {
    for (let i = 0; i < lines.length; i++) {
      lines[i] = stripHomeDepotRetailFields(lines[i]!);
    }
  }

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const next: BidMaterialLine[] = [];

  const tryRefineHomeDepotLineWithQuery = async (args: {
    L: BidMaterialLine;
    idxInNext: number;
    refinedHdQuery: string;
  }): Promise<boolean> => {
    const { L, idxInNext, refinedHdQuery } = args;
    const lineText = `${L.name} ${L.notes ?? ""}`.replace(/\s+/g, " ").trim();
    const hint = buildRetailTitleScoreHint(L, vanityRunInches, jobContext);
    const oldTitle = (L.hd_title ?? "").trim();
    const oldScore = oldTitle ? scoreRetailProductTitleForLine(lineText, oldTitle, hint) : 0;
    const q2 = enhanceRetailSearchQuery(
      refinedHdQuery.trim(),
      L,
      vanityRunInches != null ? { vanityRunWidthInches: vanityRunInches } : undefined,
    );
    const excludeId = L.hd_product_id?.replace(/\D/g, "");
    const excludeOthers: string[] = [];
    for (let ri = 0; ri < next.length; ri++) {
      if (ri === idxInNext) continue;
      const sid = normalizeRetailSkuDigits(next[ri]!.hd_product_id);
      if (sid) excludeOthers.push(sid);
    }
    const excludeMerged = [
      ...new Set([...excludeOthers, ...(excludeId && excludeId.length >= 6 ? [excludeId] : [])]),
    ];
    const hit = await searchHomeDepotProduct(q2, {
      ...zipOpt,
      preferSale,
      line: { name: L.name, notes: L.notes, trade: L.trade },
      ...(excludeMerged.length > 0 ? { excludeProductIds: excludeMerged } : {}),
      ...vanityWidthSerpOptionsForLine(L, vanityRunInches, jobContext),
      ...showerBaseSerpOptionsForLine(L, jobContext),
    });
    if (!hit) return false;
    const newScore = scoreRetailProductTitleForLine(lineText, hit.title, hint);
    if (newScore <= oldScore + 2) return false;
    mergeHomeDepotSearchHitIntoLine(L, hit);
    adjustShowerTileQuantityAfterRetailAttach({
      line: L,
      jobContext,
      productTitle: hit.title,
    });
    maybeAppendVanityStockNote(L, vanityRunInches);
    applyRetailShelfFromLowest(L);
    collapseLineToSingleWinningRetailer(L);
    return true;
  };

  const collectOtherHdSkus = (lineIdx: number): string[] => {
    const ids: string[] = [];
    for (const row of next) {
      const s = normalizeRetailSkuDigits(row.hd_product_id);
      if (s) ids.push(s);
    }
    for (let j = lineIdx + 1; j < lines.length; j++) {
      const s = normalizeRetailSkuDigits(lines[j]!.hd_product_id);
      if (s) ids.push(s);
    }
    return [...new Set(ids)];
  };
  const collectOtherLwSkus = (lineIdx: number): string[] => {
    const ids: string[] = [];
    for (const row of next) {
      const s = normalizeRetailSkuDigits(row.lw_product_id);
      if (s) ids.push(s);
    }
    for (let j = lineIdx + 1; j < lines.length; j++) {
      const s = normalizeRetailSkuDigits(lines[j]!.lw_product_id);
      if (s) ids.push(s);
    }
    return [...new Set(ids)];
  };

  type HdFetchPlanEntry =
    | { kind: "done"; lineForNext: BidMaterialLine }
    | {
        kind: "serp";
        lineIdx: number;
        copy: BidMaterialLine;
        lineRefUrl?: string;
        /** 0-based order among `kind: "serp"` entries — keys batch query-plan results. */
        serpOrder: number;
      };

  const hdFetchPlan: HdFetchPlanEntry[] = [];
  let serpOrderCounter = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const copy: BidMaterialLine = { ...line };
    const prevTrade = (line.trade ?? "general") as BidMaterialTrade;
    const refinedTrade = refineMaterialTradeFromLineName(line.name, prevTrade);
    if (refinedTrade !== prevTrade) {
      if (refinedTrade === "general") delete copy.trade;
      else copy.trade = refinedTrade;
    }
    const qualifies =
      lineQualifiesForHomeDepotPricing(copy.trade) && line.name.trim().length > 0;
    if (!qualifies) {
      if (line.name.trim() && !lineQualifiesForHomeDepotPricing(copy.trade)) {
        skipped++;
        hdFetchPlan.push({
          kind: "done",
          lineForNext: stripLowesRetailFields(stripHomeDepotRetailFields(copy)),
        });
        continue;
      }
      hdFetchPlan.push({ kind: "done", lineForNext: copy });
      continue;
    }

    if (shouldSkipRetailSearchForVanityCabinetDueToCustomMillwork(copy, questionnaireRows)) {
      skipped++;
      hdFetchPlan.push({
        kind: "done",
        lineForNext: stripLowesRetailFields(stripHomeDepotRetailFields(copy)),
      });
      continue;
    }

    const lineRefUrl = copy.line_id ? lineRefByLineId[copy.line_id] : undefined;
    hdFetchPlan.push({
      kind: "serp",
      lineIdx,
      copy,
      lineRefUrl: lineRefUrl ?? undefined,
      serpOrder: serpOrderCounter++,
    });
  }

  const serpSlots = hdFetchPlan.filter((e): e is Extract<HdFetchPlanEntry, { kind: "serp" }> => {
    return e.kind === "serp";
  });

  /** Serp-free path: one OpenAI multimodal batch → one THD product URL per line (no shelf prices). */
  if (serpOff) {
    if (wantHd && Boolean(process.env.OPENAI_API_KEY?.trim())) {
      const directRows: RetailHomedepotDirectLinkRow[] = serpSlots.map((slot) => ({
        plan_index: slot.serpOrder + 1,
        name: slot.copy.name,
        notes: slot.copy.notes,
        trade: slot.copy.trade,
        ...(slot.lineRefUrl?.startsWith("http") ? { line_reference_image_url: slot.lineRefUrl } : {}),
      }));

      type PlanEntry = RetailHomedepotUrlPlanEntry & { productTitle?: string };
      let directPlan = new Map<number, PlanEntry>();
      try {
        const signal =
          typeof AbortSignal !== "undefined" &&
          typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
            ? AbortSignal.timeout(120_000)
            : undefined;
        directPlan = await fetchRetailHomedepotDirectLinksBatch({
          apiKey: process.env.OPENAI_API_KEY,
          bidTitle,
          jobContext,
          quoteLinesSummary,
          beforePhotoUrls,
          rows: directRows,
          signal,
        });
      } catch (e) {
        failed.push({
          name: "OpenAI Home Depot links",
          reason: e instanceof Error ? e.message.slice(0, 160) : "Direct link batch failed",
        });
      }

      retailUrlProbeReport =
        directRows.length === 0
          ? []
          : directRows.map((row) => {
              const ent = directPlan.get(row.plan_index);
              const u0 = ent?.urls?.[0]?.trim();
              const urls = u0 && isAllowedHomedepotDirectProductPageUrl(u0) ? [u0] : [];
              return {
                plan_index: row.plan_index,
                line_name: row.name.trim().slice(0, 220),
                shoppable_hd: ent?.shoppableHd ?? false,
                homedepot_urls: urls,
              };
            });

      const nextOpen: BidMaterialLine[] = [];
      for (const ent of hdFetchPlan) {
        if (ent.kind === "done") {
          nextOpen.push(ent.lineForNext);
          continue;
        }
        const copy = { ...ent.copy };
        const plan = directPlan.get(ent.serpOrder + 1);
        if (plan && plan.shoppableHd === false) {
          skipped++;
          nextOpen.push(stripLowesRetailFields(stripHomeDepotRetailFields(copy)));
          continue;
        }
        const url = plan?.urls?.[0]?.trim();
        const allowUnverifiedDirectLinks =
          (process.env.RETAIL_ALLOW_UNVERIFIED_HD_DIRECT_LINKS ?? "false").trim().toLowerCase() ===
          "true";
        if (allowUnverifiedDirectLinks && plan && url && isAllowedHomedepotDirectProductPageUrl(url)) {
          applyOpenAiHomedepotProductUrlToLine(copy, url, plan.productTitle);
          maybeAppendVanityStockNote(copy, vanityRunInches);
          applyRetailShelfFromLowest(copy);
          collapseLineToSingleWinningRetailer(copy);
          updated++;
          updatedHd++;
          retailUrlProbeHits++;
          nextOpen.push(copy);
        } else {
          skipped++;
          if (url && !allowUnverifiedDirectLinks) {
            failed.push({
              name: copy.name.slice(0, 80),
              reason: "Home Depot: skipped unverified OpenAI-only product URL",
            });
          }
          nextOpen.push(stripLowesRetailFields(stripHomeDepotRetailFields(copy)));
        }
      }

      return {
        lines: nextOpen,
        updated,
        updated_hd: updatedHd,
        updated_lowes: updatedLowes,
        skipped,
        failed,
        sale_matches: saleMatches,
        retail_validation_corrections: retailValidationCorrections,
        retail_vision_validation_corrections: retailVisionValidationCorrections,
        retail_url_probe_hits: retailUrlProbeHits,
        retail_url_probe_report: retailUrlProbeReport,
      };
    }

    const nextStrip: BidMaterialLine[] = [];
    for (const ent of hdFetchPlan) {
      if (ent.kind === "done") {
        nextStrip.push(ent.lineForNext);
        continue;
      }
      skipped++;
      nextStrip.push(stripLowesRetailFields(stripHomeDepotRetailFields({ ...ent.copy })));
    }
    return {
      lines: nextStrip,
      updated: 0,
      updated_hd: 0,
      updated_lowes: 0,
      skipped,
      failed,
      sale_matches: 0,
      retail_validation_corrections: 0,
      retail_vision_validation_corrections: 0,
      retail_url_probe_hits: 0,
      retail_url_probe_report: [],
    };
  }

  const concRaw = process.env.RETAIL_BULK_SUGGEST_CONCURRENCY?.trim();
  const concParsed = concRaw ? Number(concRaw) : NaN;
  const suggestConcurrency = Number.isFinite(concParsed)
    ? Math.max(1, Math.min(12, Math.floor(concParsed)))
    : 4;

  const suggestPacks: RetailSuggestPack[] =
    serpSlots.length === 0
      ? []
      : await runPoolWithIndex(serpSlots, suggestConcurrency, async (slot) => {
          try {
            const suggestion = await suggestHomeDepotSearchOrSkip({
              apiKey: process.env.OPENAI_API_KEY,
              jobContext,
              bidTitle,
              line: {
                name: slot.copy.name,
                notes: slot.copy.notes,
                trade: slot.copy.trade,
              },
              beforePhotoUrls: beforePhotoUrls.length > 0 ? beforePhotoUrls : undefined,
              lineReferenceImageUrl: slot.lineRefUrl ?? undefined,
              quoteLinesSummary,
            });
            return { ok: true as const, suggestion };
          } catch {
            return { ok: false as const };
          }
        });

  const suggestByLineIdx = new Map<number, RetailSuggestPack>();
  serpSlots.forEach((slot, i) => {
    suggestByLineIdx.set(slot.lineIdx, suggestPacks[i]!);
  });

  const batchPlanRaw = (process.env.RETAIL_BATCH_QUERY_VALIDATE ?? "true").trim().toLowerCase();
  const batchPlanEnabled =
    Boolean(process.env.OPENAI_API_KEY?.trim()) &&
    serpSlots.length > 0 &&
    batchPlanRaw !== "0" &&
    batchPlanRaw !== "false" &&
    batchPlanRaw !== "no";

  let serpQueryPlanByIndex = new Map<number, { skip: boolean; hd_query: string }>();
  if (batchPlanEnabled) {
    const planRows = serpSlots.map((slot, i) => {
      const pack = suggestPacks[i]!;
      const d = resolveDraftQueryBeforeSerpBatch(slot.copy, pack, jobContext, vanityRunInches);
      return {
        plan_index: i + 1,
        name: slot.copy.name,
        notes: slot.copy.notes,
        trade: slot.copy.trade,
        draft_query: d.draftQ,
        suggest_skip: d.suggestSkip,
        suggest_failed: d.suggestFailed,
      };
    });
    try {
      const signal =
        typeof AbortSignal !== "undefined" &&
        typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
          ? AbortSignal.timeout(55_000)
          : undefined;
      serpQueryPlanByIndex = await fetchRetailSerpQueryPlanBatch({
        apiKey: process.env.OPENAI_API_KEY,
        bidTitle,
        jobContext,
        quoteLinesSummary,
        beforePhotoUrls: beforePhotoUrls.length > 0 ? beforePhotoUrls : undefined,
        rows: planRows,
        signal,
      });
    } catch {
      serpQueryPlanByIndex = new Map();
    }
  }

  const resolveHdSerpQueryForSerpSlot = (slot: {
    lineIdx: number;
    copy: BidMaterialLine;
    serpOrder: number;
  }): { q: string; skipEntirely: boolean } => {
    const copy = slot.copy;
    const lineIdx = slot.lineIdx;
    const serpOrder = slot.serpOrder;
    const vanityEnhanceOpts =
      vanityRunInches != null ? { vanityRunWidthInches: vanityRunInches } : undefined;
    const batchPlan = serpQueryPlanByIndex.get(serpOrder + 1);
    let q = "";
    let qFromBatch = false;
    if (batchPlan) {
      if (batchPlan.skip) return { q: "", skipEntirely: true };
      const tq = batchPlan.hd_query.trim();
      if (tq) {
        q = enhanceRetailSearchQuery(tq, copy, vanityEnhanceOpts);
        qFromBatch = true;
      }
    }
    if (!qFromBatch) {
      const pack = suggestByLineIdx.get(lineIdx);
      if (!pack || !pack.ok) {
        if (heuristicShouldSkipHomeDepotSearch(copy)) return { q: "", skipEntirely: true };
        q = buildFallbackSearchQuery(jobContext, copy, undefined, vanityRunInches);
        if (!q) q = buildLineSearchQuery(copy);
        if (!q.trim()) return { q: "", skipEntirely: true };
      } else {
        if (pack.suggestion.skip) return { q: "", skipEntirely: true };
        q = (pack.suggestion.searchQuery ?? "").trim();
        if (!q.trim()) return { q: "", skipEntirely: true };
      }
    }
    return { q, skipEntirely: false };
  };

  const collectHdSkusExcludingLineIdx = (excludeLineIdx: number): string[] => {
    const ids: string[] = [];
    for (let j = 0; j < lines.length; j++) {
      if (j === excludeLineIdx) continue;
      const s = normalizeRetailSkuDigits(lines[j]!.hd_product_id);
      if (s) ids.push(s);
    }
    return [...new Set(ids)];
  };

  const urlProbeRaw = (process.env.RETAIL_HD_URL_PROBE ?? "true").trim().toLowerCase();
  const urlProbeEnabled =
    params.skipRetailUrlProbe !== true &&
    wantHd &&
    Boolean(process.env.OPENAI_API_KEY?.trim()) &&
    serpSlots.length > 0 &&
    urlProbeRaw !== "0" &&
    urlProbeRaw !== "false" &&
    urlProbeRaw !== "no";

  const candSerpRaw = process.env.RETAIL_HD_CANDIDATE_MAX_SERPS?.trim();
  const candSerpParsed = candSerpRaw ? Number(candSerpRaw) : NaN;
  const hdCandidateSerpMax = Number.isFinite(candSerpParsed)
    ? Math.max(0, Math.min(40, Math.floor(candSerpParsed)))
    : 28;
  let hdCandidateSerpCalls = 0;

  let hdUrlPlanByPlanIndex = new Map<number, RetailHomedepotUrlPlanEntry>();
  let urlProbeRows: RetailHomedepotUrlProbeRow[] = [];
  if (urlProbeEnabled) {
    for (let i = 0; i < serpSlots.length; i++) {
      const slot = serpSlots[i]!;
      const planIdx = i + 1;
      if (batchPlanEnabled) {
        const bp = serpQueryPlanByIndex.get(planIdx);
        if (bp?.skip) continue;
      }
      const pack = suggestPacks[i]!;
      const d = resolveDraftQueryBeforeSerpBatch(slot.copy, pack, jobContext, vanityRunInches);
      const { q, skipEntirely } = resolveHdSerpQueryForSerpSlot(slot);

      let candidate_homedepot_items: {
        link: string;
        title: string;
        image_url?: string;
      }[] = [];
      if (
        wantHd &&
        !skipEntirely &&
        q.trim() &&
        hdCandidateSerpCalls < hdCandidateSerpMax &&
        process.env.SERPAPI_API_KEY?.trim()
      ) {
        hdCandidateSerpCalls++;
        try {
          await delay(180);
          const excludeMerged = collectHdSkusExcludingLineIdx(slot.lineIdx);
          const hits = await searchHomeDepotProductCandidates(q, {
            ...zipOpt,
            preferSale,
            line: { name: slot.copy.name, notes: slot.copy.notes, trade: slot.copy.trade },
            ...(excludeMerged.length > 0 ? { excludeProductIds: excludeMerged } : {}),
            max: 5,
            ...vanityWidthSerpOptionsForLine(slot.copy, vanityRunInches, jobContext),
            ...showerBaseSerpOptionsForLine(slot.copy, jobContext),
          });
          candidate_homedepot_items = hits
            .map((h) => ({
              link: h.link.trim(),
              title: h.title.trim().slice(0, 280),
              ...(h.image_url?.trim() ? { image_url: h.image_url.trim() } : {}),
            }))
            .filter((it) => it.link.startsWith("http"));
        } catch {
          candidate_homedepot_items = [];
        }
      }

      urlProbeRows.push({
        plan_index: planIdx,
        name: slot.copy.name,
        notes: slot.copy.notes,
        trade: slot.copy.trade,
        draft_query: d.draftQ.trim() || buildLineSearchQuery(slot.copy).slice(0, 200),
        candidate_homedepot_items,
      });
      if (urlProbeRows.length >= 40) break;
    }
    if (urlProbeRows.length > 0) {
      try {
        const signal =
          typeof AbortSignal !== "undefined" &&
          typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
            ? AbortSignal.timeout(90_000)
            : undefined;
        hdUrlPlanByPlanIndex = await fetchRetailHomedepotUrlPlanBatch({
          apiKey: process.env.OPENAI_API_KEY,
          bidTitle,
          jobContext,
          quoteLinesSummary,
          beforePhotoUrls: beforePhotoUrls.length > 0 ? beforePhotoUrls : undefined,
          rows: urlProbeRows,
          signal,
        });
      } catch {
        hdUrlPlanByPlanIndex = new Map();
      }
    }
    retailUrlProbeReport = urlProbeRows.map((row) => {
      const plan = hdUrlPlanByPlanIndex.get(row.plan_index);
      return {
        plan_index: row.plan_index,
        line_name: row.name.trim().slice(0, 220),
        shoppable_hd: plan?.shoppableHd ?? true,
        homedepot_urls: plan?.urls ?? [],
        ...(row.candidate_homedepot_items && row.candidate_homedepot_items.length > 0
          ? { serp_candidate_urls: row.candidate_homedepot_items.map((it) => it.link) }
          : {}),
      };
    });
  }

  /** Default off: server HEAD/GET to homedepot.com often stalls; Serp product lookup is the real verifier. */
  const httpCheckRaw = (process.env.RETAIL_HD_URL_HTTP_CHECK ?? "false").trim().toLowerCase();
  const httpCheckEnabled =
    httpCheckRaw !== "0" && httpCheckRaw !== "false" && httpCheckRaw !== "no";

  for (const ent of hdFetchPlan) {
    if (ent.kind === "done") {
      next.push(ent.lineForNext);
      continue;
    }

    const { lineIdx, copy, serpOrder } = ent;
    const line = lines[lineIdx]!;

    const hdUrlPlan = hdUrlPlanByPlanIndex.get(serpOrder + 1);
    if (hdUrlPlan && hdUrlPlan.shoppableHd === false) {
      skipped++;
      next.push(stripLowesRetailFields(stripHomeDepotRetailFields(copy)));
      continue;
    }

    const vanityEnhanceOpts =
      vanityRunInches != null ? { vanityRunWidthInches: vanityRunInches } : undefined;

    const batchPlan = serpQueryPlanByIndex.get(serpOrder + 1);
    let q = "";
    let qFromBatch = false;
    if (batchPlan) {
      if (batchPlan.skip) {
        skipped++;
        next.push(stripLowesRetailFields(stripHomeDepotRetailFields(copy)));
        continue;
      }
      const tq = batchPlan.hd_query.trim();
      if (tq) {
        q = enhanceRetailSearchQuery(tq, copy, vanityEnhanceOpts);
        qFromBatch = true;
      }
    }

    if (!qFromBatch) {
      const pack = suggestByLineIdx.get(lineIdx);
      if (!pack || !pack.ok) {
        if (heuristicShouldSkipHomeDepotSearch(copy)) {
          skipped++;
          next.push(stripLowesRetailFields(stripHomeDepotRetailFields(copy)));
          continue;
        }
        q = buildFallbackSearchQuery(jobContext, copy, undefined, vanityRunInches);
        if (!q) {
          q = buildLineSearchQuery(copy);
        }
        if (!q.trim()) {
          skipped++;
          next.push(stripLowesRetailFields(stripHomeDepotRetailFields(copy)));
          continue;
        }
      } else {
        const suggestion = pack.suggestion;
        if (suggestion.skip) {
          skipped++;
          next.push(stripLowesRetailFields(stripHomeDepotRetailFields(copy)));
          continue;
        }
        q = (suggestion.searchQuery ?? "").trim();
        if (!q.trim()) {
          skipped++;
          next.push(stripLowesRetailFields(stripHomeDepotRetailFields(copy)));
          continue;
        }
      }
    }

    let hdOk = false;
    let lowesOk = false;

    if (wantHd && hdSerpCalls < HD_FETCH_MAX_SERPCALLS_PER_RETAILER) {
      const excludeHd = collectOtherHdSkus(lineIdx);
      const urlCandidates = hdUrlPlan?.urls ?? [];
      let hitFromHd: Awaited<ReturnType<typeof fetchHomeDepotProductByProductId>> = null;
      let hitResolvedViaUrlProbe = false;

      const resolvedFromUrls: NonNullable<
        Awaited<ReturnType<typeof fetchHomeDepotProductByProductId>>
      >[] = [];
      for (const rawUrl of urlCandidates) {
        if (hdSerpCalls >= HD_FETCH_MAX_SERPCALLS_PER_RETAILER) break;
        const pid = extractHomedepotProductIdFromUrl(rawUrl);
        if (!pid) continue;
        const normPid = normalizeRetailSkuDigits(pid);
        if (normPid && excludeHd.includes(normPid)) continue;
        if (httpCheckEnabled) {
          const reach = await checkHomedepotProductPageReachability(rawUrl);
          if (reach === "not_found") continue;
        }
        hdSerpCalls++;
        try {
          await delay(200);
          const h = await fetchHomeDepotProductByProductId(pid, zipOpt);
          if (h) resolvedFromUrls.push(h);
        } catch {
          /* try next candidate URL */
        }
      }
      if (resolvedFromUrls.length > 0) {
        const chosen = await pickHomeDepotUrlProbeHitOrNull({
          apiKey: process.env.OPENAI_API_KEY,
          bidTitle,
          jobContext,
          quoteLinesSummary,
          beforePhotoUrls,
          line: { name: copy.name, notes: copy.notes, trade: copy.trade },
          hits: resolvedFromUrls,
        });
        if (chosen) {
          hitFromHd = chosen;
          hitResolvedViaUrlProbe = true;
        }
      }

      let hdFailureRecorded = false;
      if (!hitFromHd && hdSerpCalls < HD_FETCH_MAX_SERPCALLS_PER_RETAILER) {
        hdSerpCalls++;
        try {
          await delay(200);
          hitFromHd = await searchHomeDepotProduct(q, {
            ...zipOpt,
            preferSale,
            line: { name: copy.name, notes: copy.notes, trade: copy.trade },
            ...(excludeHd.length > 0 ? { excludeProductIds: excludeHd } : {}),
            ...vanityWidthSerpOptionsForLine(copy, vanityRunInches, jobContext),
            ...showerBaseSerpOptionsForLine(copy, jobContext),
          });
        } catch (e) {
          hdFailureRecorded = true;
          failed.push({
            name: line.name.slice(0, 80),
            reason: e instanceof Error ? e.message.slice(0, 120) : "Home Depot search failed",
          });
        }
      } else if (!hitFromHd) {
        hdFailureRecorded = true;
        failed.push({
          name: line.name.slice(0, 80),
          reason: "Home Depot: Serp budget exhausted before a match",
        });
      }

      if (hitFromHd) {
        try {
          const verified = await verifyHomeDepotSearchHitForProductLink(hitFromHd, zipOpt);
          if (verified) {
            hitFromHd = verified;
          } else {
            hitFromHd = null;
            hdFailureRecorded = true;
            failed.push({
              name: line.name.slice(0, 80),
              reason: "Home Depot: product did not resolve to a valid product page with image",
            });
          }
        } catch (e) {
          hitFromHd = null;
          hdFailureRecorded = true;
          failed.push({
            name: line.name.slice(0, 80),
            reason:
              e instanceof Error
                ? `Home Depot verification failed: ${e.message.slice(0, 100)}`
                : "Home Depot verification failed",
          });
        }
      }

      if (hitFromHd) {
        mergeHomeDepotSearchHitIntoLine(copy, hitFromHd);
        adjustShowerTileQuantityAfterRetailAttach({
          line: copy,
          jobContext,
          productTitle: hitFromHd.title,
        });
        if (
          (hitFromHd.price_was_usd != null && hitFromHd.price_was_usd > hitFromHd.price_usd) ||
          (hitFromHd.percentage_off != null && hitFromHd.percentage_off > 0) ||
          (hitFromHd.price_badge != null && String(hitFromHd.price_badge).trim().length > 0)
        ) {
          saleMatches++;
        }
        hdOk = true;
        updatedHd++;
        if (hitResolvedViaUrlProbe) retailUrlProbeHits++;
      } else if (!hdFailureRecorded) {
        failed.push({
          name: line.name.slice(0, 80),
          reason: "Home Depot: no priced match",
        });
      }
    }

    if (wantLowes && lowesSerpCalls < HD_FETCH_MAX_SERPCALLS_PER_RETAILER) {
      lowesSerpCalls++;
      try {
        await delay(200);
        const excludeLw = collectOtherLwSkus(lineIdx);
        let lwHit = await searchLowesProduct(q, {
          preferSale,
          line: { name: copy.name, notes: copy.notes, trade: copy.trade },
          ...(excludeLw.length > 0 ? { excludeProductIds: excludeLw } : {}),
          ...vanityWidthSerpOptionsForLine(copy, vanityRunInches, jobContext),
        });
        const qLowesFallback = buildLineSearchQuery(copy).replace(/\s+/g, " ").trim().slice(0, 120);
        if (
          !lwHit &&
          lowesSerpCalls < HD_FETCH_MAX_SERPCALLS_PER_RETAILER &&
          qLowesFallback.length > 3 &&
          qLowesFallback.toLowerCase() !== q.trim().toLowerCase()
        ) {
          lowesSerpCalls++;
          await delay(200);
          lwHit = await searchLowesProduct(qLowesFallback, {
            preferSale,
            line: { name: copy.name, notes: copy.notes, trade: copy.trade },
            ...(excludeLw.length > 0 ? { excludeProductIds: excludeLw } : {}),
            ...vanityWidthSerpOptionsForLine(copy, vanityRunInches, jobContext),
          });
        }
        if (lwHit) {
          mergeLowesSearchHitIntoLine(copy, lwHit);
          adjustShowerTileQuantityAfterRetailAttach({
            line: copy,
            jobContext,
            productTitle: lwHit.title,
          });
          lowesOk = true;
          updatedLowes++;
        } else {
          failed.push({
            name: line.name.slice(0, 80),
            reason: "Lowe's: no priced match (Google site search)",
          });
        }
      } catch (e) {
        failed.push({
          name: line.name.slice(0, 80),
          reason: e instanceof Error ? e.message.slice(0, 120) : "Lowe's search failed",
        });
      }
    }

    if (hdOk || lowesOk) {
      maybeAppendVanityStockNote(copy, vanityRunInches);
      applyRetailShelfFromLowest(copy);
      collapseLineToSingleWinningRetailer(copy);
      updated++;
    }

    next.push(copy);
  }

  const shelfValRaw = (process.env.RETAIL_SHELF_MATCH_VALIDATION ?? "true").trim().toLowerCase();
  const shelfValidationEnabled =
    !params.skipShelfMatchValidation &&
    wantHd &&
    shelfValRaw !== "0" &&
    shelfValRaw !== "false" &&
    shelfValRaw !== "no" &&
    Boolean(process.env.OPENAI_API_KEY?.trim());

  if (shelfValidationEnabled) {
    const retailRows: { idxInNext: number }[] = [];
    const linesForBlock: BidMaterialLine[] = [];
    for (let i = 0; i < next.length; i++) {
      const L = next[i]!;
      const qualifies =
        lineQualifiesForHomeDepotPricing(L.trade) && L.name.trim().length > 0;
      const hasShelf = Boolean(L.hd_title?.trim() || L.lw_title?.trim());
      if (!qualifies || !hasShelf) continue;
      retailRows.push({ idxInNext: i });
      linesForBlock.push(L);
      if (retailRows.length >= RETAIL_SHELF_VALIDATE_MAX_LINES) break;
    }

    if (linesForBlock.length > 0) {
      const numbered = linesForBlock
        .map((L, j) => {
          const trade = L.trade && L.trade !== "general" ? `[${L.trade}] ` : "";
          const hd = (L.hd_title ?? "").trim().slice(0, 140);
          const lw = (L.lw_title ?? "").trim().slice(0, 140);
          const hid = normalizeRetailSkuDigits(L.hd_product_id) ?? "(none)";
          const lwid = normalizeRetailSkuDigits(L.lw_product_id) ?? "(none)";
          const notes = (L.notes ?? "").trim().slice(0, 160);
          const noteSeg = notes ? ` | line notes: ${notes}` : "";
          return `${j + 1}. ${trade}${L.name.trim().slice(0, 200)}${noteSeg} | HD: ${hd || "(none)"} | HD_ID: ${hid} | Lowe's: ${lw || "(none)"} | LW_ID: ${lwid}`;
        })
        .join("\n");

      const corrections = await fetchRetailShelfMatchCorrections({
        apiKey: process.env.OPENAI_API_KEY,
        bidTitle,
        jobContext,
        numberedRetailLines: numbered,
        beforePhotoUrls: beforePhotoUrls.length > 0 ? beforePhotoUrls : undefined,
        quoteLinesSummary,
      });

      let refineHdSerpCalls = 0;
      for (const c of corrections) {
        if (c.ok || !c.refined_hd_query?.trim()) continue;
        if (refineHdSerpCalls >= RETAIL_SHELF_REFINE_MAX_SERPS) break;
        const slot = c.line_index - 1;
        if (slot < 0 || slot >= retailRows.length) continue;
        const L = next[retailRows[slot]!.idxInNext]!;
        refineHdSerpCalls++;
        try {
          await delay(250);
          const ok = await tryRefineHomeDepotLineWithQuery({
            L,
            idxInNext: retailRows[slot]!.idxInNext,
            refinedHdQuery: c.refined_hd_query.trim(),
          });
          if (ok) retailValidationCorrections++;
        } catch {
          /* keep previous shelf */
        }
      }
    }
  }

  const visionValRaw = (process.env.RETAIL_VISION_PRODUCT_VALIDATE ?? "true").trim().toLowerCase();
  const visionValidationEnabled =
    !params.skipShelfMatchValidation &&
    beforePhotoUrls.length > 0 &&
    wantHd &&
    Boolean(process.env.OPENAI_API_KEY?.trim()) &&
    visionValRaw !== "0" &&
    visionValRaw !== "false" &&
    visionValRaw !== "no";

  if (visionValidationEnabled) {
    const visionRows: { idxInNext: number; row: RetailShelfVisionProductRow }[] = [];
    for (let i = 0; i < next.length; i++) {
      const L = next[i]!;
      const qualifies = lineQualifiesForHomeDepotPricing(L.trade) && L.name.trim().length > 0;
      if (!qualifies) continue;
      const catalogUrl = catalogRetailImageUrlForMockup(L);
      if (!catalogUrl?.trim()) continue;
      const hdImg = (L.hd_image_url ?? "").trim();
      const cat = catalogUrl.trim();
      const productTitle =
        hdImg && cat === hdImg
          ? (L.hd_title ?? "").trim() || (L.lw_title ?? "").trim()
          : (L.lw_title ?? "").trim() || (L.hd_title ?? "").trim();
      if (!productTitle) continue;
      const lightboxUrl = retailImageUrlForLightbox(cat);
      if (!lightboxUrl.startsWith("http")) continue;
      visionRows.push({
        idxInNext: i,
        row: {
          line_index: visionRows.length + 1,
          name: L.name,
          notes: L.notes,
          trade: L.trade,
          product_title: productTitle,
          product_image_url: lightboxUrl,
        },
      });
      if (visionRows.length >= 12) break;
    }

    if (visionRows.length > 0) {
      const beforeForVision = beforePhotoUrls.filter((u) => u.startsWith("http"));
      const visionSerpRaw = process.env.RETAIL_VISION_REFINE_MAX_SERPS?.trim();
      const visionSerpParsed = visionSerpRaw ? Number(visionSerpRaw) : NaN;
      const maxVisionSerps = Number.isFinite(visionSerpParsed)
        ? Math.max(0, Math.min(24, Math.floor(visionSerpParsed)))
        : 10;
      try {
        const signal =
          typeof AbortSignal !== "undefined" &&
          typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
            ? AbortSignal.timeout(90_000)
            : undefined;
        const validations = await fetchRetailShelfVisionProductFitValidations({
          apiKey: process.env.OPENAI_API_KEY,
          bidTitle,
          jobContext,
          quoteLinesSummary,
          beforePhotoUrls: beforeForVision,
          rows: visionRows.map((v) => v.row),
          signal,
        });
        let visionHdSerpCalls = 0;
        for (const v of validations) {
          if (v.ok || !v.refined_hd_query?.trim()) continue;
          const slot = v.line_index - 1;
          if (slot < 0 || slot >= visionRows.length) continue;
          if (visionHdSerpCalls >= maxVisionSerps) break;
          const { idxInNext } = visionRows[slot]!;
          const L = next[idxInNext]!;
          visionHdSerpCalls++;
          try {
            await delay(250);
            const ok = await tryRefineHomeDepotLineWithQuery({
              L,
              idxInNext,
              refinedHdQuery: v.refined_hd_query.trim(),
            });
            if (ok) retailVisionValidationCorrections++;
          } catch {
            /* keep previous shelf */
          }
        }
      } catch {
        /* vision batch failed — keep lines */
      }
    }
  }

  return {
    lines: next,
    updated,
    updated_hd: updatedHd,
    updated_lowes: updatedLowes,
    skipped,
    failed,
    sale_matches: saleMatches,
    retail_validation_corrections: retailValidationCorrections,
    retail_vision_validation_corrections: retailVisionValidationCorrections,
    retail_url_probe_hits: retailUrlProbeHits,
    retail_url_probe_report: retailUrlProbeReport,
  };
}
