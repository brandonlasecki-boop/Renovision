import "server-only";

import {
  GoogleGenAI,
  Modality,
  FunctionCallingConfigMode,
  FinishReason,
  type GenerateContentConfig,
} from "@google/genai";
import {
  MOCKUP_PROMPT_TRUNCATE_MARKER,
  truncateMockupTextPromptWithLayoutReinforcement,
} from "@/lib/ai/mockup-prompt-truncate";
import { VERTEX_GEMINI_IMAGE_MODEL_ID } from "@/lib/ai/mockup-image-provider";
import { loadVercelWorkloadIdentityGoogleAuthOptions } from "@/lib/ai/vercel-wif-vertex-auth";
import { productReferenceImageFetchCandidateUrls } from "@/lib/integrations/retail-product-image-lightbox";

/** One dynamic import + optional SA JSON file write per process (regen/tweak calls skip repeat work). */
let gcpServiceAccountBootstrapPromise: Promise<void> | null = null;

async function ensureGcpServiceAccountJsonFromEnvOnce(): Promise<void> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return;
  if (!process.env.GCP_SERVICE_ACCOUNT_JSON?.trim()) return;
  if (!gcpServiceAccountBootstrapPromise) {
    gcpServiceAccountBootstrapPromise = import("@/lib/integrations/gcp-service-account-json-bootstrap").then((m) =>
      m.applyGcpServiceAccountJsonFromEnvIfNeededAsync(),
    );
  }
  await gcpServiceAccountBootstrapPromise;
}

function serializeVertexClientError(err: unknown): string {
  if (err instanceof Error) {
    const any = err as Error & {
      status?: number;
      code?: number | string;
      errorDetails?: unknown;
      details?: unknown;
    };
    const bits: string[] = [any.message];
    if (any.status != null) bits.push(`http_status=${any.status}`);
    if (any.code != null && any.code !== "") bits.push(`code=${String(any.code)}`);
    const det = any.errorDetails ?? any.details;
    if (det != null) {
      try {
        bits.push(`details=${JSON.stringify(det).slice(0, 600)}`);
      } catch {
        bits.push("details=(unserializable)");
      }
    }
    if (/Could not load the default credentials|Application Default Credentials/i.test(any.message)) {
      bits.push(
        "hint=Run: gcloud auth application-default login (or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON if your org allows keys).",
      );
    }
    const detStr =
      det != null
        ? (() => {
            try {
              return JSON.stringify(det);
            } catch {
              return "";
            }
          })()
        : "";
    const haystack = `${any.message}\n${detStr}`.toLowerCase();
    if (
      haystack.includes("invalid_rapt") ||
      haystack.includes("invalid_grant") ||
      haystack.includes("reauth related")
    ) {
      bits.push(
        "hint=Google hit a re-auth / RAPT policy on your user credentials. Fix: gcloud auth application-default login (then restart the app), or use a service account (GOOGLE_APPLICATION_CREDENTIALS) to avoid recurring RAPT on user ADC. Non-production: OpenAI retry after this error when MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK is unset; production: set that env to 1, or use MOCKUP_IMAGE_PROVIDER=openai to skip Vertex.",
      );
    }
    return bits.join(" | ");
  }
  return String(err);
}

function firstImageBytesFromResponseParts(response: {
  candidates?: { content?: { parts?: unknown[] }; finishReason?: string }[];
  data?: string;
  text?: string;
}): ArrayBuffer | null {
  const aggregated = response.data;
  if (aggregated) {
    const buf = Buffer.from(aggregated, "base64");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const candidates = response.candidates ?? [];
  for (const cand of candidates) {
    const parts = cand.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as { inlineData?: { data?: string; mimeType?: string } };
      const data = p.inlineData?.data;
      if (data) {
        const buf = Buffer.from(data, "base64");
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      }
    }
  }
  return null;
}

/** Fetched product/contractor reference images with labels (aligned for multimodal parts). */
export type VertexMockupReferenceInline = {
  /** Matches quote line / attachment label in the text prompt. */
  label: string;
  mimeType: string;
  base64: string;
};

/** Gemini multimodal mockup — align with vision ref cap; was 8 and dropped catalog pixels on busy quotes. */
const MAX_VERTEX_REF_IMAGES = 12;
const MAX_REF_IMAGE_BYTES = 4 * 1024 * 1024;

