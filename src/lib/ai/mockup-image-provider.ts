/**
 * Mockup **photo edits** use **Vertex Gemini 3.1 Flash Image** only, unless you explicitly opt into OpenAI.
 *
 * **Other AI** (questionnaire, materials list, scope breakdown, retail search hints, GPT‑4o reference
 * summaries) still use OpenAI. With `MOCKUP_IMAGE_PROVIDER=openai`, a rare **OpenAI DALL·E “concept fallback”**
 * runs only if **`gpt-image-1` image edit** fails.
 *
 * **Vertex auth (RAPT / `invalid_grant`):** refresh ADC (`gcloud auth application-default login`, then restart the app)
 * or use a **service account** (`GOOGLE_APPLICATION_CREDENTIALS`). When `MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK`
 * is **unset** and `NODE_ENV !== "production"`, mockups **automatically** retry with OpenAI image edit after
 * that class of user-credential error (local `next dev`). In **production**, set `MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK=1`
 * to enable the same retry, or `=0` in non-production to disable. To skip Vertex entirely, use `MOCKUP_IMAGE_PROVIDER=openai`.
 *
 * **Vertex slow / wall-clock timeout:** `/try` tweaks require Vertex first; if the image call hits the
 * request deadline, set `MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK=1` (plus `OPENAI_API_KEY`) to retry that run
 * with OpenAI image edit — same default-on-in-non-production pattern as `MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK`.
 *
 * **Vertex quota / rate limit (HTTP 429, `RESOURCE_EXHAUSTED`):** Google caps requests per minute/day for
 * `gemini-3.1-flash-image-preview`. Set `MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK=1` plus `OPENAI_API_KEY` to retry
 * with OpenAI when Vertex returns 429 (unset → allowed in non-production, same tri-state as the timeout flag).
 *
 * Env:
 * - `MOCKUP_IMAGE_PROVIDER` — Default / `auto` / `vertex`: mockup **room edits** require Vertex
 *   (`GOOGLE_CLOUD_PROJECT` + ADC); throws with setup instructions if Vertex is not configured.
 *   `openai`: prefer OpenAI image edit for mockups — **but** if the quote has shelf/contractor reference
 *   URLs and Vertex is configured, `generateBidAi` **upgrades to Vertex** so catalog pixels are sent
 *   (OpenAI edits only accept one image). Set `MOCKUP_FORCE_OPENAI_WITH_REFS=1` to force OpenAI anyway.
 * - `GOOGLE_CLOUD_PROJECT` — required for mockup images unless `MOCKUP_IMAGE_PROVIDER=openai`.
 * - `VERTEX_MOCKUP_IMAGE_MODEL` — optional override for the Vertex model id (default `gemini-3.1-flash-image-preview`).
 * - `VERTEX_MOCKUP_REQUEST_TIMEOUT_MS` — max wait for one Vertex image response (ms), clamped 120000–600000 (default 300000).
 * - `MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK` — optional OpenAI retry after Vertex **request timeout** (see header).
 * - `MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK` — optional OpenAI retry after Vertex **429 / quota exhausted** (see header).
 * - `MOCKUP_REFERENCE_FETCH_TIMEOUT_MS` — per-URL timeout when downloading shelf/contractor ref JPEGs (default 8000; lower = faster fail to next URL).
 * - `MOCKUP_REFERENCE_MAX_URL_TRIES` — max CDN URL variants tried per ref slot, 2–10 (default 5; lower = faster when thumbs 403).
 *
 * Model id and Vertex region are fixed in code (`gemini-3.1-flash-image-preview`, `global`).
 */

export type MockupImageProviderId = "openai" | "vertex_gemini";

/** Matches `DEFAULT_IMAGE_EDIT_MODEL` in `openai-bid.ts` — shown in mockup captions when env is unset. */
export const DEFAULT_OPENAI_IMAGE_EDIT_MODEL = "gpt-image-1" as const;

/** Gemini 3.1 Flash Image (Nano Banana 2) — Vertex model id per Google Cloud docs. */
export const VERTEX_GEMINI_IMAGE_MODEL_ID = "gemini-3.1-flash-image-preview" as const;

/**
 * Short fragment for `bid_photos.caption` so users know which renderer produced the mockup.
 */
export function formatMockupImageModelCaptionFragment(params: {
  usedConceptFallback: boolean;
  usedMockupProvider: MockupImageProviderId;
  /** `OPENAI_IMAGE_EDIT_MODEL` — omit to read from `process.env` on the server. */
  openaiImageEditModel?: string | null;
}): string {
  if (params.usedConceptFallback) {
    return "[Image model: OpenAI DALL·E 3 — concept fallback, not a room-matched photo edit]";
  }
  if (params.usedMockupProvider === "vertex_gemini") {
    return `[Image model: Vertex AI Gemini ${VERTEX_GEMINI_IMAGE_MODEL_ID}]`;
  }
  const m =
    params.openaiImageEditModel?.trim() ||
    process.env.OPENAI_IMAGE_EDIT_MODEL?.trim() ||
    DEFAULT_OPENAI_IMAGE_EDIT_MODEL;
  return `[Image model: OpenAI ${m}]`;
}

