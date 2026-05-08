import { createServiceClient } from "@/lib/supabase/service";

type RangeKey = "24h" | "7d" | "30d" | "custom";
export type TrafficFilter = "customer" | "admin" | "all";
export type ExportFilterOptions = {
  trafficFilter?: TrafficFilter;
  includeLocalDev?: boolean;
  sourceFilter?: string;
  deviceFilter?: string;
};
export type AnalyticsDashboardFilters = {
  sourceFilter?: string;
  deviceFilter?: string;
};

export type AnalyticsRange = {
  key: RangeKey;
  startIso: string;
  endIso: string;
  startDate: string;
  endDate: string;
};

type SessionRow = {
  session_id: string;
  session_type?: string | null;
  normalized_source?: string | null;
  normalized_referrer?: string | null;
  created_at: string;
  first_page: string | null;
  last_page: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  device_type: string | null;
  browser?: string | null;
  metadata?: Record<string, unknown> | null;
};

type EventRow = {
  created_at: string;
  session_id: string;
  session_type?: string | null;
  normalized_source?: string | null;
  normalized_referrer?: string | null;
  event_name: string;
  page_path: string | null;
  metadata: Record<string, unknown> | null;
};

type PageViewRow = {
  created_at: string;
  session_id: string;
  session_type?: string | null;
  normalized_source?: string | null;
  normalized_referrer?: string | null;
  page_path: string;
  ended_at?: string | null;
  max_scroll_depth?: number | null;
  click_count?: number | null;
  duration_seconds: number | null;
  metadata?: Record<string, unknown> | null;
};

