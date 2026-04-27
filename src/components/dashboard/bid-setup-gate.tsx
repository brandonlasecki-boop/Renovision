"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveBidRoomMeasurementsOnly } from "@/lib/actions/bids";
import { applyRoomMeasurementPatch, ROOM_MEASUREMENTS_AI_DISCLAIMER } from "@/lib/bid-scope";
import type { Bid, BidPhotoWithUrl, RoomMeasurementRow } from "@/types/bid";
import { BidBeforeUpload } from "@/components/dashboard/bid-before-upload";
import { BidPhotoGrid } from "@/components/dashboard/bid-photo-grid";
import { EstimateRoomsFromPhotosButton } from "@/components/dashboard/estimate-rooms-from-photos-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Plus, Trash2 } from "lucide-react";

function newRoom(): RoomMeasurementRow {
  return {
    id: crypto.randomUUID(),
    label: "",
    length_ft: 0,
    width_ft: 0,
    ceiling_ft: 8,
  };
}

export function BidSetupGate({
  bid,
  beforePhotos,
}: {
  bid: Bid;
  beforePhotos: BidPhotoWithUrl[];
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomMeasurementRow[]>(
    bid.room_measurements?.length ? bid.room_measurements : [newRoom()],
  );
  const [roomMsg, setRoomMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasRooms = useMemo(
    () =>
      rooms.some(
        (r) =>
          r.label.trim() ||
          r.length_ft > 0 ||
          r.width_ft > 0 ||
          r.needs_user_measurements === true,
      ),
    [rooms],
  );
  const hasPhotos = beforePhotos.length > 0;

  const roomsFromServerRef = useRef("");
  useEffect(() => {
    const s = JSON.stringify(bid.room_measurements ?? []);
    if (s === roomsFromServerRef.current) return;
    roomsFromServerRef.current = s;
    setRooms(bid.room_measurements?.length ? bid.room_measurements.map((x) => ({ ...x })) : [newRoom()]);
  }, [bid.room_measurements]);

  function updateRoom(i: number, patch: Partial<RoomMeasurementRow>) {
    setRooms((prev) => {
      const next = [...prev];
      next[i] = applyRoomMeasurementPatch(next[i], patch);
      return next;
    });
  }

  const saveRooms = useCallback(() => {
    setRoomMsg(null);
    const payload = rooms.filter(
      (r) => r.label.trim() || r.length_ft || r.width_ft || r.needs_user_measurements === true,
    );
    startTransition(async () => {
      const res = await saveBidRoomMeasurementsOnly(bid.id, payload);
      if ("error" in res) {
        setRoomMsg(res.error);
        return;
      }
      setRoomMsg("Saved.");
      router.refresh();
    });
  }, [bid.id, rooms, router]);

  return (
    <div className="mx-auto max-w-lg space-y-8 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">Site &amp; photos</h1>

      <div className="flex flex-wrap gap-2 text-xs">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 font-medium",
            hasPhotos ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100" : "border-border bg-muted/40",
          )}
        >
          Photos {hasPhotos ? "· " + beforePhotos.length : ""}
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 font-medium",
            hasRooms ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100" : "border-border bg-muted/40",
          )}
        >
          Measurements
        </span>
      </div>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Before photos</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Add clear photos of the space. You need at least one before photo to continue—photos feed AI questions,
          scope, pricing, and mockups.
        </p>
        <div className="mt-4">
          <BidBeforeUpload bidId={bid.id} onUploaded={() => router.refresh()} />
        </div>
        {beforePhotos.length > 0 ? (
          <div className="mt-6 space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">On file</h3>
            <BidPhotoGrid
              bidId={bid.id}
              photos={beforePhotos}
              allowDeleteKinds={["before"]}
              downloadableKinds={["before"]}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No photos yet — upload above.</p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Rooms</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Feet (optional). Sizes are prefilled automatically from your before photos when you have not
              entered anything yet; use the button below to re-run after adding photos.
            </p>
            <p className="text-xs text-amber-950/90 dark:text-amber-100/85">{ROOM_MEASUREMENTS_AI_DISCLAIMER}</p>
          </div>
          <EstimateRoomsFromPhotosButton
            bidId={bid.id}
            disabled={!hasPhotos}
            className="shrink-0"
            onRoomsApplied={(next) => {
              roomsFromServerRef.current = JSON.stringify(next);
              setRooms(next.map((r) => ({ ...r })));
            }}
          />
        </div>
        <div className="space-y-4">
          {rooms.map((r, i) => (
            <div key={r.id} className="space-y-2 rounded-xl border border-border/80 bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {r.label.trim() ? r.label : `Measurement ${i + 1}`}
                </span>
                {rooms.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive"
                    onClick={() => setRooms((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
              <Input
                placeholder="Label"
                value={r.label}
                onChange={(e) => updateRoom(i, { label: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Length</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={r.length_ft || ""}
                    onChange={(e) =>
                      updateRoom(i, { length_ft: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Width</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={r.width_ft || ""}
                    onChange={(e) =>
                      updateRoom(i, { width_ft: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Ceiling</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={r.ceiling_ft ?? ""}
                    onChange={(e) =>
                      updateRoom(i, {
                        ceiling_ft:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value) || undefined,
                      })
                    }
                  />
                </div>
              </div>
              {r.needs_user_measurements ? (
                <p className="text-[11px] font-medium text-amber-900 dark:text-amber-100/90">
                  Add length and width above when you have measurements (not estimated from photos).
                </p>
              ) : null}
              {r.notes?.trim() ? (
                <p className="text-[11px] leading-snug text-muted-foreground">{r.notes.trim()}</p>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRooms((p) => [...p, newRoom()])}
          >
            <Plus className="mr-1 size-4" />
            Add room
          </Button>
        </div>
        {roomMsg ? <p className="text-xs text-muted-foreground">{roomMsg}</p> : null}
        <Button type="button" size="sm" disabled={pending} onClick={saveRooms}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </section>

      <div className="space-y-3">
        {!hasPhotos ? (
          <p className="text-center text-sm text-amber-900 dark:text-amber-100 sm:text-left">
            Add at least one photo to continue to additional info.
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/dashboard/bids/${bid.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center sm:w-auto")}
          >
            Overview
          </Link>
          {hasPhotos ? (
            <Link
              href={`/dashboard/bids/${bid.id}/setup/questions`}
              className={cn(buttonVariants(), "inline-flex w-full justify-center gap-2 sm:w-auto")}
            >
              Continue to additional info
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Button type="button" disabled className="w-full sm:w-auto">
              Continue to additional info
              <ArrowRight className="ml-2 size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
