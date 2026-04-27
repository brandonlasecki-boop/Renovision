import Link from "next/link";
import { notFound } from "next/navigation";
import { BidWalkthroughWizard } from "@/components/dashboard/bid-walkthrough-wizard";
import { getBidDetail } from "@/lib/data/bids";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function BidWalkthroughPage({
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
    <div className="space-y-6">
      <Link
        href={`/dashboard/bids/${bidId}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 inline-flex")}
      >
        <ArrowLeft className="mr-1 size-4" />
        Estimate
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Guided walkthrough</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Describe what you want, add room sizes if you know them, and upload at least one clear photo of the
          space—then voice notes and AI follow-ups help nail scope and pricing.
        </p>
      </div>
      <BidWalkthroughWizard bid={detail.bid} beforePhotos={beforePhotos} />
    </div>
  );
}
