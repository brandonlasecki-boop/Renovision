"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Primary clip is `public/looping_video2.mp4` (keep in sync with `Images/looping_video2.mp4`).
 * If that file uses a codec Windows / browsers do not decode (e.g. HEVC), run
 * `scripts/reencode-looping-video.ps1` after installing FFmpeg, then replace `public/looping_video2.mp4`.
 */
const LOADER_VIDEO_SRC_CHAIN = ["/looping_video2.mp4", "/renovision-looping-logo.mp4"] as const;

const STATIC_LOGO_PNG_SRC = "/renovision-logo.png";

const BATHROOM_FACTS = [
  "Ancient Romans loved underfloor heating in baths — hypocausts were the original cozy floor.",
  "Grout lines are tiny rivers: sealing them is what keeps your shower looking magazine-fresh.",
  "Ventilation isn’t glamorous, but it’s the MVP that fights fog, mold, and mystery smells.",
  "Curbless showers look sleek — the slope math underneath is where the real magic happens.",
  "A well-lit vanity mirror is basically portrait mode for your face — watts and color temperature matter.",
  "Porcelain tile can mimic stone, wood, or fabric — same footprint, totally different vibe.",
  "Niches aren’t just storage — they’re built-in styling moments for tile and trim.",
  "Soft-close drawers: small upgrade, huge daily joy (especially before coffee).",
  "Warm white LEDs (~2700–3000K) read “spa”; cool white reads “clinic” — pick your story.",
  "Water-saving fixtures today can still feel plush — aerators are sneaky-good tech.",
  "Backer board behind tile isn’t optional drama — it’s what keeps walls quiet and solid.",
  "Heated towel racks: part bathroom, part hug from the future.",
  "Wall-hung vanities float, but their brackets are doing serious invisible gymnastics.",
  "Shower glass coatings exist to repel hard water — chemistry vs. your tap water, round by round.",
  "A toilet’s rough-in distance is one number that rules them all — measure twice, install once.",
  "Pencil trim and schluter strips are the jewelry of tile transitions — tiny lines, big polish.",
  "Paint with higher sheen in wet zones laughs off splashes a little better than flat finishes.",
  "Recessed medicine cabinets steal inches from the wall, not your elbow room in the room.",
  "Floor heat cables turn cold tile into a warm welcome — especially on winter mornings.",
  "Bidet seats: the bathroom’s unexpected glow-up for comfort and sustainability.",
];

/** Seconds each “Did you know?” fact stays visible before rotating. */
const FACT_DISPLAY_INTERVAL_SEC = 7;

export type RenovisionGeneratingLoaderProps = {
  title: string;
  hint: string;
  elapsedSec: number;
  /** Original bathroom photo (signed URL or `blob:`) — full-bleed under the brand row. */
  beforeImageUrl?: string | null;
};

/** Static mark + wordmark when no video in the chain can decode (wrong codec, missing file). */
function RenovisionLoaderBrandStaticFallback() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center px-[5%] py-[8%]"
      role="img"
      aria-label="Renovision"
    >
      <div className="flex max-w-[min(100%,19rem)] items-center justify-center gap-2.5 sm:max-w-[21rem] sm:gap-3">
        <div
          aria-hidden
          className="h-[3.15rem] w-[3.1rem] shrink-0 rounded-md sm:h-[3.55rem] sm:w-[3.45rem]"
          style={{
            backgroundImage: `url("${STATIC_LOGO_PNG_SRC}")`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "290% auto",
            backgroundPosition: "11% 50%",
          }}
        />
        <span
          className="select-none font-extrabold tracking-[-0.04em] text-primary antialiased sm:tracking-[-0.035em]"
          style={{
            fontSize: "clamp(1.6rem, 5.2vw, 2rem)",
            lineHeight: 1.02,
            textShadow:
              "0 0 16px rgba(255,255,255,.9), 0 0 1px rgba(255,255,255,1), 0 2px 10px rgba(0,0,0,.22)",
          }}
          aria-hidden
        >
          Renovision
        </span>
      </div>
    </div>
  );
}

