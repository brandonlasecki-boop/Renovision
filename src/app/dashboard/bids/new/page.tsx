import Link from "next/link";
import { NewBidForm } from "@/components/dashboard/new-bid-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

export default async function NewEstimatePage() {
  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/bids"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-4 inline-flex")}
        >
          <ArrowLeft className="mr-1 size-4" />
          Estimates
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New estimate</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Type or dictate what you want, then add <strong className="font-medium text-foreground">at least one</strong>{" "}
          photo from your library or camera (walkthrough mode narrates while you shoot). Room sizes are optional.
          Your contact info and site address come next.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Start the remodel</CardTitle>
          <CardDescription>
            Describe (text or dictation), optional room sizes, then one or more photos—library, quick camera, or
            walkthrough camera with live narration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewBidForm />
        </CardContent>
      </Card>
    </div>
  );
}
