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
    <section className="border-b border-border/40 bg-background px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          From homeowners
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {quotes.map(({ quote, attribution }) => (
            <figure
              key={quote}
              className="rounded-2xl border border-border/60 bg-muted/20 px-6 py-8 text-center"
            >
              <blockquote>
                <p className="text-lg font-medium leading-relaxed text-foreground md:text-[1.125rem]">
                  &ldquo;{quote}&rdquo;
                </p>
              </blockquote>
              <figcaption className="mt-4 text-sm text-muted-foreground">
                {attribution}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
