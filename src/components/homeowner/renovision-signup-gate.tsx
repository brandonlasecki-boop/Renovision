"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RenovisionSignupGate({
  open,
  onClose,
  nextPath,
}: {
  open: boolean;
  onClose: () => void;
  /** Post-auth return path (e.g. /try). */
  nextPath: string;
}) {
  if (!open) return null;

  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(12,39,68,0.45)] p-4 backdrop-blur-[10px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rv-signup-gate-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-white/20",
          "bg-card shadow-[0_28px_90px_-20px_rgba(12,39,68,0.45),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
        )}
      >
        <button
          type="button"
          className="absolute right-3.5 top-3.5 z-10 rounded-full p-2 text-muted-foreground transition hover:bg-background/80 hover:text-foreground"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <div className="relative px-8 pb-2 pt-10 sm:px-10 sm:pt-12">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-renovision-orange/[0.12] via-transparent to-transparent"
            aria-hidden
          />
          <p className="relative text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-renovision-orange">
            Renovision
          </p>
          <h2
            id="rv-signup-gate-title"
            className="relative mt-4 text-balance text-center text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-[1.65rem]"
          >
            Keep exploring your remodel
          </h2>
          <p className="relative mx-auto mt-4 max-w-[340px] text-center text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
            Create a free Renovision account to unlock 5 more free previews and save your project.
          </p>
        </div>

        <div className="flex flex-col gap-3 px-8 pb-9 pt-6 sm:flex-row-reverse sm:justify-center sm:gap-3 sm:px-10 sm:pb-10">
          <Link
            href={signupHref}
            className={buttonVariants({
              size: "lg",
              className:
                "h-11 w-full rounded-xl text-[15px] font-semibold shadow-md shadow-renovision-navy/10 transition hover:shadow-lg sm:min-w-[160px]",
            })}
          >
            Sign Up Free
          </Link>
          <Link
            href={loginHref}
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className:
                "h-11 w-full rounded-xl border-border/80 bg-background/50 text-[15px] font-semibold backdrop-blur-sm hover:bg-muted/60 sm:min-w-[140px]",
            })}
          >
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}
