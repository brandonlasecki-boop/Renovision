"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** Use full width of the parent (e.g. bid page) instead of capping at ~672px. */
  wide?: boolean;
};

export function MockupBeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After (mockup)",
  wide = false,
}: Props) {
  const [pct, setPct] = useState(50);
  /** Show left `pct`% of the mockup (after) over the before photo. */
  const clipAfter = useMemo(() => `inset(0 ${100 - pct}% 0 0)`, [pct]);

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-muted shadow-sm",
          wide ? "max-w-full" : "max-w-2xl",
        )}
      >
        <Image
          src={beforeUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 672px"
          unoptimized
          priority
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: clipAfter }}
        >
          <Image
            src={afterUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 672px"
            unoptimized
            priority
          />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white/90 shadow-md"
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          {beforeLabel}
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          {afterLabel}
        </div>
      </div>
      <div
        className={cn(
          "flex flex-col gap-2 sm:flex-row sm:items-center",
          wide ? "max-w-full" : "max-w-2xl",
        )}
      >
        <label className="flex w-full items-center gap-3 text-sm">
          <span className="shrink-0 text-muted-foreground">Compare</span>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="h-2 w-full flex-1 cursor-pointer accent-primary"
            aria-label="Before and after comparison"
          />
          <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
        </label>
      </div>
    </div>
  );
}
