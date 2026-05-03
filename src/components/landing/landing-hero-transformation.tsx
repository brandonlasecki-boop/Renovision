"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { BeforeAfterCompareSlider } from "@/components/homeowner/before-after-compare-slider";
import {
  LANDING_DEMO_BEFORE,
  LANDING_DEMO_STYLE_OPTIONS,
} from "@/components/landing/landing-demo-style-options";
import { trackEvent } from "@/lib/analytics/google-ads";
import { getBathroomStyleById } from "@/lib/homeowner-try/bathroom-styles";
import type { BathroomStyleId } from "@/lib/homeowner-try/bathroom-styles";
import { cn } from "@/lib/utils";

const SCROLL_COMPLETE = 0.94;
/** Time to show “Now try different styles…” before revealing pills + slider. */
const CUE_MS = 900;

const MOBILE_MQ = "(max-width: 767px)";
/** Mobile: timed wipe duration once triggered. */
const MOBILE_AUTO_MS = 1800;
/** Mobile: delay after mount before the wipe animation starts (no scroll required). */
const MOBILE_AUTO_START_MS = 500;
/** Desktop: scrub begins only after this scroll offset (first scroll). */
const FIRST_SCROLL_PX = 2;
/** Desktop: treat card as “centered” when within this many px of viewport midline. */
const VIEWPORT_CENTER_TOL_PX = 14;

type DemoPhase = "scroll" | "cue" | "interactive";

function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Homepage hero transformation: desktop maps wipe progress to bringing the compare card to viewport center
 * (starts after first scroll); mobile runs a timed wipe shortly after load (no scroll).
 */
export function LandingHeroTransformation() {
  const cardRef = useRef<HTMLDivElement>(null);
  const desktopCenterErr0Ref = useRef<number | null>(null);
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

  useEffect(() => {
    if (reduceMotion || !isMobile || phase !== "scroll") return;

    let wipeRaf = 0;

    const runWipe = () => {
      if (mobileAnimStartedRef.current || phaseRef.current !== "scroll") return;
      mobileAnimStartedRef.current = true;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / MOBILE_AUTO_MS);
        setScrub(smootherstep(t));
        if (t < 1) wipeRaf = requestAnimationFrame(step);
      };
      wipeRaf = requestAnimationFrame(step);
    };

    const startTimer = window.setTimeout(runWipe, MOBILE_AUTO_START_MS);

    return () => {
      window.clearTimeout(startTimer);
      cancelAnimationFrame(wipeRaf);
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

  const cardChromeTitle =
    phase === "interactive"
      ? "Compare styles on this bathroom"
      : "Real bathroom · Spa style";

  const interactivePills = (
    <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-1 max-[430px]:gap-1 sm:flex-wrap sm:gap-2 sm:overflow-visible">
      {LANDING_DEMO_STYLE_OPTIONS.map((opt) => {
        const selected = opt.id === styleId;
        return (
          <button
            key={opt.id}
            type="button"
            title={getBathroomStyleById(opt.id)?.name ?? opt.pill}
            onClick={() => {
              trackEvent("style_selected", { style: opt.id });
              setStyleId(opt.id);
            }}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors max-[430px]:px-2 max-[430px]:text-[10px] sm:px-3.5 sm:py-1.5 sm:text-xs",
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
    <div className="motion-safe:animate-landing-interactive-pop space-y-2 motion-reduce:animate-none sm:space-y-2 md:space-y-3">
      {interactivePills}
      <BeforeAfterCompareSlider
        key={styleId}
        beforeUrl={LANDING_DEMO_BEFORE.src}
        afterUrl={activeOption.after.src}
        compact
        compactVariant="hero"
        initialSliderPct={100}
      />
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
      <div className="border-b border-border/60 bg-muted/25 px-2 py-1.5 text-center sm:px-3 sm:py-2 md:px-4">
        <p className="text-xs font-semibold text-renovision-navy sm:text-sm">{cardChromeTitle}</p>
      </div>
      <div
        className={cn(
          "sm:p-3",
          phase === "interactive" ? "p-2 sm:p-2.5" : isMobile ? "p-0" : "p-3 sm:p-4",
        )}
      >
        {phase === "interactive" ? interactiveBlock : scrollPhaseBlock}
      </div>
    </div>
  );

  return (
    <div className="w-full max-md:-mt-0.5" aria-label="Interactive bathroom style preview">
      {!isMobile ? (
        <div className="relative sm:-mt-1">
          <div
            className={cn(
              "z-10 flex w-full justify-center px-0 sm:px-2",
              phase === "scroll" ? "relative items-start py-2 sm:py-3" : "relative items-start py-3 sm:py-6",
            )}
          >
            <div ref={cardRef} className="w-full max-w-2xl scroll-mt-20 sm:scroll-mt-24">
              {cardShell}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "mx-auto max-w-6xl px-0 pb-0 sm:px-2",
            phase === "interactive" ? "mt-2 pt-0" : "-mt-0.5 pt-0",
          )}
        >
          <div ref={cardRef} className="mx-auto max-w-2xl scroll-mt-12 sm:scroll-mt-24">
            {cardShell}
          </div>
        </div>
      )}
    </div>
  );
}
