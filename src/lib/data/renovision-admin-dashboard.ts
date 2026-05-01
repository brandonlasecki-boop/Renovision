import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
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

/** Start of calendar month UTC from `YYYY-MM` bucket key. */
function utcMonthStartIso(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return `${yyyyMm}-01T00:00:00.000Z`;
  return new Date(Date.UTC(y, m - 1, 1)).toISOString();
}

/** Exclusive end of calendar month UTC from `YYYY-MM` (first instant of next month). */
function utcMonthEndExclusiveIso(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return yyyyMm;
  return new Date(Date.UTC(y, m, 1)).toISOString();
}

async function attachWebsiteAndTryViewCounts(
  svc: ReturnType<typeof createServiceClient>,
  buckets: RenovisionTrendPoint[],
  range: RenovisionAdminRange,
): Promise<void> {
  if (buckets.length === 0) return;

  const firstKey = buckets[0].key;
  const lastKey = buckets[buckets.length - 1].key;

  let startIso: string;
  let endExclusiveIso: string;

  if (range === "all") {
    startIso = utcMonthStartIso(firstKey);
    endExclusiveIso = utcMonthEndExclusiveIso(lastKey);
  } else {
    startIso = `${firstKey}T00:00:00.000Z`;
    const lastDay = new Date(`${lastKey}T00:00:00.000Z`);
    lastDay.setUTCDate(lastDay.getUTCDate() + 1);
    endExclusiveIso = lastDay.toISOString();
  }

  const rows: { occurred_at: string; event_type: string }[] = [];
  let offset = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await svc
      .from("renovision_analytics_events")
      .select("occurred_at, event_type")
      .in("event_type", ["home_page_view", "try_page_view"])
      .gte("occurred_at", startIso)
      .lt("occurred_at", endExclusiveIso)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + page - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as { occurred_at: string; event_type: string }[];
    rows.push(...chunk);
    if (chunk.length < page) break;
    offset += page;
  }

  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

  for (const row of rows) {
    const iso = String(row.occurred_at ?? "");
    const eventType = String(row.event_type ?? "");
    const bucketKey = range === "all" ? iso.slice(0, 7) : iso.slice(0, 10);
    const idx = bucketIndex.get(bucketKey);
    if (idx === undefined) continue;
    if (eventType === "home_page_view") {
      buckets[idx].websiteViews += 1;
    } else if (eventType === "try_page_view") {
      buckets[idx].tryViews += 1;
    }
  }
}

export type RenovisionAdminOverview = {
  range: RenovisionAdminRange;
  fromIso: string | null;
  uniqueHomeVisitorsToday: number;
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
  /** `home_page_view` analytics events in the bucket (see AttributionTracker; once per browser per calendar day on `/`). */
  websiteViews: number;
  /** `try_page_view` analytics events in the bucket (once per browser per calendar day on `/try`). */
  tryViews: number;
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
  selectedStyle: string | null;
  originalUserPrompt: string | null;
  mockupCount: number;
  initialCount: number;
  regenCount: number;
  originalBeforeImageUrl: string | null;
  previewImages: Array<{
    mockupId: string;
    createdAt: string;
    generationNumber: number;
    imageUrl: string;
    refinementType: string;
    customPrompt: string | null;
  }>;
  remodelerRequested: boolean;
};

function extractCustomTweakFromAdditionalPrompt(additionalPrompt: string): string | null {
  const markerStart = "HOMEOWNER CUSTOM TWEAK (apply only compatible parts on top of everything above):";
  const markerEnd = "INTERPRETATION RULES FOR THE CUSTOM TEXT:";
  const start = additionalPrompt.indexOf(markerStart);
  if (start < 0) return null;
  const afterStart = additionalPrompt.slice(start + markerStart.length);
  const end = afterStart.indexOf(markerEnd);
  const raw = (end >= 0 ? afterStart.slice(0, end) : afterStart).trim();
  return raw || null;
}

