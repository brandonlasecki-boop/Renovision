"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { getCompanyForUser } from "@/lib/data/dashboard";
import type {
  BidLineTemplate,
  BidMaterialLine,
  BidMaterialTrade,
  BidMockupGenerationMeta,
  BidStatus,
} from "@/types/bid";
import { buildLineReferenceUrlMap, mapLineTemplateRow, parseMaterialEstimate } from "@/lib/data/bids";
import {
  ADDITIONAL_ONLY_ZERO_DRIFT,
  appendMockupLayoutFooter,
  buildDeterministicNoRefMockupRemodelPrompt,
  buildImageEditPrompt,
  buildMockupQuoteLineContextFromVisualAndTextLines,
  compressMockupJobContextForVertexImagePrompt,
  mirrorHeavySceneFromVertexJobBrief,
  buildStrictRemodelEditPrompt,
  fetchFallbackConceptImage,
  fetchMaterialsAndSummaryFromOpenAI,
  fetchRoomRemodelImageEdit,
  formatMockupLinesForCompression,
  formatMockupLinesTextOnlyNoProductImages,
  formatQuoteLinesForImageEdit,
  formatFullQuoteLinesForMockupEstimateContext,
  buildReferenceVisualFallbackText,
  mockupReferenceVisionMaxRefs,
  summarizeReferenceImagesForMockup,
  synthesizeMockupInstructionsForVertexNoProductImages,
  sanitizeRemodelEditPromptForMockupImage,
  sanitizeRoomAnalysisForMockupImage,
  roomAnalysisSuggestsWeakFixtureGeometry,
  getImageEditSpatialLock,
  getRemodelLayoutGuard,
  INCREMENTAL_SURGICAL_EDIT,
  LATEST_MOCKUP_AS_BASELINE,
  mergeMaterialsPreservingRefs,
  MINIMAL_CHANGE_PROTOCOL,
  OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX,
  scopeMentionsToiletWork,
  SURFACE_ARCHITECTURE_HARDWARE_LOCK,
} from "@/lib/ai/openai-bid";
import {
  isOpenAiFallbackOnVertexAuthErrorEnabled,
  formatMockupImageModelCaptionFragment,
  googleCloudProjectId,
  isVertexGoogleUserAuthFailureMessage,
  isVertexMockupConfigured,
  resolveMockupImageProvider,
  vertexGeminiImageModel,
  vertexLocation,
  type MockupImageProviderId,
} from "@/lib/ai/mockup-image-provider";
import {
  buildVertexRemodelMockupRequestParts,
  fetchMockupReferenceImagesForVertex,
  fetchRoomRemodelImageEditVertexGemini,
  summarizeVertexRemodelPartsForDebug,
  type VertexMockupReferenceInline,
} from "@/lib/ai/vertex-gemini-image-edit";
import {
  buildFallbackSearchQuery,
  buildRetailTitleScoreHint,
  enhanceRetailSearchQuery,
  extractMinVanityCabinetWidthInchesFromRetailText,
  extractVanityCabinetRunWidthInchesFromJobContext,
  heuristicShouldSkipHomeDepotSearch,
  mergeVanityRunWidthInchesForRetail,
  showerBaseSerpOptionsForLine,
  stripHomeDepotRetailFields,
  stripLowesRetailFields,
  suggestHomeDepotSearchOrSkip,
  vanityWidthSerpOptionsForLine,
} from "@/lib/ai/homedepot-retail-query";
import {
  buildLineSearchQuery,
  extractHomedepotProductIdFromUrl,
  fetchHomeDepotProductByProductId,
  isAllowedHomedepotProductImageUrl,
  lineQualifiesForHomeDepotPricing,
  searchHomeDepotProduct,
  searchHomeDepotProductCandidates,
  verifyHomeDepotSearchHitForProductLink,
  type HomeDepotSearchHit,
} from "@/lib/integrations/serpapi-homedepot";
import {
  extractLowesProductIdFromUrl,
  fetchLowesProductFromUrl,
  isAllowedLowesProductImageUrl,
  searchLowesProduct,
  searchLowesProductCandidates,
  type LowesSearchHit,
} from "@/lib/integrations/serpapi-lowes";
import {
  extractSitePostalCodeFromQuestionnaire,
  fetchProjectQuestionsFromOpenAI,
  shouldSkipRetailSearchForVanityCabinetDueToCustomMillwork,
  validateJobSiteZipQuestionnaire,
} from "@/lib/ai/bid-questions";
import { fetchRoomDimensionsFromPhotosOpenAI } from "@/lib/ai/room-dimensions-from-photos";
import {
  applyPerLinePricingToLines,
  fetchPerLineQuotePricingFromOpenAI,
} from "@/lib/ai/bid-per-line-pricing";
import { fetchPricedBreakdownFromOpenAI } from "@/lib/ai/bid-priced-breakdown";
import { fetchScopeBreakdownLinesFromOpenAI } from "@/lib/ai/bid-scope-breakdown";
import { ensureContractorStatedScopeCoverage } from "@/lib/scope-contractor-coverage";
import {
  buildCompositeScopeDescription,
  formatRoomMeasurementLineForScope,
  normalizeMaterialTrade,
  parseRoomMeasurements,
  refineMaterialTradeFromLineName,
  roomMeasurementsLookEmpty,
} from "@/lib/bid-scope";
import {
  adjustShowerTileQuantityAfterRetailAttach,
  normalizeShowerTileRetailUnitCost,
} from "@/lib/retail-tile-quantity";
import { appendMissingRoughLaborLines } from "@/lib/labor-rough-append";
import { scoreRetailProductTitleForLine } from "@/lib/integrations/retail-search-relevance";
import { deriveBidTitleFromScope } from "@/lib/bid-title";
import { getNextSequentialQuoteTitle } from "@/lib/estimate-title";
import {
  catalogRetailImageUrlForMockup,
  enumerateMockupProductRefSlots,
  getMockupReferenceSlotSummaryStrings,
  lineHasMockupVisualReference,
  lineShouldAutoEnableMockupInclude,
  mockupFixtureZoneHint,
  quoteHasNewVanityCabinetAssembly,
  sortQuoteLinesForMockupProductRefs,
} from "@/lib/bid-mockup";
import { formatMockupProductRefStatusLine } from "@/lib/bid-mockup-utils";
import {
  attachRetailPricingToLines,
  type RetailUrlProbeReportRow,
} from "@/lib/retail/attach-retail-pricing-to-lines";
import {
  buildQuoteLinesSummaryForRetailAi,
  normalizeRetailSkuDigits,
  normalizeUsZipForHd,
} from "@/lib/retail/retail-pricing-helpers";
import { isRetailSerpDisabled } from "@/lib/retail/retail-serp-config";
import {
  applyRetailShelfFromLowest,
  applyShelfPriceFromChosenRetailer,
  maybeAppendVanityStockNote,
  mergeHomeDepotSearchHitIntoLine,
  mergeLowesSearchHitIntoLine,
} from "@/lib/retail/shelf-line-merge";
import type { ProjectQuestionDraft, ProjectQuestionnaireItem, RoomMeasurementRow } from "@/types/bid";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** After quote edits, invalidate the bid layout so /setup/mockup and /setup/pricing RSC refresh (not only the bid overview page). */
function revalidateBidQuoteSurfaces(bidId: string) {
  const id = bidId.trim();
  if (!id) return;
  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${id}`, "layout");
}

/** Copies `before` room photos into a new bid so mockups have the same jobsite image. */
async function copyBeforePhotosToNewBid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceBidId: string,
  newBidId: string,
): Promise<void> {
  const { data: rows } = await supabase
    .from("bid_photos")
    .select("storage_path, sort_order, caption")
    .eq("bid_id", sourceBidId)
    .eq("kind", "before")
    .order("sort_order", { ascending: true });
  if (!rows?.length) return;

  for (const raw of rows) {
    const r = raw as { storage_path: string; sort_order?: number; caption?: string | null };
    const oldPath = r.storage_path?.trim();
    if (!oldPath) continue;
    const lastDot = oldPath.lastIndexOf(".");
    const ext =
      lastDot > 0 && lastDot < oldPath.length - 1
        ? oldPath.slice(lastDot + 1).toLowerCase()
        : "jpg";
    const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
    const newPath = `bids/${newBidId}/${randomUUID()}.${safeExt}`;

    const { data: blob, error: dlErr } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .download(oldPath);
    if (dlErr || !blob) continue;

    const buf = Buffer.from(await blob.arrayBuffer());
    const contentType = blob.type || "image/jpeg";
    const { error: upErr } = await supabase.storage.from(PHOTOS_BUCKET).upload(newPath, buf, {
      contentType,
      upsert: false,
    });
    if (upErr) continue;

    await supabase.from("bid_photos").insert({
      bid_id: newBidId,
      storage_path: newPath,
      sort_order: Number(r.sort_order ?? 0),
      kind: "before",
      caption: r.caption ?? null,
    });
  }
}

/** Clears `ai_status: pending` when a run hung (timeout, closed tab, etc.). */
export async function clearStuckBidAiGeneration(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const bidId = str(formData, "bid_id");
  if (!bidId) {
    return { error: "Missing estimate." };
  }
  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }
  const { error } = await supabase
    .from("bids")
    .update({
      ai_status: "failed",
      ai_last_error:
        "Generation did not finish (host timeout, closed tab, or interrupted). Try again — Vertex mockups often take 2–6 minutes. On Vercel, raise the function time limit for this app (see bid route maxDuration) or run locally.",
    })
    .eq("id", bidId)
    .eq("ai_status", "pending");
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/setup/mockup`);
  return { success: true as const };
}

const REGEN_ATTACH_MAX_BYTES = 12 * 1024 * 1024;
const REGEN_ATTACH_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function regenAttachExtForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Optional image for one mockup regeneration — uploaded to storage and summarized with quote refs.
 */
async function loadRegenerationAttachmentRef(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bidId: string,
  formData: FormData,
): Promise<{ label: string; url: string } | null> {
  const raw = formData.get("regeneration_attachment");
  if (!raw || typeof raw === "string") {
    return null;
  }
  const file = raw as File;
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }
  if (file.size > REGEN_ATTACH_MAX_BYTES) {
    throw new Error(
      `Regeneration attachment is too large (max ${REGEN_ATTACH_MAX_BYTES / 1024 / 1024} MB).`,
    );
  }
  const mime = (file.type || "image/jpeg").toLowerCase();
  if (!REGEN_ATTACH_MIME.has(mime)) {
    throw new Error(
      "Regeneration attachment must be JPEG, PNG, WebP, or GIF.",
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = regenAttachExtForMime(mime);
  const storagePath = `bids/${bidId}/regen-ref-${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, buf, {
      contentType: mime,
      upsert: false,
    });
  if (upErr) {
    throw new Error(upErr.message);
  }
  const { data } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 60 * 120);
  if (!data?.signedUrl) {
    throw new Error("Could not sign regeneration attachment.");
  }
  const safeName = (file.name?.trim() || "attachment").slice(0, 80);
  const label = `THIS REGENERATION — contractor attachment (“${safeName}”): match this product look when the Notes below describe a swap or replacement (e.g. faucet, fixture, hardware) — treat as the target finish for that named object.`;
  return { label, url: data.signedUrl };
}

/**
 * Signed catalog + contractor reference URLs for mockup / GPT‑4o vision.
 * Does **not** dedupe by URL alone — two quote lines may legally share the same shelf image URL;
 * deduping previously dropped the second line’s label and mis‑mapped images to the wrong fixture.
 * Ref labels include `[Mockup product ref N]` in **iteration order** (match `quoteForMockupImage` when
 * that array is passed in).
 */
/**
 * Quote-line refs first (must align with `[Mockup product ref N]` in prompts), then optional
 * regeneration attachment — capped at 12 total. (Prepending the attachment used to shift every
 * Vertex JPEG one slot vs the text labels so the model applied the wrong SKU to each fixture.)
 */
function mergeQuoteRefsWithOptionalAttachment(
  quoteRefs: { label: string; url: string }[],
  attachment: { label: string; url: string } | null,
): { label: string; url: string }[] {
  const max = 12;
  if (!attachment) return quoteRefs.slice(0, max);
  return [...quoteRefs.slice(0, max - 1), attachment].slice(0, max);
}

async function collectMockupReferenceSignedUrls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lines: BidMaterialLine[],
): Promise<{ label: string; url: string }[]> {
  const out: { label: string; url: string }[] = [];
  for (const { line, refIndices } of enumerateMockupProductRefSlots(lines)) {
    let ri = 0;
    const baseName = line.name.trim();
    const zone = mockupFixtureZoneHint(line);
    const retailUrl = catalogRetailImageUrlForMockup(line);
    if (retailUrl) {
      const slot = refIndices[ri]!;
      ri += 1;
      const hdTrim = line.hd_image_url?.trim();
      const isHd = Boolean(hdTrim && retailUrl === hdTrim);
      const thumb = (isHd ? line.hd_title : line.lw_title)?.trim()?.slice(0, 48) ?? "product";
      const store = isHd ? "Home Depot" : "Lowe's";
      out.push({
        label: `[Mockup product ref ${slot}] ${baseName}. ${zone} — ${store} catalog: ${thumb} (selected for mockup)`,
        /** Raw shelf URL first — Vertex fetch tries `-1000` after; leading with lightbox URL often 403s. */
        url: retailUrl,
      });
    }
    if (line.reference_storage_path) {
      const slot = refIndices[ri]!;
      ri += 1;
      const baseLabel = line.notes?.trim()
        ? `${baseName} (${line.notes.trim()}) — contractor photo`
        : `${baseName} — contractor photo`;
      const { data } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(line.reference_storage_path, 60 * 120);
      if (data?.signedUrl) {
        out.push({
          label: `[Mockup product ref ${slot}] ${baseLabel}. ${zone} (selected for mockup)`,
          url: data.signedUrl,
        });
      }
    }
  }
  return out;
}

async function assertOwnBid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bidId: string,
): Promise<{ owner_id: string; company_id: string | null } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("bids")
    .select("owner_id, company_id")
    .eq("id", bidId)
    .maybeSingle();
  if (!data?.owner_id || String(data.owner_id) !== user.id) return null;
  return {
    owner_id: String(data.owner_id),
    company_id: data.company_id != null ? String(data.company_id) : null,
  };
}

export async function createBid(_prev: unknown, formData: FormData) {
  const title = str(formData, "title");
  if (!title) {
    return { error: "Title is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  const { data, error } = await supabase
    .from("bids")
    .insert({
      owner_id: user.id,
      company_id: null,
      title,
      customer_name: str(formData, "customer_name"),
      customer_email: str(formData, "customer_email") || null,
      customer_phone: str(formData, "customer_phone") || null,
      site_address_line1: str(formData, "site_address_line1") || null,
      site_city: str(formData, "site_city") || null,
      site_state: str(formData, "site_state") || null,
      site_postal_code: str(formData, "site_postal_code") || null,
      scope_description: str(formData, "scope_description"),
      internal_notes: str(formData, "internal_notes") || null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { error: error?.message ?? "Could not create estimate." };
  }

  await supabase.from("bids").update({ quote_family_id: data.id }).eq("id", data.id);

  revalidatePath("/dashboard/bids");
  redirect(`/dashboard/bids/${data.id}`);
}

export type CreateBidQuickStartState =
  | { error: string }
  | { success: true; bidId: string }
  | undefined;

/**
 * New estimate: scope + optional room measurements + at least one before photo (no plan upload).
 * On success returns `{ success, bidId }` so the client can navigate (avoids 404s from redirect racing RSC).
 */
export async function createBidQuickStart(
  _prev: unknown,
  formData: FormData,
): Promise<CreateBidQuickStartState> {
  const scope = str(formData, "scope_description");
  if (!scope) {
    return { error: "Describe what you want for the remodel first." };
  }

  const photoEntries = formData.getAll("before_photos");
  const photoFiles = photoEntries.filter(
    (e): e is File => e instanceof File && e.size > 0,
  );
  if (photoFiles.length === 0) {
    return { error: "Add at least one photo of the space before continuing." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  let room_measurements: RoomMeasurementRow[] = [];
  try {
    const raw = String(formData.get("room_measurements_json") ?? "[]");
    const rm = JSON.parse(raw) as unknown;
    if (Array.isArray(rm)) {
      room_measurements = rm.filter(
        (x): x is RoomMeasurementRow =>
          !!x &&
          typeof x === "object" &&
          typeof (x as RoomMeasurementRow).label === "string",
      ) as RoomMeasurementRow[];
    }
  } catch {
    return { error: "Invalid room measurements." };
  }

  const titleOverride = str(formData, "title");
  const title = titleOverride || (await getNextSequentialQuoteTitle(supabase, user.id));
  const { data, error } = await supabase
    .from("bids")
    .insert({
      owner_id: user.id,
      company_id: null,
      title,
      scope_description: scope,
      room_measurements,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { error: error?.message ?? "Could not create estimate." };
  }

  const bidId = String(data.id);
  await supabase.from("bids").update({ quote_family_id: bidId }).eq("id", bidId);

  let verifyErrMsg: string | null = null;
  let verified = false;
  for (let v = 0; v < 10; v++) {
    if (v > 0) await new Promise((r) => setTimeout(r, 100));
    const { data: rowVerify, error: verifyErr } = await supabase
      .from("bids")
      .select("id")
      .eq("id", bidId)
      .maybeSingle();
    if (verifyErr) {
      verifyErrMsg = verifyErr.message;
      break;
    }
    if (rowVerify?.id) {
      verified = true;
      break;
    }
  }
  if (verifyErrMsg) {
    await supabase.from("bids").delete().eq("id", bidId);
    return {
      error: `${verifyErrMsg} If this persists, check Supabase RLS policies on table "bids" (migration 013).`,
    };
  }
  if (!verified) {
    return {
      error:
        "The estimate saved but was not readable back from the database yet. Open Estimates from the sidebar and look for the newest draft, or wait a moment and try again.",
    };
  }

  let sortOrder = 0;
  for (const entry of photoFiles) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (entry.size > 20 * 1024 * 1024) {
      await supabase.from("bids").delete().eq("id", bidId);
      return { error: "Each photo must be 20 MB or smaller." };
    }
    const ext = entry.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext)
      ? ext
      : "jpg";
    const path = `bids/${bidId}/${crypto.randomUUID()}.${safeExt}`;
    const buffer = Buffer.from(await entry.arrayBuffer());
    const contentType =
      entry.type ||
      (safeExt === "heic" || safeExt === "heif" ? `image/${safeExt}` : "image/jpeg");
    const { error: uploadError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      await supabase.from("bids").delete().eq("id", bidId);
      return { error: uploadError.message };
    }

    sortOrder += 1;
    const { error: insPh } = await supabase.from("bid_photos").insert({
      bid_id: bidId,
      storage_path: path,
      sort_order: sortOrder,
      kind: "before",
    });

    if (insPh) {
      await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
      await supabase.from("bids").delete().eq("id", bidId);
      return { error: insPh.message };
    }
  }

  await tryAutoEstimateRoomMeasurementsFromPhotosIfEmpty(supabase, bidId);

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/walkthrough`);
  revalidatePath(`/dashboard/bids/${bidId}/setup`);
  return { success: true as const, bidId };
}

