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

const MOBILE_MQ = "(max-width: 767px)";
/** Mobile: timed wipe duration once triggered. */
const MOBILE_AUTO_MS = 1800;
/** Desktop + mobile: scrub / timed wipe begins only after this scroll offset (first scroll). */
const FIRST_SCROLL_PX = 2;
/** Desktop: treat card as “centered” when within this many px of viewport midline. */
const VIEWPORT_CENTER_TOL_PX = 14;

type DemoPhase = "scroll" | "cue" | "interactive";

function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Homepage transformation: desktop maps wipe progress to bringing the compare card to viewport center
 * (starts after first scroll); mobile runs a timed wipe after first scroll (sticky scroll is unreliable).
 */
export function LandingScrollTransformationSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /** Desktop: signed distance from viewport center (px) sampled on first scroll — maps linearly to centered. */
  const desktopCenterErr0Ref = useRef<number | null>(null);
  /** Card viewport rect before the tall scroll track collapses (desktop cue phase only). */
  const cueBeforeRectRef = useRef<{ top: number; left: number } | null>(null);
  const cueScrollAppliedRef = useRef(false);

  const [scrub, setScrub] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>("scroll");
  const [styleId, setStyleId] = useState<BathroomStyleId>("spa_retreat");
  const [isMobile, setIsMobile] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const scrollDoneRef = useRef(false);
  const mobileAnimStartedRef = useRef(false);
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
    const mqMobile = window.matchMedia(MOBILE_MQ);
    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setIsMobile(mqMobile.matches);
      setReduceMotion(mqReduce.matches);
    };
    sync();
    mqMobile.addEventListener("change", sync);
    mqReduce.addEventListener("change", sync);
    return () => {
      mqMobile.removeEventListener("change", sync);
      mqReduce.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setScrub(1);
      scrollDoneRef.current = true;
      setPhase("interactive");
    }
  }, [reduceMotion]);

  /** Desktop: scrub 0→1 from first scroll until the compare card is vertically centered (no tall fake track). */
  useEffect(() => {
    if (reduceMotion || isMobile) return;

    let raf = 0;
    const tick = () => {
      if (phaseRef.current !== "scroll") return;
      const cardEl = cardRef.current;
      if (!cardEl) return;

      const wy = window.scrollY || document.documentElement?.scrollTop || 0;
      if (wy <= FIRST_SCROLL_PX) {
        desktopCenterErr0Ref.current = null;
        setScrub(0);
        return;
      }

      const r = cardEl.getBoundingClientRect();
      const e = r.top + r.height / 2 - window.innerHeight / 2;

      if (desktopCenterErr0Ref.current === null) {
        desktopCenterErr0Ref.current = e;
      }
      const e0 = desktopCenterErr0Ref.current;

      let linear: number;
      if (Math.abs(e) <= VIEWPORT_CENTER_TOL_PX) {
        linear = 1;
      } else if (Math.abs(e0) <= VIEWPORT_CENTER_TOL_PX) {
        linear = 1;
      } else {
        linear = 1 - e / e0;
        linear = Math.max(0, Math.min(1, linear));
      }

      const eased = smootherstep(linear);
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
  }, [reduceMotion, isMobile]);

  /**
   * Mobile: start the timed wipe on the first real scroll (or immediately if the page is already scrolled).
   */
  useEffect(() => {
    if (reduceMotion || !isMobile || phase !== "scroll") return;

    let tickRaf = 0;
    let wipeRaf = 0;

    const runWipe = () => {
      if (mobileAnimStartedRef.current) return;
      mobileAnimStartedRef.current = true;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / MOBILE_AUTO_MS);
        setScrub(smootherstep(t));
        if (t < 1) wipeRaf = requestAnimationFrame(step);
      };
      wipeRaf = requestAnimationFrame(step);
    };

    const winScrollY = () =>
      window.scrollY || document.documentElement?.scrollTop || 0;

    const check = () => {
      if (mobileAnimStartedRef.current || phaseRef.current !== "scroll") return;
      if (winScrollY() > FIRST_SCROLL_PX) runWipe();
    };

    const onScrollOrResize = () => {
      cancelAnimationFrame(tickRaf);
      tickRaf = requestAnimationFrame(check);
    };

    check();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    return () => {
      cancelAnimationFrame(tickRaf);
      cancelAnimationFrame(wipeRaf);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [reduceMotion, isMobile, phase]);

  useEffect(() => {
    if (reduceMotion || phase !== "scroll" || scrollDoneRef.current) return;
    if (scrub >= SCROLL_COMPLETE) {
      scrollDoneRef.current = true;
      setScrub(1);
      if (!isMobile && cardRef.current) {
        const r = cardRef.current.getBoundingClientRect();
        cueBeforeRectRef.current = { top: r.top, left: r.left };
      }
      setPhase("cue");
    }
  }, [scrub, phase, reduceMotion, isMobile]);

  /** Desktop cue: small layout snap correction when transitioning out of scroll-driven scrub (usually minimal). */
  useLayoutEffect(() => {
    if (isMobile) return;
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
  }, [phase, isMobile]);

  useEffect(() => {
    if (phase !== "cue") return;
    const t = window.setTimeout(() => setPhase("interactive"), CUE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const passivePct = Math.round(100 * scrub);

  const scrollPhaseSubtitle =
    phase === "interactive"
      ? "Same bathroom — pick a style and drag the slider to compare."
      : isMobile
        ? "Watch the Spa makeover, then try other styles on this room."
        : "See the Spa makeover on this bathroom, then try other styles on this room.";

  const cardChromeTitle =
    phase === "interactive"
      ? "Compare styles on this bathroom"
      : "Real bathroom · Spa style";

  const interactivePills = (
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
  );

  const interactiveBlock = (
    <div className="motion-safe:animate-landing-interactive-pop space-y-3 motion-reduce:animate-none sm:space-y-4">
      {interactivePills}
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
        <p className="mt-3 text-sm text-muted-foreground">Just upload a photo — takes under 2 minutes</p>
      </div>
    </div>
  );

  const scrollPhaseBlock = (
    <>
      <BeforeAfterCompareSlider
        beforeUrl={LANDING_DEMO_BEFORE.src}
        afterUrl={spaOption.after.src}
        compact
        compactVariant="hero"
        className="space-y-0"
        controlledPct={phase === "cue" ? 100 : passivePct}
        hideRange
        compareHint={null}
      />
      {phase === "cue" ? (
        <div
          role="status"
          className="motion-safe:animate-landing-cue-in mt-2 rounded-lg border border-renovision-orange/35 bg-gradient-to-br from-renovision-orange/[0.08] to-transparent px-2.5 py-2 text-center text-xs font-semibold text-renovision-navy motion-reduce:opacity-100 motion-reduce:animate-none sm:mt-3 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          Now try different styles on this bathroom
        </div>
      ) : null}
    </>
  );

  const cardShell = (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg ring-1 ring-black/[0.04] transition-[box-shadow] duration-500",
        phase === "interactive" && "ring-2 ring-renovision-orange/35 shadow-xl",
      )}
    >
      {/* Mobile scroll/cue: hide duplicate bar — H2 above already introduces the block; saves vertical gap. */}
      <div
        className={cn(
          "border-b border-border/60 bg-muted/25 px-3 py-2 text-center sm:px-4 sm:py-3",
          isMobile && phase !== "interactive" && "hidden",
        )}
      >
        <p className="text-sm font-semibold text-renovision-navy">{cardChromeTitle}</p>
      </div>
      <div
        className={cn(
          "sm:p-5",
          phase === "interactive" ? "p-3" : isMobile ? "p-0" : "p-4",
        )}
      >
        {phase === "interactive" ? interactiveBlock : scrollPhaseBlock}
      </div>
    </div>
  );

  return (
    <section
      ref={sectionRef}
      id="watch-transformation"
      aria-labelledby="watch-transformation-heading"
      className="scroll-mt-16 border-b border-border/40 bg-gradient-to-b from-background via-[#faf8f4]/40 to-background sm:scroll-mt-24"
    >
      <div className="mx-auto max-w-6xl px-4 pb-0 pt-2 text-center sm:px-6 sm:pb-4 sm:pt-8 lg:px-8">
        <h2
          id="watch-transformation-heading"
          className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          Watch a Real Bathroom Transformation
        </h2>
        <p className="mx-auto mt-0 max-w-2xl text-pretty text-sm leading-snug text-muted-foreground sm:mt-2 sm:text-base">
          {scrollPhaseSubtitle}
        </p>
      </div>

      {!isMobile ? (
        <div className="relative -mt-3 sm:-mt-3">
          <div
            className={cn(
              "z-10 flex w-full justify-center px-3 sm:px-6",
              phase === "scroll"
                ? "relative items-start py-3 sm:py-5"
                : "relative items-start py-5 sm:py-10",
            )}
          >
            <div ref={cardRef} className="w-full max-w-2xl scroll-mt-20 sm:scroll-mt-24">
              {cardShell}
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl -mt-5 px-3 pb-2 pt-0 sm:mt-0 sm:px-6 lg:px-8">
          <div ref={cardRef} className="mx-auto max-w-2xl scroll-mt-14 sm:scroll-mt-24">
            {cardShell}
          </div>
        </div>
      )}
    </section>
  );
}
