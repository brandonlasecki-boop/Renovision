import { describe, expect, it } from "vitest";
import { parseRetailShelfMatchCorrectionsFromModelContent } from "./retail-shelf-match-validator";

describe("parseRetailShelfMatchCorrectionsFromModelContent", () => {
  it("parses corrections array", () => {
    const text = JSON.stringify({
      corrections: [
        { line_index: 1, ok: true },
        { line_index: 2, ok: false, refined_hd_query: "delta shower trim chrome" },
      ],
    });
    const rows = parseRetailShelfMatchCorrectionsFromModelContent(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ line_index: 1, ok: true });
    expect(rows[1]).toEqual({
      line_index: 2,
      ok: false,
      refined_hd_query: "delta shower trim chrome",
    });
  });

  it("accepts refined_query alias", () => {
    const text = JSON.stringify({
      corrections: [{ line_index: 3, ok: false, refined_query: "  48 inch vanity double  " }],
    });
    const rows = parseRetailShelfMatchCorrectionsFromModelContent(text);
    expect(rows[0]).toEqual({
      line_index: 3,
      ok: false,
      refined_hd_query: "48 inch vanity double",
    });
  });

  it("strips refined_hd_query when ok is true", () => {
    const text = JSON.stringify({
      corrections: [{ line_index: 1, ok: true, refined_hd_query: "ignored" }],
    });
    expect(parseRetailShelfMatchCorrectionsFromModelContent(text)[0]).toEqual({
      line_index: 1,
      ok: true,
    });
  });

  it("extracts JSON from surrounding prose", () => {
    const inner = JSON.stringify({
      corrections: [{ line_index: 1, ok: false, refined_hd_query: "subway tile white 3x6" }],
    });
    const text = `Here you go:\n${inner}\nHope this helps.`;
    const rows = parseRetailShelfMatchCorrectionsFromModelContent(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refined_hd_query).toBe("subway tile white 3x6");
  });

  it("returns empty on invalid JSON", () => {
    expect(parseRetailShelfMatchCorrectionsFromModelContent("not json")).toEqual([]);
  });

  it("skips bad line_index", () => {
    const text = JSON.stringify({
      corrections: [
        { line_index: 0, ok: false, refined_hd_query: "bad" },
        { line_index: 1, ok: true },
      ],
    });
    const rows = parseRetailShelfMatchCorrectionsFromModelContent(text);
    expect(rows).toEqual([{ line_index: 1, ok: true }]);
  });
});
