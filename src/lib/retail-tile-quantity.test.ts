import { describe, expect, it } from "vitest";
import type { BidMaterialLine } from "@/types/bid";
import {
  adjustShowerTileQuantityAfterRetailAttach,
  estimateBathroomFootprintSqFt,
  estimateShowerAlcoveMaxWallInches,
  normalizeShowerTileRetailUnitCost,
  parseCaseCoverageSqFtFromProductTitle,
  parseShowerKitNominalWidthInchesFromTitle,
  productTitleIsPrefabShowerWallKit,
  productTitleLooksCaseOrCartonTilePrice,
} from "@/lib/retail-tile-quantity";

function showerTileLine(): BidMaterialLine {
  return {
    line_id: "x",
    name: "Shower wall and floor tile — porcelain field tile",
    quantity: 120,
    unit: "sq ft",
    unit_price_usd: 47.88,
    extended_usd: 120 * 47.88,
    mockup_include: false,
    trade: "tile",
    unit_cost_usd: 47.88,
  };
}

describe("retail-tile-quantity", () => {
  it("reads bathroom footprint from room measurements line", () => {
    const jc = "Scope\n--- Room measurements ---\n- Bathroom: ~10 x 8 ft (~80 sq ft footprint, ceiling ~8 ft)";
    expect(estimateBathroomFootprintSqFt(jc)).toBe(80);
  });

  it("bumps bathroom floor tile quantity from footprint + waste", () => {
    const jc = "--- Room measurements ---\n- Bathroom: ~10 x 8 ft (~80 sq ft footprint, ceiling ~8 ft)";
    const line: BidMaterialLine = {
      line_id: "f",
      name: "Supply and install bathroom floor tile — porcelain",
      quantity: 1,
      unit: "sq ft",
      unit_price_usd: 3,
      extended_usd: 3,
      mockup_include: false,
      trade: "tile",
      unit_cost_usd: 3,
    };
    adjustShowerTileQuantityAfterRetailAttach({
      line,
      jobContext: jc,
      productTitle: "Porcelain floor tile 12 sq ft per case",
    });
    expect(line.quantity).toBe(92);
  });

  it("parses sq ft per case from common Home Depot title patterns", () => {
    expect(
      parseCaseCoverageSqFtFromProductTitle("Sample Tile 12 in. x 24 — 12 sq ft / case"),
    ).toBe(12);
    expect(parseCaseCoverageSqFtFromProductTitle("Case covers 15.6 sq ft porcelain")).toBe(15.6);
    expect(parseCaseCoverageSqFtFromProductTitle("10.67 sq ft each case")).toBe(10.67);
  });

  it("detects case-sold listings that mention sq ft", () => {
    expect(productTitleLooksCaseOrCartonTilePrice("12 sq ft per case — white")).toBe(true);
    expect(productTitleLooksCaseOrCartonTilePrice("Price per sq ft $3.29")).toBe(false);
  });

  it("detects prefab shower wall kits so field-tile qty math is skipped", () => {
    expect(
      productTitleIsPrefabShowerWallKit(
        "Passage 32 in. W x 72 in. H Four piece Glue Up Acrylic Alcove Shower Wall Set in White Subway Tile",
      ),
    ).toBe(true);
    expect(productTitleIsPrefabShowerWallKit("White 3x6 ceramic subway wall tile — field")).toBe(false);
  });

  it("parses nominal kit width and shower span from scope", () => {
    expect(
      parseShowerKitNominalWidthInchesFromTitle(
        "Passage 32 in. W x 72 in. H Four piece Glue Up Acrylic Alcove Shower Wall Set",
      ),
    ).toBe(32);
    const jcWide =
      "--- Room measurements ---\n- Shower: ~5 x 3 ft (~15 sq ft footprint, ceiling ~8 ft)";
    expect(estimateShowerAlcoveMaxWallInches(jcWide)).toBe(60);
    const jcSmall =
      "--- Room measurements ---\n- Shower: ~3 x 3 ft (~9 sq ft footprint, ceiling ~8 ft)";
    expect(estimateShowerAlcoveMaxWallInches(jcSmall)).toBe(36);
  });

  it("sets prefab kit ea qty to 1 when shower span fits one nominal kit width band", () => {
    const jc =
      "--- Room measurements ---\n- Shower: ~3 x 3 ft (~9 sq ft footprint, ceiling ~8 ft)";
    const line: BidMaterialLine = {
      line_id: "w",
      name: "Install new shower pan and tile walls",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 400,
      extended_usd: 400,
      mockup_include: false,
      trade: "tile",
      unit_cost_usd: 400,
    };
    adjustShowerTileQuantityAfterRetailAttach({
      line,
      jobContext: jc,
      productTitle:
        "Passage 32 in. W x 72 in. H Four piece Glue Up Acrylic Alcove Shower Wall Set in White Subway Tile",
    });
    expect(line.quantity).toBe(1);
  });

  it("sets prefab kit ea qty >1 when shower span clearly exceeds one nominal kit width", () => {
    const jc =
      "--- Room measurements ---\n- Shower: ~5 x 3 ft (~15 sq ft footprint, ceiling ~8 ft)";
    const line: BidMaterialLine = {
      line_id: "w",
      name: "Install new shower pan and tile walls",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 400,
      extended_usd: 400,
      mockup_include: false,
      trade: "tile",
      unit_cost_usd: 400,
    };
    adjustShowerTileQuantityAfterRetailAttach({
      line,
      jobContext: jc,
      productTitle:
        "Passage 32 in. W x 72 in. H Four piece Glue Up Acrylic Alcove Shower Wall Set in White Subway Tile",
    });
    expect(line.quantity).toBe(2);
  });

  it("does not bump qty when the last merged title is field tile but HD still holds a prefab kit title", () => {
    const jc =
      "--- Room measurements ---\n- Shower: ~3 x 3 ft (~9 sq ft footprint, ceiling ~8 ft)";
    const passageHd =
      "Passage 32 in. W x 72 in. H Four piece Glue Up Acrylic Alcove Shower Wall Set in White Subway Tile";
    const line: BidMaterialLine = {
      line_id: "w",
      name: "Install new shower pan and tile walls",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 400,
      extended_usd: 400,
      mockup_include: false,
      trade: "tile",
      unit_cost_usd: 400,
      hd_title: passageHd,
      lw_title: "Daltile Restore Bright White 3 in. x 6 in. Ceramic Wall Tile",
    };
    adjustShowerTileQuantityAfterRetailAttach({
      line,
      jobContext: jc,
      productTitle: "Daltile Restore Bright White 3 in. x 6 in. Ceramic Wall Tile",
    });
    expect(line.quantity).toBe(1);
  });

  it("converts mistaken case shelf price to per sq ft when line is shower tile in sq ft", () => {
    const line = showerTileLine();
    normalizeShowerTileRetailUnitCost(line, "Porcelain tile 12 sq ft per case — Case of 9 pieces");
    expect(line.unit_cost_usd).toBeCloseTo(47.88 / 12, 3);
    expect(line.extended_usd).toBeCloseTo(120 * (47.88 / 12), 1);
  });

  it("normalizes case price for bathroom floor tile lines in sq ft", () => {
    const line: BidMaterialLine = {
      line_id: "b",
      name: "Bathroom floor tile — ceramic",
      quantity: 92,
      unit: "sq ft",
      unit_price_usd: 89.99,
      extended_usd: 92 * 89.99,
      mockup_include: false,
      trade: "tile",
      unit_cost_usd: 89.99,
    };
    normalizeShowerTileRetailUnitCost(line, "Floor tile 12 sq ft per case — Case of 8 pieces");
    expect(line.unit_cost_usd).toBeCloseTo(89.99 / 12, 3);
  });
});
