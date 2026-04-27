import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBidDetail,
  getCompanyLineTemplatesForBid,
  getQuoteFamilyPeers,
} from "@/lib/data/bids";
import { BidPricingHeader } from "@/components/dashboard/bid-pricing-header";
import { BidQuoteEditor } from "@/components/dashboard/bid-quote-editor";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function BidSetupPricingPage({
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
  const relatedQuotes = await getQuoteFamilyPeers(bidId);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/bids/${bidId}/setup/breakdown`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 inline-flex text-muted-foreground hover:text-foreground")}
        >
          <ArrowLeft className="mr-1 size-4" />
          Scope
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Pricing</h1>
      </div>
      <BidPricingHeader
        bidId={detail.bid.id}
        initialTitle={detail.bid.title}
        relatedQuotes={relatedQuotes}
      />
      <BidQuoteEditor
        bidId={detail.bid.id}
        initialLines={detail.bid.material_estimate}
        lineReferenceUrls={detail.lineReferenceUrls}
        initialLineTemplates={lineTemplates}
        variant="full"
      />
      <Link
        href={`/dashboard/bids/${bidId}/setup/mockup`}
        className={cn(buttonVariants(), "inline-flex w-full justify-center sm:w-auto")}
      >
        Mockup
      </Link>
    </div>
  );
}
