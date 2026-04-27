import { describe, expect, it } from "vitest";
import {
  buildRetailTitleScoreHint,
  enhanceRetailSearchQuery,
  extractMinVanityCabinetWidthInchesFromRetailText,
  lineImpliesVanityCabinetRetailQuery,
  mergeVanityRunWidthInchesForRetail,
  minVanityCabinetInchesForLineRetail,
  normalizeVanityHomeDepotQuery,
  showerBaseSerpOptionsForLine,
  vanityWidthSerpOptionsForLine,
} from "@/lib/ai/homedepot-retail-query";

describe("lineImpliesVanityCabinetRetailQuery", () => {
  it("is true for double vanity cabinet line", () => {
    expect(
      lineImpliesVanityCabinetRetailQuery({
        name: "Supply and install double vanity cabinet with integrated sinks",
      }),
    ).toBe(true);
  });

  it("is false for lavatory faucets with (vanity run) location", () => {
    expect(
      lineImpliesVanityCabinetRetailQuery({
        name: "Supply and install lavatory faucets — deck-mount (vanity run)",
        trade: "plumbing",
      }),
    ).toBe(false);
  });

  it("is false for plumbing connections line mentioning vanity", () => {
    expect(
      lineImpliesVanityCabinetRetailQuery({
        name: "Install plumbing connections for vanity and shower",
        trade: "plumbing",
      }),
    ).toBe(false);
  });
});

describe("normalizeVanityHomeDepotQuery", () => {
  it("does not append vanity cabinet sink tokens to faucet lines", () => {
    const line = {
      name: "Supply and install lavatory faucets — deck-mount (vanity run)",
      trade: "plumbing" as const,
    };
    const out = normalizeVanityHomeDepotQuery("delta brushed nickel widespread bathroom faucet", line);
    expect(out.toLowerCase()).not.toContain("bathroom vanity cabinet sink");
  });

  it("still widens true cabinet lines", () => {
    const line = { name: "Supply and install double vanity cabinet with integrated sinks" };
    const out = normalizeVanityHomeDepotQuery("60 inch white vanity", line);
    expect(out.toLowerCase()).toContain("bathroom vanity");
  });
});

describe("enhanceRetailSearchQuery", () => {
  it("adds double-basin tokens for double vanity cabinet lines without run measurements", () => {
    const line = {
      name: "Supply and install double vanity cabinet with integrated sinks",
      trade: "cabinetry" as const,
    };
    const out = enhanceRetailSearchQuery("white shaker bathroom vanity", line, {});
    expect(out.toLowerCase()).toMatch(/double sink|two basin/);
    expect(out.toLowerCase()).toContain("60");
  });

  it("does not inject measured vanity width for faucet lines", () => {
    const line = {
      name: "Supply and install lavatory faucets — deck-mount (vanity run)",
      trade: "plumbing" as const,
    };
    const out = enhanceRetailSearchQuery("brushed nickel bathroom faucet", line, {
      vanityRunWidthInches: 96,
    });
    expect(out).not.toMatch(/\b96\b.*inch.*bathroom vanity/i);
  });

  it("prefixes sealant/caulk lines so vanity location words do not dominate Serp", () => {
    const line = { name: "Sealant and caulk for vanity and shower", trade: "general" as const };
    const out = enhanceRetailSearchQuery("bathroom sealant vanity shower", line, {});
    expect(out.toLowerCase()).toMatch(/silicone|sealant|caulk/);
    expect(out.toLowerCase().indexOf("silicone") < out.toLowerCase().indexOf("vanity")).toBe(true);
  });

  it("injects wide vanity run from opts for true cabinet lines", () => {
    const line = { name: "Supply and install bathroom vanity cabinet", trade: "cabinetry" as const };
    const out = enhanceRetailSearchQuery("white shaker bath vanity", line, {
      vanityRunWidthInches: 100,
    });
    expect(out).toMatch(/\b100\b/);
    expect(out.toLowerCase()).toMatch(/inch|wide/);
  });
});

describe("extractMinVanityCabinetWidthInchesFromRetailText", () => {
  it("reads at least / glued inch patterns when vanity is mentioned", () => {
    expect(
      extractMinVanityCabinetWidthInchesFromRetailText(
        "I want a vanity thats atleast 100in wide",
      ),
    ).toBe(100);
    expect(
      extractMinVanityCabinetWidthInchesFromRetailText("Replace with vanity, minimum 84 inches"),
    ).toBe(84);
    expect(
      extractMinVanityCabinetWidthInchesFromRetailText(
        "100 inch vanity at least — double sink",
      ),
    ).toBe(100);
    expect(
      extractMinVanityCabinetWidthInchesFromRetailText("Need a vanity at least 100 inches wide"),
    ).toBe(100);
    expect(extractMinVanityCabinetWidthInchesFromRetailText("100 inch shower door only")).toBeUndefined();
  });
});