const VERTEX_MOCKUP_SETUP =
  "Mockup images use Vertex AI: set GOOGLE_CLOUD_PROJECT and Application Default Credentials (or a runtime service account). For local dev without GCP, set MOCKUP_IMAGE_PROVIDER=openai. See docs/MOCKUP_IMAGE_AB_TESTING.md.";

/**
 * Which API renders mockup **room-edit images** (not text / questionnaire — those remain OpenAI unless migrated).
 * Defaults to Vertex; OpenAI only when `MOCKUP_IMAGE_PROVIDER=openai`.
 */
export function resolveMockupImageProvider(): MockupImageProviderId {
  const raw = (process.env.MOCKUP_IMAGE_PROVIDER ?? "auto").trim().toLowerCase();
  if (raw === "openai") {
    return "openai";
  }
  if (!isVertexMockupConfigured()) {
    throw new Error(
      raw === "vertex"
        ? `MOCKUP_IMAGE_PROVIDER=vertex requires GOOGLE_CLOUD_PROJECT and working credentials. ${VERTEX_MOCKUP_SETUP}`
        : VERTEX_MOCKUP_SETUP,
    );
  }
  return "vertex_gemini";
}

export function isVertexMockupConfigured(): boolean {
  return Boolean(normalizeGoogleCloudProjectEnv(process.env.GOOGLE_CLOUD_PROJECT));
}

/** Strip UTF-8 BOM / whitespace — common when copying project id from spreadsheets into `.env.local`. */
export function normalizeGoogleCloudProjectEnv(raw: string | undefined): string {
  return (raw ?? "").replace(/^\uFEFF/, "").trim();
}

/**
 * Model id for mockup image generation on Vertex. Override with `VERTEX_MOCKUP_IMAGE_MODEL` if Google
 * renames the endpoint (value is passed through to `@google/genai` as `model`).
 */
export function vertexGeminiImageModel(): string {
  const fromEnv = normalizeGoogleCloudProjectEnv(process.env.VERTEX_MOCKUP_IMAGE_MODEL);
  if (fromEnv) return fromEnv;
  return VERTEX_GEMINI_IMAGE_MODEL_ID;
}

/** Gemini 3.1 Flash Image is only available on Vertex’s global endpoint. */
export function vertexLocation(): string {
  return "global";
}

export function googleCloudProjectId(): string {
  return normalizeGoogleCloudProjectEnv(process.env.GOOGLE_CLOUD_PROJECT);
}

/**
 * True when Vertex failed with Workspace / ADC “re-auth” style errors (`invalid_rapt`, `invalid_grant`, …).
 * Used to optionally retry mockup image generation with OpenAI.
 */
export function isVertexGoogleUserAuthFailureMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid_rapt") ||
    m.includes("invalid_grant") ||
    m.includes("reauth related") ||
    m.includes("error_subtype") && m.includes("invalid_rapt")
  );
}

/** Our `withTimeout` wrapper rejects with this substring when Vertex exceeds `VERTEX_MOCKUP_REQUEST_TIMEOUT_MS`. */
export function isVertexMockupTimeoutMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("timed out after") && m.includes("vertex mockup image request");
}

/** True when Vertex returned quota / rate-limit (HTTP 429, RESOURCE_EXHAUSTED). */
export function isVertexResourceExhaustedMessage(message: string): boolean {
  const m = message.toLowerCase();
  const vertexMockup = m.includes("vertex mockup");
  return (
    m.includes("resource_exhausted") ||
    m.includes("resource has been exhausted") ||
    (vertexMockup && m.includes("http_status=429")) ||
    (vertexMockup && m.includes('"code":429') && m.includes("quota"))
  );
}

/**
 * Retry mockup image generation with OpenAI after Vertex RAPT / `invalid_grant` user-credential errors.
 * - Explicit `MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK=0` / `false` / `no` / `off` → never fall back.
 * - Explicit `1` / `true` / `yes` / `on` → always fall back when the error matches.
 * - **Unset:** fall back when `NODE_ENV` is not `production` (covers local `next dev` and tests).
 */
export function isOpenAiFallbackOnVertexAuthErrorEnabled(): boolean {
  const v = process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  return nodeEnv !== "production";
}

/**
 * Retry `/try` mockups with OpenAI after Vertex hits the **wall-clock** image deadline (not auth errors).
 * Same tri-state env pattern as `MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK`.
 */
export function isOpenAiFallbackOnVertexTimeoutEnabled(): boolean {
  const v = process.env.MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  return nodeEnv !== "production";
}

/**
 * Retry `/try` mockups with OpenAI after Vertex **429 / RESOURCE_EXHAUSTED** (quota or burst limit).
 * Same tri-state env pattern as `MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK`.
 */
export function isOpenAiFallbackOnVertexQuotaEnabled(): boolean {
  const v = process.env.MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  return nodeEnv !== "production";
}