/** Per-fetch timeout for each catalog/contractor URL try (retailer CDNs). Override: `MOCKUP_REFERENCE_FETCH_TIMEOUT_MS`. */
function mockupReferenceFetchTimeoutMs(): number {
  const raw = process.env.MOCKUP_REFERENCE_FETCH_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  /** Default 8s — was 12s; most images succeed on the first URL; faster fail-through on bad hosts. */
  const fallback = 8000;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(20_000, Math.max(4_000, Math.floor(parsed)));
}

/** Max URL attempts per reference slot. Override: `MOCKUP_REFERENCE_MAX_URL_TRIES`. */
function mockupReferenceMaxUrlTriesPerSlot(): number {
  const raw = process.env.MOCKUP_REFERENCE_MAX_URL_TRIES?.trim();
  const parsed = raw ? Number(raw) : NaN;
  /** Default 5 — was 10; fewer Home Depot downgrade attempts before giving up on a slot. */
  const fallback = 5;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(10, Math.max(2, Math.floor(parsed)));
}

/**
 * Wall-clock cap for Vertex `generateContent` (SDK has no built-in deadline).
 * Override with `VERTEX_MOCKUP_REQUEST_TIMEOUT_MS` (milliseconds), clamped 120_000–600_000.
 */
function vertexMockupRequestTimeoutMs(): number {
  const raw = process.env.VERTEX_MOCKUP_REQUEST_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  /** Default 5m — Gemini image preview often exceeds 3m on busy global; `/try` route allows up to 800s wall clock. */
  const fallback = 300_000;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(600_000, Math.max(120_000, Math.floor(parsed)));
}

/**
 * Gemini 3.1 native image preview models match Google's samples: `response_modalities` only for edits.
 * Extra fields (`temperature`, `maxOutputTokens`) have been linked to empty candidates and
 * `MALFORMED_FUNCTION_CALL` on some Vertex runs.
 */
function vertexNativeImageModelPrefersMinimalGenerationConfig(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.includes("gemini-3.1") && m.includes("image");
}

function vertexMockupGenerateContentConfig(
  model: string,
  built: VertexRemodelMockupBuiltRequest,
  variant: "primary" | "retry",
): GenerateContentConfig {
  const blockFunctionCalls = {
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
    },
    automaticFunctionCalling: { disable: true },
  } satisfies GenerateContentConfig;

  const is31Image = vertexNativeImageModelPrefersMinimalGenerationConfig(model);

  if (is31Image && variant === "primary") {
    return {
      ...blockFunctionCalls,
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    };
  }
  if (is31Image && variant === "retry") {
    return {
      ...blockFunctionCalls,
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      temperature: 0,
    };
  }

  return {
    ...blockFunctionCalls,
    responseModalities: [Modality.IMAGE, Modality.TEXT],
    temperature: built.generationConfig.temperature,
    maxOutputTokens: built.generationConfig.maxOutputTokens,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let to: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    to = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (to) clearTimeout(to);
  }) as Promise<T>;
}

