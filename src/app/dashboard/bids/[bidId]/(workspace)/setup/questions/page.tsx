import Link from "next/link";
import { notFound } from "next/navigation";
import { getBidDetail } from "@/lib/data/bids";
import { BidQuestionsQuiz } from "@/components/dashboard/bid-questions-quiz";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function BidSetupQuestionsPage({
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
          href={`/dashboard/bids/${bidId}/setup`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 inline-flex text-muted-foreground hover:text-foreground")}
        >
          <ArrowLeft className="mr-1 size-4" />
          Site &amp; plan
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Additional info</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Short answers help the estimator cover trades, fixtures, and edge cases. The last question is
          always a catch-all for anything we didn&apos;t ask.
        </p>
      </div>
      <BidQuestionsQuiz bid={detail.bid} />
    </div>
  );
}
