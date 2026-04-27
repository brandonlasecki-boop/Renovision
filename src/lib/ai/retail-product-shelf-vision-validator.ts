/**
 * Vision pass: compares **job-site before photos** + **shelf product thumbnail** + line text to flag
 * obvious mismatches (wrong category, incompatible with room, kit vs site-built scope). When not ok,
 * returns a tighter Home Depot search string for a follow-up Serp call.
 */

const VISION_VALIDATE_MODEL =
  process.env.RETAIL_VISION_VALIDATE_MODEL?.trim().replace(/^["']|["']$/g, "") || "gpt-4o-mini";

const MAX_BEFORE_PHOTOS = 3;
const MAX_PRODUCT_ROWS = 12;

export type RetailShelfVisionProductRow = {
  /** 1-based index in this batch (model must echo it). */
  line_index: number;
  name: string;
  notes?: string;
  trade?: string;
  /** Winning shelf listing title (Home Depot or Lowe's). */
  product_title: string;
  /** HTTPS catalog image URL (Home Depot / Lowe's allowlisted host). */
  product_image_url: string;
};

export type RetailShelfVisionProductValidation = {
  line_index: number;
  ok: boolean;
  refined_hd_query?: string;
};

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

/** Exported for unit tests. */
export function parseRetailShelfVisionProductValidationsFromContent(
  text: string,
): RetailShelfVisionProductValidation[] {
  const parsed = parseJsonObject(text.trim());
  if (!parsed) return [];
  const raw = parsed.validations;
  if (!Array.isArray(raw)) return [];
  const out: RetailShelfVisionProductValidation[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const idx = typeof o.line_index === "number" ? o.line_index : Number(o.line_index);
    if (!Number.isFinite(idx) || idx < 1) continue;
    const ok = o.ok === true;
    const q =
      typeof o.refined_hd_query === "string"
        ? o.refined_hd_query.trim().slice(0, 200)
        : typeof o.refined_query === "string"
          ? o.refined_query.trim().slice(0, 200)
          : "";
    out.push({
      line_index: Math.floor(idx),
      ok,
      ...(ok || !q ? {} : { refined_hd_query: q }),
    });
  }
  return out;
}

/**
 * One multimodal OpenAI call: before photos + per-line text + product image each.
 * Only include rows with a usable `product_image_url`.
 */
export async function fetchRetailShelfVisionProductFitValidations(params: {
  apiKey: string | undefined;
  bidTitle: string;
  jobContext: string;
  quoteLinesSummary: string;
  beforePhotoUrls: string[];
  rows: RetailShelfVisionProductRow[];
  signal?: AbortSignal;
}): Promise<RetailShelfVisionProductValidation[]> {
  const apiKey = params.apiKey?.trim();
  const before = params.beforePhotoUrls.filter((u) => u.startsWith("http")).slice(0, MAX_BEFORE_PHOTOS);
  const rows = params.rows.slice(0, MAX_PRODUCT_ROWS);
  if (!apiKey || before.length === 0 || rows.length === 0) return [];

  const jobLimit = 4500;
  const system = [
    "You validate whether each **retail shelf product** (title + product image) is a **reasonable match** for one estimate line on a remodeling job, given **before** photos of the current room.",
    "Return JSON ONLY (no markdown). Shape:",
    '{"validations":[{"line_index":1,"ok":true},{"line_index":2,"ok":false,"refined_hd_query":"..."}]}',
    "",
    "Rules:",
    "- `line_index` must match the numbered LINE blocks below (1-based).",
    "- **ok:true** when the product could realistically be used for that line in a typical install matching the line text — even if the photo is messy or partially occluded.",
    "- Prefer **ok:true** when uncertain **unless** the listing title states a **numeric size** (width, length, rough-in, pan dimensions, sq ft per carton, gallons, BTU, etc.) that **clearly conflicts** with measurements or counts in the job context / line text — then **ok:false** (e.g. 30\" vanity vs 60\" double / 72\" run; 36×36 shower base vs stated 60×32 alcove; single-hole faucet vs widespread rough).",
    "- **ok:false** for **clear** problems: wrong product **category** vs the line (e.g. vanity cabinet for a faucet-only line; one-piece alcove shower kit for “shower pan + field tile walls”; floor tile SKU for shower-wall-only line; toilet for shower pan line); product obviously for a **different room type** than shown when the mismatch is stark; **obvious wrong scale** for the room implied by before photos when the product image + title show a fixture footprint that could not plausibly fit.",
    "- Use **before photos** for room type and rough layout — they do not need to show every fixture.",
    "- When **ok:false**, you MUST include `refined_hd_query`: a tight **Home Depot** web search string (max 14 words) that would better match the line + room context.",
    "- Do not judge price, brand tier, or finish taste — only fit/category/scope.",
  ].join("\n");

  const parts: VisionPart[] = [
    {
      type: "text",
      text: [
        `Estimate title: ${params.bidTitle.trim().slice(0, 200)}`,
        "",
        "--- Job context (scope, Q&A, measurements, walkthrough) ---",
        params.jobContext.trim().slice(0, jobLimit),
        "",
        ...(params.quoteLinesSummary.trim()
          ? [
              "--- Full quote (every line — context only) ---",
              params.quoteLinesSummary.trim().slice(0, 7200),
              "",
            ]
          : []),
        "--- BEFORE photos (current job site) ---",
        "The next images are the contractor’s **before** room photos.",
      ].join("\n"),
    },
  ];
  for (const url of before) {
    parts.push({ type: "image_url", image_url: { url, detail: "low" } });
  }
  parts.push({
    type: "text",
    text: "\n--- Lines to validate (each block: LINE text, then that line’s **shelf product** image) ---\n",
  });
  for (const r of rows) {
    const notes = r.notes?.trim() ? ` | notes: ${r.notes.trim().slice(0, 160)}` : "";
    const trade = r.trade && r.trade !== "general" ? `[${r.trade}] ` : "";
    parts.push({
      type: "text",
      text: [
        `LINE ${r.line_index}:`,
        `${trade}${r.name.trim().slice(0, 180)}${notes}`,
        `Shelf product title: ${r.product_title.trim().slice(0, 200)}`,
        "Product image follows.",
        "",
      ].join("\n"),
    });
    parts.push({
      type: "image_url",
      image_url: { url: r.product_image_url.trim(), detail: "low" },
    });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: params.signal,
      body: JSON.stringify({
        model: VISION_VALIDATE_MODEL,
        temperature: 0.08,
        max_tokens: 2200,
        messages: [
          { role: "system", content: system },
          { role: "user", content: parts },
        ],
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    return parseRetailShelfVisionProductValidationsFromContent(raw);
  } catch {
    return [];
  }
}