export async function updateBid(_prev: unknown, formData: FormData) {
  const bidId = str(formData, "bid_id");
  if (!bidId) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const status = str(formData, "status");
  const allowed = ["draft", "sent", "won", "lost", "archived"] as const;
  const nextStatus = allowed.includes(status as (typeof allowed)[number])
    ? (status as (typeof allowed)[number])
    : undefined;

  const { error } = await supabase
    .from("bids")
    .update({
      title: str(formData, "title"),
      customer_name: str(formData, "customer_name"),
      customer_email: str(formData, "customer_email") || null,
      customer_phone: str(formData, "customer_phone") || null,
      site_address_line1: str(formData, "site_address_line1") || null,
      site_city: str(formData, "site_city") || null,
      site_state: str(formData, "site_state") || null,
      site_postal_code: str(formData, "site_postal_code") || null,
      scope_description: str(formData, "scope_description"),
      internal_notes: str(formData, "internal_notes") || null,
      ...(nextStatus ? { status: nextStatus } : {}),
    })
    .eq("id", bidId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${bidId}`);
  return { success: true as const };
}

const BID_STATUSES: BidStatus[] = ["draft", "sent", "won", "lost", "archived"];

/** Form action: archive, restore, or set pipeline status (draft / sent / won / lost / archived). */
export async function setBidStatus(formData: FormData): Promise<void> {
  const bidId = str(formData, "bid_id");
  const statusRaw = str(formData, "status");
  if (!bidId) {
    return;
  }
  const nextStatus = BID_STATUSES.includes(statusRaw as BidStatus)
    ? (statusRaw as BidStatus)
    : null;
  if (!nextStatus) {
    return;
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return;
  }

  const { error } = await supabase.from("bids").update({ status: nextStatus }).eq("id", bidId);
  if (error) {
    return;
  }

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${bidId}`);
}

/** Update quote/bid display name only (pricing & setup). */
export async function updateBidQuoteTitle(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const bidId = str(formData, "bid_id");
  const title = str(formData, "title").trim().slice(0, 200);
  if (!bidId) {
    return { error: "Missing estimate." };
  }
  if (!title) {
    return { error: "Enter a name for this quote." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { error } = await supabase.from("bids").update({ title }).eq("id", bidId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/setup/pricing`);
  return { success: true as const };
}

/**
 * New bid with the same scope, quote lines, and customer/site fields as the source.
 * Does not copy photos or mockups — adjust the new quote from here.
 */
export async function duplicateBidFromSource(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true; newBidId: string }> {
  const sourceId = str(formData, "bid_id");
  const newTitle = str(formData, "new_title").trim().slice(0, 200);
  if (!sourceId) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, sourceId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: src, error: fetchErr } = await supabase
    .from("bids")
    .select(
      "title, company_id, quote_family_id, customer_name, customer_email, customer_phone, site_address_line1, site_city, site_state, site_postal_code, scope_description, internal_notes, project_kind, walkthrough_transcript, room_measurements, project_questionnaire, walkthrough_completed_at, material_estimate",
    )
    .eq("id", sourceId)
    .maybeSingle();

  if (fetchErr || !src) {
    return { error: "Could not load estimate." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

  const row = src as Record<string, unknown>;
  const baseTitle = typeof row.title === "string" ? row.title : "Estimate";
  const title =
    newTitle || (await getNextSequentialQuoteTitle(supabase, user.id)) || `${baseTitle.slice(0, 180)} (copy)`;
  const familyRaw = row.quote_family_id;
  const quoteFamilyId =
    typeof familyRaw === "string" && familyRaw.trim() ? familyRaw.trim() : sourceId;

  const { data: inserted, error: insErr } = await supabase
    .from("bids")
    .insert({
      owner_id: user.id,
      company_id: row.company_id != null ? String(row.company_id) : null,
      quote_family_id: quoteFamilyId,
      title,
      status: "draft",
      customer_name: String(row.customer_name ?? ""),
      customer_email: (row.customer_email as string | null) ?? null,
      customer_phone: (row.customer_phone as string | null) ?? null,
      site_address_line1: (row.site_address_line1 as string | null) ?? null,
      site_city: (row.site_city as string | null) ?? null,
      site_state: (row.site_state as string | null) ?? null,
      site_postal_code: (row.site_postal_code as string | null) ?? null,
      scope_description: String(row.scope_description ?? ""),
      internal_notes: (row.internal_notes as string | null) ?? null,
      project_kind: String(row.project_kind ?? ""),
      walkthrough_transcript: String(row.walkthrough_transcript ?? ""),
      room_measurements: row.room_measurements ?? [],
      project_questionnaire: row.project_questionnaire ?? [],
      walkthrough_completed_at: (row.walkthrough_completed_at as string | null) ?? null,
      blueprint_storage_path: null,
      material_estimate: row.material_estimate ?? [],
      ai_status: "idle",
      ai_summary: null,
      ai_last_error: null,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    return { error: insErr?.message ?? "Could not create copy." };
  }

  const newBidId = String(inserted.id);
  try {
    await copyBeforePhotosToNewBid(supabase, sourceId, newBidId);
  } catch {
    /* best-effort — quote still usable without photos */
  }
  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${newBidId}`);
  return { success: true as const, newBidId };
}

/** Sets `title` from `deriveBidTitleFromScope(scope_description)` — useful after improving scope text. */
export async function refreshBidTitleFromScope(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true } | undefined> {
  const bidId = str(formData, "bid_id");
  if (!bidId) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("bids")
    .select("scope_description")
    .eq("id", bidId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { error: "Could not load estimate." };
  }

  const title = deriveBidTitleFromScope(String((row as { scope_description?: string }).scope_description ?? ""));
  const { error } = await supabase.from("bids").update({ title }).eq("id", bidId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${bidId}`);
  return { success: true as const };
}

export async function updateBidQuoteLines(
  bidId: string,
  lines: BidMaterialLine[],
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: oldBidRow } = await supabase
    .from("bids")
    .select("material_estimate")
    .eq("id", id)
    .maybeSingle();

  const normalized: BidMaterialLine[] = [];
  for (const row of lines) {
    if (!row || typeof row !== "object") continue;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const quantity = Math.max(0, Number(row.quantity) || 0);
    const unit_price_usd = Math.max(0, Number(row.unit_price_usd) || 0);
    const unit = String(row.unit ?? "ea").trim() || "ea";
    const notesRaw = row.notes != null ? String(row.notes).trim() : "";
    const notes = notesRaw ? notesRaw : undefined;
    const extended_usd = Math.round(quantity * unit_price_usd * 100) / 100;
    const unit_cost_usd =
      row.unit_cost_usd !== undefined && row.unit_cost_usd !== null
        ? Math.max(0, Number(row.unit_cost_usd) || 0)
        : undefined;
    const markup_pct =
      row.markup_pct !== undefined && row.markup_pct !== null
        ? Number(row.markup_pct) || 0
        : undefined;
    const line_id =
      typeof row.line_id === "string" && row.line_id.trim() ? row.line_id.trim() : undefined;
    const ref =
      typeof row.reference_storage_path === "string" && row.reference_storage_path.trim()
        ? row.reference_storage_path.trim()
        : undefined;
    const trade = normalizeMaterialTrade(row.trade);
    const hd_product_url =
      typeof row.hd_product_url === "string" && row.hd_product_url.trim()
        ? row.hd_product_url.trim()
        : undefined;
    const hd_title =
      typeof row.hd_title === "string" && row.hd_title.trim()
        ? row.hd_title.trim().slice(0, 500)
        : undefined;
    const hd_unit_price_usd =
      row.hd_unit_price_usd !== undefined && row.hd_unit_price_usd !== null
        ? Math.max(0, Number(row.hd_unit_price_usd) || 0)
        : undefined;
    const hd_price_raw =
      typeof row.hd_price_raw === "string" && row.hd_price_raw.trim()
        ? row.hd_price_raw.trim()
        : undefined;
    const hd_product_id =
      typeof row.hd_product_id === "string" && row.hd_product_id.trim()
        ? row.hd_product_id.trim()
        : undefined;
    const hd_fetched_at =
      typeof row.hd_fetched_at === "string" && row.hd_fetched_at.trim()
        ? row.hd_fetched_at.trim()
        : undefined;
    const hdImgRaw =
      typeof row.hd_image_url === "string" && row.hd_image_url.trim()
        ? row.hd_image_url.trim().slice(0, 2000)
        : "";
    const hd_image_url =
      hdImgRaw && isAllowedHomedepotProductImageUrl(hdImgRaw) ? hdImgRaw : undefined;
    const lw_product_url =
      typeof row.lw_product_url === "string" && row.lw_product_url.trim()
        ? row.lw_product_url.trim()
        : undefined;
    const lw_title =
      typeof row.lw_title === "string" && row.lw_title.trim()
        ? row.lw_title.trim().slice(0, 500)
        : undefined;
    const lw_unit_price_usd =
      row.lw_unit_price_usd !== undefined && row.lw_unit_price_usd !== null
        ? Math.max(0, Number(row.lw_unit_price_usd) || 0)
        : undefined;
    const lw_price_raw =
      typeof row.lw_price_raw === "string" && row.lw_price_raw.trim()
        ? row.lw_price_raw.trim()
        : undefined;
    const lw_product_id =
      typeof row.lw_product_id === "string" && row.lw_product_id.trim()
        ? row.lw_product_id.trim()
        : undefined;
    const lw_fetched_at =
      typeof row.lw_fetched_at === "string" && row.lw_fetched_at.trim()
        ? row.lw_fetched_at.trim()
        : undefined;
    const lwImgRaw =
      typeof row.lw_image_url === "string" && row.lw_image_url.trim()
        ? row.lw_image_url.trim().slice(0, 2000)
        : "";
    const lw_image_url =
      lwImgRaw && isAllowedLowesProductImageUrl(lwImgRaw) ? lwImgRaw : undefined;
    const wantsMockup = row.mockup_include !== false;
    const pricing_approved = row.pricing_approved === true ? true : undefined;
    const mockup_shelf_retailer =
      hd_image_url &&
      lw_image_url &&
      (row.mockup_shelf_retailer === "hd" || row.mockup_shelf_retailer === "lw")
        ? row.mockup_shelf_retailer
        : undefined;
    const built: BidMaterialLine = {
      name,
      quantity,
      unit,
      unit_price_usd,
      extended_usd,
      ...(unit_cost_usd !== undefined ? { unit_cost_usd } : {}),
      ...(markup_pct !== undefined ? { markup_pct } : {}),
      notes,
      ...(trade !== "general" ? { trade } : {}),
      ...(line_id ? { line_id } : {}),
      ...(ref ? { reference_storage_path: ref } : {}),
      ...(hd_product_url ? { hd_product_url } : {}),
      ...(hd_title ? { hd_title } : {}),
      ...(hd_unit_price_usd !== undefined ? { hd_unit_price_usd } : {}),
      ...(hd_price_raw ? { hd_price_raw } : {}),
      ...(hd_product_id ? { hd_product_id } : {}),
      ...(hd_fetched_at ? { hd_fetched_at } : {}),
      ...(hd_image_url ? { hd_image_url } : {}),
      ...(lw_product_url ? { lw_product_url } : {}),
      ...(lw_title ? { lw_title } : {}),
      ...(lw_unit_price_usd !== undefined ? { lw_unit_price_usd } : {}),
      ...(lw_price_raw ? { lw_price_raw } : {}),
      ...(lw_product_id ? { lw_product_id } : {}),
      ...(lw_fetched_at ? { lw_fetched_at } : {}),
      ...(lw_image_url ? { lw_image_url } : {}),
      ...(mockup_shelf_retailer ? { mockup_shelf_retailer } : {}),
      mockup_include: false,
    };
    built.mockup_include =
      wantsMockup && lineHasMockupVisualReference(built) ? true : false;
    if (pricing_approved) {
      built.pricing_approved = true;
    }
    normalized.push(built);
  }

  const { error } = await supabase
    .from("bids")
    .update({ material_estimate: normalized })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  const oldLines = parseMaterialEstimate(oldBidRow?.material_estimate);
  const newLineIds = new Set(
    normalized.map((r) => r.line_id).filter((lid): lid is string => Boolean(lid)),
  );
  for (const old of oldLines) {
    if (!old.line_id || newLineIds.has(old.line_id)) continue;
    const path = old.reference_storage_path?.trim();
    if (path) {
      await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
    }
  }

  revalidateBidQuoteSurfaces(id);
  return { success: true as const };
}

export async function uploadBidLineReferencePhoto(
  bidId: string,
  lineId: string,
  file: File,
): Promise<
  { error: string } | { success: true; storagePath: string; signedUrl: string }
> {
  const id = bidId.trim();
  const lid = lineId.trim();
  if (!id) return { error: "Missing estimate." };
  if (!lid) return { error: "Missing line." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { error: "Image must be 20 MB or smaller." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow, error: loadErr } = await supabase
    .from("bids")
    .select("material_estimate")
    .eq("id", id)
    .single();

  if (loadErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  const raw = bidRow.material_estimate;
  if (!Array.isArray(raw)) {
    return { error: "Invalid quote." };
  }

  const idx = raw.findIndex((r) => {
    if (!r || typeof r !== "object") return false;
    return String((r as Record<string, unknown>).line_id ?? "") === lid;
  });

  if (idx < 0) {
    return { error: "Save your quote (line names) before attaching a reference image." };
  }

  const row = raw[idx] as Record<string, unknown>;
  const oldPath =
    typeof row.reference_storage_path === "string" ? row.reference_storage_path : "";
  if (oldPath) {
    await supabase.storage.from(PHOTOS_BUCKET).remove([oldPath]);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const path = `bids/${id}/line-refs/${lid}.${safeExt}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (uploadError) {
    return { error: uploadError.message };
  }

  row.reference_storage_path = path;

  const { error: upErr } = await supabase.from("bids").update({ material_estimate: raw }).eq("id", id);

  if (upErr) {
    await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
    return { error: upErr.message };
  }

  const { data: sign } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(path, 60 * 60 * 4);

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${id}`);
  return {
    success: true as const,
    storagePath: path,
    signedUrl: sign?.signedUrl ?? "",
  };
}

export async function clearBidLineReferencePhoto(
  bidId: string,
  lineId: string,
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  const lid = lineId.trim();
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow, error: loadErr } = await supabase
    .from("bids")
    .select("material_estimate")
    .eq("id", id)
    .single();

  if (loadErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  const raw = bidRow.material_estimate;
  if (!Array.isArray(raw)) {
    return { error: "Invalid quote." };
  }

  let found = false;
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (String(o.line_id ?? "") !== lid) continue;
    const path = typeof o.reference_storage_path === "string" ? o.reference_storage_path : "";
    if (path) {
      await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
    }
    delete o.reference_storage_path;
    found = true;
    break;
  }

  if (!found) {
    return { error: "Line not found." };
  }

  const { error: upErr } = await supabase.from("bids").update({ material_estimate: raw }).eq("id", id);

  if (upErr) {
    return { error: upErr.message };
  }

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${id}`);
  return { success: true as const };
}

export async function uploadBidBeforePhoto(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const bidId = str(formData, "bid_id");
  const file = formData.get("file");

  if (!bidId) {
    return { error: "Missing estimate." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext)
    ? ext
    : "jpg";
  const path = `bids/${bidId}/${crypto.randomUUID()}.${safeExt}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType =
    file.type ||
    (safeExt === "heic" || safeExt === "heif" ? `image/${safeExt}` : "image/jpeg");
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data: maxRow } = await supabase
    .from("bid_photos")
    .select("sort_order")
    .eq("bid_id", bidId)
    .eq("kind", "before")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { error: insertError } = await supabase.from("bid_photos").insert({
    bid_id: bidId,
    storage_path: path,
    sort_order: nextOrder,
    kind: "before",
  });

  if (insertError) {
    await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
    return { error: insertError.message };
  }

  await tryAutoEstimateRoomMeasurementsFromPhotosIfEmpty(supabase, bidId);

  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/setup`);
  revalidatePath(`/dashboard/bids/${bidId}/walkthrough`);
  return { success: true as const };
}

export async function uploadBidBlueprint(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const bidId = str(formData, "bid_id");
  const file = formData.get("file");

  if (!bidId) {
    return { error: "Missing estimate." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF or image file." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { error: "File must be 25 MB or smaller." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: existing } = await supabase
    .from("bids")
    .select("blueprint_storage_path")
    .eq("id", bidId)
    .maybeSingle();

  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const allowed = ["pdf", "png", "jpg", "jpeg", "webp"];
  const safeExt = allowed.includes(ext) ? ext : "pdf";
  const path = `bids/${bidId}/blueprint-${crypto.randomUUID()}.${safeExt}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { error: upDb } = await supabase
    .from("bids")
    .update({ blueprint_storage_path: path })
    .eq("id", bidId);

  if (upDb) {
    await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
    return { error: upDb.message };
  }

  const oldPath = existing?.blueprint_storage_path;
  if (typeof oldPath === "string" && oldPath.trim() && oldPath !== path) {
    await supabase.storage.from(PHOTOS_BUCKET).remove([oldPath.trim()]);
  }

  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/walkthrough`);
  revalidatePath(`/dashboard/bids/${bidId}/setup`);
  return { success: true as const };
}

export async function deleteBidBlueprint(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const bidId = str(formData, "bid_id");
  if (!bidId) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: row } = await supabase
    .from("bids")
    .select("blueprint_storage_path")
    .eq("id", bidId)
    .maybeSingle();

  const path =
    row && typeof row.blueprint_storage_path === "string"
      ? row.blueprint_storage_path.trim()
      : "";

  const { error: upDb } = await supabase
    .from("bids")
    .update({ blueprint_storage_path: null })
    .eq("id", bidId);

  if (upDb) {
    return { error: upDb.message };
  }

  if (path) {
    await supabase.storage.from(PHOTOS_BUCKET).remove([path]);
  }

  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/walkthrough`);
  revalidatePath(`/dashboard/bids/${bidId}/setup`);
  return { success: true as const };
}

export async function saveBidWalkthroughCapture(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const bidId = str(formData, "bid_id");
  if (!bidId) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const scope_description = String(formData.get("scope_description") ?? "").slice(0, 20000);
  const project_kind = str(formData, "project_kind");
  const walkthrough_transcript = String(formData.get("walkthrough_transcript") ?? "").slice(
    0,
    12000,
  );
  let room_measurements: RoomMeasurementRow[] = [];
  try {
    const rm = JSON.parse(String(formData.get("room_measurements_json") ?? "[]")) as unknown;
    if (Array.isArray(rm)) {
      room_measurements = rm.filter(
        (x): x is RoomMeasurementRow =>
          !!x &&
          typeof x === "object" &&
          typeof (x as RoomMeasurementRow).label === "string",
      ) as RoomMeasurementRow[];
    }
  } catch {
    return { error: "Invalid room measurements JSON." };
  }

  const { error } = await supabase
    .from("bids")
    .update({
      scope_description,
      project_kind,
      room_measurements,
      walkthrough_transcript,
    })
    .eq("id", bidId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/walkthrough`);
  return { success: true as const };
}

export async function deleteBidPhotoForm(formData: FormData): Promise<void> {
  const photoId = str(formData, "photo_id");
  const bidId = str(formData, "bid_id");
  const storagePath = str(formData, "storage_path");
  if (!photoId || !bidId || !storagePath) {
    return;
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return;
  }

  const { error: delDb } = await supabase.from("bid_photos").delete().eq("id", photoId);

  if (delDb) {
    return;
  }

  await supabase.storage.from(PHOTOS_BUCKET).remove([storagePath]);
  revalidatePath(`/dashboard/bids/${bidId}`);
}

export async function saveBidWalkthrough(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const bidId = str(formData, "bid_id");
  if (!bidId) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const scope_description = String(formData.get("scope_description") ?? "").slice(0, 20000);
  const project_kind = str(formData, "project_kind");
  const walkthrough_transcript = String(formData.get("walkthrough_transcript") ?? "").slice(
    0,
    12000,
  );
  let room_measurements: RoomMeasurementRow[] = [];
  let project_questionnaire: ProjectQuestionnaireItem[] = [];
  try {
    const rm = JSON.parse(String(formData.get("room_measurements_json") ?? "[]")) as unknown;
    if (Array.isArray(rm)) {
      room_measurements = rm.filter(
        (x): x is RoomMeasurementRow =>
          !!x &&
          typeof x === "object" &&
          typeof (x as RoomMeasurementRow).label === "string",
      ) as RoomMeasurementRow[];
    }
  } catch {
    return { error: "Invalid room measurements JSON." };
  }
  try {
    const pq = JSON.parse(String(formData.get("project_questionnaire_json") ?? "[]")) as unknown;
    if (Array.isArray(pq)) {
      project_questionnaire = pq.filter(
        (x): x is ProjectQuestionnaireItem =>
          !!x &&
          typeof x === "object" &&
          typeof (x as ProjectQuestionnaireItem).question === "string",
      ) as ProjectQuestionnaireItem[];
    }
  } catch {
    return { error: "Invalid questionnaire JSON." };
  }

  const { data: bidPostalRow, error: postalLoadErr } = await supabase
    .from("bids")
    .select("site_postal_code")
    .eq("id", bidId)
    .maybeSingle();
  if (postalLoadErr) {
    return { error: postalLoadErr.message };
  }
  const zipInvalid = validateJobSiteZipQuestionnaire(
    project_questionnaire,
    (bidPostalRow as { site_postal_code?: string | null } | null)?.site_postal_code ?? null,
  );
  if (zipInvalid) {
    return { error: zipInvalid };
  }

  const zipFromWalkthrough = extractSitePostalCodeFromQuestionnaire(project_questionnaire);

  const { error } = await supabase
    .from("bids")
    .update({
      scope_description,
      project_kind,
      walkthrough_transcript,
      room_measurements,
      project_questionnaire,
      walkthrough_completed_at: new Date().toISOString(),
      ...(zipFromWalkthrough ? { site_postal_code: zipFromWalkthrough } : {}),
    })
    .eq("id", bidId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/walkthrough`);
  return { success: true as const };
}

/**
 * When room measurements are still empty, run the same vision pass as “Estimate from photos”
 * (no user-facing errors — upload / create already succeeded).
 */
async function tryAutoEstimateRoomMeasurementsFromPhotosIfEmpty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bidId: string,
): Promise<void> {
  const id = bidId.trim();
  if (!id) return;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;

  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select("scope_description, project_kind, room_measurements")
    .eq("id", id)
    .maybeSingle();

  if (bidErr || !bidRow) return;
  if (!roomMeasurementsLookEmpty(bidRow.room_measurements)) return;

  const beforePhotoUrls = await signedBeforePhotoUrlsForBid(supabase, id, 6);
  if (beforePhotoUrls.length === 0) return;

  try {
    const { rooms } = await fetchRoomDimensionsFromPhotosOpenAI({
      apiKey,
      scopeDescription: String(bidRow.scope_description ?? ""),
      projectKind: String(bidRow.project_kind ?? ""),
      beforePhotoUrls,
    });
    if (rooms.length === 0) return;
    await saveBidRoomMeasurementsOnly(id, rooms);
  } catch {
    // Leave measurements empty; contractor can use the button or enter manually.
  }
}

async function signedBeforePhotoUrlsForBid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bidId: string,
  maxPhotos: number,
): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from("bid_photos")
    .select("storage_path")
    .eq("bid_id", bidId)
    .eq("kind", "before")
    .order("sort_order", { ascending: true });

  if (error || !rows?.length) {
    return [];
  }

  const urls: string[] = [];
  for (const row of rows) {
    const path = typeof row.storage_path === "string" ? row.storage_path : "";
    if (!path) continue;
    const { data } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(path, 60 * 45);
    if (data?.signedUrl) {
      urls.push(data.signedUrl);
    }
    if (urls.length >= maxPhotos) break;
  }
  return urls;
}

export async function generateBidProjectQuestionsAction(
  bidId: string,
): Promise<{ error: string } | { questions: ProjectQuestionDraft[] }> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      error: "Add OPENAI_API_KEY to your environment to generate additional info prompts.",
    };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select(
      "title, scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire, site_postal_code",
    )
    .eq("id", id)
    .single();

  if (bidErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  const title = String(bidRow.title ?? "");
  const projectKind = String(bidRow.project_kind ?? "");
  const scopeDescription = String(bidRow.scope_description ?? "");
  const digits = String((bidRow as { site_postal_code?: string | null }).site_postal_code ?? "").replace(
    /\D/g,
    "",
  );
  const hasSavedPostalCode = digits.length >= 5;
  const rooms = parseRoomMeasurements(bidRow.room_measurements);
  const measurementsSummary =
    rooms.length > 0 ? rooms.map((r) => formatRoomMeasurementLineForScope(r)).join("\n") : "";

  const transcriptPreview = String(bidRow.walkthrough_transcript ?? "").slice(0, 2000);

  const beforePhotoUrls = await signedBeforePhotoUrlsForBid(supabase, id, 6);

  try {
    const questions = await fetchProjectQuestionsFromOpenAI({
      apiKey,
      title,
      projectKind,
      scopeDescription,
      measurementsSummary,
      transcriptPreview,
      beforePhotoUrls,
      hasSavedPostalCode,
    });
    if (questions.length === 0) {
      return {
        error:
          "No usable additional info prompts were returned. Try again, or add a bit more scope detail and a site photo.",
      };
    }
    return { questions };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    return { error: message };
  }
}

export async function saveBidRoomMeasurementsOnly(
  bidId: string,
  rooms: RoomMeasurementRow[],
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { error } = await supabase.from("bids").update({ room_measurements: rooms }).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/bids/${id}`, "layout");
  revalidatePath(`/dashboard/bids/${id}`);
  revalidatePath(`/dashboard/bids/${id}/setup`);
  revalidatePath(`/dashboard/bids/${id}/walkthrough`);
  return { success: true as const };
}

/**
 * Vision estimate from before photos → replaces `room_measurements` with AI rows
 * (room footprint + vanity run + shower envelope when visible). Homeowner should verify.
 */
export async function estimateRoomMeasurementsFromPhotosAction(bidId: string): Promise<
  | { error: string }
  | { success: true; rooms: RoomMeasurementRow[]; analysisSummary: string }
> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      error: "Add OPENAI_API_KEY to your environment to estimate sizes from photos.",
    };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const beforePhotoUrls = await signedBeforePhotoUrlsForBid(supabase, id, 6);
  if (beforePhotoUrls.length === 0) {
    return { error: "Upload at least one before photo first." };
  }

  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select("scope_description, project_kind")
    .eq("id", id)
    .single();

  if (bidErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  try {
    const { rooms, analysisSummary } = await fetchRoomDimensionsFromPhotosOpenAI({
      apiKey,
      scopeDescription: String(bidRow.scope_description ?? ""),
      projectKind: String(bidRow.project_kind ?? ""),
      beforePhotoUrls,
    });
    if (rooms.length === 0) {
      return {
        error:
          "Could not estimate dimensions from these photos. Try a wider shot that shows the door or full vanity/shower, then run again.",
      };
    }
    const saved = await saveBidRoomMeasurementsOnly(id, rooms);
    if ("error" in saved) {
      return saved;
    }
    return { success: true as const, rooms, analysisSummary };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Estimation failed.";
    return { error: message };
  }
}

