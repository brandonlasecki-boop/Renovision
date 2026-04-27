import Link from "next/link";

import { RenovisionLogo } from "@/components/landing/renovision-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinkClass =
  "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6 lg:px-8">
        <div className="flex min-h-[3.75rem] items-center justify-between gap-3 py-2 sm:min-h-[4.25rem] sm:py-2.5">
          <Link href="/" className="min-w-0 shrink py-1">
            <RenovisionLogo />
          </Link>

          <nav
            className="hidden items-center gap-8 md:flex"
            aria-label="Primary"
          >
            <a href="#how-it-works" className={navLinkClass}>
              How It Works
            </a>
            <a href="#why-renovision" className={navLinkClass}>
              Why Renovision
            </a>
            <a href="#faq" className={navLinkClass}>
              FAQ
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden md:inline-flex",
              )}
            >
              Log In
            </Link>
            <Link href="/try" className={cn(buttonVariants({ size: "sm" }))}>
              Try Free
            </Link>
          </div>
        </div>

        <nav
          className="flex gap-6 overflow-x-auto border-t border-border/40 py-2.5 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Page sections"
        >
          <a href="#how-it-works" className={cn(navLinkClass, "shrink-0")}>
            How It Works
          </a>
          <a href="#why-renovision" className={cn(navLinkClass, "shrink-0")}>
            Why Renovision
          </a>
          <a href="#faq" className={cn(navLinkClass, "shrink-0")}>
            FAQ
          </a>
          <Link
            href="/login"
            className={cn(navLinkClass, "shrink-0 font-semibold text-foreground")}
          >
            Log In
          </Link>
        </nav>
      </div>
    </header>
  );
}
