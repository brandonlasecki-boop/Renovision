import { describe, expect, it } from "vitest";
import {
  inferFloorFieldTileOnlyFromLineText,
  inferShowerWallTileOnlyFromLineText,
  inferSiteBuiltShowerTileWallLineRetail,
  lineImpliesLightingFixture,
  lineImpliesShowerPanOrBaseRetail,
  lineImpliesShowerWetAreaShellRetail,
  lineImpliesToiletFixturePrimaryRetail,
  lineTextImpliesSealantCaulkPrimaryRetail,
  scoreRetailProductTitleForLine,
  shouldApplyRetailSealantCaulkTitleHardGate,
  shouldApplyRetailShowerWetAreaShellTitleHardGate,
  shouldApplyRetailTileFieldTitleHardGate,
  titleLooksLikeToiletRepairOrPartsKit,
  titlePassesRetailShowerBaseDimensionHardGate,
  titlePassesRetailSealantCaulkHardGate,
  titlePassesRetailShowerWetAreaShellHardGate,
  titlePassesRetailTileFieldHardGate,
} from "./retail-search-relevance";

describe("inferShowerWallTileOnlyFromLineText", () => {
  it("detects shower wall tile lines", () => {
    expect(inferShowerWallTileOnlyFromLineText("Install porcelain tile on shower walls")).toBe(true);
    expect(inferShowerWallTileOnlyFromLineText("Shower tile — alcove wet walls")).toBe(true);
  });
  it("excludes shower floor-only", () => {
    expect(inferShowerWallTileOnlyFromLineText("Shower floor tile pebble pan")).toBe(false);
  });
  it("does not treat tub-to-shower + pan + tile as wall-tile-only (mixed pan + tile scope)", () => {
    expect(
      inferShowerWallTileOnlyFromLineText("Tub-to-shower conversion with new pan and tile walls"),
    ).toBe(false);
  });
});

describe("lineImpliesShowerWetAreaShellRetail", () => {
  it("is true for tub-to-shower + pan + tile", () => {
    expect(
      lineImpliesShowerWetAreaShellRetail("Tub-to-shower conversion with new pan and tile walls"),
    ).toBe(true);
  });
  it("is false when the line is a toilet install", () => {
    expect(lineImpliesShowerWetAreaShellRetail("Supply and install new toilet")).toBe(false);
  });
});

describe("lineImpliesShowerPanOrBaseRetail", () => {
  it("is true for pan/base install lines but false for trim-only lines", () => {
    expect(lineImpliesShowerPanOrBaseRetail("Install 60 x 32 shower base with tile walls")).toBe(true);
    expect(lineImpliesShowerPanOrBaseRetail("Install shower trim kit and valve")).toBe(false);
  });
});

describe("titlePassesRetailShowerWetAreaShellHardGate", () => {
  it("rejects two-piece toilet titles", () => {
    expect(
      titlePassesRetailShowerWetAreaShellHardGate(
        "Glacier Bay 2-Piece 1.28 GPF High Efficiency Single Flush Elongated Toilet in White",
      ),
    ).toBe(false);
  });
  it("allows shower pan titles", () => {
    expect(
      titlePassesRetailShowerWetAreaShellHardGate(
        "DreamLine SlimLine 36 in. x 48 in. Single Threshold Shower Base in White",
      ),
    ).toBe(true);
  });
});

describe("titlePassesRetailShowerBaseDimensionHardGate", () => {
  const hint = { showerBaseTargetLengthInches: 60, showerBaseTargetWidthInches: 32 };

  it("accepts shower bases close to the measured footprint", () => {
    expect(
      titlePassesRetailShowerBaseDimensionHardGate(
        "DreamLine SlimLine 60 in. x 32 in. Single Threshold Shower Base in White",
        hint,
      ),
    ).toBe(true);
  });

  it("rejects shower bases that clearly will not fit the measured footprint", () => {
    expect(
      titlePassesRetailShowerBaseDimensionHardGate(
        "DreamLine SlimLine 36 in. x 36 in. Single Threshold Shower Base in White",
        hint,
      ),
    ).toBe(false);
  });

  it("does not reject tile SKUs by shower base dimensions", () => {
    expect(
      titlePassesRetailShowerBaseDimensionHardGate(
        "Daltile Restore 3 in. x 6 in. Ceramic Bright White Subway Wall Tile",
        hint,
      ),
    ).toBe(true);
  });
});