/** Looping brand video with codec / file fallbacks, then static brand. */
function RenovisionLoaderLoopingVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [chainIndex, setChainIndex] = useState(0);
  const [useStaticFallback, setUseStaticFallback] = useState(false);

  const tryPlay = useCallback(() => {
    const el = ref.current;
    if (!el || useStaticFallback) return;
    el.muted = true;
    void el.play().catch(() => {});
  }, [useStaticFallback]);

  useEffect(() => {
    tryPlay();
  }, [tryPlay, chainIndex, useStaticFallback]);

  const onVideoError = useCallback(() => {
    setChainIndex((i) => {
      if (i >= LOADER_VIDEO_SRC_CHAIN.length - 1) {
        setUseStaticFallback(true);
        return i;
      }
      return i + 1;
    });
  }, []);

  if (useStaticFallback) {
    return <RenovisionLoaderBrandStaticFallback />;
  }

  const src = LOADER_VIDEO_SRC_CHAIN[chainIndex];

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" role="img" aria-label="Renovision">
      {/*
        Avoid flex + h-full on <video> (intrinsic height 0 until metadata). Center with transforms.
      */}
      <video
        key={src}
        ref={ref}
        src={src}
        className="absolute left-1/2 top-1/2 z-[3] min-h-[96px] w-[min(92%,17.5rem)] max-w-full -translate-x-1/2 -translate-y-1/2 object-contain object-center drop-shadow-[0_4px_20px_rgba(0,0,0,0.45)] sm:w-[min(90%,19rem)]"
        style={{ maxHeight: "min(78%, 13.5rem)" }}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden
        onLoadedData={tryPlay}
        onCanPlay={tryPlay}
        onError={onVideoError}
      />
    </div>
  );
}

/**
 * Full-screen generating state: bathroom preview with looping Renovision logo video.
 */
export function RenovisionGeneratingLoader({
  title,
  hint,
  elapsedSec,
  beforeImageUrl,
}: RenovisionGeneratingLoaderProps) {
  const factIndex = Math.floor(elapsedSec / FACT_DISPLAY_INTERVAL_SEC) % BATHROOM_FACTS.length;
  const fact = BATHROOM_FACTS[factIndex];
  const beforeSrc = beforeImageUrl?.trim() ?? "";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-background/95 px-4 py-6">
      <div className="my-auto w-full max-w-md rounded-2xl border border-border/80 bg-card px-5 py-6 text-center shadow-xl sm:px-6">
        <div
          className="renovision-loader-logo-frame relative mx-auto w-full max-w-[260px] overflow-hidden rounded-xl shadow-inner ring-1 ring-black/10 sm:max-w-[300px]"
          style={{ aspectRatio: "16 / 9" }}
        >
          {beforeSrc ? (
            <img
              src={beforeSrc}
              alt=""
              className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
              draggable={false}
              aria-hidden
              decoding="async"
            />
          ) : (
            <div className="pointer-events-none absolute inset-0 z-0 bg-[#0b0b0b]" aria-hidden />
          )}
          <div
            className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_56%_46%_at_50%_50%,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0.16)_42%,transparent_68%)]"
            aria-hidden
          />
          <RenovisionLoaderLoopingVideo />
        </div>

        <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>

        <div
          key={factIndex}
          className="renovision-loader-fact mt-4 rounded-xl border border-renovision-orange/25 bg-renovision-orange-muted/60 px-4 py-3 text-left text-sm leading-snug text-renovision-navy"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-renovision-orange">Did you know?</span>
          <p className="mt-1.5 font-medium">{fact}</p>
        </div>

        <p className="mt-3 text-xs font-medium tabular-nums text-muted-foreground">
          Elapsed {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
        </p>
      </div>
    </div>
  );
}
