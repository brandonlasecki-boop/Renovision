"use client";

import Image from "next/image";
import { useState } from "react";

type BeforeAfterCompareSliderProps = {
  beforeUrl: string;
  afterUrl: string;
};

/**
 * Full-width before/after: drag the slider to reveal the remodel (after) under the original (before).
 */
export function BeforeAfterCompareSlider({ beforeUrl, afterUrl }: BeforeAfterCompareSliderProps) {
  const [pct, setPct] = useState(50);

  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/80 bg-muted shadow-sm">
        <Image
          src={afterUrl}
          alt="After remodel"
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 1024px"
          unoptimized
          priority
        />
        <div
          className="absolute inset-0 z-10"
          style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        >
          <Image
            src={beforeUrl}
            alt="Before remodel"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 1024px"
            unoptimized
            priority
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
          className="h-2 flex-1 cursor-ew-resize accent-renovision-orange"
          aria-label="Slide to compare before and after"
        />
        <span className="text-xs text-muted-foreground">After</span>
      </div>
    </div>
  );
}
