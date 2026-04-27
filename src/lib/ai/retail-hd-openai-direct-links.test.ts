import { describe, expect, it } from "vitest";

import {
  parseDirectHomedepotLinksMapFromModelContent,
  isAllowedHomedepotDirectProductPageUrl,
} from "@/lib/ai/retail-hd-openai-direct-links";

describe("parseDirectHomedepotLinksMapFromModelContent", () => {
  it("parses lines with homedepot_url and product_title", () => {
    const raw = `{"lines":[{"plan_index":1,"shoppable_hd":true,"homedepot_url":"https://www.homedepot.com/p/x/206667220","product_title":"Example"}]}`;
    const m = parseDirectHomedepotLinksMapFromModelContent(raw);
    expect(m.get(1)?.shoppableHd).toBe(true);
    expect(m.get(1)?.urls).toEqual(["https://www.homedepot.com/p/x/206667220"]);
    expect(m.get(1)?.productTitle).toBe("Example");
  });

  it("respects shoppable false", () => {
    const raw = '{"lines":[{"plan_index":2,"shoppable_hd":false,"homedepot_url":"https://www.homedepot.com/p/x/206667221"}]}';
    const m = parseDirectHomedepotLinksMapFromModelContent(raw);
    expect(m.get(2)?.shoppableHd).toBe(false);
    expect(m.get(2)?.urls.length).toBe(0);
  });
});

describe("isAllowedHomedepotDirectProductPageUrl", () => {
  it("accepts valid THD product https URL", () => {
    expect(
      isAllowedHomedepotDirectProductPageUrl("https://www.homedepot.com/p/example/206667220"),
    ).toBe(true);
  });

  it("rejects non-thd", () => {
    expect(isAllowedHomedepotDirectProductPageUrl("https://example.com/p/x/206667220")).toBe(false);
  });
});
