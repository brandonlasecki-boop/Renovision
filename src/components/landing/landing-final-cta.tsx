import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingFinalCta() {
  return (
    <section className="bg-gradient-to-b from-renovision-navy-muted/60 to-background px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Plan Smarter Before You Remodel
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          See your space in a new light—then decide what happens next.
        </p>
        <div className="mt-10">
          <Link
            href="/try"
            className={cn(buttonVariants({ size: "lg" }), "h-11 px-8 text-base")}
          >
            Try Renovision Free
          </Link>
        </div>
      </div>
    </section>
  );
}
