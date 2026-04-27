import { describe, expect, it } from "vitest";
import {
  productReferenceImageFetchCandidateUrls,
  retailImageUrlForLightbox,
} from "@/lib/integrations/retail-product-image-lightbox";

describe("retailImageUrlForLightbox", () => {
  it("upgrades Home Depot thumb to -1000", () => {
    const u =
      "https://images.thdstatic.com/product/sku/abc/file-64_65.jpg";
    expect(retailImageUrlForLightbox(u)).toBe(
      "https://images.thdstatic.com/product/sku/abc/file-1000.jpg",
    );
  });

  it("upgrades images.homedepot-static.com thumbs the same way", () => {
    const u =
      "https://images.homedepot-static.com/product/sku/xyz/tile-64_65.jpg";
    expect(retailImageUrlForLightbox(u)).toBe(
      "https://images.homedepot-static.com/product/sku/xyz/tile-1000.jpg",
    );
  });
});

describe("productReferenceImageFetchCandidateUrls", () => {
  it("lists working thumb first, then -1000 and downgrades for Home Depot", () => {
    const u =
      "https://images.thdstatic.com/product/sku/abc/file-64_65.jpg";
    const c = productReferenceImageFetchCandidateUrls(u);
    expect(c[0]).toBe(u);
    expect(c.some((x) => x.includes("-1000.jpg"))).toBe(true);
    expect(c).toContain(u);
    expect(c.some((x) => x.includes("-600.jpg"))).toBe(true);
    expect(c.some((x) => x.includes("-64_65.jpg"))).toBe(true);
  });

  it("dedupes when input is already -1000", () => {
    const u =
      "https://images.thdstatic.com/product/sku/abc/file-1000.jpg";
    const c = productReferenceImageFetchCandidateUrls(u);
    expect(c.filter((x) => x.includes("-1000.jpg")).length).toBe(1);
    expect(c[0]).toContain("-1000.jpg");
    expect(c.some((x) => x.includes("-600.jpg"))).toBe(true);
  });

  it("adds downgrades for homedepot-static product thumbs", () => {
    const u = "https://images.homedepot-static.com/p/a/file-64_65.jpg";
    const c = productReferenceImageFetchCandidateUrls(u);
    expect(c[0]).toBe(u);
    expect(c.some((x) => x.includes("-1000.jpg"))).toBe(true);
  });

  it("returns a single entry for unknown hosts", () => {
    const u = "https://example.com/pic.png";
    expect(productReferenceImageFetchCandidateUrls(u)).toEqual([u]);
  });

  it("respects maxCandidates for Home Depot lists", () => {
    const u = "https://images.thdstatic.com/product/sku/abc/file-64_65.jpg";
    const c = productReferenceImageFetchCandidateUrls(u, 3);
    expect(c.length).toBe(3);
    expect(c[0]).toBe(u);
  });
});
