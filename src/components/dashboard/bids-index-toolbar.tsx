import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BidsIndexView = "active" | "archived" | "all";
export type BidsIndexSort = "updated" | "title";

function buildUrl(view: BidsIndexView, sort: BidsIndexSort) {
  const p = new URLSearchParams();
  if (view !== "active") p.set("view", view);
  if (sort !== "updated") p.set("sort", sort);
  const q = p.toString();
  return q ? `/dashboard/bids?${q}` : "/dashboard/bids";
}

export function BidsIndexToolbar({
  view,
  sort,
}: {
  view: BidsIndexView;
  sort: BidsIndexSort;
}) {
  const tabs: { id: BidsIndexView; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "archived", label: "Archived" },
    { id: "all", label: "All" },
  ];

  const sortOptions: { id: BidsIndexSort; label: string }[] = [
    { id: "updated", label: "Last updated" },
    { id: "title", label: "Title A–Z" },
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div
        className="inline-flex rounded-lg border border-border/80 bg-muted/40 p-1"
        role="tablist"
        aria-label="Estimate list filter"
      >
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={buildUrl(t.id, sort)}
            role="tab"
            aria-selected={view === t.id}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "rounded-md px-3",
              view === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Sort</span>
        <div className="inline-flex rounded-lg border border-border/80 bg-muted/40 p-1">
          {sortOptions.map((s) => (
            <Link
              key={s.id}
              href={buildUrl(view, s.id)}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "rounded-md px-3 text-xs",
                sort === s.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
