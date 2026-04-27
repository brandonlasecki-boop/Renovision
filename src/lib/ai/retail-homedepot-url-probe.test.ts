import { describe, expect, it } from "vitest";

import {
  allowedHomedepotCandidateUrlsFromProbeRow,
  checkHomedepotProductPageReachability,
  parseRetailHomedepotUrlPlanFromModelContent,
  parseRetailHomedepotUrlProbesFromModelContent,
} from "@/lib/ai/retail-homedepot-url-probe";

describe("parseRetailHomedepotUrlPlanFromModelContent", () => {
  it("parses shoppable_hd and homedepot_urls", () => {
    const raw = `{"lines":[{"plan_index":1,"shoppable_hd":true,"homedepot_urls":["https://www.homedepot.com/p/example/206667220"]},{"plan_index":2,"shoppable_hd":false,"homedepot_urls":["https://www.homedepot.com/p/ignored/312345678"]}]}`;
    const m = parseRetailHomedepotUrlPlanFromModelContent(raw);
    expect(m.get(1)).toEqual({
      shoppableHd: true,
      urls: ["https://www.homedepot.com/p/example/206667220"],
    });
    expect(m.get(2)).toEqual({ shoppableHd: false, urls: [] });
  });

  it("defaults shoppable to true when flag omitted", () => {
    const raw = '{"lines":[{"plan_index":1,"homedepot_urls":["https://www.homedepot.com/p/x/206667221"]}]}';
    const m = parseRetailHomedepotUrlPlanFromModelContent(raw);
    expect(m.get(1)?.shoppableHd).toBe(true);
    expect(m.get(1)?.urls.length).toBe(1);
  });

  it("reads can_have_homedepot_product alias", () => {
    const raw =
      '{"probes":[{"line_index":1,"can_have_homedepot_product":false,"urls":["https://www.homedepot.com/p/x/206667220"]}]}';
    const m = parseRetailHomedepotUrlPlanFromModelContent(raw);
    expect(m.get(1)).toEqual({ shoppableHd: false, urls: [] });
  });

  it("dedupes by product id", () => {
    const raw =
      '{"lines":[{"plan_index":1,"shoppable_hd":true,"urls":["https://www.homedepot.com/p/a/206667220","https://www.homedepot.com/p/b/206667220"]}]}';
    const m = parseRetailHomedepotUrlPlanFromModelContent(raw);
    expect(m.get(1)?.urls.length).toBe(1);
  });

  it("rejects non-homedepot hosts", () => {
    const raw =
      '{"lines":[{"plan_index":1,"shoppable_hd":true,"homedepot_urls":["https://evil.com/p/x/206667220","https://www.homedepot.com/p/x/206667220"]}]}';
    const m = parseRetailHomedepotUrlPlanFromModelContent(raw);
    expect(m.get(1)?.urls).toEqual(["https://www.homedepot.com/p/x/206667220"]);
  });

  it("reads single homedepot_url string", () => {
    const raw =
      '{"lines":[{"plan_index":2,"shoppable_hd":true,"homedepot_url":"https://www.homedepot.com/p/y/312345678"}]}';
    const m = parseRetailHomedepotUrlPlanFromModelContent(raw);
    expect(m.get(2)?.urls[0]).toContain("312345678");
  });

  it("strips markdown fences", () => {
    const raw =
      '```json\n{"lines":[{"plan_index":1,"shoppable_hd":true,"urls":["https://www.homedepot.com/p/z/206667221"]}]}\n```';
    const m = parseRetailHomedepotUrlPlanFromModelContent(raw);
    expect(m.get(1)?.urls.length).toBe(1);
  });
});

describe("parseRetailHomedepotUrlProbesFromModelContent (compat)", () => {
  it("returns urls map for shoppable rows only", () => {
    const raw =
      '{"lines":[{"plan_index":1,"shoppable_hd":true,"urls":["https://www.homedepot.com/p/x/206667220"]},{"plan_index":2,"shoppable_hd":false,"urls":["https://www.homedepot.com/p/y/312345678"]}]}';
    const m = parseRetailHomedepotUrlProbesFromModelContent(raw);
    expect(m.get(1)?.length).toBe(1);
    expect(m.get(2)).toBeUndefined();
  });
});

describe("allowedHomedepotCandidateUrlsFromProbeRow", () => {
  it("prefers item links when candidate_homedepot_items is set", () => {
    expect(
      allowedHomedepotCandidateUrlsFromProbeRow({
        plan_index: 1,
        name: "Vanity",
        draft_query: "q",
        candidate_homedepot_items: [
          { link: "https://www.homedepot.com/p/a/206667220", title: "A" },
          { link: "https://www.homedepot.com/p/b/312345678", title: "B" },
        ],
        candidate_homedepot_urls: ["https://www.homedepot.com/p/ignored/300000000"],
      }),
    ).toEqual([
      "https://www.homedepot.com/p/a/206667220",
      "https://www.homedepot.com/p/b/312345678",
    ]);
  });

  it("falls back to candidate_homedepot_urls when no items", () => {
    expect(
      allowedHomedepotCandidateUrlsFromProbeRow({
        plan_index: 2,
        name: "Tile",
        draft_query: "q",
        candidate_homedepot_urls: ["https://www.homedepot.com/p/x/206667221"],
      }),
    ).toEqual(["https://www.homedepot.com/p/x/206667221"]);
  });
});

describe("checkHomedepotProductPageReachability", () => {
  it("returns unknown for invalid host", async () => {
    await expect(
      checkHomedepotProductPageReachability("https://example.com/foo"),
    ).resolves.toBe("unknown");
  });
});
