import Link from "next/link";

import { RenovisionLogo } from "@/components/landing/renovision-logo";
import { TryCtaLink } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { resolveViewerIsAdmin } from "@/lib/admin/resolve-viewer-admin";
import { signOut } from "@/lib/actions/auth";
import { getRenovisionAnonymousSessionIdFromCookie } from "@/lib/renovision/anonymous-cookie";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const navLinkClass = "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

export async function LandingHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const showAdminNav = user
    ? await resolveViewerIsAdmin({ userId: user.id, email: user.email })
    : false;
  const guestHasTrySession = !user && (await getRenovisionAnonymousSessionIdFromCookie());

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto max-w-6xl px-3 py-1 sm:px-6 sm:py-2.5 lg:px-8">
        <div className="flex min-h-0 items-center justify-between gap-2 py-0 sm:min-h-[4.25rem] sm:gap-3 sm:py-2.5">
          <Link href="/" className="min-w-0 shrink py-0 sm:py-1">
            <RenovisionLogo className="h-8 w-[132px] sm:h-[4.25rem] sm:w-[312px] md:h-[5.25rem] md:w-[360px]" />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
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

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-3">
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
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "inline-flex max-sm:h-6 max-sm:px-1.5 max-sm:text-[10px]",
                )}
              >
                Log In
              </Link>
            )}
            <TryCtaLink
              placement="landing_header"
              href="/try"
              className={cn(
                buttonVariants({ size: "sm" }),
                "max-w-[9rem] whitespace-normal px-2 text-center text-[10px] font-semibold leading-tight max-sm:h-6 max-sm:min-h-0 max-sm:py-0 sm:max-w-none sm:px-4 sm:text-sm sm:leading-none",
              )}
            >
              <span className="sm:hidden">Start preview</span>
              <span className="hidden sm:inline">See a Preview of My Bathroom Remodel</span>
            </TryCtaLink>
          </div>
        </div>
      </div>
    </header>
  );
}
