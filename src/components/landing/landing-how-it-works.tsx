import { Camera, LayoutTemplate, UsersRound } from "lucide-react";

import { LandingTryCta } from "@/components/landing/landing-try-cta";

const steps = [
  {
    step: "1",
    title: "Upload your bathroom photo",
    description:
      "Use a clear cellphone photo of your space—no perfect angles or measurements required to start.",
    icon: Camera,
  },
  {
    step: "2",
    title: "See your remodel instantly",
    description:
      "Get a realistic visual direction so you can plan with confidence—not guesswork—before you hire anyone.",
    icon: LayoutTemplate,
  },
  {
    step: "3",
    title: "Get matched with a contractor when you choose",
    description:
      "If you want quotes, connect on your schedule. We won’t share your details or flood you with calls unless you opt in.",
    icon: UsersRound,
  },
] as const;

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-24 overflow-hidden border-b border-border/40 bg-background px-4 py-14 sm:px-6 sm:py-24 lg:px-8 lg:py-28"
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
        <div className="mx-auto max-w-2xl text-center md:mx-0 md:text-left">
          <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-renovision-orange sm:text-xs sm:tracking-[0.2em] md:block">
            Three steps
          </p>
          <h2 className="mt-2 text-balance text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl sm:leading-tight md:mt-2 md:text-4xl lg:text-[2.5rem] lg:leading-tight">
            How It Works
          </h2>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground max-md:text-center sm:text-base md:mt-4 md:text-lg">
            A simple planning path from your real bathroom to a confident hire. Contractor connection is always optional—you
            stay in control.
          </p>
        </div>

        <div className="relative mt-8 max-md:mt-8 md:mt-20">
          <div
            className="pointer-events-none absolute left-0 right-0 top-14 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block"
            aria-hidden
          />
          <div className="grid gap-5 md:grid-cols-3 md:gap-6 lg:gap-8">
            {steps.map(({ step, title, description, icon: Icon }) => (
              <div
                key={step}
                className="group relative flex flex-col rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/80 p-6 shadow-[0_16px_44px_-22px_rgba(15,23,42,0.22)] ring-1 ring-black/[0.04] transition-all duration-300 hover:border-renovision-orange/25 hover:shadow-[0_24px_60px_-20px_rgba(232,126,55,0.15)] max-md:text-center md:rounded-3xl md:p-8 dark:ring-white/[0.06]"
              >
                <div className="mb-4 flex items-start justify-between gap-3 max-md:mx-auto max-md:max-w-[14rem] max-md:flex-col max-md:items-center md:mb-6 md:flex-row md:justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-renovision-navy to-renovision-navy/90 text-white shadow-lg shadow-renovision-navy/25 ring-2 ring-white/10 md:size-14">
                    <Icon className="size-5 md:size-6" strokeWidth={1.5} />
                  </span>
                  <span className="flex size-8 items-center justify-center rounded-full border border-border/80 bg-muted/50 text-xs font-bold tabular-nums text-renovision-navy md:size-9 md:text-sm">
                    {step}
                  </span>
                </div>
                <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg md:text-xl">
                  {title}
                </h3>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground sm:text-sm md:mt-3 md:text-[15px]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:block">
          <LandingTryCta align="left" placement="landing_how_it_works" />
        </div>
      </div>
    </section>
  );
}
