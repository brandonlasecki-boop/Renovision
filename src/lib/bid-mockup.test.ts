import { describe, expect, it } from "vitest";
import {
  catalogRetailImageUrlForMockup,
  enumerateMockupProductRefSlots,
  getMockupReferenceSlotPreviews,
  lineDescribesNewVanityCabinetAssembly,
  lineHasMockupVisualReference,
  lineIsAutoMockupCatalogCandidate,
  lineShouldAutoEnableMockupInclude,
  mockupFixtureZoneHint,
  mockupProductRefSortPriority,
  sortQuoteLinesForMockupProductRefs,
  winningRetailCatalogTabForLine,
} from "@/lib/bid-mockup";
import { parseMaterialEstimate } from "@/lib/data/bids";
import type { BidMaterialLine } from "@/types/bid";

function line(name: string, notes?: string): BidMaterialLine {
  return {
    name,
    quantity: 1,
    unit: "ea",
    unit_price_usd: 0,
    extended_usd: 0,
    ...(notes ? { notes } : {}),
  };
}

describe("mockupFixtureZoneHint", () => {
  it("tags vanity lines", () => {
    const h = mockupFixtureZoneHint(line("60in bathroom vanity"));
    expect(h).toMatch(/vanity/i);
    expect(h).toMatch(/ZONE/i);
    expect(h).toMatch(/full vertical extent|toe kick/i);
  });

  it("separates medicine cabinet from vanity cabinet SKU zone", () => {
    const h = mockupFixtureZoneHint(line("Medicine cabinet"));
    expect(h).toMatch(/medicine/i);
    expect(h).not.toMatch(/ONLY the existing vanity \/ sink cabinet/i);
  });

  it("treats vanity sconce as lighting, not cabinet", () => {
    const h = mockupFixtureZoneHint(line("Vanity sconce", "brass"));
    expect(h).toMatch(/lighting|fixture/i);
    expect(h).not.toMatch(/ONLY the existing vanity \/ sink cabinet/i);
  });

  it("zones lavatory faucets with vanity run as faucet only", () => {
    const h = mockupFixtureZoneHint(
      line("Supply and install lavatory faucets — deck-mount (vanity run)"),
    );
    expect(h).toMatch(/faucet/i);
    expect(h).toMatch(/not.*vanity cabinet|never use/i);
  });

  it("zones plumbing connections for vanity+shower as rough-in", () => {
    const h = mockupFixtureZoneHint(line("Install plumbing connections for vanity and shower"));
    expect(h).toMatch(/rough|connections|supplies/i);
  });

  it("detects supply/install double vanity cabinet with integrated sinks as full assembly", () => {
    expect(
      lineDescribesNewVanityCabinetAssembly(
        line("Supply and install double vanity cabinet with integrated sinks"),
      ),
    ).toBe(true);
    const z = mockupFixtureZoneHint(line("Supply and install double vanity cabinet with integrated sinks"));
    expect(z).toMatch(/New vanity cabinet assembly/i);
  });

  it("does not treat vanity light as cabinet replacement", () => {
    expect(lineDescribesNewVanityCabinetAssembly(line("Supply and install vanity light 3-light"))).toBe(
      false,
    );
  });
});

