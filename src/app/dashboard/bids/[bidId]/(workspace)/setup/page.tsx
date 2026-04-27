import Link from "next/link";
import { notFound } from "next/navigation";
import { getBidDetail } from "@/lib/data/bids";

export const dynamic = "force-dynamic";
import { BidSetupGate } from "@/components/dashboard/bid-setup-gate";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function BidSetupPage({
  params,
}: {
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  const detail = await getBidDetail(bidId);
  if (!detail) {
    notFound();
  }

  const beforePhotos = detail.photos.filter((p) => p.kind === "before");

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/bids/${bidId}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 inline-flex text-muted-foreground hover:text-foreground")}
        >
          <ArrowLeft className="mr-1 size-4" />
          Overview
        </Link>
      </div>
      <BidSetupGate bid={detail.bid} beforePhotos={beforePhotos} />
    </div>
  );
}
