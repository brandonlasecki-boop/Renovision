import { Camera, LayoutTemplate, UsersRound } from "lucide-react";

const steps = [
  {
    step: "1",
    title: "Upload your bathroom photo",
    description:
      "Start with a clear photo of your space—no perfect angles required.",
    icon: Camera,
  },
  {
    step: "2",
    title: "See a redesigned version and estimate",
    description:
      "Explore a fresh visual direction and a planning range to set expectations early.",
    icon: LayoutTemplate,
  },
  {
    step: "3",
    title: "Connect with remodelers if you want quotes",
    description:
      "When you’re ready, reach out to pros with context already in hand.",
    icon: UsersRound,
  },
] as const;

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-24 overflow-hidden border-b border-border/40 bg-background px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-renovision-orange/[0.06] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-renovision-teal/[0.05] blur-3xl"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center sm:mx-0 sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-renovision-orange">
            Simple flow
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
            How it works
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Three calm steps from inspiration to clarity—without the overwhelm.
          </p>
        </div>

        <div className="relative mt-16 md:mt-20">
          <div
            className="pointer-events-none absolute left-0 right-0 top-14 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block"
            aria-hidden
          />
          <div className="grid gap-8 md:grid-cols-3 md:gap-6 lg:gap-8">
            {steps.map(({ step, title, description, icon: Icon }) => (
              <div
                key={step}
                className="group relative flex flex-col rounded-3xl border border-border/50 bg-gradient-to-b from-card to-card/80 p-8 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.25)] ring-1 ring-black/[0.04] transition-all duration-300 hover:border-renovision-orange/25 hover:shadow-[0_24px_60px_-20px_rgba(232,126,55,0.15)] dark:ring-white/[0.06]"
              >
                <div className="mb-6 flex items-start justify-between gap-3">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-renovision-navy to-renovision-navy/90 text-white shadow-lg shadow-renovision-navy/25 ring-2 ring-white/10">
                    <Icon className="size-6" strokeWidth={1.5} />
                  </span>
                  <span className="flex size-9 items-center justify-center rounded-full border border-border/80 bg-muted/50 text-sm font-bold tabular-nums text-renovision-navy">
                    {step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
                  {title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
