/**
 * Serp-free path: one multimodal OpenAI call proposes **one** `homedepot.com` product page URL per
 * estimate line from full job context, quote, before photos, and optional line reference images.
 * URLs are shape-validated only (no Serp verification).
 */

import type { BidMaterialLine, BidMaterialTrade } from "@/types/bid";
import {
  extractHomedepotProductIdFromUrl,
  normalizeHomedepotProductUrl,
} from "@/lib/integrations/serpapi-homedepot";
import { normalizeRetailSkuDigits } from "@/lib/retail/retail-pricing-helpers";
import type { RetailHomedepotUrlPlanEntry } from "@/lib/ai/retail-homedepot-url-probe";

const DIRECT_MODEL =
  process.env.RETAIL_OPENAI_HD_DIRECT_MODEL?.trim().replace(/^["']|["']$/g, "") || "gpt-4o";

const MAX_ROWS = 40;
const MAX_BEFORE_PHOTOS = 4;
const MAX_LINE_REFERENCE_IMAGES = 10;
const OPENAI_HARD_MS = 120_000;

type VisionPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } };

export type RetailHomedepotDirectLinkRow = {
  plan_index: number;
  name: string;
  notes?: string;
  trade?: BidMaterialTrade;
  line_reference_image_url?: string;
};

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

function stripModelJsonFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
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

function extractLinesArray(parsed: Record<string, unknown>): unknown[] | null {
  for (const key of ["lines", "results", "material_lines"]) {
    const v = parsed[key];
    if (Array.isArray(v)) return v;
  }
  return null;
}

/** Exported for unit tests. */
export function parseDirectHomedepotLinksMapFromModelContent(
  text: string,
): Map<number, RetailHomedepotUrlPlanEntry & { productTitle?: string }> {
  const out = new Map<number, RetailHomedepotUrlPlanEntry & { productTitle?: string }>();
  const parsed = parseJsonObject(stripModelJsonFences(text.trim()));
  if (!parsed) return out;
  const rawLines = extractLinesArray(parsed);
  if (!rawLines) return out;
  for (const row of rawLines) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    let idx: number | null = null;
    for (const key of ["plan_index", "line_index", "row_index", "index"]) {
      const v = o[key];
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n >= 1) {
        idx = Math.floor(n);
        break;
      }
    }
    if (idx == null) continue;

    let shoppable = true;
    for (const key of ["shoppable_hd", "shoppable", "can_have_homedepot_product"]) {
      const v = o[key];
      if (v === false || v === "false" || v === 0 || v === "0") shoppable = false;
    }

    const urlRaw =
      o.homedepot_url ?? o.product_url ?? o.url ?? (Array.isArray(o.homedepot_urls) ? o.homedepot_urls[0] : null);
    const url = typeof urlRaw === "string" ? urlRaw.trim() : "";
    const titleRaw = o.product_title ?? o.hd_title ?? o.title;
    const productTitle = typeof titleRaw === "string" ? titleRaw.trim().slice(0, 280) : undefined;

    const urls: string[] = [];
    if (shoppable && url && isAllowedHomedepotProductPageUrl(url)) urls.push(url);

    out.set(idx, {
      shoppableHd: shoppable,
      urls,
      ...(productTitle ? { productTitle } : {}),
    });
  }
  return out;
}

/** Apply a Serp-free Home Depot product URL + optional listing title (no shelf price). */
export function applyOpenAiHomedepotProductUrlToLine(
  line: BidMaterialLine,
  productPageUrl: string,
  productTitle?: string,
): void {
  const url = productPageUrl.trim();
  if (!isAllowedHomedepotProductPageUrl(url)) return;

  const t = (productTitle ?? "").trim();
  const pid = extractHomedepotProductIdFromUrl(url);
  line.hd_product_url = normalizeHomedepotProductUrl(url, { productId: pid ?? undefined, title: t || line.name });
  line.hd_title = t || line.name.trim().slice(0, 280);
  const norm = pid ? normalizeRetailSkuDigits(pid) : undefined;
  line.hd_product_id = norm ?? (pid ? pid.replace(/\D/g, "").slice(0, 12) : undefined);
  line.hd_fetched_at = new Date().toISOString();

  delete line.hd_unit_price_usd;
  delete line.hd_price_raw;
  delete line.hd_price_was_usd;
  delete line.hd_percentage_off;
  delete line.hd_price_badge;
  delete line.hd_image_url;
}

/**
 * One OpenAI multimodal call: full job context + quote + before photos + optional per-line
 * reference images → at most one `https://www.homedepot.com/p/...` URL per `plan_index`.
 */
