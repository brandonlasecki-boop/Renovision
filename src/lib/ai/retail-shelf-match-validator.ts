/**
 * One batched OpenAI pass over the **whole quote** + job context to spot obvious SerpApi
 * category mismatches (e.g. vanity light on a shower-trim line) and suggest tighter HD queries.
 */

const VALIDATOR_MODEL = "gpt-4o-mini";

type ValidatorImagePart = {
  type: "image_url";
  image_url: { url: string; detail: "low" | "high" | "auto" };
};
type ValidatorTextPart = { type: "text"; text: string };

export type RetailShelfMatchCorrection = {
  /** 1-based index into the numbered retail summary sent to the model. */
  line_index: number;
  ok: boolean;
  /** When ok is false: concrete Home Depot search string (≤14 words). */
  refined_hd_query?: string;
};

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

function readCorrections(raw: unknown): RetailShelfMatchCorrection[] {
  if (!Array.isArray(raw)) return [];
  const out: RetailShelfMatchCorrection[] = [];
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

/** Parse model JSON/text (handles extra prose around `{...}`). Exported for unit tests. */
export function parseRetailShelfMatchCorrectionsFromModelContent(text: string): RetailShelfMatchCorrection[] {
  const parsed = parseJsonObject(text);
  if (!parsed) return [];
  return readCorrections(parsed.corrections);
}

/**
 * Returns suggested corrections for lines whose shelf titles look mismatched vs scope + line text.
 * Empty array on missing key, HTTP error, or invalid JSON.
 */
export async function fetchRetailShelfMatchCorrections(params: {
  apiKey: string | undefined;
  bidTitle: string;
  /** Composite job context (scope, Q&A, measurements, walkthrough). */
  jobContext: string;
  /** Pre-rendered numbered block (1..n) of lines + HD/LW titles (+ HD_ID when known). */
  numberedRetailLines: string;
  /** Signed job **before** photo URLs (max 4) — optional vision for site context. */
  beforePhotoUrls?: string[];
  /** All quote lines (name + notes) for line-specific scope and duplicate checks. */
  quoteLinesSummary?: string;
}): Promise<RetailShelfMatchCorrection[]> {
  const apiKey = params.apiKey?.trim();
  if (!apiKey) return [];

  const beforeUrls = (params.beforePhotoUrls ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, 4);
  const hasVision = beforeUrls.length > 0;
  const jobLimit = hasVision ? 5200 : 7200;

  const system = [
    "You validate Home Depot / Lowe's shelf matches for a remodeling estimate.",
    "Return JSON ONLY (no markdown). Shape:",
    '{"corrections":[{"line_index":1,"ok":true},{"line_index":2,"ok":false,"refined_hd_query":"..."}]}',
    "",
    "Rules:",
    "- `line_index` refers to the numbered rows in the user block (1-based).",
    "- Set ok:true when the shown product title is a reasonable shoppable match for that line (trade + description + scope).",
    "- Set ok:false when the category is clearly wrong (examples: vanity/bath **light** on a shower valve or trim line; **vanity cabinet** on faucet-only or rough-supply lines; **single small vanity** when the line says **double** / **integrated sinks**; **floor tile** on shower-wall-only lines; unrelated decor).",
    "- **Sealant, caulk, silicone, tub-and-tile**: ok:false if the product is a **vanity cabinet**, vanity combo, toilet, faucet, or shower door — even when the line says 'for vanity' or 'for shower' (that is **location**, not the product type). refined_hd_query must be a caulk/sealant string (e.g. kitchen bath silicone sealant, DAP kitchen bath adhesive caulk).",
    "- **Toilet fixture** lines (install / replace / new toilet): ok:false if the product is a **toilet repair kit**, fill valve, flapper kit, wax ring, or tank-only rebuild — refined_hd_query must target a **complete toilet** (e.g. two piece elongated toilet 1.28 gpf white).",
    "- **Tub-to-shower conversion, new shower pan/base, shower wall / wet-area tile (line does NOT name a toilet install)**: ok:false if the product is a **toilet** (one-piece, two-piece, toilet bowl, complete toilet package) or toilet-centric SKU — refined_hd_query must target **shower pan/base and/or shower wall tile / waterproofing** as the line describes (e.g. single threshold shower base 60x32 white porcelain shower wall tile).",
    "- **Tub-to-shower + tile walls (site-built tile, not surround boards)**: ok:false if the product is a **prefab shower/tub surround kit**, **wedi/foam wall board kit**, **glue-up acrylic wall panels**, **solid/composite stone alcove shower kit with walls + pan**, **one-SKU shower kit with walls**, or similar **non-field-tile** wall system when the line calls for **porcelain/ceramic/mosaic tile on shower walls** or **shower pan + tile walls** — refined_hd_query must target **wall tile** and/or a **standalone shower pan/base** (e.g. white subway porcelain shower wall tile 3x6; single threshold shower base 60x32 white).",
    "- **Duplicate HD_ID**: when the same Home Depot **HD_ID** appears on two rows with clearly different line intent (not intentional pairs like two sconces), set ok:false on the weaker-matching row with refined_hd_query that targets the correct product class for that row.",
    "- When **before photos** are attached: use them only to sanity-check room/fixture context — still decide from line text + titles; photos do not replace reading the line.",
    "- When ok:false, you MUST include `refined_hd_query`: a tight **Home Depot** web search string (max 14 words) that would surface the right product class — not a sentence.",
    "- Do not flag price level or brand preference — only **wrong product type**.",
    "- If unsure, ok:true (do not churn SKUs).",
    "- Omit rows you did not evaluate; every correction must use a valid line_index from the user list.",
  ].join("\n");

  const userParts = [
    `Estimate title: ${params.bidTitle.trim().slice(0, 200)}`,
    "",
    "--- Initial scope + Q&A + measurements + walkthrough ---",
    params.jobContext.trim().slice(0, jobLimit),
    "",
  ];
  const qsum = (params.quoteLinesSummary ?? "").trim();
  if (qsum) {
    userParts.push("--- Full quote (every line's name + line notes = per-line scope) ---", qsum.slice(0, 8200), "");
  }
  userParts.push(
    "--- Lines with shelf matches (evaluate each line_index; HD_ID = Home Depot product id when shown) ---",
    params.numberedRetailLines.trim().slice(0, 11000),
  );
  const userText = userParts.join("\n");

  const userMessage: string | Array<ValidatorTextPart | ValidatorImagePart> = hasVision
    ? [
        { type: "text", text: userText },
        ...beforeUrls.map(
          (url): ValidatorImagePart => ({
            type: "image_url",
            image_url: { url, detail: "low" },
          }),
        ),
      ]
    : userText;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VALIDATOR_MODEL,
        temperature: 0.1,
        max_tokens: 2500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    return parseRetailShelfMatchCorrectionsFromModelContent(raw);
  } catch {
    return [];
  }
}
