import { Eye, PiggyBank, MessageCircle } from "lucide-react";

import { LandingTryCta } from "@/components/landing/landing-try-cta";

const benefits = [
  {
    title: "Visualize before you commit",
    body: "See direction for your space so decisions feel less abstract.",
    icon: Eye,
  },
  {
    title: "Understand the budget early",
    body: "Get a planning range that helps you align scope and expectations sooner.",
    icon: PiggyBank,
  },
  {
    title: "Get clarity before talking to contractors",
    body: "Walk into conversations with photos, ideas, and a realistic starting point.",
    icon: MessageCircle,
  },
] as const;

export function LandingWhy() {
  return (
    <section
      id="why-renovision"
      className="relative scroll-mt-24 overflow-hidden border-b border-border/40 px-4 py-20 sm:px-6 sm:py-28 lg:px-8"
    >
      <div
        className="absolute inset-0 bg-gradient-to-b from-renovision-navy-muted/70 via-renovision-navy-muted/40 to-background"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_0%,rgba(232,126,55,0.09),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-renovision-orange">
            Why homeowners use Renovision
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
            Why Renovision
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Built for homeowners who want confidence—not a sales pitch—before the first hammer swings.
          </p>
        </div>
        <ul className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {benefits.map(({ title, body, icon: Icon }) => (
            <li
              key={title}
              className="group relative flex flex-col rounded-3xl border border-white/40 bg-background/80 p-8 shadow-[0_16px_48px_-28px_rgba(15,23,42,0.2)] backdrop-blur-sm ring-1 ring-black/[0.04] transition-all duration-300 hover:bg-background hover:shadow-[0_24px_56px_-24px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-card/90"
            >
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-renovision-orange/20 to-renovision-orange/5 text-renovision-orange ring-1 ring-renovision-orange/20">
                <Icon className="size-6" strokeWidth={1.5} />
              </div>
              <h3 className="mt-5 text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
                {title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                {body}
              </p>
            </li>
          ))}
        </ul>

        <LandingTryCta />
      </div>
    </section>
  );
}
