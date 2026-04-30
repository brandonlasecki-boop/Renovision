import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Fixed CTA on small viewports so /try stays one tap away while scrolling. */
export function LandingMobileTryBar() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/95 px-4 py-3 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.18)] backdrop-blur-md supports-[backdrop-filter]:bg-background/85 md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <Link
        href="/try"
        className={cn(
          buttonVariants({ size: "lg" }),
          "flex h-12 w-full items-center justify-center bg-renovision-navy px-3 text-sm font-semibold text-white shadow-md hover:bg-renovision-navy/90 sm:text-base",
        )}
      >
        See My Bathroom Remodel
      </Link>
    </div>
  );
}
