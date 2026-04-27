"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Warm, homeowner-focused state when the signed-in complimentary pool is used up.
 * Not billing-style — reassurance that more is on the way.
 */
export function RenovisionFreePreviewsExhaustedPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-card via-card to-renovision-navy-muted/30",
        "p-8 text-center shadow-[0_20px_60px_-18px_rgba(12,39,68,0.18)]",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-renovision-orange/[0.07] blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -left-10 size-44 rounded-full bg-renovision-teal/[0.06] blur-2xl"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border/40 bg-background/90 shadow-sm">
          <Heart className="size-7 text-renovision-orange" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="space-y-2">
          <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            You&apos;ve used your free previews
          </h2>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
            More credits and premium access are coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
