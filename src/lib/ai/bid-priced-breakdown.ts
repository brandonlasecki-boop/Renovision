import { randomUUID } from "crypto";
import { normalizeMaterialTrade } from "@/lib/bid-scope";
import type { BidMaterialLine, BidMaterialTrade } from "@/types/bid";

const CHAT_MODEL = "gpt-4o";

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

function sellFromCostMarkup(unitCost: number, markupPct: number): number {
  const c = Math.max(0, unitCost);
  const m = Number.isFinite(markupPct) ? markupPct : 0;
  return Math.round(c * (1 + m / 100) * 100) / 100;
}

/**
 * Expand saved scope lines into a priced takeoff: every scope item accounted for,
 * plus typical ancillary supplies (grout, caulk, fasteners, tape, consumables, fees, etc.).
 */
export async function fetchPricedBreakdownFromOpenAI(params: {
  apiKey: string;
  compositeScope: string;
  scopeLines: { name: string; trade?: string; quantity: number; unit: string; notes?: string }[];
}): Promise<BidMaterialLine[]> {
  const { apiKey, compositeScope, scopeLines } = params;

  const scopeJson = JSON.stringify(scopeLines, null, 0);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.2,
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            `You are estimating a US residential remodeling job.`,
            `You will receive (1) full project context and (2) a JSON array "scope_lines" of line items the contractor already agreed on for scope (names, trades, quantities, units).`,
            ``,
            `Output ONE JSON object ONLY (no markdown) with shape:`,
            `{"lines":[{"name":"string","trade":"general|electrical|plumbing|hvac|drywall|flooring|paint|cabinetry|tile|labor|permits|other","quantity":number,"unit":"string","unit_cost_usd":number,"markup_pct":number,"notes":"optional string"}]}`,
            ``,
            `CRITICAL — do not omit scope work:`,
            `- Every scope line in scope_lines must be represented in your output: either as its own line with a matching or clearly equivalent name, OR split into multiple lines where each sub-line's notes begin with "Covers: " followed by the exact scope line name it satisfies.`,
            `- Add separate lines for ALL typical ancillary and consumable items implied by that scope: examples include grout, thinset, caulk, sealant, primer, sandpaper, blades, screws/fasteners, shims, wire nuts, tape, joint compound, disposable materials, blade/PPG, small tools, haul-off, permit fees when applicable, and similar. Use realistic quantities and units.`,
            `- Do not leave out "small" items — they add up and belong in the quote.`,
            `- No duplicate scope for the same physical install: if scope_lines already includes a vanity+countertop or a vanity that implies a top, do not add a second priced line for the same vanity countertop (e.g. both "granite vanity top" and "supply vanity with quartz top"). Merge intent into one coherent line or use notes to reference a single install.`,
            `- If a scope line or its notes states the vanity **includes / comes with** a faucet, do **not** add a separate **supply** line for that same included faucet (avoid double-counting retail SKUs). Labor to connect an included faucet may stay on the vanity install line or a brief hookup line with notes.`,
            `- Floor tile scope lines must price **tile, grout, underlayment** appropriate for floors — never substitute a vanity cabinet or vanity combo product for a line whose title is clearly floor tile.`,
            ``,
            `Pricing fields:`,
            `- unit_cost_usd: your best estimate of all-in cost per unit for that line (USD, 0+) — homeowner-facing ballpark.`,
            `- markup_pct: MUST be 0 on every line (sell price equals unit cost per unit in the app).`,
            `- quantity and unit: realistic (ea, sq ft, LF, hours, gal, box, bag, etc.).`,
            ``,
            `--- Project context ---`,
            compositeScope.slice(0, 20000),
            ``,
            `--- scope_lines (must all be covered) ---`,
            scopeJson.slice(0, 12000),
          ].join("\n"),
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Could not parse priced breakdown JSON.");
  }

  const list = parsed.lines;
  if (!Array.isArray(list)) {
    return [];
  }

  const out: BidMaterialLine[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const trade = normalizeMaterialTrade(o.trade) as BidMaterialTrade;
    const quantity =
      typeof o.quantity === "number" ? o.quantity : Number(o.quantity) || 1;
    const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim() : "ea";
    const notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim() : undefined;
    const unit_cost_usd = Math.max(
      0,
      typeof o.unit_cost_usd === "number"
        ? o.unit_cost_usd
        : Number(o.unit_cost_usd) || 0,
    );
    const markup_pct = 0;
    const unit_price_usd = sellFromCostMarkup(unit_cost_usd, markup_pct);
    const q = Math.max(0, quantity);
    const extended_usd = Math.round(q * unit_price_usd * 100) / 100;
    const line_id = randomUUID();
    out.push({
      line_id,
      name,
      quantity: q,
      unit,
      unit_cost_usd,
      markup_pct,
      unit_price_usd,
      extended_usd,
      mockup_include: false,
      ...(trade !== "general" ? { trade } : {}),
      ...(notes ? { notes } : {}),
    });
  }

  return out;
}
