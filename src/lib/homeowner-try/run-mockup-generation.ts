import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { parseMaterialEstimate } from "@/lib/data/bids";
import { lineHasMockupVisualReference, sortQuoteLinesForMockupProductRefs } from "@/lib/bid-mockup";
import {
  bufferToArrayBuffer,
  bufferToDataUrl,
  normalizeImageBufferForDisplay,
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
import { buildVertexLuxuryEscapeTryImageEditPrompt } from "@/lib/homeowner-try/luxury-escape-mockup-prompt";
import { buildVertexWarmMinimalistTryImageEditPrompt } from "@/lib/homeowner-try/warm-minimalist-mockup-prompt";
import { buildVertexSpaRetreatTryImageEditPrompt } from "@/lib/homeowner-try/spa-retreat-mockup-prompt";

const RENOVISION_HOMEOWNER_COMPANY = "Renovision";

const BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS = [
  "Analyze the bathroom image first before editing. Identify walls, openings, major fixture zones, and reflective surfaces.",
  "Hard rule: do not remove, move, or invent walls, doors, windows, ceiling lines, or room boundaries. Keep original architecture, floorplan, and camera perspective locked.",
  "If fixture visibility is partial or uncertain, preserve the fixture footprint instead of deleting it.",
  "Treat mirrors and reflections as spatial evidence. If a shower/tub appears mainly in a mirror reflection, keep that shower/tub present in the final full-scene remodel.",
  "Edits are finish-level only unless a fixture is clearly visible in the original scene.",
  "Do not redesign the room layout. Do not expand or shrink the room. Keep all plumbing zones in their original positions.",
  "Prefer replacing materials and fixture styles over changing physical structure.",
].join(" ");

const BATHROOM_FIXTURE_PRESERVATION_LOCK = [
  "NON-NEGOTIABLE PRESERVATION RULES:",
  "1) Keep every existing wall and subwall/pony wall exactly where it is.",
  "2) Keep toilet present and visible in the remodeled scene. Never remove or hide the toilet.",
  "3) Keep shower/tub zone present even when seen mostly via mirror reflection or partial framing.",
  "4) Keep vanity/sink footprint in the same location.",
  "5) Do not crop or reframe to hide existing fixtures.",
  "If uncertain, preserve the original fixture and wall geometry.",
].join("\n");

const MOCKUP_ONLY_REMODEL_EDIT_PROMPT = [
  "Apply the saved scope and quote as finish and material updates only (tile, paint, grout color, trim, lighting character, fixture styles) where those elements already appear in the photo.",
  "Do not change where visible fixtures sit (shower/tub, vanity/sink, etc.). Do not add fixtures that are not shown in the photo. The room layout and footprints must match the source photo.",
  "Preserve all mirror and glass geometry. You may restyle existing shower door/glass finish details (frame finish, handle finish, glass tint/frost level) to match the selected theme, but keep identical footprint, opening width, and panel/door placement.",
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
    const additionalPrompt = params.additionalPrompt.trim().slice(0, 6000);
    const enforcedAdditionalPrompt = [additionalPrompt, BATHROOM_SCENE_ANALYSIS_AND_STRUCTURE_GUARDRAILS]
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
    const beforeDataUrl = bufferToDataUrl(beforeNorm);

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
      remodelEditPrompt = MOCKUP_ONLY_REMODEL_EDIT_PROMPT;
    } else {
      const vision = await fetchMaterialsAndSummaryFromOpenAI({
        apiKey,
        companyName: RENOVISION_HOMEOWNER_COMPANY,
        scopeDescription: scopeForAi,
        beforeImageUrls: [beforeDataUrl],
        ...(additionalPrompt ? { additionalPrompt } : {}),
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

    const builtEditPrompt = buildImageEditPrompt({
      scopeDescription: scopeForAi,
      roomAnalysis,
      remodelEditPrompt,
      ...(quoteLineContext.trim() ? { quoteLineContext } : {}),
      ...(fullEstimateContext.trim() ? { fullEstimateContext } : {}),
      ...(enforcedAdditionalPrompt ? { additionalPrompt: enforcedAdditionalPrompt } : {}),
      imageEditSource,
      mockupQuoteLines: quoteForMockupImage,
      ...(weakRoomGeometry ? { weakRoomGeometryEvidence: true } : {}),
    });
    const editPromptOpenAi = [builtEditPrompt, BATHROOM_FIXTURE_PRESERVATION_LOCK]
      .filter(Boolean)
      .join("\n\n");

    const editPromptVertex =
      params.selectedStyle === "spa_retreat"
        ? buildVertexSpaRetreatTryImageEditPrompt({
            scopeDescription: scopeForAi,
            roomAnalysis,
            additionalPrompt: enforcedAdditionalPrompt,
            quoteLineContext,
            remodelEditFromVision: remodelEditPrompt,
          })
        : params.selectedStyle === "bold_modern"
          ? buildVertexBoldModernTryImageEditPrompt({
              scopeDescription: scopeForAi,
              roomAnalysis,
              additionalPrompt: enforcedAdditionalPrompt,
              quoteLineContext,
              remodelEditFromVision: remodelEditPrompt,
            })
          : params.selectedStyle === "luxury_escape"
            ? buildVertexLuxuryEscapeTryImageEditPrompt({
                scopeDescription: scopeForAi,
                roomAnalysis,
                additionalPrompt: enforcedAdditionalPrompt,
                quoteLineContext,
                remodelEditFromVision: remodelEditPrompt,
              })
            : params.selectedStyle === "clean_refresh"
              ? buildVertexCleanRefreshTryImageEditPrompt({
                  scopeDescription: scopeForAi,
                  roomAnalysis,
                  additionalPrompt: enforcedAdditionalPrompt,
                  quoteLineContext,
                  remodelEditFromVision: remodelEditPrompt,
                })
              : params.selectedStyle === "warm_minimalist"
                ? buildVertexWarmMinimalistTryImageEditPrompt({
                    scopeDescription: scopeForAi,
                    roomAnalysis,
                    additionalPrompt: enforcedAdditionalPrompt,
                    quoteLineContext,
                    remodelEditFromVision: remodelEditPrompt,
                  })
                : editPromptOpenAi;

    const imageEditModel = process.env.OPENAI_IMAGE_EDIT_MODEL?.trim();

    let png!: ArrayBuffer;
    let usedMockupProvider: MockupImageProviderId = "openai";
    let usedConceptFallback = false;
    /** Prompt bytes actually sent to the image model that succeeded (Vertex vs OpenAI). */
    let resolvedImageEditPrompt = editPromptOpenAi;
    let mockupCaption = `Preview v${nextMockupGen}. AI visualization — verify finishes and layout before hiring a pro.`;
    if (mockupOnly) {
      mockupCaption += " Uses your saved preview scope.";
    }

    const preferredProvider = resolveMockupImageProvider();
    if (params.requireVertex && preferredProvider !== "vertex_gemini") {
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
      });
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

    if (preferredProvider === "vertex_gemini") {
      try {
        png = await fetchRoomRemodelImageEditVertexGemini({
          imageBytes,
          contentType,
          editPrompt: editPromptVertex,
          projectId: googleCloudProjectId(),
          location: vertexLocation(),
          model: vertexGeminiImageModel(),
        });
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
            if (isOpenAiFallbackOnVertexAuthErrorEnabled()) {
              console.warn(
                "[mockup] Vertex RAPT/auth error (homeowner try) — falling back to OpenAI image edit (MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK policy).",
              );
              try {
                png = await runOpenAiImageEdit(
                  OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPromptOpenAi,
                );
                usedMockupProvider = "openai";
                resolvedImageEditPrompt =
                  OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPromptOpenAi;
              } catch (openAiErr) {
                const oMsg = openAiErr instanceof Error ? openAiErr.message : String(openAiErr);
                throw new Error(
                  [
                    "Vertex user credentials failed (invalid_rapt / invalid_grant) and OpenAI fallback failed:",
                    oMsg.slice(0, 200),
                    "Fix Vertex: run `gcloud auth application-default login` (full browser flow), restart `next dev`, or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON if your org allows keys.",
                    "User ADC often hits RAPT again under Google Workspace — a service account avoids that. Dev-only: MOCKUP_IMAGE_PROVIDER=openai skips Vertex for mockups.",
                  ].join(" "),
                );
              }
            } else {
              throw new Error(
                [
                  "Vertex user credentials failed (invalid_rapt / invalid_grant).",
                  "Run `gcloud auth application-default login` (browser login), then restart your dev server. Some gcloud builds do not support `--update-adc` on this command — the plain login refreshes ADC.",
                  "To stop this from recurring: use GOOGLE_APPLICATION_CREDENTIALS with a dedicated service account (Vertex AI User on the project) instead of your personal Google login.",
                  "Optional: set MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK=1 plus OPENAI_API_KEY so /try can continue with OpenAI when Vertex auth fails, or MOCKUP_IMAGE_PROVIDER=openai to skip Vertex in local dev.",
                ].join(" "),
              );
            }
          } else if (isVertexResourceExhaustedMessage(vMsg) && isOpenAiFallbackOnVertexQuotaEnabled()) {
            console.warn(
              "[mockup] Vertex quota / rate limit (429) (homeowner try) — falling back to OpenAI image edit.",
            );
            try {
              png = await runOpenAiImageEdit(
                OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPromptOpenAi,
              );
              usedMockupProvider = "openai";
              resolvedImageEditPrompt =
                OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPromptOpenAi;
            } catch (openAiErr) {
              const oMsg = openAiErr instanceof Error ? openAiErr.message : String(openAiErr);
              throw new Error(
                `Vertex hit quota/rate limits (429) and OpenAI fallback failed: ${oMsg.slice(0, 220)}. Original: ${vMsg.slice(0, 180)}`,
              );
            }
          } else if (isVertexResourceExhaustedMessage(vMsg)) {
            throw new Error(
              [
                "Vertex mockup image request was rejected for quota or rate limits (HTTP 429, RESOURCE_EXHAUSTED).",
                "Wait a few minutes, reduce how often you tweak, or in Google Cloud Console request a higher Vertex AI quota for the image model on your project.",
                "Optional: set MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK=1 with OPENAI_API_KEY to retry with OpenAI when Vertex returns 429 (enabled by default in non-production when the env is unset).",
                "Local dev: MOCKUP_IMAGE_PROVIDER=openai skips Vertex for mockups.",
                `Detail: ${vMsg.slice(0, 240)}`,
              ].join(" "),
            );
          } else if (isVertexMockupTimeoutMessage(vMsg) && isOpenAiFallbackOnVertexTimeoutEnabled()) {
            console.warn(
              "[mockup] Vertex wall-clock timeout (homeowner try) — falling back to OpenAI image edit.",
            );
            try {
              png = await runOpenAiImageEdit(
                OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPromptOpenAi,
              );
              usedMockupProvider = "openai";
              resolvedImageEditPrompt =
                OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX + editPromptOpenAi;
            } catch (openAiErr) {
              const oMsg = openAiErr instanceof Error ? openAiErr.message : String(openAiErr);
              throw new Error(
                `Vertex timed out and OpenAI fallback failed: ${oMsg.slice(0, 220)}. Original: ${vMsg.slice(0, 180)}`,
              );
            }
          } else if (isVertexMockupTimeoutMessage(vMsg)) {
            throw new Error(
              [
                "Vertex mockup image request timed out before returning a picture.",
                "Try the tweak again, set VERTEX_MOCKUP_REQUEST_TIMEOUT_MS=600000 for a longer wait,",
                "or set MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK=1 (with OPENAI_API_KEY) to allow an OpenAI edit when Vertex is slow.",
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
