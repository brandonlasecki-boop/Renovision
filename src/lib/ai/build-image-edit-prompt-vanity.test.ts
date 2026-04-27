import { describe, expect, it } from "vitest";
import {
  MOCKUP_IMAGE_EDIT_LAYOUT_FOOTER,
  MOCKUP_IN_PLACE_EDIT_HEADER_VANITY_REPLACE,
  appendMockupLayoutFooter,
  buildImageEditPrompt,
  formatFullQuoteLinesForMockupEstimateContext,
  formatQuoteLinesForImageEdit,
} from "@/lib/ai/openai-bid";
import { sortQuoteLinesForMockupProductRefs } from "@/lib/bid-mockup";
import type { BidMaterialLine } from "@/types/bid";

describe("buildImageEditPrompt — new vanity cabinet replacement mode", () => {
  const room =
    "Narrow bathroom; vanity on left wall; walk-in shower on right. Toilet: NOT VISIBLE IN FRAME — do not infer position.";

  it("uses replacement header and quote block when mockup lines include supply/install double vanity cabinet", () => {
    const vanityLine: BidMaterialLine = {
      line_id: "test-line-vanity",
      name: "Supply and install double vanity cabinet with integrated sinks",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 2040,
      extended_usd: 2040,
      trade: "cabinetry",
      hd_image_url: "https://images.thdstatic.com/product/sku.jpg",
    };
    const quoteLineContext = formatQuoteLinesForImageEdit([vanityLine]);
    const p = buildImageEditPrompt({
      scopeDescription: "Primary bath. New vanity per quote.",
      roomAnalysis: room,
      remodelEditPrompt: "Apply mockup-enabled quote lines; preserve wet walls.",
      quoteLineContext,
      mockupQuoteLines: [vanityLine],
      imageEditSource: "before",
    });
    expect(p).toContain(MOCKUP_IN_PLACE_EDIT_HEADER_VANITY_REPLACE.slice(0, 48));
    expect(p).toContain("Full vanity replacement");
    expect(p).toContain("New vanity cabinet assembly");
    expect(p).toContain("QUOTE-DRIVEN LOOKS");
    expect(p).toContain("New vanity cabinet on quote");
    expect(p).toContain("TASK: Photorealistic edit");
    expect(p).toContain("OFF-CAMERA & NO-INFERENCE");
  });

  it("includes COMPLETE ESTIMATE when fullEstimateContext is passed", () => {
    const lineA: BidMaterialLine = {
      line_id: "a",
      name: "Vanity faucet",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 100,
      extended_usd: 100,
      mockup_include: true,
      hd_image_url: "https://example.com/f.jpg",
    };
    const lineB: BidMaterialLine = {
      line_id: "b",
      name: "Rough plumbing labor",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 500,
      extended_usd: 500,
      mockup_include: false,
    };
    const full = formatFullQuoteLinesForMockupEstimateContext([lineA, lineB]);
    const p = buildImageEditPrompt({
      scopeDescription: "Bath refresh.",
      roomAnalysis: "Vanity on left.",
      remodelEditPrompt: "Apply finishes.",
      quoteLineContext: formatQuoteLinesForImageEdit([lineA]),
      fullEstimateContext: full,
      mockupQuoteLines: [lineA],
      imageEditSource: "before",
    });
    expect(p).toContain("COMPLETE ESTIMATE");
    expect(p).toContain("[mockup: OFF");
    expect(p).toMatch(/\[mockup: ON/);
    expect(p).toContain("[mockup: ON + ref] may have JPEGs");
  });

  it("places product/finish reference summary after the occlusion footer (truncation tail)", () => {
    const line: BidMaterialLine = {
      line_id: "tail-order",
      name: "Floor tile 12x24 porcelain",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 12,
      extended_usd: 12,
      mockup_include: true,
      hd_image_url: "https://images.thdstatic.com/product/sku.jpg",
    };
    const marker = "UNIQUE_REF_TAIL_ORDER_ZZ9";
    const p = buildImageEditPrompt({
      scopeDescription: "Bath refresh.",
      roomAnalysis: "Vanity on left; shower on right.",
      remodelEditPrompt: "Apply mockup-enabled quote lines; preserve layout.",
      quoteLineContext: formatQuoteLinesForImageEdit([line]),
      mockupQuoteLines: [line],
      referenceVisualSummary: marker,
    });
    const fi = p.indexOf("OFF-CAMERA & NO-INFERENCE");
    const ri = p.indexOf(marker);
    expect(fi).toBeGreaterThan(-1);
    expect(ri).toBeGreaterThan(fi);
    expect(p.indexOf("PRIORITY — PRODUCT/FINISH REFERENCES")).toBeGreaterThan(fi);
  });
});

describe("formatQuoteLinesForImageEdit — ref index alignment", () => {
  it("maps global [Mockup product ref N] indices so quote row 2 is not confused with ref 2", () => {
    const vanity: BidMaterialLine = {
      line_id: "line-vanity",
      name: "Vanity cabinet 60in",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 1,
      extended_usd: 1,
      mockup_include: true,
      hd_image_url: "https://images.thdstatic.com/vanity.jpg",
      reference_storage_path: "bids/x/contractor-ref.jpg",
    };
    const tile: BidMaterialLine = {
      line_id: "line-tile",
      name: "Shower wall tile",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 1,
      extended_usd: 1,
      mockup_include: true,
      hd_image_url: "https://images.thdstatic.com/tile.jpg",
    };
    const ordered = sortQuoteLinesForMockupProductRefs([tile, vanity]);
    const s = formatQuoteLinesForImageEdit(ordered);
    expect(s).toContain("MULTIMODAL REF MAP");
    expect(s).toMatch(/\*\*1\*\* then \*\*2\*\*/);
    expect(s).toMatch(/\*\*3\*\*/);
    expect(s).toMatch(/1\. \[JPEG refs \*\*1\*\* = retail shelf, \*\*2\*\* = contractor photo/);
    expect(s).toMatch(/2\. \[JPEG ref \*\*3\*\* only\]/);
  });
});

describe("appendMockupLayoutFooter", () => {
  it("appends productRefTail after occlusion block", () => {
    const out = appendMockupLayoutFooter("CORE", {
      productRefTail: "TAIL_REF_BIT",
    });
    expect(out.indexOf(MOCKUP_IMAGE_EDIT_LAYOUT_FOOTER.slice(0, 30))).toBeLessThan(
      out.indexOf("TAIL_REF_BIT"),
    );
  });
});
