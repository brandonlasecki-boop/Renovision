/**
 * After URL-probe SKUs resolve via Serp `home_depot_product`, pick **one** hit that fits the job
 * (measurements, scope, before photos + product images) — or reject all so we fall back to text search.
 * Without this, the **first** resolved URL wins even when a later candidate or none would fit.
 */

import type { HomeDepotSearchHit } from "@/lib/integrations/serpapi-homedepot";
import { isAllowedHomedepotProductImageUrl } from "@/lib/integrations/serpapi-homedepot";

const PICK_MODEL =
  process.env.RETAIL_HD_PROBE_PICK_MODEL?.trim().replace(/^["']|["']$/g, "") || "gpt-4o-mini";

const MAX_BEFORE_PHOTOS = 3;
const MAX_HITS = 3;
const PICK_HARD_MS = 55_000;

type VisionPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } };

function probePostPickEnabled(): boolean {
  const raw = (process.env.RETAIL_HD_PROBE_POST_PICK ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "no";
}

function stripModelJsonFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

/** @returns choice index 0..n-1, or -1 if none fit / invalid */
export function parseProbePickChoiceIndexFromModelContent(text: string): number {
  let t = stripModelJsonFences(text.trim());
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  const slice = start >= 0 && end > start ? t.slice(start, end + 1) : t;
  try {
    const o = JSON.parse(slice) as Record<string, unknown>;
    const v = o.choice_index ?? o.choiceIndex ?? o.pick ?? o.index;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return -1;
    return Math.trunc(n);
  } catch {
    return -1;
  }
}

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

async function pickWithVision(params: {
  apiKey: string;
  bidTitle: string;
  jobContext: string;
  quoteLinesSummary: string;
  beforePhotoUrls: string[];
  line: { name: string; notes?: string; trade?: string };
  hits: HomeDepotSearchHit[];
  signal?: AbortSignal;
}): Promise<number> {
  const before = params.beforePhotoUrls.filter((u) => u.startsWith("http")).slice(0, MAX_BEFORE_PHOTOS);
  const hits = params.hits.slice(0, MAX_HITS);

  const system = [
    "You are the **final gate** before a Home Depot shelf SKU is attached to one estimate line on a remodel.",
    "You see **before** photos of the job site, the job context (including **measurements**), the full quote for cross-line context, the line text, and up to three **candidate products** (listing title + URL + product photo when available).",
    "",
    "Return **JSON only** (no markdown). Shape: {\"choice_index\": <integer>}",
    "- `choice_index` is **0-based**: the single candidate that **clearly fits** this line and job (size, category, layout, scope).",
    "- Use **choice_index: -1** when **no** candidate is acceptable — including when you would tell the homeowner **not** to buy any of them for this bathroom/kitchen as scoped (wrong footprint, wrong dimensions in the title vs stated measurements, wrong category, kit vs site-built tile, etc.).",
    "- Be **strict**: if a candidate might work but you are not confident it matches stated widths, rough openings, vanity run, shower base size, toilet rough-in, etc., prefer **-1** over guessing.",
    "- Prefer **-1** over picking a product that contradicts numeric dimensions in the job context or line notes.",
    "- Candidates without a product image in the message must still be judged from their **title** text; if that title implies a bad fit, do not pick that index.",
  ].join("\n");

  const trade = params.line.trade && params.line.trade !== "general" ? `[${params.line.trade}] ` : "";
  const notes = params.line.notes?.trim() ? ` | notes: ${params.line.notes.trim().slice(0, 220)}` : "";
  const lineBlock = `${trade}${params.line.name.trim().slice(0, 200)}${notes}`;

  const parts: VisionPart[] = [
    {
      type: "text",
      text: [
        `Estimate title: ${params.bidTitle.trim().slice(0, 200)}`,
        "",
        "--- Job context (scope, measurements, Q&A, walkthrough) ---",
        params.jobContext.trim().slice(0, 12_000),
        "",
        ...(params.quoteLinesSummary.trim()
          ? [
              "--- Full quote (context) ---",
              params.quoteLinesSummary.trim().slice(0, 8000),
              "",
            ]
          : []),
        "--- Line this shelf row is for ---",
        lineBlock,
        "",
        "--- Before photos (current site) ---",
      ].join("\n"),
    },
  ];
  for (const url of before) {
    parts.push({ type: "image_url", image_url: { url, detail: "low" } });
  }

  parts.push({
    type: "text",
    text: "\n--- Candidate products (pick **at most one** by choice_index) ---\n",
  });

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]!;
    const title = h.title.trim().slice(0, 260);
    const link = h.link.trim().slice(0, 400);
    parts.push({
      type: "text",
      text: [
        `OPTION ${i} (choice_index=${i} if this is the only acceptable SKU):`,
        `Title: ${title}`,
        `URL: ${link}`,
        h.image_url && isAllowedHomedepotProductImageUrl(h.image_url) ? "Product image:" : "(no allowlisted product image — judge from title only)",
        "",
      ].join("\n"),
    });
    if (h.image_url && isAllowedHomedepotProductImageUrl(h.image_url)) {
      parts.push({
        type: "image_url",
        image_url: { url: h.image_url.trim(), detail: "low" },
      });
    }
  }

  parts.push({
    type: "text",
    text: '\nReturn JSON only, e.g. {"choice_index":0} or {"choice_index":-1}.',
  });

  const builtIn =
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
      ? AbortSignal.timeout(PICK_HARD_MS)
      : abortSignalAfterMs(PICK_HARD_MS);
  const signal =
    params.signal &&
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.any === "function"
      ? AbortSignal.any([params.signal, builtIn])
      : params.signal ?? builtIn;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: PICK_MODEL,
      temperature: 0.05,
      max_tokens: 400,
      messages: [
        { role: "system", content: system },
        { role: "user", content: parts },
      ],
    }),
  });
  if (!res.ok) return -1;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  return parseProbePickChoiceIndexFromModelContent(raw);
}

