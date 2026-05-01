"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type BeforeAfterCompareSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  /** Omit thumbnail row below the slider for tighter layouts (e.g. marketing hero). */
  compact?: boolean;
  /** Set when images are above-the-fold (hero/LCP). */
  imagePriority?: boolean;
};

/**
 * Full-width before/after: use the range control below the images to compare (avoids blocking page scroll on touch).
 * Double-click the preview to open fullscreen. Non-compact layouts include thumbnail shortcuts.
 */
export function BeforeAfterCompareSlider({
  beforeUrl,
  afterUrl,
  compact = false,
  imagePriority = false,
}: BeforeAfterCompareSliderProps) {
  const [pct, setPct] = useState(50);
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; label: "Before" | "After" } | null>(
    null,
  );
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileAspectRatio, setMobileAspectRatio] = useState<number>(4 / 3);
  const imageFitClass = compact ? "object-cover" : isMobileViewport ? "object-cover" : "object-contain";

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobileViewport(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      // Keep slider reasonably wide on phones while avoiding extra-tall cards.
      const ratio = img.naturalWidth / img.naturalHeight;
      const clamped = Math.max(0.75, Math.min(1.4, ratio));
      setMobileAspectRatio(clamped);
    };
    img.src = afterUrl;
  }, [afterUrl]);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div
        className={
          compact
            ? "relative w-full overflow-hidden rounded-xl border border-border/80 bg-muted shadow-sm sm:aspect-[16/11] sm:min-h-[14rem]"
            : "relative w-full overflow-hidden rounded-xl border border-border/80 bg-muted shadow-sm sm:aspect-[4/3] sm:min-h-[20rem]"
        }
        style={isMobileViewport ? { aspectRatio: String(mobileAspectRatio) } : undefined}
        onDoubleClick={() => setFullscreenImage({ src: pct < 50 ? beforeUrl : afterUrl, label: pct < 50 ? "Before" : "After" })}
      >
        <Image
          src={afterUrl}
          alt="After remodel"
          fill
          className={`pointer-events-none ${imageFitClass}`}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
          quality={compact ? 82 : 75}
          priority={imagePriority}
          loading={imagePriority ? undefined : "lazy"}
          draggable={false}
        />
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        >
          <Image
            src={beforeUrl}
            alt="Before remodel"
            fill
            className={imageFitClass}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
            quality={compact ? 82 : 75}
            priority={imagePriority}
            loading={imagePriority ? undefined : "lazy"}
            draggable={false}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-white/90 shadow-md"
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
          aria-hidden
        />
        <div className="pointer-events-none absolute bottom-2 left-3 z-20 rounded bg-black/55 px-2 py-1 text-xs font-medium text-white">
          Before
        </div>
        <div className="pointer-events-none absolute bottom-2 right-3 z-20 rounded bg-black/55 px-2 py-1 text-xs font-medium text-white">
          After
        </div>
      </div>
      <div className="flex items-center gap-3 px-1">
        <span className="text-xs text-muted-foreground">Before</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="h-2 min-w-0 flex-1 cursor-ew-resize accent-renovision-orange"
          aria-label="Slide to compare before and after"
        />
        <span className="text-xs text-muted-foreground">After</span>
      </div>
      {!compact ? (
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          type="button"
          className="relative m-0 w-full min-h-0 overflow-hidden rounded-lg border border-border/80 bg-muted text-left shadow-sm sm:aspect-[4/3]"
          style={isMobileViewport ? { aspectRatio: String(mobileAspectRatio) } : undefined}
          onClick={() => setFullscreenImage({ src: beforeUrl, label: "Before" })}
          aria-label="Open before image fullscreen"
        >
          <Image
            src={beforeUrl}
            alt="Before full preview"
            fill
            className={imageFitClass}
            sizes="(max-width: 640px) 48vw, 360px"
            quality={70}
            loading="lazy"
            draggable={false}
          />
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1] rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white sm:text-xs">
            Before
          </span>
        </button>
        <button
          type="button"
          className="relative m-0 w-full min-h-0 overflow-hidden rounded-lg border border-border/80 bg-muted text-left shadow-sm sm:aspect-[4/3]"
          style={isMobileViewport ? { aspectRatio: String(mobileAspectRatio) } : undefined}
          onClick={() => setFullscreenImage({ src: afterUrl, label: "After" })}
          aria-label="Open after image fullscreen"
        >
          <Image
            src={afterUrl}
            alt="After full preview"
            fill
            className={imageFitClass}
            sizes="(max-width: 640px) 48vw, 360px"
            quality={70}
            loading="lazy"
            draggable={false}
          />
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1] rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white sm:text-xs">
            After
          </span>
        </button>
      </div>
      ) : null}
      {fullscreenImage ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/90 p-3 sm:p-6"
          onClick={() => setFullscreenImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${fullscreenImage.label} image fullscreen`}
        >
          <button
            type="button"
            className="absolute right-3 top-3 z-20 rounded-md bg-white/90 px-3 py-2 text-sm font-semibold text-black shadow hover:bg-white"
            onClick={() => setFullscreenImage(null)}
            aria-label="Close fullscreen image"
          >
            X Close
          </button>
          <div
            className="relative h-full max-h-[95vh] w-full max-w-6xl overflow-hidden rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={fullscreenImage.src}
              alt={`${fullscreenImage.label} remodel fullscreen`}
              fill
              className="object-contain"
              sizes="100vw"
              quality={90}
              priority
              draggable={false}
            />
            <span className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
              {fullscreenImage.label}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
