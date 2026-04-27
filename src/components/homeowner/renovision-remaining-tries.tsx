"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RenovisionUsageSummary } from "@/lib/renovision/usage-types";

type Props = {
  usage: RenovisionUsageSummary;
  /** True once a project exists (refine flow). */
  hasProject: boolean;
  /** True once at least one mockup image exists. */
  hasMockup: boolean;
  className?: string;
};

/**
 * Compact, homeowner-friendly remaining preview indicator for generate / regenerate.
 */
export function RenovisionRemainingTries({ usage, hasProject, hasMockup, className }: Props) {
  if (usage.gate === "signed_in_exhausted") {
    return null;
  }

  if (usage.gate === "signup") {
    return (
      <div
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground shadow-sm",
          className,
        )}
      >
        <Sparkles className="size-3.5 shrink-0 text-renovision-orange/80" aria-hidden />
        <span className="leading-snug">You&apos;ve used every complimentary guest preview.</span>
      </div>
    );
  }

  if (usage.mode === "anonymous") {
    if (!hasProject) {
      return (
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-renovision-orange/20 bg-renovision-orange/[0.06] px-3 py-1.5 text-xs font-medium text-foreground shadow-sm",
            className,
          )}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-renovision-orange" aria-hidden />
          <span>Guest · 1 preview + 3 refinements included</span>
        </div>
      );
    }

    if (!hasMockup) {
      return (
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-renovision-orange/20 bg-renovision-orange/[0.06] px-3 py-1.5 text-xs font-medium text-foreground shadow-sm",
            className,
          )}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-renovision-orange" aria-hidden />
          <span>First preview included · then {usage.anonymousRegenRemaining} refinements</span>
        </div>
      );
    }

    const n = usage.anonymousRegenRemaining;
    const label = n === 1 ? "1 refinement left" : `${n} refinements left`;
    const low = n > 0 && n <= 2;

    return (
      <div
        className={cn(
          "inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm",
          low
            ? "border-renovision-orange/25 bg-renovision-orange/[0.07] text-foreground"
            : "border-border/70 bg-card text-foreground",
          className,
        )}
      >
        <Sparkles className={cn("size-3.5 shrink-0", low ? "text-renovision-orange" : "text-renovision-orange/70")} aria-hidden />
        <span>{label}</span>
      </div>
    );
  }

  const n = usage.signedInRemaining;
  const label = n === 1 ? "1 free preview left" : `${n} free previews left`;
  const low = n > 0 && n <= 2;

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm",
        low
          ? "border-renovision-teal/25 bg-renovision-teal/[0.06] text-foreground"
          : "border-border/70 bg-card text-foreground",
        className,
      )}
    >
      <Sparkles className={cn("size-3.5 shrink-0", low ? "text-renovision-teal" : "text-renovision-teal/80")} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
