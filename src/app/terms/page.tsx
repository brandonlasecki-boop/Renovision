import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          ← Back
        </Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Terms</h1>
        <p className="mt-4 text-muted-foreground">
          We&apos;re preparing our terms of service. For questions, use{" "}
          <a
            className="font-medium text-renovision-navy underline-offset-4 hover:underline"
            href="mailto:legal@renovision.com"
          >
            legal@renovision.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