describe("catalogRetailImageUrlForMockup", () => {
  it("uses winning shelf tab when both retailers have images and cost does not match either shelf", () => {
    const hdImg = "https://images.thdstatic.com/product/x/file-64_65.jpg";
    const lwImg = "https://mobileimages.lowes.com/product/1.jpg";
    const line: BidMaterialLine = {
      name: "Vanity",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 900,
      extended_usd: 900,
      hd_product_url: "https://www.homedepot.com/p/a",
      lw_product_url: "https://www.lowes.com/p/b",
      hd_unit_price_usd: 800,
      lw_unit_price_usd: 700,
      unit_cost_usd: 650,
      hd_image_url: hdImg,
      lw_image_url: lwImg,
    };
    expect(winningRetailCatalogTabForLine(line)).toBe("lw");
    expect(catalogRetailImageUrlForMockup(line)).toBe(lwImg);
  });

  it("uses winning Lowe's shelf image even when unit_cost_usd still matches Home Depot", () => {
    const hdImg = "https://images.thdstatic.com/product/x/file-64_65.jpg";
    const lwImg = "https://mobileimages.lowes.com/product/1.jpg";
    const line: BidMaterialLine = {
      name: "Vanity",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 900,
      extended_usd: 900,
      hd_product_url: "https://www.homedepot.com/p/a",
      lw_product_url: "https://www.lowes.com/p/b",
      hd_unit_price_usd: 800,
      lw_unit_price_usd: 700,
      /** Stale sell-side cost — shelf winner is still the lower Lowe's price. */
      unit_cost_usd: 800,
      hd_image_url: hdImg,
      lw_image_url: lwImg,
    };
    expect(winningRetailCatalogTabForLine(line)).toBe("lw");
    expect(catalogRetailImageUrlForMockup(line)).toBe(lwImg);
  });

  it("mockup_shelf_retailer forces Home Depot when Lowe's wins shelf price (vanity on HD, accessory on LW)", () => {
    const hdImg = "https://images.thdstatic.com/vanity-60.jpg";
    const lwImg = "https://mobileimages.lowes.com/trim-piece.jpg";
    const line: BidMaterialLine = {
      name: "60 in bathroom vanity cabinet with top",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 1200,
      extended_usd: 1200,
      trade: "cabinetry",
      hd_product_url: "https://www.homedepot.com/p/a",
      lw_product_url: "https://www.lowes.com/p/b",
      hd_unit_price_usd: 899,
      lw_unit_price_usd: 12,
      unit_cost_usd: 12,
      hd_image_url: hdImg,
      lw_image_url: lwImg,
      mockup_shelf_retailer: "hd",
    };
    expect(winningRetailCatalogTabForLine(line)).toBe("lw");
    expect(catalogRetailImageUrlForMockup(line)).toBe(hdImg);
  });
});

describe("lineIsAutoMockupCatalogCandidate / lineShouldAutoEnableMockupInclude", () => {
  const hdImg = "https://images.thdstatic.com/product/x/file-64_65.jpg";

  it("rejects paint trade even with shelf image", () => {
    const row: BidMaterialLine = {
      name: "Interior wall and ceiling paint",
      trade: "paint",
      quantity: 1,
      unit: "gal",
      unit_price_usd: 40,
      extended_usd: 40,
      hd_image_url: hdImg,
    };
    expect(lineIsAutoMockupCatalogCandidate(row)).toBe(false);
    expect(lineShouldAutoEnableMockupInclude(row)).toBe(false);
  });

  it("rejects consumables by name", () => {
    const row: BidMaterialLine = {
      name: "Polymer-modified thinset for floor tile",
      quantity: 1,
      unit: "bag",
      unit_price_usd: 25,
      extended_usd: 25,
      hd_image_url: hdImg,
    };
    expect(lineIsAutoMockupCatalogCandidate(row)).toBe(false);
  });

  it("allows vanity with shelf image", () => {
    const row: BidMaterialLine = {
      name: "60 in bathroom vanity combo",
      trade: "cabinetry",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 900,
      extended_usd: 900,
      hd_image_url: hdImg,
    };
    expect(lineShouldAutoEnableMockupInclude(row)).toBe(true);
  });

  it("rejects shower trim-only lines for auto mockup even with shelf image", () => {
    const row: BidMaterialLine = {
      name: "Install new shower trim and fixtures",
      trade: "plumbing",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 120,
      extended_usd: 120,
      hd_image_url: hdImg,
    };
    expect(lineIsAutoMockupCatalogCandidate(row)).toBe(false);
    expect(lineShouldAutoEnableMockupInclude(row)).toBe(false);
  });
});

