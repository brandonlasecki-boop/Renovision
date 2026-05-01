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
      <div className="mx-auto max-w-6xl px-3 py-1 sm:px-6 sm:py-1 lg:px-8">
        <div className="flex min-h-0 items-center justify-between gap-2 py-0 sm:gap-3">
          <Link
            href="/"
            className={cn(
              "relative block shrink-0 overflow-hidden",
              "h-9 w-[220px] sm:h-10 sm:w-[300px] md:w-[360px] lg:w-[400px]",
            )}
          >
            <RenovisionLogo
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2",
                "h-12 w-[260px] sm:h-16 sm:w-[340px] md:h-[4.25rem] md:w-[400px] lg:h-[4.5rem] lg:w-[440px]",
              )}
            />
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