export async function fetchRetailHomedepotDirectLinksBatch(params: {
  apiKey: string | undefined;
  bidTitle: string;
  jobContext: string;
  quoteLinesSummary: string;
  beforePhotoUrls: string[];
  rows: RetailHomedepotDirectLinkRow[];
  signal?: AbortSignal;
}): Promise<Map<number, RetailHomedepotUrlPlanEntry & { productTitle?: string }>> {
  const apiKey = params.apiKey?.trim();
  const rows = params.rows.filter((r) => r.plan_index >= 1).slice(0, MAX_ROWS);
  if (!apiKey || rows.length === 0) return new Map();

  const beforeUrls = params.beforePhotoUrls.filter((u) => u.startsWith("http")).slice(0, MAX_BEFORE_PHOTOS);

  const numbered = rows
    .map((r) => {
      const notes = r.notes?.trim() ? ` | notes: ${r.notes.trim().slice(0, 220)}` : "";
      const trade = r.trade && r.trade !== "general" ? `[${r.trade}] ` : "";
      const ref = r.line_reference_image_url?.startsWith("http")
        ? " | has_line_reference_image: yes (image follows in message)"
        : "";
      return `${r.plan_index}. ${trade}${r.name.trim().slice(0, 200)}${notes}${ref}`;
    })
    .join("\n\n");

  const system = [
    "You link **US Home Depot** (`homedepot.com`) **product detail pages** to remodeling estimate lines.",
    "You receive: contractor job context (scope, **measurements**, Q&A, walkthrough), the **full material quote**, **before** photos of the job site, and optional **per-line reference** images.",
    "",
    "For every `plan_index` row:",
    "1) Set **`shoppable_hd`**: true when the line is (or includes) one purchasable physical product/material a homeowner could buy at Home Depot; false for labor-only, permits-only, allowances, dumpsters, PM-only, etc.",
    "2) When **`shoppable_hd` is true**, output exactly **one** field **`homedepot_url`**: a single `https://www.homedepot.com/p/...` product page you believe is a **strong real-world match** for that line given **measurements**, room type from photos, and the quote. Prefer URLs you are confident exist (correct style path and a plausible numeric product id).",
    "3) When **`shoppable_hd` is false** or you cannot find a confident match, set **`homedepot_url` to null** (or omit it). Do **not** guess a URL.",
    "4) Optionally set **`product_title`** to the listing name you intend (short).",
    "",
    "Fit rules: respect widths, rough-ins, vanity runs, shower base sizes, tile field vs accent, valve-only vs trim kit, caulk vs cabinet — reject mismatches with shoppable false or null URL.",
    "Never output homedepot.ca, search URLs, or category-only pages.",
    "",
    "Return **JSON only** (no markdown). Top-level key **`lines`**: array of objects:",
    '`{"plan_index":1,"shoppable_hd":true,"homedepot_url":"https://www.homedepot.com/p/...","product_title":"..."}`',
  ].join("\n");

  const userText = [
    `Estimate title: ${params.bidTitle.trim().slice(0, 200)}`,
    "",
    "--- Composite job context ---",
    params.jobContext.trim().slice(0, 16_000),
    "",
    ...(params.quoteLinesSummary.trim()
      ? [
          "--- Full material quote (every line) ---",
          params.quoteLinesSummary.trim().slice(0, 12_000),
          "",
        ]
      : []),
    ...(beforeUrls.length > 0
      ? ["--- Before photos (job site) — images follow ---", ""]
      : ["--- No before photos — use text only ---", ""]),
    "--- Lines to link (plan_index matches your JSON) ---",
    numbered.slice(0, 10_000),
  ].join("\n");

  const parts: VisionPart[] = [{ type: "text", text: userText }];

  for (const url of beforeUrls) {
    parts.push({ type: "image_url", image_url: { url, detail: "high" } });
  }

  let refCount = 0;
  for (const r of rows) {
    const u = r.line_reference_image_url?.trim();
    if (!u?.startsWith("http")) continue;
    if (refCount >= MAX_LINE_REFERENCE_IMAGES) break;
    parts.push({
      type: "text",
      text: `\n--- Reference image for plan_index=${r.plan_index} ---\n`,
    });
    parts.push({ type: "image_url", image_url: { url: u, detail: "low" } });
    refCount++;
  }

  const builtIn =
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
      ? AbortSignal.timeout(OPENAI_HARD_MS + 2000)
      : abortSignalAfterMs(OPENAI_HARD_MS);
  const signal = mergeAbortSignals(params.signal, builtIn);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        model: DIRECT_MODEL,
        temperature: 0.15,
        max_tokens: 8000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: parts },
        ],
      }),
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    return parseDirectHomedepotLinksMapFromModelContent(raw);
  } catch {
    return new Map();
  }
}

export function isAllowedHomedepotDirectProductPageUrl(raw: string): boolean {
  return isAllowedHomedepotProductPageUrl(raw);
}
