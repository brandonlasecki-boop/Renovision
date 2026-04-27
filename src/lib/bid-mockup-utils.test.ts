import { describe, expect, it } from "vitest";
import { formatMockupProductRefStatusLine } from "./bid-mockup-utils";
import type { BidMockupGenerationMeta } from "@/types/bid";

describe("formatMockupProductRefStatusLine", () => {
  it("returns null for concept fallback", () => {
    const m: BidMockupGenerationMeta = {
      usedConceptFallback: true,
      usedMockupProvider: "openai",
      mockup_reference_urls_count: 3,
    };
    expect(formatMockupProductRefStatusLine(m)).toBeNull();
  });

  it("describes Vertex when all images loaded", () => {
    const m: BidMockupGenerationMeta = {
      usedMockupProvider: "vertex_gemini",
      mockup_reference_urls_count: 3,
      vertex_reference_fetch: { attempted: 3, loaded: 3 },
    };
    expect(formatMockupProductRefStatusLine(m)).toContain("3 of 3");
    expect(formatMockupProductRefStatusLine(m)).toContain("sent to the AI");
  });

  it("appends slot summaries when meta includes them", () => {
    const m: BidMockupGenerationMeta = {
      usedMockupProvider: "vertex_gemini",
      mockup_reference_urls_count: 2,
      vertex_reference_fetch: { attempted: 2, loaded: 2 },
      mockup_reference_slot_summaries: ["Vanity (Home Depot image)", "Faucet (Home Depot image)"],
    };
    const s = formatMockupProductRefStatusLine(m);
    expect(s).toContain("With this render:");
    expect(s).toContain("Vanity");
  });

  it("warns when Vertex loaded zero", () => {
    const m: BidMockupGenerationMeta = {
      usedMockupProvider: "vertex_gemini",
      mockup_reference_urls_count: 2,
      vertex_reference_fetch: { attempted: 2, loaded: 0 },
    };
    expect(formatMockupProductRefStatusLine(m)).toContain("0 of 2");
  });

  it("explains OpenAI text-only path", () => {
    const m: BidMockupGenerationMeta = {
      usedMockupProvider: "openai",
      mockup_reference_urls_count: 2,
      referenceVisualSummary: "x",
    };
    const s = formatMockupProductRefStatusLine(m);
    expect(s).toContain("text");
    expect(s).toContain("Vertex");
  });
});
