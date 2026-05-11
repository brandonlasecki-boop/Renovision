import Link from "next/link";
import { cn } from "@/lib/utils";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchAdminAnalyticsDashboard, resolveAnalyticsRange } from "@/lib/data/admin-analytics";

export const metadata = {
  title: "Admin - Command Center Overview",
  robots: { index: false, follow: false },
};

function fmtInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

type LeadSummaryRow = {
  id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  zip_code: string | null;
  selected_style: string | null;
  assigned_contractor_id?: string | null;
};

type GenerationSummaryRow = {
  id: string;
  created_at: string;
  selected_style: string | null;
  lead_submitted: boolean | null;
};

type CtaEventRow = {
  id: string;
  created_at: string;
  session_id: string;
  page_path: string | null;
};

async function fetchLeadSummaries(opts: { startIso: string; endIso: string }) {
  const svc = createServiceClient();
  const withAssigned = await svc
    .from("leads")
    .select("id, created_at, name, email, zip_code, selected_style, assigned_contractor_id")
    .gte("created_at", opts.startIso)
    .lte("created_at", opts.endIso)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!withAssigned.error) {
    const rows = (withAssigned.data ?? []) as LeadSummaryRow[];
    const assignedCount = rows.filter((r) => Boolean(r.assigned_contractor_id)).length;
    const unassignedCount = rows.length - assignedCount;
    const missingZipCount = rows.filter((r) => !String(r.zip_code ?? "").trim()).length;
    return { rows, assignedCount, unassignedCount, missingZipCount };
  }

  const fallback = await svc
    .from("leads")
    .select("id, created_at, name, email, zip_code, selected_style")
    .gte("created_at", opts.startIso)
    .lte("created_at", opts.endIso)
    .order("created_at", { ascending: false })
    .limit(200);
  if (fallback.error) throw new Error(fallback.error.message);

  const rows = (fallback.data ?? []) as LeadSummaryRow[];
  return {
    rows,
    assignedCount: 0,
    unassignedCount: rows.length,
    missingZipCount: rows.filter((r) => !String(r.zip_code ?? "").trim()).length,
  };
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const range = resolveAnalyticsRange(sp);
  const analytics = await fetchAdminAnalyticsDashboard(range, "customer");
  const svc = createServiceClient();

  const [leadSummary, generationsRes, ctaClicksRes, leadsMissingGenerationRes, leadsMissingZipRes, generationsMissingImageRes] = await Promise.all([
    fetchLeadSummaries({ startIso: range.startIso, endIso: range.endIso }),
    svc
      .from("bathroom_generations")
      .select("id, created_at, selected_style, lead_submitted")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false })
      .limit(10),
    svc
      .from("analytics_events")
      .select("id, created_at, session_id, page_path")
      .eq("event_name", "contractor_cta_clicked")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false })
      .limit(10),
    svc
      .from("leads")
      .select("id, created_at", { count: "exact" })
      .is("generation_id", null)
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false })
      .limit(10),
    svc
      .from("leads")
      .select("id, created_at, zip_code", { count: "exact" })
      .or("zip_code.is.null,zip_code.eq.")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false })
      .limit(10),
    svc
      .from("bathroom_generations")
      .select("id, created_at, generated_image_url", { count: "exact" })
      .or("generated_image_url.is.null,generated_image_url.eq.")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (generationsRes.error) throw new Error(generationsRes.error.message);
  if (ctaClicksRes.error) throw new Error(ctaClicksRes.error.message);
  if (leadsMissingGenerationRes.error) throw new Error(leadsMissingGenerationRes.error.message);
  if (leadsMissingZipRes.error) throw new Error(leadsMissingZipRes.error.message);
  if (generationsMissingImageRes.error) throw new Error(generationsMissingImageRes.error.message);

  const generations = (generationsRes.data ?? []) as GenerationSummaryRow[];
  const ctaClicks = (ctaClicksRes.data ?? []) as CtaEventRow[];
  const leadsMissingGeneration = (leadsMissingGenerationRes.data ?? []) as Array<{ id: string; created_at: string }>;
  const leadsMissingZip = (leadsMissingZipRes.data ?? []) as Array<{ id: string; created_at: string; zip_code: string | null }>;
  const generationsMissingImage = (generationsMissingImageRes.data ?? []) as Array<{ id: string; created_at: string; generated_image_url: string | null }>;

  const leadConversionRate = analytics.kpis.contractorCtaClicks
    ? (analytics.kpis.leadsSubmitted / analytics.kpis.contractorCtaClicks) * 100
    : null;

  const funnel = [
    { label: "Visitors", value: analytics.kpis.uniqueSessions },
    { label: "Upload CTA", value: analytics.kpis.uploadCtaClicks },
    { label: "Upload Completed", value: analytics.kpis.uploadCompleted },
    { label: "Generation Completed", value: analytics.kpis.generationsCompleted },
    { label: "Connect Me Clicked", value: analytics.kpis.contractorCtaClicks },
    { label: "Lead Submitted", value: analytics.kpis.leadsSubmitted },
  ];

  const alertRows = [
    {
      title: "Connect Me clicks without lead submissions",
      value: Math.max(0, analytics.kpis.contractorCtaClicks - analytics.kpis.leadsSubmitted),
      tone:
        analytics.kpis.contractorCtaClicks > analytics.kpis.leadsSubmitted
          ? "warn"
          : "ok",
      detail: "Intent is higher than completed lead submissions.",
    },
    {
      title: "Generation failures",
      value: analytics.kpis.generationFailed ?? 0,
      tone: (analytics.kpis.generationFailed ?? 0) > 0 ? "warn" : "ok",
      detail: "Failed generation events in selected range.",
    },
    {
      title: "Upload failures",
      value: analytics.kpis.uploadFailed ?? 0,
      tone: (analytics.kpis.uploadFailed ?? 0) > 0 ? "warn" : "ok",
      detail: "Failed upload events in selected range.",
    },
    {
      title: "New unassigned leads",
      value: leadSummary.unassignedCount,
      tone: leadSummary.unassignedCount > 0 ? "warn" : "ok",
      detail: "Leads without contractor assignment.",
    },
    {
      title: "Leads missing ZIP code",
      value: leadSummary.missingZipCount,
      tone: leadSummary.missingZipCount > 0 ? "warn" : "ok",
      detail: "Lead quality issue to review.",
    },
    {
      title: "Admin traffic excluded",
      value: analytics.analyticsHealth.adminSessionsExcluded,
      tone: "info",
      detail: "Overview excludes admin/local-dev traffic by default.",
    },
  ] as const;

  const rangeHref = (preset: "24h" | "7d" | "30d") => `/admin/overview?range=${preset}`;
  const rangeLabel =
    range.key === "custom"
      ? range.startDate === range.endDate
        ? range.startDate
        : `${range.startDate} – ${range.endDate}`
      : range.key === "24h"
        ? "Last 24 hours"
        : range.key === "7d"
          ? "Last 7 days"
          : "Last 30 days";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-renovision-navy">Command center</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight">
          Executive command center: what happened and what needs attention
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Range: <span className="font-medium text-foreground">{rangeLabel}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["24h", "Last 24h"],
            ["7d", "Last 7d"],
            ["30d", "Last 30d"],
          ] as const).map(([key, label]) => (
            <Link
              key={key}
              href={rangeHref(key)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                range.key === key ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted/40",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        <form action="/admin/overview" method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border/70 p-3">
          <input type="hidden" name="range" value="custom" />
          <label className="text-xs text-muted-foreground">
            Start date
            <input
              name="start"
              type="date"
              defaultValue={range.startDate}
              className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            End date
            <input
              name="end"
              type="date"
              defaultValue={range.endDate}
              className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
            Apply dates
          </button>
          <p className="text-xs text-muted-foreground">Set the same start and end date to view one calendar day.</p>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Unique visitors", analytics.kpis.uniqueSessions],
          ["Upload CTA clicks", analytics.kpis.uploadCtaClicks],
          ["Uploads completed", analytics.kpis.uploadCompleted],
          ["Generations completed", analytics.kpis.generationsCompleted],
          ["Connect Me clicks", analytics.kpis.contractorCtaClicks],
          ["Lead forms started", analytics.kpis.leadFormsStarted],
          ["Leads submitted", analytics.kpis.leadsSubmitted],
          ["Lead conversion rate", fmtPct(leadConversionRate)],
          ["New leads", leadSummary.rows.length],
          ["Assigned leads", leadSummary.assignedCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {typeof value === "number" ? fmtInt(value) : value}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold tracking-tight">Simple funnel</h3>
        <div className="mt-4 grid gap-2 md:grid-cols-6">
          {funnel.map((step, idx) => (
            <div key={step.label} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{step.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{fmtInt(step.value)}</p>
              {idx < funnel.length - 1 ? (
                <p className="mt-1 text-[10px] text-muted-foreground">→ next step</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold tracking-tight">Alerts</h3>
        <div className="mt-4 grid gap-2">
          {alertRows.map((alert) => (
            <div
              key={alert.title}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2",
                alert.tone === "warn"
                  ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/25"
                  : alert.tone === "info"
                    ? "border-sky-200 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/25"
                    : "border-emerald-200 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/25",
              )}
            >
              <div>
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-muted-foreground">{alert.detail}</p>
              </div>
              <p className="text-lg font-semibold tabular-nums">{fmtInt(alert.value)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold tracking-tight">Admin Data Quality Checks</h3>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium">contractor_cta_clicked exists but no lead_form_started</p>
            <p className="text-xs text-muted-foreground tabular-nums">{fmtInt(analytics.diagnostics.sessionsConnectClickNoFormStarted.length)}</p>
            <div className="mt-1">
              {analytics.diagnostics.sessionsConnectClickNoFormStarted.slice(0, 6).map((sid) => (
                <Link key={sid} href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                  {sid}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium">lead_form_started exists but no lead_submitted</p>
            <p className="text-xs text-muted-foreground tabular-nums">{fmtInt(analytics.diagnostics.sessionsLeadFormStartedNoSubmitted.length)}</p>
            <div className="mt-1">
              {analytics.diagnostics.sessionsLeadFormStartedNoSubmitted.slice(0, 6).map((sid) => (
                <Link key={sid} href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                  {sid}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium">generation_completed event exists but no bathroom_generations row</p>
            <p className="text-xs text-muted-foreground tabular-nums">{fmtInt(analytics.diagnostics.generationCompletedNoGenerationRowSessions.length)}</p>
            <div className="mt-1">
              {analytics.diagnostics.generationCompletedNoGenerationRowSessions.slice(0, 6).map((sid) => (
                <Link key={sid} href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                  {sid}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium">lead exists without generation_id</p>
            <p className="text-xs text-muted-foreground tabular-nums">{fmtInt(leadsMissingGenerationRes.count ?? 0)}</p>
            <div className="mt-1">
              {leadsMissingGeneration.slice(0, 6).map((row) => (
                <Link key={row.id} href={`/admin/leads/${row.id}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                  {row.id}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium">lead exists without zip_code</p>
            <p className="text-xs text-muted-foreground tabular-nums">{fmtInt(leadsMissingZipRes.count ?? 0)}</p>
            <div className="mt-1">
              {leadsMissingZip.slice(0, 6).map((row) => (
                <Link key={row.id} href={`/admin/leads/${row.id}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                  {row.id}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium">generation exists without generated_image_url</p>
            <p className="text-xs text-muted-foreground tabular-nums">{fmtInt(generationsMissingImageRes.count ?? 0)}</p>
            <div className="mt-1">
              {generationsMissingImage.slice(0, 6).map((row) => (
                <Link key={row.id} href={`/admin/generations/${row.id}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                  {row.id}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium">duplicate page_viewed events detected</p>
            <p className="text-xs text-muted-foreground tabular-nums">{fmtInt(analytics.analyticsHealth.duplicatePageViewedEventsDetected)}</p>
            <Link href="/admin/analytics" className="mt-1 inline-block text-xs underline-offset-4 hover:underline">
              Open analytics diagnostics
            </Link>
          </div>
          <div className={cn(
            "rounded-lg border px-3 py-2",
            analytics.diagnostics.adminSessionsIncludedInCustomer.length > 0
              ? "border-amber-300 bg-amber-50"
              : "border-emerald-200 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/25",
          )}>
            <p className="text-sm font-medium">admin traffic included in customer analytics</p>
            <p className="text-xs text-muted-foreground tabular-nums">{fmtInt(analytics.diagnostics.adminSessionsIncludedInCustomer.length)}</p>
            <div className="mt-1">
              {analytics.diagnostics.adminSessionsIncludedInCustomer.slice(0, 6).map((sid) => (
                <Link key={sid} href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                  {sid}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h3 className="text-lg font-semibold tracking-tight">Connect Clicks vs Leads</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Distinguishes intent clicks from actual submitted leads to prevent funnel confusion.
        </p>
        <div className="mt-4 overflow-x-auto">
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
                <td className="px-4 py-2 tabular-nums">{fmtInt(analytics.connectVsLeads.contractorCtaClickedCount)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">Aggregate metric</td>
              </tr>
              <tr className="border-b border-border/40">
                <td className="px-4 py-2">Lead form started</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(analytics.connectVsLeads.leadFormStartedCount)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">Aggregate metric</td>
              </tr>
              <tr className="border-b border-border/40">
                <td className="px-4 py-2">Lead submitted</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(analytics.connectVsLeads.leadSubmittedCount)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">Aggregate metric</td>
              </tr>
              <tr className="border-b border-border/40">
                <td className="px-4 py-2">Sessions with contractor CTA clicked but no lead form started</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(analytics.connectVsLeads.sessionsConnectClickNoFormStarted.length)}</td>
                <td className="px-4 py-2">
                  {analytics.connectVsLeads.sessionsConnectClickNoFormStarted.slice(0, 6).map((sid) => (
                    <Link key={sid} href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                      {sid}
                    </Link>
                  ))}
                </td>
              </tr>
              <tr className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2">Sessions with lead form started but no lead submitted</td>
                <td className="px-4 py-2 tabular-nums">{fmtInt(analytics.connectVsLeads.sessionsLeadFormStartedNoSubmitted.length)}</td>
                <td className="px-4 py-2">
                  {analytics.connectVsLeads.sessionsLeadFormStartedNoSubmitted.slice(0, 6).map((sid) => (
                    <Link key={sid} href={`/admin/analytics/sessions/${encodeURIComponent(sid)}`} className="mr-2 text-xs underline-offset-4 hover:underline">
                      {sid}
                    </Link>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
            <h3 className="text-sm font-semibold">Latest generations</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/10">
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Style</th>
                  <th className="px-4 py-2 font-medium">Lead submitted</th>
                </tr>
              </thead>
              <tbody>
                {generations.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-muted-foreground">No generations in range.</td></tr>
                ) : (
                  generations.map((row) => (
                    <tr key={row.id} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2">{row.selected_style || "—"}</td>
                      <td className="px-4 py-2">{row.lead_submitted ? "Yes" : "No"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
            <h3 className="text-sm font-semibold">Latest leads</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/10">
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">ZIP</th>
                </tr>
              </thead>
              <tbody>
                {leadSummary.rows.slice(0, 10).length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-muted-foreground">No leads in range.</td></tr>
                ) : (
                  leadSummary.rows.slice(0, 10).map((row) => (
                    <tr key={row.id} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2">{row.name || row.email || "—"}</td>
                      <td className="px-4 py-2">{row.zip_code || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
            <h3 className="text-sm font-semibold">Latest Contractor CTA clicks</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/10">
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Session</th>
                  <th className="px-4 py-2 font-medium">Page</th>
                </tr>
              </thead>
              <tbody>
                {ctaClicks.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-muted-foreground">No CTA clicks in range.</td></tr>
                ) : (
                  ctaClicks.map((row) => (
                    <tr key={row.id} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link href={`/admin/analytics/sessions/${encodeURIComponent(row.session_id)}`} className="underline-offset-4 hover:underline">
                          {row.session_id}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{row.page_path || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
