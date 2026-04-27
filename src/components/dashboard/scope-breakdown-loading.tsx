"use client";

export function ScopeBreakdownLoading() {
  return (
    <div className="mx-auto flex min-h-[42vh] max-w-lg flex-col justify-center gap-8 py-8">
      <div className="space-y-3">
        <div className="h-3 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-3 w-32 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[3.25rem] rounded-xl border border-border/50 bg-muted/25 animate-pulse"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
      <p className="text-center text-xs font-medium text-muted-foreground">Organizing scope</p>
    </div>
  );
}
