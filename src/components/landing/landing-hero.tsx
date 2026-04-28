import Link from "next/link";

import { HeroMockupCard } from "@/components/landing/hero-mockup-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-[#fbf8f3] via-[#f8f5ef] to-background px-4 pb-12 pt-8 sm:px-6 sm:pb-20 sm:pt-12 lg:px-8">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(232,126,55,0.08),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14">
        <div className="max-w-xl text-center sm:text-left">
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl sm:leading-[1.08] lg:text-[2.75rem]">
            See Your Bathroom Remodel Before You Build It
          </h1>
          <p className="mx-auto mt-4 max-w-[34ch] text-pretty text-base leading-relaxed text-muted-foreground sm:mx-0 sm:text-lg">
            Choose a style. Upload your bathroom. See your future remodel.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/try"
              className={cn(buttonVariants({ size: "lg" }), "h-12 bg-renovision-navy px-8 text-base text-white hover:bg-renovision-navy/90")}
            >
              Start Free
            </Link>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Free to try • Takes about 2 minutes • No contractor contact unless you request it
          </p>
        </div>
        <div className="space-y-3">
          <HeroMockupCard className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none" />
          <p className="text-center text-sm text-muted-foreground sm:text-left">
            See what&apos;s possible before you spend thousands.
          </p>
        </div>
      </div>
    </section>
  );
}
