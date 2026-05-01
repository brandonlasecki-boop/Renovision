import Link from "next/link";
import {
  fetchRenovisionActiveProjects,
  fetchRenovisionActiveSessions,
  fetchRenovisionAdminAnonSessionsTable,
  fetchRenovisionAdminFunnel,
  fetchRecentAttributionRows,
  fetchRenovisionSessionDrilldown,
  fetchRenovisionAdminLeadsTable,
  fetchRenovisionMarketingDailyRows,
  fetchRenovisionAdminOverview,
  fetchRenovisionAdminProjectsTable,
  fetchRenovisionAdminMockupsTable,
  fetchRenovisionAdminTrends,
  fetchRenovisionAdminUsersTable,
  parseRenovisionAdminRange,
  type RenovisionTrendPoint,
} from "@/lib/data/renovision-admin-dashboard";
import { cn } from "@/lib/utils";

function PageSection({
  title,
  description,
  id,
  children,
}: {
  title: string;
  description?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 space-y-5">
      <header className="space-y-1.5 border-b border-border/60 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function TableShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
      <div className="border-b border-border/60 bg-gradient-to-r from-muted/35 via-muted/20 to-transparent px-4 py-3.5 sm:px-5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-snug text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export const metadata = {
  title: "Renovision control center",
  robots: { index: false, follow: false },
};

function pctLabel(v: number | null): string {
  if (v == null) return "—";
  return `${v}%`;
}

function MetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-sm ring-1 ring-black/[0.02] transition-shadow hover:shadow-md dark:ring-white/[0.04]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-renovision-orange/70 via-renovision-teal/50 to-transparent opacity-60"
        aria-hidden
      />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-[1.75rem]">
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function trendMetric(
  p: RenovisionTrendPoint,
  keyField:
    | "anonymousSessions"
    | "firstMockups"
    | "signups"
    | "remodelerRequests"
    | "websiteViews"
    | "tryViews",
): number {
  return p[keyField];
}

function TrendBars({
  points,
  keyField,
  colorClass,
}: {
  points: RenovisionTrendPoint[];
  keyField:
    | "anonymousSessions"
    | "firstMockups"
    | "signups"
    | "remodelerRequests"
    | "websiteViews"
    | "tryViews";
  colorClass: string;
}) {
  const vals = points.map((p) => trendMetric(p, keyField));
  const maxVal = vals.length ? Math.max(...vals) : 0;

  return (
    <div className="rounded-lg bg-muted/20 px-1 py-2 sm:px-2">
      <div className="flex gap-0.5 sm:gap-1">
        {points.map((p) => {
          const v = trendMetric(p, keyField);
          const title = `${p.label}: ${v}`;
          const pctRaw = maxVal <= 0 ? 0 : (v / maxVal) * 100;
          /** When every day ties (common for deduped view counts), bars stay equal — the number above is the source of truth. */
          const barPct = v === 0 ? 0 : Math.max(pctRaw, 6);
          return (
            <div
              key={p.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={title}
            >
              <span className="flex h-4 shrink-0 items-center text-[10px] font-semibold tabular-nums leading-none text-foreground">
                {v}
              </span>
              <div className="relative h-32 w-full">
                <div
                  className={cn(
                    "absolute bottom-0 left-1/2 w-[88%] max-w-[38px] -translate-x-1/2 rounded-t-md shadow-sm transition-transform hover:scale-[1.02]",
                    v === 0 ? "bg-muted-foreground/35" : colorClass,
                  )}
                  style={{
                    height: v === 0 ? "3px" : `${barPct}%`,
                    maxHeight: "100%",
                  }}
                  aria-hidden
                />
              </div>
              <span className="max-w-full truncate text-center text-[10px] font-medium leading-tight text-muted-foreground">
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewThumb({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-2">
      <img
        src={href}
        alt={label}
        loading="lazy"
        className="h-12 w-16 rounded border border-border/60 object-cover transition-opacity group-hover:opacity-80"
      />
      <span className="text-xs text-renovision-navy underline-offset-2 group-hover:underline">Open</span>
    </a>
  );
}

export default async function RenovisionAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; q?: string; session?: string }>;
}) {
  const sp = await searchParams;
  const range = parseRenovisionAdminRange(sp.range);
  const q = (sp.q ?? "").trim();
  const sessionQuery = (sp.session ?? "").trim();

  let loadError: string | null = null;
  let overview: Awaited<ReturnType<typeof fetchRenovisionAdminOverview>> | null = null;
  let trends: Awaited<ReturnType<typeof fetchRenovisionAdminTrends>> = [];
  let funnel: Awaited<ReturnType<typeof fetchRenovisionAdminFunnel>> = [];
  let activeProjects: Awaited<ReturnType<typeof fetchRenovisionActiveProjects>> = [];
  let activeSessions: Awaited<ReturnType<typeof fetchRenovisionActiveSessions>> = [];
  let users: Awaited<ReturnType<typeof fetchRenovisionAdminUsersTable>> = [];
  let sessions: Awaited<ReturnType<typeof fetchRenovisionAdminAnonSessionsTable>> = [];
  let projects: Awaited<ReturnType<typeof fetchRenovisionAdminProjectsTable>> = [];
  let mockups: Awaited<ReturnType<typeof fetchRenovisionAdminMockupsTable>> = [];
  let attributionRows: Awaited<ReturnType<typeof fetchRecentAttributionRows>> = [];
  let sessionDrilldown: Awaited<ReturnType<typeof fetchRenovisionSessionDrilldown>> = null;
  let leads: Awaited<ReturnType<typeof fetchRenovisionAdminLeadsTable>> = [];
  let marketingDaily: Awaited<ReturnType<typeof fetchRenovisionMarketingDailyRows>> = [];

  try {
    [
      overview,
      trends,
      funnel,
      activeProjects,
      activeSessions,
      users,
      sessions,
      projects,
      mockups,
      attributionRows,
      sessionDrilldown,
      leads,
      marketingDaily,
    ] = await Promise.all([
      fetchRenovisionAdminOverview(range),
      fetchRenovisionAdminTrends(range),
      fetchRenovisionAdminFunnel(range),
      fetchRenovisionActiveProjects(12),
      fetchRenovisionActiveSessions(12),
      fetchRenovisionAdminUsersTable(range, q),
      fetchRenovisionAdminAnonSessionsTable(range, q),
      fetchRenovisionAdminProjectsTable(range, q),
      fetchRenovisionAdminMockupsTable(range, q),
      fetchRecentAttributionRows(120),
      sessionQuery ? fetchRenovisionSessionDrilldown(sessionQuery) : Promise.resolve(null),
      fetchRenovisionAdminLeadsTable(range, q),
      fetchRenovisionMarketingDailyRows(range),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load Renovision analytics.";
  }

  const rangeHref = (r: string) => {
    const params = new URLSearchParams();
    params.set("range", r);
    if (q) params.set("q", q);
    if (sessionQuery) params.set("session", sessionQuery);
    return `/admin/renovision?${params.toString()}`;
  };

  return (
    <div className="space-y-12 sm:space-y-14">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-sm ring-1 ring-black/[0.03] sm:p-8 dark:ring-white/[0.04]">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-renovision-orange/[0.07] blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-renovision-navy dark:text-renovision-orange">
              Analytics
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Renovision control center</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Homeowner <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">/try</code> usage,
              conversion, and remodeler interest. Aggregated server-side from Supabase (service role). Admin access:{" "}
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">profiles.is_admin</code> or{" "}
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">ADMIN_EMAILS</code>.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Date range</p>
            <div className="inline-flex flex-wrap rounded-xl border border-border/80 bg-muted/30 p-1 shadow-inner">
              {(
                [
                  ["7d", "7 days"],
                  ["30d", "30 days"],
                  ["all", "All time"],
                ] as const
              ).map(([r, label]) => (
                <Link
                  key={r}
                  href={rangeHref(r)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    range === r
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/70"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loadError ? (
        <div
          className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-4 text-sm text-destructive shadow-sm"
          role="alert"
        >
          <p className="font-semibold">Could not load Renovision analytics</p>
          <p className="mt-1 opacity-90">{loadError}</p>
        </div>
      ) : null}

      {overview ? (
        <>
          <PageSection
            title="Overview"
            description="Key counts and conversion rates for the selected range. Totals refresh when you change the date window above."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Homepage visitors (today)"
              value={overview.uniqueHomeVisitorsToday}
              hint="Unique people who loaded the main page today"
            />
            <MetricCard
              title="Guest sessions"
              value={overview.totalAnonymousSessions}
              hint="Anonymous /try browser sessions in range"
            />
            <MetricCard
              title="Registered accounts"
              value={overview.totalRegisteredUsers}
              hint="All-time profiles (auth users)"
            />
            <MetricCard
              title="New signups"
              value={overview.totalSignupsInRange}
              hint="Profiles created in range"
            />
            <MetricCard title="First previews" value={overview.totalInitialGenerations} hint="First mockup per run" />
            <MetricCard title="Refinements" value={overview.totalRegenerations} hint="Additional mockups after the first" />
            <MetricCard
              title="Total generations"
              value={overview.totalGenerations}
              hint="First previews + refinements"
            />
            <MetricCard
              title="All mockups on save"
              value={overview.totalGenerations}
              hint={`${overview.totalSignedInMockups} signed-in / ${Math.max(
                0,
                overview.totalGenerations - overview.totalSignedInMockups,
              )} guest`}
            />
            <MetricCard title="Connect Me leads" value={overview.totalRemodelerRequests} />
            <MetricCard
              title="Guest → signup"
              value={pctLabel(overview.conversionAnonymousToSignup)}
              hint={`${overview.anonymousConvertedToSignup} claimed previews / ${overview.totalAnonymousSessions} sessions`}
            />
            <MetricCard
              title="Visitor → first preview"
              value={pctLabel(overview.conversionVisitorToFirstGen)}
              hint={`${overview.totalInitialGenerations} first previews / ${overview.totalAnonymousSessions} sessions`}
            />
            <MetricCard
              title="Signup → lead submit"
              value={pctLabel(overview.conversionSignupToRemodeler)}
              hint="Requests in range / signups in range (or all accounts when all-time)"
            />
            </div>
          </PageSection>

          <PageSection
            title="Activity trends"
            description={
              range === "all"
                ? "Last 12 months, one bar per month. Home / Try views count tracked visits (once per browser per calendar day)."
                : range === "7d"
                  ? "Last 7 days, one bar per day. Home / Try views count tracked visits (once per browser per calendar day)."
                  : "Last 30 days, one bar per day. Home / Try views count tracked visits (once per browser per calendar day)."
            }
          >
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm ring-1 ring-black/[0.03] sm:p-6 dark:ring-white/[0.04]">
              <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Guest sessions
                  </p>
                  <TrendBars points={trends} keyField="anonymousSessions" colorClass="bg-renovision-orange/80" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    First previews
                  </p>
                  <TrendBars points={trends} keyField="firstMockups" colorClass="bg-renovision-teal/80" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signups</p>
                  <TrendBars points={trends} keyField="signups" colorClass="bg-foreground/70" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Connect Me leads
                  </p>
                  <TrendBars points={trends} keyField="remodelerRequests" colorClass="bg-violet-500/75" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Home page views
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    `/` — one counted row per browser per day when the marketing page loads.
                  </p>
                  <TrendBars points={trends} keyField="websiteViews" colorClass="bg-sky-500/80" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Try page views
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    `/try` — one counted row per browser per day when the Try flow loads.
                  </p>
                  <TrendBars points={trends} keyField="tryViews" colorClass="bg-emerald-500/75" />
                </div>
              </div>
            </div>
          </PageSection>

          <PageSection
            title="Funnel & activity"
            description="Step-through counts for the range, plus the busiest projects and guest sessions."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
                <h3 className="text-base font-semibold tracking-tight">Funnel</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ordered steps for the selected range (definitions match metric cards).
                </p>
                <ol className="relative mt-6 space-y-0 border-l-2 border-border/60 pl-6">
                  {funnel.map((step, i) => (
                    <li key={step.id} className="relative pb-8 last:pb-0">
                      <span className="absolute -left-[1.4rem] top-0 flex size-7 items-center justify-center rounded-full border-2 border-background bg-renovision-navy text-xs font-bold text-white shadow-sm">
                        {i + 1}
                      </span>
                      <p className="text-sm font-medium leading-snug">{step.label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{step.count}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="space-y-6">
                <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
                  <h3 className="text-base font-semibold tracking-tight">Most active projects</h3>
                  <p className="mt-1 text-xs text-muted-foreground">By mockup run count.</p>
                  <ul className="mt-4 divide-y divide-border/50 text-sm">
                    {activeProjects.length === 0 ? (
                      <li className="py-3 text-muted-foreground">No preview runs yet.</li>
                    ) : (
                      activeProjects.map((p) => (
                        <li
                          key={p.projectId}
                          className="flex items-center justify-between gap-2 py-2.5 first:pt-0"
                        >
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {p.projectId.slice(0, 8)}…
                          </span>
                          <span className="shrink-0 rounded-md bg-muted/60 px-2 py-0.5 tabular-nums text-xs font-semibold">
                            {p.mockupCount} runs
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
                  <h3 className="text-base font-semibold tracking-tight">Most active guest sessions</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Anonymous /try usage intensity.</p>
                  <ul className="mt-4 divide-y divide-border/50 text-sm">
                    {activeSessions.length === 0 ? (
                      <li className="py-3 text-muted-foreground">No sessions yet.</li>
                    ) : (
                      activeSessions.map((s) => (
                        <li
                          key={s.sessionId}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0"
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {s.sessionId.slice(0, 8)}…
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {s.initialUsed} first · {s.regenUsed} refinements
                            {s.convertedToSignup ? (
                              <span className="ml-2 rounded-full bg-renovision-teal/15 px-2 py-0.5 font-medium text-renovision-teal">
                                Signed up
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </PageSection>

          <PageSection
            title="Marketing & data tables"
            description="Review daily link performance, then filter detailed rows by id or email."
          >
            <div className="space-y-6">
            <TableShell
              title="Daily link performance"
              subtitle="Per unique link id (src) and day — sessions, generations, saves, and leads."
            >
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="px-4 py-2 font-medium">Day</th>
                    <th className="px-4 py-2 font-medium">Link ID (src)</th>
                    <th className="px-4 py-2 font-medium">Platform</th>
                    <th className="px-4 py-2 font-medium">Campaign</th>
                    <th className="px-4 py-2 font-medium">Video</th>
                    <th className="px-4 py-2 font-medium">Sessions</th>
                    <th className="px-4 py-2 font-medium">Generations</th>
                    <th className="px-4 py-2 font-medium">Saves</th>
                    <th className="px-4 py-2 font-medium">Leads</th>
                    <th className="px-4 py-2 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {marketingDaily.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-muted-foreground">
                        No attribution traffic yet for this range.
                      </td>
                    </tr>
                  ) : (
                    marketingDaily.map((r) => {
                      const link = `https://www.getrenovision.com/?src=${encodeURIComponent(r.linkId)}&platform=${encodeURIComponent(r.platform)}&campaign=${encodeURIComponent(r.campaign)}&video=${encodeURIComponent(r.video)}`;
                      return (
                        <tr key={`${r.day}-${r.linkId}-${r.platform}-${r.campaign}-${r.video}`} className="border-b border-border/40 last:border-0">
                          <td className="px-4 py-2">{r.day}</td>
                          <td className="px-4 py-2 font-mono text-xs">{r.linkId}</td>
                          <td className="px-4 py-2">{r.platform}</td>
                          <td className="px-4 py-2">{r.campaign}</td>
                          <td className="px-4 py-2">{r.video}</td>
                          <td className="px-4 py-2 tabular-nums">{r.sessions}</td>
                          <td className="px-4 py-2 tabular-nums">{r.generations}</td>
                          <td className="px-4 py-2 tabular-nums">{r.saves}</td>
                          <td className="px-4 py-2 tabular-nums">{r.leads}</td>
                          <td className="px-4 py-2">
                            <a href={link} target="_blank" rel="noreferrer" className="text-renovision-navy underline-offset-2 hover:underline">
                              Open
                            </a>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </TableShell>

            <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-muted/15 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Filter tables</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Applies to user, session, project, mockup, lead, and attribution lists below.
                </p>
              </div>
              <form className="flex w-full max-w-md gap-2 sm:shrink-0" action="/admin/renovision" method="get">
                <input type="hidden" name="range" value={range} />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search id or email…"
                  className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="submit"
                  className="h-10 shrink-0 rounded-xl border border-border bg-background px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-muted"
                >
                  Apply
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-dashed border-renovision-navy/25 bg-renovision-navy/[0.03] p-4 shadow-sm sm:p-5 dark:border-renovision-orange/20 dark:bg-renovision-orange/[0.04]">
              <h3 className="text-sm font-semibold tracking-tight">Session inspector</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Paste a full anonymous session UUID to load attribution, projects, generations, mockups, events, and
                leads for that session.
              </p>
              <form className="mt-4 flex w-full flex-col gap-2 sm:max-w-3xl sm:flex-row" action="/admin/renovision" method="get">
                <input type="hidden" name="range" value={range} />
                <input type="hidden" name="q" value={q} />
                <input
                  name="session"
                  defaultValue={sessionQuery}
                  placeholder="Session id (uuid)"
                  className="h-10 flex-1 rounded-xl border border-input bg-background px-3 font-mono text-xs shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="submit"
                  className="h-10 shrink-0 rounded-xl bg-renovision-navy px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 dark:bg-renovision-orange dark:text-renovision-navy"
                >
                  Inspect session
                </button>
              </form>
              {sessionQuery && !sessionDrilldown ? (
                <p className="mt-2 text-xs text-muted-foreground">No session found for that id.</p>
              ) : null}
              {sessionDrilldown ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard title="Session" value={`${sessionDrilldown.sessionId.slice(0, 8)}…`} />
                    <MetricCard title="First gens used" value={sessionDrilldown.initialGenerationsUsed} />
                    <MetricCard title="Refinements used" value={sessionDrilldown.regenerationsUsed} />
                    <MetricCard title="Updated" value={new Date(sessionDrilldown.updatedAt).toLocaleString()} />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                    <span className="font-medium">Attribution:</span>{" "}
                    {sessionDrilldown.attribution ? JSON.stringify(sessionDrilldown.attribution) : "—"}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="overflow-x-auto rounded-xl border border-border/60">
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-border/60 bg-muted/20">
                            <th className="px-3 py-2 font-medium">Project</th>
                            <th className="px-3 py-2 font-medium">Room</th>
                            <th className="px-3 py-2 font-medium">Owner</th>
                            <th className="px-3 py-2 font-medium">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessionDrilldown.projects.length === 0 ? (
                            <tr><td colSpan={4} className="px-3 py-3 text-muted-foreground">No projects.</td></tr>
                          ) : (
                            sessionDrilldown.projects.map((p) => (
                              <tr key={p.id} className="border-b border-border/40 last:border-0">
                                <td className="px-3 py-2 font-mono">{p.id.slice(0, 8)}…</td>
                                <td className="px-3 py-2">{p.roomKind}</td>
                                <td className="px-3 py-2">{p.userId ? `User ${p.userId.slice(0, 8)}…` : "Guest"}</td>
                                <td className="px-3 py-2 text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-border/60">
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-border/60 bg-muted/20">
                            <th className="px-3 py-2 font-medium">Generation</th>
                            <th className="px-3 py-2 font-medium">Style</th>
                            <th className="px-3 py-2 font-medium">Lead submitted</th>
                            <th className="px-3 py-2 font-medium">Preview</th>
                            <th className="px-3 py-2 font-medium">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessionDrilldown.generations.length === 0 ? (
                            <tr><td colSpan={5} className="px-3 py-3 text-muted-foreground">No generations.</td></tr>
                          ) : (
                            sessionDrilldown.generations.map((g) => (
                              <tr key={g.id} className="border-b border-border/40 last:border-0">
                                <td className="px-3 py-2 font-mono">{g.id.slice(0, 8)}…</td>
                                <td className="px-3 py-2">{g.selectedStyle || "—"}</td>
                                <td className="px-3 py-2">{g.leadSubmitted ? "Yes" : "No"}</td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-2">
                                    {g.beforeImageUrl ? (
                                      <a
                                        href={g.beforeImageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-renovision-navy underline-offset-2 hover:underline"
                                      >
                                        Before
                                      </a>
                                    ) : null}
                                    {g.afterImageUrl ? (
                                      <a
                                        href={g.afterImageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-renovision-navy underline-offset-2 hover:underline"
                                      >
                                        After
                                      </a>
                                    ) : null}
                                    {!g.beforeImageUrl && !g.afterImageUrl ? "—" : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{new Date(g.createdAt).toLocaleString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full min-w-[720px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20">
                          <th className="px-3 py-2 font-medium">Occurred</th>
                          <th className="px-3 py-2 font-medium">Event</th>
                          <th className="px-3 py-2 font-medium">Project</th>
                          <th className="px-3 py-2 font-medium">Event id</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionDrilldown.events.length === 0 ? (
                          <tr><td colSpan={4} className="px-3 py-3 text-muted-foreground">No events.</td></tr>
                        ) : (
                          sessionDrilldown.events.map((e) => (
                            <tr key={e.id} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2 text-muted-foreground">{new Date(e.occurredAt).toLocaleString()}</td>
                              <td className="px-3 py-2">{e.eventType}</td>
                              <td className="px-3 py-2 font-mono">{e.projectId ? `${e.projectId.slice(0, 8)}…` : "—"}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{e.id.slice(0, 8)}…</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full min-w-[860px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20">
                          <th className="px-3 py-2 font-medium">Created</th>
                          <th className="px-3 py-2 font-medium">Project</th>
                          <th className="px-3 py-2 font-medium">Version</th>
                          <th className="px-3 py-2 font-medium">Mockup id</th>
                          <th className="px-3 py-2 font-medium">Image</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionDrilldown.mockups.length === 0 ? (
                          <tr><td colSpan={5} className="px-3 py-3 text-muted-foreground">No mockup versions found.</td></tr>
                        ) : (
                          sessionDrilldown.mockups.map((m) => (
                            <tr key={m.id} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2 text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</td>
                              <td className="px-3 py-2 font-mono">{m.projectId.slice(0, 8)}…</td>
                              <td className="px-3 py-2">v{m.generationNumber}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">{m.id.slice(0, 8)}…</td>
                              <td className="px-3 py-2">
                                {m.imageUrl ? (
                                  <a
                                    href={m.imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-renovision-navy underline-offset-2 hover:underline"
                                  >
                                    Open image
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>

            <TableShell title="Users" subtitle="Registered accounts in range — project and mockup activity.">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Signup</th>
                    <th className="px-4 py-2 font-medium">Admin</th>
                    <th className="px-4 py-2 font-medium">Projects</th>
                    <th className="px-4 py-2 font-medium">First</th>
                    <th className="px-4 py-2 font-medium">Refines</th>
                    <th className="px-4 py-2 font-medium">Lead submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                        No rows.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.userId} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-2 font-mono text-xs">{u.email ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(u.signupAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">{u.isAdmin ? "Yes" : "—"}</td>
                        <td className="px-4 py-2 tabular-nums">{u.totalProjects}</td>
                        <td className="px-4 py-2 tabular-nums">{u.initialMockups}</td>
                        <td className="px-4 py-2 tabular-nums">{u.regenMockups}</td>
                        <td className="px-4 py-2">{u.remodelerRequested ? "Yes" : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableShell>

            <TableShell title="Anonymous sessions" subtitle="Guest /try sessions — use Inspect to open the drill-down.">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="px-4 py-2 font-medium">Session</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">First gen</th>
                    <th className="px-4 py-2 font-medium">Refines</th>
                    <th className="px-4 py-2 font-medium">Converted</th>
                    <th className="px-4 py-2 font-medium">Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                        No rows.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((s) => (
                      <tr key={s.sessionId} className="border-b border-border/40 last:border-0">
                        <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs">{s.sessionId}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 tabular-nums">{s.initialGenerationsUsed}</td>
                        <td className="px-4 py-2 tabular-nums">{s.regenerationsUsed}</td>
                        <td className="px-4 py-2">{s.convertedToSignup ? "Yes" : "—"}</td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/renovision?range=${encodeURIComponent(range)}${q ? `&q=${encodeURIComponent(q)}` : ""}&session=${encodeURIComponent(s.sessionId)}`}
                            className="text-xs font-medium text-renovision-navy underline-offset-4 hover:underline"
                          >
                            Inspect
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableShell>

            <TableShell
              title="Preview projects"
              subtitle="Try projects with before photo, original prompt, and per-version preview thumbs."
            >
              <table className="w-full min-w-[1380px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Room</th>
                    <th className="px-4 py-2 font-medium">Owner</th>
                    <th className="px-4 py-2 font-medium">Style</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                    <th className="px-4 py-2 font-medium">First</th>
                    <th className="px-4 py-2 font-medium">Refines</th>
                    <th className="px-4 py-2 font-medium">Original before</th>
                    <th className="px-4 py-2 font-medium">Original prompt</th>
                    <th className="px-4 py-2 font-medium">All images</th>
                    <th className="px-4 py-2 font-medium">Lead submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-6 text-muted-foreground">
                        No rows.
                      </td>
                    </tr>
                  ) : (
                    projects.map((p) => (
                      <tr key={p.projectId} className="border-b border-border/40 last:border-0">
                        <td className="max-w-[200px] truncate px-4 py-2 font-mono text-xs">{p.projectId}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(p.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">{p.roomKind}</td>
                        <td className="px-4 py-2 text-xs">
                          {p.userId ? (
                            <span className="text-muted-foreground">User {p.userId.slice(0, 8)}…</span>
                          ) : p.anonymousSessionId ? (
                            <span className="text-muted-foreground">Guest {p.anonymousSessionId.slice(0, 8)}…</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs">{p.selectedStyle ?? "—"}</td>
                        <td className="px-4 py-2 tabular-nums">{p.mockupCount}</td>
                        <td className="px-4 py-2 tabular-nums">{p.initialCount}</td>
                        <td className="px-4 py-2 tabular-nums">{p.regenCount}</td>
                        <td className="px-4 py-2">
                          {p.originalBeforeImageUrl ? (
                            <PreviewThumb
                              href={p.originalBeforeImageUrl}
                              label={`Project ${p.projectId} original before image`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="max-w-[260px] px-4 py-2 text-xs text-muted-foreground">
                          {p.originalUserPrompt ? (
                            <span title={p.originalUserPrompt} className="line-clamp-3">
                              {p.originalUserPrompt}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {p.previewImages.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {p.previewImages.map((img) => (
                                <div key={img.mockupId} className="rounded-md border border-border/50 p-1">
                                  <PreviewThumb
                                    href={img.imageUrl}
                                    label={`Project ${p.projectId} image v${img.generationNumber}`}
                                  />
                                  <div className="mt-1 flex flex-col gap-0.5">
                                    <span className="text-[10px] text-muted-foreground">
                                      v{img.generationNumber} - {img.refinementType}
                                    </span>
                                    {img.customPrompt ? (
                                      <span title={img.customPrompt} className="max-w-[180px] truncate text-[10px] text-muted-foreground">
                                        Custom: {img.customPrompt}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">{p.remodelerRequested ? "Yes" : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableShell>

            <TableShell title="All mockups" subtitle="Every saved preview version (signed-in and guest).">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Mockup</th>
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 font-medium">Generation</th>
                    <th className="px-4 py-2 font-medium">Owner type</th>
                    <th className="px-4 py-2 font-medium">Owner id</th>
                  </tr>
                </thead>
                <tbody>
                  {mockups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                        No mockups found.
                      </td>
                    </tr>
                  ) : (
                    mockups.map((m) => (
                      <tr key={m.mockupId} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(m.createdAt).toLocaleString()}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs">{m.mockupId}</td>
                        <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs">{m.projectId}</td>
                        <td className="px-4 py-2 tabular-nums">v{m.generationNumber}</td>
                        <td className="px-4 py-2">{m.ownerType}</td>
                        <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                          {m.ownerId ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableShell>

            <TableShell title="Connect Me lead requests" subtitle="Homeowner submissions from /try.">
              <table className="w-full min-w-[1200px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Phone</th>
                    <th className="px-4 py-2 font-medium">ZIP</th>
                    <th className="px-4 py-2 font-medium">Timeline</th>
                    <th className="px-4 py-2 font-medium">Budget</th>
                    <th className="px-4 py-2 font-medium">Style</th>
                    <th className="px-4 py-2 font-medium">Estimate</th>
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 font-medium">Generation</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-6 text-muted-foreground">
                        No lead requests found.
                      </td>
                    </tr>
                  ) : (
                    leads.map((l) => (
                      <tr key={l.leadId} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2">{l.name}</td>
                        <td className="px-4 py-2">{l.email}</td>
                        <td className="px-4 py-2">{l.phone}</td>
                        <td className="px-4 py-2">{l.zipCode}</td>
                        <td className="px-4 py-2">{l.timeline}</td>
                        <td className="px-4 py-2">{l.budgetRange}</td>
                        <td className="px-4 py-2">{l.selectedStyle}</td>
                        <td className="px-4 py-2 tabular-nums">${l.estimateMin}–${l.estimateMax}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                          {l.projectId ? `${l.projectId.slice(0, 8)}…` : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                          {l.generationId ? `${l.generationId.slice(0, 8)}…` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableShell>

            <TableShell
              title="Attribution"
              subtitle="Recent rows tying marketing params to generations, saves, and leads."
            >
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Platform</th>
                    <th className="px-4 py-2 font-medium">Campaign</th>
                    <th className="px-4 py-2 font-medium">Video</th>
                    <th className="px-4 py-2 font-medium">Record</th>
                  </tr>
                </thead>
                <tbody>
                  {attributionRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                        No attribution rows found.
                      </td>
                    </tr>
                  ) : (
                    attributionRows.map((row) => (
                      <tr key={`${row.kind}-${row.id}`} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">{row.kind}</td>
                        <td className="px-4 py-2">{row.source}</td>
                        <td className="px-4 py-2">{row.platform}</td>
                        <td className="px-4 py-2">{row.campaign}</td>
                        <td className="px-4 py-2">{row.video}</td>
                        <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                          {row.id}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableShell>
            </div>
          </PageSection>
        </>
      ) : null}
    </div>
  );
}
