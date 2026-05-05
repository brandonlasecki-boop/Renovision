"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { parseMaterialEstimate } from "@/lib/data/bids";
import { shouldSkipRetailSearchForVanityCabinetDueToCustomMillwork } from "@/lib/ai/bid-questions";
import {
  buildFallbackSearchQuery,
  enhanceRetailSearchQuery,
  extractMinVanityCabinetWidthInchesFromRetailText,
  extractVanityCabinetRunWidthInchesFromJobContext,
  mergeVanityRunWidthInchesForRetail,
  showerBaseSerpOptionsForLine,
  stripHomeDepotRetailFields,
  stripLowesRetailFields,
  suggestHomeDepotSearchOrSkip,
  vanityWidthSerpOptionsForLine,
} from "@/lib/ai/homedepot-retail-query";
import { buildCompositeScopeDescription, refineMaterialTradeFromLineName } from "@/lib/bid-scope";
import { getHomeownerTryProjectById, updateHomeownerTryProjectAi } from "@/lib/homeowner-try/repository";
import { getRenovisionAnonymousSessionIdFromCookie } from "@/lib/renovision/anonymous-cookie";
import {
  buildLineSearchQuery,
  extractHomedepotProductIdFromUrl,
  fetchHomeDepotProductByProductId,
  searchHomeDepotProductCandidates,
  verifyHomeDepotSearchHitForProductLink,
} from "@/lib/integrations/serpapi-homedepot";
import type { HomeDepotSearchHit } from "@/lib/integrations/serpapi-homedepot";
import { searchLowesProductCandidates } from "@/lib/integrations/serpapi-lowes";
import type { LowesSearchHit } from "@/lib/integrations/serpapi-lowes";
import {
  buildQuoteLinesSummaryForRetailAi,
  normalizeRetailSkuDigits,
  normalizeUsZipForHd,
} from "@/lib/retail/retail-pricing-helpers";
import {
  applyShelfPriceFromChosenRetailer,
  mergeHomeDepotSearchHitIntoLine,
  mergeLowesSearchHitIntoLine,
} from "@/lib/retail/shelf-line-merge";
import { adjustShowerTileQuantityAfterRetailAttach } from "@/lib/retail-tile-quantity";
import type { BidMaterialLine, BidMaterialTrade } from "@/types/bid";

async function readViewerKeys(): Promise<{
  userId: string | null;
  anonymousSessionId: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const anon = await getRenovisionAnonymousSessionIdFromCookie();
  return {
    userId: user?.id ?? null,
    anonymousSessionId: anon,
  };
}

function viewerCanAccessTryProject(
  project: { user_id: string | null; anonymous_session_id: string | null },
  userId: string | null,
  anonymousSessionId: string | null,
): boolean {
  if (userId) {
    if (project.user_id && project.user_id !== userId) return false;
    if (!project.user_id && project.anonymous_session_id !== anonymousSessionId) return false;
    return true;
  }
  return project.anonymous_session_id === anonymousSessionId;
}

export async function fetchTryRetailShelfCandidatesAction(
  projectId: string,
  lineId: string,
  searchHint?: string,
): Promise<
  | { error: string }
  | { success: true; q: string; home_depot: HomeDepotSearchHit[]; lowes: LowesSearchHit[] }
