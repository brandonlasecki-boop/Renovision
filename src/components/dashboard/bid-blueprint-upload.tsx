"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { deleteBidBlueprint, uploadBidBlueprint } from "@/lib/actions/bids";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";

export function BidBlueprintUpload({
  bidId,
  signedUrl,
}: {
  bidId: string;
  signedUrl: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [upState, upAction, upPending] = useActionState(uploadBidBlueprint, undefined);
  const [delState, delAction, delPending] = useActionState(deleteBidBlueprint, undefined);

  useEffect(() => {
    if (upState && "success" in upState && upState.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [upState, router]);

  useEffect(() => {
    if (delState && "success" in delState && delState.success) {
      router.refresh();
    }
  }, [delState, router]);

  return (
    <div className="space-y-3">
      <Label htmlFor={`bp-${bidId}`}>Plan</Label>
      <p className="text-xs text-muted-foreground">PDF or image · max 25 MB</p>
      {upState && "error" in upState && upState.error ? (
        <p className="text-sm text-destructive">{upState.error}</p>
      ) : null}
      {delState && "error" in delState && delState.error ? (
        <p className="text-sm text-destructive">{delState.error}</p>
      ) : null}
      {signedUrl ? (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <FileText className="size-4" />
            View current blueprint
          </a>
          <form action={delAction}>
            <input type="hidden" name="bid_id" value={bidId} />
            <Button type="submit" variant="outline" size="sm" disabled={delPending}>
              {delPending ? "Removing…" : "Remove"}
            </Button>
          </form>
        </div>
      ) : null}
      <form ref={formRef} action={upAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="bid_id" value={bidId} />
        <input
          id={`bp-${bidId}`}
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <Button type="submit" size="sm" disabled={upPending}>
          {upPending ? "Uploading…" : signedUrl ? "Replace" : "Upload"}
        </Button>
      </form>
    </div>
  );
}
