import Link from "next/link";
import { notFound } from "next/navigation";
import { getBidDetail, getCompanyLineTemplatesForBid } from "@/lib/data/bids";
import { BidAiEstimateSection } from "@/components/dashboard/bid-ai-estimate-section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function BidSetupMockupPage({
  params,
}: {
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  const detail = await getBidDetail(bidId);
  if (!detail) {
    notFound();
  }

  const { bid, photos, lineReferenceUrls } = detail;
  const beforePhotos = photos.filter((p) => p.kind === "before");
  const mockupPhotos = photos.filter((p) => p.kind === "after_mockup");
  const lineTemplates = await getCompanyLineTemplatesForBid(bidId);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/bids/${bidId}/setup/pricing`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 inline-flex text-muted-foreground hover:text-foreground")}
        >
          <ArrowLeft className="mr-1 size-4" />
          Pricing
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Mockup</h1>
      </div>
      <BidAiEstimateSection
        bid={bid}
        materials={bid.material_estimate}
        lineReferenceUrls={lineReferenceUrls}
        lineTemplates={lineTemplates}
        beforePhotos={beforePhotos}
        mockupPhotos={mockupPhotos}
      />
    </div>
  );
}
