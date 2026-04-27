"use client";

import { useActionState } from "react";
import { upsertCompany } from "@/lib/actions/company";
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

type CompanyRow = {
  name: string;
  tagline: string | null;
  brand_color: string | null;
};

export function CompanyForm({ company }: { company: CompanyRow | null }) {
  const [state, formAction, pending] = useActionState(upsertCompany, undefined);

  return (
    <Card className="max-w-xl border-border/80">
      <CardHeader>
        <CardTitle>Company profile</CardTitle>
        <CardDescription>
          Shown on every public project page—name, tagline, and accent color.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state && "error" in state && state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state && "success" in state && state.success ? (
            <p className="text-sm text-muted-foreground">Saved.</p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="name">Business name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={company?.name ?? "Artisan Field Co."}
              placeholder="Artisan Field Co."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline (optional)</Label>
            <Textarea
              id="tagline"
              name="tagline"
              rows={2}
              defaultValue={company?.tagline ?? "Craftsman remodels & additions"}
              placeholder="Short line under your name on client pages."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand_color">Brand accent</Label>
            <Input
              id="brand_color"
              name="brand_color"
              type="color"
              className="h-10 w-24 cursor-pointer p-1"
              defaultValue={company?.brand_color ?? "#0f172a"}
            />
            <p className="text-xs text-muted-foreground">
              Used for progress bar and accents on the client-facing page.
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save company"}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
