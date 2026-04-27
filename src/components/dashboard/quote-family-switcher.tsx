"use client";

import { usePathname, useRouter } from "next/navigation";
import { GitBranch } from "lucide-react";

function quoteSwitchHref(currentBidId: string, targetBidId: string, pathname: string | null): string {
  if (!pathname?.includes(`/dashboard/bids/${currentBidId}`)) {
    return `/dashboard/bids/${targetBidId}/setup/pricing`;
  }
  return pathname.replace(`/dashboard/bids/${currentBidId}`, `/dashboard/bids/${targetBidId}`);
}

/** Dropdown to jump between a quote and its copies (same `quote_family_id`). */
export function QuoteFamilySwitcher({
  bidId,
  relatedQuotes,
}: {
  bidId: string;
  relatedQuotes: { id: string; title: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (relatedQuotes.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <GitBranch className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="max-sm:sr-only">Related quotes</span>
      </div>
      <label className="min-w-0 flex-1 sm:max-w-md">
        <span className="sr-only">Switch to another quote in this family</span>
        <select
          className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={bidId}
          onChange={(e) => {
            const next = e.target.value;
            if (next && next !== bidId) {
              router.push(quoteSwitchHref(bidId, next, pathname));
            }
          }}
        >
          {relatedQuotes.map((q) => (
            <option key={q.id} value={q.id}>
              {q.title.trim() || "Untitled quote"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
