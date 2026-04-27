/**
 * Batched OpenAI pass **after** per-line draft queries (`suggestHomeDepotSearchOrSkip`) and
 * **before** SerpApi Home Depot / Lowe's calls. Sees the whole quote + every draft string so it can
 * fix category mismatches and duplicate-query collisions before shelf search runs.
 */

const QUERY_PLAN_MODEL = "gpt-4o-mini";

export type RetailSerpQueryPlanRow = {
  /** 1-based index; must match batch array order sent to the model. */
  plan_index: number;
  name: string;
  notes?: string;
  trade?: string;
  /** Draft string from the per-line suggest step (may be empty when suggest said skip). */
  draft_query: string;
  suggest_skip: boolean;
  /** True when the per-line OpenAI suggest call failed and a heuristic fallback built `draft_query`. */
  suggest_failed: boolean;
};

export type RetailSerpQueryPlanEntry = {
  skip: boolean;
  hd_query: string;
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

/** Exported for unit tests. */
export function parseRetailSerpQueryPlanFromModelContent(text: string): Map<number, RetailSerpQueryPlanEntry> {
  const out = new Map<number, RetailSerpQueryPlanEntry>();
  const parsed = parseJsonObject(text.trim());
  if (!parsed) return out;
  const plans = parsed.plans;
  if (!Array.isArray(plans)) return out;
  for (const row of plans) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const idx = typeof o.plan_index === "number" ? o.plan_index : Number(o.plan_index);
    if (!Number.isFinite(idx) || idx < 1) continue;
    const skip = o.skip === true;
    const q =
      typeof o.hd_query === "string"
        ? o.hd_query.trim().slice(0, 220)
        : typeof o.q === "string"
          ? o.q.trim().slice(0, 220)
          : typeof o.search_query === "string"
            ? o.search_query.trim().slice(0, 220)
            : "";
    out.set(Math.floor(idx), { skip, hd_query: skip ? "" : q });
  }
  return out;
}

type VisionPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } };

const MAX_ROWS = 40;

/**
 * One OpenAI call over all lines that will hit Serp next. Validates or rewrites each
 * `draft_query` so SerpApi receives coherent, category-correct Home Depot / Lowe's search strings.
 */
