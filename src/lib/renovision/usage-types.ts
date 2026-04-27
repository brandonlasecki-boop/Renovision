export type RenovisionGateKind =
  | "none"
  | "signup"
  | "signed_in_exhausted";

export type RenovisionUsageSummary = {
  gate: RenovisionGateKind;
  /** True when anonymous 1+3 allowance is fully used (upgrade path). */
  anonymousPoolExhausted: boolean;
  /** Authenticated user subject to the signed-in pool. */
  mode: "signed_in" | "anonymous";
  /** Signed-in: used count out of RENOVISION_SIGNED_IN_FREE_ALLOWANCE. Anonymous: not used for UI pool text. */
  signedInUsed: number;
  signedInRemaining: number;
  anonymousInitialUsed: number;
  anonymousRegenUsed: number;
  anonymousInitialRemaining: number;
  anonymousRegenRemaining: number;
  /** Single line for subtle UI, e.g. “3 free tries left”. */
  hintLine: string;
  /** Secondary nudge when still anonymous but close to limit. */
  secondaryHint: string | null;
};
