"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";

type BeforeAfterCompareSliderProps = {
  beforeUrl: string;
  afterUrl: string;
};

/**
 * Full-width before/after: drag on the image or use the range control to reveal the remodel (after)
 * under the original (before). Pointer capture supports one-finger drag on phones.
 * Below the range control, side-by-side thumbnails show full before and after (clear on narrow screens).
 */
export function BeforeAfterCompareSlider({ beforeUrl, afterUrl }: BeforeAfterCompareSliderProps) {
  const [pct, setPct] = useState(50);
  const trackRef = useRef<HTMLDivElement>(null);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1) return;
    const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
    setPct(Math.round((x / rect.width) * 100));
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    updateFromClientX(e.clientX);
  };

  const onPointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="space-y-3">
      <div
        ref={trackRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/80 bg-muted shadow-sm"
      >
        <Image
          src={afterUrl}
          alt="After remodel"
          fill
          className="pointer-events-none object-contain"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
          quality={75}
          priority={false}
          loading="lazy"
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
            className="object-contain"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
            quality={75}
            priority={false}
            loading="lazy"
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
        {/* Drag on image (mouse + touch); pointer capture keeps tracking past finger wobble */}
        <div
          className="absolute inset-0 z-30 cursor-ew-resize touch-none select-none"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUpOrCancel}
          onPointerCancel={onPointerUpOrCancel}
          aria-hidden
        />
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
      {/* Keep previews visible on phones so users always see full before/after below the slider. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        <figure className="relative m-0 aspect-[4/3] w-full min-h-0 overflow-hidden rounded-lg border border-border/80 bg-muted shadow-sm">
          <Image
            src={beforeUrl}
            alt="Before — full preview"
            fill
            className="object-contain"
            sizes="(max-width: 1024px) 42vw, 400px"
            quality={70}
            loading="lazy"
            draggable={false}
          />
          <figcaption className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1] rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white sm:text-xs">
            Before
          </figcaption>
        </figure>
        <figure className="relative m-0 aspect-[4/3] w-full min-h-0 overflow-hidden rounded-lg border border-border/80 bg-muted shadow-sm">
          <Image
            src={afterUrl}
            alt="After — full preview"
            fill
            className="object-contain"
            sizes="(max-width: 1024px) 42vw, 400px"
            quality={70}
            loading="lazy"
            draggable={false}
          />
          <figcaption className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1] rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white sm:text-xs">
            After
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
