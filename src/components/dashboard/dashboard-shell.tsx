import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LayoutGrid, ClipboardList, Shield } from "lucide-react";

export function DashboardShell({
  children,
  userEmail,
  showAdminNav = false,
}: {
  children: React.ReactNode;
  userEmail: string | undefined;
  /** When true, show link to internal /admin (set from server via ADMIN_EMAILS or profiles.is_admin). */
  showAdminNav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
            <Link
              href="/"
              className="shrink-0 font-semibold tracking-tight text-renovision-navy"
              title="Renovision home"
            >
              Renovision
            </Link>
            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
              >
                <LayoutGrid className="mr-1.5 size-4 opacity-70" />
                Dashboard
              </Link>
              <Link
                href="/dashboard/bids"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
              >
                <ClipboardList className="mr-1.5 size-4 opacity-70" />
                Estimates
              </Link>
              {showAdminNav ? (
                <Link
                  href="/admin"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "shrink-0 text-renovision-navy",
                  )}
                >
                  <Shield className="mr-1.5 size-4 opacity-80" />
                  Admin
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {userEmail ? (
              <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground sm:inline">
                {userEmail}
              </span>
            ) : null}
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