describe("lineHasMockupVisualReference", () => {
  it("accepts Home Depot GCP CDN URLs from SerpApi", () => {
    expect(
      lineHasMockupVisualReference({
        name: "Floor tile",
        quantity: 1,
        unit: "ea",
        unit_price_usd: 1,
        extended_usd: 1,
        hd_image_url: "https://images.homedepot-static.com/product/x/sku-64_65.jpg",
      }),
    ).toBe(true);
  });

  it("keeps homedepot-static URLs through parseMaterialEstimate for mockup snapshot round-trip", () => {
    const url = "https://images.homedepot-static.com/product/x/sku-64_65.jpg";
    const parsed = parseMaterialEstimate([
      {
        name: "Tile",
        quantity: 1,
        unit: "ea",
        unit_price_usd: 10,
        extended_usd: 10,
        hd_image_url: url,
        mockup_include: true,
      },
    ]);
    expect(parsed[0]?.hd_image_url).toBe(url);
    expect(parsed[0]?.mockup_include).toBe(true);
  });

  it("round-trips mockup_shelf_retailer when both shelf images exist", () => {
    const hdImg = "https://images.thdstatic.com/product/x/file-64_65.jpg";
    const lwImg = "https://mobileimages.lowes.com/product/1.jpg";
    const parsed = parseMaterialEstimate([
      {
        name: "Vanity",
        quantity: 1,
        unit: "ea",
        unit_price_usd: 100,
        extended_usd: 100,
        hd_product_url: "https://www.homedepot.com/p/a",
        lw_product_url: "https://www.lowes.com/pd/b",
        hd_image_url: hdImg,
        lw_image_url: lwImg,
        mockup_shelf_retailer: "hd",
      },
    ]);
    expect(parsed[0]?.mockup_shelf_retailer).toBe("hd");
  });
});

describe("enumerateMockupProductRefSlots", () => {
  it("assigns global ref indices retail then contractor per line, then next line", () => {
    const vanity: BidMaterialLine = {
      line_id: "v1",
      name: "Vanity cabinet",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 1,
      extended_usd: 1,
      mockup_include: true,
      hd_image_url: "https://images.thdstatic.com/v.jpg",
      reference_storage_path: "bids/x/contractor.jpg",
    };
    const tile: BidMaterialLine = {
      line_id: "t1",
      name: "Shower wall tile",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 1,
      extended_usd: 1,
      mockup_include: true,
      hd_image_url: "https://images.thdstatic.com/t.jpg",
    };
    const ordered = sortQuoteLinesForMockupProductRefs([tile, vanity]);
    const slots = enumerateMockupProductRefSlots(ordered);
    expect(slots).toHaveLength(2);
    expect(slots[0]?.line.name).toContain("Vanity");
    expect(slots[0]?.refIndices).toEqual([1, 2]);
    expect(slots[1]?.line.name).toContain("tile");
    expect(slots[1]?.refIndices).toEqual([3]);
  });
});

describe("getMockupReferenceSlotPreviews", () => {
  it("emits retail then contractor for one line with both", () => {
    const line: BidMaterialLine = {
      name: "Vanity",
      quantity: 1,
      unit: "ea",
      unit_price_usd: 1,
      extended_usd: 1,
      mockup_include: true,
      hd_image_url: "https://images.thdstatic.com/product/x/file-64_65.jpg",
      reference_storage_path: "bids/x/ref.jpg",
    };
    const slots = getMockupReferenceSlotPreviews([line]);
    expect(slots).toHaveLength(2);
    expect(slots[0]?.kind).toBe("retail");
    expect(slots[1]?.kind).toBe("contractor");
  });
});

describe("sortQuoteLinesForMockupProductRefs", () => {
  function namedLine(partial: Partial<BidMaterialLine> & { name: string }): BidMaterialLine {
    return {
      quantity: 1,
      unit: "ea",
      unit_price_usd: 0,
      extended_usd: 0,
      ...partial,
    };
  }

  it("orders vanity cabinet before lavatory faucet when faucet appears first in the quote", () => {
    const faucet = namedLine({
      name: "Lavatory faucet — deck-mount",
      trade: "plumbing",
      hd_image_url: "https://images.thdstatic.com/faucet.jpg",
    });
    const vanity = namedLine({
      name: "60 in bathroom vanity cabinet",
      trade: "cabinetry",
      hd_image_url: "https://images.thdstatic.com/vanity.jpg",
    });
    const sorted = sortQuoteLinesForMockupProductRefs([faucet, vanity]);
    expect(sorted[0]?.name).toContain("vanity");
    expect(sorted[1]?.name).toContain("faucet");
    expect(mockupProductRefSortPriority(vanity)).toBeLessThan(mockupProductRefSortPriority(faucet));
  });
});
