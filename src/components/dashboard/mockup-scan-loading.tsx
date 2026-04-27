"use client";

/**
 * Full-bleed loading visual: room photo with a soft sweep and grid overlay.
 */
export function MockupScanLoading({
  imageUrl,
  elapsedSeconds = 0,
}: {
  imageUrl?: string | null;
  /** Shown in the footer for reassurance during long renders. */
  elapsedSeconds?: number;
}) {
  return (
    <div className="relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-muted/80 to-muted shadow-xl ring-1 ring-border/30">
      <div className="relative aspect-[4/3] w-full">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ephemeral signed URL; decorative
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-background to-muted" />
        )}

        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)
            `,
            backgroundSize: "18px 18px",
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent" />

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[20%] -right-[20%] top-0 h-[38%] animate-mockup-scan bg-gradient-to-b from-primary/0 via-primary/35 to-primary/0 blur-[1px]" />
        </div>

        <div className="pointer-events-none absolute inset-5 rounded-lg border border-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]" />

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-background/95 via-background/40 to-transparent px-4 pb-5 pt-16 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/90">
            Creating mockup
          </p>
          <p className="mt-1 max-w-[280px] text-xs leading-snug text-muted-foreground">
            Applying your scope and quote to this room
          </p>
          {elapsedSeconds > 0 ? (
            <p className="mt-2 tabular-nums text-[11px] text-muted-foreground/90">{elapsedSeconds}s</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
