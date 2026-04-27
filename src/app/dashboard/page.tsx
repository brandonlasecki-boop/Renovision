import Link from "next/link";
import { getBidsForUser } from "@/lib/data/bids";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, ClipboardList } from "lucide-react";

export default async function DashboardHomePage() {
  const bids = await getBidsForUser();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Everything runs through <strong className="font-medium text-foreground">estimates</strong>—the full flow
          from scope through photos, walkthrough, AI materials, pricing, and mockups. The optional &quot;try&quot;
          preview on the marketing site is only for quick homeowner exploration; it does not replace this process.
        </p>
      </div>

      <Card className="max-w-xl border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="size-5 opacity-80" />
            Estimates
          </CardTitle>
          <CardDescription>
            {bids.length
              ? `${bids.length} estimate${bids.length === 1 ? "" : "s"} — same end-to-end workflow as before.`
              : "Start a new estimate: describe the space, then add customer & site details, photos, AI, and mockups."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard/bids"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            {bids.length ? "View estimates" : "Start an estimate"}
            <ArrowRight className="ml-1 size-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
