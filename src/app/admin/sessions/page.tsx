import Link from "next/link";
import { fetchAdminAnalyticsDashboard, resolveAnalyticsRange } from "@/lib/data/admin-analytics";

export const metadata = {
  title: "Admin sessions",
  robots: { index: false, follow: false },
};

function fmtSeconds(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  const m = Math.floor(value / 60);
  const s = Math.round(value % 60);
  return `${m}m ${s}s`;
}

export default async function AdminSessionsPage() {
  const range = resolveAnalyticsRange({ range: "24h" });
  const data = await fetchAdminAnalyticsDashboard(range);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-renovision-navy">Sessions</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Recent sessions (last 24 hours)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fast diagnostic view of session-level behavior with direct links into the detailed session timeline.
        </p>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-4 py-2 font-medium">Session ID</th>
              <th className="px-4 py-2 font-medium">First page</th>
              <th className="px-4 py-2 font-medium">Last page</th>
              <th className="px-4 py-2 font-medium">Referrer / source</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Max scroll</th>
              <th className="px-4 py-2 font-medium">Last event</th>
              <th className="px-4 py-2 font-medium">Lead submitted</th>
            </tr>
          </thead>
          <tbody>
            {data.recentSessions.map((row) => (
              <tr key={row.sessionId} className="border-b border-border/40 last:border-0">
                <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs">
                  <Link href={`/admin/analytics/sessions/${encodeURIComponent(row.sessionId)}`} className="hover:underline">
                    {row.sessionId}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{row.firstPage}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.lastPage}</td>
                <td className="max-w-[220px] truncate px-4 py-2">{row.referrerSource}</td>
                <td className="px-4 py-2">{row.device}</td>
                <td className="px-4 py-2">{fmtSeconds(row.sessionDurationSeconds)}</td>
                <td className="px-4 py-2">{row.maxScrollDepth == null ? "—" : `${row.maxScrollDepth}%`}</td>
                <td className="px-4 py-2">{row.lastEvent}</td>
                <td className="px-4 py-2">{row.leadSubmitted ? "Yes" : "No"}</td>
              </tr>
            ))}
            {data.recentSessions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No sessions found for the last 24 hours.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
