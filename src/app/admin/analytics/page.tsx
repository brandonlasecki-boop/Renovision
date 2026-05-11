import Link from "next/link";
import { fetchAdminAnalyticsDashboard, resolveAnalyticsRange } from "@/lib/data/admin-analytics";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Admin - Funnel Analytics Dashboard",
  robots: { index: false, follow: false },
};

function fmtInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function fmtPct(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function fmtSeconds(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  const m = Math.floor(value / 60);
  const s = Math.round(value % 60);
  return `${m}m ${s}s`;
}

function TableWrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">{children}</div>
    </section>
  );
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    start?: string;
    end?: string;
    include_admin?: string;
    include_local_dev?: string;
    source?: string;
    device?: string;
  }>;
}) {
  const sp = await searchParams;
  const range = resolveAnalyticsRange(sp);
  const includeAdmin = sp.include_admin === "1" || sp.include_admin === "true";
  const includeLocalDev = sp.include_local_dev === "1" || sp.include_local_dev === "true";
  const source = sp.source?.trim() || "all";
  const device = sp.device?.trim() || "all";
  const traffic = includeAdmin ? "all" : "customer";
  const data = await fetchAdminAnalyticsDashboard(range, traffic, includeLocalDev, {
    sourceFilter: source,
    deviceFilter: device,
  });

  const qs = (overrides: Record<string, string>) => {
    const params = new URLSearchParams({
      range: range.key,
      start: range.startDate,
      end: range.endDate,
      include_admin: includeAdmin ? "1" : "0",
      include_local_dev: includeLocalDev ? "1" : "0",
      source,
      device,
    });
    for (const [k, v] of Object.entries(overrides)) params.set(k, v);
    return `/admin/analytics?${params.toString()}`;
  };

  const exportHref = `/api/admin/analytics/export?${new URLSearchParams({
    range: range.key,
    start: range.startDate,
    end: range.endDate,
    include_admin: includeAdmin ? "1" : "0",
    include_local_dev: includeLocalDev ? "1" : "0",
    traffic,
    source,
    device,
  }).toString()}`;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Admin funnel analytics dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer traffic only by default, excluding admin and local_dev. Custom date ranges use US Eastern calendar days.
        </p>
        {range.key === "custom" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Showing activity from <span className="font-medium text-foreground">{range.startDate}</span>
            {range.startDate === range.endDate ? "" : (
              <>
                {" "}
                through <span className="font-medium text-foreground">{range.endDate}</span>
              </>
            )}
            .
          </p>
        ) : null}
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium">Date and filter controls</p>
          <div className="flex flex-wrap gap-2">
            {([
              ["24h", "Last 24 hours"],
              ["7d", "Last 7 days"],
              ["30d", "Last 30 days"],
            ] as const).map(([key, label]) => (
              <Link
                key={key}
                href={qs({ range: key })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  range.key === key ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted/40",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          <form action="/admin/analytics" method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border/70 p-3">
            <input type="hidden" name="range" value="custom" />
            <label className="text-xs text-muted-foreground">
              Start
              <input
                name="start"
                type="date"
                defaultValue={range.startDate}
                className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              End
              <input
                name="end"
                type="date"
                defaultValue={range.endDate}
                className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Source
              <select name="source" defaultValue={source} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="all">All sources</option>
                {data.availableFilters.sources.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Device
              <select name="device" defaultValue={device} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="all">All devices</option>
                {data.availableFilters.devices.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="include_admin" value="1" defaultChecked={includeAdmin} className="size-4 rounded border-input" />
              Include admin
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="include_local_dev"
                value="1"
                defaultChecked={includeLocalDev}
                className="size-4 rounded border-input"
              />
              Include local_dev
            </label>
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Apply filters
            </button>
            <p className="w-full text-xs text-muted-foreground">
              Use the same start and end date to view one calendar day. If weekend numbers look empty, try Include admin or Include local_dev.
            </p>
            <a href={exportHref} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Export JSON
            </a>
          </form>
        </div>
      </section>

      <TableWrap title="Funnel Table">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-4 py-2 font-medium">Step</th>
              <th className="px-4 py-2 font-medium">Count</th>
              <th className="px-4 py-2 font-medium">Conversion from previous</th>
              <th className="px-4 py-2 font-medium">Conversion from sessions</th>
            </tr>
          </thead>
          <tbody>
            {data.funnelRows.map((row) => (
              <tr key={row.step} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2">{row.step}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.count)}</td>
                <td className="px-4 py-2">{fmtPct(row.conversionFromPrev)}</td>
                <td className="px-4 py-2">{fmtPct(row.conversionFromSessions)}</td>
              </tr>
            ))}
            {data.funnelRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No funnel data for this date range and filter combination.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableWrap>

      <TableWrap title="Connect Clicks vs Leads">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-4 py-2 font-medium">Metric</th>
              <th className="px-4 py-2 font-medium">Count</th>
              <th className="px-4 py-2 font-medium">Open timeline</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/40">
              <td className="px-4 py-2">Contractor CTA clicked</td>
              <td className="px-4 py-2 tabular-nums">{fmtInt(data.connectVsLeads.contractorCtaClickedCount)}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">Aggregate metric</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="px-4 py-2">Lead form started</td>
              <td className="px-4 py-2 tabular-nums">{fmtInt(data.connectVsLeads.leadFormStartedCount)}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">Aggregate metric</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="px-4 py-2">Lead submitted</td>
              <td className="px-4 py-2 tabular-nums">{fmtInt(data.connectVsLeads.leadSubmittedCount)}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">Aggregate metric</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="px-4 py-2">Sessions with contractor CTA clicked but no lead form started</td>
              <td className="px-4 py-2 tabular-nums">{fmtInt(data.connectVsLeads.sessionsConnectClickNoFormStarted.length)}</td>
              <td className="px-4 py-2">
                {data.connectVsLeads.sessionsConnectClickNoFormStarted.slice(0, 6).map((sid) => (
                  <Link key={sid} href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                    {sid}
                  </Link>
                ))}
              </td>
            </tr>
            <tr className="border-b border-border/40 last:border-0">
              <td className="px-4 py-2">Sessions with lead form started but no lead submitted</td>
              <td className="px-4 py-2 tabular-nums">{fmtInt(data.connectVsLeads.sessionsLeadFormStartedNoSubmitted.length)}</td>
              <td className="px-4 py-2">
                {data.connectVsLeads.sessionsLeadFormStartedNoSubmitted.slice(0, 6).map((sid) => (
                  <Link key={sid} href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                    {sid}
                  </Link>
                ))}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="border-t border-border/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Session rows below are clickable to open the full timeline.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/10">
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Session</th>
                </tr>
              </thead>
              <tbody>
                {data.connectVsLeads.sessionRows.slice(0, 40).map((row) => (
                  <tr key={`${row.reason}-${row.sessionId}`} className="border-b border-border/30 last:border-0">
                    <td className="px-3 py-2">{row.reason}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/admin/analytics/sessions/${encodeURIComponent(row.sessionId)}`}
                        className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted/40"
                      >
                        {row.sessionId}
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.connectVsLeads.sessionRows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-muted-foreground">
                      No mismatch sessions in selected range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </TableWrap>

      <TableWrap title="Page Performance Table">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-4 py-2 font-medium">Page path</th>
              <th className="px-4 py-2 font-medium">Page views</th>
              <th className="px-4 py-2 font-medium">Unique sessions</th>
              <th className="px-4 py-2 font-medium">Average time on page</th>
              <th className="px-4 py-2 font-medium">Average max scroll depth</th>
              <th className="px-4 py-2 font-medium">Click count</th>
              <th className="px-4 py-2 font-medium">Exits</th>
              <th className="px-4 py-2 font-medium">Exit rate</th>
            </tr>
          </thead>
          <tbody>
            {data.pagePerformanceRows.map((row) => (
              <tr key={row.pagePath} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2 font-mono text-xs">{row.pagePath}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.pageViews)}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.uniqueSessions)}</td>
                <td className="px-4 py-2">{fmtSeconds(row.avgTimeOnPage)}</td>
                <td className="px-4 py-2">{row.avgMaxScrollDepth == null ? "—" : `${row.avgMaxScrollDepth.toFixed(1)}%`}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.clickCount)}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.exits)}</td>
                <td className="px-4 py-2">{fmtPct(row.exitRate)}</td>
              </tr>
            ))}
            {data.pagePerformanceRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  No page performance rows in this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableWrap>

      <TableWrap title="Traffic Source Table">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Referrer</th>
              <th className="px-4 py-2 font-medium">UTM campaign</th>
              <th className="px-4 py-2 font-medium">Sessions</th>
              <th className="px-4 py-2 font-medium">Generations</th>
              <th className="px-4 py-2 font-medium">Connect clicks</th>
              <th className="px-4 py-2 font-medium">Leads</th>
              <th className="px-4 py-2 font-medium">Conversion rate</th>
            </tr>
          </thead>
          <tbody>
            {data.trafficSourceRows.map((row, idx) => (
              <tr key={`${row.source}-${row.utmCampaign}-${idx}`} className="border-b border-border/40 last:border-0">
                <td className="max-w-[280px] truncate px-4 py-2">{row.source}</td>
                <td className="max-w-[240px] truncate px-4 py-2">{row.referrer}</td>
                <td className="px-4 py-2">{row.utmCampaign}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.sessions)}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.generations)}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.connectClicks)}</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(row.leads)}</td>
                <td className="px-4 py-2">{fmtPct(row.conversionRate)}</td>
              </tr>
            ))}
            {data.trafficSourceRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  No traffic source records in this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableWrap>

      <TableWrap title="CTA Diagnostics">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-4 py-2 font-medium">Diagnostic</th>
              <th className="px-4 py-2 font-medium">Sessions</th>
              <th className="px-4 py-2 font-medium">Sample session IDs</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Sessions with connect click but no lead", data.diagnostics.sessionsConnectClickNoLead],
              ["Sessions with upload started but no upload completed", data.diagnostics.sessionsUploadStartedNoUploadCompleted],
              ["Sessions with generation failed", data.diagnostics.sessionsGenerationFailed],
              ["Sessions with long time on page but no click", data.diagnostics.sessionsLongTimeNoClick],
            ].map(([label, sessionIds]) => {
              const ids = sessionIds as string[];
              return (
                <tr key={String(label)} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2">{label}</td>
                  <td className="px-4 py-2 tabular-nums">{fmtInt(ids.length)}</td>
                  <td className="max-w-[560px] truncate px-4 py-2 font-mono text-xs">
                    {ids.slice(0, 8).map((sid) => (
                      <Link
                        key={sid}
                        href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`}
                        className="mr-2 underline-offset-4 hover:underline"
                      >
                        {sid}
                      </Link>
                    ))}
                    {ids.length > 8 ? `+${ids.length - 8} more` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Sessions", data.kpis.uniqueSessions],
          ["Upload completed", data.kpis.uploadCompleted],
          ["Generation completed", data.kpis.generationsCompleted],
          ["Contractor CTA clicked", data.kpis.contractorCtaClicks],
          ["Lead form started", data.kpis.leadFormsStarted],
          ["Lead submitted", data.kpis.leadsSubmitted],
          ["Upload failed", data.kpis.uploadFailed],
          ["Generation failed", data.kpis.generationFailed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{fmtInt(Number(value))}</p>
          </div>
        ))}
      </section>

      <TableWrap title="Recent sessions (behavior spot check)">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-4 py-2 font-medium">Session ID</th>
              <th className="px-4 py-2 font-medium">First page</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Scroll</th>
              <th className="px-4 py-2 font-medium">Last event</th>
            </tr>
          </thead>
          <tbody>
            {data.recentSessions.slice(0, 40).map((row) => (
              <tr key={row.sessionId} className="border-b border-border/40 last:border-0">
                <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs">
                  <Link
                    href={`/admin/analytics/sessions/${encodeURIComponent(row.sessionId)}`}
                    className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted/40"
                  >
                    {row.sessionId}
                  </Link>
                </td>
                <td className="max-w-[180px] truncate px-4 py-2">{row.firstPage}</td>
                <td className="max-w-[240px] truncate px-4 py-2">{row.referrerSource}</td>
                <td className="px-4 py-2">{row.device}</td>
                <td className="px-4 py-2">{fmtSeconds(row.sessionDurationSeconds)}</td>
                <td className="px-4 py-2">{row.maxScrollDepth == null ? "—" : `${row.maxScrollDepth}%`}</td>
                <td className="px-4 py-2">{row.lastEvent}</td>
              </tr>
            ))}
            {data.recentSessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No recent sessions found for this filter set.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}