export function resolveAnalyticsRange(params: {
  range?: string;
  start?: string;
  end?: string;
}): AnalyticsRange {
  const now = new Date();
  const end = new Date(now);
  const range = params.range === "7d" || params.range === "30d" || params.range === "custom" ? params.range : "24h";
  let start: Date;

  if (range === "7d") {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "30d") {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === "custom" && params.start && params.end) {
    const s = new Date(`${params.start}T00:00:00.000Z`);
    const e = new Date(`${params.end}T23:59:59.999Z`);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s <= e) {
      return {
        key: "custom",
        startIso: s.toISOString(),
        endIso: e.toISOString(),
        startDate: params.start,
        endDate: params.end,
      };
    }
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else {
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  return {
    key: range === "custom" ? "24h" : range,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

function toNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function summarizeMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata || typeof metadata !== "object") return "—";
  const keep: Record<string, unknown> = {};
  const allowed = [
    "style_id",
    "style_name",
    "provider",
    "duration_ms",
    "error_code",
    "refinement_type",
    "analytics_id",
    "page_path",
  ];
  for (const key of allowed) {
    if (key in metadata) keep[key] = metadata[key];
  }
  const entries = Object.entries(keep);
  if (!entries.length) return "—";
  return entries
    .slice(0, 4)
    .map(([k, v]) => `${k}:${String(v)}`)
    .join(" | ");
}

function isAdminLikePath(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith("/admin");
}

function eventIsAdminPath(event: { page_path?: string | null; metadata?: Record<string, unknown> | null }): boolean {
  if (isAdminLikePath(event.page_path)) return true;
  const metaPath = event.metadata?.page_path;
  return typeof metaPath === "string" && metaPath.startsWith("/admin");
}

function rowIsLocalhost(row: { metadata?: Record<string, unknown> | null }): boolean {
  const host = row.metadata?.current_host;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function normalizeSessionType(value: string | null | undefined): "admin" | "customer" {
  return value === "admin" ? "admin" : "customer";
}

function inferSessionTypeFromRow(row: {
  session_type?: string | null;
  page_path?: string | null;
  first_page?: string | null;
  last_page?: string | null;
  metadata?: Record<string, unknown> | null;
}): "admin" | "customer" {
  if (row.session_type) return normalizeSessionType(row.session_type);
  if (isAdminLikePath(row.page_path)) return "admin";
  if (isAdminLikePath(row.first_page)) return "admin";
  if (isAdminLikePath(row.last_page)) return "admin";
  const metaPath = row.metadata?.page_path;
  if (typeof metaPath === "string" && isAdminLikePath(metaPath)) return "admin";
  return "customer";
}

function matchesTrafficFilter(type: "admin" | "customer", filter: TrafficFilter): boolean {
  if (filter === "all") return true;
  return type === filter;
}

function normalizeSourceFromRow(row: {
  normalized_source?: string | null;
  normalized_referrer?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const source = (row.normalized_source ?? "").trim().toLowerCase();
  if (source) return source;
  const utm = (row.utm_source ?? "").trim().toLowerCase();
  if (utm) return utm;
  const ref = (row.normalized_referrer ?? row.referrer ?? "").trim().toLowerCase();
  if (!ref) return "direct";
  if (ref.includes("localhost") || ref.includes("127.0.0.1") || ref.includes("::1")) return "local_dev";
  return ref;
}

function isLocalDevSourceForFilter(row: {
  normalized_source?: string | null;
  normalized_referrer?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  return normalizeSourceFromRow(row) === "local_dev";
}

function shouldExcludeLocalDevRow(
  row: {
    normalized_source?: string | null;
    normalized_referrer?: string | null;
    referrer?: string | null;
    utm_source?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  trafficFilter: TrafficFilter,
  includeLocalDev?: boolean,
): boolean {
  if (includeLocalDev === true) return false;
  if (includeLocalDev === false) return isLocalDevSourceForFilter(row);
  return trafficFilter === "customer" && isLocalDevSourceForFilter(row);
}

function matchesSourceFilter(
  row: {
    normalized_source?: string | null;
    normalized_referrer?: string | null;
    referrer?: string | null;
    utm_source?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  sourceFilter?: string,
): boolean {
  const filter = (sourceFilter ?? "").trim().toLowerCase();
  if (!filter || filter === "all") return true;
  return normalizeSourceFromRow(row) === filter;
}

function matchesDeviceFilter(
  row: {
    device_type?: string | null;
  },
  deviceFilter?: string,
): boolean {
  const filter = (deviceFilter ?? "").trim().toLowerCase();
  if (!filter || filter === "all") return true;
  const device = (row.device_type ?? "").trim().toLowerCase();
  return device === filter;
}

export async function fetchAdminAnalyticsDashboard(
  range: AnalyticsRange,
  trafficFilter: TrafficFilter = "customer",
  includeLocalDev?: boolean,
  filters: AnalyticsDashboardFilters = {},
) {
  const svc = createServiceClient();
  const startIso = range.startIso;
  const endIso = range.endIso;

  const [sessionsRes, eventsRes, pageViewsRes, eventStreamRes] = await Promise.all([
    svc
      .from("analytics_sessions")
      .select("session_id, session_type, normalized_source, normalized_referrer, created_at, first_page, last_page, referrer, utm_source, utm_campaign, device_type, browser, metadata")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    svc
      .from("analytics_events")
      .select("created_at, session_id, session_type, normalized_source, normalized_referrer, event_name, page_path, metadata")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(20000),
    svc
      .from("analytics_page_views")
      .select("created_at, ended_at, session_id, session_type, normalized_source, normalized_referrer, page_path, duration_seconds, max_scroll_depth, click_count, metadata")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(20000),
    svc
      .from("analytics_events")
      .select("created_at, session_id, session_type, normalized_source, normalized_referrer, event_name, page_path, metadata")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  if (pageViewsRes.error) throw new Error(pageViewsRes.error.message);
  if (eventStreamRes.error) throw new Error(eventStreamRes.error.message);

  const sessions = ((sessionsRes.data ?? []) as (SessionRow & { metadata?: Record<string, unknown> | null })[])
    .filter((s) => !rowIsLocalhost(s))
    .filter((s) => !shouldExcludeLocalDevRow(s, trafficFilter, includeLocalDev))
    .filter((s) => matchesTrafficFilter(inferSessionTypeFromRow(s), trafficFilter))
    .filter((s) => matchesSourceFilter(s, filters.sourceFilter))
    .filter((s) => matchesDeviceFilter(s, filters.deviceFilter));
  const includedSessionIds = new Set(sessions.map((s) => s.session_id));
  const events = ((eventsRes.data ?? []) as EventRow[])
    .filter((e) => !rowIsLocalhost(e))
    .filter((e) => !shouldExcludeLocalDevRow(e, trafficFilter, includeLocalDev))
    .filter((e) => matchesTrafficFilter(inferSessionTypeFromRow(e), trafficFilter))
    .filter((e) => includedSessionIds.has(e.session_id))
    .filter((e) => matchesSourceFilter(e, filters.sourceFilter));
  const pageViews = ((pageViewsRes.data ?? []) as (PageViewRow & { metadata?: Record<string, unknown> | null })[])
    .filter((pv) => !rowIsLocalhost(pv))
    .filter((pv) => !shouldExcludeLocalDevRow(pv, trafficFilter, includeLocalDev))
    .filter((pv) => matchesTrafficFilter(inferSessionTypeFromRow(pv), trafficFilter))
    .filter((pv) => includedSessionIds.has(pv.session_id))
    .filter((pv) => matchesSourceFilter(pv, filters.sourceFilter));
  const eventStream = ((eventStreamRes.data ?? []) as EventRow[])
    .filter((e) => !rowIsLocalhost(e))
    .filter((e) => !shouldExcludeLocalDevRow(e, trafficFilter, includeLocalDev))
    .filter((e) => matchesTrafficFilter(inferSessionTypeFromRow(e), trafficFilter))
    .filter((e) => includedSessionIds.has(e.session_id))
    .filter((e) => matchesSourceFilter(e, filters.sourceFilter));

  const rawSessionsInRange = (sessionsRes.data ?? []) as (SessionRow & { metadata?: Record<string, unknown> | null })[];

  const uniqueSessionIds = new Set(sessions.map((s) => s.session_id));
  for (const e of events) uniqueSessionIds.add(e.session_id);

  const eventCounts = new Map<string, number>();
  const stepSessionSets = new Map<string, Set<string>>();
  const lastEventBySession = new Map<string, { at: string; name: string }>();
  const sessionDurationBySession = new Map<string, number>();
  const maxScrollBySession = new Map<string, number>();

  const funnelSteps = [
    { label: "Sessions", event: "__sessions__" },
    { label: "Landing page viewed", event: "landing_page_viewed" },
    { label: "Hero CTA clicked", event: "hero_cta_clicked" },
    { label: "Upload started", event: "upload_started" },
    { label: "Upload completed", event: "upload_completed" },
    { label: "Style selected", event: "style_selected" },
    { label: "Generation started", event: "generation_started" },
    { label: "Generation completed", event: "generation_completed" },
    { label: "Contractor CTA Clicks", event: "contractor_cta_clicked" },
    { label: "Lead Forms Started", event: "lead_form_started" },
    { label: "Leads Submitted", event: "lead_submitted" },
  ] as const;

  for (const step of funnelSteps) stepSessionSets.set(step.event, new Set<string>());
  stepSessionSets.set("__sessions__", new Set(uniqueSessionIds));

  const pageStats = new Map<
    string,
    {
      pageViews: number;
      sessions: Set<string>;
      durationTotal: number;
      durationCount: number;
      scrollTotal: number;
      scrollCount: number;
      clickCount: number;
      uploadCtaClicks: number;
      exits: number;
    }
  >();

  for (const pv of pageViews) {
    const key = pv.page_path || "/";
    if (!pageStats.has(key)) {
      pageStats.set(key, {
        pageViews: 0,
        sessions: new Set<string>(),
        durationTotal: 0,
        durationCount: 0,
        scrollTotal: 0,
        scrollCount: 0,
        clickCount: 0,
        uploadCtaClicks: 0,
        exits: 0,
      });
    }
    const row = pageStats.get(key)!;
    row.pageViews += 1;
    row.sessions.add(pv.session_id);
    if (typeof pv.duration_seconds === "number") {
      row.durationTotal += pv.duration_seconds;
      row.durationCount += 1;
    }
    if (typeof pv.max_scroll_depth === "number") {
      row.scrollTotal += pv.max_scroll_depth;
      row.scrollCount += 1;
    }
    if (typeof pv.click_count === "number") {
      row.clickCount += pv.click_count;
    }
    if (pv.ended_at) {
      row.exits += 1;
    }
  }

  for (const e of events) {
    eventCounts.set(e.event_name, (eventCounts.get(e.event_name) ?? 0) + 1);
    const stepSet = stepSessionSets.get(e.event_name);
    if (stepSet) stepSet.add(e.session_id);

    const last = lastEventBySession.get(e.session_id);
    if (!last || new Date(e.created_at).getTime() > new Date(last.at).getTime()) {
      lastEventBySession.set(e.session_id, { at: e.created_at, name: e.event_name });
    }

    if (e.event_name === "page_exited") {
      const duration = toNum(e.metadata?.time_on_page_seconds);
      const scroll = toNum(e.metadata?.max_scroll_depth);
      if (duration != null) {
        sessionDurationBySession.set(e.session_id, (sessionDurationBySession.get(e.session_id) ?? 0) + duration);
      }
      if (scroll != null) {
        maxScrollBySession.set(e.session_id, Math.max(maxScrollBySession.get(e.session_id) ?? 0, scroll));
      }
      const path = e.page_path || (typeof e.metadata?.page_path === "string" ? e.metadata.page_path : null);
      if (path) {
        const row = pageStats.get(path);
        if (row) {
          if (scroll != null && row.scrollCount === 0) {
            row.scrollTotal += scroll;
            row.scrollCount += 1;
          }
        }
      }
    }
    if (e.event_name === "upload_cta_clicked") {
      const path = e.page_path || "/";
      const row = pageStats.get(path);
      if (row) row.uploadCtaClicks += 1;
    }
  }

  const funnelRows = funnelSteps.map((step, idx) => {
    const count = stepSessionSets.get(step.event)?.size ?? 0;
    const prev = idx === 0 ? count : funnelSteps[idx - 1] ? stepSessionSets.get(funnelSteps[idx - 1].event)?.size ?? 0 : 0;
    const sessionsCount = stepSessionSets.get("__sessions__")?.size ?? 0;
    return {
      step: step.label,
      count,
      conversionFromPrev: idx === 0 ? null : pct(count, prev),
      conversionFromSessions: pct(count, sessionsCount),
    };
  });

  const pagePerformanceRows = Array.from(pageStats.entries())
    .map(([pagePath, row]) => ({
      pagePath,
      pageViews: row.pageViews,
      uniqueSessions: row.sessions.size,
      avgTimeOnPage: row.durationCount ? row.durationTotal / row.durationCount : null,
      avgMaxScrollDepth: row.scrollCount ? row.scrollTotal / row.scrollCount : null,
      clickCount: row.clickCount,
      uploadCtaClicks: row.uploadCtaClicks,
      exits: row.exits,
      exitRate: row.pageViews > 0 ? (row.exits / row.pageViews) * 100 : null,
    }))
    .sort((a, b) => b.pageViews - a.pageViews);

  const trafficBuckets = new Map<
    string,
    {
      source: string;
      referrer: string;
      utmCampaign: string;
      sessionIds: Set<string>;
      uploadStarts: number;
      generations: number;
      connectClicks: number;
      leads: number;
    }
  >();

  for (const s of sessions) {
    const source = normalizeSourceFromRow(s);
    const referrer = (s.normalized_referrer ?? s.referrer ?? "—").trim() || "—";
    const utmCampaign = s.utm_campaign || "—";
    const key = `${source}|||${referrer}|||${utmCampaign}`;
    if (!trafficBuckets.has(key)) {
      trafficBuckets.set(key, {
        source,
        referrer,
        utmCampaign,
        sessionIds: new Set<string>(),
        uploadStarts: 0,
        generations: 0,
        connectClicks: 0,
        leads: 0,
      });
    }
    trafficBuckets.get(key)!.sessionIds.add(s.session_id);
  }

  const bucketBySession = new Map<string, string>();
  for (const [key, bucket] of trafficBuckets.entries()) {
    for (const sessionId of bucket.sessionIds) bucketBySession.set(sessionId, key);
  }

  for (const e of events) {
    const key = bucketBySession.get(e.session_id);
    if (!key) continue;
    const bucket = trafficBuckets.get(key);
    if (!bucket) continue;
    if (e.event_name === "upload_started") bucket.uploadStarts += 1;
    if (e.event_name === "generation_completed") bucket.generations += 1;
    if (e.event_name === "contractor_cta_clicked") bucket.connectClicks += 1;
    if (e.event_name === "lead_submitted") bucket.leads += 1;
  }

  const trafficSourceRows = Array.from(trafficBuckets.values())
    .map((b) => ({
      source: b.source,
      referrer: b.referrer,
      utmCampaign: b.utmCampaign,
      sessions: b.sessionIds.size,
      uploadStarts: b.uploadStarts,
      generations: b.generations,
      connectClicks: b.connectClicks,
      leads: b.leads,
      conversionRate: pct(b.leads, b.sessionIds.size),
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const leadSubmittedSessions = stepSessionSets.get("lead_submitted") ?? new Set<string>();
  const recentSessions = sessions
    .slice(0, 200)
    .map((s) => ({
      sessionId: s.session_id,
      firstPage: s.first_page || "—",
      lastPage: s.last_page || "—",
      referrerSource: [s.referrer || "direct", s.utm_source || "—"].join(" / "),
      device: s.device_type || "—",
      sessionDurationSeconds: sessionDurationBySession.get(s.session_id) ?? null,
      maxScrollDepth: maxScrollBySession.get(s.session_id) ?? null,
      lastEvent: lastEventBySession.get(s.session_id)?.name ?? "—",
      leadSubmitted: leadSubmittedSessions.has(s.session_id),
    }))
    .sort((a, b) => (b.sessionDurationSeconds ?? 0) - (a.sessionDurationSeconds ?? 0));

  const duplicateKeyCounts = new Map<string, number>();
  for (const e of events) {
    if (e.event_name !== "page_viewed") continue;
    const minute = new Date(e.created_at);
    minute.setSeconds(0, 0);
    const key = `${e.session_id}|||${e.page_path ?? ""}|||${minute.toISOString()}`;
    duplicateKeyCounts.set(key, (duplicateKeyCounts.get(key) ?? 0) + 1);
  }
  let duplicatePageViewedEventsDetected = 0;
  for (const count of duplicateKeyCounts.values()) {
    if (count > 1) duplicatePageViewedEventsDetected += count - 1;
  }

  const openPageViewsCount = pageViews.filter((pv) => !pv.ended_at).length;
  const missingDeviceOrBrowserInfoCount = sessions.filter(
    (s) => !(s.device_type && s.device_type.trim()) || !(s.browser && s.browser.trim()),
  ).length;

  const rawAdminSessions = rawSessionsInRange
    .filter((s) => !rowIsLocalhost(s))
    .filter((s) => inferSessionTypeFromRow(s) === "admin")
    .map((s) => s.session_id);
  const rawLocalDevSessions = rawSessionsInRange
    .filter((s) => !rowIsLocalhost(s))
    .filter((s) => isLocalDevSourceForFilter(s))
    .map((s) => s.session_id);
  const adminSessionsExcluded = new Set(rawAdminSessions.filter((sid) => !includedSessionIds.has(sid))).size;
  const localDevSessionsExcluded = new Set(rawLocalDevSessions.filter((sid) => !includedSessionIds.has(sid))).size;

  const last24hStartIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [events24Res, pageViews24Res] = await Promise.all([
    svc
      .from("analytics_events")
      .select("session_id, session_type, normalized_source, normalized_referrer, referrer, metadata")
      .gte("created_at", last24hStartIso)
      .lte("created_at", endIso)
      .limit(50000),
    svc
      .from("analytics_page_views")
      .select("session_id, session_type, normalized_source, normalized_referrer, referrer, metadata")
      .gte("created_at", last24hStartIso)
      .lte("created_at", endIso)
      .limit(50000),
  ]);
  if (events24Res.error) throw new Error(events24Res.error.message);
  if (pageViews24Res.error) throw new Error(pageViews24Res.error.message);
  const eventsLast24h = ((events24Res.data ?? []) as Array<EventRow & { referrer?: string | null }>)
    .filter((e) => !rowIsLocalhost(e))
    .filter((e) => !shouldExcludeLocalDevRow(e, trafficFilter, includeLocalDev))
    .filter((e) => matchesTrafficFilter(inferSessionTypeFromRow(e), trafficFilter))
    .filter((e) => matchesSourceFilter(e, filters.sourceFilter)).length;
  const pageViewsLast24h = ((pageViews24Res.data ?? []) as Array<PageViewRow & { referrer?: string | null }>)
    .filter((pv) => !rowIsLocalhost(pv))
    .filter((pv) => !shouldExcludeLocalDevRow(pv, trafficFilter, includeLocalDev))
    .filter((pv) => matchesTrafficFilter(inferSessionTypeFromRow(pv), trafficFilter))
    .filter((pv) => matchesSourceFilter(pv, filters.sourceFilter)).length;

  const leadSubmittedSessionSet = stepSessionSets.get("lead_submitted") ?? new Set<string>();
  const connectClickedSessionSet = stepSessionSets.get("contractor_cta_clicked") ?? new Set<string>();
  const leadFormStartedSessionSet = stepSessionSets.get("lead_form_started") ?? new Set<string>();
  const uploadStartedSessionSet = stepSessionSets.get("upload_started") ?? new Set<string>();
  const uploadCompletedSessionSet = stepSessionSets.get("upload_completed") ?? new Set<string>();
  const generationFailedSessions = new Set(
    events.filter((e) => e.event_name === "generation_failed").map((e) => e.session_id),
  );
  const longTimeNoClickSessions = recentSessions
    .filter((s) => (s.sessionDurationSeconds ?? 0) >= 120)
    .filter((s) => (s.maxScrollDepth ?? 0) >= 50)
    .filter((s) => {
      const clickCount = pageViews
        .filter((pv) => pv.session_id === s.sessionId)
        .reduce((sum, pv) => sum + Number(pv.click_count ?? 0), 0);
      return clickCount === 0;
    })
    .map((s) => s.sessionId);
  const sessionsConnectClickNoFormStarted = Array.from(connectClickedSessionSet).filter(
    (sid) => !leadFormStartedSessionSet.has(sid),
  );
  const sessionsLeadFormStartedNoSubmitted = Array.from(leadFormStartedSessionSet).filter(
    (sid) => !leadSubmittedSessionSet.has(sid),
  );
  const connectVsLeadsSessionRows = [
    ...sessionsConnectClickNoFormStarted.map((sessionId) => ({
      sessionId,
      reason: "Connect clicked but no lead form started",
    })),
    ...sessionsLeadFormStartedNoSubmitted.map((sessionId) => ({
      sessionId,
      reason: "Lead form started but no lead submitted",
    })),
  ];
  const generationCompletedWithId = events
    .filter((e) => e.event_name === "generation_completed")
    .map((e) => ({
      sessionId: e.session_id,
      generationId:
        typeof e.metadata?.generation_id === "string" ? e.metadata.generation_id.trim() : "",
    }))
    .filter((row) => row.generationId);
  const generationIdsFromEvents = Array.from(new Set(generationCompletedWithId.map((r) => r.generationId)));
  const existingGenerationIds = new Set<string>();
  if (generationIdsFromEvents.length) {
    const { data: generationRows, error: genRowsError } = await svc
      .from("bathroom_generations")
      .select("id")
      .in("id", generationIdsFromEvents);
    if (genRowsError) throw new Error(genRowsError.message);
    for (const row of generationRows ?? []) {
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (id) existingGenerationIds.add(id);
    }
  }
  const generationCompletedNoGenerationRowSessions = generationCompletedWithId
    .filter((row) => !existingGenerationIds.has(row.generationId))
    .map((row) => row.sessionId);
  const adminSessionsIncludedInCustomer = trafficFilter === "customer"
    ? sessions.filter((s) => inferSessionTypeFromRow(s) === "admin").map((s) => s.session_id)
    : [];

  return {
    kpis: {
      uniqueSessions: uniqueSessionIds.size,
      pageViews: pageViews.length,
      adLandingClicks: eventCounts.get("ad_landing_click") ?? 0,
      uploadCtaClicks: eventCounts.get("upload_cta_clicked") ?? 0,
      uploadStarted: eventCounts.get("upload_started") ?? 0,
      uploadCompleted: eventCounts.get("upload_completed") ?? 0,
      uploadFailed: eventCounts.get("upload_failed") ?? 0,
      generationsCompleted: eventCounts.get("generation_completed") ?? 0,
      generationFailed: eventCounts.get("generation_failed") ?? 0,
      leadFormsStarted: eventCounts.get("lead_form_started") ?? 0,
      contractorCtaClicks: eventCounts.get("contractor_cta_clicked") ?? 0,
      leadsSubmitted: eventCounts.get("lead_submitted") ?? 0,
    },
    funnelRows,
    pagePerformanceRows,
    trafficSourceRows,
    recentSessions,
    eventStreamRows: eventStream.map((e) => ({
      time: e.created_at,
      sessionId: e.session_id,
      eventName: e.event_name,
      pagePath: e.page_path || "—",
      metadataPreview: summarizeMetadata(e.metadata),
    })),
    analyticsHealth: {
      duplicatePageViewedEventsDetected,
      openPageViewsCount,
      missingDeviceOrBrowserInfoCount,
      adminSessionsExcluded,
      localDevSessionsExcluded,
      eventsLast24h,
      pageViewsLast24h,
    },
    diagnostics: {
      sessionsConnectClickNoLead: Array.from(connectClickedSessionSet).filter((sid) => !leadSubmittedSessionSet.has(sid)),
      sessionsConnectClickNoFormStarted,
      sessionsLeadFormStartedNoSubmitted,
      generationCompletedNoGenerationRowSessions,
      sessionsUploadStartedNoUploadCompleted: Array.from(uploadStartedSessionSet).filter((sid) => !uploadCompletedSessionSet.has(sid)),
      sessionsGenerationFailed: Array.from(generationFailedSessions),
      sessionsLongTimeNoClick: longTimeNoClickSessions,
      adminSessionsIncludedInCustomer,
    },
    connectVsLeads: {
      contractorCtaClickedCount: eventCounts.get("contractor_cta_clicked") ?? 0,
      leadFormStartedCount: eventCounts.get("lead_form_started") ?? 0,
      leadSubmittedCount: eventCounts.get("lead_submitted") ?? 0,
      sessionsConnectClickNoFormStarted,
      sessionsLeadFormStartedNoSubmitted,
      sessionRows: connectVsLeadsSessionRows,
    },
    availableFilters: {
      sources: Array.from(new Set(sessions.map((s) => normalizeSourceFromRow(s)))).sort(),
      devices: Array.from(
        new Set(
          sessions
            .map((s) => (s.device_type ?? "").trim().toLowerCase())
            .filter(Boolean),
        ),
      ).sort(),
    },
  };
}

function redactSensitiveObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => redactSensitiveObject(v));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if (
      k.includes("email") ||
      k.includes("phone") ||
      k.includes("zip") ||
      k.includes("postal") ||
      k.includes("first_name") ||
      k.includes("last_name") ||
      k.includes("street") ||
      k.includes("address")
    ) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = redactSensitiveObject(raw);
  }
  return out;
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "[redacted]";
  if (name.length <= 2) return `${name[0] ?? "*"}*@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "[redacted]";
  return `***-***-${digits.slice(-4)}`;
}

export async function fetchAdminAnalyticsExportLast24Hours() {
  const range = resolveAnalyticsRange({ range: "24h" });
  return fetchAdminAnalyticsExportForRange(range, { trafficFilter: "customer", includeLocalDev: false });
}

export async function fetchAdminAnalyticsExportForRange(range: AnalyticsRange, options: ExportFilterOptions = {}) {
  const trafficFilter = options.trafficFilter ?? "customer";
  const includeLocalDev = options.includeLocalDev ?? false;
  const svc = createServiceClient();
  const dashboard = await fetchAdminAnalyticsDashboard(range, trafficFilter, includeLocalDev, {
    sourceFilter: options.sourceFilter,
    deviceFilter: options.deviceFilter,
  });

  const [sessionsRes, eventsRes, pageViewsRes, generationCountRes, leadsCountRes, recentLeadsRes] = await Promise.all([
    svc
      .from("analytics_sessions")
      .select(
        "session_id, session_type, normalized_source, normalized_referrer, created_at, last_seen_at, first_page, last_page, referrer, utm_source, utm_medium, utm_campaign, device_type, browser, os, country, region, city, metadata",
      )
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false }),
    svc
      .from("analytics_events")
      .select("id, created_at, session_id, session_type, normalized_source, normalized_referrer, event_name, page_path, page_title, referrer, metadata")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false }),
    svc
      .from("analytics_page_views")
      .select(
        "id, created_at, ended_at, session_id, session_type, normalized_source, normalized_referrer, page_path, page_title, referrer, duration_seconds, max_scroll_depth, click_count, metadata",
      )
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false }),
    svc
      .from("bathroom_generations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    svc
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    svc
      .from("leads")
      .select("id, created_at, email, phone, timeline, budget_range, zip_code")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  if (pageViewsRes.error) throw new Error(pageViewsRes.error.message);
  if (generationCountRes.error) throw new Error(generationCountRes.error.message);
  if (leadsCountRes.error) throw new Error(leadsCountRes.error.message);
  if (recentLeadsRes.error) throw new Error(recentLeadsRes.error.message);

  const allSessionsInRange = (sessionsRes.data ?? []) as Array<
    SessionRow & { metadata?: Record<string, unknown> | null }
  >;
  const allEventsInRange = (eventsRes.data ?? []) as Array<EventRow & { metadata?: Record<string, unknown> | null }>;
  const allPageViewsInRange = (pageViewsRes.data ?? []) as Array<PageViewRow & { metadata?: Record<string, unknown> | null }>;

  const filteredSessionsRaw = allSessionsInRange
    .filter((s) => !rowIsLocalhost(s))
    .filter((s) => !shouldExcludeLocalDevRow(s, trafficFilter, includeLocalDev))
    .filter((s) => matchesTrafficFilter(inferSessionTypeFromRow(s), trafficFilter))
    .filter((s) => matchesSourceFilter(s, options.sourceFilter))
    .filter((s) => matchesDeviceFilter(s, options.deviceFilter));
  const includedSessionIds = new Set(filteredSessionsRaw.map((s) => s.session_id));
  const filteredEventsRaw = allEventsInRange
    .filter((e) => !rowIsLocalhost(e))
    .filter((e) => !shouldExcludeLocalDevRow(e, trafficFilter, includeLocalDev))
    .filter((e) => matchesTrafficFilter(inferSessionTypeFromRow(e), trafficFilter))
    .filter((e) => includedSessionIds.has(e.session_id))
    .filter((e) => matchesSourceFilter(e, options.sourceFilter));
  const filteredPageViewsRaw = allPageViewsInRange
    .filter((pv) => !rowIsLocalhost(pv))
    .filter((pv) => !shouldExcludeLocalDevRow(pv, trafficFilter, includeLocalDev))
    .filter((pv) => matchesTrafficFilter(inferSessionTypeFromRow(pv), trafficFilter))
    .filter((pv) => includedSessionIds.has(pv.session_id))
    .filter((pv) => matchesSourceFilter(pv, options.sourceFilter));

  const sessions = filteredSessionsRaw
    .map((s) => ({
    ...s,
    metadata: redactSensitiveObject(s.metadata),
  }));
  const events = filteredEventsRaw
    .map((e) => ({
    ...e,
    metadata: redactSensitiveObject(e.metadata),
  }));
  const pageViews = filteredPageViewsRaw
    .map((pv) => ({
    ...pv,
    metadata: redactSensitiveObject(pv.metadata),
  }));

  const duplicateEventWarnings: string[] = [];
  const dedupeCandidates = new Set(["page_viewed", "landing_page_viewed"]);
  const dedupeKeyCounts = new Map<string, number>();
  for (const e of filteredEventsRaw) {
    if (!dedupeCandidates.has(e.event_name)) continue;
    const minuteBucket = new Date(e.created_at);
    minuteBucket.setSeconds(0, 0);
    const key = `${e.session_id}|||${e.event_name}|||${e.page_path ?? ""}|||${minuteBucket.toISOString()}`;
    dedupeKeyCounts.set(key, (dedupeKeyCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of dedupeKeyCounts.entries()) {
    if (count <= 1) continue;
    const [sessionId, eventName, pagePath] = key.split("|||");
    duplicateEventWarnings.push(
      `duplicate ${eventName} detected for session ${sessionId} on ${pagePath || "/"} (${count} within same minute bucket)`,
    );
  }

  const rawAdminSessionIds = new Set(
    allSessionsInRange
      .filter((s) => !rowIsLocalhost(s))
      .filter((s) => inferSessionTypeFromRow(s) === "admin")
      .map((s) => s.session_id),
  );
  const rawLocalDevSessionIds = new Set(
    allSessionsInRange
      .filter((s) => !rowIsLocalhost(s))
      .filter((s) => isLocalDevSourceForFilter(s))
      .map((s) => s.session_id),
  );
  let adminSessionsExcluded = 0;
  for (const sid of rawAdminSessionIds) {
    if (!includedSessionIds.has(sid)) adminSessionsExcluded += 1;
  }
  let localDevSessionsExcluded = 0;
  for (const sid of rawLocalDevSessionIds) {
    if (!includedSessionIds.has(sid)) localDevSessionsExcluded += 1;
  }

  const openPageViewsCount = filteredPageViewsRaw.filter((pv) => !pv.ended_at).length;
  const missingDeviceInfoCount = filteredSessionsRaw.filter((s) => !(s.device_type && s.device_type.trim())).length;

  const uniqueSessionCount = new Set(filteredSessionsRaw.map((s) => s.session_id)).size;
  const uniqueSessionEventCount = (eventName: string): number =>
    new Set(filteredEventsRaw.filter((e) => e.event_name === eventName).map((e) => e.session_id)).size;

  const maskedLeads = (recentLeadsRes.data ?? []).map((l) => ({
    id: l.id,
    created_at: l.created_at,
    email: l.email ? maskEmail(l.email) : null,
    phone: l.phone ? maskPhone(l.phone) : null,
    timeline: l.timeline,
    budget_range: l.budget_range,
    zip_code: l.zip_code,
  }));

  return {
    exported_at: new Date().toISOString(),
    range: {
      start: range.startIso,
      end: range.endIso,
    },
    traffic_filter: trafficFilter,
    include_admin: trafficFilter === "all" || trafficFilter === "admin",
    include_local_dev: includeLocalDev,
    source_filter: options.sourceFilter ?? "all",
    device_filter: options.deviceFilter ?? "all",
    summary: {
      unique_sessions: uniqueSessionCount,
      page_views: pageViews.length,
      upload_cta_clicks: uniqueSessionEventCount("upload_cta_clicked"),
      upload_started: uniqueSessionEventCount("upload_started"),
      upload_completed: uniqueSessionEventCount("upload_completed"),
      generation_started: uniqueSessionEventCount("generation_started"),
      generation_completed: uniqueSessionEventCount("generation_completed"),
      contractor_cta_clicked: uniqueSessionEventCount("contractor_cta_clicked"),
      lead_form_started: uniqueSessionEventCount("lead_form_started"),
      lead_submitted: uniqueSessionEventCount("lead_submitted"),
      generation_count_table: generationCountRes.count ?? 0,
      lead_count_table: leadsCountRes.count ?? 0,
    },
    funnel: dashboard.funnelRows.map((r) => ({
      step: r.step,
      count: r.count,
      conversion_from_previous: r.conversionFromPrev == null ? null : Number((r.conversionFromPrev / 100).toFixed(4)),
      conversion_from_sessions:
        r.conversionFromSessions == null ? null : Number((r.conversionFromSessions / 100).toFixed(4)),
    })),
    page_performance: dashboard.pagePerformanceRows,
    traffic_sources: dashboard.trafficSourceRows,
    sessions,
    page_views: pageViews,
    events,
    leads_masked: maskedLeads,
    data_quality: {
      duplicate_event_warnings: duplicateEventWarnings,
      open_page_views_count: openPageViewsCount,
      admin_sessions_excluded: adminSessionsExcluded,
      local_dev_sessions_excluded: localDevSessionsExcluded,
      missing_device_info_count: missingDeviceInfoCount,
    },
  };
}

type SessionSummaryRow = {
  session_id: string;
  session_type?: string | null;
  created_at: string;
  first_page: string | null;
  last_page: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  metadata: Record<string, unknown> | null;
};

type SessionPageViewRow = {
  created_at: string;
  ended_at: string | null;
  page_path: string;
  duration_seconds: number | null;
  max_scroll_depth: number | null;
  click_count: number | null;
  metadata: Record<string, unknown> | null;
};

type SessionEventRow = {
  created_at: string;
  event_name: string;
  page_path: string | null;
  metadata: Record<string, unknown> | null;
};

export async function fetchAdminAnalyticsSessionDetail(sessionId: string) {
  const svc = createServiceClient();
  const trimmed = sessionId.trim();
  if (!trimmed) return null;

  const [sessionRes, pageViewsRes, eventsRes] = await Promise.all([
    svc
      .from("analytics_sessions")
      .select(
        "session_id, created_at, first_page, last_page, referrer, utm_source, utm_medium, utm_campaign, device_type, browser, os, metadata",
      )
      .eq("session_id", trimmed)
      .maybeSingle(),
    svc
      .from("analytics_page_views")
      .select("created_at, ended_at, page_path, duration_seconds, max_scroll_depth, click_count, metadata")
      .eq("session_id", trimmed)
      .order("created_at", { ascending: true }),
    svc
      .from("analytics_events")
      .select("created_at, event_name, page_path, metadata")
      .eq("session_id", trimmed)
      .order("created_at", { ascending: true }),
  ]);

  if (sessionRes.error) throw new Error(sessionRes.error.message);
  if (pageViewsRes.error) throw new Error(pageViewsRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  if (!sessionRes.data) return null;

  const summary = sessionRes.data as SessionSummaryRow;
  const pageViews = (pageViewsRes.data ?? []) as SessionPageViewRow[];
  const events = (eventsRes.data ?? []) as SessionEventRow[];

  const pagesVisited = new Set<string>();
  let totalDurationSeconds = 0;
  let maxScrollDepth = 0;
  let totalClicks = 0;
  let uploadStarted = false;
  let generationCompleted = false;
  let leadSubmitted = false;

  for (const pv of pageViews) {
    pagesVisited.add(pv.page_path);
    if (typeof pv.duration_seconds === "number") totalDurationSeconds += pv.duration_seconds;
    if (typeof pv.max_scroll_depth === "number") maxScrollDepth = Math.max(maxScrollDepth, pv.max_scroll_depth);
    if (typeof pv.click_count === "number") totalClicks += pv.click_count;
  }

  for (const e of events) {
    if (e.page_path) pagesVisited.add(e.page_path);
    if (e.event_name === "upload_started") uploadStarted = true;
    if (e.event_name === "generation_completed") generationCompleted = true;
    if (e.event_name === "lead_submitted") leadSubmitted = true;
    if (e.event_name === "button_clicked" || e.event_name === "link_clicked") totalClicks += 1;
    const scrollFromEvent = toNum(e.metadata?.max_scroll_depth);
    if (scrollFromEvent != null) maxScrollDepth = Math.max(maxScrollDepth, scrollFromEvent);
    if (totalDurationSeconds === 0 && e.event_name === "page_exited") {
      const dur = toNum(e.metadata?.time_on_page_seconds);
      if (dur != null) totalDurationSeconds += dur;
    }
  }

  const timeline = [
    ...pageViews.map((pv) => ({
      type: "page_view" as const,
      time: pv.created_at,
      pagePath: pv.page_path,
      startedAt: pv.created_at,
      durationSeconds: pv.duration_seconds,
      maxScrollDepth: pv.max_scroll_depth,
      clickCount: pv.click_count,
      metadata: redactSensitiveObject(pv.metadata),
    })),
    ...events.map((e) => ({
      type: "event" as const,
      time: e.created_at,
      eventName: e.event_name,
      pagePath: e.page_path,
      elementText:
        typeof e.metadata?.element_text === "string"
          ? e.metadata.element_text
          : typeof e.metadata?.element_text_preview === "string"
            ? e.metadata.element_text_preview
            : null,
      metadata: redactSensitiveObject(e.metadata),
    })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return {
    summary: {
      sessionId: summary.session_id,
      createdAt: summary.created_at,
      firstPage: summary.first_page || "—",
      referrer: summary.referrer || "direct",
      utmSource: summary.utm_source || "—",
      utmMedium: summary.utm_medium || "—",
      utmCampaign: summary.utm_campaign || "—",
      deviceType: summary.device_type || "—",
      browser: summary.browser || "—",
      os: summary.os || "—",
      totalDurationSeconds,
      pagesVisited: Array.from(pagesVisited),
      maxScrollDepth,
      totalClicks,
      uploadStarted,
      generationCompleted,
      leadSubmitted,
    },
    pageViews,
    events,
    timeline,
  };
}
