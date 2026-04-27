"use client";

import { useActionState } from "react";
import { createProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProject, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      {state?.error ? (
        <p className="w-full text-sm text-destructive sm:order-last">{state.error}</p>
      ) : null}
      <div className="flex-1 space-y-2">
        <Label htmlFor="title">New project</Label>
        <Input
          id="title"
          name="title"
          placeholder="Kitchen renovation — Oak St."
          required
        />
      </div>
      <Button type="submit" disabled={pending} className="shrink-0">
        {pending ? "Creating…" : "Create"}
      </Button>
    </form>
  );
}
