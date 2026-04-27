"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useEffect, useRef, useState, useTransition } from "react";
import { generateBidScopeBreakdownAction } from "@/lib/actions/bids";
import type { Bid, BidLineTemplate } from "@/types/bid";
import { BidQuoteEditor } from "@/components/dashboard/bid-quote-editor";
import { ScopeBreakdownLoading } from "@/components/dashboard/scope-breakdown-loading";

export function BidBreakdownStep({
  bid,
  lineReferenceUrls,
  lineTemplates,
}: {
  bid: Bid;
  lineReferenceUrls: Record<string, string>;
  lineTemplates: BidLineTemplate[];
}) {
  const router = useRouter();
  const hasLines = bid.material_estimate.some((l) => l.name.trim().length > 0);
  const [genError, setGenError] = useState<string | null>(null);
  const [genPending, startGen] = useTransition();
  const genOnce = useRef(false);

  useEffect(() => {
    if (hasLines) return;
    if (genOnce.current) return;
    genOnce.current = true;
    setGenError(null);
    startGen(async () => {
      const res = await generateBidScopeBreakdownAction(bid.id);
      if ("error" in res) {
        setGenError(res.error);
        genOnce.current = false;
        return;
      }
      router.refresh();
    });
  }, [bid.id, hasLines, router]);

  if (!hasLines && genPending) {
    return <ScopeBreakdownLoading />;
  }

  if (!hasLines && genError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{genError}</p>
        <button
          type="button"
          className={cn(buttonVariants())}
          onClick={() => {
            genOnce.current = false;
            setGenError(null);
            startGen(async () => {
              const res = await generateBidScopeBreakdownAction(bid.id);
              if ("error" in res) {
                setGenError(res.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Scope</h1>
      <BidQuoteEditor
        bidId={bid.id}
        initialLines={bid.material_estimate}
        lineReferenceUrls={lineReferenceUrls}
        initialLineTemplates={lineTemplates}
        variant="scopeOnly"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Link
          href={`/dashboard/bids/${bid.id}/setup/questions`}
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex justify-center")}
        >
          Additional info
        </Link>
        <Link
          href={`/dashboard/bids/${bid.id}/setup/pricing`}
          className={cn(buttonVariants(), "inline-flex justify-center")}
        >
          Pricing
        </Link>
      </div>
    </div>
  );
}
