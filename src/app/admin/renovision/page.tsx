import Link from "next/link";

import {
  fetchRenovisionActiveProjects,
  fetchRenovisionActiveSessions,
  fetchRenovisionAdminAnonSessionsTable,
  fetchRenovisionAdminFunnel,
  fetchRecentAttributionRows,
  fetchRenovisionSessionDrilldown,
  fetchRenovisionAdminLeadsTable,
  fetchRenovisionAdminOverview,
  fetchRenovisionAdminProjectsTable,
  fetchRenovisionAdminMockupsTable,
  fetchRenovisionAdminTrends,
  fetchRenovisionAdminUsersTable,
  parseRenovisionAdminRange,
  type RenovisionTrendPoint,
} from "@/lib/data/renovision-admin-dashboard";
import { cn } from "@/lib/utils";

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
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function trendMetric(
  p: RenovisionTrendPoint,
  keyField: "anonymousSessions" | "firstMockups" | "signups" | "remodelerRequests",
): number {
  return p[keyField];
}

function TrendBars({
  points,
  keyField,
  colorClass,
}: {
  points: RenovisionTrendPoint[];
  keyField: "anonymousSessions" | "firstMockups" | "signups" | "remodelerRequests";
  colorClass: string;
}) {
  const vals = points.map((p) => trendMetric(p, keyField));
  const max = Math.max(1, ...vals);
  return (
    <div className="flex h-36 items-end gap-1">
      {points.map((p) => {
        const v = trendMetric(p, keyField);
        const h = Math.round((v / max) * 100);
        return (
          <div key={p.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className={cn("w-full max-w-[28px] rounded-t-md transition-opacity", colorClass)}
              style={{ height: `${Math.max(4, h)}%` }}
              title={`${p.label}: ${v}`}
            />
            <span className="hidden truncate text-[10px] text-muted-foreground sm:block">{p.label}</span>
          </div>
        );
      })}
    </div>
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
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Renovision control center</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Homeowner /try usage, conversion, and remodeler interest. Data is aggregated server-side from Supabase
            (service role). Grant admin with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">profiles.is_admin</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">ADMIN_EMAILS</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["7d", "Last 7 days"],
              ["30d", "Last 30 days"],
              ["all", "All time"],
            ] as const
          ).map(([r, label]) => (
            <Link
              key={r}
              href={rangeHref(r)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                range === r
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      {overview ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              title="Signed-in generations"
              value={overview.totalSignedInMockups}
              hint="All mockups on saved-to-account projects"
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
          </section>

          <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Activity trends</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {range === "all" ? "Last 12 months (monthly)" : range === "7d" ? "Last 7 days (daily)" : "Last 30 days (daily)"}
              </p>
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Guest sessions</p>
                <TrendBars points={trends} keyField="anonymousSessions" colorClass="bg-renovision-orange/80" />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">First previews</p>
                <TrendBars points={trends} keyField="firstMockups" colorClass="bg-renovision-teal/80" />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Signups</p>
                <TrendBars points={trends} keyField="signups" colorClass="bg-foreground/70" />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Connect Me leads</p>
                <TrendBars points={trends} keyField="remodelerRequests" colorClass="bg-violet-500/75" />
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight">Funnel</h2>
              <p className="mt-1 text-sm text-muted-foreground">Counts for the selected range (see card subtitles).</p>
              <ol className="mt-6 space-y-4">
                {funnel.map((step, i) => (
                  <li key={step.id} className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{step.label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{step.count}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="space-y-6">
              <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-tight">Most active projects</h2>
                <ul className="mt-4 space-y-3 text-sm">
                  {activeProjects.length === 0 ? (
                    <li className="text-muted-foreground">No preview runs yet.</li>
                  ) : (
                    activeProjects.map((p) => (
                      <li key={p.projectId} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                        <span className="truncate font-mono text-xs text-muted-foreground">{p.projectId.slice(0, 8)}…</span>
                        <span className="shrink-0 tabular-nums font-medium">{p.mockupCount} runs</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-tight">Most active guest sessions</h2>
                <ul className="mt-4 space-y-3 text-sm">
                  {activeSessions.length === 0 ? (
                    <li className="text-muted-foreground">No sessions yet.</li>
                  ) : (
                    activeSessions.map((s) => (
                      <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                        <span className="font-mono text-xs text-muted-foreground">{s.sessionId.slice(0, 8)}…</span>
                        <span className="text-xs text-muted-foreground">
                          {s.initialUsed} first + {s.regenUsed} refinements
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
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Tables</h2>
              <form className="flex w-full max-w-md gap-2" action="/admin/renovision" method="get">
                <input type="hidden" name="range" value={range} />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search id or email…"
                  className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
                />
                <button
                  type="submit"
                  className="h-9 shrink-0 rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium hover:bg-muted"
                >
                  Filter
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold">Session inspector</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Paste a full anonymous session id to inspect attribution, projects, generations, leads, and events.
              </p>
              <form className="mt-3 flex w-full max-w-3xl gap-2" action="/admin/renovision" method="get">
                <input type="hidden" name="range" value={range} />
                <input type="hidden" name="q" value={q} />
                <input
                  name="session"
                  defaultValue={sessionQuery}
                  placeholder="Session id (uuid)"
                  className="h-9 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-xs shadow-sm"
                />
                <button
                  type="submit"
                  className="h-9 shrink-0 rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium hover:bg-muted"
                >
                  Inspect
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

            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
              <h3 className="border-b border-border/60 bg-muted/30 px-4 py-3 text-sm font-semibold">Users</h3>
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
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
              <h3 className="border-b border-border/60 bg-muted/30 px-4 py-3 text-sm font-semibold">Anonymous sessions</h3>
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
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
              <h3 className="border-b border-border/60 bg-muted/30 px-4 py-3 text-sm font-semibold">Preview projects</h3>
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium">Room</th>
                    <th className="px-4 py-2 font-medium">Owner</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                    <th className="px-4 py-2 font-medium">First</th>
                    <th className="px-4 py-2 font-medium">Refines</th>
                    <th className="px-4 py-2 font-medium">Lead submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-muted-foreground">
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
                        <td className="px-4 py-2 tabular-nums">{p.mockupCount}</td>
                        <td className="px-4 py-2 tabular-nums">{p.initialCount}</td>
                        <td className="px-4 py-2 tabular-nums">{p.regenCount}</td>
                        <td className="px-4 py-2">{p.remodelerRequested ? "Yes" : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
              <h3 className="border-b border-border/60 bg-muted/30 px-4 py-3 text-sm font-semibold">
                All mockups (user + guest)
              </h3>
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
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
              <h3 className="border-b border-border/60 bg-muted/30 px-4 py-3 text-sm font-semibold">
                Connect Me lead requests
              </h3>
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
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
              <h3 className="border-b border-border/60 bg-muted/30 px-4 py-3 text-sm font-semibold">
                Attribution (generated, saved, leads)
              </h3>
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
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
