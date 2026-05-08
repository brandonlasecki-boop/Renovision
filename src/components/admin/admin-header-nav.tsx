"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/overview", label: "Overview", match: (p: string) => p.startsWith("/admin/overview") || p.startsWith("/admin/renovision") },
  { href: "/admin/contractors", label: "Leads", match: (p: string) => p.startsWith("/admin/leads") || p.startsWith("/admin/contractors") },
  { href: "/admin/generations", label: "Generations", match: (p: string) => p.startsWith("/admin/generations") },
  { href: "/admin/analytics", label: "Analytics", match: (p: string) => p.startsWith("/admin/analytics") },
  { href: "/admin/sessions", label: "Sessions", match: (p: string) => p.startsWith("/admin/sessions") || p.startsWith("/admin/analytics/sessions") },
  { href: "/admin/settings", label: "Settings", match: (p: string) => p.startsWith("/admin/settings") },
] as const;

export function AdminHeaderNav() {
  const pathname = usePathname() || "";
  const analyticsBase = "/admin/analytics?range=24h";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <nav
        className="flex flex-wrap items-center gap-1 rounded-xl bg-muted/40 p-1 sm:gap-0.5"
        aria-label="Admin sections"
      >
        {LINKS.map(({ href, label, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/80"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="hidden items-center gap-2 lg:flex">
        <span className="text-xs font-medium text-muted-foreground">Quick links:</span>
        <Link href={analyticsBase} className="rounded-md border border-border/70 px-2.5 py-1 text-xs hover:bg-muted/50">
          View last 24h analytics
        </Link>
        <Link href="/admin/analytics/export-last-24-hours" className="rounded-md border border-border/70 px-2.5 py-1 text-xs hover:bg-muted/50">
          Export JSON
        </Link>
        <Link href="/admin/analytics#ai-analyzer" className="rounded-md border border-border/70 px-2.5 py-1 text-xs hover:bg-muted/50">
          Analyze with AI
        </Link>
        <Link href="/admin/sessions" className="rounded-md border border-border/70 px-2.5 py-1 text-xs hover:bg-muted/50">
          View recent sessions
        </Link>
      </div>
    </div>
  );
}
