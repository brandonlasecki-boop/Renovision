import Link from "next/link";
import { Archive, ArchiveRestore, ArrowRight } from "lucide-react";

import { setBidStatus } from "@/lib/actions/bids";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Bid } from "@/types/bid";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function BidsIndexRow({ bid }: { bid: Bid }) {
  const isArchived = bid.status === "archived";

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm sm:flex-row">
      <Link
        href={`/dashboard/bids/${bid.id}`}
        className="group flex min-w-0 flex-1 items-start gap-3 px-5 py-4 transition hover:bg-muted/30"
      >
        <div className="min-w-0 flex-1">
          <span className="text-[15px] font-medium">{bid.title}</span>
          {bid.customer_name ? (
            <span className="mt-0.5 block text-sm text-muted-foreground">{bid.customer_name}</span>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize">
              {bid.status}
            </span>
            <span className="hidden sm:inline">{formatWhen(bid.updated_at)}</span>
          </div>
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
      </Link>

      <div className="flex shrink-0 items-center justify-end border-t border-border/60 bg-muted/25 px-3 py-3 sm:w-[148px] sm:border-t-0 sm:border-l sm:border-border/60">
        {isArchived ? (
          <form action={setBidStatus} className="w-full">
            <input type="hidden" name="bid_id" value={bid.id} />
            <input type="hidden" name="status" value="draft" />
            <button
              type="submit"
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "w-full gap-1.5",
              )}
            >
              <ArchiveRestore className="size-3.5" />
              Restore
            </button>
          </form>
        ) : (
          <form action={setBidStatus} className="w-full">
            <input type="hidden" name="bid_id" value={bid.id} />
            <input type="hidden" name="status" value="archived" />
            <button
              type="submit"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full gap-1.5 text-muted-foreground hover:text-foreground",
              )}
            >
              <Archive className="size-3.5" />
              Archive
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
