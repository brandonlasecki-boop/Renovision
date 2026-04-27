"use client";

import {
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import type { MutableRefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  clearStuckBidAiGeneration,
  generateBidAi,
  inspectBidMockupVertexPayload,
  type BidMockupVertexInspectResult,
} from "@/lib/actions/bids";
import type { BidAiStatus, BidPhotoWithUrl } from "@/types/bid";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MockupScanLoading } from "@/components/dashboard/mockup-scan-loading";
import {
  mockupVersionLabel,
  sortMockupsByVersionAsc,
} from "@/lib/bid-mockup-utils";

import { BID_AI_GENERATE_FORM_ID } from "@/lib/bid-ai-generate-form-id";

const FORM_ID = BID_AI_GENERATE_FORM_ID;

const STEPS_FULL = [
  "Reading scope & photos",
  "Materials & summary",
  "After image",
] as const;

const STEPS_MOCKUP_ONLY = ["Preparing scene", "Applying your quote", "Rendering image"] as const;

function BidAiLoadingOverlay({
  busy,
  mockupOnlyMode,
  scanImageUrl,
  bidId,
  clearStuckFormAction,
}: {
  busy: boolean;
  mockupOnlyMode: boolean;
  scanImageUrl?: string | null;
  /** Lets users recover when the host kills a long Vertex run (estimate stays `pending`). */
  bidId?: string;
  clearStuckFormAction?: (payload: FormData) => void;
}) {
  const [phase, setPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const steps = mockupOnlyMode ? STEPS_MOCKUP_ONLY : STEPS_FULL;

  useEffect(() => {
    if (!busy) {
      setPhase(0);
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % steps.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [busy, steps.length]);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  if (!busy) return null;

  if (mockupOnlyMode) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background/92 px-4 py-10 backdrop-blur-md"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <MockupScanLoading imageUrl={scanImageUrl} elapsedSeconds={elapsed} />
        <div className="flex gap-1.5" aria-hidden>
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors duration-300",
                i === phase ? "bg-primary" : "bg-muted-foreground/25",
              )}
            />
          ))}
        </div>
        <div className="max-w-sm space-y-1 text-center">
          <p className="text-sm font-medium text-foreground">{steps[phase]}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Most renders finish in about 1–3 minutes; many shelf photos or a busy Vertex region can push
            toward several minutes. Leave this tab open — the page refreshes every 10s while the server
            works.
            {elapsed > 0 ? (
              <span className="mt-1 block tabular-nums">Elapsed {elapsed}s</span>
            ) : null}
          </p>
          {elapsed >= 120 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              If this sits past ~8 minutes with no change, the host may have stopped the server job
              while the UI still shows working — use reset below, then try again (check Vertex + GCP
              setup if it keeps failing).
            </p>
          ) : null}
          {elapsed >= 240 && bidId && clearStuckFormAction ? (
            <form action={clearStuckFormAction} className="pointer-events-auto mx-auto mt-4 max-w-xs space-y-2">
              <input type="hidden" name="bid_id" value={bidId} />
              <Button type="submit" variant="outline" size="sm" className="w-full touch-manipulation">
                Reset stuck generation
              </Button>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Marks this estimate as failed so you can regenerate. Only use if you are sure nothing
                is still running.
              </p>
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background/88 px-6 py-10 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative size-14">
        <div
          className="absolute inset-0 rounded-full border-2 border-muted border-t-primary motion-safe:animate-spin"
          style={{ animationDuration: "0.95s" }}
        />
        <div className="absolute inset-2 rounded-full bg-primary/5" />
      </div>
      <div className="space-y-2 text-center">
        <p className="text-sm font-semibold tracking-tight">Generating</p>
        <p className="text-xs text-muted-foreground">{steps[phase]}</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Full runs (materials + image) often take several minutes. Elapsed {elapsed}s
        </p>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {steps.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors duration-300",
              i === phase ? "bg-primary" : "bg-muted-foreground/25",
            )}
          />
        ))}
      </div>
    </div>
  );
}

