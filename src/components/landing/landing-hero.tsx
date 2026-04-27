import Link from "next/link";

import { HeroMockupCard } from "@/components/landing/hero-mockup-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-background via-renovision-navy-muted/40 to-background px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(232,126,55,0.08),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-renovision-orange">
            For homeowners
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl sm:leading-[1.08] lg:text-[2.75rem]">
            See Your Bathroom Remodel Before You Build It
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Upload a photo, explore a new design, get a planning estimate, and
            connect with remodelers when you&apos;re ready.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/try"
              className={cn(buttonVariants({ size: "lg" }), "h-11 px-6 text-base")}
            >
              Try Renovision Free
            </Link>
            <a
              href="#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 border-border/80 bg-background/80 px-6 text-base backdrop-blur",
              )}
            >
              See How It Works
            </a>
          </div>
        </div>
        <HeroMockupCard className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none" />
      </div>
    </section>
  );
}
