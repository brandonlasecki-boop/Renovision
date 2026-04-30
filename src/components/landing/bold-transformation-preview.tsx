"use client";

import { useCallback, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BoldTransformationPreview() {
  const [started, setStarted] = useState(false);

  const handleEnded = useCallback(() => {
    setStarted(false);
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-renovision-navy">Bold style</p>
        <span className="text-right text-[11px] text-muted-foreground sm:text-xs">
          {started ? "Playing…" : "Tap to watch · returns here when it ends"}
        </span>
      </div>
      {started ? (
        <video
          className="aspect-video w-full bg-black object-cover"
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          onEnded={handleEnded}
          aria-label="Bathroom remodel transformation preview in Bold Modern style"
        >
          <source src="/bold_transform.mp4" type="video/mp4" />
        </video>
      ) : (
        <div className="relative aspect-video overflow-hidden">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            aria-hidden
            onLoadedData={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          >
            <source src="/bold_transform.mp4" type="video/mp4" />
          </video>
          <div
            className="absolute inset-0 bg-gradient-to-br from-renovision-navy/35 via-black/55 to-black/75"
            aria-hidden
          />
          <div className="relative z-10 grid h-full place-items-center p-4 text-center">
            <div className="space-y-3">
              <p className="text-sm font-medium text-white/90 sm:text-base">Watch the Bold transformation</p>
              <button
                type="button"
                onClick={() => setStarted(true)}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "h-9 bg-renovision-orange px-4 text-sm text-white hover:bg-renovision-orange/90",
                )}
              >
                See transformation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
