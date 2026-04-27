"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { duplicateBidFromSource, updateBidQuoteTitle } from "@/lib/actions/bids";
import { QuoteFamilySwitcher } from "@/components/dashboard/quote-family-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";

export function BidPricingHeader({
  bidId,
  initialTitle,
  relatedQuotes = [],
}: {
  bidId: string;
  initialTitle: string;
  /** Same quote family (original + copies); include current bid. */
  relatedQuotes?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [nameState, nameAction, namePending] = useActionState(updateBidQuoteTitle, undefined);
  const [dupState, dupAction, dupPending] = useActionState(duplicateBidFromSource, undefined);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    if (dupState && "success" in dupState && dupState.success && "newBidId" in dupState) {
      router.push(`/dashboard/bids/${dupState.newBidId}/setup/pricing`);
    }
  }, [dupState, router]);

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/15 p-4 shadow-sm sm:p-5">
      <QuoteFamilySwitcher bidId={bidId} relatedQuotes={relatedQuotes} />

      <form action={nameAction} className="space-y-2">
        <input type="hidden" name="bid_id" value={bidId} />
        <Label htmlFor={`quote-name-${bidId}`} className="text-sm font-medium">
          Quote name
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            id={`quote-name-${bidId}`}
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-11 max-w-xl"
            placeholder="e.g. Smith bath — option A"
            disabled={namePending}
          />
          <Button type="submit" variant="secondary" disabled={namePending || title.trim() === initialTitle}>
            {namePending ? "Saving…" : "Save name"}
          </Button>
        </div>
        {nameState && "error" in nameState && nameState.error ? (
          <p className="text-sm text-destructive">{nameState.error}</p>
        ) : null}
        {nameState && "success" in nameState && nameState.success ? (
          <p className="text-xs text-muted-foreground">Saved.</p>
        ) : null}
      </form>

      <form action={dupAction} className="space-y-2 border-t border-border/60 pt-4">
        <input type="hidden" name="bid_id" value={bidId} />
        <Label htmlFor={`dup-title-${bidId}`} className="text-sm font-medium">
          Copy this quote
        </Label>
        <p className="text-xs text-muted-foreground">
          Opens a new estimate with the same scope, line items, and jobsite photos (mockups are not copied).
          Leave the name blank to use the next number (e.g. Quote-004).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            id={`dup-title-${bidId}`}
            name="new_title"
            className="min-h-11 max-w-xl"
            placeholder="Optional — next Quote-### if blank"
            disabled={dupPending}
          />
          <Button type="submit" variant="outline" disabled={dupPending} className="min-h-11 touch-manipulation">
            <Copy className="mr-1.5 size-4" />
            {dupPending ? "Creating…" : "Create copy"}
          </Button>
        </div>
        {dupState && "error" in dupState && dupState.error ? (
          <p className="text-sm text-destructive">{dupState.error}</p>
        ) : null}
      </form>
    </div>
  );
}
