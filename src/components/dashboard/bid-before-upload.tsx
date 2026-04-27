"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadBidBeforePhoto } from "@/lib/actions/bids";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function BidBeforeUpload({
  bidId,
  onUploaded,
}: {
  bidId: string;
  /** Called after a successful upload (e.g. refresh client tree for walkthrough). */
  onUploaded?: () => void;
}) {
  const [state, formAction, pending] = useActionState(uploadBidBeforePhoto, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state && state.success) {
      formRef.current?.reset();
      onUploaded?.();
    }
  }, [state, onUploaded]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="bid_id" value={bidId} />
      {state && "error" in state && state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state && "success" in state && state.success ? (
        <p className="text-sm text-muted-foreground">Photo added.</p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={`before-${bidId}`}>Upload</Label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id={`before-${bidId}`}
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Uploading…" : "Add"}
          </Button>
        </div>
      </div>
    </form>
  );
}
