import Link from "next/link";

import { RenovisionLogo } from "@/components/landing/renovision-logo";
import { TryCtaLink } from "@/components/landing/try-cta-link";

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
          <RenovisionLogo compact className="mx-auto sm:mx-0" />
          <p className="mt-1 text-xs text-muted-foreground">
            Bathroom remodel planning for homeowners.
          </p>
        </div>
        <nav
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm"
          aria-label="Footer"
        >
          <TryCtaLink
            placement="landing_footer"
            href="/try"
            className="font-semibold text-renovision-navy transition-colors hover:text-renovision-navy/80 dark:text-renovision-orange dark:hover:text-renovision-orange/90"
          >
            Start free preview
          </TryCtaLink>
          <Link
            href="/privacy"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms
          </Link>
          <Link
            href="/contact"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
