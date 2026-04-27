import { describe, expect, it } from "vitest";

import { parseProbePickChoiceIndexFromModelContent } from "@/lib/ai/retail-hd-url-probe-hit-picker";

describe("parseProbePickChoiceIndexFromModelContent", () => {
  it("reads choice_index", () => {
    expect(parseProbePickChoiceIndexFromModelContent('{"choice_index":1}')).toBe(1);
  });

  it("reads -1", () => {
    expect(parseProbePickChoiceIndexFromModelContent('{"choice_index":-1}')).toBe(-1);
  });

  it("strips fences", () => {
    expect(
      parseProbePickChoiceIndexFromModelContent('```json\n{"choice_index":0}\n```'),
    ).toBe(0);
  });

  it("returns -1 on garbage", () => {
    expect(parseProbePickChoiceIndexFromModelContent("no json")).toBe(-1);
  });
});
