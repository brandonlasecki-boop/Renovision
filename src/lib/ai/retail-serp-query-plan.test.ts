import { describe, expect, it } from "vitest";
import { parseRetailSerpQueryPlanFromModelContent } from "@/lib/ai/retail-serp-query-plan";

describe("parseRetailSerpQueryPlanFromModelContent", () => {
  it("parses plans array with hd_query", () => {
    const raw = `Here is JSON:
{"plans":[{"plan_index":1,"skip":false,"hd_query":"60 inch double sink vanity white"},{"plan_index":2,"skip":true}]}`;
    const m = parseRetailSerpQueryPlanFromModelContent(raw);
    expect(m.get(1)).toEqual({ skip: false, hd_query: "60 inch double sink vanity white" });
    expect(m.get(2)).toEqual({ skip: true, hd_query: "" });
  });

  it("accepts q alias", () => {
    const m = parseRetailSerpQueryPlanFromModelContent('{"plans":[{"plan_index":3,"skip":false,"q":"porcelain floor tile"}]}');
    expect(m.get(3)?.hd_query).toBe("porcelain floor tile");
  });
});
