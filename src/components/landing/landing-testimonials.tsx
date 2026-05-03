import { Quote } from "lucide-react";

import { LandingTryCta } from "@/components/landing/landing-try-cta";

const quotes = [
  {
    quote: "This made it so much easier to picture the remodel.",
    attribution: "Homeowner, Austin",
  },
  {
    quote:
      "The estimate gave us a realistic starting point before we talked to anyone.",
    attribution: "Homeowner, Denver",
  },
] as const;

export function LandingTestimonials() {
  return (
    <section
      id="testimonials"
      className="relative scroll-mt-24 overflow-hidden border-b border-border/40 bg-gradient-to-b from-background via-muted/30 to-background px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-12 h-px w-[min(100%,48rem)] -translate-x-1/2 bg-gradient-to-r from-transparent via-renovision-orange/30 to-transparent"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-renovision-orange">
            From homeowners
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            What people say
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
            Real feedback from people who used Renovision to plan their bathroom.
          </p>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-2 md:gap-10">
          {quotes.map(({ quote, attribution }) => (
            <figure
              key={quote}
              className="relative flex flex-col rounded-3xl border border-border/50 bg-card p-8 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.03] sm:p-10"
            >
              <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-renovision-navy-muted text-renovision-orange">
                <Quote className="size-6 opacity-90" strokeWidth={1.75} aria-hidden />
              </div>
              <blockquote>
                <p className="text-xl font-medium leading-relaxed text-foreground sm:text-[1.35rem] sm:leading-snug">
                  &ldquo;{quote}&rdquo;
                </p>
              </blockquote>
              <figcaption className="mt-8 flex items-center gap-3 border-t border-border/60 pt-6 text-sm font-medium text-muted-foreground">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-renovision-navy/15 to-renovision-teal/10 text-xs font-semibold tabular-nums text-renovision-navy">
                  {(() => {
                    const city = attribution.split(",").map((s) => s.trim())[1];
                    const raw = city ?? attribution;
                    return raw.slice(0, 2).toUpperCase();
                  })()}
                </span>
                {attribution}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="hidden md:block">
          <LandingTryCta placement="landing_testimonials" />
        </div>
      </div>
    </section>
  );
}
