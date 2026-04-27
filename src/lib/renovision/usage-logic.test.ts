import { describe, expect, it } from "vitest";
import {
  anonymousInitialRemaining,
  anonymousRegenRemaining,
  buildUsageSummary,
  canAnonymousRegenerate,
  canAnonymousStartInitial,
  canSignedInGenerate,
  signedInRemaining,
} from "@/lib/renovision/usage-logic";

describe("Renovision usage helpers", () => {
  it("caps anonymous initial and regen remaining", () => {
    expect(anonymousInitialRemaining(0)).toBe(1);
    expect(anonymousInitialRemaining(1)).toBe(0);
    expect(anonymousRegenRemaining(0)).toBe(3);
    expect(anonymousRegenRemaining(3)).toBe(0);
  });

  it("enforces anonymous flow ordering", () => {
    expect(canAnonymousStartInitial(0)).toBe(true);
    expect(canAnonymousStartInitial(1)).toBe(false);
    expect(canAnonymousRegenerate(0, 0)).toBe(false);
    expect(canAnonymousRegenerate(1, 0)).toBe(true);
    expect(canAnonymousRegenerate(1, 3)).toBe(false);
  });

  it("caps signed-in free pool", () => {
    expect(signedInRemaining(0)).toBe(5);
    expect(signedInRemaining(5)).toBe(0);
    expect(canSignedInGenerate(4)).toBe(true);
    expect(canSignedInGenerate(5)).toBe(false);
  });

  it("surfaces signup gate copy when anonymous allowance is exhausted", () => {
    const u = buildUsageSummary({
      mode: "anonymous",
      signedInUsed: 0,
      initialUsed: 1,
      regenUsed: 3,
      hasMockup: true,
    });
    expect(u.gate).toBe("signup");
    expect(u.anonymousPoolExhausted).toBe(true);
    expect(u.hintLine.length).toBeGreaterThan(0);
  });
});
