"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Prefer `public/renovision-looping-logo.webm`: VP9 WebM with a green plate, keyed out on canvas over the photo.
 *
 * **Do not chain H.264 MP4 here:** `renovision-looping-logo.mp4` uses a chroma-green plate; if WebM fails first,
 * MP4 reads as a solid green block on some browsers when canvas keying is inconsistent.
 * If WebM fails, we go straight to the static PNG/wordmark fallback.
 */
const LOADER_VIDEO_SRC_CHAIN = ["/renovision-looping-logo.webm"] as const;

const STATIC_LOGO_PNG_SRC = "/renovision-logo.png";

/** Cap device pixel ratio for the keyed canvas (higher = sharper logo on HiDPI). */
const LOADER_CANVAS_MAX_DPR = 3;

/**
 * Chroma pass at this scale when greater than 1, then scaled down with high-quality smoothing — softer edges, less blockiness.
 * Total keyed pixels stay bounded by {@link LOADER_CHROMA_MAX_KEY_PIXELS}.
 */
const LOADER_CHROMA_SUPER_SAMPLE_MAX = 1.5;
const LOADER_CHROMA_MAX_KEY_PIXELS = 1_150_000;

function loaderCanvasDpr(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(LOADER_CANVAS_MAX_DPR, window.devicePixelRatio || 1);
}

function chromaWorkScale(bw: number, bh: number): number {
  const r = bw * bh;
  if (r < 1) return 1;
  let s = Math.min(LOADER_CHROMA_SUPER_SAMPLE_MAX, Math.sqrt(LOADER_CHROMA_MAX_KEY_PIXELS / r));
  s = Math.max(1, s);
  while (s > 1.01 && Math.floor(bw * s) * Math.floor(bh * s) > LOADER_CHROMA_MAX_KEY_PIXELS) {
    s *= 0.96;
  }
  return s < 1.01 ? 1 : s;
}

/**
 * Key baked-in chroma (#00ff00-style) from loader clips that were exported with a green plate.
 * Only pixels where green clearly dominates red/blue are made transparent (with a soft edge).
 */
function chromaKeyedAlpha(r: number, g: number, b: number): number {
  const maxRb = Math.max(r, b);
  const excessGreen = g - maxRb;
  if (g < 58) return 255;
  if (excessGreen < 10) return 255;
  const t0 = 10;
  const t1 = 46;
  const raw = Math.min(1, Math.max(0, (excessGreen - t0) / (t1 - t0)));
  return Math.round(255 * (1 - raw));
}

function drawVideoContain(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  cw: number,
  ch: number,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return;
  const scale = Math.min(cw / vw, ch / vh);
  const dw = Math.round(vw * scale);
  const dh = Math.round(vh * scale);
  const ox = Math.round((cw - dw) / 2);
  const oy = Math.round((ch - dh) / 2);
  ctx.drawImage(video, 0, 0, vw, vh, ox, oy, dw, dh);
}

function applyGreenScreenToImageData(data: Uint8ClampedArray) {
  for (let i = 0; i < data.length; i += 4) {
    const a = chromaKeyedAlpha(data[i]!, data[i + 1]!, data[i + 2]!);
    const srcA = data[i + 3]!;
    data[i + 3] = Math.floor((srcA * a) / 255);
  }
}

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
  "Dimmable vanity lights save relationships with your mirror — harsh overhead alone is a harsh critic.",
  "Exhaust fans are rated in CFM: cubic feet per minute, aka how fast your mirror forgives a steamy shower.",
  "Waterproofing behind tile is like insurance — invisible when right, unforgettable when skipped.",
  "Subway tile never left; stack it vertically and it suddenly feels like a deliberate design flex.",
  "Frameless glass looks effortless, but hinge pockets and plumb lines are doing quiet hero work.",
  "A shower niche at elbow height beats a foot-level shelf when you’re actually using the shampoo.",
  "Matte black fixtures photograph like a dream — plan a wipe-down rhythm so water spots don’t photobomb.",
  "Curbless entries need the floor to think like a tiny watershed — slope is the unsung protagonist.",
  "Undermount sinks read cleaner than drop-in rims — fewer edges for toothpaste archaeology.",
  "Thermostatic shower valves keep temperature honest when someone flushes during your zen moment.",
  "Large-format tile means fewer grout lines — fewer lines means faster cleaning and a calmer visual field.",
  "Soundproofing around the tub helps — nobody needs the neighbor’s podcast as bath ambience.",
  "A pocket door buys inches in tight baths; just remember the wall needs somewhere to swallow the slab.",
  "Quartz vanity tops shrug at splashes; marble tells a story — sometimes a soap-ring novella.",
  "ADA-friendly grab bars are now designed like jewelry — safety and style finally on speaking terms.",
  "In-wall toilet tanks hide the tank and the noise — the float valve’s drama moves backstage.",
  "Linear drains let you run big tiles through the shower floor — one fewer grout maze underfoot.",
  "Steam showers need real enclosure and a dedicated drain — otherwise you’re just fogging a closet.",
  "Color temperature consistency across vanity sconces beats one rogue blue LED ruining the vibe.",
  "Motion-sensor night lights in the bath path are a small kindness for 2 a.m. half-asleep navigation.",
  "If your vanity toe kick glows softly, you’ve unlocked a tiny luxury theater under the sink.",
];

