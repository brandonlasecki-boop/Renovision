import {
  RENOVISION_ANONYMOUS_INITIAL_ALLOWANCE,
  RENOVISION_ANONYMOUS_REGEN_ALLOWANCE,
  RENOVISION_SIGNED_IN_FREE_ALLOWANCE,
} from "@/lib/renovision/usage-constants";
import type { RenovisionUsageSummary } from "@/lib/renovision/usage-types";

export type GenerationIntent = "initial" | "regeneration";

export function anonymousInitialRemaining(initialUsed: number): number {
  return Math.max(0, RENOVISION_ANONYMOUS_INITIAL_ALLOWANCE - Math.max(0, initialUsed));
}

export function anonymousRegenRemaining(regenUsed: number): number {
  return Math.max(0, RENOVISION_ANONYMOUS_REGEN_ALLOWANCE - Math.max(0, regenUsed));
}

export function signedInRemaining(signedInUsed: number): number {
  return Math.max(0, RENOVISION_SIGNED_IN_FREE_ALLOWANCE - Math.max(0, signedInUsed));
}

/**
 * Whether an anonymous visitor may start their first preview (before any mockup exists).
 */
export function canAnonymousStartInitial(initialUsed: number): boolean {
  return initialUsed < RENOVISION_ANONYMOUS_INITIAL_ALLOWANCE;
}

/**
 * Whether an anonymous visitor may refine after at least one mockup exists.
 */
export function canAnonymousRegenerate(initialUsed: number, regenUsed: number): boolean {
  return (
    initialUsed >= RENOVISION_ANONYMOUS_INITIAL_ALLOWANCE &&
    regenUsed < RENOVISION_ANONYMOUS_REGEN_ALLOWANCE
  );
}

export function canSignedInGenerate(signedInUsed: number): boolean {
  return signedInUsed < RENOVISION_SIGNED_IN_FREE_ALLOWANCE;
}

export function shouldGateAnonymousSignup(
  intent: GenerationIntent,
  initialUsed: number,
  regenUsed: number,
): boolean {
  if (intent === "initial") {
    return !canAnonymousStartInitial(initialUsed);
  }
  return !canAnonymousRegenerate(initialUsed, regenUsed);
}

export function shouldGateSignedInExhausted(signedInUsed: number): boolean {
  return signedInUsed >= RENOVISION_SIGNED_IN_FREE_ALLOWANCE;
}

export function buildUsageSummary(params: {
  mode: "signed_in" | "anonymous";
  signedInUsed: number;
  initialUsed: number;
  regenUsed: number;
  hasMockup: boolean;
}): RenovisionUsageSummary {
  const {
    mode,
    signedInUsed,
    initialUsed,
    regenUsed,
    hasMockup,
  } = params;

  const anonymousInitialRemainingCount = anonymousInitialRemaining(initialUsed);
  const anonymousRegenRemainingCount = anonymousRegenRemaining(regenUsed);
  const signedInRemainingCount = signedInRemaining(signedInUsed);

  const anonymousPoolExhausted =
    mode === "anonymous" &&
    initialUsed >= RENOVISION_ANONYMOUS_INITIAL_ALLOWANCE &&
    regenUsed >= RENOVISION_ANONYMOUS_REGEN_ALLOWANCE;

  let gate: RenovisionUsageSummary["gate"] = "none";
  if (mode === "signed_in" && shouldGateSignedInExhausted(signedInUsed)) {
    gate = "signed_in_exhausted";
  } else if (anonymousPoolExhausted) {
    gate = "signup";
  }

  let hintLine = "";
  let secondaryHint: string | null = null;

  if (mode === "anonymous") {
    if (anonymousPoolExhausted) {
      hintLine = "You've reached your free guest previews.";
      secondaryHint =
        "Create a free Renovision account to unlock 5 more remodel previews.";
    } else if (!hasMockup) {
      hintLine =
        anonymousInitialRemainingCount > 0
          ? "Your first preview is free — no account needed."
          : "";
    } else {
      hintLine =
        anonymousRegenRemainingCount > 0
          ? `${anonymousRegenRemainingCount} free ${
              anonymousRegenRemainingCount === 1 ? "try" : "tries"
            } left`
          : "";
      if (anonymousRegenRemainingCount > 0 && anonymousRegenRemainingCount <= 2) {
        secondaryHint = "Create a free account to unlock 5 more previews.";
      }
    }
  } else {
    hintLine =
      signedInRemainingCount > 0
        ? `${signedInRemainingCount} free ${
            signedInRemainingCount === 1 ? "preview" : "previews"
          } left`
        : "";
    if (signedInRemainingCount > 0 && signedInRemainingCount <= 2) {
      secondaryHint = "More credits or premium plans are coming soon.";
    }
  }

  return {
    gate,
    anonymousPoolExhausted,
    mode,
    signedInUsed,
    signedInRemaining: signedInRemainingCount,
    anonymousInitialUsed: initialUsed,
    anonymousRegenUsed: regenUsed,
    anonymousInitialRemaining: anonymousInitialRemainingCount,
    anonymousRegenRemaining: anonymousRegenRemainingCount,
    hintLine,
    secondaryHint,
  };
}
