/**
 * Batched OpenAI pass: uses full job context + before photos + quote to (1) decide which lines
 * can have a Home Depot physical product, (2) propose real homedepot.com product URLs for those lines.
 * Optional HTTP reachability check, then SerpApi `home_depot_product` for price + thumbnail.
 */

import {
  extractHomedepotProductIdFromUrl,
  isAllowedHomedepotProductImageUrl,
} from "@/lib/integrations/serpapi-homedepot";

const URL_PROBE_MODEL =
  process.env.RETAIL_HD_URL_PROBE_MODEL?.trim().replace(/^["']|["']$/g, "") || "gpt-4o-mini";

const MAX_ROWS = 40;
const MAX_URLS_PER_LINE = 3;
const MAX_BEFORE_PHOTOS = 4;

const OPENAI_URL_PLAN_HARD_MS = 95_000;

/** Hard cap when `AbortSignal.timeout` is missing or callers pass no signal — avoids hung server actions. */
function abortSignalAfterMs(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => {
    try {
      c.abort();
    } catch {
      /* ignore */
    }
  }, ms);
  return c.signal;
}

function mergeAbortSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any([a, b]);
  }
  return b;
}

/** One Serp hit offered to the URL-plan model (link + listing title + optional catalog thumb). */
export type RetailHomedepotUrlProbeCandidate = {
  link: string;
  title: string;
  image_url?: string;
};

export type RetailHomedepotUrlProbeRow = {
  /** 1-based index; must match `serpOrder + 1` in attach-retail-pricing-to-lines. */
  plan_index: number;
  name: string;
  notes?: string;
  trade?: string;
  /** Draft Serp string for context (from suggest + batch plan path). */
  draft_query: string;
  /**
   * Serp hits with titles and optional images — preferred over URL-only lists.
   * When non-empty, the model may **only** echo URLs from this list (prevents hallucinated THD links).
   */
  candidate_homedepot_items?: RetailHomedepotUrlProbeCandidate[];
  /**
   * Real product page URLs from SerpApi search for this line’s query (legacy / URL-only rows).
   * Ignored when `candidate_homedepot_items` is non-empty.
   */
  candidate_homedepot_urls?: string[];
};

export type RetailHomedepotUrlPlanEntry = {
  /** Model says this line can be tied to a purchasable THD SKU (vs labor-only, permits, etc.). */
  shoppableHd: boolean;
  /** 0–3 product page URLs when shoppableHd; empty when not shoppable or no confident URL. */
  urls: string[];
};

export type HomedepotUrlReachability = "ok" | "not_found" | "unknown";

type VisionPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } };

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

function stripModelJsonFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

function extractLinesArray(parsed: Record<string, unknown>): unknown[] | null {
  for (const key of ["lines", "probes", "results", "url_lines", "homedepot_lines"]) {
    const v = parsed[key];
    if (Array.isArray(v)) return v;
  }
  const data = parsed.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    for (const key of ["lines", "probes", "results"]) {
      const v = inner[key];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

function collectUrlStringsFromRow(o: Record<string, unknown>): string[] {
  const urlsRaw = o.homedepot_urls ?? o.urls ?? o.homedepot_product_urls ?? o.product_urls;
  if (Array.isArray(urlsRaw)) {
    return urlsRaw.filter((x): x is string => typeof x === "string");
  }
  for (const key of ["homedepot_url", "product_url", "url", "link"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim().startsWith("http")) return [v.trim()];
  }
  return [];
}

function rowPlanIndex(o: Record<string, unknown>): number | null {
  for (const key of ["plan_index", "line_index", "row_index", "index"]) {
    const v = o[key];
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return null;
}

function rowShoppableHd(o: Record<string, unknown>): boolean {
  for (const key of [
    "shoppable_hd",
    "can_have_homedepot_product",
    "shoppable",
    "has_physical_product",
    "hd_shoppable",
  ]) {
    const v = o[key];
    if (v === false || v === "false" || v === 0 || v === "0") return false;
    if (v === true || v === "true" || v === 1 || v === "1") return true;
  }
  return true;
}

function isAllowedHomedepotProductPageUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith("http://") && !t.startsWith("https://")) return false;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (!h.endsWith("homedepot.com")) return false;
    return Boolean(extractHomedepotProductIdFromUrl(t));
  } catch {
    return false;
  }
}

function sanitizeUrls(urlStrings: string[]): string[] {
  const urls: string[] = [];
  const seenPid = new Set<string>();
  for (const u of urlStrings) {
    const t = u.trim().slice(0, 800);
    if (!isAllowedHomedepotProductPageUrl(t)) continue;
    const pid = extractHomedepotProductIdFromUrl(t);
    if (!pid) continue;
    if (seenPid.has(pid)) continue;
    seenPid.add(pid);
    urls.push(t);
    if (urls.length >= MAX_URLS_PER_LINE) break;
  }
  return urls;
}

