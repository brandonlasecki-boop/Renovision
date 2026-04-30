"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/renovision", label: "Renovision", match: (p: string) => p.startsWith("/admin/renovision") },
  { href: "/admin/contractors", label: "Contractors", match: (p: string) => p.startsWith("/admin/contractors") },
  { href: "/dashboard", label: "App dashboard", match: (p: string) => p.startsWith("/dashboard") },
] as const;

export function AdminHeaderNav() {
  const pathname = usePathname() || "";

  return (
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
  );
}