describe("shouldApplyRetailShowerWetAreaShellTitleHardGate", () => {
  it("applies to tub-to-shower conversion lines", () => {
    expect(
      shouldApplyRetailShowerWetAreaShellTitleHardGate(
        "Tub-to-shower conversion with new pan and tile walls",
      ),
    ).toBe(true);
  });
});

describe("inferFloorFieldTileOnlyFromLineText", () => {
  it("detects bathroom floor tile", () => {
    expect(inferFloorFieldTileOnlyFromLineText("Install bathroom floor tile — porcelain")).toBe(true);
    expect(inferFloorFieldTileOnlyFromLineText("Porcelain tile for bathroom floor")).toBe(true);
  });
  it("does not treat shower wall line as floor field", () => {
    expect(inferFloorFieldTileOnlyFromLineText("Shower wall ceramic tile")).toBe(false);
  });
});

describe("titlePassesRetailTileFieldHardGate", () => {
  it("accepts typical tile SKUs", () => {
    expect(
      titlePassesRetailTileFieldHardGate(
        "Daltile Restore Bright White 3 in. x 6 in. Ceramic Bevel Wall Tile (12.5 sq. ft. / case)",
      ),
    ).toBe(true);
    expect(titlePassesRetailTileFieldHardGate("Porcelain Floor and Wall Tile (11.62 sq. ft. / case)")).toBe(
      true,
    );
  });
  it("rejects shower doors and vanities", () => {
    expect(titlePassesRetailTileFieldHardGate("Delta Classic Semi-Frameless Sliding Shower Door")).toBe(false);
    expect(titlePassesRetailTileFieldHardGate("Home Decorators Collection 60 in. Bathroom Vanity Cabinet")).toBe(
      false,
    );
  });
  it("rejects solid-surface / alcove one-kit shower systems (not field tile + pan)", () => {
    const subwayKit =
      "Subway 32 in. x 60 in. x 84 in. Solid Composite Stone Alcove Shower Kit with Walls and White Pan Base L/R Drain";
    expect(titlePassesRetailTileFieldHardGate(subwayKit)).toBe(false);
  });
  it("still accepts Subway-style ceramic wall tile SKUs", () => {
    expect(
      titlePassesRetailTileFieldHardGate(
        "Daltile Restore 3 in. x 6 in. Ceramic Bright White Subway Wall Tile (12.5 sq. ft. / case)",
      ),
    ).toBe(true);
  });
});

describe("lineImpliesLightingFixture", () => {
  it("does not treat shower trim + fixtures as lighting", () => {
    expect(lineImpliesLightingFixture("Install shower trim and fixtures")).toBe(false);
    expect(lineImpliesLightingFixture("Minor plumbing adjustments — valves and stops")).toBe(false);
  });
  it("still detects vanity / bath lighting lines", () => {
    expect(lineImpliesLightingFixture("Install brushed nickel vanity light 3-light bath bar")).toBe(true);
    expect(lineImpliesLightingFixture("Replace bathroom light fixtures over mirror")).toBe(true);
  });
});

describe("lineTextImpliesSealantCaulkPrimaryRetail", () => {
  it("is true for sealant lines that mention vanity/shower as location", () => {
    expect(lineTextImpliesSealantCaulkPrimaryRetail("Sealant and caulk for vanity and shower")).toBe(true);
  });
  it("is false for vanity cabinet install lines", () => {
    expect(lineTextImpliesSealantCaulkPrimaryRetail("Supply and install 60 in. vanity cabinet with sink")).toBe(
      false,
    );
  });
});

describe("titlePassesRetailSealantCaulkHardGate", () => {
  it("accepts typical caulk SKUs", () => {
    expect(titlePassesRetailSealantCaulkHardGate("GE Advanced Silicone 2 Kitchen and Bath Sealant Clear")).toBe(
      true,
    );
    expect(titlePassesRetailSealantCaulkHardGate("DAP Alex Plus White Acrylic Latex Caulk Plus Silicone")).toBe(true);
  });
  it("rejects vanity cabinets", () => {
    expect(
      titlePassesRetailSealantCaulkHardGate("Home Decorators Collection 60 in. Double Sink Bathroom Vanity Cabinet"),
    ).toBe(false);
  });
});

