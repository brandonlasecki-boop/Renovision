"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS: { suffix: string; label: string; exact?: boolean }[] = [
  { suffix: "", label: "Overview", exact: true },
  { suffix: "/customer", label: "Customer" },
  { suffix: "/setup", label: "Site & plan", exact: true },
  { suffix: "/setup/questions", label: "Additional info" },
  { suffix: "/setup/breakdown", label: "Scope" },
  { suffix: "/setup/pricing", label: "Pricing" },
  { suffix: "/setup/mockup", label: "Mockup" },
];

function isStepActive(
  pathname: string,
  base: string,
  suffix: string,
  exact?: boolean,
) {
  const full = `${base}${suffix}`;
  if (suffix === "") {
    return pathname === base;
  }
  if (exact) {
    return pathname === full;
  }
  return pathname === full || pathname.startsWith(`${full}/`);
}

export function BidWorkflowNav({ bidId }: { bidId: string }) {
  const pathname = usePathname() ?? "";
  const base = `/dashboard/bids/${bidId}`;

  return (
    <nav
      aria-label="Estimate workflow"
      className="sticky top-14 z-30 -mx-4 border-b border-border/40 bg-background/90 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:-mx-0 sm:rounded-xl sm:border sm:border-border/50 sm:px-1.5 sm:py-2.5"
    >
      <ul className="flex gap-1 overflow-x-auto px-4 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-2 [&::-webkit-scrollbar]:hidden">
        {STEPS.map(({ suffix, label, exact }) => {
          const href = `${base}${suffix}`;
          const active = isStepActive(pathname, base, suffix, exact);
          return (
            <li key={suffix || "overview"} className="shrink-0">
              <Link
                href={href}
                className={cn(
                  "inline-flex rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
