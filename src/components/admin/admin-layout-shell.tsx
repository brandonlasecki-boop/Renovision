"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type AdminNavItem = {
  href: string;
  label: string;
  title: string;
  description: string;
  match: (pathname: string) => boolean;
};

const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin/overview",
    label: "Overview",
    title: "Overview",
    description: "Business snapshot and quick paths.",
    match: (p) => p.startsWith("/admin/overview") || p.startsWith("/admin/renovision") || p === "/admin",
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    title: "Analytics",
    description: "Traffic, funnel, and session reporting.",
    match: (p) => p.startsWith("/admin/analytics") || p.startsWith("/admin/sessions"),
  },
  {
    href: "/admin/generations",
    label: "Generations",
    title: "Generations",
    description: "AI generation output and quality checks.",
    match: (p) => p.startsWith("/admin/generations"),
  },
  {
    href: "/admin/leads",
    label: "Leads",
    title: "Leads",
    description: "Inbound homeowner lead pipeline.",
    match: (p) => p.startsWith("/admin/leads"),
  },
  {
    href: "/admin/contractors",
    label: "Contractors",
    title: "Contractors",
    description: "Contractor accounts and bidding activity.",
    match: (p) => p.startsWith("/admin/contractors") || p.startsWith("/admin/bids"),
  },
  {
    href: "/admin/lead-assignments",
    label: "Lead Assignments",
    title: "Lead Assignments",
    description: "Assignment queue and dispatch state.",
    match: (p) => p.startsWith("/admin/lead-assignments"),
  },
  {
    href: "/admin/settings",
    label: "Settings",
    title: "Settings",
    description: "Operational tools and exports.",
    match: (p) => p.startsWith("/admin/settings"),
  },
];

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const active = ADMIN_NAV.find((item) => item.match(pathname)) ?? ADMIN_NAV[0];

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border/70 bg-background lg:flex lg:flex-col">
          <div className="border-b border-border/70 px-5 py-4">
            <Link href="/admin/overview" className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-renovision-navy text-xs font-bold text-white">
                R
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight">Renovision Admin</span>
                <span className="block text-xs text-muted-foreground">Business Console</span>
              </span>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Admin sections">
            {ADMIN_NAV.map((item) => {
              const isActive = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-lg border px-3 py-2.5 transition-colors",
                    isActive
                      ? "border-border bg-muted/50 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border/70 px-4 py-3">
            <Link href="/" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Back to site
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin</p>
            <h1 className="text-xl font-semibold tracking-tight">{active.title}</h1>
          </header>
          <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
