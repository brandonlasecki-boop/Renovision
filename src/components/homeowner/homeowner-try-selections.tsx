"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  applyTryRetailShelfCandidateChoiceAction,
  fetchTryRetailShelfCandidatesAction,
} from "@/lib/actions/homeowner-try-retail";
import type { HomeDepotSearchHit } from "@/lib/integrations/serpapi-homedepot";
import type { LowesSearchHit } from "@/lib/integrations/serpapi-lowes";

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type HitChoice = { retailer: "home_depot" | "lowes"; hit: HomeDepotSearchHit | LowesSearchHit };

type HomeownerTrySelectionCard = {
  line_id: string;
  name: string;
  slot: string;
  imageUrl: string | null;
  retailer: "home_depot" | "lowes" | null;
  title: string | null;
  productUrl: string | null;
  extended_usd: number;
  quantity: number;
  unit: string;
};

export function HomeownerTrySelections({
  projectId,
  cards,
  materialsBallparkTotal,
  serpConfigured,
}: {
  projectId: string;
  cards: HomeownerTrySelectionCard[];
  materialsBallparkTotal: number;
  serpConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [swapOpen, setSwapOpen] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [activeLineName, setActiveLineName] = useState("");
  const [hint, setHint] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [hdHits, setHdHits] = useState<HomeDepotSearchHit[]>([]);
  const [lwHits, setLwHits] = useState<LowesSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  function openSwap(lineId: string, name: string) {
    setActiveLineId(lineId);
    setActiveLineName(name);
    setHint("");
    setSearchQ("");
    setHdHits([]);
    setLwHits([]);
    setSwapOpen(true);
  }

  function closeSwap() {
    setSwapOpen(false);
    setActiveLineId(null);
  }

  async function runSearch() {
    if (!activeLineId) return;
    setSearching(true);
    try {
      const res = await fetchTryRetailShelfCandidatesAction(projectId, activeLineId, hint || undefined);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setSearchQ(res.q);
      setHdHits(res.home_depot);
      setLwHits(res.lowes);
      if (!res.home_depot.length && !res.lowes.length) {
        toast.message("No matches", {
          description: "Try different words (finish, size, style).",
        });
      }
    } catch (e) {
      toast.error("Search failed", {
        description: e instanceof Error ? e.message.slice(0, 160) : "Please try again in a moment.",
      });
    } finally {
      setSearching(false);
    }
  }

  function applyHit(choice: HitChoice) {
    if (!activeLineId) return;
    startTransition(async () => {
      const res = await applyTryRetailShelfCandidateChoiceAction(projectId, activeLineId, choice);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Product updated", {
        description: "Regenerate your preview to refresh the image with this SKU.",
      });
      closeSwap();
      router.refresh();
    });
  }

  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Selections & ballpark materials</h2>
          <p className="text-sm text-muted-foreground">
            Linked shelf items from Home Depot or Lowe’s (when search is configured) so the preview can mirror real
            products—not a generic render.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ballpark materials</p>
          <p className="text-xl font-semibold tabular-nums">{formatUsd(materialsBallparkTotal)}</p>
          <p className="text-xs text-muted-foreground">Shelf-style pricing only — not a contractor quote.</p>
        </div>
      </div>

      {!serpConfigured ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Retail linking is off until <code className="text-xs">SERPAPI_API_KEY</code> is set on the server. You
          can still explore previews; product thumbnails will fill in once search is configured.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <div
            key={c.line_id}
            className="flex gap-3 rounded-xl border border-border/70 bg-muted/15 p-3 shadow-sm"
          >
            <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
              {c.imageUrl ? (
                <Image src={c.imageUrl} alt="" fill className="object-contain p-1" unoptimized sizes="80px" />
              ) : (
                <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-renovision-orange">{c.slot}</p>
              <p className="line-clamp-2 text-sm font-medium leading-snug">{c.name}</p>
              {c.title ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">{c.title}</p>
              ) : (
                <p className="text-xs text-muted-foreground">No store SKU linked yet.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-medium tabular-nums">{formatUsd(c.extended_usd)}</span>
                {c.retailer ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {c.retailer === "home_depot" ? "Home Depot" : "Lowe’s"}
                  </span>
                ) : null}
                {c.productUrl ? (
                  <a
                    href={c.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    View listing
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!serpConfigured || pending}
                  onClick={() => openSwap(c.line_id, c.name)}
                >
                  Swap product
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {swapOpen && activeLineId ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeSwap();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-dialog-title"
          >
            <h3 id="swap-dialog-title" className="text-base font-semibold">
              Swap product
            </h3>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{activeLineName}</p>

            <div className="mt-4 space-y-2">
              <Label htmlFor="swap-hint">What are you looking for instead?</Label>
              <Textarea
                id="swap-hint"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. 60 inch double vanity, warm oak finish, brushed nickel widespread faucet…"
                className="resize-none"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={runSearch} disabled={searching || !serpConfigured}>
                {searching ? "Searching…" : "Search store shelves"}
              </Button>
              <Button type="button" variant="ghost" onClick={closeSwap}>
                Cancel
              </Button>
            </div>

            {searchQ ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Query: <span className="font-medium text-foreground">{searchQ}</span>
              </p>
            ) : null}

            {hdHits.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Home Depot</p>
                <ul className="space-y-2">
                  {hdHits.map((h, i) => (
                    <li
                      key={`${h.product_id ?? i}`}
                      className="flex gap-2 rounded-lg border border-border/60 p-2 text-sm"
                    >
                      {h.image_url ? (
                        <div className="relative size-14 shrink-0 overflow-hidden rounded border bg-muted">
                          <Image src={h.image_url} alt="" fill className="object-contain p-0.5" unoptimized />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-medium">{h.title}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatUsd(h.price_usd)}
                          {h.price_raw ? ` · ${h.price_raw}` : ""}
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="mt-1 h-7 text-xs"
                          disabled={pending}
                          onClick={() => applyHit({ retailer: "home_depot", hit: h })}
                        >
                          Use this
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {lwHits.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lowe’s</p>
                <ul className="space-y-2">
                  {lwHits.map((h, i) => (
                    <li
                      key={`${h.product_id ?? i}`}
                      className="flex gap-2 rounded-lg border border-border/60 p-2 text-sm"
                    >
                      {h.image_url ? (
                        <div className="relative size-14 shrink-0 overflow-hidden rounded border bg-muted">
                          <Image src={h.image_url} alt="" fill className="object-contain p-0.5" unoptimized />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-medium">{h.title}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatUsd(h.price_usd)}
                          {h.price_raw ? ` · ${h.price_raw}` : ""}
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="mt-1 h-7 text-xs"
                          disabled={pending}
                          onClick={() => applyHit({ retailer: "lowes", hit: h })}
                        >
                          Use this
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
