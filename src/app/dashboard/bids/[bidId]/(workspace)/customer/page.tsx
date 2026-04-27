import Link from "next/link";
import { notFound } from "next/navigation";
import { getBidDetail } from "@/lib/data/bids";
import { BidEditForm } from "@/components/dashboard/bid-edit-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function BidCustomerPage({
  params,
}: {
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  const detail = await getBidDetail(bidId);
  if (!detail) {
    notFound();
  }

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
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Customer</h1>
      </div>
      <BidEditForm bid={detail.bid} />
    </div>
  );
}
