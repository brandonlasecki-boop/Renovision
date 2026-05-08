export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <p className="text-sm font-medium">Loading admin dashboard...</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Fetching latest analytics, leads, generations, and contractor data.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={idx} className="h-24 animate-pulse rounded-xl border border-border/70 bg-muted/30" />
        ))}
      </div>
    </div>
  );
}
