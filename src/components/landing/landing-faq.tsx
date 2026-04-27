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
      className="scroll-mt-24 border-b border-border/40 bg-background px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          FAQ
        </h2>
        <p className="mt-4 text-center text-lg text-muted-foreground">
          Straight answers to common questions.
        </p>
        <div className="mt-12 space-y-3">
          {faqs.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-xl border border-border/70 bg-card px-5 py-1 shadow-sm open:shadow-md"
            >
              <summary className="cursor-pointer list-none py-4 text-base font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  {q}
                  <span className="text-muted-foreground transition group-open:rotate-180">
                    <svg
                      className="size-5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </span>
                </span>
              </summary>
              <p className="border-t border-border/60 pb-4 pt-1 text-sm leading-relaxed text-muted-foreground">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