describe("lineImpliesToiletFixturePrimaryRetail", () => {
  it("is true for supply and install new toilet", () => {
    expect(lineImpliesToiletFixturePrimaryRetail("Supply and install new toilet")).toBe(true);
  });
  it("is false when line is only a toilet repair part", () => {
    expect(lineImpliesToiletFixturePrimaryRetail("Supply and install toilet fill valve")).toBe(false);
  });
});

describe("titleLooksLikeToiletRepairOrPartsKit", () => {
  it("detects universal complete toilet repair kit titles", () => {
    expect(
      titleLooksLikeToiletRepairOrPartsKit(
        "PerforMAX Universal 2 in. High Performance Complete Toilet Repair Kit",
      ),
    ).toBe(true);
  });
});

describe("scoreRetailProductTitleForLine", () => {
  it("scores shower pan above toilet for tub-to-shower conversion lines", () => {
    const line = "Tub-to-shower conversion with new pan and tile walls";
    const toilet =
      "Glacier Bay 2-Piece 1.28 GPF High Efficiency Single Flush Elongated Toilet in White";
    const pan =
      "DreamLine SlimLine 36 in. x 48 in. Single Threshold Shower Base in White with Center Drain";
    expect(scoreRetailProductTitleForLine(line, pan, { lineTrade: "tile" })).toBeGreaterThan(
      scoreRetailProductTitleForLine(line, toilet, { lineTrade: "tile" }) + 35,
    );
  });

  it("scores measured shower bases above wrong-size bases", () => {
    const line = "Install new shower pan and tile walls";
    const wrong = "DreamLine SlimLine 36 in. x 36 in. Single Threshold Shower Base in White";
    const right = "DreamLine SlimLine 60 in. x 32 in. Single Threshold Shower Base in White";
    const hint = {
      lineTrade: "tile" as const,
      showerBaseTargetLengthInches: 60,
      showerBaseTargetWidthInches: 32,
    };
    expect(scoreRetailProductTitleForLine(line, right, hint)).toBeGreaterThan(
      scoreRetailProductTitleForLine(line, wrong, hint) + 50,
    );
  });

  it("scores a two-piece toilet above a repair kit for new toilet install lines", () => {
    const line = "Supply and install new toilet";
    const repairKit =
      "PerforMAX Universal 2 in. High Performance Complete Toilet Repair Kit with Flush Valve, Flapper, Rod and Float";
    const toilet = "Glacier Bay 2-Piece 1.28 GPF High Efficiency Single Flush Elongated Toilet in White";
    expect(scoreRetailProductTitleForLine(line, toilet)).toBeGreaterThan(
      scoreRetailProductTitleForLine(line, repairKit) + 30,
    );
  });

  it("scores caulk higher than vanity cabinet for sealant lines mentioning vanity", () => {
    const line = "Sealant and caulk for vanity and shower";
    const vanity = "Home Decorators Collection 60 in. W Double Sink Bath Vanity in White";
    const caulk = "GE Advanced Silicone 2 10.1 oz. Clear Kitchen and Bath Sealant";
    const sVan = scoreRetailProductTitleForLine(line, vanity);
    const sCaulk = scoreRetailProductTitleForLine(line, caulk);
    expect(sCaulk).toBeGreaterThan(sVan + 25);
  });

  it("scores vanity cabinet titles low for plumbing connections lines", () => {
    const line = "Install plumbing connections for vanity and shower";
    const vanitySku =
      "Home Decorators Collection Sedgewood 60 in. W x 21 in. D Double Sink Bath Vanity in White";
    const rough =
      "1/2 in. Brass PEX Barb x 3/8 in. Compression Quarter-Turn Straight Stop Valve (2-Pack)";
    const vanityScore = scoreRetailProductTitleForLine(line, vanitySku, { lineTrade: "plumbing" });
    const roughScore = scoreRetailProductTitleForLine(line, rough, { lineTrade: "plumbing" });
    expect(roughScore).toBeGreaterThan(vanityScore + 20);
  });

  it("does not boost vanity cabinet titles for mis-tagged cabinetry trade on rough plumbing lines", () => {
    const line = "Install plumbing connections for vanity and shower";
    const vanitySku = "Double Sink Bathroom Vanity Cabinet 72 inch White";
    const sCab = scoreRetailProductTitleForLine(line, vanitySku, { lineTrade: "cabinetry" });
    const sPlumb = scoreRetailProductTitleForLine(line, vanitySku, { lineTrade: "plumbing" });
    expect(sCab).toBeLessThan(42);
    expect(sPlumb).toBeLessThan(42);
  });

  it("scores a vanity LED bar lower than shower trim for shower trim plumbing lines", () => {
    const line = "Install shower trim and fixtures — minor plumbing adjustments";
    const vanityLight =
      "45 in. Modern 6-Light Sleek Chrome LED Vanity Light, Bathroom Wall Light Fixture for Mirror";
    const trimKit = "Delta Classic Monitor 14 Series Shower Trim Kit Chrome";
    const sLight = scoreRetailProductTitleForLine(line, vanityLight, { lineTrade: "plumbing" });
    const sTrim = scoreRetailProductTitleForLine(line, trimKit, { lineTrade: "plumbing" });
    expect(sTrim).toBeGreaterThan(sLight + 25);
  });

  it("prefers double-basin vanity titles for double vanity cabinet lines", () => {
    const line = "Supply and install double vanity cabinet with integrated sinks";
    const single = "Home Decorators 30 in. Single Sink Bath Vanity in White";
    const dbl = "Home Decorators 60 in. Double Sink Bathroom Vanity Cabinet in White";
    const sSingle = scoreRetailProductTitleForLine(line, single, {
      lineTrade: "cabinetry",
      minVanityCabinetWidthInches: 60,
    });
    const sDbl = scoreRetailProductTitleForLine(line, dbl, {
      lineTrade: "cabinetry",
      minVanityCabinetWidthInches: 60,
    });
    expect(sDbl).toBeGreaterThan(sSingle + 20);
  });
});