/** Browser-like headers — some retailer CDNs block bare Node fetch. */
const REF_FETCH_HEADERS: Record<string, string> = {
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export type FetchMockupReferenceImagesResult = {
  images: VertexMockupReferenceInline[];
  /** URLs we tried (capped). */
  attempted: number;
  /** Images successfully decoded for Vertex. */
  loaded: number;
};

/** Reject HTML / JSON error bodies CDNs sometimes return with 200 + wrong Content-Type. */
function bufferLooksLikeRasterImage(buf: ArrayBuffer): boolean {
  const u = new Uint8Array(buf.byteLength > 16 ? buf.slice(0, 16) : buf);
  if (u.length < 2) return false;
  if (u[0] === 0xff && u[1] === 0xd8) return true;
  if (u.length >= 4 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return true;
  if (u.length >= 6 && u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46 && (u[3] === 0x38 || u[3] === 0x39))
    return true;
  if (
    u.length >= 12 &&
    u[0] === 0x52 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x46 &&
    u[8] === 0x57 &&
    u[9] === 0x45 &&
    u[10] === 0x42 &&
    u[11] === 0x50
  ) {
    return true;
  }
  return false;
}

async function fetchOneReferenceImage(
  url: string,
  fetchTimeoutMs: number,
): Promise<{ mimeType: string; base64: string } | null> {
  const tryFetch = async (headers: Record<string, string>) => {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_REF_IMAGE_BYTES) return null;
    if (!bufferLooksLikeRasterImage(buf)) return null;
    const raw = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
    const mime = raw.startsWith("image/") ? raw : "image/jpeg";
    const b64 = Buffer.from(new Uint8Array(buf)).toString("base64");
    return { mimeType: mime, base64: b64 };
  };

  let data = await tryFetch(REF_FETCH_HEADERS);
    if (!data) {
      const u = url.toLowerCase();
      if (
        u.includes("homedepot") ||
        u.includes("images.homedepot") ||
        u.includes("thdstatic") ||
        u.includes("homedepot-static")
      ) {
        data = await tryFetch({
          ...REF_FETCH_HEADERS,
          Referer: "https://www.homedepot.com/",
        });
      }
    }
  if (!data) {
    const u = url.toLowerCase();
    if (
      u.includes("lowes.com") ||
      u.includes("lowescdn") ||
      u.includes("widencdn.net") ||
      u.includes("scene7.com")
    ) {
      data = await tryFetch({
        ...REF_FETCH_HEADERS,
        Referer: "https://www.lowes.com/",
      });
    }
  }
  return data;
}

/**
 * Download reference URLs (signed Supabase / Home Depot) for Vertex multimodal input.
 * OpenAI image edits only accept one image, so those stay text-only via vision summary.
 */
export async function fetchMockupReferenceImagesForVertex(
  refs: { label: string; url: string }[],
): Promise<FetchMockupReferenceImagesResult> {
  const slice = refs.slice(0, MAX_VERTEX_REF_IMAGES);
  const fetchTimeoutMs = mockupReferenceFetchTimeoutMs();
  const maxTries = mockupReferenceMaxUrlTriesPerSlot();
  const results = await Promise.all(
    slice.map(async (ref) => {
      try {
        const candidates = productReferenceImageFetchCandidateUrls(ref.url, maxTries);
        let data: { mimeType: string; base64: string } | null = null;
        let tries = 0;
        for (const fetchUrl of candidates) {
          if (tries >= maxTries) break;
          tries += 1;
          data = await fetchOneReferenceImage(fetchUrl, fetchTimeoutMs);
          if (data) break;
        }
        if (!data) return null;
        return {
          label: ref.label.slice(0, 800),
          mimeType: data.mimeType,
          base64: data.base64,
        } satisfies VertexMockupReferenceInline;
      } catch {
        return null;
      }
    }),
  );
  const out = results.filter((x): x is VertexMockupReferenceInline => x != null);
  return { images: out, attempted: slice.length, loaded: out.length };
}

/** One multimodal part for Vertex `generateContent` (same shape as @google/genai user parts). */
export type VertexGeminiUserContentPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

export type VertexRemodelMockupBuiltRequest = {
  parts: VertexGeminiUserContentPart[];
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseModalities: string[];
  };
};

/**
 * Builds the exact user `parts[]` + generation config sent to Vertex for a mockup room edit
 * (does not call the API). Used for debugging / inspect UI.
 */
