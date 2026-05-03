import Link from "next/link";
import type { User } from "@supabase/supabase-js";

import { LandingMobileNav } from "@/components/landing/landing-mobile-nav";
import { RenovisionLogo } from "@/components/landing/renovision-logo";
import { StartNewTryLink } from "@/components/homeowner/start-new-try-link";
import { signOut } from "@/lib/actions/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinkClass = "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

type TryPageChromeHeaderProps = {
  user: User | null;
  showAdminNav: boolean;
  anonymousSessionId: string | null;
  userEmail: string | null;
};

/**
 * Matches the marketing landing header (logo, mobile drawer, desktop links) without the
 * duplicate “See My Bathroom” CTA — users are already on `/try`.
 */
export function TryPageChromeHeader({ user, showAdminNav, anonymousSessionId, userEmail }: TryPageChromeHeaderProps) {
  const guestHasTrySession = Boolean(!user && anonymousSessionId);

  return (
    <header className="sticky top-0 z-50 min-w-0 max-w-full overflow-x-hidden overflow-y-visible border-b border-border/60 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto max-w-6xl min-w-0 px-3 py-0 sm:px-6 lg:px-8">
        <div className="flex min-h-0 min-w-0 items-center justify-between gap-2 py-0 sm:gap-3">
          <Link
            href="/"
            className={cn(
              "relative block min-w-0 shrink-0 overflow-visible",
              "h-12 w-[188px] sm:w-[340px]",
              "md:h-[4.75rem] md:w-[420px] lg:h-[5rem] lg:w-[480px]",
            )}
          >
            <RenovisionLogo preset="header" />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
            <a href="/#how-it-works" className={navLinkClass}>
              How It Works
            </a>
            <a href="/#why-renovision" className={navLinkClass}>
              Why Renovision
            </a>
            <a href="/#faq" className={navLinkClass}>
              FAQ
            </a>
          </nav>

          <LandingMobileNav
            showMyProjects={Boolean(user || guestHasTrySession)}
            showAdmin={showAdminNav}
            isLoggedIn={Boolean(user)}
          />
          <div className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-1 sm:max-w-none sm:flex-none sm:gap-3 md:flex">
            {user || guestHasTrySession ? (
              <Link
                href="/projects"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "relative z-10 inline-flex touch-manipulation max-sm:h-6 max-sm:rounded-md max-sm:px-2 max-sm:text-[10px] max-sm:font-semibold",
                )}
              >
                My Projects
              </Link>
            ) : null}
            {user ? <StartNewTryLink /> : null}
            {showAdminNav ? (
              <Link
                href="/admin/renovision"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "inline-flex border-renovision-orange/40 text-renovision-navy max-sm:h-6 max-sm:px-2 max-sm:text-[10px]",
                )}
              >
                Admin Dashboard
              </Link>
            ) : null}
            <Link href="/" className={cn(navLinkClass, "hidden md:inline")}>
              Home
            </Link>
            {userEmail ? <span className="hidden text-muted-foreground lg:inline">{userEmail}</span> : null}
            {user ? (
              <form action={signOut}>
                <button
                  type="submit"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "inline-flex max-sm:h-6 max-sm:px-1.5 max-sm:text-[10px]",
                  )}
                >
                  Log Out
                </button>
              </form>
            ) : (
              <Link
                href="/login?next=/try"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "inline-flex max-sm:h-6 max-sm:px-1.5 max-sm:text-[10px]",
                )}
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
