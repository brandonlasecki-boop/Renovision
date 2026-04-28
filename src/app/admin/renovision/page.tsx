import Link from "next/link";

import {
  fetchRenovisionActiveProjects,
  fetchRenovisionActiveSessions,
  fetchRenovisionAdminAnonSessionsTable,
  fetchRenovisionAdminFunnel,
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
  searchParams: Promise<{ range?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const range = parseRenovisionAdminRange(sp.range);
  const q = (sp.q ?? "").trim();

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
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load Renovision analytics.";
  }

  const rangeHref = (r: string) => {
    const params = new URLSearchParams();
    params.set("range", r);
    if (q) params.set("q", q);
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
            <MetricCard title="Remodeler requests" value={overview.totalRemodelerRequests} />
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
              title="Signup → remodeler ask"
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
                <p className="mb-2 text-xs font-medium text-muted-foreground">Remodeler requests</p>
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
                    <th className="px-4 py-2 font-medium">Remodeler</th>
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
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-muted-foreground">
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
                    <th className="px-4 py-2 font-medium">Remodeler</th>
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
          </section>
        </>
      ) : null}
    </div>
  );
}