function deriveRefinementType(params: {
  generationNumber: number;
  additionalPrompt: string;
  regenerateFromRoom: boolean | null;
}): string {
  if (params.generationNumber <= 1) return "Initial render";
  const hasSave = params.additionalPrompt.includes("SAVE MONEY / LOWER-COST");
  const hasDesign = params.additionalPrompt.includes("DESIGN UPGRADE");
  const hasCustom = params.additionalPrompt.includes("HOMEOWNER CUSTOM TWEAK");
  if (hasSave && hasDesign) return hasCustom ? "Save money + design + custom" : "Save money + design";
  if (hasSave) return hasCustom ? "Save money + custom" : "Save money";
  if (hasDesign) return hasCustom ? "Design upgrade + custom" : "Design upgrade";
  if (hasCustom) return "Custom tweak";
  if (params.regenerateFromRoom === false) return "Refine current preview";
  return "Regenerate from original";
}

export type RenovisionAdminMockupRow = {
  mockupId: string;
  projectId: string;
  createdAt: string;
  generationNumber: number;
  ownerType: "user" | "guest" | "unknown";
  ownerId: string | null;
};

export type RenovisionAdminLeadRow = {
  leadId: string;
  createdAt: string;
  generationId: string | null;
  projectId: string | null;
  name: string;
  email: string;
  phone: string;
  zipCode: string;
  timeline: string;
  budgetRange: string;
  selectedStyle: string;
  estimateMin: number;
  estimateMax: number;
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

export type RenovisionSessionDrilldown = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  initialGenerationsUsed: number;
  regenerationsUsed: number;
  attribution: RenovisionAttribution | null;
  projects: Array<{
    id: string;
    createdAt: string;
    userId: string | null;
    roomKind: string;
    convertedAt: string | null;
  }>;
  generations: Array<{
    id: string;
    createdAt: string;
    projectId: string | null;
    selectedStyle: string;
    leadSubmitted: boolean;
    beforeImageUrl: string | null;
    afterImageUrl: string | null;
  }>;
  leads: Array<{
    id: string;
    createdAt: string;
    generationId: string | null;
    email: string;
    zipCode: string;
  }>;
  events: Array<{
    id: string;
    occurredAt: string;
    eventType: string;
    projectId: string | null;
  }>;
  mockups: Array<{
    id: string;
    projectId: string;
    generationNumber: number;
    createdAt: string;
    imageUrl: string | null;
  }>;
};

