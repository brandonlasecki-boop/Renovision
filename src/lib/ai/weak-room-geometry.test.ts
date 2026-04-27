import { describe, expect, it } from "vitest";
import {
  buildImageEditPrompt,
  formatQuoteLinesForImageEdit,
  roomAnalysisSuggestsWeakFixtureGeometry,
} from "@/lib/ai/openai-bid";
import type { BidMaterialLine } from "@/types/bid";

describe("roomAnalysisSuggestsWeakFixtureGeometry", () => {
  it("is false for empty or normal analysis", () => {
    expect(roomAnalysisSuggestsWeakFixtureGeometry("")).toBe(false);
    expect(
      roomAnalysisSuggestsWeakFixtureGeometry(
        "Walk-in shower on the right with clear glass; vanity on the left.",
      ),
    ).toBe(false);
  });

  it("detects mirror / reflection / partial visibility wording", () => {
    expect(roomAnalysisSuggestsWeakFixtureGeometry("Shower visible only in the mirror.")).toBe(
      true,
    );
    expect(roomAnalysisSuggestsWeakFixtureGeometry("Toilet partially visible, cropped at edge.")).toBe(
      true,
    );
    expect(roomAnalysisSuggestsWeakFixtureGeometry("Reflection of tub in vanity mirror.")).toBe(
      true,
    );
    expect(
      roomAnalysisSuggestsWeakFixtureGeometry("Wet area not clearly visible due to glare."),
    ).toBe(true);
  });
});

describe("buildImageEditPrompt weak-room flags", () => {
  it("includes weak-room section and text-only ref heading when flags set", () => {
    const line: BidMaterialLine = {
      line_id: "x",
      name: "Shower wall tile",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 1,
      extended_usd: 1,
      mockup_include: true,
      hd_image_url: "https://example.com/t.jpg",
    };
    const p = buildImageEditPrompt({
      scopeDescription: "Bath refresh.",
      roomAnalysis: "Vanity mirror reflects shower — limited direct view.",
      remodelEditPrompt: "Apply finishes.",
      quoteLineContext: formatQuoteLinesForImageEdit([line]),
      referenceVisualSummary: "REFERENCE LOOKS: …",
      mockupQuoteLines: [line],
      imageEditSource: "before",
      weakRoomGeometryEvidence: true,
      inlineProductPixelsOmitted: true,
    });
    expect(p).toContain("WEAK / PARTIAL VIEW");
    expect(p).toContain("PRIORITY — PRODUCT/FINISH REFERENCES (text summary only");
    expect(p).toContain("Weak/partial photo");
  });
});
