import Link from "next/link";

import { RenovisionLogo } from "@/components/landing/renovision-logo";
import { buttonVariants } from "@/components/ui/button";
import { resolveViewerIsAdmin } from "@/lib/admin/resolve-viewer-admin";
import { signOut } from "@/lib/actions/auth";
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

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex min-h-[3.75rem] items-center justify-between gap-3 py-2 sm:min-h-[4.25rem] sm:py-2.5">
          <Link href="/" className="min-w-0 shrink py-1">
            <RenovisionLogo />
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

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-3">
            {user ? (
              <Link
                href="/projects"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "relative z-10 inline-flex touch-manipulation",
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
                  "inline-flex border-renovision-orange/40 text-renovision-navy",
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
                    "inline-flex",
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
                  "inline-flex",
                )}
              >
                Log In
              </Link>
            )}
            <Link
              href="/try"
              className={cn(
                buttonVariants({ size: "sm" }),
                "max-w-[10.5rem] whitespace-normal px-2.5 text-center text-[11px] font-semibold leading-tight sm:max-w-none sm:px-4 sm:text-sm sm:leading-none",
              )}
            >
              See My Bathroom Remodel
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
