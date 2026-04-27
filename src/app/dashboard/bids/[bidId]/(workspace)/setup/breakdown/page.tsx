import Link from "next/link";
import { notFound } from "next/navigation";
import { getBidDetail, getCompanyLineTemplatesForBid } from "@/lib/data/bids";
import { BidBreakdownStep } from "@/components/dashboard/bid-breakdown-step";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function BidSetupBreakdownPage({
  params,
}: {
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  const detail = await getBidDetail(bidId);
  if (!detail) {
    notFound();
  }

  const lineTemplates = await getCompanyLineTemplatesForBid(bidId);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/bids/${bidId}/setup/questions`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 inline-flex text-muted-foreground hover:text-foreground")}
        >
          <ArrowLeft className="mr-1 size-4" />
          Additional info
        </Link>
      </div>
      <BidBreakdownStep
        bid={detail.bid}
        lineReferenceUrls={detail.lineReferenceUrls}
        lineTemplates={lineTemplates}
      />
    </div>
  );
}
