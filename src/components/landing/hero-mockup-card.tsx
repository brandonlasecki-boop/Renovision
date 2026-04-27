import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export function HeroMockupCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_24px_80px_-12px_rgba(12,39,68,0.12)] ring-1 ring-black/[0.03]",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full sm:aspect-[16/11]">
        {/* Before / after placeholders */}
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.9),transparent_55%)]" />
            <span className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">
              Before
            </span>
          </div>
          <div className="relative overflow-hidden bg-gradient-to-br from-renovision-teal/25 via-sky-100/80 to-renovision-navy/15">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(255,255,255,0.85),transparent_50%)]" />
            <span className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-renovision-navy shadow-sm backdrop-blur">
              After
            </span>
          </div>
        </div>
        {/* Scan / progress line */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden opacity-90"
          aria-hidden
        >
          <div className="animate-mockup-scan absolute left-0 right-0 h-[42%] bg-gradient-to-b from-transparent via-white/25 to-transparent" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-renovision-orange/15 text-renovision-orange">
            <Sparkles className="size-4" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Planning estimate
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              Estimated Range: $14k–$22k
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-renovision-teal/60 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-renovision-teal" />
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            Refining…
          </span>
        </div>
      </div>
    </div>
  );
}