export async function fetchRetailSerpQueryPlanBatch(params: {
  apiKey: string | undefined;
  bidTitle: string;
  jobContext: string;
  quoteLinesSummary: string;
  beforePhotoUrls?: string[];
  rows: RetailSerpQueryPlanRow[];
  signal?: AbortSignal;
}): Promise<Map<number, RetailSerpQueryPlanEntry>> {
  const apiKey = params.apiKey?.trim();
  const rows = params.rows.filter((r) => r.plan_index >= 1).slice(0, MAX_ROWS);
  if (!apiKey || rows.length === 0) return new Map();

  const beforeUrls = (params.beforePhotoUrls ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, 4);
  const hasVision = beforeUrls.length > 0;
  const jobLimit = hasVision ? 4800 : 6800;

  const numbered = rows
    .map((r) => {
      const notes = r.notes?.trim() ? ` | notes: ${r.notes.trim().slice(0, 160)}` : "";
      const trade = r.trade && r.trade !== "general" ? `[${r.trade}] ` : "";
      const flags = [
        r.suggest_skip ? "suggest_skip=true" : "",
        r.suggest_failed ? "suggest_failed=true" : "",
      ]
        .filter(Boolean)
        .join(", ");
      const flagSeg = flags ? ` | ${flags}` : "";
      const dq = r.draft_query.trim() ? r.draft_query.trim().slice(0, 200) : "(empty)";
      return `${r.plan_index}. ${trade}${r.name.trim().slice(0, 160)}${notes}${flagSeg} | draft_serp_query: ${dq}`;
    })
    .join("\n");

  const system = [
    "You validate retailer **search queries** for a remodeling estimate before a script runs Home Depot + Lowe's web search (SerpApi).",
    "Return JSON ONLY (no markdown). Shape:",
    '{"plans":[{"plan_index":1,"skip":false,"hd_query":"..."},{"plan_index":2,"skip":true}]}',
    "",
    "Each `plan_index` matches the numbered row you were given (1-based).",
    "",
    "Rules:",
    "- `skip:true` only when the line is truly not one shoppable product (demolition-only, permits, pure labor, dumpster, misc fastener basket, etc.). When in doubt, `skip:false` with a tight product query.",
    "- `hd_query`: a concrete **US big-box web search string** (max 14 words) for the **exact product class** this line buys — same string is used for Home Depot and Lowe's search engines.",
    "- Use `draft_serp_query` as a starting point: if it already matches the line’s product class and is not confused with another row, you may lightly tighten it. If it is **wrong category**, **wrong fixture**, or would **collide** with another row’s intent, rewrite `hd_query`.",
    "- **Vanity cabinet** lines: `hd_query` must target a bathroom vanity cabinet or combo — never a vanity **light**, faucet, mirror, or shower door unless the line explicitly buys that item.",
    "- **Vanity light / sconce / bath fixture** lines: `hd_query` must target a **light fixture** — never a vanity cabinet SKU.",
    "- **Faucet / lavatory / deck-mount** lines (not cabinet lines): `hd_query` must target a **faucet** — never a vanity cabinet.",
    "- **Sealant / caulk / silicone** lines: `hd_query` must lead with kitchen & bath silicone or tub & tile caulk — never a vanity cabinet, toilet, or shower door.",
    "- **Toilet fixture** install lines: `hd_query` must target a **complete toilet** — never a repair kit, wax ring only, or fill valve unless the line explicitly buys that part.",
    "- **Shower wall tile** (field tile, not pan): include wall tile / porcelain / ceramic / mosaic — not shower doors, acrylic surrounds, or vanities.",
    "- **Shower pan + tile walls** (site-built): `hd_query` must target **field tile and/or a standalone pan/base** — never a **one-SKU alcove or solid/composite shower kit** with molded walls + pan (e.g. “Subway … alcove shower kit with walls”).",
    "- **Floor tile** lines: include floor tile — not shower-only wall tile unless the line says both.",
    "- When two rows would use the **same** ambiguous query but need **different** SKUs, differentiate `hd_query` with distinguishing words from each line (width, double sink, finish, etc.).",
    "- If `suggest_skip=true` but the line text is clearly a purchasable product, set `skip:false` and provide `hd_query`.",
    "- If `draft_serp_query` is empty and the line is shoppable, invent a good `hd_query` from name + notes + job context.",
    "- When **before photos** are attached: use them only for room/fixture context — `hd_query` must still be retailer search tokens, not a photo description.",
  ].join("\n");

  const userText = [
    `Estimate title: ${params.bidTitle.trim().slice(0, 200)}`,
    "",
    "--- Job context (scope, Q&A, measurements, walkthrough) ---",
    params.jobContext.trim().slice(0, jobLimit),
    "",
    ...(params.quoteLinesSummary.trim()
      ? [
          "--- Full quote (every line — avoid duplicate / wrong-class queries across rows) ---",
          params.quoteLinesSummary.trim().slice(0, 8200),
          "",
        ]
      : []),
    "--- Lines to validate (each plan_index gets one Serp search) ---",
    numbered.slice(0, 12000),
  ].join("\n");

  const userMessage: string | VisionPart[] = hasVision
    ? [
        { type: "text", text: userText },
        ...beforeUrls.map(
          (url): VisionPart => ({
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
      signal: params.signal,
      body: JSON.stringify({
        model: QUERY_PLAN_MODEL,
        temperature: 0.08,
        max_tokens: 2800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) return new Map();
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    return parseRetailSerpQueryPlanFromModelContent(raw);
  } catch {
    return new Map();
  }
}
