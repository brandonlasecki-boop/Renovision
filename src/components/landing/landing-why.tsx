import { Eye, PiggyBank, MessageCircle } from "lucide-react";

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
      className="scroll-mt-24 border-b border-border/40 bg-renovision-navy-muted/50 px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Why Renovision
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built for homeowners who want confidence—not a sales pitch—before the
            first hammer swings.
          </p>
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {benefits.map(({ title, body, icon: Icon }) => (
            <li
              key={title}
              className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-renovision-orange/15 text-renovision-orange">
                <Icon className="size-5" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
