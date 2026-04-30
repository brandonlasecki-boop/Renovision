import { describe, expect, it } from "vitest";
import {
  MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX,
  MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX_HOMEOWNER_TWEAK,
  truncateMockupTextPrompt,
  truncateMockupTextPromptWithLayoutReinforcement,
} from "./mockup-prompt-truncate";

describe("truncateMockupTextPrompt", () => {
  it("returns unchanged when under limit", () => {
    expect(truncateMockupTextPrompt("hello", 100)).toBe("hello");
  });

  it("preserves start and end when over limit", () => {
    const head = "A".repeat(2000);
    const mid = "M".repeat(10_000);
    const tail = "Z".repeat(2000);
    const full = head + mid + tail;
    const out = truncateMockupTextPrompt(full, 5000);
    expect(out.startsWith("AAA")).toBe(true);
    expect(out.endsWith("ZZZ")).toBe(true);
    expect(out).toContain("omitted");
    expect(out.length).toBeLessThanOrEqual(5000);
  });
});

describe("truncateMockupTextPromptWithLayoutReinforcement", () => {
  it("appends reinforcement and stays within maxChars for long prompts", () => {
    const head = "A".repeat(2000);
    const mid = "M".repeat(10_000);
    const tail = "Z".repeat(2000);
    const full = head + mid + tail;
    const maxChars = 5000;
    const out = truncateMockupTextPromptWithLayoutReinforcement(full, maxChars);
    expect(out.length).toBeLessThanOrEqual(maxChars);
    expect(out.endsWith(MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX)).toBe(true);
    expect(out).toContain("LAYOUT REINFORCEMENT");
  });

  it("returns short prompts unchanged aside from reinforcement block", () => {
    const full = "short prompt";
    const maxChars = 20_000;
    const out = truncateMockupTextPromptWithLayoutReinforcement(full, maxChars);
    expect(out.startsWith(full)).toBe(true);
    expect(out).toContain(MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX);
    expect(out.length).toBeLessThanOrEqual(maxChars);
  });

  it("uses homeowner tweak reinforcement suffix when opts.homeownerMockupTweak", () => {
    const full = "short prompt";
    const out = truncateMockupTextPromptWithLayoutReinforcement(full, 20_000, undefined, {
      homeownerMockupTweak: true,
    });
    expect(out.endsWith(MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX_HOMEOWNER_TWEAK)).toBe(true);
    expect(out).toContain("PRIORITY — HOMEOWNER TWEAKS");
  });

  it("inserts preLayoutReinforcementBlock before the standard suffix", () => {
    const full = "short prompt";
    const pin = "PINNED GEOMETRY BLOCK";
    const out = truncateMockupTextPromptWithLayoutReinforcement(full, 20_000, undefined, {
      preLayoutReinforcementBlock: pin,
    });
    expect(out).toContain(pin);
    expect(out.indexOf(pin)).toBeLessThan(out.indexOf("LAYOUT REINFORCEMENT"));
    expect(out.endsWith(MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX)).toBe(true);
  });
});
