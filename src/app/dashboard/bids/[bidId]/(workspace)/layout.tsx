import type { ReactNode } from "react";
import { BidWorkspaceShellBoundary } from "@/components/dashboard/bid-workspace-shell-boundary";

export default async function BidWorkspaceRouteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  return (
    <BidWorkspaceShellBoundary bidId={bidId}>{children}</BidWorkspaceShellBoundary>
  );
}
