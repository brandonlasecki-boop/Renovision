import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingTryCta({
  className,
  align = "center",
}: {
  className?: string;
  align?: "center" | "left";
}) {
  return (
    <div
      className={cn(
        "mt-10 rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/35 p-6 shadow-sm ring-1 ring-black/[0.04] sm:mt-12 sm:p-8",
        align === "center" && "mx-auto max-w-xl text-center",
        align === "left" && "max-w-xl text-center sm:text-left",
        className,
      )}
    >
      <p className="text-sm font-semibold text-foreground">Plan with a real preview</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Upload your bathroom photo, see a realistic remodel, and connect with a contractor only when you&apos;re ready—no
        obligation.
      </p>
      <Link
        href="/try"
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-5 inline-flex h-12 bg-renovision-navy px-8 text-base font-semibold text-white shadow-md shadow-renovision-navy/15 transition hover:bg-renovision-navy/90",
        )}
      >
        See My Bathroom Remodel
      </Link>
    </div>
  );
}
