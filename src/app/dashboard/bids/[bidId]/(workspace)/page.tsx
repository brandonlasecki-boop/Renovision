import Link from "next/link";
import { notFound } from "next/navigation";
import { getBidDetail, getQuoteFamilyPeers } from "@/lib/data/bids";
import { QuoteFamilySwitcher } from "@/components/dashboard/quote-family-switcher";
import {
  BidOverviewHeader,
  BidOverviewMetaBar,
  BidOverviewQuickLinks,
  BidOverviewScopeSection,
} from "@/components/dashboard/bid-overview";
import { setBidStatus } from "@/lib/actions/bids";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MCQ_OTHER_OPTION_ID } from "@/lib/questionnaire-mcq";
import type { ProjectQuestionnaireItem } from "@/types/bid";
import { ArchiveRestore, ArrowLeft } from "lucide-react";

function questionnaireProgress(items: ProjectQuestionnaireItem[]) {
  const total = items.length;
  let answered = 0;
  for (const q of items) {
    if (q.selected_option_id) {
      if (q.selected_option_id === MCQ_OTHER_OPTION_ID) {
        if (q.other_text?.trim()) answered++;
      } else {
        answered++;
      }
    } else if (q.answer?.trim()) {
      answered++;
    }
  }
  return { answered, total };
}

export default async function BidDetailPage({
  params,
}: {
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  const detail = await getBidDetail(bidId);
  if (!detail) {
    notFound();
  }

  const relatedQuotes = await getQuoteFamilyPeers(bidId);
  const { bid, photos } = detail;
  const beforePhotoCount = photos.filter((p) => p.kind === "before").length;
  const lineCount = bid.material_estimate.filter((l) => String(l.name ?? "").trim()).length;
  const { answered, total: questionTotal } = questionnaireProgress(bid.project_questionnaire);

  const created = new Date(bid.created_at);
  const updated = new Date(bid.updated_at);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/bids"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2.5 inline-flex text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeft className="mr-1 size-4" />
          Estimates
        </Link>
        {relatedQuotes.length > 1 ? (
          <div className="mt-4 max-w-lg">
            <QuoteFamilySwitcher bidId={bid.id} relatedQuotes={relatedQuotes} />
          </div>
        ) : null}
        <div className="mt-3">
          <BidOverviewHeader bidId={bid.id} bid={bid} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium capitalize text-foreground">{bid.status}</span>
          {" · "}
          Created {created.toLocaleDateString(undefined, { dateStyle: "medium" })}
          {updated.getTime() !== created.getTime() ? (
            <>
              {" · "}
              Updated {updated.toLocaleDateString(undefined, { dateStyle: "medium" })}
            </>
          ) : null}
          {bid.ai_status !== "idle" ? (
            <>
              {" · "}
              AI <span className="text-foreground">{bid.ai_status}</span>
            </>
          ) : null}
        </p>
        {bid.status === "archived" ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm text-foreground">
              This estimate is <span className="font-medium">archived</span> and is hidden from your
              Active list.
            </p>
            <form action={setBidStatus} className="shrink-0">
              <input type="hidden" name="bid_id" value={bid.id} />
              <input type="hidden" name="status" value="draft" />
              <button type="submit" className={cn(buttonVariants({ size: "sm" }))}>
                <ArchiveRestore className="mr-1.5 size-4" />
                Restore to draft
              </button>
            </form>
          </div>
        ) : null}
      </div>

      <BidOverviewMetaBar
        bid={bid}
        beforePhotoCount={beforePhotoCount}
        lineCount={lineCount}
        answeredQuestions={answered}
        questionTotal={questionTotal}
      />

      {bid.ai_summary?.trim() ? (
        <section className="rounded-2xl border border-border/80 bg-muted/20 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground">AI summary</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {bid.ai_summary.trim()}
          </p>
        </section>
      ) : null}

      <BidOverviewScopeSection bidId={bid.id} bid={bid} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Continue this estimate</h2>
        <BidOverviewQuickLinks bidId={bid.id} />
      </section>

      <div className="flex flex-wrap gap-4 border-t border-border/60 pt-6 text-sm">
        <Link
          href={`/dashboard/bids/${bid.id}/walkthrough`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Walkthrough &amp; site capture
        </Link>
        <Link
          href={`/dashboard/bids/${bid.id}/customer`}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Customer &amp; address
        </Link>
        <Link
          href={`/dashboard/bids/${bid.id}/setup`}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Site &amp; plan
        </Link>
      </div>
    </div>
  );
}