export type RenovisionMarketingDailyRow = {
  day: string;
  linkId: string;
  platform: string;
  campaign: string;
  video: string;
  sessions: number;
  generations: number;
  saves: number;
  leads: number;
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
  const startToday = new Date();
  startToday.setUTCHours(0, 0, 0, 0);
  const startTodayIso = startToday.toISOString();

  const [
    anonSessions,
    profilesCount,
    signupsInRange,
    remodelerReq,
    converted,
    homeViewsToday,
  ] = await Promise.all([
    countRows("renovision_anonymous_sessions", { fromIso }),
    countRows("profiles", { fromIso: null }),
    countRows("profiles", { fromIso }),
    countRows("leads", { fromIso }),
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
    (async () => {
      const { data, error } = await svc
        .from("renovision_analytics_events")
        .select("anonymous_session_id, user_id")
        .eq("event_type", "home_page_view")
        .gte("occurred_at", startTodayIso)
        .limit(20000);
      if (error) throw new Error(error.message);
      const unique = new Set<string>();
      for (const row of data ?? []) {
        const anonId = String((row as { anonymous_session_id?: unknown }).anonymous_session_id ?? "").trim();
        const userId = String((row as { user_id?: unknown }).user_id ?? "").trim();
        if (anonId) unique.add(`anon:${anonId}`);
        else if (userId) unique.add(`user:${userId}`);
      }
      return unique.size;
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
    uniqueHomeVisitorsToday: homeViewsToday,
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
        .from("leads")
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
        websiteViews: 0,
        tryViews: 0,
      });
    }
    await attachWebsiteAndTryViewCounts(svc, buckets, range);
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
        .from("leads")
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
      websiteViews: 0,
      tryViews: 0,
    });
  }

  await attachWebsiteAndTryViewCounts(svc, buckets, range);
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
      label: "Connect Me lead submissions",
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

  const { data: generationRows } = await svc.from("bathroom_generations").select("id, project_id, created_at");
  const generationIds = [...new Set((generationRows ?? []).map((g) => String(g.id)))];
  const { data: leadRows } = generationIds.length
    ? await svc.from("leads").select("generation_id, created_at")
    : { data: [] };
  const projectByGeneration = new Map(
    (generationRows ?? []).map((g) => [String(g.id), String(g.project_id ?? "")]),
  );
  const { data: projRowsForLeadUsers } = await svc.from("homeowner_try_projects").select("id, user_id");
  const userByProjectForLeads = new Map(
    (projRowsForLeadUsers ?? []).map((p) => [String(p.id), (p.user_id as string | null) ?? null]),
  );
  const remodelerByUser = new Set<string>();
  for (const r of leadRows ?? []) {
    if (fromIso && String(r.created_at) < fromIso) continue;
    const projectId = projectByGeneration.get(String(r.generation_id ?? ""));
    if (!projectId) continue;
    const userId = userByProjectForLeads.get(projectId);
    if (!userId) continue;
    remodelerByUser.add(userId);
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
      "id, created_at, room_kind, user_id, anonymous_session_id, converted_from_anon_session_id, before_storage_path",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (fromIso) q = q.gte("created_at", fromIso);
  const { data: projects, error } = await q;
  if (error) throw new Error(error.message);
  const projectIds = (projects ?? []).map((p) => String(p.id));

  const { data: generationRows } = projectIds.length
    ? await svc
        .from("bathroom_generations")
        .select("project_id, created_at, selected_style, user_description")
        .in("project_id", projectIds)
    : { data: [] };
  const generationContextByProject = new Map<
    string,
    { createdAt: string; selectedStyle: string | null; userDescription: string | null }
  >();
  for (const g of generationRows ?? []) {
    const projectId = String((g as { project_id?: unknown }).project_id ?? "").trim();
    if (!projectId) continue;
    const createdAt = String((g as { created_at?: unknown }).created_at ?? "");
    const selectedStyle = String((g as { selected_style?: unknown }).selected_style ?? "").trim() || null;
    const userDescription = String((g as { user_description?: unknown }).user_description ?? "").trim() || null;
    const prev = generationContextByProject.get(projectId);
    if (!prev || createdAt < prev.createdAt) {
      generationContextByProject.set(projectId, { createdAt, selectedStyle, userDescription });
    }
  }

  const { data: beforeGenerations } = projectIds.length
    ? await svc
        .from("bathroom_generations")
        .select("project_id, created_at, uploaded_image_url")
        .in("project_id", projectIds)
    : { data: [] };
  const generationEarliestBeforeByProject = new Map<string, { createdAt: string; storagePath: string }>();
  for (const g of beforeGenerations ?? []) {
    const projectId = String((g as { project_id?: unknown }).project_id ?? "").trim();
    const storagePath = String((g as { uploaded_image_url?: unknown }).uploaded_image_url ?? "").trim();
    const createdAt = String((g as { created_at?: unknown }).created_at ?? "");
    if (!projectId || !storagePath) continue;
    const prev = generationEarliestBeforeByProject.get(projectId);
    if (!prev || createdAt < prev.createdAt) {
      generationEarliestBeforeByProject.set(projectId, { createdAt, storagePath });
    }
  }
  /** Prefer `homeowner_try_projects.before_storage_path`; else earliest generation `uploaded_image_url`. */
  const originalBeforePathByProject = new Map<string, string>();
  for (const p of projects ?? []) {
    const pid = String(p.id);
    const fromProject = String((p as { before_storage_path?: unknown }).before_storage_path ?? "").trim();
    if (fromProject) originalBeforePathByProject.set(pid, fromProject);
  }
  for (const [pid, { storagePath }] of generationEarliestBeforeByProject) {
    if (!originalBeforePathByProject.has(pid)) originalBeforePathByProject.set(pid, storagePath);
  }

  const { data: mockRows } = await svc
    .from("homeowner_try_mockups")
    .select("id, project_id, mockup_generation, storage_path, created_at, mockup_generation_meta");
  const mockAgg = new Map<string, { total: number; initial: number; regen: number }>();
  const mockupsByProject = new Map<
    string,
    Array<{
      mockupId: string;
      createdAt: string;
      generationNumber: number;
      storagePath: string;
      refinementType: string;
      customPrompt: string | null;
    }>
  >();
  for (const m of mockRows ?? []) {
    const pid = String(m.project_id);
    const cur = mockAgg.get(pid) ?? { total: 0, initial: 0, regen: 0 };
    cur.total += 1;
    const generationNumber = Number(m.mockup_generation);
    const createdAt = String((m as { created_at?: unknown }).created_at ?? "");
    const storagePath = String((m as { storage_path?: unknown }).storage_path ?? "").trim();
    const meta = (m as { mockup_generation_meta?: unknown }).mockup_generation_meta as
      | { additionalPrompt?: unknown; regenerateFromRoom?: unknown }
      | null
      | undefined;
    const additionalPrompt = String(meta?.additionalPrompt ?? "");
    const regenerateFromRoom =
      typeof meta?.regenerateFromRoom === "boolean" ? meta.regenerateFromRoom : null;
    const customPrompt = extractCustomTweakFromAdditionalPrompt(additionalPrompt);
    const refinementType = deriveRefinementType({
      generationNumber,
      additionalPrompt,
      regenerateFromRoom,
    });
    if (generationNumber === 1) {
      cur.initial += 1;
    } else {
      cur.regen += 1;
    }
    if (storagePath) {
      const arr = mockupsByProject.get(pid) ?? [];
      arr.push({
        mockupId: String(m.id),
        createdAt,
        generationNumber,
        storagePath,
        refinementType,
        customPrompt,
      });
      mockupsByProject.set(pid, arr);
    }
    mockAgg.set(pid, cur);
  }

  for (const arr of mockupsByProject.values()) {
    arr.sort((a, b) => {
      if (a.generationNumber !== b.generationNumber) return a.generationNumber - b.generationNumber;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
  }

  const signedUrlByPath = new Map<string, string>();
  const pathsToSign = new Set<string>();
  for (const arr of mockupsByProject.values()) {
    for (const item of arr) {
      pathsToSign.add(item.storagePath);
    }
  }
  for (const path of originalBeforePathByProject.values()) {
    pathsToSign.add(path);
  }
  for (const path of pathsToSign) {
    const signed = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(path, 60 * 60);
    if (signed.data?.signedUrl) signedUrlByPath.set(path, signed.data.signedUrl);
  }

  const previewImagesByProject = new Map<
    string,
    Array<{
      mockupId: string;
      createdAt: string;
      generationNumber: number;
      imageUrl: string;
      refinementType: string;
      customPrompt: string | null;
    }>
  >();
  for (const [projectId, arr] of mockupsByProject.entries()) {
    const previews = arr
      .map((m) => ({
        mockupId: m.mockupId,
        createdAt: m.createdAt,
        generationNumber: m.generationNumber,
        imageUrl: signedUrlByPath.get(m.storagePath) ?? "",
        refinementType: m.refinementType,
        customPrompt: m.customPrompt,
      }))
      .filter((m) => Boolean(m.imageUrl));
    previewImagesByProject.set(projectId, previews);
  }

  const { data: reqRows } = await svc.from("leads").select("generation_id");
  const { data: genRows } = await svc.from("bathroom_generations").select("id, project_id");
  const projectByGeneration = new Map((genRows ?? []).map((g) => [String(g.id), String(g.project_id ?? "")]));
  const remodelerProjects = new Set(
    (reqRows ?? [])
      .map((r) => projectByGeneration.get(String(r.generation_id ?? "")) ?? "")
      .filter(Boolean),
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
      selectedStyle: generationContextByProject.get(pid)?.selectedStyle ?? null,
      originalUserPrompt: generationContextByProject.get(pid)?.userDescription ?? null,
      mockupCount: agg.total,
      initialCount: agg.initial,
      regenCount: agg.regen,
      originalBeforeImageUrl: signedUrlByPath.get(originalBeforePathByProject.get(pid) ?? "") ?? null,
      previewImages: previewImagesByProject.get(pid) ?? [],
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

export async function fetchRenovisionSessionDrilldown(
  sessionId: string,
): Promise<RenovisionSessionDrilldown | null> {
  const id = sessionId.trim();
  if (!id) return null;
  const svc = createServiceClient();

  const { data: session, error: sessionError } = await svc
    .from("renovision_anonymous_sessions")
    .select("id, created_at, updated_at, initial_generations_used, regenerations_used, attribution")
    .eq("id", id)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return null;

  const [{ data: projects, error: projectsError }, { data: generations, error: generationsError }, { data: events, error: eventsError }] =
    await Promise.all([
      svc
        .from("homeowner_try_projects")
        .select("id, created_at, user_id, room_kind, anon_converted_at")
        .or(`anonymous_session_id.eq.${id},converted_from_anon_session_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(200),
      svc
        .from("bathroom_generations")
        .select("id, created_at, project_id, selected_style, lead_submitted, uploaded_image_url, generated_image_url")
        .eq("session_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      svc
        .from("renovision_analytics_events")
        .select("id, occurred_at, event_type, project_id")
        .eq("anonymous_session_id", id)
        .order("occurred_at", { ascending: false })
        .limit(400),
    ]);
  if (projectsError) throw new Error(projectsError.message);
  if (generationsError) throw new Error(generationsError.message);
  if (eventsError) throw new Error(eventsError.message);

  const generationIds = (generations ?? []).map((g) => String(g.id));
  const { data: leads, error: leadsError } = generationIds.length
    ? await svc
        .from("leads")
        .select("id, created_at, generation_id, email, zip_code")
        .in("generation_id", generationIds)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [], error: null };
  if (leadsError) throw new Error(leadsError.message);

  const projectIds = [...new Set((projects ?? []).map((p) => String(p.id)))];
  const { data: mockups, error: mockupsError } = projectIds.length
    ? await svc
        .from("homeowner_try_mockups")
        .select("id, project_id, mockup_generation, created_at, storage_path")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [], error: null };
  if (mockupsError) throw new Error(mockupsError.message);

  const signedBeforeByGenerationId = new Map<string, string>();
  const signedAfterByGenerationId = new Map<string, string>();
  for (const g of generations ?? []) {
    const genId = String(g.id);
    const beforePath = String((g as { uploaded_image_url?: unknown }).uploaded_image_url ?? "").trim();
    const afterPath = String((g as { generated_image_url?: unknown }).generated_image_url ?? "").trim();
    if (beforePath) {
      const beforeSigned = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(beforePath, 60 * 60);
      if (beforeSigned.data?.signedUrl) signedBeforeByGenerationId.set(genId, beforeSigned.data.signedUrl);
    }
    if (afterPath) {
      const afterSigned = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(afterPath, 60 * 60);
      if (afterSigned.data?.signedUrl) signedAfterByGenerationId.set(genId, afterSigned.data.signedUrl);
    }
  }
  const signedMockupById = new Map<string, string>();
  for (const m of mockups ?? []) {
    const path = String((m as { storage_path?: unknown }).storage_path ?? "").trim();
    if (!path) continue;
    const signed = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(path, 60 * 60);
    if (signed.data?.signedUrl) signedMockupById.set(String(m.id), signed.data.signedUrl);
  }

  return {
    sessionId: String(session.id),
    createdAt: String(session.created_at),
    updatedAt: String(session.updated_at),
    initialGenerationsUsed: Number(session.initial_generations_used ?? 0),
    regenerationsUsed: Number(session.regenerations_used ?? 0),
    attribution: sanitizeAttribution((session as { attribution?: unknown }).attribution ?? null),
    projects: (projects ?? []).map((p) => ({
      id: String(p.id),
      createdAt: String(p.created_at),
      userId: (p.user_id as string | null) ?? null,
      roomKind: String((p as { room_kind?: string }).room_kind ?? "bathroom"),
      convertedAt: (p.anon_converted_at as string | null) ?? null,
    })),
    generations: (generations ?? []).map((g) => ({
      id: String(g.id),
      createdAt: String(g.created_at),
      projectId: (g.project_id as string | null) ?? null,
      selectedStyle: String(g.selected_style ?? ""),
      leadSubmitted: Boolean(g.lead_submitted),
      beforeImageUrl: signedBeforeByGenerationId.get(String(g.id)) ?? null,
      afterImageUrl: signedAfterByGenerationId.get(String(g.id)) ?? null,
    })),
    leads: (leads ?? []).map((l) => ({
      id: String(l.id),
      createdAt: String(l.created_at),
      generationId: (l.generation_id as string | null) ?? null,
      email: String(l.email ?? ""),
      zipCode: String(l.zip_code ?? ""),
    })),
    events: (events ?? []).map((e) => ({
      id: String(e.id),
      occurredAt: String(e.occurred_at),
      eventType: String(e.event_type ?? ""),
      projectId: (e.project_id as string | null) ?? null,
    })),
    mockups: (mockups ?? []).map((m) => ({
      id: String(m.id),
      projectId: String(m.project_id),
      generationNumber: Number(m.mockup_generation ?? 0),
      createdAt: String(m.created_at),
      imageUrl: signedMockupById.get(String(m.id)) ?? null,
    })),
  };
}

export async function fetchRenovisionAdminLeadsTable(
  range: RenovisionAdminRange,
  search: string,
): Promise<RenovisionAdminLeadRow[]> {
  const svc = createServiceClient();
  const fromIso = rangeLowerBoundIso(range);
  let q = svc
    .from("leads")
    .select(
      "id, created_at, generation_id, name, email, phone, zip_code, timeline, budget_range, selected_style, estimate_min, estimate_max",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (fromIso) q = q.gte("created_at", fromIso);
  const { data: leads, error } = await q;
  if (error) throw new Error(error.message);

  const generationIds = [...new Set((leads ?? []).map((l) => String(l.generation_id ?? "")).filter(Boolean))];
  const { data: generations, error: gErr } = generationIds.length
    ? await svc.from("bathroom_generations").select("id, project_id").in("id", generationIds)
    : { data: [], error: null };
  if (gErr) throw new Error(gErr.message);
  const projectByGeneration = new Map((generations ?? []).map((g) => [String(g.id), String(g.project_id ?? "")]));

  const rows: RenovisionAdminLeadRow[] = (leads ?? []).map((l) => ({
    leadId: String(l.id),
    createdAt: String(l.created_at),
    generationId: (l.generation_id as string | null) ?? null,
    projectId: projectByGeneration.get(String(l.generation_id ?? "")) ?? null,
    name: String(l.name ?? ""),
    email: String(l.email ?? ""),
    phone: String(l.phone ?? ""),
    zipCode: String(l.zip_code ?? ""),
    timeline: String(l.timeline ?? ""),
    budgetRange: String(l.budget_range ?? ""),
    selectedStyle: String(l.selected_style ?? ""),
    estimateMin: Number(l.estimate_min ?? 0),
    estimateMax: Number(l.estimate_max ?? 0),
  }));

  const sq = search.trim().toLowerCase();
  if (!sq) return rows;
  return rows.filter(
    (r) =>
      r.leadId.toLowerCase().includes(sq) ||
      r.email.toLowerCase().includes(sq) ||
      r.name.toLowerCase().includes(sq) ||
      (r.projectId ?? "").toLowerCase().includes(sq) ||
      (r.generationId ?? "").toLowerCase().includes(sq),
  );
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function pickAttributionDims(a: RenovisionAttribution | null): {
  linkId: string;
  platform: string;
  campaign: string;
  video: string;
} {
  const linkId = (a?.src ?? a?.source ?? "—").trim() || "—";
  const platform = (a?.platform ?? a?.source ?? a?.src ?? "—").trim() || "—";
  const campaign = (a?.campaign ?? "—").trim() || "—";
  const video = (a?.video ?? a?.v ?? "—").trim() || "—";
  return { linkId, platform, campaign, video };
}

export async function fetchRenovisionMarketingDailyRows(
  range: RenovisionAdminRange,
): Promise<RenovisionMarketingDailyRow[]> {
  const svc = createServiceClient();
  const fromIso = rangeLowerBoundIso(range);

  let sessionsQ = svc
    .from("renovision_anonymous_sessions")
    .select("id, created_at, updated_at, attribution")
    .order("updated_at", { ascending: false })
    .limit(1000);
  let generationsQ = svc
    .from("bathroom_generations")
    .select("id, created_at, attribution")
    .order("created_at", { ascending: false })
    .limit(1000);
  let savesQ = svc
    .from("renovision_saved_projects")
    .select("id, created_at, attribution")
    .order("created_at", { ascending: false })
    .limit(1000);
  let leadsQ = svc
    .from("leads")
    .select("id, created_at, attribution")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (fromIso) {
    sessionsQ = sessionsQ.gte("updated_at", fromIso);
    generationsQ = generationsQ.gte("created_at", fromIso);
    savesQ = savesQ.gte("created_at", fromIso);
    leadsQ = leadsQ.gte("created_at", fromIso);
  }

  const [sessionsRes, generationsRes, savesRes, leadsRes] = await Promise.all([
    sessionsQ,
    generationsQ,
    savesQ,
    leadsQ,
  ]);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (generationsRes.error) throw new Error(generationsRes.error.message);
  if (savesRes.error) throw new Error(savesRes.error.message);
  if (leadsRes.error) throw new Error(leadsRes.error.message);

  const agg = new Map<string, RenovisionMarketingDailyRow>();
  const ensure = (day: string, linkId: string, platform: string, campaign: string, video: string) => {
    const k = `${day}|${linkId}|${platform}|${campaign}|${video}`;
    const existing = agg.get(k);
    if (existing) return existing;
    const row: RenovisionMarketingDailyRow = {
      day,
      linkId,
      platform,
      campaign,
      video,
      sessions: 0,
      generations: 0,
      saves: 0,
      leads: 0,
    };
    agg.set(k, row);
    return row;
  };

  for (const r of sessionsRes.data ?? []) {
    const dims = pickAttributionDims(sanitizeAttribution((r as { attribution?: unknown }).attribution ?? null));
    if (dims.linkId === "—") continue;
    const activityAt = String((r as { updated_at?: unknown }).updated_at ?? (r as { created_at?: unknown }).created_at ?? "");
    if (!activityAt) continue;
    const row = ensure(dayKey(activityAt), dims.linkId, dims.platform, dims.campaign, dims.video);
    row.sessions += 1;
  }
  for (const r of generationsRes.data ?? []) {
    const dims = pickAttributionDims(sanitizeAttribution((r as { attribution?: unknown }).attribution ?? null));
    if (dims.linkId === "—") continue;
    const row = ensure(dayKey(String(r.created_at)), dims.linkId, dims.platform, dims.campaign, dims.video);
    row.generations += 1;
  }
  for (const r of savesRes.data ?? []) {
    const dims = pickAttributionDims(sanitizeAttribution((r as { attribution?: unknown }).attribution ?? null));
    if (dims.linkId === "—") continue;
    const row = ensure(dayKey(String(r.created_at)), dims.linkId, dims.platform, dims.campaign, dims.video);
    row.saves += 1;
  }
  for (const r of leadsRes.data ?? []) {
    const dims = pickAttributionDims(sanitizeAttribution((r as { attribution?: unknown }).attribution ?? null));
    if (dims.linkId === "—") continue;
    const row = ensure(dayKey(String(r.created_at)), dims.linkId, dims.platform, dims.campaign, dims.video);
    row.leads += 1;
  }

  return [...agg.values()].sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.linkId !== b.linkId) return a.linkId < b.linkId ? -1 : 1;
    if (a.campaign !== b.campaign) return a.campaign < b.campaign ? -1 : 1;
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    return a.video < b.video ? -1 : 1;
  });
}
