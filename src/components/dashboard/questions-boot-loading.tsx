"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PHASES = [
  { title: "Reading your scope", detail: "Scope, room sizes, and walkthrough notes" },
  { title: "Reviewing site context", detail: "Site photos when available" },
  { title: "Drafting additional info", detail: "Clarifying options for this job" },
  { title: "Polishing wording", detail: "Clear, answerable multiple choice" },
] as const;

export function QuestionsBootLoading() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % PHASES.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  const active = PHASES[phase];

  return (
    <div
      className="mx-auto flex min-h-[46vh] max-w-md flex-col items-center justify-center gap-8 px-4 py-14"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative size-[4.5rem]">
        <div
          className="absolute inset-0 rounded-full border-2 border-muted border-t-primary motion-safe:animate-spin"
          style={{ animationDuration: "0.95s" }}
        />
        <div className="absolute inset-[11px] rounded-full bg-primary/[0.06]" />
        <div className="absolute inset-[18px] rounded-full border border-primary/10" />
      </div>

      <div className="w-full space-y-3 text-center">
        <p className="text-sm font-semibold tracking-tight text-foreground">{active.title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{active.detail}</p>
      </div>

      <div className="flex w-full max-w-[280px] gap-1.5" aria-hidden>
        {PHASES.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-500",
              i === phase ? "bg-primary" : "bg-muted-foreground/20",
            )}
          />
        ))}
      </div>

      <div className="relative h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 w-[38%] rounded-full bg-gradient-to-r from-primary/25 via-primary/80 to-primary/25 motion-safe:animate-questions-shimmer" />
      </div>

      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80">
        Additional info
      </p>
    </div>
  );
}
