"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { BeforeAfterCompareSlider } from "@/components/homeowner/before-after-compare-slider";
import {
  LANDING_DEMO_BEFORE,
  LANDING_DEMO_STYLE_OPTIONS,
} from "@/components/landing/landing-demo-style-options";
import { TryCtaLink } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { getBathroomStyleById } from "@/lib/homeowner-try/bathroom-styles";
import type { BathroomStyleId } from "@/lib/homeowner-try/bathroom-styles";
import { cn } from "@/lib/utils";

const SCROLL_COMPLETE = 0.93;
const TRANSITION_MS = 750;

type DemoPhase = "scroll" | "transition" | "interactive";

/**
 * Single landing demo: scroll animates Spa before→after, then unlocks style pills + slider.
 */
export function LandingScrollTransformationSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [scrub, setScrub] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [phase, setPhase] = useState<DemoPhase>("scroll");
  const [styleId, setStyleId] = useState<BathroomStyleId>("spa_retreat");
  const scrollDoneRef = useRef(false);

  const spaOption = useMemo(
    () => LANDING_DEMO_STYLE_OPTIONS.find((o) => o.id === "spa_retreat") ?? LANDING_DEMO_STYLE_OPTIONS[0],
    [],
  );

  const activeOption = useMemo(
    () => LANDING_DEMO_STYLE_OPTIONS.find((o) => o.id === styleId) ?? LANDING_DEMO_STYLE_OPTIONS[0],
    [styleId],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const red = mq.matches;
      setReduceMotion(red);
      if (red) {
        scrollDoneRef.current = true;
        setPhase("interactive");
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const el = sectionRef.current;
    if (!el) return;

    let raf = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const start = vh * 0.9;
      const end = vh * 0.34;
      const span = Math.max(1, start - end);
      const raw = (start - r.top) / span;
      const clamped = Math.min(1, Math.max(0, raw));
      const eased = clamped * clamped * (3 - 2 * clamped);
      setScrub(eased);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion || phase !== "scroll" || scrollDoneRef.current) return;
    if (scrub >= SCROLL_COMPLETE) {
      scrollDoneRef.current = true;
      setPhase("transition");
    }
  }, [scrub, phase, reduceMotion]);

  useEffect(() => {
    if (phase !== "transition") return;
    const t = window.setTimeout(() => setPhase("interactive"), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const passivePct = reduceMotion ? 0 : Math.round(100 * (1 - scrub));

  return (
    <section
      ref={sectionRef}
      id="watch-transformation"
      aria-labelledby="watch-transformation-heading"
      className="scroll-mt-20 border-b border-border/40 bg-gradient-to-b from-background via-[#faf8f4]/40 to-background sm:scroll-mt-24"
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <h2
          id="watch-transformation-heading"
          className="text-balance text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          Watch a Real Bathroom Transformation
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-pretty text-center text-sm text-muted-foreground sm:text-base">
          {phase === "interactive"
            ? "Same bathroom photo — switch styles and drag the slider."
            : "Scroll down once to see the Spa makeover play — then choose other styles."}
        </p>

        <div
          className={cn(
            "mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg ring-1 ring-black/[0.04] transition-[box-shadow] duration-500",
            phase === "interactive" && "ring-2 ring-renovision-orange/35 shadow-xl",
          )}
        >
          <div className="border-b border-border/60 bg-muted/25 px-4 py-3 text-center sm:px-5 sm:text-left">
            <p className="text-sm font-semibold text-renovision-navy">
              {phase === "interactive"
                ? "Compare styles on this bathroom"
                : "Real example — Spa style (scroll to animate)"}
            </p>
          </div>

          <div className="p-4 sm:p-5">
            {phase === "interactive" ? (
              <div className="motion-safe:animate-landing-interactive-pop space-y-4 motion-reduce:animate-none">
                <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
                  {LANDING_DEMO_STYLE_OPTIONS.map((opt) => {
                    const selected = opt.id === styleId;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        title={getBathroomStyleById(opt.id)?.name ?? opt.pill}
                        onClick={() => setStyleId(opt.id)}
                        className={cn(
                          "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                          selected
                            ? "border-renovision-orange bg-renovision-orange/15 text-renovision-navy shadow-sm"
                            : "border-border/80 bg-background text-muted-foreground hover:border-renovision-orange/40 hover:text-foreground",
                        )}
                        aria-pressed={selected}
                      >
                        {opt.pill}
                      </button>
                    );
                  })}
                </div>
                <BeforeAfterCompareSlider
                  key={styleId}
                  beforeUrl={LANDING_DEMO_BEFORE.src}
                  afterUrl={activeOption.after.src}
                  compact
                  compactVariant="hero"
                  initialSliderPct={0}
                />
              </div>
            ) : (
              <>
                <BeforeAfterCompareSlider
                  beforeUrl={LANDING_DEMO_BEFORE.src}
                  afterUrl={spaOption.after.src}
                  compact
                  compactVariant="hero"
                  controlledPct={phase === "transition" ? 0 : passivePct}
                  hideRange
                  compareHint={
                    reduceMotion
                      ? "Motion reduced — styles unlocked below."
                      : phase === "scroll"
                        ? "Keep scrolling — watch it transform."
                        : null
                  }
                />
                {phase === "transition" ? (
                  <div
                    role="status"
                    className="motion-safe:animate-landing-cue-in mt-4 rounded-xl border border-renovision-orange/35 bg-gradient-to-br from-renovision-orange/[0.08] to-transparent px-4 py-3 text-center text-sm font-semibold text-renovision-navy motion-reduce:opacity-100 motion-reduce:animate-none"
                  >
                    Now try different styles on this bathroom
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-xl text-center">
          <TryCtaLink
            placement="landing_scroll_transformation_followup"
            href="/try"
            className={cn(
              buttonVariants({ size: "lg" }),
              "inline-flex h-[52px] min-h-[52px] w-full max-w-md items-center justify-center bg-renovision-navy px-6 text-base font-semibold text-white shadow-md shadow-renovision-navy/20 hover:bg-renovision-navy/90 sm:mx-auto sm:w-auto sm:px-8",
            )}
          >
            Start My Bathroom Preview (Free)
          </TryCtaLink>
          <p className="mt-3 text-sm text-muted-foreground">Just upload a photo — takes under 2 minutes</p>
        </div>
      </div>
    </section>
  );
}
