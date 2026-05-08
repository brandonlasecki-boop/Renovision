"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-300 bg-rose-50 p-5 shadow-sm dark:border-rose-700 dark:bg-rose-950/25">
      <h2 className="text-lg font-semibold">Unable to load admin data</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Refresh to retry. If the issue persists, review Supabase connectivity and policies.
      </p>
      <p className="mt-2 max-w-3xl rounded border border-rose-300/70 bg-background/70 px-3 py-2 font-mono text-xs text-muted-foreground dark:border-rose-700/70">
        {error.message || "Unknown admin dashboard error"}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40"
      >
        Retry
      </button>
    </div>
  );
}