const MOCKUP_SELECT_CLASS =
  "flex h-9 w-full max-w-md rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function BidGenerateButton({
  bidId,
  aiStatus,
  showFooterRegenerate,
  mockupOnlyMode = false,
  /**
   * Live `JSON.stringify(BidMaterialLine[])` from the quote editor (updated each render) so submit
   * always includes the latest shelf / mockup picks without waiting on effects or hidden inputs.
   */
  materialEstimateSnapshotRef,
  /** Mockup versions for “refine from” — same bid’s `after_mockup` rows. */
  mockupPhotosForRefine,
  scanImageUrl,
  /** When mockupOnlyMode: false until the first mockup exists — “Changes for this render” stays off. */
  hasAnyMockupRender = true,
  children,
}: {
  bidId: string;
  aiStatus: BidAiStatus;
  showFooterRegenerate?: boolean;
  mockupOnlyMode?: boolean;
  materialEstimateSnapshotRef?: MutableRefObject<string>;
  mockupPhotosForRefine?: BidPhotoWithUrl[];
  /** Before photo URL — drives the mockup loading scan effect. */
  scanImageUrl?: string | null;
  hasAnyMockupRender?: boolean;
  children?: ReactNode;
}) {
  const formActionWithLiveQuote = useCallback(
    (prev: unknown, formData: FormData) => {
      if (mockupOnlyMode) {
        const fromForm = String(formData.get("material_estimate_snapshot") ?? "").trim();
        const fromRef = materialEstimateSnapshotRef?.current?.trim() ?? "";
        const snap = fromForm || fromRef;
        if (snap) {
          formData.set("material_estimate_snapshot", snap);
        }
      }
      return generateBidAi(prev, formData);
    },
    [mockupOnlyMode, materialEstimateSnapshotRef],
  );
  const [state, formAction, pending] = useActionState(formActionWithLiveQuote, undefined);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectData, setInspectData] = useState<BidMockupVertexInspectResult | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectPending, startInspectTransition] = useTransition();
  /** Server left the bid in generating state (may still be running, timed out, or stuck). */
  const serverPending = aiStatus === "pending";
  /** Block double-submit while a run is in progress or the bid is still marked pending. */
  const busy = pending || serverPending;
  /** Full-screen overlay only while this tab is waiting on the server action (not after a timeout / refresh). */
  const showBlockingOverlay = pending;
  const sortedRefineMockups = useMemo(
    () => sortMockupsByVersionAsc(mockupPhotosForRefine ?? []),
    [mockupPhotosForRefine],
  );
  const [refineFromId, setRefineFromId] = useState("");
  /** Default: jobsite room photo — uncheck to refine from a previous mockup. */
  const [startFromRoom, setStartFromRoom] = useState(true);
  const router = useRouter();
  const [clearState, clearAction, clearPending] = useActionState(clearStuckBidAiGeneration, undefined);

  useEffect(() => {
    if (sortedRefineMockups.length === 0) {
      setRefineFromId("");
      return;
    }
    const latest = sortedRefineMockups[sortedRefineMockups.length - 1]!.id;
    setRefineFromId((prev) =>
      prev && sortedRefineMockups.some((p) => p.id === prev) ? prev : latest,
    );
  }, [sortedRefineMockups]);

  useEffect(() => {
    if (!showBlockingOverlay) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showBlockingOverlay]);

  useEffect(() => {
    if (!serverPending) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 10000);
    return () => window.clearInterval(id);
  }, [serverPending, router]);

  useEffect(() => {
    if (
      clearState &&
      typeof clearState === "object" &&
      "success" in clearState &&
      clearState.success
    ) {
      router.refresh();
    }
  }, [clearState, router]);

  const alreadyRan = aiStatus === "complete" || aiStatus === "failed";
  const primaryLabel = busy
    ? serverPending
      ? "Generating…"
      : "Working…"
    : mockupOnlyMode
      ? alreadyRan
        ? "Regenerate mockup"
        : "Generate mockup"
      : alreadyRan
        ? "Regenerate AI estimate & mockup"
        : "Generate AI estimate & mockup";

  const successMsg =
    state && "success" in state && state.success
      ? mockupOnlyMode
        ? "Saved."
        : "Saved."
      : null;

  const canEditRenderNotes = !mockupOnlyMode || hasAnyMockupRender;

  function buildInspectFormData(): FormData {
    const fd = new FormData();
    fd.set("bid_id", bidId);
    if (mockupOnlyMode) {
      fd.set("mockup_only", "1");
      const snap = materialEstimateSnapshotRef?.current?.trim() ?? "";
      fd.set("material_estimate_snapshot", snap);
    }
    const el =
      typeof document !== "undefined"
        ? (document.getElementById(FORM_ID) as HTMLFormElement | null)
        : null;
    if (el) {
      const fromForm = new FormData(el);
      const ap = fromForm.get("additional_prompt");
      if (ap != null) fd.set("additional_prompt", String(ap));
      const reg = fromForm.get("regenerate_from_room");
      if (reg != null) fd.set("regenerate_from_room", String(reg));
      const rid = fromForm.get("refine_from_mockup_photo_id");
      if (rid != null) fd.set("refine_from_mockup_photo_id", String(rid));
    }
    return fd;
  }

  return (
    <div className="relative rounded-xl">
      <div
        className={cn(
          "space-y-6",
          showBlockingOverlay && "pointer-events-none select-none",
        )}
        aria-hidden={showBlockingOverlay}
      >
        <form id={FORM_ID} action={formAction} hidden>
          <input type="hidden" name="bid_id" value={bidId} />
          {mockupOnlyMode ? <input type="hidden" name="mockup_only" value="1" /> : null}
          {mockupOnlyMode &&
          refineFromId &&
          !startFromRoom &&
          sortedRefineMockups.length > 0 ? (
            <input
              type="hidden"
              name="refine_from_mockup_photo_id"
              value={refineFromId}
            />
          ) : null}
        </form>

        <div className="space-y-4">
          {state && "error" in state && state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {successMsg ? <p className="text-xs text-muted-foreground">{successMsg}</p> : null}

          {mockupOnlyMode ? (
            <Card size="sm" className="gap-0 py-0 shadow-sm ring-border/60">
              <CardHeader className="border-b border-border/70 pb-3 pt-3.5">
                <CardTitle className="text-sm font-semibold">Mockup</CardTitle>
                <CardDescription className="text-xs leading-snug">
                  Product photos and mockup toggles follow the <span className="font-medium text-foreground">Quote &amp; references</span>{" "}
                  table on this page (including changes you have not saved to{" "}
                  <Link
                    href={`/dashboard/bids/${bidId}/setup/pricing`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Setup → Pricing
                  </Link>
                  ). Use the fields in this card only for <span className="font-medium text-foreground">this</span>{" "}
                  render.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pb-4 pt-4">
                {sortedRefineMockups.length > 0 ? (
                  <div className="space-y-2.5 rounded-lg bg-muted/40 px-3 py-2.5 ring-1 ring-border/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Starting image
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <label htmlFor={`${FORM_ID}-refine-mockup`} className="sr-only">
                        Mockup version to build on
                      </label>
                      <select
                        id={`${FORM_ID}-refine-mockup`}
                        value={refineFromId}
                        onChange={(e) => setRefineFromId(e.target.value)}
                        disabled={busy || startFromRoom}
                        className={cn(MOCKUP_SELECT_CLASS, "sm:max-w-[min(100%,20rem)] sm:flex-1")}
                        aria-label="Which mockup version to use as the base for the next render"
                      >
                        {sortedRefineMockups.map((p) => (
                          <option key={p.id} value={p.id}>
                            {mockupVersionLabel(p)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-tight">
                      <input
                        type="checkbox"
                        form={FORM_ID}
                        name="regenerate_from_room"
                        value="1"
                        disabled={busy}
                        checked={startFromRoom}
                        onChange={(e) => setStartFromRoom(e.target.checked)}
                        className="mt-0.5 size-4 shrink-0 rounded border-input"
                      />
                      <span>
                        <span className="font-medium text-foreground">Use jobsite room photo as the base</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Default: full redraw from your before photo. Uncheck to apply edits on top of the
                          mockup version selected above.
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${FORM_ID}-additional`}
                    className="text-sm font-medium leading-none text-foreground"
                  >
                    Changes for this render
                  </label>
                  {!canEditRenderNotes ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Available after your first mockup is generated — then you can describe tweaks for the
                      next render.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Optional. What should look different in the new image (finishes, one fixture, “lighter
                      paint,” etc.).
                    </p>
                  )}
                  <Textarea
                    id={`${FORM_ID}-additional`}
                    form={FORM_ID}
                    name="additional_prompt"
                    placeholder='e.g. "Swap only the vanity hardware to match the brushed nickel in the ref photo."'
                    rows={2}
                    disabled={busy || !canEditRenderNotes}
                    readOnly={!canEditRenderNotes}
                    className="min-h-[4.25rem] resize-y bg-background text-sm disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${FORM_ID}-regen-attach`}
                    className="text-sm font-medium leading-none text-foreground"
                  >
                    Extra product photo{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    One image for <span className="font-medium text-foreground">this run only</span>. Say in
                    “Changes” how to use it (e.g. which line or fixture).
                  </p>
                  <input
                    id={`${FORM_ID}-regen-attach`}
                    form={FORM_ID}
                    type="file"
                    name="regeneration_attachment"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={busy}
                    className="block w-full text-xs text-foreground file:mr-2 file:inline-flex file:h-8 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:text-xs file:font-medium file:text-foreground"
                  />
                </div>

                <Button
                  type="submit"
                  form={FORM_ID}
                  disabled={busy}
                  size="lg"
                  className="w-full min-h-12 touch-manipulation bg-primary text-primary-foreground shadow-md ring-1 ring-primary/20 transition hover:bg-primary/90 hover:shadow-lg active:scale-[0.99] disabled:opacity-60"
                >
                  {primaryLabel}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || inspectPending}
                  className="w-full touch-manipulation text-xs"
                  onClick={() => {
                    setInspectError(null);
                    setInspectData(null);
                    startInspectTransition(async () => {
                      const r = await inspectBidMockupVertexPayload(buildInspectFormData());
                      if ("error" in r) {
                        setInspectError(r.error);
                        setInspectData(null);
                      } else {
                        setInspectData(r.inspect);
                        setInspectError(null);
                      }
                      setInspectOpen(true);
                    });
                  }}
                >
                  {inspectPending ? "Building inspect…" : "Inspect Vertex payload (prompt + attachments)"}
                </Button>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Read-only: recomputes what the next mockup-only Vertex call would send (signed URLs
                  redacted). Does not generate an image.
                </p>
                {!pending && serverPending ? (
                  <form action={clearAction} className="space-y-2 border-t border-border/60 pt-3">
                    <input type="hidden" name="bid_id" value={bidId} />
                    <p className="text-xs text-muted-foreground">
                      If the spinner never finishes (e.g. closed tab or server timeout), clear the stuck
                      state and try again.
                    </p>
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={clearPending}
                      className="w-full touch-manipulation"
                    >
                      {clearPending ? "Clearing…" : "Clear stuck generation"}
                    </Button>
                    {clearState && "error" in clearState && clearState.error ? (
                      <p className="text-xs text-destructive">{clearState.error}</p>
                    ) : null}
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor={`${FORM_ID}-additional`} className="text-sm font-medium text-foreground">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id={`${FORM_ID}-additional`}
                  form={FORM_ID}
                  name="additional_prompt"
                  placeholder="Scope tweaks, priorities, cost ideas…"
                  rows={3}
                  disabled={busy}
                  className="min-h-[72px] resize-y bg-background text-sm"
                />
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-muted/15 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  form={FORM_ID}
                  name="skip_mockup"
                  value="1"
                  disabled={busy}
                  className="mt-0.5 size-4 shrink-0 rounded border-input"
                />
                <span className="font-medium text-foreground">Estimate only (no image)</span>
              </label>
              <Button type="submit" form={FORM_ID} disabled={busy} variant="secondary">
                {primaryLabel}
              </Button>
            </>
          )}
        </div>

        {children ? <div className="space-y-5">{children}</div> : null}

        {showFooterRegenerate && !mockupOnlyMode ? (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <Button type="submit" form={FORM_ID} disabled={busy} variant="outline" size="sm">
              {busy ? "Working…" : "Regenerate"}
            </Button>
          </div>
        ) : null}
      </div>

      {showBlockingOverlay ? (
        <BidAiLoadingOverlay
          busy
          mockupOnlyMode={mockupOnlyMode}
          scanImageUrl={scanImageUrl}
          bidId={mockupOnlyMode ? bidId : undefined}
          clearStuckFormAction={mockupOnlyMode ? clearAction : undefined}
        />
      ) : null}

      {mockupOnlyMode && inspectOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Vertex mockup payload inspect"
          onClick={() => setInspectOpen(false)}
        >
          <div
            className="flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Vertex mockup inspect</p>
                <p className="text-[11px] text-muted-foreground">
                  Multimodal part order, reference URLs (redacted), and full text blocks.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setInspectOpen(false)}>
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {inspectError ? (
                <p className="text-sm text-destructive">{inspectError}</p>
              ) : inspectData ? (
                <div className="space-y-6 text-xs">
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Run configuration</h3>
                    <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono leading-relaxed">
                      {JSON.stringify(
                        {
                          resolvedMockupImageProvider: inspectData.resolvedMockupImageProvider,
                          preferredMockupImageProvider: inspectData.preferredMockupImageProvider,
                          vertexUpgradedForShelfRefs: inspectData.vertexUpgradedForShelfRefs,
                          vertexModel: inspectData.vertexModel,
                          vertexLocation: inspectData.vertexLocation,
                          vertexGenerationConfig: inspectData.vertexGenerationConfig,
                          omitVertexInlineProductRefs: inspectData.omitVertexInlineProductRefs,
                          weakRoomGeometry: inspectData.weakRoomGeometry,
                          vanityCabinetReplacement: inspectData.vanityCabinetReplacement,
                          imageEditSource: inspectData.imageEditSource,
                          primaryImageUrlRedacted: inspectData.primaryImageUrlRedacted,
                          sourceImage: inspectData.sourceImage,
                          vertexRefFetch: inspectData.vertexRefFetch,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Reference URLs (redacted)</h3>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono leading-relaxed">
                      {JSON.stringify(inspectData.referenceUrlsOrdered, null, 2)}
                    </pre>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Reference images decoded for Vertex
                    </h3>
                    <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono leading-relaxed">
                      {JSON.stringify(inspectData.vertexRefSlots, null, 2)}
                    </pre>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Reference visual summary (text)</h3>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono leading-relaxed">
                      {inspectData.referenceVisualSummary || "(empty)"}
                    </pre>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Quote line context (image-edit block)</h3>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono leading-relaxed">
                      {inspectData.quoteLineContext || "(empty)"}
                    </pre>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Full estimate context</h3>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono leading-relaxed">
                      {inspectData.fullEstimateContext || "(empty)"}
                    </pre>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Multimodal parts (order sent to Vertex; images = byte size only)
                    </h3>
                    <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono leading-relaxed">
                      {JSON.stringify(inspectData.vertexPartsDebug, null, 2)}
                    </pre>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      All text parts joined (task + long prompt + closing)
                    </h3>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
                      {inspectData.allVertexTextPartsJoined}
                    </pre>
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      buildImageEditPrompt output (fed into Vertex text assembly)
                    </h3>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
                      {inspectData.editPrompt}
                    </pre>
                  </section>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