/** Exported for unit tests. */
export function parseRetailHomedepotUrlPlanFromModelContent(text: string): Map<number, RetailHomedepotUrlPlanEntry> {
  const out = new Map<number, RetailHomedepotUrlPlanEntry>();
  const parsed = parseJsonObject(stripModelJsonFences(text.trim()));
  if (!parsed) return out;
  const rawLines = extractLinesArray(parsed);
  if (!rawLines) return out;
  for (const row of rawLines) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const idx = rowPlanIndex(o);
    if (idx == null) continue;
    const shoppableHd = rowShoppableHd(o);
    const rawUrls = collectUrlStringsFromRow(o);
    const urls = shoppableHd ? sanitizeUrls(rawUrls) : [];
    out.set(idx, { shoppableHd, urls });
  }
  return out;
}

/**
 * @deprecated Use {@link parseRetailHomedepotUrlPlanFromModelContent}; kept for tests — URLs only for shoppable rows.
 */
export function parseRetailHomedepotUrlProbesFromModelContent(text: string): Map<number, string[]> {
  const plan = parseRetailHomedepotUrlPlanFromModelContent(text);
  const m = new Map<number, string[]>();
  plan.forEach((v, k) => {
    if (v.shoppableHd && v.urls.length > 0) m.set(k, v.urls);
  });
  return m;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Best-effort HTTP check before Serp. Many storefronts block server HEAD — then returns `unknown`
 * and the caller should still try SerpApi product lookup.
 */
export async function checkHomedepotProductPageReachability(
  productPageUrl: string,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<HomedepotUrlReachability> {
  const raw = productPageUrl.trim().slice(0, 2000);
  if (!raw.startsWith("https://") || !raw.toLowerCase().includes("homedepot.com")) return "unknown";
  const timeoutMs = Math.min(4000, Math.max(1200, opts?.timeoutMs ?? 2500));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const outer = opts?.signal;
  const signal =
    outer && typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function"
      ? AbortSignal.any([outer, ctrl.signal])
      : ctrl.signal;
  try {
    let res = await fetch(raw, {
      method: "HEAD",
      redirect: "follow",
      signal,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
    });
    if (res.status === 405) {
      res = await fetch(raw, {
        method: "GET",
        redirect: "follow",
        signal,
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      });
    }
    if (res.status === 404 || res.status === 410) return "not_found";
    if (res.ok || (res.status >= 200 && res.status < 400)) return "ok";
    if (res.status === 403 || res.status === 401) return "unknown";
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(t);
  }
}

function candidateEntriesForProbeRow(r: RetailHomedepotUrlProbeRow): { link: string; title: string }[] {
  const items = r.candidate_homedepot_items;
  if (items && items.length > 0) {
    return items.map((it) => ({
      link: String(it.link ?? "").trim(),
      title: String(it.title ?? "").trim().slice(0, 240),
    }));
  }
  return (r.candidate_homedepot_urls ?? [])
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .map((u) => ({ link: u.trim(), title: "" }));
}

/** Links the model may echo for this row (Serp allowlist). */
export function allowedHomedepotCandidateUrlsFromProbeRow(r: RetailHomedepotUrlProbeRow): string[] {
  return candidateEntriesForProbeRow(r)
    .map((e) => e.link)
    .filter((u) => u.startsWith("http"));
}

function maxCandidateProductImagesForUrlProbe(): number {
  const raw = process.env.RETAIL_HD_URL_PROBE_MAX_PRODUCT_IMAGES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 24;
  return Math.max(0, Math.min(40, Math.floor(n)));
}

/** Round-robin Serp thumbnails across lines so one row does not consume the whole image budget. */
function buildCandidateProductImageVisionParts(rows: RetailHomedepotUrlProbeRow[]): VisionPart[] {
  const max = maxCandidateProductImagesForUrlProbe();
  if (max === 0) return [];

  type Queued = { plan_index: number; k: number; title: string; link: string; image_url: string };
  const queues: Queued[][] = rows.map((r) => {
    const items = r.candidate_homedepot_items;
    const list: RetailHomedepotUrlProbeCandidate[] =
      items && items.length > 0
        ? items
        : (r.candidate_homedepot_urls ?? []).map((link) => ({ link: String(link), title: "" }));
    const out: Queued[] = [];
    let k = 0;
    for (const it of list) {
      const link = String(it.link ?? "").trim();
      const img = typeof it.image_url === "string" ? it.image_url.trim() : "";
      if (!link.startsWith("http") || !img || !isAllowedHomedepotProductImageUrl(img)) continue;
      k++;
      out.push({
        plan_index: r.plan_index,
        k,
        title: String(it.title ?? "").trim().slice(0, 200),
        link,
        image_url: img,
      });
    }
    return out;
  });

  const parts: VisionPart[] = [];
  let used = 0;
  let round = 0;
  for (;;) {
    let progressed = false;
    for (let ri = 0; ri < queues.length; ri++) {
      const item = queues[ri]![round];
      if (!item) continue;
      progressed = true;
      parts.push({
        type: "text",
        text: `plan_index=${item.plan_index} Serp candidate #${item.k}\nListing: ${item.title || "(see product image)"}\nURL: ${item.link}\nProduct image:`,
      });
      parts.push({
        type: "image_url",
        image_url: { url: item.image_url, detail: "low" },
      });
      used++;
      if (used >= max) return parts;
    }
    if (!progressed) return parts;
    round++;
  }
}

/**
 * One OpenAI call: full job context (scope, measurements, Q&A, walkthrough) + full quote + before photos;
 * optional Serp **product thumbnails** per candidate (same URLs as in the text list) so the model can
 * reject wrong footprints like a contractor checking the shelf; for each numbered line output
 * `shoppable_hd` and optional homedepot.com product URLs.
 */
export async function fetchRetailHomedepotUrlPlanBatch(params: {
  apiKey: string | undefined;
  bidTitle: string;
  jobContext: string;
  quoteLinesSummary: string;
  beforePhotoUrls?: string[];
  rows: RetailHomedepotUrlProbeRow[];
  signal?: AbortSignal;
}): Promise<Map<number, RetailHomedepotUrlPlanEntry>> {
  const apiKey = params.apiKey?.trim();
  const rows = params.rows.filter((r) => r.plan_index >= 1).slice(0, MAX_ROWS);
  if (!apiKey || rows.length === 0) return new Map();

  const beforeUrls = (params.beforePhotoUrls ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, MAX_BEFORE_PHOTOS);
  const hasBeforePhotos = beforeUrls.length > 0;
  const candidateImageParts = buildCandidateProductImageVisionParts(rows);
  const hasCandidateProductImages = candidateImageParts.length > 0;
  const useMultimodal = hasBeforePhotos || hasCandidateProductImages;
  /** Keep large: jobContext already bundles scope + measurements + Q&A + walkthrough. */
  const jobLimit = useMultimodal ? 14_000 : 18_000;
  const quoteLimit = 12_000;

  const numbered = rows
    .map((r) => {
      const notes = r.notes?.trim() ? ` | notes: ${r.notes.trim().slice(0, 220)}` : "";
      const trade = r.trade && r.trade !== "general" ? `[${r.trade}] ` : "";
      const dq = r.draft_query.trim() ? r.draft_query.trim().slice(0, 220) : "(empty)";
      const entries = candidateEntriesForProbeRow(r);
      const candBlock =
        entries.length > 0
          ? `\n   Serp-backed candidates — copy **only** the https URLs below (character-for-character). Listing titles are from the store search; some rows also have matching **product photos** later in the message.\n${entries
              .map((e) =>
                e.title
                  ? `   - ${e.title}\n     ${e.link}`
                  : `   - ${e.link}`,
              )
              .join("\n")}`
          : "\n   Serp returned **no** candidate product URLs for the draft query — set `homedepot_urls: []` unless you are certain from other evidence; do **not** invent homedepot.com links.";
      return `${r.plan_index}. ${trade}${r.name.trim().slice(0, 180)}${notes} | draft_serp_query: ${dq}${candBlock}`;
    })
    .join("\n\n");

  const system = [
    "You are estimating **US Home Depot** shelf links for a remodeling job.",
    "Use **all** user message sections: contractor scope, **room measurements** (treat as authoritative for sizes), project Q&A, walkthrough notes, the **full quote** list, **before photos** when provided, **Serp listing titles**, optional **Serp product thumbnails** (same SKUs as the URLs), and each line’s draft search string.",
    "",
    "Step A — For every `plan_index` row, set **`shoppable_hd`** (boolean):",
    "- **true** when the line is (or includes) a **single** purchasable **physical** product or material a homeowner could buy at Home Depot (fixture, cabinet, tile SKU, valve, pan, etc.), even if labor is also mentioned.",
    "- **false** for pure labor, permits-only, demolition-only, dumpsters, allowances, PM fees, multi-item baskets without one target SKU, or lines that are clearly not one retail product.",
    "",
    "Step B — **`homedepot_urls`**:",
    "- If that row lists **Serp-backed candidate URLs**, you MUST copy **only** URLs from that list (exact string). Pick 0–3 that **actually fit** this job’s scope, measurements, and room (see rules below). Never add a URL not shown under that row.",
    "- If **no** candidate list is shown for a row, return **`homedepot_urls: []`** — do **not** guess homedepot.com URLs from memory (they are often wrong in API mode).",
    "- If **every** listed candidate is a poor fit (wrong size, wrong layout, wrong category), return **`homedepot_urls: []`** for that row rather than forcing a bad SKU.",
    "When **`shoppable_hd` is false**, **`homedepot_urls` must be []**.",
    "",
    "Fit rules (same judgment as a contractor comparing shelf product to the job):",
    "- **Measurements**: when the job context or line text specifies widths, lengths, rough openings, alcove sizes, vanity run inches, shower base dimensions, toilet rough-in, etc., **listing titles** and **product photos** that clearly imply a conflicting size (e.g. 30\" vanity vs 60\" double; 36×36 pan vs stated 60×32) mean that candidate must **not** be selected.",
    "- **Before photos + thumbnails**: use room type, fixture count, and obvious scale; reject candidates that would not plausibly work in that bathroom’s layout or scope (e.g. massive vanity wall unit for a small powder room line).",
    "- **Category / scope**: vanity **cabinet** vs vanity **light**; wall tile vs floor; caulk vs cabinet; one-piece alcove shower kits vs pan + **field tile** walls — keep prior discipline.",
    "",
    "Return a **JSON object** (no markdown). Top-level array key **`lines`** (preferred) or **`probes`** or **`results`**. Each element:",
    '`{"plan_index":1,"shoppable_hd":true,"homedepot_urls":["https://www.homedepot.com/p/..."]}`',
    "You may use **`line_index`** instead of `plan_index`, or one string field **`homedepot_url`** instead of an array.",
    "",
    "URL rules: **https**, hostname ending **homedepot.com**, product page — not search, not category, not homedepot.ca. Never invent digit sequences.",
  ].join("\n");

  const userText = [
    `Estimate title: ${params.bidTitle.trim().slice(0, 200)}`,
    "",
    "--- Composite job context (contractor scope, room measurements, project Q&A, walkthrough) ---",
    params.jobContext.trim().slice(0, jobLimit),
    "",
    ...(params.quoteLinesSummary.trim()
      ? [
          "--- Full material quote (every line — use for conflicts and room fit) ---",
          params.quoteLinesSummary.trim().slice(0, quoteLimit),
          "",
        ]
      : []),
    ...(hasBeforePhotos
      ? [
          "--- Before photos (current jobsite — use for room type, layout, existing fixtures) ---",
          "Images follow this block.",
          "",
        ]
      : []),
    ...(hasCandidateProductImages && !hasBeforePhotos
      ? [
          "--- Note: no before photos on this run — rely on measurements + quote text for size fit ---",
          "",
        ]
      : []),
    "--- Lines to classify (`shoppable_hd`) and optionally fill `homedepot_urls` (same `plan_index` as below) ---",
    numbered.slice(0, 12_000),
  ].join("\n");

  const userMessage: string | VisionPart[] = useMultimodal
    ? [
        { type: "text", text: userText },
        ...beforeUrls.map(
          (url, i): VisionPart => ({
            type: "image_url",
            image_url: { url, detail: i === 0 ? "high" : "low" },
          }),
        ),
        ...(hasCandidateProductImages
          ? [
              {
                type: "text" as const,
                text: "\n--- Serp candidate product images (same `plan_index` / URLs as above — judge fit vs job) ---\n",
              },
              ...candidateImageParts,
            ]
          : []),
      ]
    : userText;

  try {
    const body: Record<string, unknown> = {
      model: URL_PROBE_MODEL,
      temperature: 0.1,
      max_tokens: 6000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
    };
    if (!useMultimodal) {
      body.response_format = { type: "json_object" };
    }

    const builtInAbort =
      typeof AbortSignal !== "undefined" &&
      typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
        ? AbortSignal.timeout(OPENAI_URL_PLAN_HARD_MS + 2000)
        : abortSignalAfterMs(OPENAI_URL_PLAN_HARD_MS);
    const signal = mergeAbortSignals(params.signal, builtInAbort);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const plan = parseRetailHomedepotUrlPlanFromModelContent(raw);
    const allowedByPlan = new Map<number, Set<string>>();
    for (const row of rows) {
      allowedByPlan.set(row.plan_index, new Set(allowedHomedepotCandidateUrlsFromProbeRow(row)));
    }
    for (const [idx, entry] of plan) {
      const allowed = allowedByPlan.get(idx);
      if (allowed === undefined) {
        entry.urls = [];
        continue;
      }
      if (allowed.size > 0) {
        entry.urls = entry.urls.filter((u) => allowed.has(u.trim()));
      } else {
        /** Serp returned no candidates for this row — do not trust free-form model URLs. */
        entry.urls = [];
      }
    }
    return plan;
  } catch {
    return new Map();
  }
}
