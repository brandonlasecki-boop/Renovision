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

export type PerLinePricingInput = {
  line_id: string;
  name: string;
  trade?: BidMaterialTrade;
  quantity: number;
  unit: string;
  notes?: string;
};

/**
 * Fill unit_cost_usd and markup_pct for each existing scope line (same line_ids);
 * does not add or remove line items.
 */
export async function fetchPerLineQuotePricingFromOpenAI(params: {
  apiKey: string;
  compositeScope: string;
  lines: PerLinePricingInput[];
}): Promise<
  { line_id: string; unit_cost_usd: number; markup_pct: number }[]
> {
  const { apiKey, compositeScope, lines } = params;
  if (lines.length === 0) {
    return [];
  }

  const payload = JSON.stringify(
    lines.map((l) => ({
      line_id: l.line_id,
      name: l.name,
      trade: l.trade ?? "general",
      quantity: l.quantity,
      unit: l.unit,
      notes: l.notes ?? "",
    })),
    null,
    0,
  );

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.2,
      max_tokens: 12000,
      messages: [
        {
          role: "user",
          content: [
            `You are estimating US residential remodeling all-in costs per line for a homeowner-facing ballpark (no separate margin layer).`,
            `You receive (1) project context and (2) a JSON array of existing scope lines with stable line_id values.`,
            `Return ONE JSON object ONLY (no markdown) with shape:`,
            `{"prices":[{"line_id":"uuid","unit_cost_usd":number,"markup_pct":number}]}`,
            ``,
            `Rules:`,
            `- Output exactly one object per input line_id. Do not omit or add line_ids.`,
            `- unit_cost_usd: realistic **material-forward** cost per unit in USD (0+), consistent with quantity and unit (ea, sq ft, LF, hr, gal, etc.).`,
            `- For lines in trades tile, plumbing, electrical, paint, HVAC, drywall, flooring, or cabinetry: treat the line as **materials + typical small-job consumables** (thinset, wire nuts, tape, etc.). Do **not** bake in large trade labor totals — the app may append separate rough **labor** lines for install from those trades.`,
            `- For demolition-only, permits, pure labor lines, or general “all-in” allowances: a combined ballpark is fine.`,
            `- markup_pct: MUST always be 0 for every line (the app shows cost as the estimate; no markup).`,
            `- Use regional typical pricing; when uncertain, favor conservative costs.`,
            ``,
            `--- Project context ---`,
            compositeScope.slice(0, 20000),
            ``,
            `--- lines (price each) ---`,
            payload.slice(0, 14000),
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
    throw new Error("Could not parse per-line pricing JSON.");
  }

  const list = parsed.prices;
  if (!Array.isArray(list)) {
    return [];
  }

  const byId = new Map<string, { unit_cost_usd: number; markup_pct: number }>();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const line_id = typeof o.line_id === "string" ? o.line_id.trim() : "";
    if (!line_id) continue;
    const unit_cost_usd = Math.max(
      0,
      typeof o.unit_cost_usd === "number"
        ? o.unit_cost_usd
        : Number(o.unit_cost_usd) || 0,
    );
    const markup_pct = 0;
    byId.set(line_id, { unit_cost_usd, markup_pct });
  }

  const out: { line_id: string; unit_cost_usd: number; markup_pct: number }[] = [];
  for (const l of lines) {
    const p = byId.get(l.line_id);
    if (p) {
      out.push({ line_id: l.line_id, ...p });
    }
  }
  return out;
}

export function applyPerLinePricingToLines(
  lines: BidMaterialLine[],
  prices: { line_id: string; unit_cost_usd: number; markup_pct: number }[],
): BidMaterialLine[] {
  const byId = new Map(prices.map((p) => [p.line_id, p]));
  return lines.map((line) => {
    if (!line.line_id) return line;
    const p = byId.get(line.line_id);
    if (!p) return line;
    const unit_cost_usd = p.unit_cost_usd;
    const markup_pct = 0;
    const unit_price_usd = sellFromCostMarkup(unit_cost_usd, markup_pct);
    const q = Math.max(0, Number(line.quantity) || 0);
    const extended_usd = Math.round(q * unit_price_usd * 100) / 100;
    return {
      ...line,
      unit_cost_usd,
      markup_pct,
      unit_price_usd,
      extended_usd,
    };
  });
}
