import Link from "next/link";
import { fetchAdminAnalyticsSessionDetail } from "@/lib/data/admin-analytics";
import { AdminSessionTimeline } from "@/components/admin/admin-session-timeline";

export const metadata = {
  title: "Session detail",
  robots: { index: false, follow: false },
};

function fmtSeconds(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  const m = Math.floor(value / 60);
  const s = Math.round(value % 60);
  return `${m}m ${s}s`;
}

export default async function AdminAnalyticsSessionPage({
  params,
}: {
  params: Promise<{ session_id: string }>;
}) {
  const { session_id } = await params;
  const decodedSessionId = decodeURIComponent(session_id);
  const data = await fetchAdminAnalyticsSessionDetail(decodedSessionId);

  if (!data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/analytics" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to analytics
        </Link>
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
          <p className="text-sm">Session not found.</p>
        </div>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/admin/analytics" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to analytics
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Session detail</h1>
        <p className="font-mono text-xs text-muted-foreground">{s.sessionId}</p>
      </div>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Session summary</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Started</p><p className="text-sm">{new Date(s.createdAt).toLocaleString()}</p></div>
          <div><p className="text-xs text-muted-foreground">First page</p><p className="text-sm font-mono">{s.firstPage}</p></div>
          <div><p className="text-xs text-muted-foreground">Referrer</p><p className="text-sm">{s.referrer}</p></div>
          <div><p className="text-xs text-muted-foreground">UTM</p><p className="text-sm">{s.utmSource} / {s.utmMedium} / {s.utmCampaign}</p></div>
          <div><p className="text-xs text-muted-foreground">Device / Browser / OS</p><p className="text-sm">{s.deviceType} / {s.browser} / {s.os}</p></div>
          <div><p className="text-xs text-muted-foreground">Total duration</p><p className="text-sm">{fmtSeconds(s.totalDurationSeconds)}</p></div>
          <div><p className="text-xs text-muted-foreground">Pages visited</p><p className="text-sm">{s.pagesVisited.length}</p></div>
          <div><p className="text-xs text-muted-foreground">Max scroll depth</p><p className="text-sm">{s.maxScrollDepth}%</p></div>
          <div><p className="text-xs text-muted-foreground">Total clicks</p><p className="text-sm">{s.totalClicks}</p></div>
          <div><p className="text-xs text-muted-foreground">Upload started</p><p className="text-sm">{s.uploadStarted ? "Yes" : "No"}</p></div>
          <div><p className="text-xs text-muted-foreground">Generation completed</p><p className="text-sm">{s.generationCompleted ? "Yes" : "No"}</p></div>
          <div><p className="text-xs text-muted-foreground">Lead submitted</p><p className="text-sm">{s.leadSubmitted ? "Yes" : "No"}</p></div>
        </div>
        {s.pagesVisited.length ? (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Visited paths</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.pagesVisited.map((p) => (
                <span key={p} className="rounded-md border border-border px-2 py-1 font-mono text-xs">
                  {p}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Timeline (chronological)</h2>
        <AdminSessionTimeline sessionId={s.sessionId} maxRows={160} />
      </section>
    </div>
  );
}