export async function saveBidQuestionnaireOnly(
  bidId: string,
  questionnaire: ProjectQuestionnaireItem[],
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidPostalRow } = await supabase
    .from("bids")
    .select("site_postal_code")
    .eq("id", id)
    .maybeSingle();
  const zipInvalid = validateJobSiteZipQuestionnaire(
    questionnaire,
    (bidPostalRow as { site_postal_code?: string | null } | null)?.site_postal_code ?? null,
  );
  if (zipInvalid) {
    return { error: zipInvalid };
  }

  const zipFromQuiz = extractSitePostalCodeFromQuestionnaire(questionnaire);
  const updatePayload: {
    project_questionnaire: typeof questionnaire;
    site_postal_code?: string;
  } = { project_questionnaire: questionnaire };
  if (zipFromQuiz) {
    updatePayload.site_postal_code = zipFromQuiz;
  }

  const { error } = await supabase.from("bids").update(updatePayload).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/bids/${id}`);
  revalidatePath(`/dashboard/bids/${id}/setup`);
  return { success: true as const };
}

export async function generateBidScopeBreakdownAction(
  bidId: string,
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { error: "Add OPENAI_API_KEY to generate the scope breakdown." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select(
      "scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire",
    )
    .eq("id", id)
    .single();

  if (bidErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  const composite = buildCompositeScopeDescription({
    scope_description: String(bidRow.scope_description ?? ""),
    project_kind: String(bidRow.project_kind ?? ""),
    walkthrough_transcript: String(bidRow.walkthrough_transcript ?? ""),
    room_measurements: bidRow.room_measurements,
    project_questionnaire: bidRow.project_questionnaire,
  }).trim();

  if (!composite) {
    return { error: "Add scope or complete the questionnaire first." };
  }

  try {
    const linesRaw = await fetchScopeBreakdownLinesFromOpenAI({
      apiKey,
      compositeScope: composite,
    });
    const linesCovered = ensureContractorStatedScopeCoverage(
      {
        scope_description: String(bidRow.scope_description ?? ""),
        project_questionnaire: bidRow.project_questionnaire,
      },
      linesRaw,
    );
    const lines = linesCovered.map((l) => {
      const prev = (l.trade ?? "general") as BidMaterialTrade;
      const r = refineMaterialTradeFromLineName(l.name, prev);
      if (r === prev) return l;
      const o = { ...l };
      if (r === "general") delete o.trade;
      else o.trade = r;
      return o;
    });
    if (lines.length === 0) {
      return { error: "The model did not return line items. Try again." };
    }

    const { error: up } = await supabase
      .from("bids")
      .update({ material_estimate: lines })
      .eq("id", id);

    if (up) {
      return { error: up.message };
    }

    revalidatePath(`/dashboard/bids/${id}`);
    revalidatePath(`/dashboard/bids/${id}/setup`);
    return { success: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    return { error: message };
  }
}

export async function generateBidPricedBreakdownAction(
  bidId: string,
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { error: "Add OPENAI_API_KEY to generate the priced breakdown." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select(
      "scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire, material_estimate",
    )
    .eq("id", id)
    .single();

  if (bidErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  const scopeLines = parseMaterialEstimate(bidRow.material_estimate).filter((l) =>
    String(l.name ?? "").trim(),
  );
  if (scopeLines.length === 0) {
    return { error: "Save a scope breakdown with at least one line item first." };
  }

  const composite = buildCompositeScopeDescription({
    scope_description: String(bidRow.scope_description ?? ""),
    project_kind: String(bidRow.project_kind ?? ""),
    walkthrough_transcript: String(bidRow.walkthrough_transcript ?? ""),
    room_measurements: bidRow.room_measurements,
    project_questionnaire: bidRow.project_questionnaire,
  }).trim();

  if (!composite) {
    return { error: "Add scope or questionnaire context first." };
  }

  try {
    const priced = await fetchPricedBreakdownFromOpenAI({
      apiKey,
      compositeScope: composite,
      scopeLines: scopeLines.map((l) => ({
        name: l.name.trim(),
        trade: l.trade,
        quantity: l.quantity,
        unit: l.unit,
        notes: l.notes,
      })),
    });
    if (priced.length === 0) {
      return { error: "The model did not return priced lines. Try again." };
    }

    const { error: up } = await supabase
      .from("bids")
      .update({ material_estimate: priced })
      .eq("id", id);

    if (up) {
      return { error: up.message };
    }

    revalidatePath(`/dashboard/bids/${id}`);
    revalidatePath(`/dashboard/bids/${id}/setup`);
    return { success: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    return { error: message };
  }
}

/**
 * Fills unit cost / markup / sell for each saved line item without adding or removing rows.
 * Clears per-line approval flags so the contractor can review estimates.
 */
export async function estimatePerLineQuotePricingAction(
  bidId: string,
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { error: "Add OPENAI_API_KEY to estimate line pricing." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select(
      "scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire, material_estimate",
    )
    .eq("id", id)
    .single();

  if (bidErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  const rawLines = parseMaterialEstimate(bidRow.material_estimate);
  if (rawLines.length === 0) {
    return { error: "Save a scope breakdown with at least one line item first." };
  }

  const withIds: BidMaterialLine[] = rawLines.map((l) => ({
    ...l,
    line_id: l.line_id?.trim() || randomUUID(),
  }));

  const composite = buildCompositeScopeDescription({
    scope_description: String(bidRow.scope_description ?? ""),
    project_kind: String(bidRow.project_kind ?? ""),
    walkthrough_transcript: String(bidRow.walkthrough_transcript ?? ""),
    room_measurements: bidRow.room_measurements,
    project_questionnaire: bidRow.project_questionnaire,
  }).trim();

  if (!composite) {
    return { error: "Add scope or questionnaire context first." };
  }

  try {
    const prices = await fetchPerLineQuotePricingFromOpenAI({
      apiKey,
      compositeScope: composite,
      lines: withIds.map((l) => ({
        line_id: l.line_id!,
        name: l.name.trim(),
        trade: l.trade,
        quantity: l.quantity,
        unit: l.unit,
        notes: l.notes,
      })),
    });

    if (prices.length !== withIds.length) {
      return {
        error: `Incomplete estimate (${prices.length}/${withIds.length} lines). Try again.`,
      };
    }

    const merged = applyPerLinePricingToLines(withIds, prices).map((l) => {
      const { pricing_approved: _a, ...rest } = l;
      return rest;
    });

    const withRoughLabor = appendMissingRoughLaborLines(merged);

    const { error: up } = await supabase
      .from("bids")
      .update({ material_estimate: withRoughLabor })
      .eq("id", id);

    if (up) {
      return { error: up.message };
    }

    revalidatePath(`/dashboard/bids/${id}`);
    revalidatePath(`/dashboard/bids/${id}/setup`);
    return { success: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    return { error: message };
  }
}

/** Max chars for mockup-only `material_estimate_snapshot` (FormData) — avoids oversized bodies. */
const MOCKUP_MATERIAL_SNAPSHOT_MAX_CHARS = 1_500_000;

function tryParseMockupMaterialEstimateSnapshot(raw: string): BidMaterialLine[] | null {
  const t = raw.trim();
  if (!t || t.length > MOCKUP_MATERIAL_SNAPSHOT_MAX_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return null;
  }
  const lines = parseMaterialEstimate(parsed);
  return lines.some((l) => l.name.trim().length > 0) ? lines : null;
}

/** When OpenAI compresses scope+estimate into `vertexJobBrief`, keep the remodel block short. */
const VERTEX_MOCKUP_REMODEL_FOLLOW_BRIEF =
  "Follow the IMAGE JOB BRIEF in this prompt for what may change. Any attached product JPEGs are finish references for their labeled quote lines only — not a new floor plan.";

const MOCKUP_ONLY_REMODEL_EDIT_PROMPT = [
  "Apply the contractor's scope and saved quote as finish and material updates only (tile, paint, grout color, trim, lighting character, fixture styles) where those elements already appear in the photo.",
  "Treat merged contractor scope (walkthrough, Q&A, measurements) as the only authority for **new** work, demolition, or relocations — do not add fixtures, openings, or whole-room changes that scope does not clearly call for, even if a line name is broad.",
  "For each mockup-enabled quote line with a product reference image, apply that look in place on the existing fixture—do not add a second vanity or place a vanity in a new location. For vanities and cabinets: keep the same position and door/drawer boundaries as the room photo; transfer colors, materials, and style from the reference onto those surfaces only.",
  "Catalog vanity photos often show a different shower or tub behind the cabinet — ignore that studio backdrop for layout. Never move the client's shower, tub, curb, glass enclosure, toilet, or drains to match a shelf image.",
  "Shower/tub **geometry lock:** the curb outline, drain location, glass door vs fixed panel, and tiled wet-wall boundaries in the jobsite photo are **fixed in the frame** — tile or pan SKUs change **surface appearance only** on those existing planes. Never slide, shrink, widen, recenter, or pivot the whole enclosure to match a catalog layout (including layouts visible behind a vanity SKU).",
  "Do not change where visible fixtures sit (shower/tub, vanity/sink, toilet if shown, etc.). Do not add fixtures that are not shown in the photo. Keep all walls, tub/shower surrounds, and partitions in the same positions as the source photo unless scope explicitly names structural demolition or relocation.",
  "If scope does not mention mirrors, medicine cabinets, or wall glass, leave mirrors and reflective glass exactly as in the photo — no new frames, shapes, or tints.",
].join(" ");

function redactSignedUrlForInspect(raw: string): string {
  const u = raw.trim();
  if (!u) return "";
  try {
    const parsed = new URL(u);
    const q = parsed.search ? "?…redacted" : "";
    return `${parsed.origin}${parsed.pathname}${q}`;
  } catch {
    return u.length <= 160 ? u : `${u.slice(0, 160)}…`;
  }
}

export type BidMockupVertexInspectResult = {
  bidId: string;
  mockupOnly: true;
  resolvedMockupImageProvider: MockupImageProviderId;
  preferredMockupImageProvider: MockupImageProviderId;
  vertexUpgradedForShelfRefs: boolean;
  vertexModel: string;
  vertexLocation: string;
  omitVertexInlineProductRefs: boolean;
  weakRoomGeometry: boolean;
  vanityCabinetReplacement: boolean;
  imageEditSource: "before" | "latest_mockup";
  primaryImageUrlRedacted: string;
  sourceImage: { contentType: string; bytes: number };
  beforePhotoUrlsRedacted: string[];
  referenceUrlsOrdered: { label: string; urlRedacted: string }[];
  vertexRefFetch: { attempted: number; loaded: number };
  vertexRefSlots: { label: string; loaded: boolean; bytes?: number; mimeType?: string }[];
  referenceVisualSummary: string;
  quoteLineContext: string;
  fullEstimateContext: string;
  editPrompt: string;
  vertexGenerationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseModalities: string[];
  };
  vertexPartsDebug: ReturnType<typeof summarizeVertexRemodelPartsForDebug>;
  /** Plain-text concatenation of every text part in multimodal order (for quick copy). */
  allVertexTextPartsJoined: string;
};

/**
 * Recomputes the mockup-only Vertex multimodal payload **without** calling Vertex or mutating the bid.
 * For debugging: full `editPrompt` + reference URL list + per-part text / image byte sizes (signed URLs redacted).
 */
export async function inspectBidMockupVertexPayload(
  formData: FormData,
): Promise<{ error: string } | { success: true; inspect: BidMockupVertexInspectResult }> {
  const bidId = str(formData, "bid_id").trim();
  if (!bidId) {
    return { error: "Missing estimate." };
  }
  const mockupOnlyRaw = String(formData.get("mockup_only") ?? "").toLowerCase();
  const mockupOnly =
    mockupOnlyRaw === "1" || mockupOnlyRaw === "on" || mockupOnlyRaw === "true";
  if (!mockupOnly) {
    return {
      error:
        "Vertex inspect runs in **mockup-only** mode. Open Setup → Mockup and use the button there (it sends your live quote snapshot).",
    };
  }
  if (!isVertexMockupConfigured()) {
    return {
      error:
        "Vertex is not configured (set GOOGLE_CLOUD_PROJECT and Application Default Credentials). Nothing to inspect for Vertex.",
    };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select(
      "id, title, scope_description, company_id, material_estimate, ai_summary, project_kind, walkthrough_transcript, room_measurements, project_questionnaire",
    )
    .eq("id", bidId)
    .single();

  if (bidErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  let existingQuote = parseMaterialEstimate(bidRow.material_estimate);
  const snap = String(formData.get("material_estimate_snapshot") ?? "").trim();
  if (!snap) {
    return {
      error:
        "Missing quote snapshot. Expand **Line items** on the mockup page so the table is visible, then try Inspect again.",
    };
  }
  const fromSnapshot = tryParseMockupMaterialEstimateSnapshot(snap);
  if (!fromSnapshot) {
    return {
      error:
        "Could not parse the quote snapshot. Save Setup → Pricing, reload, or shorten unusual characters in line names.",
    };
  }
  existingQuote = fromSnapshot;

  const scopeForAi =
    buildCompositeScopeDescription({
      scope_description: String(bidRow.scope_description ?? ""),
      project_kind: String(bidRow.project_kind ?? ""),
      walkthrough_transcript: String(bidRow.walkthrough_transcript ?? ""),
      room_measurements: bidRow.room_measurements,
      project_questionnaire: bidRow.project_questionnaire,
    }).trim() || String(bidRow.scope_description ?? "").trim();

  if (!scopeForAi) {
    return {
      error:
        "Add a scope description or complete the guided walkthrough before inspecting.",
    };
  }

  const { data: beforeRows } = await supabase
    .from("bid_photos")
    .select("id, storage_path")
    .eq("bid_id", bidId)
    .eq("kind", "before")
    .order("sort_order", { ascending: true });

  if (!beforeRows?.length) {
    return { error: "Upload at least one before photo." };
  }

  const signedUrls: string[] = [];
  for (const row of beforeRows) {
    const { data } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(String(row.storage_path), 60 * 30);
    if (data?.signedUrl) {
      signedUrls.push(data.signedUrl);
    }
  }
  if (!signedUrls.length) {
    return { error: "Could not sign before photo URLs." };
  }

  const additionalPrompt = String(formData.get("additional_prompt") ?? "")
    .trim()
    .slice(0, 6000);
  let additionalPromptForInspect = additionalPrompt;
  const inspectOpenAiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const regenerateFromRoomRaw = String(
    formData.get("regenerate_from_room") ?? "",
  ).toLowerCase();
  const regenerateFromRoom =
    regenerateFromRoomRaw === "1" ||
    regenerateFromRoomRaw === "on" ||
    regenerateFromRoomRaw === "true";
  const refineFromMockupPhotoId = str(formData, "refine_from_mockup_photo_id")
    .trim()
    .slice(0, 80);

  const regenAttachmentRef = await loadRegenerationAttachmentRef(supabase, bidId, formData);

  const quoteForEdit = existingQuote;
  const roomAnalysis = "";
  let remodelEditPrompt = MOCKUP_ONLY_REMODEL_EDIT_PROMPT;

  const quoteForMockupImage = sortQuoteLinesForMockupProductRefs(
    quoteForEdit.filter(
      (l) =>
        l.name.trim().length > 0 &&
        l.mockup_include !== false &&
        lineHasMockupVisualReference(l),
    ),
  );
  const mockupOnNamedLinesInspect = quoteForEdit.filter(
    (l) => l.name.trim().length > 0 && l.mockup_include !== false,
  );
  const quoteLineContext = buildMockupQuoteLineContextFromVisualAndTextLines({
    visualRefLines: quoteForMockupImage,
    allMockupOnNamedLines: mockupOnNamedLinesInspect,
  });
  const fullEstimateContext = formatFullQuoteLinesForMockupEstimateContext(
    quoteForEdit.filter((l) => l.name.trim().length > 0),
  );

  const urlsForVertexFromMergedQuote = await collectMockupReferenceSignedUrls(
    supabase,
    quoteForMockupImage,
  );
  const mockupReferenceUrlsForImagePass = mergeQuoteRefsWithOptionalAttachment(
    urlsForVertexFromMergedQuote,
    regenAttachmentRef,
  );

  let vertexJobBriefInspect = "";
  if (inspectOpenAiKey) {
    try {
      vertexJobBriefInspect = await compressMockupJobContextForVertexImagePrompt({
        apiKey: inspectOpenAiKey,
        compositeScope: scopeForAi.slice(0, 28_000),
        fullEstimateText: fullEstimateContext.slice(0, 22_000),
        mockupLinesSummary: formatMockupLinesForCompression(mockupOnNamedLinesInspect),
        additionalNotes: additionalPromptForInspect || undefined,
        beforeImageUrls: signedUrls.slice(0, 2),
        signal: AbortSignal.timeout(50_000),
      });
    } catch (e) {
      console.warn("[mockup inspect] OpenAI job-brief compression failed:", e);
    }
  }

  if (vertexJobBriefInspect) {
    remodelEditPrompt = VERTEX_MOCKUP_REMODEL_FOLLOW_BRIEF;
    additionalPromptForInspect = "";
  } else if (mockupReferenceUrlsForImagePass.length === 0) {
    const noRefHeader =
      "NO product shelf or contractor JPEGs are attached for this run — follow the instruction block below plus contractor scope in this prompt.\n\n";
    const textOnlyForSynth = formatMockupLinesTextOnlyNoProductImages(
      mockupOnNamedLinesInspect.filter((l) => !lineHasMockupVisualReference(l)),
    );
    try {
      if (inspectOpenAiKey) {
        const synth = await synthesizeMockupInstructionsForVertexNoProductImages({
          apiKey: inspectOpenAiKey,
          scopeText: scopeForAi,
          fullEstimateText: fullEstimateContext,
          mockupLinesWithoutImagesText: textOnlyForSynth,
          additionalNotes: additionalPromptForInspect || undefined,
          beforeImageUrl: signedUrls[0],
          signal: AbortSignal.timeout(55_000),
        });
        remodelEditPrompt = noRefHeader + synth;
      } else {
        remodelEditPrompt =
          noRefHeader +
          buildDeterministicNoRefMockupRemodelPrompt(
            mockupOnNamedLinesInspect,
            additionalPromptForInspect || undefined,
          );
      }
      additionalPromptForInspect = "";
    } catch (e) {
      console.warn("[mockup inspect] no-product-image instruction synthesis failed:", e);
      remodelEditPrompt =
        noRefHeader +
        buildDeterministicNoRefMockupRemodelPrompt(
          mockupOnNamedLinesInspect,
          additionalPromptForInspect || undefined,
        );
      additionalPromptForInspect = "";
    }
  }

  const { data: existingMockupRows } = await supabase
    .from("bid_photos")
    .select("storage_path, mockup_generation, created_at")
    .eq("bid_id", bidId)
    .eq("kind", "after_mockup");

  const mockupRows = existingMockupRows ?? [];
  let maxNumericGen = 0;
  for (const row of mockupRows) {
    const g = row.mockup_generation != null ? Number(row.mockup_generation) : 0;
    if (Number.isFinite(g) && g > maxNumericGen) maxNumericGen = g;
  }
  const priorMockupCount = mockupRows.length;

  let latestMockupStoragePath: string | null = null;
  if (priorMockupCount > 0) {
    const sorted = [...mockupRows].sort((a, b) => {
      const ga = a.mockup_generation != null ? Number(a.mockup_generation) : 0;
      const gb = b.mockup_generation != null ? Number(b.mockup_generation) : 0;
      if (gb !== ga) return gb - ga;
      const ta = new Date(String(a.created_at ?? 0)).getTime();
      const tb = new Date(String(b.created_at ?? 0)).getTime();
      return tb - ta;
    });
    const top = sorted[0];
    latestMockupStoragePath = top?.storage_path ? String(top.storage_path) : null;
  }

  let chosenRefineStoragePath: string | null = null;
  if (!regenerateFromRoom && refineFromMockupPhotoId) {
    const { data: refinePick } = await supabase
      .from("bid_photos")
      .select("storage_path")
      .eq("bid_id", bidId)
      .eq("id", refineFromMockupPhotoId)
      .eq("kind", "after_mockup")
      .maybeSingle();
    if (refinePick?.storage_path) {
      chosenRefineStoragePath = String(refinePick.storage_path);
    }
  }

  let primaryImageUrl = signedUrls[0]!;
  let imageEditSource: "before" | "latest_mockup" = "before";

  const useLatestMockupFallback =
    !regenerateFromRoom &&
    !chosenRefineStoragePath &&
    priorMockupCount > 0 &&
    Boolean(latestMockupStoragePath);

  if (!regenerateFromRoom && chosenRefineStoragePath) {
    const { data: signedPick } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(chosenRefineStoragePath, 60 * 30);
    if (signedPick?.signedUrl) {
      primaryImageUrl = signedPick.signedUrl;
      imageEditSource = "latest_mockup";
    }
  } else if (useLatestMockupFallback && latestMockupStoragePath) {
    const { data: signedLatest } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(latestMockupStoragePath, 60 * 30);
    if (signedLatest?.signedUrl) {
      primaryImageUrl = signedLatest.signedUrl;
      imageEditSource = "latest_mockup";
    }
  }

  const weakRoomGeometry =
    roomAnalysisSuggestsWeakFixtureGeometry(roomAnalysis) ||
    mirrorHeavySceneFromVertexJobBrief(vertexJobBriefInspect);
  const omitVertexInlineProductRefs =
    process.env.MOCKUP_OMIT_INLINE_REFS_WEAK_ROOM?.trim() === "1" &&
    weakRoomGeometry &&
    mockupReferenceUrlsForImagePass.length > 0;

  const refsForSummary = mockupReferenceUrlsForImagePass.slice(
    0,
    mockupReferenceVisionMaxRefs(),
  );
  const referenceVisualSummary =
    refsForSummary.length > 0 ? buildReferenceVisualFallbackText(refsForSummary) : "";

  const preferredProvider = resolveMockupImageProvider();
  const mockupRefCount = mockupReferenceUrlsForImagePass.length;
  const forceOpenAiWithShelfRefs = process.env.MOCKUP_FORCE_OPENAI_WITH_REFS?.trim() === "1";
  const mockupImageProvider: MockupImageProviderId =
    preferredProvider === "openai" &&
    mockupRefCount > 0 &&
    isVertexMockupConfigured() &&
    !forceOpenAiWithShelfRefs
      ? "vertex_gemini"
      : preferredProvider;

  const needVertexRefPixels =
    mockupImageProvider === "vertex_gemini" &&
    !omitVertexInlineProductRefs &&
    mockupReferenceUrlsForImagePass.length > 0;

  const vertexRefPack = needVertexRefPixels
    ? await fetchMockupReferenceImagesForVertex(mockupReferenceUrlsForImagePass)
    : { images: [] as VertexMockupReferenceInline[], attempted: 0, loaded: 0 };

  const sourceImageFetchTimeoutMs = 120_000;
  let sourceImageRes: Response;
  try {
    sourceImageRes = await fetch(primaryImageUrl, {
      signal: AbortSignal.timeout(sourceImageFetchTimeoutMs),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (
      name === "AbortError" ||
      (e instanceof Error && /aborted|timeout/i.test(e.message))
    ) {
      return {
        error: `Downloading the source photo timed out after ${sourceImageFetchTimeoutMs / 1000}s.`,
      };
    }
    return { error: e instanceof Error ? e.message : "Could not download source image." };
  }
  if (!sourceImageRes.ok) {
    return { error: "Could not download source image for inspect." };
  }
  const imageBytes = await sourceImageRes.arrayBuffer();
  const contentType =
    sourceImageRes.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";

  const vanityCabinetReplacement = quoteHasNewVanityCabinetAssembly(mockupOnNamedLinesInspect);
  const editPrompt = buildImageEditPrompt({
    scopeDescription: scopeForAi,
    roomAnalysis,
    remodelEditPrompt,
    ...(vertexJobBriefInspect
      ? { vertexJobBrief: vertexJobBriefInspect, scopeCompositeForRules: scopeForAi }
      : {}),
    ...(quoteLineContext.trim() ? { quoteLineContext } : {}),
    ...(fullEstimateContext.trim() && !vertexJobBriefInspect ? { fullEstimateContext } : {}),
    ...(additionalPromptForInspect ? { additionalPrompt: additionalPromptForInspect } : {}),
    imageEditSource,
    ...(referenceVisualSummary.trim()
      ? { referenceVisualSummary: referenceVisualSummary.trim() }
      : {}),
    mockupQuoteLines: mockupOnNamedLinesInspect,
    ...(weakRoomGeometry ? { weakRoomGeometryEvidence: true } : {}),
    ...(omitVertexInlineProductRefs ? { inlineProductPixelsOmitted: true } : {}),
  });

  let vertexRefInline: VertexMockupReferenceInline[] | undefined;
  if (!omitVertexInlineProductRefs && mockupReferenceUrlsForImagePass.length > 0) {
    vertexRefInline = vertexRefPack.images;
  }

  const built = buildVertexRemodelMockupRequestParts({
    imageBytes,
    contentType,
    editPrompt,
    ...(vertexRefInline?.length
      ? {
          referenceInlineImages: vertexRefInline,
          ...(vanityCabinetReplacement ? { vanityCabinetReplacement: true } : {}),
        }
      : {}),
  });

  const vertexPartsDebug = summarizeVertexRemodelPartsForDebug(built.parts);
  const allVertexTextPartsJoined = built.parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n\n--- vertex text part ---\n\n");

  const vertexRefSlots = vertexRefPack.images.map((img) => ({
    label: img.label.slice(0, 500),
    loaded: true,
    bytes: Buffer.from(img.base64, "base64").byteLength,
    mimeType: img.mimeType,
  }));

  return {
    success: true,
    inspect: {
      bidId,
      mockupOnly: true,
      resolvedMockupImageProvider: mockupImageProvider,
      preferredMockupImageProvider: preferredProvider,
      vertexUpgradedForShelfRefs:
        preferredProvider === "openai" &&
        mockupImageProvider === "vertex_gemini" &&
        mockupRefCount > 0,
      vertexModel: vertexGeminiImageModel(),
      vertexLocation: vertexLocation(),
      omitVertexInlineProductRefs,
      weakRoomGeometry,
      vanityCabinetReplacement,
      imageEditSource,
      primaryImageUrlRedacted: redactSignedUrlForInspect(primaryImageUrl),
      sourceImage: { contentType, bytes: imageBytes.byteLength },
      beforePhotoUrlsRedacted: signedUrls.map(redactSignedUrlForInspect),
      referenceUrlsOrdered: mockupReferenceUrlsForImagePass.map((r) => ({
        label: r.label,
        urlRedacted: redactSignedUrlForInspect(r.url),
      })),
      vertexRefFetch: {
        attempted: vertexRefPack.attempted,
        loaded: vertexRefPack.loaded,
      },
      vertexRefSlots,
      referenceVisualSummary,
      quoteLineContext,
      fullEstimateContext,
      editPrompt,
      vertexGenerationConfig: built.generationConfig,
      vertexPartsDebug,
      allVertexTextPartsJoined,
    },
  };
}

export async function generateBidAi(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const bidId = str(formData, "bid_id");
  if (!bidId) {
    return { error: "Missing estimate." };
  }

  const additionalPromptRaw = String(formData.get("additional_prompt") ?? "");
  const additionalPrompt = additionalPromptRaw.trim().slice(0, 6000);
  const skipMockupRaw = String(formData.get("skip_mockup") ?? "").toLowerCase();
  const skipMockup =
    skipMockupRaw === "1" || skipMockupRaw === "on" || skipMockupRaw === "true";
  const mockupOnlyRaw = String(formData.get("mockup_only") ?? "").toLowerCase();
  const mockupOnly =
    mockupOnlyRaw === "1" || mockupOnlyRaw === "on" || mockupOnlyRaw === "true";
  const regenerateFromRoomRaw = String(
    formData.get("regenerate_from_room") ?? "",
  ).toLowerCase();
  const regenerateFromRoom =
    regenerateFromRoomRaw === "1" ||
    regenerateFromRoomRaw === "on" ||
    regenerateFromRoomRaw === "true";
  const refineFromMockupPhotoId = str(formData, "refine_from_mockup_photo_id")
    .trim()
    .slice(0, 80);
  if (mockupOnly && skipMockup) {
    return { error: "Choose either mockup-only or estimate-only, not both." };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  /** Vertex-only mockup path does not call OpenAI for image or ref summary; allow running without a key. */
  const mockupVertexWithoutOpenAi =
    mockupOnly &&
    isVertexMockupConfigured() &&
    (process.env.MOCKUP_IMAGE_PROVIDER ?? "auto").trim().toLowerCase() !== "openai" &&
    process.env.MOCKUP_FORCE_OPENAI_WITH_REFS?.trim() !== "1";

  if (!apiKey && !mockupVertexWithoutOpenAi) {
    return {
      error: mockupOnly
        ? "Add OPENAI_API_KEY for AI materials, or configure Vertex mockups (GOOGLE_CLOUD_PROJECT + credentials) and keep MOCKUP_IMAGE_PROVIDER unset / vertex."
        : "Add OPENAI_API_KEY to your environment (server-side only) to generate materials and mockups.",
    };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, bidId);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow, error: bidErr } = await supabase
    .from("bids")
    .select(
      "id, title, scope_description, company_id, material_estimate, ai_summary, project_kind, walkthrough_transcript, room_measurements, project_questionnaire",
    )
    .eq("id", bidId)
    .single();

  if (bidErr || !bidRow) {
    return { error: "Could not load estimate." };
  }

  let existingQuote = parseMaterialEstimate(bidRow.material_estimate);
  if (mockupOnly) {
    const snap = String(formData.get("material_estimate_snapshot") ?? "").trim();
    if (!snap) {
      return {
        error:
          "Could not read your live line items (empty quote snapshot). Expand **Line items** on this page, wait a second for the table to render, then click **Generate mockup** again. If this keeps happening, save **Setup → Pricing** and retry.",
      };
    }
    const fromSnapshot = tryParseMockupMaterialEstimateSnapshot(snap);
    if (!fromSnapshot) {
      return {
        error:
          "Could not parse the quote sent from your browser. Save **Setup → Pricing**, reload this page, then generate again. Very long notes or unusual characters in a line name can also cause this — shorten the line name and retry.",
      };
    }
    existingQuote = fromSnapshot;
  }
  const hasSavedQuote = existingQuote.some((l) => l.name.trim().length > 0);

  const scopeForAi =
    buildCompositeScopeDescription({
      scope_description: String(bidRow.scope_description ?? ""),
      project_kind: String(bidRow.project_kind ?? ""),
      walkthrough_transcript: String(bidRow.walkthrough_transcript ?? ""),
      room_measurements: bidRow.room_measurements,
      project_questionnaire: bidRow.project_questionnaire,
    }).trim() || String(bidRow.scope_description ?? "").trim();

  if (!scopeForAi) {
    return {
      error:
        "Add a scope description or complete the guided walkthrough (measurements, voice notes, or Q&A).",
    };
  }

  const { data: beforeRows } = await supabase
    .from("bid_photos")
    .select("id, storage_path")
    .eq("bid_id", bidId)
    .eq("kind", "before")
    .order("sort_order", { ascending: true });

  if (!beforeRows?.length) {
    return { error: "Upload at least one before photo." };
  }

  await supabase
    .from("bids")
    .update({ ai_status: "pending", ai_last_error: null })
    .eq("id", bidId);

  revalidatePath(`/dashboard/bids/${bidId}`);

  const company = await getCompanyForUser();
  const companyName = company?.name?.trim() || "Your remodel";

  const signedUrls: string[] = [];
  for (const row of beforeRows) {
    const { data } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(String(row.storage_path), 60 * 30);
    if (data?.signedUrl) {
      signedUrls.push(data.signedUrl);
    }
  }

  if (!signedUrls.length) {
    await supabase
      .from("bids")
      .update({
        ai_status: "failed",
        ai_last_error: "Could not sign photo URLs for AI.",
      })
      .eq("id", bidId);
    revalidatePath(`/dashboard/bids/${bidId}`);
    return { error: "Could not access before photos for AI." };
  }

  try {
    let additionalPromptForImage = additionalPrompt;
    let regenAttachmentRef: { label: string; url: string } | null = null;
    if (!skipMockup) {
      regenAttachmentRef = await loadRegenerationAttachmentRef(
        supabase,
        bidId,
        formData,
      );
    }

    /** GPT‑4o vision (runs before merge) — refs from saved quote on disk. */
    const urlsFromSavedQuote = await collectMockupReferenceSignedUrls(supabase, existingQuote);
    const referenceImageUrlsForVision = mergeQuoteRefsWithOptionalAttachment(
      urlsFromSavedQuote,
      regenAttachmentRef,
    );

    /** Saved mockup render for GPT‑4o before/after line diff (latest, or refine pick when submitted). */
    let afterMockupSignedUrlsForVision: string[] = [];
    {
      const { data: compareRows } = await supabase
        .from("bid_photos")
        .select("id, storage_path, mockup_generation, created_at")
        .eq("bid_id", bidId)
        .eq("kind", "after_mockup");
      const rows = compareRows ?? [];
      let pickPath: string | null = null;
      if (refineFromMockupPhotoId) {
        const hit = rows.find((r) => String(r.id) === refineFromMockupPhotoId);
        if (hit?.storage_path) pickPath = String(hit.storage_path);
      }
      if (!pickPath && rows.length > 0) {
        const sorted = [...rows].sort((a, b) => {
          const ga = a.mockup_generation != null ? Number(a.mockup_generation) : 0;
          const gb = b.mockup_generation != null ? Number(b.mockup_generation) : 0;
          if (gb !== ga) return gb - ga;
          return (
            new Date(String(b.created_at ?? 0)).getTime() -
            new Date(String(a.created_at ?? 0)).getTime()
          );
        });
        pickPath = sorted[0]?.storage_path ? String(sorted[0].storage_path) : null;
      }
      if (pickPath) {
        const { data: signedAfter } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .createSignedUrl(pickPath, 60 * 30);
        if (signedAfter?.signedUrl) {
          afterMockupSignedUrlsForVision = [signedAfter.signedUrl];
        }
      }
    }

    let materialsToSave: BidMaterialLine[];
    let quoteForEdit: BidMaterialLine[];
    let fullSummary: string;
    let roomAnalysis: string;
    let remodelEditPrompt: string;

    if (mockupOnly) {
      if (!hasSavedQuote) {
        throw new Error(
          "Save your priced line items first (Setup → Line item pricing), then generate a mockup.",
        );
      }
      materialsToSave = existingQuote;
      quoteForEdit = existingQuote;
      const priorSummary = String(
        (bidRow as Record<string, unknown>).ai_summary ?? "",
      ).trim();
      fullSummary =
        priorSummary ||
        "Estimate from your saved scope and line items. Mockup generated from the same data.";
      roomAnalysis = "";
      remodelEditPrompt = MOCKUP_ONLY_REMODEL_EDIT_PROMPT;

      if (apiKey && afterMockupSignedUrlsForVision.length > 0) {
        try {
          const visionRefresh = await fetchMaterialsAndSummaryFromOpenAI({
            apiKey,
            companyName,
            scopeDescription: scopeForAi,
            beforeImageUrls: signedUrls,
            afterMockupImageUrls: afterMockupSignedUrlsForVision,
            quoteLines: existingQuote,
            ...(referenceImageUrlsForVision.length > 0
              ? { referenceImageUrls: referenceImageUrlsForVision }
              : {}),
            ...(additionalPrompt ? { additionalPrompt } : {}),
          });
          const mergedRefresh = mergeMaterialsPreservingRefs(
            visionRefresh.materials,
            existingQuote,
          );
          materialsToSave = mergedRefresh;
          quoteForEdit = mergedRefresh;
          const s = visionRefresh.summary.trim();
          const ra = visionRefresh.roomAnalysis.trim();
          fullSummary = ra
            ? `${s}\n\n--- Room analysis ---\n${ra}`
            : s || fullSummary;
          roomAnalysis = ra;
        } catch (e) {
          console.warn("[mockup] Before/after vision line refresh failed:", e);
        }
      }
    } else {
      const vision = await fetchMaterialsAndSummaryFromOpenAI({
        apiKey,
        companyName,
        scopeDescription: scopeForAi,
        beforeImageUrls: signedUrls,
        ...(afterMockupSignedUrlsForVision.length > 0
          ? { afterMockupImageUrls: afterMockupSignedUrlsForVision }
          : {}),
        ...(hasSavedQuote ? { quoteLines: existingQuote } : {}),
        ...(referenceImageUrlsForVision.length > 0
          ? { referenceImageUrls: referenceImageUrlsForVision }
          : {}),
        ...(additionalPrompt ? { additionalPrompt } : {}),
      });

      const {
        materials: visionMaterials,
        summary,
        roomAnalysis: ra,
        remodelEditPrompt: rep,
      } = vision;

      roomAnalysis = ra;
      remodelEditPrompt = rep;

      const shouldRefreshLineItems =
        !hasSavedQuote ||
        additionalPrompt.length > 0 ||
        afterMockupSignedUrlsForVision.length > 0;
      const materialsMerged = shouldRefreshLineItems
        ? mergeMaterialsPreservingRefs(visionMaterials, existingQuote)
        : existingQuote;
      materialsToSave = shouldRefreshLineItems ? materialsMerged : existingQuote;

      quoteForEdit = shouldRefreshLineItems ? materialsMerged : existingQuote;

      fullSummary = roomAnalysis.trim()
        ? `${summary}\n\n--- Room analysis ---\n${roomAnalysis.trim()}`
        : summary;
    }

    const quoteForMockupImage = sortQuoteLinesForMockupProductRefs(
      quoteForEdit.filter(
        (l) =>
          l.name.trim().length > 0 &&
          l.mockup_include !== false &&
          lineHasMockupVisualReference(l),
      ),
    );
    const mockupOnNamedLines = quoteForEdit.filter(
      (l) => l.name.trim().length > 0 && l.mockup_include !== false,
    );
    const quoteLineContext = buildMockupQuoteLineContextFromVisualAndTextLines({
      visualRefLines: quoteForMockupImage,
      allMockupOnNamedLines: mockupOnNamedLines,
    });
    const fullEstimateContext = formatFullQuoteLinesForMockupEstimateContext(
      quoteForEdit.filter((l) => l.name.trim().length > 0),
    );

    if (skipMockup) {
      const { error: upBid } = await supabase
        .from("bids")
        .update({
          material_estimate: materialsToSave,
          ai_summary: fullSummary,
          ai_status: "complete",
          ai_last_error: null,
        })
        .eq("id", bidId);

      if (upBid) {
        throw new Error(upBid.message);
      }
      revalidatePath(`/dashboard/bids/${bidId}`);
      revalidatePath(`/dashboard/bids/${bidId}/setup/mockup`);
      return { success: true as const };
    }

    /** Vertex + reference summary — same line order as `quoteLineContext` (merged quote after vision). */
    const urlsForVertexFromMergedQuote = await collectMockupReferenceSignedUrls(
      supabase,
      quoteForMockupImage,
    );
    const mockupReferenceUrlsForImagePass = mergeQuoteRefsWithOptionalAttachment(
      urlsForVertexFromMergedQuote,
      regenAttachmentRef,
    );

    let vertexJobBrief = "";
    if (mockupOnly && apiKey) {
      try {
        vertexJobBrief = await compressMockupJobContextForVertexImagePrompt({
          apiKey,
          compositeScope: scopeForAi.slice(0, 28_000),
          fullEstimateText: fullEstimateContext.slice(0, 22_000),
          mockupLinesSummary: formatMockupLinesForCompression(mockupOnNamedLines),
          additionalNotes: additionalPromptForImage || undefined,
          beforeImageUrls: signedUrls.slice(0, 2),
          signal: AbortSignal.timeout(50_000),
        });
      } catch (e) {
        console.warn("[mockup] OpenAI job-brief compression failed:", e);
      }
    }

    if (mockupOnly && vertexJobBrief) {
      remodelEditPrompt = VERTEX_MOCKUP_REMODEL_FOLLOW_BRIEF;
      additionalPromptForImage = "";
    } else if (mockupOnly && !vertexJobBrief && mockupReferenceUrlsForImagePass.length === 0) {
      const noRefHeader =
        "NO product shelf or contractor JPEGs are attached for this run — follow the instruction block below plus contractor scope in this prompt.\n\n";
      const textOnlyForSynth = formatMockupLinesTextOnlyNoProductImages(
        mockupOnNamedLines.filter((l) => !lineHasMockupVisualReference(l)),
      );
      try {
        if (apiKey) {
          const synth = await synthesizeMockupInstructionsForVertexNoProductImages({
            apiKey,
            scopeText: scopeForAi,
            fullEstimateText: fullEstimateContext,
            mockupLinesWithoutImagesText: textOnlyForSynth,
            additionalNotes: additionalPromptForImage || undefined,
            beforeImageUrl: signedUrls[0],
            signal: AbortSignal.timeout(55_000),
          });
          remodelEditPrompt = noRefHeader + synth;
        } else {
          remodelEditPrompt =
            noRefHeader +
            buildDeterministicNoRefMockupRemodelPrompt(
              mockupOnNamedLines,
              additionalPromptForImage || undefined,
            );
        }
        additionalPromptForImage = "";
      } catch (e) {
        console.warn("[mockup] no-product-image instruction synthesis failed:", e);
        remodelEditPrompt =
          noRefHeader +
          buildDeterministicNoRefMockupRemodelPrompt(
            mockupOnNamedLines,
            additionalPromptForImage || undefined,
          );
        additionalPromptForImage = "";
      }
    }

    const { data: existingMockupRows } = await supabase
      .from("bid_photos")
      .select("storage_path, mockup_generation, created_at")
      .eq("bid_id", bidId)
      .eq("kind", "after_mockup");

    const mockupRows = existingMockupRows ?? [];
    let maxNumericGen = 0;
    for (const row of mockupRows) {
      const g =
        row.mockup_generation != null ? Number(row.mockup_generation) : 0;
      if (Number.isFinite(g) && g > maxNumericGen) maxNumericGen = g;
    }
    const priorMockupCount = mockupRows.length;
    /** Avoid reusing v1 after deleting v2 when older rows have null mockup_generation (max numeric would stay 0). */
    const nextMockupGen = Math.max(maxNumericGen, priorMockupCount) + 1;

    let latestMockupStoragePath: string | null = null;
    if (priorMockupCount > 0) {
      const sorted = [...mockupRows].sort((a, b) => {
        const ga = a.mockup_generation != null ? Number(a.mockup_generation) : 0;
        const gb = b.mockup_generation != null ? Number(b.mockup_generation) : 0;
        if (gb !== ga) return gb - ga;
        const ta = new Date(String(a.created_at ?? 0)).getTime();
        const tb = new Date(String(b.created_at ?? 0)).getTime();
        return tb - ta;
      });
      const top = sorted[0];
      latestMockupStoragePath = top?.storage_path ? String(top.storage_path) : null;
    }

    let chosenRefineStoragePath: string | null = null;
    let chosenRefineGeneration: number | null = null;
    if (!regenerateFromRoom && refineFromMockupPhotoId) {
      const { data: refinePick } = await supabase
        .from("bid_photos")
        .select("storage_path, mockup_generation")
        .eq("bid_id", bidId)
        .eq("id", refineFromMockupPhotoId)
        .eq("kind", "after_mockup")
        .maybeSingle();
      if (refinePick?.storage_path) {
        chosenRefineStoragePath = String(refinePick.storage_path);
        chosenRefineGeneration =
          refinePick.mockup_generation != null
            ? Number(refinePick.mockup_generation)
            : null;
      }
    }

    /** Prefer selected mockup, else latest, else jobsite photo (unless “start from room”). */
    let primaryImageUrl = signedUrls[0];
    let imageEditSource: "before" | "latest_mockup" = "before";

    const useLatestMockupFallback =
      !regenerateFromRoom &&
      !chosenRefineStoragePath &&
      priorMockupCount > 0 &&
      Boolean(latestMockupStoragePath);

    if (!regenerateFromRoom && chosenRefineStoragePath) {
      const { data: signedPick } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(chosenRefineStoragePath, 60 * 30);
      if (signedPick?.signedUrl) {
        primaryImageUrl = signedPick.signedUrl;
        imageEditSource = "latest_mockup";
      }
    } else if (useLatestMockupFallback && latestMockupStoragePath) {
      const { data: signedLatest } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(latestMockupStoragePath, 60 * 30);
      if (signedLatest?.signedUrl) {
        primaryImageUrl = signedLatest.signedUrl;
        imageEditSource = "latest_mockup";
      }
    }

    const refsForSummary = mockupReferenceUrlsForImagePass.slice(
      0,
      mockupReferenceVisionMaxRefs(),
    );
    const weakRoomGeometry =
      roomAnalysisSuggestsWeakFixtureGeometry(roomAnalysis) ||
      mirrorHeavySceneFromVertexJobBrief(vertexJobBrief);
    /** Opt-in only: default is to always send catalog/contractor pixels on Vertex so finishes match SKUs. */
    const omitVertexInlineProductRefs =
      process.env.MOCKUP_OMIT_INLINE_REFS_WEAK_ROOM?.trim() === "1" &&
      weakRoomGeometry &&
      mockupReferenceUrlsForImagePass.length > 0;

    const refVisionTimeoutMs = (() => {
      const raw = process.env.MOCKUP_REFERENCE_VISION_TIMEOUT_MS?.trim();
      const parsed = raw ? Number(raw) : NaN;
      const fallback = 20_000;
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(90_000, Math.max(8_000, Math.floor(parsed)));
    })();

    /** Mockup-only: skip GPT‑4o vision over refs — quote lines + label fallback are enough; saves ~15–45s. */
    async function resolveReferenceVisualSummary(): Promise<string> {
      if (refsForSummary.length === 0) return "";
      if (mockupOnly) {
        return buildReferenceVisualFallbackText(refsForSummary);
      }
      if (process.env.MOCKUP_SKIP_REFERENCE_VISION_SUMMARY?.trim() === "1") {
        return buildReferenceVisualFallbackText(refsForSummary);
      }
      try {
        const out = await summarizeReferenceImagesForMockup({
          apiKey: apiKey!,
          refs: refsForSummary,
          ...(weakRoomGeometry ? { weakRoomGeometry: true } : {}),
          signal: AbortSignal.timeout(refVisionTimeoutMs),
        });
        const t = out.trim();
        if (t) return t;
      } catch {
        // fall through to fallback
      }
      return buildReferenceVisualFallbackText(mockupReferenceUrlsForImagePass.slice(0, 12));
    }

    const preferredProvider = resolveMockupImageProvider();
    /**
     * OpenAI `images/edits` only receives the **room** JPEG — it cannot take Home Depot/Lowe’s catalog
     * pixels. If `.env.local` sets `MOCKUP_IMAGE_PROVIDER=openai` while this run has shelf/contractor
     * refs and Vertex is configured, we **must** use Vertex so selected mockup photos actually reach
     * the model. Opt out: `MOCKUP_FORCE_OPENAI_WITH_REFS=1` (text-only ref summaries; no catalog pixels).
     */
    const mockupRefCount = mockupReferenceUrlsForImagePass.length;
    const forceOpenAiWithShelfRefs =
      process.env.MOCKUP_FORCE_OPENAI_WITH_REFS?.trim() === "1";
    const mockupImageProvider: MockupImageProviderId =
      preferredProvider === "openai" &&
      mockupRefCount > 0 &&
      isVertexMockupConfigured() &&
      !forceOpenAiWithShelfRefs
        ? "vertex_gemini"
        : preferredProvider;
    if (
      preferredProvider === "openai" &&
      mockupImageProvider === "vertex_gemini" &&
      mockupRefCount > 0
    ) {
      console.warn(
        "[mockup] MOCKUP_IMAGE_PROVIDER=openai skips catalog/contractor reference pixels (OpenAI image edit is single-image). Using Vertex for this run because GOOGLE_CLOUD_PROJECT is set and references exist. Set MOCKUP_FORCE_OPENAI_WITH_REFS=1 to force OpenAI anyway.",
      );
    }

    const needVertexRefPixels =
      mockupImageProvider === "vertex_gemini" &&
      !omitVertexInlineProductRefs &&
      mockupReferenceUrlsForImagePass.length > 0;

    const vertexRefPromise = needVertexRefPixels
      ? fetchMockupReferenceImagesForVertex(mockupReferenceUrlsForImagePass)
      : Promise.resolve({
          images: [] as VertexMockupReferenceInline[],
          attempted: 0,
          loaded: 0,
        });

    const sourceImageFetchTimeoutMs = 120_000;

    const [sourceLoad, referenceVisualSummary, vertexRefPack] = await Promise.all([
      (async () => {
        let sourceImageRes: Response;
        try {
          sourceImageRes = await fetch(primaryImageUrl, {
            signal: AbortSignal.timeout(sourceImageFetchTimeoutMs),
          });
        } catch (e) {
          const name = e instanceof Error ? e.name : "";
          if (
            name === "AbortError" ||
            (e instanceof Error && /aborted|timeout/i.test(e.message))
          ) {
            throw new Error(
              `Downloading the source photo timed out after ${sourceImageFetchTimeoutMs / 1000}s. Check your connection or try again.`,
            );
          }
          throw e;
        }
        if (!sourceImageRes.ok) {
          throw new Error("Could not download source image for image edit.");
        }
        const imageBytes = await sourceImageRes.arrayBuffer();
        const maxBytes = 20 * 1024 * 1024;
        if (imageBytes.byteLength > maxBytes) {
          throw new Error("Source image is too large (max ~20 MB). Use a smaller image.");
        }
        const contentType =
          sourceImageRes.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
        return { imageBytes, contentType };
      })(),
      resolveReferenceVisualSummary(),
      vertexRefPromise,
    ]);

    const { imageBytes, contentType } = sourceLoad;

    const vanityCabinetReplacement = quoteHasNewVanityCabinetAssembly(mockupOnNamedLines);
    const editPrompt = buildImageEditPrompt({
      scopeDescription: scopeForAi,
      roomAnalysis,
      remodelEditPrompt,
      ...(vertexJobBrief
        ? { vertexJobBrief, scopeCompositeForRules: scopeForAi }
        : {}),
      ...(quoteLineContext.trim() ? { quoteLineContext } : {}),
      ...(fullEstimateContext.trim() && !vertexJobBrief ? { fullEstimateContext } : {}),
      ...(additionalPromptForImage ? { additionalPrompt: additionalPromptForImage } : {}),
      imageEditSource,
      ...(referenceVisualSummary.trim()
        ? { referenceVisualSummary: referenceVisualSummary.trim() }
        : {}),
      mockupQuoteLines: mockupOnNamedLines,
      ...(weakRoomGeometry ? { weakRoomGeometryEvidence: true } : {}),
      ...(omitVertexInlineProductRefs ? { inlineProductPixelsOmitted: true } : {}),
    });

    const imageEditModel = process.env.OPENAI_IMAGE_EDIT_MODEL?.trim();

    let png: ArrayBuffer | undefined;
    let usedMockupProvider: MockupImageProviderId = "openai";
    let usedConceptFallback = false;
    let mockupCaption = "";
    /** Set when Vertex auth fails and OpenAI image edit runs via MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK. */
    let openaiAfterVertexAuthFallback = false;
    /** Populated when Vertex runs — how many catalog/contractor refs were sent as pixels. */
    let vertexReferenceFetch: { attempted: number; loaded: number } | null = null;

    async function runOpenAiImageEdit(promptOverride?: string): Promise<ArrayBuffer> {
      return fetchRoomRemodelImageEdit({
        apiKey: apiKey!,
        imageBytes,
        contentType,
        editPrompt: promptOverride ?? editPrompt,
        model: imageEditModel,
      });
    }

    /** OpenAI DALL·E only when `MOCKUP_IMAGE_PROVIDER=openai` and `gpt-image-1` edit fails (local dev). */
    async function applyOpenAiConceptFallbackAfterPhotoEditFailed(): Promise<void> {
      const quoteBits = formatQuoteLinesForImageEdit(quoteForMockupImage);
      const strictRemodel = buildStrictRemodelEditPrompt({
        remodelEditPrompt: sanitizeRemodelEditPromptForMockupImage(
          remodelEditPrompt,
          scopeForAi,
        ),
        additionalPrompt: additionalPrompt || undefined,
        scopeDescription: scopeForAi,
      });
      const toiletScope = scopeMentionsToiletWork(scopeForAi);
      const siteNotesForFallback =
        sanitizeRoomAnalysisForMockupImage(roomAnalysis, scopeForAi) ||
        sanitizeRemodelEditPromptForMockupImage(remodelEditPrompt, scopeForAi);
      const fallbackPrompt = appendMockupLayoutFooter(
        additionalPrompt.trim()
          ? [
              "Photorealistic interior remodeling visualization. CONCEPT ONLY. Additional instructions only — no drift from scope or quote.",
              "No people, no text, no logos.",
              getImageEditSpatialLock(toiletScope),
              getRemodelLayoutGuard(toiletScope),
              SURFACE_ARCHITECTURE_HARDWARE_LOCK,
              ADDITIONAL_ONLY_ZERO_DRIFT,
              INCREMENTAL_SURGICAL_EDIT,
              imageEditSource === "latest_mockup" ? LATEST_MOCKUP_AS_BASELINE : "",
              strictRemodel,
            ]
              .filter(Boolean)
              .join("\n\n")
          : [
              "Photorealistic interior remodeling visualization. This is a CONCEPT ONLY — it may not match the client's actual room.",
              "No people, no text, no logos.",
              getImageEditSpatialLock(toiletScope),
              getRemodelLayoutGuard(toiletScope),
              SURFACE_ARCHITECTURE_HARDWARE_LOCK,
              MINIMAL_CHANGE_PROTOCOL,
              "Scope:",
              scopeForAi,
              quoteBits.trim() ? `Quote line selections (colors, fixtures, finishes):\n${quoteBits}` : "",
              "Room / site notes:",
              siteNotesForFallback,
              "Design intent (minimal changes only; do not move fixtures or layout):",
              strictRemodel,
            ]
              .filter(Boolean)
              .join("\n\n"),
      );
      png = await fetchFallbackConceptImage({ apiKey, prompt: fallbackPrompt });
      usedConceptFallback = true;
    }

    if (mockupImageProvider === "vertex_gemini") {
      try {
        let vertexRefInline: VertexMockupReferenceInline[] | undefined;
        if (omitVertexInlineProductRefs) {
          console.warn(
            "[mockup] Omitted inline catalog/contractor reference pixels — MOCKUP_OMIT_INLINE_REFS_WEAK_ROOM=1 with weak/partial room geometry. Unset that env to send shelf/contractor images (default).",
          );
        } else if (mockupReferenceUrlsForImagePass.length > 0) {
          const refResult = vertexRefPack;
          vertexRefInline = refResult.images;
          vertexReferenceFetch = {
            attempted: refResult.attempted,
            loaded: refResult.loaded,
          };
          if (refResult.attempted > 0 && refResult.loaded === 0) {
            console.warn(
              `[mockup] Vertex: could not decode any of ${refResult.attempted} reference image(s); catalog pixels were not sent — mockup may ignore shelf SKUs.`,
            );
          }
        }
        png = await fetchRoomRemodelImageEditVertexGemini({
          imageBytes,
          contentType,
          editPrompt,
          projectId: googleCloudProjectId(),
          location: vertexLocation(),
          model: vertexGeminiImageModel(),
          ...(vertexRefInline?.length
            ? {
                referenceInlineImages: vertexRefInline,
                ...(vanityCabinetReplacement ? { vanityCabinetReplacement: true } : {}),
              }
            : {}),
        });
        usedMockupProvider = "vertex_gemini";
      } catch (vertexErr) {
        const vMsg =
          vertexErr instanceof Error ? vertexErr.message : String(vertexErr);
        console.error("[mockup] Vertex image generation failed:", vMsg);
        if (
          isOpenAiFallbackOnVertexAuthErrorEnabled() &&
          isVertexGoogleUserAuthFailureMessage(vMsg)
        ) {
          console.warn(
            "[mockup] Vertex user-credential / RAPT error (e.g. invalid_rapt) — retrying mockup with OpenAI image edit. (Non-production: automatic when MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK is unset; production: set that env to 1, or fix ADC / service account.)",
          );
          try {
            png = await runOpenAiImageEdit(
              OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPrompt,
            );
            usedMockupProvider = "openai";
            openaiAfterVertexAuthFallback = true;
          } catch {
            await applyOpenAiConceptFallbackAfterPhotoEditFailed();
          }
        } else {
          throw vertexErr;
        }
      }
    } else {
      if (mockupImageProvider === "openai" && mockupRefCount > 0) {
        console.warn(
          "[mockup] OpenAI image edit path: catalog/contractor product JPEGs are not sent to the model (API accepts one image). Reference lines rely on text summaries only — for shelf-accurate mockups configure Vertex (GOOGLE_CLOUD_PROJECT) and remove MOCKUP_IMAGE_PROVIDER=openai.",
        );
      }
      try {
        png = await runOpenAiImageEdit();
        usedMockupProvider = "openai";
      } catch {
        await applyOpenAiConceptFallbackAfterPhotoEditFailed();
      }
    }

    const imageModelCaption = formatMockupImageModelCaptionFragment({
      usedConceptFallback,
      usedMockupProvider,
      openaiImageEditModel: imageEditModel,
    });
    if (!usedConceptFallback) {
      mockupCaption = `Mockup v${nextMockupGen}. ${imageModelCaption} AI preview — verify finishes and layout before quoting.`;
    } else {
      mockupCaption = `Mockup v${nextMockupGen}. ${imageModelCaption} Concept image — not a photo edit; verify before quoting.`;
    }
    if (mockupOnly) {
      mockupCaption += " Uses your saved quote and scope.";
    }

    if (additionalPrompt) {
      mockupCaption += " Includes your notes for this run.";
    }

    if (
      !regenerateFromRoom &&
      refineFromMockupPhotoId &&
      chosenRefineGeneration != null &&
      imageEditSource === "latest_mockup"
    ) {
      mockupCaption += ` Based on mockup v${chosenRefineGeneration}.`;
    }

    const mockupGenerationMeta: BidMockupGenerationMeta = {
      additionalPrompt: additionalPrompt || null,
      fullEditPrompt: editPrompt,
      imageEditSource,
      remodelEditPrompt,
      roomAnalysis: roomAnalysis || null,
      mockupOnly,
      usedConceptFallback,
      usedMockupProvider,
      image_model_caption: imageModelCaption,
      vertex_reference_fetch: vertexReferenceFetch,
      vertex_inline_product_refs_omitted_ambiguous_room: omitVertexInlineProductRefs,
      mockup_reference_urls_count: mockupReferenceUrlsForImagePass.length,
      mockup_reference_slot_summaries: getMockupReferenceSlotSummaryStrings(quoteForMockupImage),
      openai_after_vertex_auth_fallback: openaiAfterVertexAuthFallback,
      referenceVisualSummary: referenceVisualSummary || null,
      scopeSnapshot: scopeForAi,
      regenerateFromRoom,
      refineFromMockupPhotoId: refineFromMockupPhotoId || null,
      chosenRefineGeneration,
    };
    const refStatusLine = formatMockupProductRefStatusLine(mockupGenerationMeta);
    if (refStatusLine) {
      mockupCaption += ` ${refStatusLine}`;
    }

    if (!png) {
      throw new Error("Mockup image generation did not return image bytes.");
    }

    const mockPath = `bids/${bidId}/mockup-${crypto.randomUUID()}.png`;
    const buf = Buffer.from(png);
    const { error: upErr } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(mockPath, buf, {
        contentType: "image/png",
        upsert: false,
      });

    if (upErr) {
      throw new Error(upErr.message);
    }

    const { error: insPh } = await supabase.from("bid_photos").insert({
      bid_id: bidId,
      storage_path: mockPath,
      sort_order: 0,
      kind: "after_mockup",
      mockup_generation: nextMockupGen,
      mockup_image_provider: usedConceptFallback
        ? "openai_dalle_fallback"
        : usedMockupProvider,
      caption: mockupCaption,
      mockup_generation_meta: mockupGenerationMeta,
    });

    if (insPh) {
      await supabase.storage.from(PHOTOS_BUCKET).remove([mockPath]);
      throw new Error(insPh.message);
    }

    const { error: upBid } = await supabase
      .from("bids")
      .update({
        material_estimate: materialsToSave,
        ai_summary: fullSummary,
        ai_status: "complete",
        ai_last_error: null,
      })
      .eq("id", bidId);

    if (upBid) {
      throw new Error(upBid.message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    await supabase
      .from("bids")
      .update({ ai_status: "failed", ai_last_error: message })
      .eq("id", bidId);
    revalidatePath(`/dashboard/bids/${bidId}`);
    revalidatePath(`/dashboard/bids/${bidId}/setup/mockup`);
    return { error: message };
  }

  revalidatePath(`/dashboard/bids/${bidId}`);
  revalidatePath(`/dashboard/bids/${bidId}/setup/mockup`);
  return { success: true as const };
}

export async function saveCompanyLineTemplate(
  bidId: string,
  line: {
    name: string;
    quantity: number;
    unit: string;
    trade?: BidMaterialTrade;
    notes?: string;
    default_unit_price_usd?: number;
  },
): Promise<{ error: string } | { success: true; template: BidLineTemplate }> {
  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }
  const name = String(line.name ?? "").trim();
  if (!name) {
    return { error: "Description is required." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }
  if (!own.company_id) {
    return {
      error:
        "Saving lines to a reusable library needs a company profile. You can keep editing this estimate without saving to the library.",
    };
  }

  const quantity = Math.max(0, Number(line.quantity) || 0);
  const unit = String(line.unit ?? "ea").trim() || "ea";
  const trade = normalizeMaterialTrade(line.trade);
  const notesRaw = line.notes != null ? String(line.notes).trim() : "";
  const notes = notesRaw ? notesRaw : null;
  const default_unit_price_usd = Math.max(0, Number(line.default_unit_price_usd) ?? 0);

  const { data: inserted, error } = await supabase
    .from("company_line_templates")
    .insert({
      company_id: own.company_id,
      name,
      trade,
      quantity,
      unit,
      notes,
      default_unit_price_usd,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Could not save line to library." };
  }

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${id}`);
  return {
    success: true as const,
    template: mapLineTemplateRow(inserted as Record<string, unknown>),
  };
}