export function buildVertexRemodelMockupRequestParts(params: {
  imageBytes: ArrayBuffer;
  contentType: string;
  editPrompt: string;
  referenceInlineImages?: VertexMockupReferenceInline[];
  vanityCabinetReplacement?: boolean;
  /** `/try` Update preview — alternate truncation suffix so last-seen layout lines do not veto tweaks. */
  homeownerMockupTweak?: boolean;
}): VertexRemodelMockupBuiltRequest {
  const b64 = Buffer.from(new Uint8Array(params.imageBytes)).toString("base64");
  const mime = params.contentType.split(";")[0]?.trim() || "image/jpeg";
  const refs = params.referenceInlineImages ?? [];
  const vanityReplace = Boolean(params.vanityCabinetReplacement && refs.length > 0);
  const preamble =
    refs.length > 0
      ? vanityReplace
        ? "Multimodal: room image first, then labeled product JPEGs. New vanity line = replace vanity on that wall from its JPEG; keep wet area fixed. Other lines = in-place finishes only. One output image.\n\n"
        : "Multimodal: room image first, then product JPEGs — each JPEG matches one quote line / ZONE; finishes only, layout from the room photo. One output image.\n\n"
      : "";
  const refReminder =
    refs.length > 0
      ? `\n\n---\n${refs.length} product JPEG(s) after the room image — one ZONE per label.\n`
      : "";
  const universalRoomPreamble =
    refs.length > 0
      ? "First image = layout. Product JPEGs = finishes for their labels only.\n\n"
      : "Edit the attached room photo per the text below.\n\n";
  const VERTEX_MOCKUP_TEXT_PROMPT_MAX = 48_000;
  const prompt = truncateMockupTextPromptWithLayoutReinforcement(
    universalRoomPreamble + preamble + params.editPrompt + refReminder,
    VERTEX_MOCKUP_TEXT_PROMPT_MAX,
    MOCKUP_PROMPT_TRUNCATE_MARKER,
    { homeownerMockupTweak: params.homeownerMockupTweak === true },
  );

  const refParts: VertexGeminiUserContentPart[] = [];
  for (const r of refs) {
    refParts.push({
      text: `[Product reference for this line only: ${r.label}]`,
    });
    refParts.push({
      inlineData: { mimeType: r.mimeType, data: r.base64 },
    });
  }

  const leadingTask =
    refs.length > 0
      ? "Use the room photo for all fixture positions; JPEGs are material/finish references.\n\n"
      : "";

  const closingNudge =
    refs.length > 0 ? "Output: one photorealistic image; keep wet-area geometry from the room shot.\n" : "";

  const parts: VertexGeminiUserContentPart[] =
    refs.length > 0
      ? [
          ...(leadingTask ? [{ text: leadingTask }] : []),
          { inlineData: { mimeType: mime, data: b64 } },
          ...refParts,
          { text: prompt },
          ...(closingNudge ? [{ text: closingNudge }] : []),
        ]
      : [{ inlineData: { mimeType: mime, data: b64 } }, { text: prompt }];

  return {
    parts,
    generationConfig: {
      temperature: refs.length > 0 ? 0.05 : 0.2,
      maxOutputTokens: 8192,
      responseModalities: ["IMAGE", "TEXT"],
    },
  };
}

export type VertexRemodelDebugPartSummary =
  | { kind: "text"; sequence: number; characters: number; content: string }
  | {
      kind: "image";
      sequence: number;
      mimeType: string;
      bytes: number;
      /** Parsed from the preceding “[Product reference for this line only: …]” line when present. */
      productLabelSnippet?: string;
    };

/** Human-readable sequence of multimodal parts (no base64 payloads). */
export function summarizeVertexRemodelPartsForDebug(
  parts: VertexGeminiUserContentPart[],
): VertexRemodelDebugPartSummary[] {
  const out: VertexRemodelDebugPartSummary[] = [];
  let seq = 0;
  let pendingLabel: string | undefined;
  const refPrefix = "[Product reference for this line only:";
  for (const p of parts) {
    if (p.text != null) {
      const t = p.text;
      const idx = t.indexOf(refPrefix);
      if (idx >= 0) {
        const after = t.slice(idx + refPrefix.length).trim();
        const close = after.indexOf("]");
        pendingLabel = (close >= 0 ? after.slice(0, close) : after).trim().slice(0, 500);
      }
      out.push({ kind: "text", sequence: seq++, characters: t.length, content: t });
    }
    if (p.inlineData?.data) {
      const bytes = Buffer.from(p.inlineData.data, "base64").byteLength;
      out.push({
        kind: "image",
        sequence: seq++,
        mimeType: p.inlineData.mimeType,
        bytes,
        productLabelSnippet: pendingLabel,
      });
      pendingLabel = undefined;
    }
  }
  return out;
}

/**
 * Remodel using Vertex AI Gemini multimodal image output (image + text in, image out).
 * Docs: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/gemini-edit-images
 *
 * Auth: Application Default Credentials — set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path,
 * or run where ADC is available (gcloud auth application-default login locally).
 *
 * When `referenceInlineImages` is set, parts are: [task text, **room image**, labeled product JPEGs, **long prompt**, closing nudge].
 * Room + product refs first so the model **grounds** on pixels before the long text wall.
 */
