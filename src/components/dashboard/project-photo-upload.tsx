"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadProjectPhoto } from "@/lib/actions/photos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ProjectPhotoUpload({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(uploadProjectPhoto, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state && state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      {state && "error" in state && state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state && "success" in state && state.success ? (
        <p className="text-sm text-muted-foreground">Photo added.</p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="file">Upload photo</Label>
        <div className="flex flex-wrap items-center gap-3">
          <InputFile />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG, or WebP.</p>
      </div>
    </form>
  );
}

function InputFile() {
  return (
    <input
      id="file"
      name="file"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
    />
  );
}
