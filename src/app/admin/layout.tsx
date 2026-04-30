import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminUser } from "@/app/admin/require-admin";
import { AdminHeaderNav } from "@/components/admin/admin-header-nav";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminUser();

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-muted/20 to-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link
              href="/admin"
              className="flex shrink-0 items-center gap-2.5 text-foreground transition-opacity hover:opacity-90"
            >
              <span
                className="flex size-9 items-center justify-center rounded-xl bg-renovision-navy text-sm font-bold tracking-tight text-white shadow-md"
                aria-hidden
              >
                R
              </span>
              <span className="text-sm font-semibold leading-tight tracking-tight">
                Renovision
                <span className="block text-xs font-normal text-muted-foreground">Admin console</span>
              </span>
            </Link>
            <AdminHeaderNav />
          </div>
          <Link
            href="/"
            className="shrink-0 self-start text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline sm:self-auto"
          >
            ← Back to site
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}
