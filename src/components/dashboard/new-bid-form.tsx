"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { createBidQuickStart, type CreateBidQuickStartState } from "@/lib/actions/bids";
import { applyRoomMeasurementPatch, ROOM_MEASUREMENTS_AI_DISCLAIMER } from "@/lib/bid-scope";
import type { RoomMeasurementRow } from "@/types/bid";
import { useDictation } from "@/hooks/use-dictation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Mic,
  MicOff,
  Plus,
  Ruler,
  Trash2,
  X,
} from "lucide-react";

function newRoom(): RoomMeasurementRow {
  return {
    id: crypto.randomUUID(),
    label: "",
    length_ft: 0,
    width_ft: 0,
    ceiling_ft: 8,
  };
}

export function NewBidForm() {
  const postCreateNavRef = useRef(false);
  const [state, formAction, pending] = useActionState<
    CreateBidQuickStartState,
    FormData
  >(createBidQuickStart, undefined);
  const [scopeDescription, setScopeDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomMeasurementRow[]>([newRoom()]);
  const [showRoomScan, setShowRoomScan] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<"none" | "walkthrough" | "quick">("none");

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const pendingPhotosRef = useRef<HTMLDivElement>(null);
  const prevPhotoCountRef = useRef(0);

  useEffect(() => {
    if (!state || postCreateNavRef.current) return;
    if (
      typeof state === "object" &&
      "success" in state &&
      state.success === true &&
      typeof state.bidId === "string" &&
      state.bidId.length > 0
    ) {
      postCreateNavRef.current = true;
      // Full document navigation avoids Next RSC/router cache racing the row insert.
      window.location.assign(`/dashboard/bids/${state.bidId}/setup`);
    }
  }, [state]);

  const appendToScope = useCallback((phrase: string) => {
    setScopeDescription((prev) => (prev ? `${prev} ${phrase}` : phrase));
  }, []);

  const { listening, supported, start: startDictation, stop: stopDictation } =
    useDictation(appendToScope);

  const roomJson = useMemo(
    () =>
      JSON.stringify(
        rooms.filter(
          (r) => r.label.trim() || r.length_ft || r.width_ft || r.needs_user_measurements === true,
        ),
      ),
    [rooms],
  );

  const previewUrls = useMemo(
    () => pendingFiles.map((f) => URL.createObjectURL(f)),
    [pendingFiles],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [previewUrls]);

  useEffect(() => {
    const n = pendingFiles.length;
    if (n > prevPhotoCountRef.current && n > 0) {
      window.setTimeout(() => {
        pendingPhotosRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
    prevPhotoCountRef.current = n;
  }, [pendingFiles.length]);

  function updateRoom(i: number, patch: Partial<RoomMeasurementRow>) {
    setRooms((prev) => {
      const next = [...prev];
      next[i] = applyRoomMeasurementPatch(next[i], patch);
      return next;
    });
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, j) => j !== index));
  }

  function openPhotoSheet() {
    setPhotoSheetOpen(true);
  }


  function startWalkthroughCapture() {
    setPhotoSheetOpen(false);
    setCaptureMode("walkthrough");
    startDictation();
  }

  function startQuickCapture() {
    setPhotoSheetOpen(false);
    stopDictation();
    setCaptureMode("quick");
  }

  function finishCaptureSession() {
    if (captureMode === "walkthrough") {
      stopDictation();
    }
    setCaptureMode("none");
  }

  /** Returns how many non-empty image files were added. */
  function addFilesFromList(list: FileList | null): number {
    if (!list?.length) return 0;
    const files = Array.from(list).filter((f) => f.size > 0);
    if (!files.length) return 0;
    setPendingFiles((prev) => [...prev, ...files]);
    return files.length;
  }

  function onLibraryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    const added = addFilesFromList(list);
    e.target.value = "";
    if (added > 0) {
      setPhotoSheetOpen(false);
      toast.success(`${added} photo${added === 1 ? "" : "s"} added`, {
        description: "Preview below. They upload when you create the estimate.",
      });
    } else if (list && list.length > 0) {
      toast.error("Could not read those files. Try again or use a different image.");
    }
  }

  function onCaptureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || f.size === 0) return;
    setPendingFiles((prev) => [...prev, f]);
    toast.success("Photo added", {
      description: "Preview below with your other photos.",
    });
  }

  function triggerCameraShot() {
    captureInputRef.current?.click();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = scopeDescription.trim();
    if (!trimmed) {
      setFormError("Describe what you want—type, tap Dictate, or use Walkthrough narration while taking photos.");
      return;
    }
    if (pendingFiles.length === 0) {
      setFormError("Add at least one photo of the room (library or camera) before continuing.");
      return;
    }
    setFormError(null);
    const fd = new FormData();
    fd.set("scope_description", trimmed);
    fd.set("room_measurements_json", roomJson);
    for (const f of pendingFiles) {
      fd.append("before_photos", f);
    }
    startTransition(() => {
      formAction(fd);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {state && "error" in state && state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="scope_description" className="text-base font-semibold">
            What do you want for this remodel?
          </Label>
          {supported ? (
            <Button
              type="button"
              variant={listening ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => (listening ? stopDictation() : startDictation())}
            >
              {listening ? (
                <>
                  <MicOff className="size-4" />
                  Stop dictation
                </>
              ) : (
                <>
                  <Mic className="size-4" />
                  Dictate
                </>
              )}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Dictation needs Chrome or Edge.</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Type freely, or tap <strong className="text-foreground">Dictate</strong> to speak. In walkthrough
          mode, narration is added here as you take pictures.
        </p>
        <Textarea
          id="scope_description"
          value={scopeDescription}
          onChange={(e) => setScopeDescription(e.target.value)}
          rows={6}
          placeholder="What do you want to change—style, layout, fixtures, finishes? Anything about the room we should know?"
          className="min-h-[160px] resize-y bg-background text-base"
        />
        {listening ? (
          <p className="text-xs font-medium text-primary">Listening… speak naturally.</p>
        ) : null}
      </div>

      <input
        id="new-bid-library-photos"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={onLibraryChange}
        aria-label="Choose photos from your library"
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={onCaptureChange}
      />

      {captureMode !== "none" ? (
        <div
          className={cn(
            "rounded-xl border p-4",
            captureMode === "walkthrough"
              ? "border-primary/50 bg-primary/5"
              : "border-border bg-muted/30",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {captureMode === "walkthrough" ? "Walkthrough camera" : "Quick camera"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {captureMode === "walkthrough"
                  ? "Narration is added to the description above. Tap Add shot for each photo."
                  : "Add one or more photos from the camera. No narration."}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={finishCaptureSession}>
              Done
            </Button>
          </div>
          {captureMode === "walkthrough" && listening ? (
            <p className="mt-2 text-xs font-medium text-primary">Recording narration…</p>
          ) : null}
          <Button
            type="button"
            className="mt-4 w-full gap-2 sm:w-auto"
            variant="secondary"
            onClick={triggerCameraShot}
          >
            <Camera className="size-5" />
            Add camera shot
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full justify-center gap-2 sm:w-auto sm:min-w-[10rem]"
          onClick={() => setShowRoomScan((v) => !v)}
        >
          <Ruler className="size-5" aria-hidden />
          Room scan
        </Button>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full justify-center gap-2 sm:w-auto sm:min-w-[10rem]"
          onClick={openPhotoSheet}
        >
          <ImagePlus className="size-5" aria-hidden />
          Photos
          {pendingFiles.length > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
              {pendingFiles.length}
            </span>
          ) : null}
        </Button>

      </div>

      {pendingFiles.length > 0 ? (
        <div
          ref={pendingPhotosRef}
          className="rounded-xl border-2 border-emerald-500/35 bg-emerald-500/[0.06] p-4 shadow-sm dark:border-emerald-500/25 dark:bg-emerald-950/30"
          role="status"
          aria-live="polite"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {pendingFiles.length} photo{pendingFiles.length === 1 ? "" : "s"} attached to this estimate
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            They&apos;ll upload when you tap <strong className="text-foreground">Create estimate &amp; continue</strong>
            — remove any you don&apos;t want.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <div key={`${i}-${f.lastModified}-${f.size}`} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */}
                <img
                  src={previewUrls[i]}
                  alt=""
                  className="size-20 rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-background text-destructive shadow-sm"
                  aria-label="Remove photo"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">At least one photo</strong> is required.{" "}
        <strong className="text-foreground">Room sizes</strong> are optional—after you create this estimate, we can
        prefill them from your photos on the next screen when you have not typed measurements here.
      </p>

      {showRoomScan ? (
        <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium">Room measurements (feet)</p>
          <p className="text-xs text-amber-950/90 dark:text-amber-100/85">{ROOM_MEASUREMENTS_AI_DISCLAIMER}</p>
          <div className="space-y-4">
            {rooms.map((r, i) => (
              <div key={r.id} className="space-y-3 rounded-lg border border-border/80 bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">
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
                  placeholder="Label (e.g. Main bath)"
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
                    Add length and width when you have measurements (not estimated from photos).
                  </p>
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
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        disabled={pending || pendingFiles.length === 0}
      >
        {pending ? "Creating…" : "Create estimate & continue"}
      </Button>

      {photoSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setPhotoSheetOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-background p-4 shadow-lg sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Add photos</p>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setPhotoSheetOpen(false)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="new-bid-library-photos"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  // Base button uses whitespace-nowrap + fixed heights — override so two lines fit and the
                  // whole row stays the file input’s hit target (clicks on subtitle must hit the label).
                  "h-auto min-h-12 w-full cursor-pointer flex-wrap items-start justify-start gap-3 whitespace-normal py-3 text-left font-normal",
                )}
              >
                <ImagePlus className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block font-medium text-foreground">Choose from library</span>
                  <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground">
                    Select one or more existing photos (opens your gallery in the same tap)
                  </span>
                </span>
              </label>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-12 justify-start gap-3 py-3"
                onClick={startWalkthroughCapture}
              >
                <Mic className="size-5 shrink-0" />
                <span className="text-left">
                  <span className="block font-medium">Take photos — walkthrough</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Narration records as you shoot; it fills your description
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-12 justify-start gap-3 py-3"
                onClick={startQuickCapture}
              >
                <Camera className="size-5 shrink-0" />
                <span className="text-left">
                  <span className="block font-medium">Take photos — quick</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Camera only, no narration
                  </span>
                </span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