describe("mergeVanityRunWidthInchesForRetail", () => {
  it("returns the larger of job vs user text width", () => {
    expect(mergeVanityRunWidthInchesForRetail(72, 100)).toBe(100);
    expect(mergeVanityRunWidthInchesForRetail(undefined, 100)).toBe(100);
    expect(mergeVanityRunWidthInchesForRetail(96, undefined)).toBe(96);
    expect(mergeVanityRunWidthInchesForRetail(undefined, undefined)).toBeUndefined();
  });
});

describe("minVanityCabinetInchesForLineRetail", () => {
  it("defaults to 60in hint for double vanity lines without job measurements", () => {
    expect(
      minVanityCabinetInchesForLineRetail({
        name: "Supply and install double vanity cabinet with integrated sinks",
        trade: "cabinetry",
      }),
    ).toBe(60);
  });
});

describe("vanityWidthSerpOptionsForLine", () => {
  it("returns width hint only for cabinet lines", () => {
    expect(
      vanityWidthSerpOptionsForLine(
        { name: "Supply and install lavatory faucets — deck-mount (vanity run)", trade: "plumbing" },
        96,
      ),
    ).toEqual({});
    expect(
      vanityWidthSerpOptionsForLine(
        { name: "Supply and install double vanity cabinet with integrated sinks", trade: "cabinetry" },
        96,
      ),
    ).toEqual({ minVanityCabinetWidthInches: 96 });
    expect(
      vanityWidthSerpOptionsForLine(
        { name: "Supply and install double vanity cabinet with integrated sinks", trade: "cabinetry" },
        undefined,
      ),
    ).toEqual({ minVanityCabinetWidthInches: 60 });
  });

  it("drops narrative max below measured min so large replacements are not wrongly capped", () => {
    const jc = "Notes: Previous vanity was 36 inches wide.\nVanity / cabinet run: ~6 x 2 ft";
    expect(
      vanityWidthSerpOptionsForLine(
        { name: "Supply and install bathroom vanity cabinet combo with sink", trade: "cabinetry" },
        72,
        jc,
      ),
    ).toEqual({ minVanityCabinetWidthInches: 72 });
  });
});

describe("showerBaseSerpOptionsForLine", () => {
  it("pulls shower base dimensions from line text", () => {
    expect(
      showerBaseSerpOptionsForLine({
        name: "Supply and install 60 in. x 32 in. shower base with center drain",
        trade: "plumbing",
      }),
    ).toEqual({ showerBaseTargetLengthInches: 60, showerBaseTargetWidthInches: 32 });
  });

  it("pulls shower footprint dimensions from measurement context for pan lines", () => {
    const jobContext = "--- Room measurements ---\n- Shower space: ~5 x 3 ft (~15 sq ft footprint)";
    expect(
      showerBaseSerpOptionsForLine(
        { name: "Tub-to-shower conversion with new shower pan and tile walls", trade: "tile" },
        jobContext,
      ),
    ).toEqual({ showerBaseTargetLengthInches: 60, showerBaseTargetWidthInches: 36 });
  });

  it("does not apply shower dimensions to trim or faucet lines", () => {
    const jobContext = "- Shower space: ~5 x 3 ft";
    expect(
      showerBaseSerpOptionsForLine(
        { name: "Install shower trim kit and valve", trade: "plumbing" },
        jobContext,
      ),
    ).toEqual({});
  });
});

describe("buildRetailTitleScoreHint", () => {
  it("returns undefined when no scoring hints apply", () => {
    expect(
      buildRetailTitleScoreHint({ name: "Supply and install drywall patch", trade: "general" }),
    ).toBeUndefined();
  });

  it("includes trade and shower-wall-only tile bias", () => {
    const hint = buildRetailTitleScoreHint(
      {
        name: "Shower wall tile — subway ceramic (walls only, not floor)",
        trade: "tile",
      },
      72,
    );
    expect(hint).toMatchObject({
      lineTrade: "tile",
      showerWallTileOnly: true,
    });
    expect(hint?.floorFieldTileOnly).toBeFalsy();
  });

  it("includes vanity cabinet width from job run", () => {
    const cab = buildRetailTitleScoreHint(
      { name: "Supply and install double vanity cabinet with integrated sinks", trade: "cabinetry" },
      84,
    );
    expect(cab).toMatchObject({ lineTrade: "cabinetry", minVanityCabinetWidthInches: 84 });
  });

  it("includes shower base dimensions from job context", () => {
    const hint = buildRetailTitleScoreHint(
      { name: "Install new shower pan and tile walls", trade: "tile" },
      undefined,
      "- Shower space: ~5 x 3 ft",
    );
    expect(hint).toMatchObject({
      lineTrade: "tile",
      showerBaseTargetLengthInches: 60,
      showerBaseTargetWidthInches: 36,
    });
  });
});
