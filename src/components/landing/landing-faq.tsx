import { ChevronDown } from "lucide-react";

import { LandingTryCta } from "@/components/landing/landing-try-cta";

const faqs = [
  {
    q: "Is the estimate exact?",
    a: "No—it’s a planning range to help you orient budget and scope. Final pricing depends on materials, labor in your market, site conditions, and the remodelers you choose.",
  },
  {
    q: "Do I need measurements?",
    a: "You can start with a photo. More detail can improve accuracy over time, but you don’t need a perfect measured drawing to begin exploring.",
  },
  {
    q: "Can I connect with remodelers?",
    a: "Yes. When you’re ready for quotes, Renovision helps you move forward with clearer context than a cold call.",
  },
  {
    q: "Is Renovision free to try?",
    a: "You can try Renovision free to explore the experience. We’ll always be upfront about what’s included.",
  },
] as const;

export function LandingFaq() {
  return (
    <section
      id="faq"
      className="relative scroll-mt-24 overflow-hidden border-b border-border/40 bg-background px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 h-40 bg-gradient-to-b from-renovision-navy-muted/30 to-transparent"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-renovision-orange">
            Questions
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            FAQ
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Straight answers to common questions.
          </p>
        </div>
        <div className="mt-12 space-y-3 sm:mt-14">
          {faqs.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-2xl border border-border/60 bg-card/90 shadow-sm ring-1 ring-black/[0.03] open:border-renovision-orange/20 open:bg-card open:shadow-md open:ring-renovision-orange/10"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-base font-semibold text-foreground transition-colors marker:content-none hover:bg-muted/30 [&::-webkit-details-marker]:hidden sm:px-6 sm:py-5">
                <span className="pr-2 leading-snug">{q}</span>
                <ChevronDown
                  className="size-5 shrink-0 text-renovision-orange/80 transition-transform duration-200 group-open:rotate-180"
                  strokeWidth={2}
                  aria-hidden
                />
              </summary>
              <div className="border-t border-border/50 px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
                <p className="pt-4 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                  {a}
                </p>
              </div>
            </details>
          ))}
        </div>

        <LandingTryCta />
      </div>
    </section>
  );
}
