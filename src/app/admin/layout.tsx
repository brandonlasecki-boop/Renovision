import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminUser } from "@/app/admin/require-admin";

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
    <div className="min-h-screen bg-muted/25">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-semibold tracking-tight">
              Renovision <span className="font-normal text-muted-foreground">Admin</span>
            </Link>
            <Link
              href="/"
              className="hidden text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:inline"
            >
              ← Home
            </Link>
            <nav className="hidden items-center gap-4 text-sm sm:flex" aria-label="Admin">
              <Link
                href="/admin"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Estimates overview
              </Link>
              <Link
                href="/admin/renovision"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Renovision
              </Link>
              <Link
                href="/dashboard"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                App dashboard
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
