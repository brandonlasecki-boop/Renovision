"use client";

import type { ReactNode } from "react";
import { BidWorkflowNav } from "@/components/dashboard/bid-workflow-nav";

/** Client-only shell; load via `next/dynamic` + `ssr: false` from the bid workspace layout so Turbopack does not pull this graph into unrelated `/dashboard/bids/*` RSC entries (e.g. `/new`). */
export default function BidWorkspaceShell({
  bidId,
  children,
}: {
  bidId: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <BidWorkflowNav bidId={bidId} />
      {children}
    </div>
  );
}
