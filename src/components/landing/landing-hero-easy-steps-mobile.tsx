import { Images, Upload, Wand2 } from "lucide-react";

const STEPS = [
  {
    step: "1",
    title: "Upload",
    srDetail: "Upload a clear photo of your bathroom.",
    Icon: Upload,
  },
  {
    step: "2",
    title: "Style",
    srDetail: "Pick your favorite remodel style.",
    Icon: Wand2,
  },
  {
    step: "3",
    title: "Results",
    srDetail: "See your stunning new bathroom instantly.",
    Icon: Images,
  },
] as const;

/** Compact 1-2-3 strip under the hero trust line (same on mobile and desktop). */
export function LandingHeroEasyStepsMobile() {
  return (
    <div
      id="hero-easy-steps"
      className="order-7 mx-auto mt-0.5 w-full max-w-md scroll-mt-24 md:max-w-lg"
    >
      <div className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/50 to-muted/25 px-2.5 py-2.5 shadow-sm ring-1 ring-black/[0.04]">
        <h2 className="text-center text-sm font-semibold leading-tight tracking-tight text-foreground">
          It&apos;s as easy as <span className="text-renovision-orange">1-2-3</span>
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {STEPS.map(({ step, title, srDetail, Icon }) => (
            <div key={step} className="flex flex-col items-center text-center">
              <span className="flex size-8 items-center justify-center rounded-full bg-renovision-orange text-white shadow-sm ring-1 ring-renovision-orange/25">
                <Icon className="size-3.5" strokeWidth={2} aria-hidden />
              </span>
              <p className="mt-1 text-[10px] font-bold leading-none text-foreground">
                <span className="text-renovision-orange">{step}</span> {title}
              </p>
              <span className="sr-only">{srDetail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
