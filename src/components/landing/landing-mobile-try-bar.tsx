"use client";

import { useEffect, useState } from "react";

import { TryCtaLink, TRY_FLOW_UPLOAD_HREF } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Pixels scrolled before the bar appears so it does not cover the hero CTA on load. */
const REVEAL_AFTER_SCROLL_PX = 56;

/** Fixed CTA on small viewports — hidden until the user scrolls slightly. */
export function LandingMobileTryBar() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onScroll = () => {
      if (mq.matches) return;
      const y = window.scrollY || document.documentElement?.scrollTop || 0;
      if (y > REVEAL_AFTER_SCROLL_PX) setRevealed(true);
      else setRevealed(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    mq.addEventListener("change", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      mq.removeEventListener("change", onScroll);
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-50 border-t border-border/70 bg-background/95 px-4 py-3 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.18)] backdrop-blur-md transition-[transform,opacity] duration-300 ease-out supports-[backdrop-filter]:bg-background/85 md:hidden",
        revealed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
      )}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))", bottom: 0 }}
      aria-hidden={!revealed}
    >
      <TryCtaLink
        placement="landing_mobile_bar"
        href={TRY_FLOW_UPLOAD_HREF}
        className={cn(
          buttonVariants({ size: "lg" }),
          "flex h-12 w-full items-center justify-center bg-renovision-navy px-3 text-sm font-semibold text-white shadow-md hover:bg-renovision-navy/90 sm:text-base",
        )}
      >
        See My Bathroom Instantly
      </TryCtaLink>
    </div>
  );
}
