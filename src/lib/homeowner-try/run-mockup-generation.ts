import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { parseMaterialEstimate } from "@/lib/data/bids";
import { lineHasMockupVisualReference, sortQuoteLinesForMockupProductRefs } from "@/lib/bid-mockup";
import {
  bufferToArrayBuffer,
  bufferToDataUrl,
  normalizeImageBufferForDisplay,
  resizeBufferForMockupModelIfLarge,
  resizeBufferForOpenAiVisionIfLarge,
} from "@/lib/images/normalize-image-exif";
import type { BidMaterialLine } from "@/types/bid";
import {
  appendMockupLayoutFooter,
  buildImageEditPrompt,
  buildStrictRemodelEditPrompt,
  fetchFallbackConceptImage,
  fetchMaterialsAndSummaryFromOpenAI,
  fetchRoomRemodelImageEdit,
  formatQuoteLinesForImageEdit,
  formatFullQuoteLinesForMockupEstimateContext,
  roomAnalysisSuggestsWeakFixtureGeometry,
  mergeMaterialsPreservingRefs,
  sanitizeRemodelEditPromptForMockupImage,
  sanitizeRoomAnalysisForMockupImage,
  getImageEditSpatialLock,
  getRemodelLayoutGuard,
  scopeMentionsToiletWork,
  SURFACE_ARCHITECTURE_HARDWARE_LOCK,
  ADDITIONAL_ONLY_ZERO_DRIFT,
  INCREMENTAL_SURGICAL_EDIT,
  LATEST_MOCKUP_AS_BASELINE,
  MINIMAL_CHANGE_PROTOCOL,
  OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX,
} from "@/lib/ai/openai-bid";
import {
  isOpenAiFallbackOnVertexAuthErrorEnabled,
  isOpenAiFallbackOnVertexQuotaEnabled,
  isOpenAiFallbackOnVertexTimeoutEnabled,
  googleCloudProjectId,
  isVertexGoogleUserAuthFailureMessage,
  isVertexResourceExhaustedMessage,
  isVertexMockupTimeoutMessage,
  resolveMockupImageProvider,
  vertexGeminiImageModel,
  vertexLocation,
  type MockupImageProviderId,
} from "@/lib/ai/mockup-image-provider";
import { fetchRoomRemodelImageEditVertexGemini } from "@/lib/ai/vertex-gemini-image-edit";
import {
  getHomeownerTryProjectById,
  listMockupsForHomeownerProject,
  updateHomeownerTryProjectAi,
} from "@/lib/homeowner-try/repository";
import type { BathroomStyleId } from "@/lib/homeowner-try/bathroom-styles";
import { buildVertexBoldModernTryImageEditPrompt } from "@/lib/homeowner-try/bold-modern-mockup-prompt";
import { buildVertexCleanRefreshTryImageEditPrompt } from "@/lib/homeowner-try/clean-refresh-mockup-prompt";
import {
  buildVertexLuxuryEscapeTryImageEditPrompt,
  LUXURY_ESCAPE_OPENAI_MIRROR_REFLECTION_ANALYSIS,
} from "@/lib/homeowner-try/luxury-escape-mockup-prompt";
import type { TruncateMockupLayoutOpts } from "@/lib/ai/mockup-prompt-truncate";
import {
  buildLuxuryOpenAiPreReinforcementBlock,
  generateLuxuryOpenAiStrictImagePrompt,
  LUXURY_OPENAI_APPENDED_GEOMETRY_LOCK,
  LUXURY_OPENAI_FINISH_COMPOSITION_MANDATE,
  LUXURY_OPENAI_SPATIAL_ANCHOR_PROTOCOL,
  LUXURY_OPENAI_TRAILING_GEOMETRY_ENFORCEMENT,
} from "@/lib/homeowner-try/luxury-openai-strict-image-prompt";
import { buildVertexWarmMinimalistTryImageEditPrompt } from "@/lib/homeowner-try/warm-minimalist-mockup-prompt";
import { buildVertexSpaRetreatTryImageEditPrompt } from "@/lib/homeowner-try/spa-retreat-mockup-prompt";
import { buildVertexCoastalBeachHouseTryImageEditPrompt } from "@/lib/homeowner-try/coastal-beach-house-mockup-prompt";

const RENOVISION_HOMEOWNER_COMPANY = "Renovision";

/** Matches `composeTweakFirstPrompt` in `homeowner-try.ts` — text before this marker is pure homeowner tweak directives. */
const STYLE_BASELINE_MARKER = "\n\nSTYLE BASELINE (apply after the tweak instructions above):";

/**
 * Extracts homeowner tweak bullets / custom block before the duplicated style baseline so we can
 * prepend them again at the top of Vertex prompts (otherwise long style bibles bury tweaks at the end).
 */
function extractHomeownerTweakPriorityHead(fullAdditionalPrompt: string): string {
  const t = fullAdditionalPrompt.trim();
  if (!t) return "";
  const idx = t.indexOf(STYLE_BASELINE_MARKER);
  const head = idx === -1 ? t : t.slice(0, idx).trim();
  return head.slice(0, 4500);
}

