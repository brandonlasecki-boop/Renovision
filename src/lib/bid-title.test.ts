import { describe, expect, it } from "vitest";
import { deriveBidTitleFromScope } from "@/lib/bid-title";

describe("deriveBidTitleFromScope", () => {
  it("uses first sentence when reasonable", () => {
    expect(
      deriveBidTitleFromScope(
        "Replace the hall bath vanity and faucet. Tile stays. Customer is flexible on brand.",
      ),
    ).toMatch(/vanity|faucet/i);
  });

  it("strips common leading phrases", () => {
    expect(deriveBidTitleFromScope("We want to gut the kitchen and put in new cabinets.")).toMatch(
      /gut|kitchen|cabinets/i,
    );
    expect(deriveBidTitleFromScope("The customer wants to paint the whole interior.")).toMatch(/paint/i);
  });

  it("returns New estimate for empty scope", () => {
    expect(deriveBidTitleFromScope("")).toBe("New estimate");
    expect(deriveBidTitleFromScope("   \n  ")).toBe("New estimate");
  });

  it("truncates long first lines at word boundary", () => {
    const long =
      "This is a very long opening line that keeps going and going with many words until it should be cut " +
      "somewhere sensible without breaking mid word too badly.";
    const t = deriveBidTitleFromScope(long);
    expect(t.length).toBeLessThanOrEqual(82);
    expect(t.endsWith("…")).toBe(true);
  });
});
