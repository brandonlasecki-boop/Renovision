"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshBidTitleFromScope } from "@/lib/actions/bids";
import type { Bid } from "@/types/bid";
import { deriveBidTitleFromScope } from "@/lib/bid-title";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ClipboardList,
  DollarSign,
  Hammer,
  ImageIcon,
  MapPin,
  User,
} from "lucide-react";

function formatSite(bid: Bid): string | null {
  const parts = [
    bid.site_address_line1?.trim(),
    [bid.site_city, bid.site_state].filter(Boolean).join(", ").trim(),
    bid.site_postal_code?.trim(),
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

function BidScopePreview({ bidId, text }: { bidId: string; text: string }) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) {
    return (
      <p className="text-sm text-muted-foreground">
        No project description yet. Add scope from{" "}
        <Link
          href={`/dashboard/bids/${bidId}/walkthrough`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          walkthrough
        </Link>{" "}
        or the Scope step.
      </p>
    );
  }
  const max = 420;
  const long = trimmed.length > max;
  const shown = !long || open ? trimmed : `${trimmed.slice(0, max).trim()}…`;
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{shown}</p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {open ? "Show less" : "Show full description"}
        </button>
      ) : null}
    </div>
  );
}

export function BidOverviewHeader({
  bidId,
  bid,
}: {
  bidId: string;
  bid: Bid;
}) {
  const router = useRouter();
  const suggested = deriveBidTitleFromScope(bid.scope_description);
  const differs = suggested.trim() !== bid.title.trim();
  const [state, formAction, pending] = useActionState(refreshBidTitleFromScope, undefined);

  useEffect(() => {
    if (state && "success" in state && state.success) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{bid.title}</h1>
      {differs ? (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/25">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">Suggested title from scope</p>
          <p className="mt-1 text-sm text-foreground">{suggested}</p>
          <form action={formAction} className="mt-2">
            <input type="hidden" name="bid_id" value={bidId} />
            {state && "error" in state && state.error ? (
              <p className="mb-2 text-xs text-destructive">{state.error}</p>
            ) : null}
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              {pending ? "Updating…" : "Use this title"}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

const QUICK: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  {
    href: "setup/questions",
    label: "Additional info",
    description: "Clarify scope with AI multiple choice",
    icon: ClipboardList,
  },
  {
    href: "setup/breakdown",
    label: "Scope lines",
    description: "Line items by trade",
    icon: Hammer,
  },
  {
    href: "setup/pricing",
    label: "Pricing",
    description: "Estimate and retail links",
    icon: DollarSign,
  },
  {
    href: "setup/mockup",
    label: "Mockup",
    description: "Visual preview",
    icon: ImageIcon,
  },
];

export function BidOverviewQuickLinks({ bidId }: { bidId: string }) {
  const base = `/dashboard/bids/${bidId}`;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {QUICK.map(({ href, label, description, icon: Icon }) => (
        <li key={href}>
          <Link
            href={`${base}/${href}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-auto min-h-[4.5rem] w-full flex-col items-start justify-center gap-1 py-3 text-left font-normal",
            )}
          >
            <span className="flex w-full items-center gap-2 font-semibold text-foreground">
              <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              {label}
              <ArrowRight className="ml-auto size-4 shrink-0 opacity-50" aria-hidden />
            </span>
            <span className="w-full pl-6 text-xs font-normal text-muted-foreground">{description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function BidOverviewScopeSection({ bidId, bid }: { bidId: string; bid: Bid }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">Project description</h2>
      <div className="mt-3">
        <BidScopePreview bidId={bidId} text={bid.scope_description} />
      </div>
    </section>
  );
}

export function BidOverviewMetaBar({
  bid,
  beforePhotoCount,
  lineCount,
  answeredQuestions,
  questionTotal,
}: {
  bid: Bid;
  beforePhotoCount: number;
  lineCount: number;
  answeredQuestions: number;
  questionTotal: number;
}) {
  const site = formatSite(bid);
  const kind = bid.project_kind?.trim();
  const customer = bid.customer_name?.trim();

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border/60 py-4 text-sm">
      {kind ? (
        <span className="text-muted-foreground">
          Type: <span className="font-medium text-foreground">{kind}</span>
        </span>
      ) : null}
      {customer ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <User className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="font-medium text-foreground">{customer}</span>
        </span>
      ) : (
        <Link
          href={`/dashboard/bids/${bid.id}/customer`}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Add customer
        </Link>
      )}
      {site ? (
        <span className="inline-flex max-w-full items-start gap-1.5 text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="text-foreground">{site}</span>
        </span>
      ) : null}
      <span className="text-muted-foreground">
        Photos:{" "}
        <span className="font-medium tabular-nums text-foreground">{beforePhotoCount}</span>
      </span>
      <span className="text-muted-foreground">
        Scope lines:{" "}
        <span className="font-medium tabular-nums text-foreground">{lineCount}</span>
      </span>
      {questionTotal > 0 ? (
        <span className="text-muted-foreground">
          Additional info:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {answeredQuestions}/{questionTotal}
          </span>
        </span>
      ) : null}
    </div>
  );
}
