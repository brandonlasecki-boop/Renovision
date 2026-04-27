"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const BidWorkspaceShell = dynamic(
  () => import("@/components/dashboard/bid-workspace-shell"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 sm:space-y-6">
        <div className="h-10 w-full max-w-2xl animate-pulse rounded-md bg-muted" />
      </div>
    ),
  },
);

export function BidWorkspaceShellBoundary({
  bidId,
  children,
}: {
  bidId: string;
  children: ReactNode;
}) {
  return <BidWorkspaceShell bidId={bidId}>{children}</BidWorkspaceShell>;
}
