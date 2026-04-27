"use client";

import { useActionState } from "react";
import { createProjectUpdate } from "@/lib/actions/updates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ProjectUpdateForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createProjectUpdate, undefined);

  return (
    <Card className="border-border/80">
      <CardHeader>
        <CardTitle className="text-lg">Post an update</CardTitle>
        <CardDescription>
          Clients see the latest note, next step, and progress on their page.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <input type="hidden" name="project_id" value={projectId} />
        <CardContent className="space-y-4">
          {state && "error" in state && state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state && "success" in state && state.success ? (
            <p className="text-sm text-muted-foreground">Update posted.</p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Cabinets installed"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              name="note"
              rows={3}
              placeholder="What happened on site today?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="next_step">Next step</Label>
            <Input
              id="next_step"
              name="next_step"
              placeholder="e.g. Countertop template"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="progress_percent">Progress (%)</Label>
            <Input
              id="progress_percent"
              name="progress_percent"
              type="number"
              min={0}
              max={100}
              defaultValue={0}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Posting…" : "Publish update"}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