export async function fetchRoomRemodelImageEditVertexGemini(params: {
  imageBytes: ArrayBuffer;
  contentType: string;
  editPrompt: string;
  projectId: string;
  location: string;
  model?: string;
  /** Product/contractor photos — model sees pixels, not only GPT summaries. */
  referenceInlineImages?: VertexMockupReferenceInline[];
  /** Quote includes supply/install of a new vanity cabinet — relax “skins only” preamble for that case. */
  vanityCabinetReplacement?: boolean;
  /** `/try` mockup tweak — use tweak-friendly layout reinforcement after truncation. */
  homeownerMockupTweak?: boolean;
}): Promise<ArrayBuffer> {
  const model = params.model?.trim() || VERTEX_GEMINI_IMAGE_MODEL_ID;
  const projectId = params.projectId.trim();
  if (!projectId) {
    throw new Error("Vertex mockup: empty GOOGLE_CLOUD_PROJECT after trimming.");
  }
  /** Vercel: instrumentation may not run before this lambda; JSON env is applied here too. */
  await ensureGcpServiceAccountJsonFromEnvOnce();
  const wifAuth = await loadVercelWorkloadIdentityGoogleAuthOptions();
  if (
    process.env.VERCEL &&
    !wifAuth &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  ) {
    const hasJson = Boolean(process.env.GCP_SERVICE_ACCOUNT_JSON?.trim());
    throw new Error(
      hasJson
        ? "Vertex: GCP_SERVICE_ACCOUNT_JSON is set but credentials were not applied (invalid JSON or file write failed — check function logs for [gcp-bootstrap])."
        : "Vertex has no Google credentials on Vercel. Add GCP_SERVICE_ACCOUNT_JSON (full service account JSON) and GOOGLE_CLOUD_PROJECT, or configure Workload Identity (src/lib/ai/vercel-wif-vertex-auth.ts + https://vercel.com/docs/oidc/gcp).",
    );
  }
  const client = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: params.location,
    ...(wifAuth ? { googleAuthOptions: wifAuth } : {}),
  });

  const built = buildVertexRemodelMockupRequestParts({
    imageBytes: params.imageBytes,
    contentType: params.contentType,
    editPrompt: params.editPrompt,
    referenceInlineImages: params.referenceInlineImages,
    vanityCabinetReplacement: params.vanityCabinetReplacement,
    homeownerMockupTweak: params.homeownerMockupTweak,
  });
  const { parts } = built;

  const vertexDeadlineMs = vertexMockupRequestTimeoutMs();
  const contents = [{ role: "user" as const, parts }];

  const callVertex = (variant: "primary" | "retry") =>
    withTimeout(
      client.models.generateContent({
        model,
        contents,
        config: vertexMockupGenerateContentConfig(model, built, variant),
      }),
      vertexDeadlineMs,
      `Vertex mockup image request (${model} @ ${params.location})`,
    );

  let response;
  try {
    response = await callVertex("primary");
  } catch (err) {
    throw new Error(`Vertex mockup image request failed (${model} @ ${params.location}): ${serializeVertexClientError(err)}`);
  }

  const pf = response.promptFeedback;
  if (pf?.blockReason) {
    const msg = pf.blockReasonMessage?.trim() || "";
    throw new Error(
      `Vertex blocked this mockup prompt (${pf.blockReason})${msg ? `: ${msg}` : ""}. Try shorter scope text or different photos.`,
    );
  }

  let fromParts = firstImageBytesFromResponseParts(response);
  const c0Primary = response.candidates?.[0];
  if (
    !fromParts &&
    vertexNativeImageModelPrefersMinimalGenerationConfig(model) &&
    c0Primary?.finishReason === FinishReason.MALFORMED_FUNCTION_CALL
  ) {
    try {
      response = await callVertex("retry");
      const pfRetry = response.promptFeedback;
      if (pfRetry?.blockReason) {
        const msg = pfRetry.blockReasonMessage?.trim() || "";
        throw new Error(
          `Vertex blocked mockup prompt on retry (${pfRetry.blockReason})${msg ? `: ${msg}` : ""}.`,
        );
      }
      fromParts = firstImageBytesFromResponseParts(response);
    } catch (retryErr) {
      throw new Error(
        `Vertex mockup image retry after MALFORMED_FUNCTION_CALL failed (${model} @ ${params.location}): ${serializeVertexClientError(retryErr)}`,
      );
    }
  }

  if (fromParts) {
    return fromParts;
  }

  const c0 = response.candidates?.[0];
  const finish = c0?.finishReason;
  const text = response.text;
  const candCount = response.candidates?.length ?? 0;
  const malformedHint =
    finish === FinishReason.MALFORMED_FUNCTION_CALL
      ? " For gemini-3.1-flash-image-preview, try updating @google/genai, or set VERTEX_MOCKUP_IMAGE_MODEL to another image-capable Gemini id if Google recommends it."
      : "";
  throw new Error(
    `Vertex returned no image (model=${model}, candidates=${candCount}, finishReason=${finish ?? "n/a"}). ${text ? `Model text: ${text.slice(0, 280)}` : "No text parts."} Check Vertex AI API + billing + IAM, and that ${model} is available in your project/region.${malformedHint}`,
  );
}
