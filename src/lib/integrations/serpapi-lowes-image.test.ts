import { describe, expect, it } from "vitest";
import {
  isAllowedLowesProductImageUrl,
  pickLowesGoogleOrganicProductImageUrl,
} from "@/lib/integrations/serpapi-lowes";

describe("pickLowesGoogleOrganicProductImageUrl", () => {
  it("uses thumbnail when present", () => {
    const u = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTest";
    expect(
      pickLowesGoogleOrganicProductImageUrl({
        thumbnail: u,
      }),
    ).toBe(u);
  });

  it("falls back to serpapi_thumbnail when thumbnail missing", () => {
    const u = "https://serpapi.com/searches/abc/images/face.jpeg";
    expect(
      pickLowesGoogleOrganicProductImageUrl({
        serpapi_thumbnail: u,
      }),
    ).toBe(u);
  });

  it("walks nested thumbnails like SerpApi sometimes returns", () => {
    const u = "https://encrypted-tbn0.gstatic.com/images?q=nested";
    expect(
      pickLowesGoogleOrganicProductImageUrl({
        thumbnails: [[u]],
      }),
    ).toBe(u);
  });

  it("reads images[].link objects", () => {
    const u = "https://mobileimages.lowes.com/product/123.jpg";
    expect(
      pickLowesGoogleOrganicProductImageUrl({
        images: [{ link: u }],
      }),
    ).toBe(u);
  });

  it("returns undefined when only disallowed hosts are present", () => {
    expect(
      pickLowesGoogleOrganicProductImageUrl({
        thumbnail: "https://evil.example.com/a.jpg",
      }),
    ).toBeUndefined();
  });
});

describe("isAllowedLowesProductImageUrl", () => {
  it("allows lh*.googleusercontent.com (Google image cache)", () => {
    expect(
      isAllowedLowesProductImageUrl(
        "https://lh3.googleusercontent.com/a/proxy-url=w1200-h800",
      ),
    ).toBe(true);
  });
});