/** Seconds each “Did you know?” fact stays visible before rotating. */
const FACT_DISPLAY_INTERVAL_SEC = 8;

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

/** Looping brand video with chroma keyed on canvas (green plate removed), then static brand. */
function RenovisionLoaderLoopingVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [chainIndex, setChainIndex] = useState(0);
  const [useStaticFallback, setUseStaticFallback] = useState(false);

  const tryPlay = useCallback(() => {
    const el = videoRef.current;
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

  useEffect(() => {
    if (useStaticFallback) return;

    const wrap = wrapRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !video || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const work = document.createElement("canvas");
    const workCtx = work.getContext("2d", { alpha: true, willReadFrequently: true });
    if (workCtx) {
      workCtx.imageSmoothingEnabled = true;
      workCtx.imageSmoothingQuality = "high";
    }

    const resize = () => {
      const dpr = loaderCanvasDpr();
      const { clientWidth: w, clientHeight: h } = wrap;
      if (w < 2 || h < 2) return;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);
      const bw = canvas.width;
      const bh = canvas.height;
      if (bw < 2 || bh < 2 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const ss = chromaWorkScale(bw, bh);
      if (workCtx && ss > 1.01) {
        const pw = Math.max(1, Math.round(bw * ss));
        const ph = Math.max(1, Math.round(bh * ss));
        if (work.width !== pw || work.height !== ph) {
          work.width = pw;
          work.height = ph;
        }
        workCtx.clearRect(0, 0, pw, ph);
        drawVideoContain(workCtx, video, pw, ph);
        const imageData = workCtx.getImageData(0, 0, pw, ph);
        applyGreenScreenToImageData(imageData.data);
        workCtx.putImageData(imageData, 0, 0);
        ctx.clearRect(0, 0, bw, bh);
        ctx.drawImage(work, 0, 0, pw, ph, 0, 0, bw, bh);
      } else {
        ctx.clearRect(0, 0, bw, bh);
        drawVideoContain(ctx, video, bw, bh);
        const imageData = ctx.getImageData(0, 0, bw, bh);
        applyGreenScreenToImageData(imageData.data);
        ctx.putImageData(imageData, 0, 0);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [chainIndex, useStaticFallback]);

  if (useStaticFallback) {
    return <RenovisionLoaderBrandStaticFallback />;
  }

  const src = LOADER_VIDEO_SRC_CHAIN[chainIndex];

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" role="img" aria-label="Renovision">
      <div ref={wrapRef} className="absolute inset-0 z-[3]">
        <video
          key={src}
          ref={videoRef}
          src={src}
          className="absolute inset-0 z-0 h-full w-full object-contain object-center opacity-0"
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
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full drop-shadow-[0_4px_20px_rgba(0,0,0,0.45)]"
          aria-hidden
        />
      </div>
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

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto overscroll-contain bg-background/50 px-4 py-6 backdrop-blur-xl backdrop-saturate-150">
      <div className="my-auto w-full max-w-md rounded-2xl border border-border/80 bg-card px-5 py-6 text-center shadow-xl sm:px-6">
        <div
          className="renovision-loader-logo-frame relative mx-auto w-full max-w-[min(100%,320px)] overflow-hidden rounded-xl shadow-inner ring-1 ring-black/10 sm:max-w-[380px]"
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

        <div className="renovision-loader-fact mt-4 rounded-xl border border-renovision-orange/25 bg-renovision-orange-muted/60 px-4 py-3 text-left text-sm leading-snug shadow-sm">
          <span className="block text-xs font-bold uppercase tracking-wide text-renovision-orange">
            Did you know?
          </span>
          <div className="relative mt-2 min-h-[3.75rem] overflow-hidden sm:min-h-[3.25rem]">
            <p
              key={factIndex}
              className="renovision-loader-fact-text text-[15px] font-medium leading-relaxed text-renovision-navy sm:text-sm"
            >
              {fact}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs font-medium tabular-nums text-muted-foreground">
          Elapsed {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
        </p>
        <p className="mt-2.5 max-w-[280px] text-center text-[11px] leading-snug text-muted-foreground">
          Keep this page open until we&apos;re done. Navigating away may interrupt your design.
        </p>
      </div>
    </div>
  );
}