describe("shouldApplyRetailSealantCaulkTitleHardGate", () => {
  it("applies for sealant-for-vanity lines", () => {
    expect(shouldApplyRetailSealantCaulkTitleHardGate("Sealant and caulk for vanity and shower")).toBe(true);
  });
  it("does not apply for vanity cabinet lines", () => {
    expect(shouldApplyRetailSealantCaulkTitleHardGate("Install double vanity cabinet with quartz top")).toBe(false);
  });
});

describe("shouldApplyRetailTileFieldTitleHardGate", () => {
  it("applies for shower wall tile hint", () => {
    expect(
      shouldApplyRetailTileFieldTitleHardGate("Shower wall tile", { showerWallTileOnly: true }),
    ).toBe(true);
  });
  it("applies for trade tile + inferred shower wall", () => {
    expect(
      shouldApplyRetailTileFieldTitleHardGate("Install shower wall porcelain tile", { lineTrade: "tile" }),
    ).toBe(true);
  });
  it("applies for install shower pan + tile walls (site-built)", () => {
    const line = "Install new shower pan and tile walls";
    expect(inferSiteBuiltShowerTileWallLineRetail(line)).toBe(true);
  });
  it("does not treat tub-to-shower + pan + tile walls as tile-only", () => {
    const line = "Tub-to-shower conversion with new pan and tile walls";
    expect(inferSiteBuiltShowerTileWallLineRetail(line)).toBe(true);
    expect(inferShowerWallTileOnlyFromLineText(line)).toBe(false);
    expect(shouldApplyRetailTileFieldTitleHardGate(line, { lineTrade: "tile" })).toBe(false);
    expect(
      titlePassesRetailTileFieldHardGate("wedi wedi Shower and Tub Surround Kit"),
    ).toBe(false);
    expect(titlePassesRetailTileFieldHardGate("Daltile Restore 12 in x 24 in Porcelain Floor and Wall Tile")).toBe(
      true,
    );
  });
});
