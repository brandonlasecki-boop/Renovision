import Link from "next/link";

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
            Free Bathroom Preview + Planning Range
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl sm:leading-[1.08] lg:text-[2.75rem]">
            See Your Bathroom Remodel in Minutes Before You Spend a Dollar
          </h1>
          <p className="mx-auto mt-4 max-w-[34ch] text-pretty text-base leading-relaxed text-muted-foreground sm:mx-0 sm:text-lg">
            Upload one photo, try a style, and get a realistic visual + budget range so you can plan smarter.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/try"
              className={cn(buttonVariants({ size: "lg" }), "h-12 bg-renovision-navy px-8 text-base text-white hover:bg-renovision-navy/90")}
            >
              Try My Bathroom Free
            </Link>
            <a href="#how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 px-6 text-base")}>
              See How It Works
            </a>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            <li>Free to try - no credit card required</li>
            <li>Takes about 2 minutes</li>
            <li>No contractor contact unless you ask for it</li>
          </ul>
        </div>
        <div className="space-y-3">
          <HeroMockupCard className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none" />
          <BoldTransformationPreview />
          <p className="text-center text-sm text-muted-foreground sm:text-left">
            See what&apos;s possible before you spend thousands.
          </p>
        </div>
      </div>
    </section>
  );
}
