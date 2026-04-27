"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateBid } from "@/lib/actions/bids";
import type { Bid, BidStatus } from "@/types/bid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUSES: { value: BidStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "archived", label: "Archived" },
];

export function BidEditForm({ bid }: { bid: Bid }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateBid, undefined);

  useEffect(() => {
    if (state && "success" in state && state.success) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="bid_id" value={bid.id} />

        {state && "error" in state && state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {state && "success" in state && state.success ? (
          <p className="text-xs text-muted-foreground">Saved.</p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="title">Estimate name</Label>
          <Input
            id="title"
            name="title"
            defaultValue={bid.title}
            required
            className="bg-background"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="status">Pipeline</Label>
            <select
              id="status"
              name="status"
              defaultValue={bid.status}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer_name">Customer name</Label>
            <Input
              id="customer_name"
              name="customer_name"
              defaultValue={bid.customer_name}
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_phone">Phone</Label>
            <Input
              id="customer_phone"
              name="customer_phone"
              type="tel"
              defaultValue={bid.customer_phone ?? ""}
              className="bg-background"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer_email">Customer email</Label>
          <Input
            id="customer_email"
            name="customer_email"
            type="email"
            defaultValue={bid.customer_email ?? ""}
            className="bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label>Job site</Label>
          <Input
            name="site_address_line1"
            defaultValue={bid.site_address_line1 ?? ""}
            placeholder="Street address"
            className="bg-background"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              name="site_city"
              defaultValue={bid.site_city ?? ""}
              placeholder="City"
              className="bg-background"
            />
            <Input
              name="site_state"
              defaultValue={bid.site_state ?? ""}
              placeholder="State"
              className="bg-background"
            />
            <Input
              name="site_postal_code"
              defaultValue={bid.site_postal_code ?? ""}
              placeholder="ZIP"
              className="bg-background"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="scope_description">Scope</Label>
          <Textarea
            id="scope_description"
            name="scope_description"
            rows={5}
            defaultValue={bid.scope_description}
            className="min-h-[120px] resize-y bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="internal_notes">Internal notes</Label>
          <Textarea
            id="internal_notes"
            name="internal_notes"
            rows={3}
            defaultValue={bid.internal_notes ?? ""}
            className="resize-y bg-background"
          />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}
