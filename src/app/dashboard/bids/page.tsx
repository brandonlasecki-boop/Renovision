import Link from "next/link";
import { getBidsForUser } from "@/lib/data/bids";
import {
  BidsIndexToolbar,
  type BidsIndexSort,
  type BidsIndexView,
} from "@/components/dashboard/bids-index-toolbar";
import { BidsIndexRow } from "@/components/dashboard/bids-index-row";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import type { Bid } from "@/types/bid";

function parseView(raw: string | undefined): BidsIndexView {
  if (raw === "archived" || raw === "all") return raw;
  return "active";
}

function parseSort(raw: string | undefined): BidsIndexSort {
  if (raw === "title") return "title";
  return "updated";
}

function filterBids(bids: Bid[], view: BidsIndexView): Bid[] {
  if (view === "active") {
    return bids.filter((b) => b.status !== "archived");
  }
  if (view === "archived") {
    return bids.filter((b) => b.status === "archived");
  }
  return bids;
}

function sortBids(bids: Bid[], sort: BidsIndexSort): Bid[] {
  const copy = [...bids];
  if (sort === "title") {
    copy.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
    return copy;
  }
  copy.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
  return copy;
}

export default async function EstimatesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const sort = parseSort(sp.sort);
  const bids = await getBidsForUser();
  const visible = sortBids(filterBids(bids, view), sort);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estimates</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Each estimate is the full flow you already use—scope, walkthrough, materials, pricing, and mockups—so
          homeowners see realistic direction with grounded numbers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New estimate</CardTitle>
          <CardDescription>
            Start from a short description of the space—you can add photos, Q&amp;A, AI lines, and mockups on the
            next screens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/bids/new" className={cn(buttonVariants())}>
            Create an estimate
            <ArrowRight className="ml-1 size-4" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your estimates</CardTitle>
          {bids.length > 0 ? <BidsIndexToolbar view={view} sort={sort} /> : null}
        </CardHeader>
        <CardContent className="space-y-2">
          {bids.length === 0 ? (
            <p className="text-sm text-muted-foreground">No estimates yet.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {view === "archived"
                ? "No archived estimates."
                : view === "active"
                  ? "No active estimates."
                  : "No estimates match this filter."}
            </p>
          ) : (
            visible.map((b) => <BidsIndexRow key={b.id} bid={b} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
