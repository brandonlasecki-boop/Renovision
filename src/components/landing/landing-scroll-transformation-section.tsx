"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

const SCROLL_COMPLETE = 0.94;
/** Time to show “Now try different styles…” before revealing pills + slider. */
const CUE_MS = 900;

type DemoPhase = "scroll" | "cue" | "interactive";

function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Single homepage transformation: tall sticky track + scroll-driven scrub (same on mobile and desktop),
 * then cue → style pills + slider + CTA.
 */
export function LandingScrollTransformationSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /** Card viewport rect before the tall scroll track collapses (cue phase). */
  const cueBeforeRectRef = useRef<{ top: number; left: number } | null>(null);
  const cueScrollAppliedRef = useRef(false);

  const [scrub, setScrub] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>("scroll");
  const [styleId, setStyleId] = useState<BathroomStyleId>("spa_retreat");
  const [reduceMotion, setReduceMotion] = useState(false);
  const scrollDoneRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const spaOption = useMemo(
    () => LANDING_DEMO_STYLE_OPTIONS.find((o) => o.id === "spa_retreat") ?? LANDING_DEMO_STYLE_OPTIONS[0],
    [],
  );

  const activeOption = useMemo(
    () => LANDING_DEMO_STYLE_OPTIONS.find((o) => o.id === styleId) ?? LANDING_DEMO_STYLE_OPTIONS[0],
    [styleId],
  );

  useEffect(() => {
    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mqReduce.matches);
    sync();
    mqReduce.addEventListener("change", sync);
    return () => mqReduce.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setScrub(1);
      scrollDoneRef.current = true;
      setPhase("interactive");
    }
  }, [reduceMotion]);

  /** Scrub from scroll progress through tall sticky track (mobile + desktop). */
  useEffect(() => {
    if (reduceMotion) return;
    const track = trackRef.current;
    if (!track) return;

    let raf = 0;
    const tick = () => {
      if (phaseRef.current !== "scroll") return;
      const scrollable = Math.max(1, track.offsetHeight - window.innerHeight);
      const top = track.getBoundingClientRect().top;
      const raw = -top / scrollable;
      const p = Math.min(1, Math.max(0, raw));
      const eased = smootherstep(p);
      setScrub((prev) => Math.max(prev, eased));
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
      setScrub(1);
      if (cardRef.current) {
        const r = cardRef.current.getBoundingClientRect();
        cueBeforeRectRef.current = { top: r.top, left: r.left };
      }
      setPhase("cue");
    }
  }, [scrub, phase, reduceMotion]);

  /**
   * Collapsing the tall track removes document height while scroll position stays fixed — correct with one
   * instant scroll delta so the card stays visually anchored (mobile + desktop).
   */
  useLayoutEffect(() => {
    if (phase !== "cue") {
      cueScrollAppliedRef.current = false;
      return;
    }
    if (cueScrollAppliedRef.current) return;

    const before = cueBeforeRectRef.current;
    cueBeforeRectRef.current = null;
    const el = cardRef.current;
    if (!before || !el) return;

    const last = el.getBoundingClientRect();
    const dy = last.top - before.top;
    const dx = last.left - before.left;
    if (Math.abs(dy) < 0.25 && Math.abs(dx) < 0.25) return;

    cueScrollAppliedRef.current = true;
    window.scrollBy({ left: dx, top: dy, behavior: "instant" });
  }, [phase]);

  useEffect(() => {
    if (phase !== "cue") return;
    const t = window.setTimeout(() => setPhase("interactive"), CUE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const passivePct = Math.round(100 * scrub);

  const compareHintScroll =
    phase !== "scroll"
      ? null
      : reduceMotion
        ? null
        : "Keep scrolling — the bathroom transforms.";

  return (
    <section
      ref={sectionRef}
      id="watch-transformation"
      aria-labelledby="watch-transformation-heading"
      className="scroll-mt-20 border-b border-border/40 bg-gradient-to-b from-background via-[#faf8f4]/40 to-background sm:scroll-mt-24"
    >
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-3 text-center sm:px-6 sm:pt-8 sm:pb-4 lg:px-8">
        <h2
          id="watch-transformation-heading"
          className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          Watch a Real Bathroom Transformation
        </h2>
        <p className="mx-auto mt-1.5 max-w-2xl text-pretty text-sm text-muted-foreground sm:mt-2 sm:text-base">
          {phase === "interactive"
            ? "Same bathroom — pick a style and drag the slider to compare."
            : "Scroll once to see the Spa makeover, then try other styles on this room."}
        </p>
      </div>

      <div
        ref={trackRef}
        className={cn("relative -mt-2 sm:-mt-3", phase === "scroll" && "min-h-[230vh]")}
      >
        <div
          className={cn(
            "z-10 flex w-full justify-center px-4 sm:px-6",
            phase === "scroll"
              ? "sticky top-0 min-h-[100dvh] items-center py-6 sm:py-8"
              : "relative items-start py-8 sm:py-10",
          )}
        >
          <div ref={cardRef} className="w-full max-w-2xl scroll-mt-20 sm:scroll-mt-24">
            <div
              className={cn(
                "overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg ring-1 ring-black/[0.04] transition-[box-shadow] duration-500",
                phase === "interactive" && "ring-2 ring-renovision-orange/35 shadow-xl",
              )}
            >
              <div className="border-b border-border/60 bg-muted/25 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-renovision-navy">
                  {phase === "interactive"
                    ? "Compare styles on this bathroom"
                    : "Real bathroom · Spa style (scroll to transform)"}
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
                      initialSliderPct={100}
                    />
                    <div className="pt-2 text-center">
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
                      <p className="mt-3 text-sm text-muted-foreground">
                        Just upload a photo — takes under 2 minutes
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <BeforeAfterCompareSlider
                      beforeUrl={LANDING_DEMO_BEFORE.src}
                      afterUrl={spaOption.after.src}
                      compact
                      compactVariant="hero"
                      controlledPct={phase === "cue" ? 100 : passivePct}
                      hideRange
                      compareHint={compareHintScroll}
                    />
                    {phase === "cue" ? (
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
          </div>
        </div>
      </div>
    </section>
  );
}
