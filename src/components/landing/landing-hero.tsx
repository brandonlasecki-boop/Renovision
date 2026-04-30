import Link from "next/link";
import { Check } from "lucide-react";

import { BoldTransformationPreview } from "@/components/landing/bold-transformation-preview";
import { HeroMockupCard } from "@/components/landing/hero-mockup-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingHero() {
  return (
    <section
      id="preview"
      className="relative scroll-mt-20 overflow-hidden border-b border-border/40 bg-gradient-to-b from-[#fbf8f3] via-[#f8f5ef] to-background px-4 pb-12 pt-8 sm:px-6 sm:pb-20 sm:pt-12 lg:px-8"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(232,126,55,0.08),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14">
        <div className="max-w-xl text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-renovision-navy/80">
            Bathroom remodel planning
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl sm:leading-[1.08] lg:text-[2.75rem]">
            See Your Bathroom Remodeled Before Hiring a Contractor
          </h1>
          <p className="mx-auto mt-3 max-w-prose text-pretty text-sm font-semibold leading-snug text-renovision-navy sm:mx-0 sm:text-base">
            Plan with a real preview — not guesswork.
          </p>
          <p className="mx-auto mt-3 max-w-prose text-pretty text-base leading-relaxed text-muted-foreground sm:mx-0 sm:text-lg">
            Upload a photo, see a realistic remodel, and connect with a contractor when you&apos;re ready.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/try"
              className={cn(buttonVariants({ size: "lg" }), "h-12 bg-renovision-navy px-8 text-base text-white hover:bg-renovision-navy/90")}
            >
              See My Bathroom Remodel
            </Link>
            <a href="#how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 px-6 text-base")}>
              How It Works
            </a>
          </div>
          <ul className="mt-6 space-y-3 rounded-xl border border-border/70 bg-card/95 p-4 text-left shadow-sm ring-1 ring-black/[0.04] sm:p-5">
            {(
              [
                "No cost, no commitment",
                "Takes under 2 minutes",
                "No contractor contact unless you choose",
              ] as const
            ).map((line) => (
              <li key={line} className="flex gap-3 text-sm font-medium leading-snug text-foreground">
                <Check className="mt-0.5 size-5 shrink-0 text-renovision-teal" strokeWidth={2.25} aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Contractor matching is optional. Explore your remodel first—no sales calls from us unless you ask to connect.
          </p>
        </div>
        <div className="space-y-3">
          <HeroMockupCard linkToTry className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none" />
          <BoldTransformationPreview />
          <p className="text-center text-sm text-muted-foreground sm:text-left">
            Example preview above—your result uses your own bathroom photo.
          </p>
        </div>
      </div>
    </section>
  );
}