async function pickTextOnly(params: {
  apiKey: string;
  bidTitle: string;
  jobContext: string;
  quoteLinesSummary: string;
  line: { name: string; notes?: string; trade?: string };
  hits: HomeDepotSearchHit[];
  signal?: AbortSignal;
}): Promise<number> {
  const hits = params.hits.slice(0, MAX_HITS);
  const system = [
    "You gate Home Depot SKUs for one remodel line. No photos — use job context (especially **measurements**), quote, and each listing **title**.",
    "Return JSON only: {\"choice_index\": <integer>}. 0-based index of the **one** SKU that clearly fits, or **-1** if none do.",
    "Be strict: title dimensions that conflict with the job → -1. When uncertain, prefer **-1**.",
  ].join("\n");

  const trade = params.line.trade && params.line.trade !== "general" ? `[${params.line.trade}] ` : "";
  const notes = params.line.notes?.trim() ? ` | notes: ${params.line.notes.trim().slice(0, 220)}` : "";
  const opts = hits
    .map((h, i) => `${i}. ${h.title.trim().slice(0, 240)}\n   ${h.link.trim().slice(0, 380)}`)
    .join("\n\n");

  const userText = [
    `Estimate title: ${params.bidTitle.trim().slice(0, 200)}`,
    "",
    "--- Job context ---",
    params.jobContext.trim().slice(0, 14_000),
    "",
    ...(params.quoteLinesSummary.trim()
      ? ["--- Quote ---", params.quoteLinesSummary.trim().slice(0, 9000), ""]
      : []),
    "--- Line ---",
    `${trade}${params.line.name.trim().slice(0, 200)}${notes}`,
    "",
    "--- Candidates (choice_index 0 .. " + String(hits.length - 1) + ", or -1) ---",
    opts,
  ].join("\n");

  const builtIn =
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === "function"
      ? AbortSignal.timeout(PICK_HARD_MS)
      : abortSignalAfterMs(PICK_HARD_MS);
  const signal =
    params.signal &&
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.any === "function"
      ? AbortSignal.any([params.signal, builtIn])
      : params.signal ?? builtIn;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: PICK_MODEL,
      temperature: 0.05,
      max_tokens: 350,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return -1;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  return parseProbePickChoiceIndexFromModelContent(raw);
}

/**
 * @returns chosen hit, or `null` when every candidate should be rejected (caller should fall back to text search).
 */
export async function pickHomeDepotUrlProbeHitOrNull(params: {
  apiKey: string | undefined;
  bidTitle: string;
  jobContext: string;
  quoteLinesSummary: string;
  beforePhotoUrls: string[];
  line: { name: string; notes?: string; trade?: string };
  hits: HomeDepotSearchHit[];
  signal?: AbortSignal;
}): Promise<HomeDepotSearchHit | null> {
  const hits = params.hits.filter((h) => h && h.link.trim().startsWith("http")).slice(0, MAX_HITS);
  if (hits.length === 0) return null;
  if (!probePostPickEnabled()) return hits[0] ?? null;

  const apiKey = params.apiKey?.trim();
  if (!apiKey) return hits[0] ?? null;

  const before = params.beforePhotoUrls.filter((u) => u.startsWith("http")).slice(0, MAX_BEFORE_PHOTOS);

  try {
    const idx =
      before.length > 0
        ? await pickWithVision({
            apiKey,
            bidTitle: params.bidTitle,
            jobContext: params.jobContext,
            quoteLinesSummary: params.quoteLinesSummary,
            beforePhotoUrls: before,
            line: params.line,
            hits,
            signal: params.signal,
          })
        : await pickTextOnly({
            apiKey,
            bidTitle: params.bidTitle,
            jobContext: params.jobContext,
            quoteLinesSummary: params.quoteLinesSummary,
            line: params.line,
            hits,
            signal: params.signal,
          });

    if (idx < 0 || idx >= hits.length) return null;
    return hits[idx] ?? null;
  } catch {
    return null;
  }
}
