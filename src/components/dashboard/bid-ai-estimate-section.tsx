"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Bid, BidLineTemplate, BidMaterialLine, BidPhotoWithUrl } from "@/types/bid";
import { BidBeforeUpload } from "@/components/dashboard/bid-before-upload";
import { BidGenerateButton } from "@/components/dashboard/bid-generate-button";
import { BidQuoteEditor } from "@/components/dashboard/bid-quote-editor";
import { BidPhotoGrid } from "@/components/dashboard/bid-photo-grid";
import { MockupBeforeAfterSlider } from "@/components/dashboard/mockup-before-after-slider";
import {
  mockupVersionLabel,
  sortMockupsByVersionAsc,
} from "@/lib/bid-mockup-utils";
import { BID_AI_GENERATE_FORM_ID } from "@/lib/bid-ai-generate-form-id";

export function BidAiEstimateSection({
  bid,
  materials,
  lineReferenceUrls,
  lineTemplates,
  beforePhotos,
  mockupPhotos,
}: {
  bid: Bid;
  materials: BidMaterialLine[];
  lineReferenceUrls: Record<string, string>;
  lineTemplates: BidLineTemplate[];
  beforePhotos: BidPhotoWithUrl[];
  mockupPhotos: BidPhotoWithUrl[];
}) {
  const router = useRouter();
  const liveMaterialSnapshotRef = useRef("");

  const sortedMockups = useMemo(
    () => sortMockupsByVersionAsc(mockupPhotos),
    [mockupPhotos],
  );
  const [compareMockupId, setCompareMockupId] = useState("");

  useEffect(() => {
    if (sortedMockups.length === 0) {
      setCompareMockupId("");
      return;
    }
    const latest = sortedMockups[sortedMockups.length - 1]!.id;
    setCompareMockupId((prev) =>
      prev && sortedMockups.some((p) => p.id === prev) ? prev : latest,
    );
  }, [sortedMockups]);

  const comparePhoto =
    sortedMockups.find((p) => p.id === compareMockupId) ??
    sortedMockups[sortedMockups.length - 1] ??
    null;

  const [roomPreviewOpen, setRoomPreviewOpen] = useState(false);
  const primaryBefore = beforePhotos[0];

  return (
    <div className="space-y-6">
      {bid.ai_last_error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {bid.ai_last_error}
        </p>
      ) : null}
      {bid.ai_summary ? (
        <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm leading-relaxed">
          {bid.ai_summary}
        </div>
      ) : null}

      <div className="rounded-xl border border-border/60 bg-muted/15 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room photo</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Mockups use your jobsite picture as the base (same order as when you uploaded). New renders default
          to this room photo; you can switch to a previous mockup on the card below. Tap to enlarge; add or
          replace photos anytime.
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {primaryBefore ? (
            <button
              type="button"
              className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-muted shadow-sm ring-offset-background transition hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setRoomPreviewOpen(true)}
              aria-label="View room photo larger"
            >
              <Image
                src={primaryBefore.signedUrl}
                alt=""
                fill
                className="object-cover"
                sizes="112px"
                unoptimized
              />
            </button>
          ) : (
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-[11px] text-muted-foreground">
              No photo
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <BidBeforeUpload bidId={bid.id} onUploaded={() => router.refresh()} />
          </div>
        </div>
      </div>

      {roomPreviewOpen && primaryBefore ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Room photo"
          onClick={() => setRoomPreviewOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 rounded-full border border-white/20 bg-background/95 px-3 py-1.5 text-sm text-foreground shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              setRoomPreviewOpen(false);
            }}
          >
            Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- lightbox */}
          <img
            src={primaryBefore.signedUrl}
            alt=""
            className="max-h-[min(92vh,100%)] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      <BidGenerateButton
        bidId={bid.id}
        aiStatus={bid.ai_status}
        mockupOnlyMode
        materialEstimateSnapshotRef={liveMaterialSnapshotRef}
        mockupPhotosForRefine={mockupPhotos}
        scanImageUrl={beforePhotos[0]?.signedUrl ?? null}
        hasAnyMockupRender={mockupPhotos.length > 0}
        showFooterRegenerate={
          bid.ai_status === "complete" ||
          bid.ai_status === "failed" ||
          materials.length > 0 ||
          mockupPhotos.length > 0
        }
      >
        {beforePhotos[0]?.signedUrl && comparePhoto ? (
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/15 p-3">
            {sortedMockups.length > 1 ? (
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <label
                  htmlFor={`mockup-compare-${bid.id}`}
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Compare
                </label>
                <select
                  id={`mockup-compare-${bid.id}`}
                  value={compareMockupId}
                  onChange={(e) => setCompareMockupId(e.target.value)}
                  className="flex h-9 w-full min-w-[8rem] max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm"
                  aria-label="Which mockup version to compare with the room photo"
                >
                  {sortedMockups.map((p) => (
                    <option key={p.id} value={p.id}>
                      {mockupVersionLabel(p)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Before / after
              </p>
            )}
            <MockupBeforeAfterSlider
              beforeUrl={beforePhotos[0].signedUrl}
              afterUrl={comparePhoto.signedUrl}
              beforeLabel="Room"
              afterLabel={`Mockup ${mockupVersionLabel(comparePhoto)}`}
              wide
            />
          </div>
        ) : null}

        {mockupPhotos.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Saved versions
            </h3>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              For planning only — confirm materials, code, and site conditions before you bid. Each
              mockup caption ends with a plain-English line about whether your shelf or contractor
              product images were sent to the renderer (and how many).
            </p>
            <BidPhotoGrid
              bidId={bid.id}
              photos={mockupPhotos}
              allowDeleteKinds={["after_mockup"]}
              downloadableKinds={["after_mockup"]}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quote & references
          </h3>
          <BidQuoteEditor
            key={bid.id}
            bidId={bid.id}
            initialLines={materials}
            lineReferenceUrls={lineReferenceUrls}
            initialLineTemplates={lineTemplates}
            linesSnapshotOutRef={liveMaterialSnapshotRef}
            mockupRefPreview
            materialSnapshotFormId={BID_AI_GENERATE_FORM_ID}
          />
        </div>
      </BidGenerateButton>
    </div>
  );
}