export async function deleteCompanyLineTemplate(
  bidId: string,
  templateId: string,
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  const tid = templateId.trim();
  if (!id || !tid) {
    return { error: "Missing estimate or template." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }
  if (!own.company_id) {
    return { error: "No company library is linked to this estimate." };
  }

  const { data: row } = await supabase
    .from("company_line_templates")
    .select("company_id")
    .eq("id", tid)
    .maybeSingle();

  if (!row || String(row.company_id) !== own.company_id) {
    return { error: "Template not found." };
  }

  const { error } = await supabase.from("company_line_templates").delete().eq("id", tid);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/bids");
  revalidatePath(`/dashboard/bids/${id}`);
  return { success: true as const };
}

/**
 * Fills optional Home Depot retail fields on material lines.
 * When `RETAIL_DISABLE_SERP` is true, uses **OpenAI only** (full job context + before photos +
 * optional line reference images) to attach one `homedepot.com` product URL per line — **no shelf
 * prices** until Serp is re-enabled.
 * When Serp is enabled (`RETAIL_DISABLE_SERP=false`), requires **SERPAPI_API_KEY** and uses SerpApi
 * search (not an official THD API). Uses the bid's job-site ZIP (`site_postal_code`) when set;
 * otherwise `SERPAPI_HOME_DEPOT_ZIP`; otherwise no ZIP (still works, less localized).
 *
 * When Home Depot is enabled and `OPENAI_API_KEY` is set, runs a batched shelf validation pass (set
 * `RETAIL_SHELF_MATCH_VALIDATION=false` to skip) and may issue a capped number of extra Home Depot
 * searches where a refined query scores clearly better than the first hit.
 *
 * OpenAI retail prompts use the composite scope (initial scope, Q&A, measurements, walkthrough), a
 * numbered summary of **all** line names + line notes, up to four signed **before** photos, each
 * line’s optional **reference** image, and Serp excludes Home Depot / Lowe’s SKUs already used on
 * **other** lines in the same run so the same SKU is not reused across unrelated rows.
 *
 * After URL-probe SKUs resolve, `RETAIL_HD_PROBE_POST_PICK` (default true) runs a strict OpenAI pass
 * (before photos + product images when available) to choose one candidate or reject all so a bad
 * first match is not auto-attached. Override with `RETAIL_HD_PROBE_POST_PICK=false` for legacy behavior.
 *
 * OpenAI suggestion calls run in parallel (bounded): set `RETAIL_BULK_SUGGEST_CONCURRENCY` (1–12,
 * default 4). Each call uses `RETAIL_QUERY_OPENAI_TIMEOUT_MS` (default 22000 ms) so a hung model
 * does not block the whole fetch.
 */
export async function fetchHomeDepotPricingForBid(
  bidId: string,
  options?: {
    preferSale?: boolean;
    /** Defaults to Home Depot only (backward compatible). */
    retailers?: { homeDepot?: boolean; lowes?: boolean };
  },
): Promise<
  | { error: string }
  | {
      success: true;
      /** Lines that gained or refreshed a Home Depot link. */
      updated: number;
      updated_hd: number;
      updated_lowes: number;
      skipped: number;
      failed: { name: string; reason: string }[];
      /** Lines where SerpApi reported a sale / was price (when preferSale or not). */
      sale_matches: number;
      /** Home Depot lines replaced after batch AI validation + a better Serp hit. */
      retail_validation_corrections: number;
      /** Home Depot lines replaced after vision + before-photo validation + a better Serp hit. */
      retail_vision_validation_corrections: number;
      /** Lines where shelf match came from AI-suggested homedepot.com URL + Serp product lookup. */
      retail_url_probe_hits: number;
      /** OpenAI Home Depot URL plan for this fetch (line #, shoppable flag, suggested URLs). */
      retail_url_probe_report: RetailUrlProbeReportRow[];
      /** Saved material lines after this run (same shape as DB); use to refresh the client editor. */
      material_estimate: BidMaterialLine[];
    }
> {
  const serpDisabled = isRetailSerpDisabled();
  const wantHd = options?.retailers?.homeDepot !== false;
  const wantLowes = options?.retailers?.lowes === true;

  if (!serpDisabled && !process.env.SERPAPI_API_KEY?.trim()) {
    return {
      error:
        "Set SERPAPI_API_KEY (server-side) to enable retail search. Get a key at serpapi.com.",
    };
  }
  if (serpDisabled && wantHd && !process.env.OPENAI_API_KEY?.trim()) {
    return {
      error:
        "Set OPENAI_API_KEY (server-side) to link Home Depot products while Serp is disabled (RETAIL_DISABLE_SERP).",
    };
  }

  const id = bidId.trim();
  if (!id) {
    return { error: "Missing estimate." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select(
      "material_estimate, site_postal_code, title, scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire",
    )
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  const beforePhotoUrls = await signedBeforePhotoUrlsForBid(supabase, id, 4);
  let lineRefByLineId: Record<string, string> = {};
  try {
    lineRefByLineId = await buildLineReferenceUrlMap(supabase, lines);
  } catch {
    lineRefByLineId = {};
  }
  const quoteLinesSummary = buildQuoteLinesSummaryForRetailAi(lines);

  const bidMeta = bidRow as {
    site_postal_code?: string | null;
    title?: string | null;
    scope_description?: string | null;
    project_kind?: string | null;
    walkthrough_transcript?: string | null;
    room_measurements?: unknown;
    project_questionnaire?: unknown;
  } | null;

  const jobContext = buildCompositeScopeDescription({
    scope_description: String(bidMeta?.scope_description ?? ""),
    project_kind: bidMeta?.project_kind?.trim() || undefined,
    walkthrough_transcript: bidMeta?.walkthrough_transcript?.trim() || undefined,
    room_measurements: bidMeta?.room_measurements,
    project_questionnaire: bidMeta?.project_questionnaire,
  });
  const bidTitle = String(bidMeta?.title ?? "").trim() || "Bid";

  const questionnaireRows = Array.isArray(bidMeta?.project_questionnaire)
    ? (bidMeta.project_questionnaire as ProjectQuestionnaireItem[])
    : undefined;

  const preferSale = options?.preferSale === true;

  const attach = await attachRetailPricingToLines({
    lines,
    jobContext,
    bidTitle,
    beforePhotoUrls,
    lineRefByLineId,
    quoteLinesSummary,
    questionnaireRows,
    sitePostalCode: bidMeta?.site_postal_code,
    preferSale,
    wantHd,
    wantLowes,
  });
  const next = attach.lines;

  const save = await updateBidQuoteLines(id, next);
  if ("error" in save) {
    return { error: save.error };
  }

  const { data: savedBid } = await supabase
    .from("bids")
    .select("material_estimate")
    .eq("id", id)
    .maybeSingle();
  const material_estimate = parseMaterialEstimate(savedBid?.material_estimate);

  return {
    success: true,
    updated: attach.updated,
    updated_hd: attach.updated_hd,
    updated_lowes: attach.updated_lowes,
    skipped: attach.skipped,
    failed: attach.failed,
    sale_matches: attach.sale_matches,
    retail_validation_corrections: attach.retail_validation_corrections,
    retail_vision_validation_corrections: attach.retail_vision_validation_corrections,
    retail_url_probe_hits: attach.retail_url_probe_hits,
    retail_url_probe_report: attach.retail_url_probe_report,
    material_estimate,
  };
}

/**
 * Returns Home Depot / Lowe’s shelf matches for one line (picker UI).
 * Default is one hit per enabled retailer per request; use `perStoreMax` for more.
 * Does not persist — call {@link applyRetailShelfCandidateChoiceAction} after the user selects one.
 */
export async function fetchRetailShelfCandidatesForLineAction(
  bidId: string,
  lineId: string,
  options?: {
    preferSale?: boolean;
    searchHint?: string;
    includeHomeDepot?: boolean;
    includeLowes?: boolean;
    /** Skip these numeric product IDs so “find similar” returns different SKUs. */
    excludeHomeDepotProductIds?: string[];
    excludeLowesProductIds?: string[];
    /** Serp hits per retailer for this request (default 1). */
    perStoreMax?: number;
  },
): Promise<
  | { error: string }
  | { success: true; q: string; home_depot: HomeDepotSearchHit[]; lowes: LowesSearchHit[] }
> {
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    return { error: "Set SERPAPI_API_KEY to search retailers." };
  }

  const id = bidId.trim();
  const lid = lineId.trim();
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select(
      "material_estimate, site_postal_code, title, scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire",
    )
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  const line = lines.find((l) => l.line_id === lid);
  if (!line || !line.name.trim()) {
    return { error: "Line not found." };
  }

  const pickerBeforeUrls = await signedBeforePhotoUrlsForBid(supabase, id, 4);
  let pickerLineRefMap: Record<string, string> = {};
  try {
    pickerLineRefMap = await buildLineReferenceUrlMap(supabase, lines);
  } catch {
    pickerLineRefMap = {};
  }
  const pickerQuoteSummary = buildQuoteLinesSummaryForRetailAi(lines);

  const bidMeta = bidRow as {
    site_postal_code?: string | null;
    title?: string | null;
    scope_description?: string | null;
    project_kind?: string | null;
    walkthrough_transcript?: string | null;
    room_measurements?: unknown;
    project_questionnaire?: unknown;
  } | null;

  const retailTrade = refineMaterialTradeFromLineName(
    line.name,
    (line.trade ?? "general") as BidMaterialTrade,
  );
  const lineForRetail: BidMaterialLine = { ...line };
  if (retailTrade === "general") delete lineForRetail.trade;
  else lineForRetail.trade = retailTrade;

  const pqShelf = Array.isArray(bidMeta?.project_questionnaire)
    ? (bidMeta.project_questionnaire as ProjectQuestionnaireItem[])
    : undefined;
  if (shouldSkipRetailSearchForVanityCabinetDueToCustomMillwork(lineForRetail, pqShelf)) {
    return { success: true as const, q: "", home_depot: [], lowes: [] };
  }

  const jobContext = buildCompositeScopeDescription({
    scope_description: String(bidMeta?.scope_description ?? ""),
    project_kind: bidMeta?.project_kind?.trim() || undefined,
    walkthrough_transcript: bidMeta?.walkthrough_transcript?.trim() || undefined,
    room_measurements: bidMeta?.room_measurements,
    project_questionnaire: bidMeta?.project_questionnaire,
  });
  const bidTitle = String(bidMeta?.title ?? "").trim() || "Bid";
  const hint = options?.searchHint?.trim().slice(0, 500);
  const jobRun = extractVanityCabinetRunWidthInchesFromJobContext(jobContext);
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

  const zipFromBid = normalizeUsZipForHd(bidMeta?.site_postal_code);
  const zipFromEnv = normalizeUsZipForHd(process.env.SERPAPI_HOME_DEPOT_ZIP);
  const deliveryZip = zipFromBid ?? zipFromEnv;
  const zipOpt = deliveryZip ? { deliveryZip } : undefined;
  const preferSale = options?.preferSale === true;

  let q = "";
  try {
    const lineRefUrl = lineForRetail.line_id ? pickerLineRefMap[lineForRetail.line_id] : undefined;
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
      lineReferenceImageUrl: lineRefUrl ?? undefined,
      quoteLinesSummary: pickerQuoteSummary,
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

  const incHd = options?.includeHomeDepot !== false;
  const incLw = options?.includeLowes !== false;
  const otherHdFromQuote = lines
    .filter((l) => l.line_id !== lid)
    .map((l) => normalizeRetailSkuDigits(l.hd_product_id))
    .filter((x): x is string => Boolean(x));
  const otherLwFromQuote = lines
    .filter((l) => l.line_id !== lid)
    .map((l) => normalizeRetailSkuDigits(l.lw_product_id))
    .filter((x): x is string => Boolean(x));
  const excludeHd = [
    ...new Set([
      ...(options?.excludeHomeDepotProductIds ?? []).map((id) => String(id).replace(/\D/g, "")),
      ...otherHdFromQuote,
    ]),
  ].filter((id) => id.length >= 6 && id.length <= 12);
  const excludeLw = [
    ...new Set([
      ...(options?.excludeLowesProductIds ?? []).map((id) => String(id).replace(/\D/g, "")),
      ...otherLwFromQuote,
    ]),
  ].filter((id) => id.length >= 6 && id.length <= 12);

  let home_depot: HomeDepotSearchHit[] = [];
  let lowes: LowesSearchHit[] = [];

  const perStoreMax = Math.min(10, Math.max(1, options?.perStoreMax ?? 1));

  try {
    if (incHd) {
      const hdRaw = await searchHomeDepotProductCandidates(q, {
        ...zipOpt,
        preferSale,
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
    }
    if (incLw) {
      lowes = await searchLowesProductCandidates(q, {
        preferSale,
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
    return {
      error: e instanceof Error ? e.message.slice(0, 200) : "Retail search failed.",
    };
  }

  return { success: true as const, q, home_depot, lowes };
}

/** Applies one chosen shelf SKU and uses that retailer for pricing (clears the other retailer fields). */
export async function applyRetailShelfCandidateChoiceAction(
  bidId: string,
  lineId: string,
  choice: { retailer: "home_depot" | "lowes"; hit: HomeDepotSearchHit | LowesSearchHit },
): Promise<{ error: string } | { success: true; lines: BidMaterialLine[] }> {
  const id = bidId.trim();
  const lid = lineId.trim();
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select(
      "material_estimate, scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire",
    )
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  if (!lines.some((l) => l.line_id === lid)) {
    return { error: "Line not found." };
  }

  const bidMeta = bidRow as {
    scope_description?: string | null;
    project_kind?: string | null;
    walkthrough_transcript?: string | null;
    room_measurements?: unknown;
    project_questionnaire?: unknown;
  } | null;
  const jobContext = buildCompositeScopeDescription({
    scope_description: String(bidMeta?.scope_description ?? ""),
    project_kind: bidMeta?.project_kind?.trim() || undefined,
    walkthrough_transcript: bidMeta?.walkthrough_transcript?.trim() || undefined,
    room_measurements: bidMeta?.room_measurements,
    project_questionnaire: bidMeta?.project_questionnaire,
  });

  let verifiedHomeDepotHit: HomeDepotSearchHit | null = null;
  if (choice.retailer === "home_depot") {
    try {
      verifiedHomeDepotHit = await verifyHomeDepotSearchHitForProductLink(
        choice.hit as HomeDepotSearchHit,
      );
    } catch (e) {
      return {
        error:
          e instanceof Error
            ? `Home Depot product verification failed: ${e.message.slice(0, 160)}`
            : "Home Depot product verification failed.",
      };
    }
    if (!verifiedHomeDepotHit) {
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

  const save = await updateBidQuoteLines(id, next);
  if ("error" in save) {
    return { error: save.error };
  }
  return { success: true as const, lines: next };
}

export async function clearBidLineHomeDepotRef(
  bidId: string,
  lineId: string,
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  const lid = lineId.trim();
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select("material_estimate")
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  const next = lines.map((l) => {
    if (l.line_id !== lid) return l;
    const copy: BidMaterialLine = { ...l };
    delete copy.hd_product_url;
    delete copy.hd_title;
    delete copy.hd_unit_price_usd;
    delete copy.hd_price_raw;
    delete copy.hd_price_was_usd;
    delete copy.hd_percentage_off;
    delete copy.hd_price_badge;
    delete copy.hd_product_id;
    delete copy.hd_fetched_at;
    delete copy.hd_image_url;
    applyRetailShelfFromLowest(copy);
    copy.mockup_include =
      lineShouldAutoEnableMockupInclude(copy) && l.mockup_include !== false ? true : false;
    return copy;
  });

  const save = await updateBidQuoteLines(id, next);
  if ("error" in save) {
    return { error: save.error };
  }

  return { success: true as const };
}

export async function clearBidLineLowesRef(
  bidId: string,
  lineId: string,
): Promise<{ error: string } | { success: true }> {
  const id = bidId.trim();
  const lid = lineId.trim();
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select("material_estimate")
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  const next = lines.map((l) => {
    if (l.line_id !== lid) return l;
    const copy: BidMaterialLine = { ...l };
    delete copy.lw_product_url;
    delete copy.lw_title;
    delete copy.lw_unit_price_usd;
    delete copy.lw_price_raw;
    delete copy.lw_price_was_usd;
    delete copy.lw_percentage_off;
    delete copy.lw_price_badge;
    delete copy.lw_product_id;
    delete copy.lw_fetched_at;
    delete copy.lw_image_url;
    applyRetailShelfFromLowest(copy);
    copy.mockup_include =
      lineShouldAutoEnableMockupInclude(copy) && l.mockup_include !== false ? true : false;
    return copy;
  });

  const save = await updateBidQuoteLines(id, next);
  if ("error" in save) {
    return { error: save.error };
  }

  return { success: true as const };
}

export async function substituteBidLineHomeDepotFromUrl(
  bidId: string,
  lineId: string,
  url: string,
): Promise<{ error: string } | { success: true }> {
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    return { error: "Set SERPAPI_API_KEY to fetch Home Depot product details." };
  }

  const id = bidId.trim();
  const lid = lineId.trim();
  const rawUrl = url.trim();
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }
  if (!rawUrl) {
    return { error: "Paste a Home Depot product URL." };
  }

  const pid = extractHomedepotProductIdFromUrl(rawUrl);
  if (!pid) {
    return {
      error:
        "Could not read a product ID from that URL. Paste a product page link from homedepot.com (path ending in digits, e.g. …/p/…/#########).",
    };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select("material_estimate, site_postal_code")
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  if (!lines.some((l) => l.line_id === lid)) {
    return { error: "Line not found." };
  }

  const zipFromBid = normalizeUsZipForHd(
    (bidRow as { site_postal_code?: string | null } | null)?.site_postal_code,
  );
  const zipFromEnv = normalizeUsZipForHd(process.env.SERPAPI_HOME_DEPOT_ZIP);
  const deliveryZip = zipFromBid ?? zipFromEnv;
  const zipOpt = deliveryZip ? { deliveryZip } : undefined;

  let hit;
  try {
    hit = await fetchHomeDepotProductByProductId(pid, zipOpt);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message.slice(0, 200) : "Could not load product.",
    };
  }

  if (!hit?.image_url?.trim()) {
    return {
      error:
        "Could not load a valid product page with image for that item. Try another Home Depot product URL.",
    };
  }

  const next = lines.map((l) => {
    if (l.line_id !== lid) return l;
    const merged: BidMaterialLine = stripLowesRetailFields({ ...l });
    mergeHomeDepotSearchHitIntoLine(merged, hit);
    merged.hd_product_id = hit.product_id ?? pid;
    applyShelfPriceFromChosenRetailer(merged, "home_depot");
    return merged;
  });

  const save = await updateBidQuoteLines(id, next);
  if ("error" in save) {
    return { error: save.error };
  }

  return { success: true as const };
}

/**
 * Re-runs Home Depot search for one line using free-text instructions (e.g. different size/finish).
 * Requires an existing HD link on the line; replaces shelf price and product metadata with the new hit.
 */
export async function replaceBidLineHomeDepotFromPrompt(
  bidId: string,
  lineId: string,
  userPrompt: string,
  options?: { preferSale?: boolean },
): Promise<{ error: string } | { success: true }> {
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    return { error: "Set SERPAPI_API_KEY to search Home Depot." };
  }

  const id = bidId.trim();
  const lid = lineId.trim();
  const promptRaw = userPrompt.trim().slice(0, 500);
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }
  if (!promptRaw) {
    return { error: "Describe what product you are looking for." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select(
      "material_estimate, site_postal_code, title, scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire",
    )
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  const line = lines.find((l) => l.line_id === lid);
  if (!line) {
    return { error: "Line not found." };
  }
  if (!line.hd_product_url?.trim()) {
    return { error: "This line has no Home Depot product to replace." };
  }

  const replBeforeUrls = await signedBeforePhotoUrlsForBid(supabase, id, 4);
  let replLineRefMap: Record<string, string> = {};
  try {
    replLineRefMap = await buildLineReferenceUrlMap(supabase, lines);
  } catch {
    replLineRefMap = {};
  }
  const replQuoteSummary = buildQuoteLinesSummaryForRetailAi(lines);

  const retailTrade = refineMaterialTradeFromLineName(
    line.name,
    (line.trade ?? "general") as BidMaterialTrade,
  );
  const lineForRetail: BidMaterialLine = { ...line };
  if (retailTrade === "general") delete lineForRetail.trade;
  else lineForRetail.trade = retailTrade;

  const bidMeta = bidRow as {
    site_postal_code?: string | null;
    title?: string | null;
    scope_description?: string | null;
    project_kind?: string | null;
    walkthrough_transcript?: string | null;
    room_measurements?: unknown;
    project_questionnaire?: unknown;
  } | null;

  const jobContext = buildCompositeScopeDescription({
    scope_description: String(bidMeta?.scope_description ?? ""),
    project_kind: bidMeta?.project_kind?.trim() || undefined,
    walkthrough_transcript: bidMeta?.walkthrough_transcript?.trim() || undefined,
    room_measurements: bidMeta?.room_measurements,
    project_questionnaire: bidMeta?.project_questionnaire,
  });
  const bidTitle = String(bidMeta?.title ?? "").trim() || "Bid";
  const vanityRunInches = mergeVanityRunWidthInchesForRetail(
    extractVanityCabinetRunWidthInchesFromJobContext(jobContext),
    extractMinVanityCabinetWidthInchesFromRetailText(promptRaw),
  );
  const enhanceOpts =
    vanityRunInches != null ? { vanityRunWidthInches: vanityRunInches } : undefined;

  const zipFromBid = normalizeUsZipForHd(bidMeta?.site_postal_code);
  const zipFromEnv = normalizeUsZipForHd(process.env.SERPAPI_HOME_DEPOT_ZIP);
  const deliveryZip = zipFromBid ?? zipFromEnv;
  const zipOpt = deliveryZip ? { deliveryZip } : undefined;
  const preferSale = options?.preferSale === true;

  let q = "";
  try {
    const lineRefUrl = lineForRetail.line_id ? replLineRefMap[lineForRetail.line_id] : undefined;
    const suggestion = await suggestHomeDepotSearchOrSkip({
      apiKey: process.env.OPENAI_API_KEY,
      jobContext,
      bidTitle,
      line: {
        name: lineForRetail.name,
        notes: lineForRetail.notes,
        trade: lineForRetail.trade,
      },
      replacementInstructions: promptRaw,
      beforePhotoUrls: replBeforeUrls.length > 0 ? replBeforeUrls : undefined,
      lineReferenceImageUrl: lineRefUrl ?? undefined,
      quoteLinesSummary: replQuoteSummary,
    });
    if (!suggestion.skip && suggestion.searchQuery?.trim()) {
      q = enhanceRetailSearchQuery(suggestion.searchQuery.trim(), lineForRetail, enhanceOpts);
    }
  } catch {
    /* use fallback query */
  }
  if (!q.trim()) {
    q = buildFallbackSearchQuery(jobContext, lineForRetail, promptRaw, vanityRunInches);
  }
  if (!q.trim()) {
    q = buildLineSearchQuery(lineForRetail);
  }
  if (!q.trim()) {
    return { error: "Could not build a search from that line and your request." };
  }

  const excludeHdIds: string[] = [];
  if (line.hd_product_id) {
    const d = String(line.hd_product_id).replace(/\D/g, "");
    if (d.length >= 6 && d.length <= 12) excludeHdIds.push(d);
  }
  const hdUrl = line.hd_product_url?.trim();
  if (hdUrl) {
    const pid = extractHomedepotProductIdFromUrl(hdUrl);
    if (pid) excludeHdIds.push(pid);
  }
  for (const l of lines) {
    if (l.line_id === lid) continue;
    const d = normalizeRetailSkuDigits(l.hd_product_id);
    if (d) excludeHdIds.push(d);
  }
  const excludeHdUnique = [...new Set(excludeHdIds)].filter((id) => id.length >= 6 && id.length <= 12);

  let hit: HomeDepotSearchHit | null;
  try {
    const found = await searchHomeDepotProduct(q, {
      ...zipOpt,
      preferSale,
      line: {
        name: lineForRetail.name,
        notes: lineForRetail.notes,
        trade: lineForRetail.trade,
      },
      ...(excludeHdUnique.length > 0 ? { excludeProductIds: excludeHdUnique } : {}),
      ...vanityWidthSerpOptionsForLine(lineForRetail, vanityRunInches, jobContext),
      ...showerBaseSerpOptionsForLine(lineForRetail, jobContext),
    });
    hit = found ? await verifyHomeDepotSearchHitForProductLink(found, zipOpt) : null;
  } catch (e) {
    return {
      error: e instanceof Error ? e.message.slice(0, 200) : "Home Depot search failed.",
    };
  }

  if (!hit) {
    return {
      error:
        "No verified Home Depot product with image matched. Try a more specific prompt — e.g. width in inches, single vs double bowl, finish — or paste a product URL with Substitute.",
    };
  }

  const next = lines.map((l) => {
    if (l.line_id !== lid) return l;
    const merged: BidMaterialLine = stripLowesRetailFields({ ...l });
    if (retailTrade !== ((l.trade ?? "general") as BidMaterialTrade)) {
      if (retailTrade === "general") delete merged.trade;
      else merged.trade = retailTrade;
    }
    mergeHomeDepotSearchHitIntoLine(merged, hit);
    adjustShowerTileQuantityAfterRetailAttach({
      line: merged,
      jobContext,
      productTitle: hit.title,
    });
    maybeAppendVanityStockNote(merged, vanityRunInches);
    applyShelfPriceFromChosenRetailer(merged, "home_depot");
    return merged;
  });

  const save = await updateBidQuoteLines(id, next);
  if ("error" in save) {
    return { error: save.error };
  }

  return { success: true as const };
}

export async function substituteBidLineLowesFromUrl(
  bidId: string,
  lineId: string,
  url: string,
): Promise<{ error: string } | { success: true }> {
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    return { error: "Set SERPAPI_API_KEY to search Lowe's." };
  }

  const id = bidId.trim();
  const lid = lineId.trim();
  const rawUrl = url.trim();
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }
  if (!rawUrl) {
    return { error: "Paste a Lowe's product URL." };
  }
  if (!/lowes\.com/i.test(rawUrl)) {
    return { error: "Paste a product link from lowes.com (e.g. …/pd/…/########)." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select("material_estimate")
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  if (!lines.some((l) => l.line_id === lid)) {
    return { error: "Line not found." };
  }

  let hit: LowesSearchHit | null;
  try {
    hit = await fetchLowesProductFromUrl(rawUrl);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message.slice(0, 200) : "Could not load product.",
    };
  }

  if (!hit) {
    return {
      error:
        "Could not load price for that Lowe's listing. Try another URL or use Replace with a search prompt.",
    };
  }

  const next = lines.map((l) => {
    if (l.line_id !== lid) return l;
    const merged: BidMaterialLine = stripHomeDepotRetailFields({ ...l });
    mergeLowesSearchHitIntoLine(merged, hit);
    applyShelfPriceFromChosenRetailer(merged, "lowes");
    return merged;
  });

  const save = await updateBidQuoteLines(id, next);
  if ("error" in save) {
    return { error: save.error };
  }

  return { success: true as const };
}

export async function replaceBidLineLowesFromPrompt(
  bidId: string,
  lineId: string,
  userPrompt: string,
  options?: { preferSale?: boolean },
): Promise<{ error: string } | { success: true }> {
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    return { error: "Set SERPAPI_API_KEY to search Lowe's." };
  }

  const id = bidId.trim();
  const lid = lineId.trim();
  const promptRaw = userPrompt.trim().slice(0, 500);
  if (!id || !lid) {
    return { error: "Missing estimate or line." };
  }
  if (!promptRaw) {
    return { error: "Describe what product you are looking for." };
  }

  const supabase = await createClient();
  const own = await assertOwnBid(supabase, id);
  if (!own) {
    return { error: "Estimate not found." };
  }

  const { data: bidRow } = await supabase
    .from("bids")
    .select(
      "material_estimate, site_postal_code, title, scope_description, project_kind, walkthrough_transcript, room_measurements, project_questionnaire",
    )
    .eq("id", id)
    .maybeSingle();

  const lines = parseMaterialEstimate(bidRow?.material_estimate);
  const line = lines.find((l) => l.line_id === lid);
  if (!line) {
    return { error: "Line not found." };
  }
  if (!line.lw_product_url?.trim()) {
    return { error: "This line has no Lowe's product to replace." };
  }

  const lwReplBeforeUrls = await signedBeforePhotoUrlsForBid(supabase, id, 4);
  let lwReplLineRefMap: Record<string, string> = {};
  try {
    lwReplLineRefMap = await buildLineReferenceUrlMap(supabase, lines);
  } catch {
    lwReplLineRefMap = {};
  }
  const lwReplQuoteSummary = buildQuoteLinesSummaryForRetailAi(lines);

  const retailTrade = refineMaterialTradeFromLineName(
    line.name,
    (line.trade ?? "general") as BidMaterialTrade,
  );
  const lineForRetail: BidMaterialLine = { ...line };
  if (retailTrade === "general") delete lineForRetail.trade;
  else lineForRetail.trade = retailTrade;

  const bidMeta = bidRow as {
    site_postal_code?: string | null;
    title?: string | null;
    scope_description?: string | null;
    project_kind?: string | null;
    walkthrough_transcript?: string | null;
    room_measurements?: unknown;
    project_questionnaire?: unknown;
  } | null;

  const jobContext = buildCompositeScopeDescription({
    scope_description: String(bidMeta?.scope_description ?? ""),
    project_kind: bidMeta?.project_kind?.trim() || undefined,
    walkthrough_transcript: bidMeta?.walkthrough_transcript?.trim() || undefined,
    room_measurements: bidMeta?.room_measurements,
    project_questionnaire: bidMeta?.project_questionnaire,
  });
  const bidTitle = String(bidMeta?.title ?? "").trim() || "Bid";
  const vanityRunInches = mergeVanityRunWidthInchesForRetail(
    extractVanityCabinetRunWidthInchesFromJobContext(jobContext),
    extractMinVanityCabinetWidthInchesFromRetailText(promptRaw),
  );
  const enhanceOpts =
    vanityRunInches != null ? { vanityRunWidthInches: vanityRunInches } : undefined;

  let q = "";
  try {
    const lineRefUrl = lineForRetail.line_id ? lwReplLineRefMap[lineForRetail.line_id] : undefined;
    const suggestion = await suggestHomeDepotSearchOrSkip({
      apiKey: process.env.OPENAI_API_KEY,
      jobContext,
      bidTitle,
      line: {
        name: lineForRetail.name,
        notes: lineForRetail.notes,
        trade: lineForRetail.trade,
      },
      replacementInstructions: promptRaw,
      beforePhotoUrls: lwReplBeforeUrls.length > 0 ? lwReplBeforeUrls : undefined,
      lineReferenceImageUrl: lineRefUrl ?? undefined,
      quoteLinesSummary: lwReplQuoteSummary,
    });
    if (!suggestion.skip && suggestion.searchQuery?.trim()) {
      q = enhanceRetailSearchQuery(suggestion.searchQuery.trim(), lineForRetail, enhanceOpts);
    }
  } catch {
    /* use fallback query */
  }
  if (!q.trim()) {
    q = buildFallbackSearchQuery(jobContext, lineForRetail, promptRaw, vanityRunInches);
  }
  if (!q.trim()) {
    q = buildLineSearchQuery(lineForRetail);
  }
  if (!q.trim()) {
    return { error: "Could not build a search from that line and your request." };
  }

  const preferSale = options?.preferSale === true;

  const excludeLwIds: string[] = [];
  if (line.lw_product_id) {
    const d = String(line.lw_product_id).replace(/\D/g, "");
    if (d.length >= 6 && d.length <= 12) excludeLwIds.push(d);
  }
  const lwUrl = line.lw_product_url?.trim();
  if (lwUrl) {
    const pid = extractLowesProductIdFromUrl(lwUrl);
    if (pid) excludeLwIds.push(pid);
  }
  for (const l of lines) {
    if (l.line_id === lid) continue;
    const d = normalizeRetailSkuDigits(l.lw_product_id);
    if (d) excludeLwIds.push(d);
  }
  const excludeLwUnique = [...new Set(excludeLwIds)].filter((id) => id.length >= 6 && id.length <= 12);

  let hit: LowesSearchHit | null;
  try {
    hit = await searchLowesProduct(q, {
      preferSale,
      line: {
        name: lineForRetail.name,
        notes: lineForRetail.notes,
        trade: lineForRetail.trade,
      },
      ...(excludeLwUnique.length > 0 ? { excludeProductIds: excludeLwUnique } : {}),
      ...vanityWidthSerpOptionsForLine(lineForRetail, vanityRunInches, jobContext),
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message.slice(0, 200) : "Lowe's search failed.",
    };
  }

  if (!hit) {
    return {
      error:
        "No different Lowe's product matched (search may have only returned the same SKU). Try a more specific prompt or paste a lowes.com URL.",
    };
  }

  const next = lines.map((l) => {
    if (l.line_id !== lid) return l;
    const merged: BidMaterialLine = stripHomeDepotRetailFields({ ...l });
    if (retailTrade !== ((l.trade ?? "general") as BidMaterialTrade)) {
      if (retailTrade === "general") delete merged.trade;
      else merged.trade = retailTrade;
    }
    mergeLowesSearchHitIntoLine(merged, hit);
    adjustShowerTileQuantityAfterRetailAttach({
      line: merged,
      jobContext,
      productTitle: hit.title,
    });
    maybeAppendVanityStockNote(merged, vanityRunInches);
    applyShelfPriceFromChosenRetailer(merged, "lowes");
    return merged;
  });

  const save = await updateBidQuoteLines(id, next);
  if ("error" in save) {
    return { error: save.error };
  }

  return { success: true as const };
}