function slimEnforcedAdditionalForLuxuryOpenAiStrict(enforced: string): string {
  return enforced
    .replace(BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS, "")
    .replace(BATHROOM_VISIBILITY_LIGHTING_GUARDRAILS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function prependTweakPriorityLayerToImagePrompt(
  prompt: string,
  opts: {
    regenerateFromRoom: boolean;
    rawAdditionalPrompt: string;
    /** Smaller head keeps vision-built luxury geometry in the preserved start of truncated prompts. */
    maxTweakHeadChars?: number;
  },
): string {
  if (opts.regenerateFromRoom) return prompt;
  const rawHead = extractHomeownerTweakPriorityHead(opts.rawAdditionalPrompt);
  const cap = opts.maxTweakHeadChars ?? 4500;
  const head = cap > 0 ? rawHead.slice(0, cap) : rawHead;
  if (!head) return prompt;
  return [
    "════ PRIORITY — HOMEOWNER TWEAKS (READ AND APPLY FIRST) ════",
    "You are editing the attached bathroom image (often a prior mockup). The homeowner requested the changes below for THIS run only.",
    "Implement them as visible differences versus the input image. Where these lines conflict with generic preservation wording later in this prompt, follow these lines for the zones and fixtures they name (keep the same room footprint and camera unless wet-zone remodel text explicitly allows enclosure changes).",
    "A tweak run that looks identical to the input is invalid when this section lists concrete finish or fixture requests.",
    "",
    head,
    "",
    "════ END PRIORITY TWEAKS — STYLE / SCOPE / MODEL CONTEXT FOLLOWS ════",
    "",
    prompt,
  ].join("\n");
}

const BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS = [
  "Analyze the bathroom image first before editing. Identify walls, openings, major fixture zones, and reflective surfaces.",
  "Hard rule: do not remove, move, or invent walls, doors, windows, ceiling lines, or room boundaries. Keep original architecture, floorplan, and camera perspective locked.",
  "Keep the same camera field-of-view and framing breadth; do not zoom in or crop tighter than the source.",
  "Preserve room depth cues (foreground/background relationships, visible floor/wall depth) from the source image.",
  "ROOM SIZE MATCH (NON-NEGOTIABLE): The output must match the source photo's perceived interior envelope — same apparent wall-to-wall spans, door/window opening widths in frame, ceiling height cues, and floor visible area. Do not make the room feel deeper, shallower, wider, or taller than the source.",
  "Fixture or finish edits must not change architectural scale: wall planes, grout lines, door frames, and corner angles should occupy the same proportions of the frame as in the source.",
  "If fixture size changes are requested, apply them only as local edits within the existing footprint so the room still reads the same size as the before photo.",
  "If fixture visibility is partial or uncertain, preserve the fixture footprint instead of deleting it.",
  "If a fixture is partially cropped by the photo edge, keep that partial crop context; do not zoom out/reframe to fully reveal it.",
  "Treat mirrors and reflections as spatial evidence. If a shower/tub appears mainly in a mirror reflection, keep that shower/tub present in the final full-scene remodel.",
  "Edits are finish-level only unless a fixture is clearly visible in the original scene.",
  "Do not redesign the room layout. Do not expand or shrink the room. Keep all plumbing zones in their original positions.",
  "Prefer replacing materials and fixture styles over changing physical structure.",
].join(" ");

const BATHROOM_VISIBILITY_LIGHTING_GUARDRAILS = [
  "VISIBILITY / LIGHTING (NON-NEGOTIABLE): Keep the bathroom clearly visible and properly exposed.",
  "Do not produce a dark, underexposed, or heavy-shadow image where fixtures/finishes are hard to see.",
  "Maintain realistic ambient + fixture lighting so walls, vanity, shower area, and floor remain readable.",
  "If using dark materials or bold contrast, balance with brighter lighting and midtone detail retention.",
].join(" ");

/** Appended after scene guardrails when wet-zone intent is set — neutralizes finish-only / preserve-footprint lines for tub→shower. */
const BATHROOM_SCENE_WET_ZONE_APPEND = [
  "WET-ZONE REMODEL (SUPERSEDES CONFLICTING LINES IN THE STRUCTURE GUARDRAILS ABOVE FOR THE WET ZONE ONLY):",
  "When the homeowner asked to remove the tub and/or add a walk-in or shower, you MUST apply that in the wet zone within the same outer walls — removing the tub and showing a shower is required, not optional.",
  "Ignore ‘finish-level only’, ‘preserve fixture footprint instead of deleting’, and ‘keep shower/tub in reflections’ where they conflict with explicit tub removal or walk-in shower instructions.",
  "Toilet, vanity, and dry areas: keep as in the source unless the prompt names them.",
].join("\n");

const BATHROOM_FIXTURE_PRESERVATION_LOCK = [
  "NON-NEGOTIABLE PRESERVATION RULES:",
  "1) Keep every existing wall and subwall/pony wall exactly where it is.",
  "2) Keep toilet present and visible in the remodeled scene. Never remove or hide the toilet.",
  "3) Keep shower/tub zone present even when seen mostly via mirror reflection or partial framing.",
  "4) Keep vanity/sink footprint in the same location.",
  "5) Do not crop or reframe to hide existing fixtures.",
  "If uncertain, preserve the original fixture and wall geometry.",
].join("\n");

/** OpenAI fallback path: tub/shower may change when homeowner requested wet-zone remodel. */
const BATHROOM_FIXTURE_PRESERVATION_LOCK_WET_ZONE = [
  "NON-NEGOTIABLE PRESERVATION RULES (wet-zone remodel run):",
  "1) Keep every existing wall and subwall/pony wall exactly where it is.",
  "2) Keep toilet present and visible in the remodeled scene. Never remove or hide the toilet.",
  "3) Wet zone: tub may be removed and replaced with a shower / walk-in enclosure when requested; keep the same general plumbing corner / alcove.",
  "4) Keep vanity/sink footprint in the same location.",
  "5) Do not crop or reframe to hide existing fixtures.",
  "If uncertain outside the wet zone, preserve the original fixture and wall geometry.",
].join("\n");

const MOCKUP_ONLY_REMODEL_EDIT_PROMPT = [
  "Apply the saved scope and quote as finish and material updates only (tile, paint, grout color, trim, lighting character, fixture styles) where those elements already appear in the photo.",
  "Do not change where visible fixtures sit (shower/tub, vanity/sink, etc.). Do not add fixtures that are not shown in the photo. The room layout must match the source photo.",
  "Fixture size may change only when explicitly requested by homeowner tweaks (for example: wider vanity), while staying on the same wall/plumbing zone and preserving camera framing.",
  "Preserve all mirror and glass geometry. You may restyle existing shower door/glass finish details (frame finish, handle finish, glass tint/frost level) to match the selected theme, but keep identical footprint, opening width, and panel/door placement.",
  BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS,
].join(" ");

/** Used when homeowner prompt signals tub/shower remodel — avoids contradicting walk-in / curbless requests. */
const MOCKUP_ONLY_REMODEL_EDIT_PROMPT_WET_ZONE = [
  "Apply the saved scope and quote as finish and material updates where those elements already appear in the photo.",
  "WET-ZONE REMODEL (THIS RUN): The homeowner requested a tub/shower / enclosure change. Visibly update the wet-zone enclosure, curb, pan, glass layout, and walk-in opening within the existing wet footprint — same outer bathroom walls, same camera, same room size read as the source. A no-op wet zone is invalid.",
  "Keep toilet, vanity, and dry areas matching the source unless the prompt explicitly asks to change them.",
  "Fixture size may change only when explicitly requested by homeowner tweaks (for example: wider vanity), while staying on the same wall/plumbing zone and preserving camera framing.",
  "Outside the wet zone: preserve mirror placement and room-scale geometry. For tub/shower glass: restyle and **reconfigure** opening/panels/curb as needed to match the wet-zone request.",
  BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS,
].join(" ");

export async function runHomeownerTryMockupGeneration(params: {
  projectId: string;
  /** Drives style-specific Vertex image-edit prompt packaging (spa, bold, luxury, clean refresh, warm minimalist). */
  selectedStyle?: BathroomStyleId;
  additionalPrompt: string;
  regenerateFromRoom: boolean;
  refineFromMockupId: string | null;
  requireVertex?: boolean;
  /** When true, mockup-only remodel prompt allows wet-zone enclosure changes (walk-in, curbless, etc.). */
  wetZoneRemodelIntent?: boolean;
  /** Skip Vertex and run OpenAI image edit using the same assembled prompt text as Vertex (`editPromptVertex`) for side-by-side comparison. */
  forceOpenAiComparison?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKeyRaw = process.env.OPENAI_API_KEY?.trim();
  if (!apiKeyRaw) {
    return {
      ok: false,
      message:
        "Add OPENAI_API_KEY to your environment (server-side only) to generate previews.",
    };
  }
  const apiKey = apiKeyRaw;

  const projectId = params.projectId.trim();
  /** Full tweak text for extraction / priority layer; enforced payload capped below so guardrails always attach. */
  const rawAdditionalPrompt = params.additionalPrompt.trim();
  const additionalPrompt = rawAdditionalPrompt.slice(0, 10000);
  const noOpGuard =
    !params.regenerateFromRoom
      ? [
          params.wetZoneRemodelIntent
            ? "TWEAK RUN (NO-OP FORBIDDEN): The new image must show a clearly visible change in the tub/shower / wet zone when that was requested, plus any other authorized differences vs the source mockup."
            : "TWEAK RUN (NO-OP FORBIDDEN): The new image must show visible finish-level differences from the source mockup.",
          "SURGICAL: Only change what the prompt explicitly authorizes; do not restyle unrelated areas of the room.",
          "If instructions mention an item (e.g., larger mirror, fixture finish, tile/palette), ensure that item is visibly changed in the final output.",
          "When a requested item is partially cut off in the source framing, apply the size/style change in place without zooming out.",
          "Do not return an unchanged or near-identical image.",
        ].join("\n")
      : "";
  const enforcedAdditionalPrompt = [
    additionalPrompt,
    noOpGuard,
    BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS,
    params.wetZoneRemodelIntent ? BATHROOM_SCENE_WET_ZONE_APPEND : "",
    BATHROOM_VISIBILITY_LIGHTING_GUARDRAILS,
  ]
    .filter(Boolean)
    .join("\n\n");
  const supabase = createServiceClient();

  const project = await getHomeownerTryProjectById(projectId);
  if (!project) {
    return { ok: false, message: "Preview project not found." };
  }

  await updateHomeownerTryProjectAi(projectId, {
    ai_status: "pending",
    ai_last_error: null,
  });

  try {
    const mockupImageProvider = resolveMockupImageProvider();

    const existingQuote = parseMaterialEstimate(project.material_estimate);
    const hasSavedQuote = existingQuote.some((l) => l.name.trim().length > 0);

    const mockupRows = await listMockupsForHomeownerProject(projectId);
    let maxNumericGen = 0;
    for (const row of mockupRows) {
      const g = row.mockup_generation != null ? Number(row.mockup_generation) : 0;
      if (Number.isFinite(g) && g > maxNumericGen) maxNumericGen = g;
    }
    const priorMockupCount = mockupRows.length;
    const nextMockupGen = Math.max(maxNumericGen, priorMockupCount) + 1;

    const beforePath = String(project.before_storage_path ?? "");
    if (!beforePath) {
      throw new Error("Missing room photo.");
    }

    const beforeDl = await supabase.storage.from(PHOTOS_BUCKET).download(beforePath);
    if (beforeDl.error || !beforeDl.data) {
      throw new Error("Could not read your room photo.");
    }
    const beforeRaw = Buffer.from(await beforeDl.data.arrayBuffer());
    const beforeNorm = await normalizeImageBufferForDisplay(beforeRaw, "image/jpeg");
    const beforeForVision = await resizeBufferForOpenAiVisionIfLarge(beforeNorm.buffer, beforeNorm.contentType);
    const beforeDataUrl = bufferToDataUrl(beforeForVision);

    let latestMockupStoragePath: string | null = null;
    if (mockupRows.length > 0) {
      const sorted = [...mockupRows].sort(
        (a, b) => Number(b.mockup_generation) - Number(a.mockup_generation),
      );
      latestMockupStoragePath = sorted[0]?.storage_path
        ? String(sorted[0].storage_path)
        : null;
    }

    let chosenRefineStoragePath: string | null = null;
    let chosenRefineGeneration: number | null = null;
    if (!params.regenerateFromRoom && params.refineFromMockupId) {
      const { data: refinePick } = await supabase
        .from("homeowner_try_mockups")
        .select("storage_path, mockup_generation")
        .eq("project_id", projectId)
        .eq("id", params.refineFromMockupId)
        .maybeSingle();
      if (refinePick?.storage_path) {
        chosenRefineStoragePath = String(refinePick.storage_path);
        chosenRefineGeneration =
          refinePick.mockup_generation != null ? Number(refinePick.mockup_generation) : null;
      }
    }

    let primaryFetchUrl: string | null = null;
    let imageEditSource: "before" | "latest_mockup" = "before";

    const useLatestMockupFallback =
      !params.regenerateFromRoom &&
      !chosenRefineStoragePath &&
      priorMockupCount > 0 &&
      Boolean(latestMockupStoragePath);

    if (!params.regenerateFromRoom && chosenRefineStoragePath) {
      const { data: signedPick } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(chosenRefineStoragePath, 60 * 30);
      if (signedPick?.signedUrl) {
        primaryFetchUrl = signedPick.signedUrl;
        imageEditSource = "latest_mockup";
      }
    } else if (useLatestMockupFallback && latestMockupStoragePath) {
      const { data: signedLatest } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(latestMockupStoragePath, 60 * 30);
      if (signedLatest?.signedUrl) {
        primaryFetchUrl = signedLatest.signedUrl;
        imageEditSource = "latest_mockup";
      }
    }

    const scopeForAi = String(project.scope_description ?? "").trim();

    const mockupOnly = priorMockupCount > 0 && hasSavedQuote;

    let materialsToSave: BidMaterialLine[];
    let quoteForEdit: BidMaterialLine[];
    let fullSummary: string;
    let roomAnalysis: string;
    let remodelEditPrompt: string;

    if (mockupOnly) {
      materialsToSave = existingQuote;
      quoteForEdit = existingQuote;
      const priorSummary = String(project.ai_summary ?? "").trim();
      fullSummary =
        priorSummary ||
        "Planning preview from your saved scope. Mockup generated from the same data.";
      roomAnalysis = "";
      remodelEditPrompt = params.wetZoneRemodelIntent
        ? MOCKUP_ONLY_REMODEL_EDIT_PROMPT_WET_ZONE
        : MOCKUP_ONLY_REMODEL_EDIT_PROMPT;
    } else {
      const vision = await fetchMaterialsAndSummaryFromOpenAI({
        apiKey,
        companyName: RENOVISION_HOMEOWNER_COMPANY,
        scopeDescription: scopeForAi,
        beforeImageUrls: [beforeDataUrl],
        ...(additionalPrompt ? { additionalPrompt } : {}),
        /** Faster OpenAI vision on first `/try` pass (low image detail + lower max_tokens). Set TRY_DISABLE_FAST_HOMEOWNER_VISION=1 to force high detail locally. */
        homeownerTryFastVision: process.env.TRY_DISABLE_FAST_HOMEOWNER_VISION?.trim() !== "1",
      });

      const {
        materials: visionMaterials,
        summary,
        roomAnalysis: ra,
        remodelEditPrompt: rep,
      } = vision;

      roomAnalysis = ra;
      remodelEditPrompt = [rep, BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS]
        .filter(Boolean)
        .join("\n\n");

      const shouldRefreshLineItems = !hasSavedQuote || additionalPrompt.length > 0;
      const materialsMerged = shouldRefreshLineItems
        ? mergeMaterialsPreservingRefs(visionMaterials, existingQuote)
        : existingQuote;
      materialsToSave = shouldRefreshLineItems ? materialsMerged : existingQuote;
      quoteForEdit = shouldRefreshLineItems ? materialsMerged : existingQuote;

      fullSummary = roomAnalysis.trim()
        ? `${summary}\n\n--- Room analysis ---\n${roomAnalysis.trim()}`
        : summary;
    }

    for (const row of materialsToSave) {
      if (!row.line_id?.trim()) {
        row.line_id = randomUUID();
      }
    }

    const quoteForMockupImage = sortQuoteLinesForMockupProductRefs(
      quoteForEdit.filter(
        (l) =>
          l.name.trim().length > 0 &&
          l.mockup_include !== false &&
          lineHasMockupVisualReference(l),
      ),
    );
    const quoteLineContext = formatQuoteLinesForImageEdit(quoteForMockupImage);
    const fullEstimateContext = formatFullQuoteLinesForMockupEstimateContext(
      quoteForEdit.filter((l) => l.name.trim().length > 0),
    );
    const weakRoomGeometry = roomAnalysisSuggestsWeakFixtureGeometry(roomAnalysis);

    let imageBytes: ArrayBuffer;
    let contentType: string;
    if (!primaryFetchUrl) {
      imageBytes = bufferToArrayBuffer(beforeNorm.buffer);
      contentType = beforeNorm.contentType;
    } else {
      const sourceImageRes = await fetch(primaryFetchUrl, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!sourceImageRes.ok) {
        throw new Error("Could not download source image for preview.");
      }
      const rawBuf = Buffer.from(await sourceImageRes.arrayBuffer());
      const headerCt =
        sourceImageRes.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
      const normalized = await normalizeImageBufferForDisplay(rawBuf, headerCt);
      imageBytes = bufferToArrayBuffer(normalized.buffer);
      contentType = normalized.contentType;
    }
    const maxBytes = 20 * 1024 * 1024;
    if (imageBytes.byteLength > maxBytes) {
      throw new Error("Source image is too large (max ~20 MB).");
    }

    const mimeForDataUrl = contentType.split(";")[0]?.trim() || "image/jpeg";
    const sourceDataUrlForOpenAiLuxury = `data:${mimeForDataUrl};base64,${Buffer.from(new Uint8Array(imageBytes)).toString("base64")}`;

    let luxuryOpenAiStrictPrompt: string | null = null;
    if (params.selectedStyle === "luxury_escape" && mockupImageProvider === "openai") {
      try {
        luxuryOpenAiStrictPrompt = (
          await generateLuxuryOpenAiStrictImagePrompt({
            apiKey,
            sourceImageDataUrl: sourceDataUrlForOpenAiLuxury,
          })
        ).trim();
      } catch (e) {
        console.warn("[mockup] Luxury OpenAI strict prompt generation failed:", e);
      }
    }

    const builtEditPrompt = buildImageEditPrompt({
      scopeDescription: scopeForAi,
      roomAnalysis,
      remodelEditPrompt,
      ...(quoteLineContext.trim() ? { quoteLineContext } : {}),
      ...(fullEstimateContext.trim() && !luxuryOpenAiStrictPrompt ? { fullEstimateContext } : {}),
      ...(enforcedAdditionalPrompt
        ? {
            additionalPrompt: luxuryOpenAiStrictPrompt
              ? slimEnforcedAdditionalForLuxuryOpenAiStrict(enforcedAdditionalPrompt)
              : enforcedAdditionalPrompt,
          }
        : {}),
      imageEditSource,
      mockupQuoteLines: quoteForMockupImage,
      ...(weakRoomGeometry ? { weakRoomGeometryEvidence: true } : {}),
      ...(luxuryOpenAiStrictPrompt ? { compactForLuxuryOpenAiStrict: true } : {}),
    });
    let editPromptOpenAi = [
      builtEditPrompt,
      params.wetZoneRemodelIntent ? BATHROOM_FIXTURE_PRESERVATION_LOCK_WET_ZONE : BATHROOM_FIXTURE_PRESERVATION_LOCK,
      BATHROOM_VISIBILITY_LIGHTING_GUARDRAILS,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (luxuryOpenAiStrictPrompt) {
      editPromptOpenAi = [
        "═══ LUXURY REMODEL — STRICT PROMPT FOR THIS PHOTO (generated for OpenAI image edit) ═══",
        luxuryOpenAiStrictPrompt,
        LUXURY_OPENAI_SPATIAL_ANCHOR_PROTOCOL,
        LUXURY_OPENAI_APPENDED_GEOMETRY_LOCK,
        LUXURY_OPENAI_FINISH_COMPOSITION_MANDATE,
        "═══ Contractor / estimate context (reference only — never override geometry above for layout) ═══",
        editPromptOpenAi,
      ].join("\n\n");
    } else if (params.selectedStyle === "luxury_escape") {
      editPromptOpenAi = `${editPromptOpenAi}\n\n${LUXURY_ESCAPE_OPENAI_MIRROR_REFLECTION_ANALYSIS}`;
    }

    {
      const buf = Buffer.from(new Uint8Array(imageBytes));
      const resized = await resizeBufferForMockupModelIfLarge(buf, contentType);
      imageBytes = bufferToArrayBuffer(resized.buffer);
      contentType = resized.contentType;
    }

    let editPromptVertex =
      params.selectedStyle === "spa_retreat"
        ? buildVertexSpaRetreatTryImageEditPrompt({
            scopeDescription: scopeForAi,
            roomAnalysis,
            additionalPrompt: enforcedAdditionalPrompt,
            quoteLineContext,
            remodelEditFromVision: remodelEditPrompt,
            wetZoneRemodelIntent: params.wetZoneRemodelIntent,
          })
        : params.selectedStyle === "bold_modern"
          ? buildVertexBoldModernTryImageEditPrompt({
              scopeDescription: scopeForAi,
              roomAnalysis,
              additionalPrompt: enforcedAdditionalPrompt,
              quoteLineContext,
              remodelEditFromVision: remodelEditPrompt,
              wetZoneRemodelIntent: params.wetZoneRemodelIntent,
            })
          : params.selectedStyle === "luxury_escape"
            ? buildVertexLuxuryEscapeTryImageEditPrompt({
                scopeDescription: scopeForAi,
                roomAnalysis,
                additionalPrompt: enforcedAdditionalPrompt,
                quoteLineContext,
                remodelEditFromVision: remodelEditPrompt,
                wetZoneRemodelIntent: params.wetZoneRemodelIntent,
              })
            : params.selectedStyle === "clean_refresh"
              ? buildVertexCleanRefreshTryImageEditPrompt({
                  scopeDescription: scopeForAi,
                  roomAnalysis,
                  additionalPrompt: enforcedAdditionalPrompt,
                  quoteLineContext,
                  remodelEditFromVision: remodelEditPrompt,
                  wetZoneRemodelIntent: params.wetZoneRemodelIntent,
                })
              : params.selectedStyle === "warm_minimalist"
                ? buildVertexWarmMinimalistTryImageEditPrompt({
                    scopeDescription: scopeForAi,
                    roomAnalysis,
                    additionalPrompt: enforcedAdditionalPrompt,
                    quoteLineContext,
                    remodelEditFromVision: remodelEditPrompt,
                    wetZoneRemodelIntent: params.wetZoneRemodelIntent,
                  })
                : params.selectedStyle === "coastal_beach_house"
                  ? buildVertexCoastalBeachHouseTryImageEditPrompt({
                      scopeDescription: scopeForAi,
                      roomAnalysis,
                      additionalPrompt: enforcedAdditionalPrompt,
                      quoteLineContext,
                      remodelEditFromVision: remodelEditPrompt,
                      wetZoneRemodelIntent: params.wetZoneRemodelIntent,
                    })
                  : editPromptOpenAi;

    editPromptVertex = prependTweakPriorityLayerToImagePrompt(editPromptVertex, {
      regenerateFromRoom: params.regenerateFromRoom,
      rawAdditionalPrompt,
    });
    editPromptOpenAi = prependTweakPriorityLayerToImagePrompt(editPromptOpenAi, {
      regenerateFromRoom: params.regenerateFromRoom,
      rawAdditionalPrompt,
      ...(luxuryOpenAiStrictPrompt ? { maxTweakHeadChars: 2200 } : {}),
    });

    if (luxuryOpenAiStrictPrompt) {
      editPromptOpenAi = `${editPromptOpenAi}\n\n${LUXURY_OPENAI_TRAILING_GEOMETRY_ENFORCEMENT}`;
    }

    const imageEditModel = process.env.OPENAI_IMAGE_EDIT_MODEL?.trim();

    const openAiMockupTruncateOpts: TruncateMockupLayoutOpts | undefined = luxuryOpenAiStrictPrompt
      ? {
          ...(!params.regenerateFromRoom &&
          extractHomeownerTweakPriorityHead(rawAdditionalPrompt).trim()
            ? { homeownerMockupTweak: true as const }
            : {}),
          preLayoutReinforcementBlock: buildLuxuryOpenAiPreReinforcementBlock(luxuryOpenAiStrictPrompt),
        }
      : undefined;

    let png!: ArrayBuffer;
    let usedMockupProvider: MockupImageProviderId = "openai";
    let usedConceptFallback = false;
    /** Prompt bytes actually sent to the image model that succeeded (Vertex vs OpenAI). */
    let resolvedImageEditPrompt = editPromptOpenAi;
    let mockupCaption = `Preview v${nextMockupGen}. AI visualization — verify finishes and layout before hiring a pro.`;
    if (mockupOnly) {
      mockupCaption += " Uses your saved preview scope.";
    }
    if (params.forceOpenAiComparison) {
      mockupCaption +=
        mockupImageProvider === "openai"
          ? " OpenAI image edit using the full OpenAI prompt stack (same as primary OpenAI path — e.g. Luxury photo-generated prompt when applicable)."
          : " OpenAI image edit (same prompt text as Vertex stack — use version picker to compare).";
    }

    if (
      params.requireVertex &&
      !params.forceOpenAiComparison &&
      mockupImageProvider !== "vertex_gemini"
    ) {
      throw new Error(
        "Bathroom mockups in /try require Vertex AI. Remove MOCKUP_IMAGE_PROVIDER=openai and ensure GOOGLE_CLOUD_PROJECT + credentials are configured.",
      );
    }

    async function runOpenAiImageEdit(promptOverride?: string): Promise<ArrayBuffer> {
      return fetchRoomRemodelImageEdit({
        apiKey,
        imageBytes,
        contentType,
        editPrompt: promptOverride ?? editPromptOpenAi,
        model: imageEditModel,
        ...(openAiMockupTruncateOpts ? { mockupTruncateOpts: openAiMockupTruncateOpts } : {}),
      });
    }

    /**
     * Vertex can return transient 429 RESOURCE_EXHAUSTED during bursts.
     * Retry a few times with exponential backoff before surfacing failure.
     */
    async function runVertexImageEditWithQuotaRetry(): Promise<ArrayBuffer> {
      const triesRaw = Number(process.env.TRY_VERTEX_QUOTA_RETRY_ATTEMPTS ?? "");
      const maxAttempts = Number.isFinite(triesRaw)
        ? Math.max(1, Math.min(6, Math.floor(triesRaw)))
        : 5;
      const baseMsRaw = Number(process.env.TRY_VERTEX_QUOTA_RETRY_BASE_MS ?? "");
      const baseMs = Number.isFinite(baseMsRaw)
        ? Math.max(500, Math.min(8_000, Math.floor(baseMsRaw)))
        : 3_000;

      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          return await fetchRoomRemodelImageEditVertexGemini({
            imageBytes,
            contentType,
            editPrompt: editPromptVertex,
            projectId: googleCloudProjectId(),
            location: vertexLocation(),
            model: vertexGeminiImageModel(),
            homeownerMockupTweak: !params.regenerateFromRoom,
          });
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isQuota = isVertexResourceExhaustedMessage(msg);
          if (!isQuota || attempt >= maxAttempts) break;
          const waitMs = Math.min(
            20_000,
            baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 400),
          );
          console.warn(
            `[mockup] Vertex quota retry ${attempt}/${maxAttempts} (waiting ${waitMs}ms):`,
            msg.slice(0, 220),
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Vertex failed"));
    }

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
        enforcedAdditionalPrompt.trim()
          ? [
              "Photorealistic interior remodeling visualization. CONCEPT ONLY.",
              "No people, no text, no logos.",
              getImageEditSpatialLock(toiletScope),
              getRemodelLayoutGuard(toiletScope),
              SURFACE_ARCHITECTURE_HARDWARE_LOCK,
              ADDITIONAL_ONLY_ZERO_DRIFT,
              INCREMENTAL_SURGICAL_EDIT,
              imageEditSource === "latest_mockup" ? LATEST_MOCKUP_AS_BASELINE : "",
              BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS,
              BATHROOM_VISIBILITY_LIGHTING_GUARDRAILS,
              BATHROOM_FIXTURE_PRESERVATION_LOCK,
              strictRemodel,
            ]
              .filter(Boolean)
              .join("\n\n")
          : [
              "Photorealistic interior remodeling visualization. CONCEPT ONLY.",
              "No people, no text, no logos.",
              getImageEditSpatialLock(toiletScope),
              getRemodelLayoutGuard(toiletScope),
              SURFACE_ARCHITECTURE_HARDWARE_LOCK,
              MINIMAL_CHANGE_PROTOCOL,
              "Scope:",
              scopeForAi,
              quoteBits.trim() ? `Selections:\n${quoteBits}` : "",
              "Room / site notes:",
              siteNotesForFallback,
              "Design intent:",
              BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS,
              BATHROOM_VISIBILITY_LIGHTING_GUARDRAILS,
              BATHROOM_FIXTURE_PRESERVATION_LOCK,
              strictRemodel,
            ]
              .filter(Boolean)
              .join("\n\n"),
      );
      resolvedImageEditPrompt = fallbackPrompt;
      png = await fetchFallbackConceptImage({ apiKey, prompt: fallbackPrompt });
      usedConceptFallback = true;
      mockupCaption = `Preview v${nextMockupGen}. Concept image — verify before sharing with pros.`;
    }

    /** When mockups use OpenAI as primary, compare with the same OpenAI stack (includes Luxury strict prompt builder). Otherwise compare Vertex text on OpenAI for A/B. */
    const openAiComparePrompt =
      mockupImageProvider === "openai" ? editPromptOpenAi : editPromptVertex;

    if (params.forceOpenAiComparison && params.requireVertex) {
      throw new Error(
        "Homeowner previews use Vertex only for mockup images. OpenAI comparison mode is not available on /try.",
      );
    }

    if (params.forceOpenAiComparison) {
      try {
        png = await runOpenAiImageEdit(openAiComparePrompt);
        usedMockupProvider = "openai";
        resolvedImageEditPrompt = openAiComparePrompt;
      } catch (openAiCompareErr) {
        const oMsg =
          openAiCompareErr instanceof Error ? openAiCompareErr.message : String(openAiCompareErr);
        console.error("[mockup] OpenAI comparison edit failed (homeowner try):", oMsg);
        await applyOpenAiConceptFallbackAfterPhotoEditFailed();
      }
    } else if (mockupImageProvider === "vertex_gemini") {
      try {
        png = await runVertexImageEditWithQuotaRetry();
        usedMockupProvider = "vertex_gemini";
        resolvedImageEditPrompt = editPromptVertex;
      } catch (vertexErr) {
        const vMsg =
          vertexErr instanceof Error ? vertexErr.message : String(vertexErr);
        console.error("[mockup] Vertex image generation failed (homeowner try):", vMsg);
        let handledRequireVertex = false;
        if (params.requireVertex) {
          handledRequireVertex = true;
          if (isVertexGoogleUserAuthFailureMessage(vMsg)) {
            throw new Error(
              [
                "Vertex user credentials failed (invalid_rapt / invalid_grant).",
                "Run `gcloud auth application-default login` (browser login), then restart your dev server. Some gcloud builds do not support `--update-adc` on this command — the plain login refreshes ADC.",
                "To stop this from recurring: use GOOGLE_APPLICATION_CREDENTIALS with a dedicated service account (Vertex AI User on the project) instead of your personal Google login.",
                "Renovision homeowner previews use Vertex only for mockup images — OpenAI is not used as a fallback here.",
              ].join(" "),
            );
          } else if (isVertexResourceExhaustedMessage(vMsg)) {
            throw new Error(
              [
                "We couldn’t generate this preview right now because the image service is temporarily throttling requests for this project.",
                "We already retried automatically; please try again in about 1–2 minutes.",
                "Your project and settings are saved — you won’t lose progress.",
              ].join(" "),
            );
          } else if (isVertexMockupTimeoutMessage(vMsg)) {
            throw new Error(
              [
                "Vertex mockup image request timed out before returning a picture.",
                "Try again, or set VERTEX_MOCKUP_REQUEST_TIMEOUT_MS=600000 for a longer wait.",
                "Homeowner previews use Vertex only for mockup images (no OpenAI fallback).",
                `Detail: ${vMsg.slice(0, 220)}`,
              ].join(" "),
            );
          } else {
            throw new Error(
              `Vertex generation failed for /try and fallback is disabled: ${vMsg.slice(0, 260)}`,
            );
          }
        }
        if (!handledRequireVertex) {
          if (
            isOpenAiFallbackOnVertexAuthErrorEnabled() &&
            isVertexGoogleUserAuthFailureMessage(vMsg)
          ) {
            console.warn(
              "[mockup] Vertex RAPT/auth error (homeowner try) — falling back to OpenAI image edit (automatic in non-production when fallback env unset).",
            );
            try {
              png = await runOpenAiImageEdit(
                OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPromptOpenAi,
              );
              usedMockupProvider = "openai";
              resolvedImageEditPrompt =
                OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPromptOpenAi;
            } catch {
              await applyOpenAiConceptFallbackAfterPhotoEditFailed();
            }
          } else {
            throw vertexErr;
          }
        }
      }
    } else {
      try {
        png = await runOpenAiImageEdit();
        usedMockupProvider = "openai";
        resolvedImageEditPrompt = editPromptOpenAi;
      } catch {
        await applyOpenAiConceptFallbackAfterPhotoEditFailed();
      }
    }

    if (additionalPrompt) {
      mockupCaption += " Includes your notes for this run.";
    }

    if (
      !params.regenerateFromRoom &&
      params.refineFromMockupId &&
      chosenRefineGeneration != null &&
      imageEditSource === "latest_mockup"
    ) {
      mockupCaption += ` Based on preview v${chosenRefineGeneration}.`;
    }

    const mockPath = `homeowner-tries/${projectId}/mockup-${randomUUID()}.png`;
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

    const mockupGenerationMeta = {
      additionalPrompt: additionalPrompt || null,
      fullEditPrompt: resolvedImageEditPrompt,
      imageEditSource,
      remodelEditPrompt,
      roomAnalysis: roomAnalysis || null,
      mockupOnly,
      usedConceptFallback,
      usedMockupProvider,
      forceOpenAiComparison: Boolean(params.forceOpenAiComparison),
      scopeSnapshot: scopeForAi,
      regenerateFromRoom: params.regenerateFromRoom,
      refineFromMockupId: params.refineFromMockupId,
      chosenRefineGeneration,
      source: "homeowner_try",
    };

    const { error: insPh } = await supabase.from("homeowner_try_mockups").insert({
      project_id: projectId,
      storage_path: mockPath,
      mockup_generation: nextMockupGen,
      caption: mockupCaption,
      mockup_generation_meta: mockupGenerationMeta,
    });

    if (insPh) {
      await supabase.storage.from(PHOTOS_BUCKET).remove([mockPath]);
      throw new Error(insPh.message);
    }

    await updateHomeownerTryProjectAi(projectId, {
      material_estimate: materialsToSave,
      ai_summary: fullSummary,
      ai_status: "complete",
      ai_last_error: null,
    });

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed.";
    await updateHomeownerTryProjectAi(projectId, {
      ai_status: "failed",
      ai_last_error: message,
    });
    return { ok: false, message };
  }
}
