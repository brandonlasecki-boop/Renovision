"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function BidCollapsibleSection({
  title,
  description,
  children,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  summaryWhenCollapsed,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Shown under the title when collapsed (e.g. one-line summary). */
  summaryWhenCollapsed?: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;

  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (!controlled) setInternalOpen(next);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/30"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {open && description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
          {!open && summaryWhenCollapsed ? (
            <div className="mt-1 text-sm text-muted-foreground">{summaryWhenCollapsed}</div>
          ) : null}
        </div>
      </button>
      {open ? <div className="border-t border-border px-4 pb-4 pt-1">{children}</div> : null}
    </div>
  );
}
