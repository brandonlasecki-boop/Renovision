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
      className="scroll-mt-24 border-b border-border/40 bg-background px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Three calm steps from inspiration to clarity—without the overwhelm.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map(({ step, title, description, icon: Icon }) => (
            <div
              key={step}
              className="group relative flex flex-col rounded-2xl border border-border/70 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-renovision-navy-muted text-renovision-navy ring-1 ring-renovision-navy/10">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-semibold tabular-nums text-muted-foreground/80">
                  {step}
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
