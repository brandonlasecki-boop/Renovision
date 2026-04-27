import { describe, expect, it } from "vitest";
import type { BidMaterialLine } from "@/types/bid";
import { appendMissingRoughLaborLines } from "@/lib/labor-rough-append";

describe("appendMissingRoughLaborLines", () => {
  it("adds a plumbing labor line when plumbing materials are priced and no labor exists", () => {
    const lines: BidMaterialLine[] = [
      {
        line_id: "a",
        name: "Replace lavatory faucet",
        quantity: 1,
        unit: "ea",
        trade: "plumbing",
        unit_cost_usd: 180,
        markup_pct: 0,
        unit_price_usd: 180,
        extended_usd: 180,
      },
    ];
    const out = appendMissingRoughLaborLines(lines);
    expect(out.length).toBe(2);
    const labor = out.find((l) => l.trade === "labor");
    expect(labor?.name).toMatch(/plumb/i);
    expect(labor?.extended_usd).toBeGreaterThanOrEqual(250);
  });

  it("does not duplicate when labor already mentions the trade", () => {
    const lines: BidMaterialLine[] = [
      {
        line_id: "a",
        name: "Rough plumbing labor",
        quantity: 1,
        unit: "ea",
        trade: "labor",
        unit_cost_usd: 400,
        markup_pct: 0,
        unit_price_usd: 400,
        extended_usd: 400,
      },
      {
        line_id: "b",
        name: "Toilet",
        quantity: 1,
        unit: "ea",
        trade: "plumbing",
        unit_cost_usd: 350,
        markup_pct: 0,
        unit_price_usd: 350,
        extended_usd: 350,
      },
    ];
    expect(appendMissingRoughLaborLines(lines).length).toBe(2);
  });
});
