import { Check } from "lucide-react";

import { TryCtaLink } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingHero() {
  return (
    <section
      id="preview"
      className="relative scroll-mt-20 overflow-hidden border-b border-border/40 bg-gradient-to-b from-[#fbf8f3] via-[#f8f5ef] to-background px-4 pb-6 pt-6 sm:px-6 sm:pb-10 lg:pb-16 lg:pt-12 lg:px-8"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(232,126,55,0.08),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 lg:gap-10">
        <div className="mx-auto w-full max-w-xl text-center sm:max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-renovision-navy/80 sm:text-xs">
            Bathroom remodel planning
          </p>
          <h1 className="mt-1.5 text-balance text-3xl font-semibold tracking-tight text-foreground sm:mt-2 sm:text-5xl sm:leading-[1.08] lg:text-[2.75rem]">
            See Your Bathroom Remodeled Before You Hire a Contractor
          </h1>
          <p className="mx-auto mt-2 max-w-prose text-pretty text-sm font-semibold leading-snug text-renovision-navy sm:mt-3 sm:text-base">
            Includes a realistic preview + instant cost estimate so you can plan with confidence.
          </p>
          <p className="mx-auto mt-2 hidden max-w-prose text-pretty text-base leading-relaxed text-muted-foreground sm:mt-3 lg:block sm:text-lg">
            Upload a photo, see your remodel in seconds, and decide with confidence before starting your project.
          </p>
          <p className="mx-auto mt-2 max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground lg:hidden">
            Upload a photo and see your remodel in seconds.
          </p>
        </div>

        <div className="mx-auto w-full max-w-xl space-y-3 lg:max-w-xl lg:space-y-4">
          <div className="flex w-full justify-center">
            <TryCtaLink
              placement="landing_hero_primary"
              href="/try"
              className={cn(
                buttonVariants({ size: "lg" }),
                "flex h-[52px] w-full min-h-[52px] items-center justify-center bg-renovision-navy px-6 text-base font-semibold text-white shadow-lg shadow-renovision-navy/25 hover:bg-renovision-navy/90 lg:h-12 lg:min-h-12 lg:w-auto lg:px-8 lg:shadow-none",
              )}
            >
              Start My Bathroom Preview (Free)
            </TryCtaLink>
          </div>
          <div className="flex flex-col gap-2">
            <a
              href="#watch-transformation"
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "flex h-11 w-full items-center justify-center border-border/80 bg-background px-4 text-sm font-medium text-muted-foreground lg:h-12 lg:px-6 lg:text-base lg:text-foreground",
              )}
            >
              Watch a Real Bathroom Transformation
            </a>
            <a
              href="#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "flex h-11 w-full items-center justify-center border-border/80 bg-background px-4 text-sm font-medium text-muted-foreground lg:h-12 lg:px-6 lg:text-base lg:text-foreground",
              )}
            >
              How It Works
            </a>
          </div>
          <p className="text-center text-[13px] font-medium leading-snug text-muted-foreground lg:hidden">
            No signup • Takes 2 min • No spam
          </p>
          <p className="mx-auto hidden max-w-prose text-center text-sm font-medium leading-snug text-renovision-navy lg:block">
            Just upload a photo — takes under 2 minutes
          </p>
          <ul className="w-full space-y-2.5 rounded-xl border border-renovision-teal/25 bg-card/95 p-3 text-left shadow-sm ring-1 ring-renovision-teal/15 sm:space-y-3 sm:p-5">
            {(
              [
                "No signup required",
                "Takes under 2 minutes",
                "No contractor contact unless you choose",
              ] as const
            ).map((line) => (
              <li key={line} className="flex gap-2.5 text-sm font-semibold leading-snug text-foreground sm:gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-renovision-teal" strokeWidth={2.25} aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
