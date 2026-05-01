import { TryCtaLink } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingFinalCta() {
  return (
    <section
      id="get-started"
      className="relative scroll-mt-24 overflow-hidden px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div
        className="absolute inset-0 bg-gradient-to-b from-background via-renovision-navy-muted/25 to-renovision-navy-muted/50"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-renovision-orange/[0.12] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-renovision-teal/[0.08] blur-3xl"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-border/50 bg-gradient-to-br from-card via-card to-muted/40 p-10 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] ring-1 ring-black/[0.05] sm:p-12 md:p-14">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-renovision-orange">
              Plan before you hire
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              See your bathroom remodeled—then decide with confidence
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Upload a photo for a realistic preview and planning context. Connect with a contractor only if and when you
              choose—no spam, no pressure.
            </p>
            <div className="mt-10">
              <TryCtaLink
                placement="landing_final_cta"
                href="/try"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 bg-renovision-navy px-10 text-base font-semibold text-white shadow-lg shadow-renovision-navy/25 transition hover:bg-renovision-navy/90",
                )}
              >
                See a Preview of My Bathroom Remodel
              </TryCtaLink>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              No cost to try. No contractor outreach unless you opt in.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
