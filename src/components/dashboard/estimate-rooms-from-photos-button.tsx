"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { estimateRoomMeasurementsFromPhotosAction } from "@/lib/actions/bids";
import type { RoomMeasurementRow } from "@/types/bid";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function EstimateRoomsFromPhotosButton({
  bidId,
  disabled,
  className,
  /** Apply returned rows immediately so the UI updates even if RSC refresh lags (common in dev). */
  onRoomsApplied,
}: {
  bidId: string;
  /** e.g. no before photos yet */
  disabled?: boolean;
  className?: string;
  onRoomsApplied?: (rooms: RoomMeasurementRow[]) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className}
      disabled={disabled || pending}
      onClick={() => {
        startTransition(async () => {
          const res = await estimateRoomMeasurementsFromPhotosAction(bidId);
          if ("error" in res) {
            toast.error(res.error);
            return;
          }
          onRoomsApplied?.(res.rooms.map((r) => ({ ...r })));
          router.refresh();
          const hint = res.analysisSummary
            ? res.analysisSummary.slice(0, 220) + (res.analysisSummary.length > 220 ? "…" : "")
            : `Filled ${res.rooms.length} row${res.rooms.length === 1 ? "" : "s"} — please verify with a tape measure.`;
          toast.success("Measurements updated from your photos", { description: hint });
        });
      }}
    >
      <Sparkles className="mr-1.5 size-4 shrink-0" aria-hidden />
      {pending ? "Analyzing photos…" : "Estimate sizes from photos"}
    </Button>
  );
}
