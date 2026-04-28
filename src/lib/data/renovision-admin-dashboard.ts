import { createServiceClient } from "@/lib/supabase/service";
import { sanitizeAttribution, type RenovisionAttribution } from "@/lib/renovision/attribution";

export type RenovisionAdminRange = "7d" | "30d" | "all";

export function parseRenovisionAdminRange(raw: string | undefined): RenovisionAdminRange {
  if (raw === "30d" || raw === "all") return raw;
  return "7d";
}

/** Inclusive lower bound for `created_at` / `occurred_at` filters; null = all time. */
export function rangeLowerBoundIso(range: RenovisionAdminRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function pct(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addUtcDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMonthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export type RenovisionAdminOverview = {
  range: RenovisionAdminRange;
  fromIso: string | null;
  totalAnonymousSessions: number;
  totalRegisteredUsers: number;
  totalSignupsInRange: number;
  /** Mockups with mockup_generation === 1 */
  totalInitialGenerations: number;
  /** Mockups with mockup_generation > 1 */
  totalRegenerations: number;
  /** All mockups on projects with user_id set */
  totalSignedInMockups: number;
  /** initial + regeneration mockups in range */
  totalGenerations: number;
  totalRemodelerRequests: number;
  /** Projects with at least one mockup (first preview delivered). */
  projectsWithFirstMockup: number;
  /** Anonymous → claimed account in range (anon_converted_at). */
  anonymousConvertedToSignup: number;
  conversionVisitorToFirstGen: number | null;
  conversionAnonymousToSignup: number | null;
  conversionSignupToRemodeler: number | null;
};

export type RenovisionTrendPoint = {
  key: string;
  label: string;
  anonymousSessions: number;
  firstMockups: number;
  signups: number;
  remodelerRequests: number;
};

export type RenovisionFunnelStep = {
  id: string;
  label: string;
  count: number;
};

export type RenovisionActiveProjectRow = {
  projectId: string;
  mockupCount: number;
  createdAt: string;
  ownerLabel: string;
};

export type RenovisionActiveSessionRow = {
  sessionId: string;
  createdAt: string;
  initialUsed: number;
  regenUsed: number;
  activityScore: number;
  convertedToSignup: boolean;
};

export type RenovisionAdminUserRow = {
  userId: string;
  email: string | null;
  signupAt: string;
  isAdmin: boolean;
  totalProjects: number;
  totalMockups: number;
  initialMockups: number;
  regenMockups: number;
  remodelerRequested: boolean;
};

export type RenovisionAdminAnonSessionRow = {
  sessionId: string;
  createdAt: string;
  initialGenerationsUsed: number;
  regenerationsUsed: number;
  convertedToSignup: boolean;
};

export type RenovisionAdminProjectRow = {
  projectId: string;
  createdAt: string;
  roomKind: string;
  userId: string | null;
  anonymousSessionId: string | null;
  convertedFromAnon: boolean;
  mockupCount: number;
  initialCount: number;
  regenCount: number;
  remodelerRequested: boolean;
};

export type RenovisionAdminMockupRow = {
  mockupId: string;
  projectId: string;
  createdAt: string;
  generationNumber: number;
  ownerType: "user" | "guest" | "unknown";
  ownerId: string | null;
};

export type RenovisionAttributionAdminRow = {
  id: string;
  createdAt: string;
  kind: "generation" | "saved_project" | "lead";
  source: string;
  platform: string;
  campaign: string;
  video: string;
};

async function countRows(
  table: string,
  opts: { fromIso: string | null; column?: string },
): Promise<number> {
  const svc = createServiceClient();
  const col = opts.column ?? "created_at";
  let q = svc.from(table).select("*", { count: "exact", head: true });
  if (opts.fromIso) {
    q = q.gte(col, opts.fromIso);
  }
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countSignedInMockupsInRange(fromIso: string | null): Promise<number> {
  const svc = createServiceClient();
  const { data: mockRows, error: mErr } = await svc
    .from("homeowner_try_mockups")
    .select("project_id, created_at");
  if (mErr) throw new Error(mErr.message);
  const { data: projRows, error: pErr } = await svc.from("homeowner_try_projects").select("id, user_id");
  if (pErr) throw new Error(pErr.message);
  const signedInProjectIds = new Set(
    (projRows ?? []).filter((p) => p.user_id).map((p) => String(p.id)),
  );
  let c = 0;
  for (const m of mockRows ?? []) {
    if (fromIso && String(m.created_at) < fromIso) continue;
    if (signedInProjectIds.has(String(m.project_id))) c += 1;
  }
  return c;
}

export async function fetchRenovisionAdminOverview(range: RenovisionAdminRange): Promise<RenovisionAdminOverview> {
  const svc = createServiceClient();
  const fromIso = rangeLowerBoundIso(range);

  const [
    anonSessions,
    profilesCount,
    signupsInRange,
    remodelerReq,
    converted,
  ] = await Promise.all([
    countRows("renovision_anonymous_sessions", { fromIso }),
    countRows("profiles", { fromIso: null }),
    countRows("profiles", { fromIso }),
    countRows("renovision_remodeler_requests", { fromIso }),
    (async () => {
      let q = svc
        .from("homeowner_try_projects")
        .select("*", { count: "exact", head: true })
        .not("anon_converted_at", "is", null);
      if (fromIso) q = q.gte("anon_converted_at", fromIso);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    })(),
  ]);

  let mockInitialQ = svc
    .from("homeowner_try_mockups")
    .select("*", { count: "exact", head: true })
    .eq("mockup_generation", 1);
  if (fromIso) mockInitialQ = mockInitialQ.gte("created_at", fromIso);
  const { count: initialGens, error: e1 } = await mockInitialQ;
  if (e1) throw new Error(e1.message);

  let mockRegenQ = svc
    .from("homeowner_try_mockups")
    .select("*", { count: "exact", head: true })
    .gt("mockup_generation", 1);
  if (fromIso) mockRegenQ = mockRegenQ.gte("created_at", fromIso);
  const { count: regenGens, error: e2 } = await mockRegenQ;
  if (e2) throw new Error(e2.message);

  const signedInMockupsResolved = await countSignedInMockupsInRange(fromIso);

  let projectsFirstQ = svc.from("homeowner_try_projects").select("id");
  if (fromIso) projectsFirstQ = projectsFirstQ.gte("created_at", fromIso);
  const { data: projectIds, error: e4 } = await projectsFirstQ;
  if (e4) throw new Error(e4.message);
  const ids = (projectIds ?? []).map((p) => String(p.id));
  let projectsWithFirstMockup = 0;
  if (ids.length) {
    const { data: gens, error: e5 } = await svc
      .from("homeowner_try_mockups")
      .select("project_id")
      .eq("mockup_generation", 1)
      .in("project_id", ids);
    if (e5) throw new Error(e5.message);
    projectsWithFirstMockup = new Set((gens ?? []).map((g) => String(g.project_id))).size;
  }

  const visitorDenominator = anonSessions;
  const firstGenNumerator = initialGens ?? 0;
  const totalGenerations = (initialGens ?? 0) + (regenGens ?? 0);
  const anonToSignupDenom = anonSessions;
  const signupToRemodelerDenom = fromIso ? signupsInRange : profilesCount;

  return {
    range,
    fromIso,
    totalAnonymousSessions: anonSessions,
    totalRegisteredUsers: profilesCount,
    totalSignupsInRange: signupsInRange,
    totalInitialGenerations: initialGens ?? 0,
    totalRegenerations: regenGens ?? 0,
    totalSignedInMockups: signedInMockupsResolved,
    totalGenerations,
    totalRemodelerRequests: remodelerReq,
    projectsWithFirstMockup,
    anonymousConvertedToSignup: converted,
    conversionVisitorToFirstGen: pct(firstGenNumerator, visitorDenominator),
    conversionAnonymousToSignup: pct(converted, anonToSignupDenom),
    conversionSignupToRemodeler: pct(remodelerReq, signupToRemodelerDenom),
  };
}

export async function fetchRenovisionAdminTrends(range: RenovisionAdminRange): Promise<RenovisionTrendPoint[]> {
  const svc = createServiceClient();
  const now = new Date();

  if (range === "all") {
    const start = new Date(now);
    start.setUTCMonth(start.getUTCMonth() - 11);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const buckets: RenovisionTrendPoint[] = [];
    for (let i = 0; i < 12; i += 1) {
      const monthStart = new Date(start);
      monthStart.setUTCMonth(start.getUTCMonth() + i);
      const next = new Date(monthStart);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const key = monthStart.toISOString().slice(0, 7);
      const { data: sessions } = await svc
        .from("renovision_anonymous_sessions")
        .select("id")
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", next.toISOString());
      const { data: mockups } = await svc
        .from("homeowner_try_mockups")
        .select("id")
        .eq("mockup_generation", 1)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", next.toISOString());
      const { data: profs } = await svc
        .from("profiles")
        .select("id")
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", next.toISOString());
      const { data: reqs } = await svc
        .from("renovision_remodeler_requests")
        .select("id")
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", next.toISOString());
      buckets.push({
        key,
        label: formatMonthLabel(monthStart.toISOString()),
        anonymousSessions: (sessions ?? []).length,
        firstMockups: (mockups ?? []).length,
        signups: (profs ?? []).length,
        remodelerRequests: (reqs ?? []).length,
      });
    }
    return buckets;
  }

  const days = range === "7d" ? 7 : 30;
  const endDay = startOfUtcDay(now);
  const startDay = addUtcDays(endDay, -(days - 1));
  const buckets: RenovisionTrendPoint[] = [];

  for (let i = 0; i < days; i += 1) {
    const day = addUtcDays(startDay, i);
    const next = addUtcDays(day, 1);
    const { data: sessions } = await svc
      .from("renovision_anonymous_sessions")
      .select("id")
      .gte("created_at", day.toISOString())
      .lt("created_at", next.toISOString());
    const { data: mockups } = await svc
      .from("homeowner_try_mockups")
      .select("id")
      .eq("mockup_generation", 1)
      .gte("created_at", day.toISOString())
      .lt("created_at", next.toISOString());
    const { data: profs } = await svc
      .from("profiles")
      .select("id")
      .gte("created_at", day.toISOString())
      .lt("created_at", next.toISOString());
    const { data: reqs } = await svc
      .from("renovision_remodeler_requests")
      .select("id")
      .gte("created_at", day.toISOString())
      .lt("created_at", next.toISOString());
    const key = day.toISOString().slice(0, 10);
    buckets.push({
      key,
      label: formatDayLabel(day.toISOString()),
      anonymousSessions: (sessions ?? []).length,
      firstMockups: (mockups ?? []).length,
      signups: (profs ?? []).length,
      remodelerRequests: (reqs ?? []).length,
    });
  }

  return buckets;
}

export async function fetchRenovisionAdminFunnel(range: RenovisionAdminRange): Promise<RenovisionFunnelStep[]> {
  const o = await fetchRenovisionAdminOverview(range);
  return [
    { id: "visitors", label: "Anonymous sessions (guest browsers)", count: o.totalAnonymousSessions },
    { id: "first_gen", label: "First previews generated", count: o.totalInitialGenerations },
    { id: "signups", label: "New accounts (in range)", count: o.totalSignupsInRange },
    {
      id: "remodeler",
      label: "Remodeler interest requests",
      count: o.totalRemodelerRequests,
    },
  ];
}

export async function fetchRenovisionActiveProjects(limit = 15): Promise<RenovisionActiveProjectRow[]> {
  const svc = createServiceClient();
  const { data: mockRows, error } = await svc.from("homeowner_try_mockups").select("project_id");
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const m of mockRows ?? []) {
    const id = String(m.project_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (!sorted.length) return [];
  const ids = sorted.map(([id]) => id);
  const { data: projects, error: e2 } = await svc
    .from("homeowner_try_projects")
    .select("id, created_at, user_id, anonymous_session_id")
    .in("id", ids);
  if (e2) throw new Error(e2.message);
  const byId = new Map((projects ?? []).map((p) => [String(p.id), p]));
  return sorted.map(([projectId, mockupCount]) => {
    const p = byId.get(projectId);
    const ownerLabel = p?.user_id
      ? `User ${String(p.user_id).slice(0, 8)}…`
      : p?.anonymous_session_id
        ? `Guest ${String(p.anonymous_session_id).slice(0, 8)}…`
        : "—";
    return {
      projectId,
      mockupCount,
      createdAt: p?.created_at ? String(p.created_at) : "",
      ownerLabel,
    };
  });
}

export async function fetchRenovisionActiveSessions(limit = 15): Promise<RenovisionActiveSessionRow[]> {
  const svc = createServiceClient();
  const { data: sessions, error } = await svc
    .from("renovision_anonymous_sessions")
    .select("id, created_at, initial_generations_used, regenerations_used")
    .order("updated_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const { data: converted } = await svc
    .from("homeowner_try_projects")
    .select("converted_from_anon_session_id")
    .not("converted_from_anon_session_id", "is", null);
  const convertedSet = new Set(
    (converted ?? []).map((r) => String(r.converted_from_anon_session_id)),
  );
  const scored = (sessions ?? []).map((s) => {
    const initialUsed = Number(s.initial_generations_used ?? 0);
    const regenUsed = Number(s.regenerations_used ?? 0);
    const activityScore = initialUsed + regenUsed;
    return {
      sessionId: String(s.id),
      createdAt: String(s.created_at),
      initialUsed,
      regenUsed,
      activityScore,
      convertedToSignup: convertedSet.has(String(s.id)),
    };
  });
  scored.sort((a, b) => b.activityScore - a.activityScore || (a.createdAt < b.createdAt ? 1 : -1));
  return scored.slice(0, limit);
}

export async function fetchRenovisionAdminUsersTable(
  range: RenovisionAdminRange,
  search: string,
): Promise<RenovisionAdminUserRow[]> {
  const svc = createServiceClient();
  const fromIso = rangeLowerBoundIso(range);
  let pq = svc.from("profiles").select("id, created_at, is_admin").order("created_at", { ascending: false }).limit(400);
  if (fromIso) pq = pq.gte("created_at", fromIso);
  const { data: profiles, error } = await pq;
  if (error) throw new Error(error.message);

  const { data: mockRows } = await svc
    .from("homeowner_try_mockups")
    .select("id, mockup_generation, project_id, created_at");
  const { data: projRows } = await svc.from("homeowner_try_projects").select("id, user_id, created_at");
  const userByProject = new Map<string, string | null>();
  for (const p of projRows ?? []) {
    userByProject.set(String(p.id), (p.user_id as string | null) ?? null);
  }

  const mockupsByUser = new Map<
    string,
    { total: number; initial: number; regen: number; projects: Set<string> }
  >();
  for (const m of mockRows ?? []) {
    const uid = userByProject.get(String(m.project_id));
    if (!uid) continue;
    if (fromIso && String(m.created_at) < fromIso) continue;
    const cur = mockupsByUser.get(uid) ?? { total: 0, initial: 0, regen: 0, projects: new Set<string>() };
    cur.total += 1;
    cur.projects.add(String(m.project_id));
    if (Number(m.mockup_generation) === 1) cur.initial += 1;
    else cur.regen += 1;
    mockupsByUser.set(uid, cur);
  }

  const { data: reqRows } = await svc.from("renovision_remodeler_requests").select("user_id, created_at");
  const remodelerByUser = new Set<string>();
  for (const r of reqRows ?? []) {
    if (!r.user_id) continue;
    if (fromIso && String(r.created_at) < fromIso) continue;
    remodelerByUser.add(String(r.user_id));
  }

  const { data: authData, error: authErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authErr) throw new Error(authErr.message);
  const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const q = search.trim().toLowerCase();
  const rows: RenovisionAdminUserRow[] = (profiles ?? []).map((p) => {
    const userId = String(p.id);
    const stats = mockupsByUser.get(userId) ?? { total: 0, initial: 0, regen: 0, projects: new Set() };
    const email = emailById.get(userId) ?? null;
    return {
      userId,
      email,
      signupAt: String(p.created_at),
      isAdmin: Boolean(p.is_admin),
      totalProjects: stats.projects.size,
      totalMockups: stats.total,
      initialMockups: stats.initial,
      regenMockups: stats.regen,
      remodelerRequested: remodelerByUser.has(userId),
    };
  });

  if (!q) return rows;
  return rows.filter((r) => (r.email ?? "").toLowerCase().includes(q) || r.userId.toLowerCase().includes(q));
}

export async function fetchRenovisionAdminAnonSessionsTable(
  range: RenovisionAdminRange,
  search: string,
): Promise<RenovisionAdminAnonSessionRow[]> {
  const svc = createServiceClient();
  const fromIso = rangeLowerBoundIso(range);
  let q = svc
    .from("renovision_anonymous_sessions")
    .select("id, created_at, initial_generations_used, regenerations_used")
    .order("created_at", { ascending: false })
    .limit(500);
  if (fromIso) q = q.gte("created_at", fromIso);
  const { data: sessions, error } = await q;
  if (error) throw new Error(error.message);

  const { data: converted } = await svc
    .from("homeowner_try_projects")
    .select("converted_from_anon_session_id")
    .not("converted_from_anon_session_id", "is", null);
  const convertedSet = new Set(
    (converted ?? []).map((r) => String(r.converted_from_anon_session_id)),
  );

  const rows: RenovisionAdminAnonSessionRow[] = (sessions ?? []).map((s) => ({
    sessionId: String(s.id),
    createdAt: String(s.created_at),
    initialGenerationsUsed: Number(s.initial_generations_used ?? 0),
    regenerationsUsed: Number(s.regenerations_used ?? 0),
    convertedToSignup: convertedSet.has(String(s.id)),
  }));

  const sq = search.trim().toLowerCase();
  if (!sq) return rows;
  return rows.filter((r) => r.sessionId.toLowerCase().includes(sq));
}

export async function fetchRenovisionAdminProjectsTable(
  range: RenovisionAdminRange,
  search: string,
): Promise<RenovisionAdminProjectRow[]> {
  const svc = createServiceClient();
  const fromIso = rangeLowerBoundIso(range);
  let q = svc
    .from("homeowner_try_projects")
    .select(
      "id, created_at, room_kind, user_id, anonymous_session_id, converted_from_anon_session_id",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (fromIso) q = q.gte("created_at", fromIso);
  const { data: projects, error } = await q;
  if (error) throw new Error(error.message);

  const { data: mockRows } = await svc.from("homeowner_try_mockups").select("project_id, mockup_generation");
  const mockAgg = new Map<string, { total: number; initial: number; regen: number }>();
  for (const m of mockRows ?? []) {
    const pid = String(m.project_id);
    const cur = mockAgg.get(pid) ?? { total: 0, initial: 0, regen: 0 };
    cur.total += 1;
    if (Number(m.mockup_generation) === 1) cur.initial += 1;
    else cur.regen += 1;
    mockAgg.set(pid, cur);
  }

  const { data: reqRows } = await svc.from("renovision_remodeler_requests").select("project_id");
  const remodelerProjects = new Set(
    (reqRows ?? []).filter((r) => r.project_id).map((r) => String(r.project_id)),
  );

  const sq = search.trim().toLowerCase();
  const rows: RenovisionAdminProjectRow[] = (projects ?? []).map((p) => {
    const pid = String(p.id);
    const agg = mockAgg.get(pid) ?? { total: 0, initial: 0, regen: 0 };
    return {
      projectId: pid,
      createdAt: String(p.created_at),
      roomKind: String((p as { room_kind?: string }).room_kind ?? "bathroom"),
      userId: (p.user_id as string | null) ?? null,
      anonymousSessionId: (p.anonymous_session_id as string | null) ?? null,
      convertedFromAnon: Boolean((p as { converted_from_anon_session_id?: string }).converted_from_anon_session_id),
      mockupCount: agg.total,
      initialCount: agg.initial,
      regenCount: agg.regen,
      remodelerRequested: remodelerProjects.has(pid),
    };
  });

  if (!sq) return rows;
  return rows.filter(
    (r) =>
      r.projectId.toLowerCase().includes(sq) ||
      (r.userId && r.userId.toLowerCase().includes(sq)) ||
      (r.anonymousSessionId && r.anonymousSessionId.toLowerCase().includes(sq)),
  );
}

export async function fetchRenovisionAdminMockupsTable(
  range: RenovisionAdminRange,
  search: string,
): Promise<RenovisionAdminMockupRow[]> {
  const svc = createServiceClient();
  const fromIso = rangeLowerBoundIso(range);
  let q = svc
    .from("homeowner_try_mockups")
    .select("id, project_id, created_at, mockup_generation")
    .order("created_at", { ascending: false })
    .limit(800);
  if (fromIso) q = q.gte("created_at", fromIso);
  const { data: mockups, error } = await q;
  if (error) throw new Error(error.message);

  const projectIds = [...new Set((mockups ?? []).map((m) => String(m.project_id)))];
  const { data: projects, error: pErr } = projectIds.length
    ? await svc
        .from("homeowner_try_projects")
        .select("id, user_id, anonymous_session_id")
        .in("id", projectIds)
    : { data: [], error: null };
  if (pErr) throw new Error(pErr.message);

  const projectOwnerById = new Map(
    (projects ?? []).map((p) => [
      String(p.id),
      {
        userId: (p.user_id as string | null) ?? null,
        guestId: (p.anonymous_session_id as string | null) ?? null,
      },
    ]),
  );

  const rows: RenovisionAdminMockupRow[] = (mockups ?? []).map((m) => {
    const owner = projectOwnerById.get(String(m.project_id));
    if (owner?.userId) {
      return {
        mockupId: String(m.id),
        projectId: String(m.project_id),
        createdAt: String(m.created_at),
        generationNumber: Number(m.mockup_generation ?? 0),
        ownerType: "user",
        ownerId: owner.userId,
      };
    }
    if (owner?.guestId) {
      return {
        mockupId: String(m.id),
        projectId: String(m.project_id),
        createdAt: String(m.created_at),
        generationNumber: Number(m.mockup_generation ?? 0),
        ownerType: "guest",
        ownerId: owner.guestId,
      };
    }
    return {
      mockupId: String(m.id),
      projectId: String(m.project_id),
      createdAt: String(m.created_at),
      generationNumber: Number(m.mockup_generation ?? 0),
      ownerType: "unknown",
      ownerId: null,
    };
  });

  const sq = search.trim().toLowerCase();
  if (!sq) return rows;
  return rows.filter(
    (r) =>
      r.mockupId.toLowerCase().includes(sq) ||
      r.projectId.toLowerCase().includes(sq) ||
      (r.ownerId && r.ownerId.toLowerCase().includes(sq)),
  );
}

function attributionField(a: RenovisionAttribution | null, key: "source" | "src" | "platform" | "campaign" | "video" | "v"): string {
  const v = a?.[key];
  return typeof v === "string" && v.trim() ? v : "—";
}

export async function fetchRecentAttributionRows(limit = 100): Promise<RenovisionAttributionAdminRow[]> {
  const svc = createServiceClient();
  const [generationsRes, savedRes, leadsRes] = await Promise.all([
    svc
      .from("bathroom_generations")
      .select("id, created_at, attribution")
      .order("created_at", { ascending: false })
      .limit(limit),
    svc
      .from("renovision_saved_projects")
      .select("id, created_at, attribution")
      .order("created_at", { ascending: false })
      .limit(limit),
    svc
      .from("leads")
      .select("id, created_at, attribution")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (generationsRes.error) throw new Error(generationsRes.error.message);
  if (savedRes.error) throw new Error(savedRes.error.message);
  if (leadsRes.error) throw new Error(leadsRes.error.message);

  const rows: RenovisionAttributionAdminRow[] = [];
  for (const row of generationsRes.data ?? []) {
    const a = sanitizeAttribution((row as { attribution?: unknown }).attribution ?? null);
    rows.push({
      id: String(row.id),
      createdAt: String(row.created_at),
      kind: "generation",
      source: attributionField(a, "source") !== "—" ? attributionField(a, "source") : attributionField(a, "src"),
      platform: attributionField(a, "platform"),
      campaign: attributionField(a, "campaign"),
      video: attributionField(a, "video") !== "—" ? attributionField(a, "video") : attributionField(a, "v"),
    });
  }
  for (const row of savedRes.data ?? []) {
    const a = sanitizeAttribution((row as { attribution?: unknown }).attribution ?? null);
    rows.push({
      id: String(row.id),
      createdAt: String(row.created_at),
      kind: "saved_project",
      source: attributionField(a, "source") !== "—" ? attributionField(a, "source") : attributionField(a, "src"),
      platform: attributionField(a, "platform"),
      campaign: attributionField(a, "campaign"),
      video: attributionField(a, "video") !== "—" ? attributionField(a, "video") : attributionField(a, "v"),
    });
  }
  for (const row of leadsRes.data ?? []) {
    const a = sanitizeAttribution((row as { attribution?: unknown }).attribution ?? null);
    rows.push({
      id: String(row.id),
      createdAt: String(row.created_at),
      kind: "lead",
      source: attributionField(a, "source") !== "—" ? attributionField(a, "source") : attributionField(a, "src"),
      platform: attributionField(a, "platform"),
      campaign: attributionField(a, "campaign"),
      video: attributionField(a, "video") !== "—" ? attributionField(a, "video") : attributionField(a, "v"),
    });
  }

  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}
