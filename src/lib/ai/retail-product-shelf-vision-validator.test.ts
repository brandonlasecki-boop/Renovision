import { describe, expect, it } from "vitest";

import { parseRetailShelfVisionProductValidationsFromContent } from "@/lib/ai/retail-product-shelf-vision-validator";

describe("parseRetailShelfVisionProductValidationsFromContent", () => {
  it("parses validations array with refined_hd_query", () => {
    const raw = `{"validations":[{"line_index":1,"ok":true},{"line_index":2,"ok":false,"refined_hd_query":"kohler shower valve trim only"}]}`;
    expect(parseRetailShelfVisionProductValidationsFromContent(raw)).toEqual([
      { line_index: 1, ok: true },
      { line_index: 2, ok: false, refined_hd_query: "kohler shower valve trim only" },
    ]);
  });

  it("accepts refined_query alias when ok is false", () => {
    const raw = '{"validations":[{"line_index":1,"ok":false,"refined_query":"acrylic shower base 60"}]}';
    expect(parseRetailShelfVisionProductValidationsFromContent(raw)).toEqual([
      { line_index: 1, ok: false, refined_hd_query: "acrylic shower base 60" },
    ]);
  });

  it("returns empty for invalid JSON", () => {
    expect(parseRetailShelfVisionProductValidationsFromContent("not json")).toEqual([]);
  });
});
