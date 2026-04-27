"use client";

import type { BidPhotoWithUrl } from "@/types/bid";
import { BidBeforeUpload } from "@/components/dashboard/bid-before-upload";
import { BidCollapsibleSection } from "@/components/dashboard/bid-collapsible-section";
import { BidPhotoGrid } from "@/components/dashboard/bid-photo-grid";

export function BidBeforePhotosSection({
  bidId,
  photos,
}: {
  bidId: string;
  photos: BidPhotoWithUrl[];
}) {
  const hasPhotos = photos.length > 0;

  return (
    <BidCollapsibleSection
      title="Before photos"
      description="Document current conditions. AI uses these plus your scope for materials and mockups; when room measurements are still empty, we also auto-estimate sizes from new uploads (approximate—verify on site)."
      defaultOpen={!hasPhotos}
      summaryWhenCollapsed={
        hasPhotos ? (
          <span>
            {photos.length} photo{photos.length === 1 ? "" : "s"} uploaded · expand to manage
          </span>
        ) : (
          <span>Upload photos of the existing space</span>
        )
      }
    >
      <div className="space-y-8">
        <BidBeforeUpload bidId={bidId} />
        <BidPhotoGrid bidId={bidId} photos={photos} allowDeleteKinds={["before"]} />
      </div>
    </BidCollapsibleSection>
  );
}