> {
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    return { error: "Retail search is not configured." };
  }

  const pid = projectId.trim();
  const lid = lineId.trim();
  if (!pid || !lid) {
    return { error: "Missing preview or line." };
  }

  const { userId, anonymousSessionId } = await readViewerKeys();
  const project = await getHomeownerTryProjectById(pid);
  if (!project) {
    return { error: "Preview not found." };
  }
  if (!viewerCanAccessTryProject(project, userId, anonymousSessionId)) {
    return { error: "You do not have access to this preview." };
  }

  const lines = parseMaterialEstimate(project.material_estimate);
  const line = lines.find((l) => l.line_id === lid);
  if (!line || !line.name.trim()) {
    return { error: "Line not found." };
  }

  const service = createServiceClient();
  const beforeSigned = await service.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(project.before_storage_path, 60 * 30);
  const pickerBeforeUrls = beforeSigned.data?.signedUrl ? [beforeSigned.data.signedUrl] : [];
  const pickerQuoteSummary = buildQuoteLinesSummaryForRetailAi(lines);

  const retailTrade = refineMaterialTradeFromLineName(
    line.name,
    (line.trade ?? "general") as BidMaterialTrade,
  );
  const lineForRetail: BidMaterialLine = { ...line };
  if (retailTrade === "general") delete lineForRetail.trade;
  else lineForRetail.trade = retailTrade;

  if (shouldSkipRetailSearchForVanityCabinetDueToCustomMillwork(lineForRetail, undefined)) {
    return { success: true as const, q: "", home_depot: [], lowes: [] };
  }

  const jobContext = buildCompositeScopeDescription({
    scope_description: String(project.scope_description ?? ""),
  });
  const bidTitle = "Bathroom preview";
  const jobRun = extractVanityCabinetRunWidthInchesFromJobContext(jobContext);
  const hint = searchHint?.trim().slice(0, 500);
  const widthFromHint = hint ? extractMinVanityCabinetWidthInchesFromRetailText(hint) : undefined;
  const widthFromLineNotes = extractMinVanityCabinetWidthInchesFromRetailText(
    `${lineForRetail.name} ${lineForRetail.notes ?? ""}`,
  );
  const vanityRunInches = mergeVanityRunWidthInchesForRetail(
    mergeVanityRunWidthInchesForRetail(jobRun, widthFromHint),
    widthFromLineNotes,
  );
  const enhanceOpts =
    vanityRunInches != null ? { vanityRunWidthInches: vanityRunInches } : undefined;

  const zipFromEnv = normalizeUsZipForHd(process.env.SERPAPI_HOME_DEPOT_ZIP);
  const zipOpt = zipFromEnv ? { deliveryZip: zipFromEnv } : undefined;

  let q = "";
  try {
    const suggestion = await suggestHomeDepotSearchOrSkip({
      apiKey: process.env.OPENAI_API_KEY,
      jobContext,
      bidTitle,
      line: {
        name: lineForRetail.name,
        notes: lineForRetail.notes,
        trade: lineForRetail.trade,
      },
      replacementInstructions: hint,
      beforePhotoUrls: pickerBeforeUrls.length > 0 ? pickerBeforeUrls : undefined,
      quoteLinesSummary: pickerQuoteSummary,
      timeoutMs: 8_000,
    });
    if (!suggestion.skip && suggestion.searchQuery?.trim()) {
      q = enhanceRetailSearchQuery(suggestion.searchQuery.trim(), lineForRetail, enhanceOpts);
    }
  } catch {
    /* fallback */
  }
  if (!q.trim()) {
    q = buildFallbackSearchQuery(jobContext, lineForRetail, hint, vanityRunInches);
  }
  if (!q.trim()) {
    q = buildLineSearchQuery(lineForRetail);
  }
  if (!q.trim()) {
    return { error: "Could not build a search query for this line." };
  }

  const tryLowes = process.env.RENOVISION_TRY_RETAIL_INCLUDE_LOWES === "true";
  const otherHdFromQuote = lines
    .filter((l) => l.line_id !== lid)
    .map((l) => normalizeRetailSkuDigits(l.hd_product_id))
    .filter((x): x is string => Boolean(x));
  const otherLwFromQuote = lines
    .filter((l) => l.line_id !== lid)
    .map((l) => normalizeRetailSkuDigits(l.lw_product_id))
    .filter((x): x is string => Boolean(x));
  const excludeHd = [...new Set(otherHdFromQuote)].filter((id) => id.length >= 6 && id.length <= 12);
  const excludeLw = [...new Set(otherLwFromQuote)].filter((id) => id.length >= 6 && id.length <= 12);

  let home_depot: HomeDepotSearchHit[] = [];
  let lowes: LowesSearchHit[] = [];
  const perStoreMax = 4;

  try {
    const hdRaw = await searchHomeDepotProductCandidates(q, {
      ...zipOpt,
      preferSale: false,
      line: {
        name: lineForRetail.name,
        notes: lineForRetail.notes,
        trade: lineForRetail.trade,
      },
      max: perStoreMax,
      ...(excludeHd.length > 0 ? { excludeProductIds: excludeHd } : {}),
      ...vanityWidthSerpOptionsForLine(lineForRetail, vanityRunInches, jobContext),
      ...showerBaseSerpOptionsForLine(lineForRetail, jobContext),
    });
    for (const hit of hdRaw) {
      const verified = await verifyHomeDepotSearchHitForProductLink(hit, zipOpt);
      if (verified) home_depot.push(verified);
      if (home_depot.length >= perStoreMax) break;
    }
    if (tryLowes) {
      lowes = await searchLowesProductCandidates(q, {
        preferSale: false,
        line: {
          name: lineForRetail.name,
          notes: lineForRetail.notes,
          trade: lineForRetail.trade,
        },
        max: perStoreMax,
        ...(excludeLw.length > 0 ? { excludeProductIds: excludeLw } : {}),
        ...vanityWidthSerpOptionsForLine(lineForRetail, vanityRunInches, jobContext),
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/abort|timeout|timed?\s*out/i.test(msg)) {
      return { error: "Home Depot search timed out. Try a more specific size or style and search again." };
    }
    return {
      error: e instanceof Error ? e.message.slice(0, 200) : "Retail search failed.",
    };
  }

  return { success: true as const, q, home_depot, lowes };
}

export async function applyTryRetailShelfCandidateChoiceAction(
  projectId: string,
  lineId: string,
  choice: { retailer: "home_depot" | "lowes"; hit: HomeDepotSearchHit | LowesSearchHit },
): Promise<{ error: string } | { success: true }> {
  const pid = projectId.trim();
  const lid = lineId.trim();
  if (!pid || !lid) {
    return { error: "Missing preview or line." };
  }

  const { userId, anonymousSessionId } = await readViewerKeys();
  const project = await getHomeownerTryProjectById(pid);
  if (!project) {
    return { error: "Preview not found." };
  }
  if (!viewerCanAccessTryProject(project, userId, anonymousSessionId)) {
    return { error: "You do not have access to this preview." };
  }

  const lines = parseMaterialEstimate(project.material_estimate);
  if (!lines.some((l) => l.line_id === lid)) {
    return { error: "Line not found." };
  }

  const jobContext = buildCompositeScopeDescription({
    scope_description: String(project.scope_description ?? ""),
  });

  let verifiedHomeDepotHit: HomeDepotSearchHit | null = null;
  if (choice.retailer === "home_depot") {
    const rawHit = choice.hit as HomeDepotSearchHit;
    const productId =
      rawHit.product_id?.replace(/\D/g, "") || extractHomedepotProductIdFromUrl(rawHit.link);
    if (!productId) {
      return { error: "That Home Depot product link could not be verified." };
    }
    try {
      verifiedHomeDepotHit = await fetchHomeDepotProductByProductId(productId);
    } catch (e) {
      return {
        error:
          e instanceof Error
            ? `Home Depot product verification failed: ${e.message.slice(0, 160)}`
            : "Home Depot product verification failed.",
      };
    }
    if (!verifiedHomeDepotHit?.image_url?.trim()) {
      return { error: "That Home Depot product no longer resolves to a valid product page with image." };
    }
  }

  const next = lines.map((l) => {
    if (l.line_id !== lid) return l;
    let copy: BidMaterialLine = { ...l };
    if (choice.retailer === "home_depot") {
      copy = stripLowesRetailFields(copy);
      mergeHomeDepotSearchHitIntoLine(copy, verifiedHomeDepotHit!);
      adjustShowerTileQuantityAfterRetailAttach({
        line: copy,
        jobContext,
        productTitle: verifiedHomeDepotHit!.title,
      });
      applyShelfPriceFromChosenRetailer(copy, "home_depot");
    } else {
      copy = stripHomeDepotRetailFields(copy);
      mergeLowesSearchHitIntoLine(copy, choice.hit as LowesSearchHit);
      adjustShowerTileQuantityAfterRetailAttach({
        line: copy,
        jobContext,
        productTitle: (choice.hit as LowesSearchHit).title,
      });
      applyShelfPriceFromChosenRetailer(copy, "lowes");
    }
    return copy;
  });

  await updateHomeownerTryProjectAi(pid, { material_estimate: next });
  revalidatePath("/try");
  revalidatePath("/upload");
  return { success: true as const };
}
