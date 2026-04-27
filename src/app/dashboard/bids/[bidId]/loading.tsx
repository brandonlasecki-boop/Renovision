export default function BidLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-3">
        <div className="h-9 w-full max-w-[min(100%,28rem)] rounded-md bg-muted" />
        <div className="h-4 w-24 rounded bg-muted/70" />
      </div>
      <div className="h-64 rounded-2xl border border-border/60 bg-muted/20" />
    </div>
  );
}
