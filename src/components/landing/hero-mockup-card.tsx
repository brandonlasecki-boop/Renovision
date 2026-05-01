"use client";

import type { StaticImageData } from "next/image";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { BeforeAfterCompareSlider } from "@/components/homeowner/before-after-compare-slider";
import { TryCtaLink } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { getBathroomStyleById } from "@/lib/homeowner-try/bathroom-styles";
import type { BathroomStyleId } from "@/lib/homeowner-try/bathroom-styles";
import { cn } from "@/lib/utils";

import beforeMain from "../../../Images/before_main.jpg";
import afterSpa from "../../../Images/after_spa.png";
import afterClean from "../../../Images/after_clean.png";
import afterLuxury from "../../../Images/after_luxury.png";
import afterBold from "../../../Images/after_bold.png";
import afterWarm from "../../../Images/after_warm.png";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type LandingStyleOption = {
  id: BathroomStyleId;
  /** Short label for pills */
  pill: string;
  after: StaticImageData;
};

/** Same “before” room photo; each entry uses the matching marketing after render from `/Images`. */
const LANDING_STYLE_OPTIONS: LandingStyleOption[] = [
  { id: "spa_retreat", pill: "Spa", after: afterSpa },
  { id: "clean_refresh", pill: "Clean", after: afterClean },
  { id: "luxury_escape", pill: "Luxury", after: afterLuxury },
  { id: "bold_modern", pill: "Bold", after: afterBold },
  { id: "warm_minimalist", pill: "Warm", after: afterWarm },
];

export function HeroMockupCard({
  className,
  linkToTry = false,
  compactMobileHeroHeader = false,
}: {
  className?: string;
  /** When true, show a primary button to `/try` (the card is no longer fully wrapped in a link so the slider can capture drag). */
  linkToTry?: boolean;
  /** Hero: show only a short "Real Example" label on small screens to save vertical space. */
  compactMobileHeroHeader?: boolean;
}) {
  const [styleId, setStyleId] = useState<BathroomStyleId>("spa_retreat");

  const activeOption = useMemo(
    () => LANDING_STYLE_OPTIONS.find((o) => o.id === styleId) ?? LANDING_STYLE_OPTIONS[0],
    [styleId],
  );

  const styleMeta = getBathroomStyleById(styleId);
  const estimateLine = styleMeta
    ? `Estimated Range: ${usd.format(styleMeta.estimateMin)}–${usd.format(styleMeta.estimateMax)}`
    : "Estimated Range: —";

  const shellClass = cn(
    "relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_24px_80px_-12px_rgba(12,39,68,0.12)] ring-1 ring-black/[0.03]",
    className,
  );

  return (
    <div className={shellClass}>
      <div className="border-b border-border/60 bg-gradient-to-r from-renovision-navy/[0.08] to-transparent px-4 py-2.5 sm:px-5 sm:py-3">
        {compactMobileHeroHeader ? (
          <>
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.08em] text-renovision-navy lg:hidden">
              Real Example
            </p>
            <div className="hidden lg:block">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-renovision-navy sm:text-sm">
                Real Example — Generated from a homeowner&apos;s photo
              </p>
              {styleMeta ? (
                <p className="mt-1 text-xs leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">{styleMeta.name}</span>
                  <span className="text-muted-foreground"> — {styleMeta.subtitle}</span>
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-xs font-bold uppercase tracking-[0.06em] text-renovision-navy sm:text-left sm:text-sm">
              Real Example — Generated from a homeowner&apos;s photo
            </p>
            {styleMeta ? (
              <p className="mt-1 text-center text-xs leading-snug text-muted-foreground sm:text-left">
                <span className="font-medium text-foreground">{styleMeta.name}</span>
                <span className="text-muted-foreground"> — {styleMeta.subtitle}</span>
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="space-y-3 p-3 sm:space-y-3.5 sm:p-4">
        <div>
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-left">
            Compare styles
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {LANDING_STYLE_OPTIONS.map((opt) => {
              const selected = opt.id === styleId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={getBathroomStyleById(opt.id)?.name ?? opt.pill}
                  onClick={() => setStyleId(opt.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
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
        </div>

        <BeforeAfterCompareSlider
          key={styleId}
          beforeUrl={beforeMain.src}
          afterUrl={activeOption.after.src}
          compact
          imagePriority
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/30 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:px-5">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-renovision-orange/15 text-renovision-orange">
            <Sparkles className="size-4" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Planning estimate ({styleMeta?.name ?? "Style"})
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{estimateLine}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-renovision-teal/60 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-renovision-teal" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">Drag slider to compare</span>
          </div>
          {linkToTry ? (
            <TryCtaLink
              placement="landing_mockup_card"
              href="/try"
              className={cn(
                buttonVariants({ size: "default" }),
                "h-10 shrink-0 bg-renovision-navy px-5 text-sm font-semibold text-white hover:bg-renovision-navy/90",
              )}
            >
              Start free preview
            </TryCtaLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}
