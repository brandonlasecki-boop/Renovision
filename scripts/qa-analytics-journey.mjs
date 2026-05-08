/**
 * Analytics QA journey validator (dev/staging only).
 *
 * Simulates one clean customer journey and verifies expected analytics outcomes.
 *
 * Usage:
 *   QA_ANALYTICS_CONFIRM=yes npm run analytics:qa:journey
 *
 * Safety:
 * - Refuses to run in production environments.
 * - Requires explicit confirmation env var.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const confirm = (process.env.QA_ANALYTICS_CONFIRM ?? "").trim().toLowerCase();
const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
const vercelEnv = (process.env.VERCEL_ENV ?? "").trim().toLowerCase();
const appEnv = (process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();

if (nodeEnv === "production" || vercelEnv === "production" || appEnv === "production") {
  console.error("Refusing to run analytics QA script in production environment.");
  process.exit(1);
}

if (confirm !== "yes") {
  console.error("Missing QA_ANALYTICS_CONFIRM=yes confirmation flag.");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = Date.now();
const runTag = `qa-journey-${new Date(now).toISOString().replace(/[:.]/g, "-")}`;
const sessionId = `qa-${randomUUID()}`;
const pageViewHomeId = randomUUID();
const pageViewTryId = randomUUID();
const referrer = "https://www.google.com/search?q=bathroom+remodel+ideas";

const journeySteps = [
  "landing_page_viewed",
  "hero_cta_clicked",
  "upload_started",
  "upload_completed",
  "style_selected",
  "generation_started",
  "generation_completed",
  "contractor_cta_clicked",
  "lead_form_started",
  "lead_submitted",
];

const requiredColumns = {
  analytics_sessions: ["session_type", "normalized_source", "normalized_referrer", "browser", "device_type"],
  analytics_events: ["session_type", "normalized_source", "normalized_referrer"],
  analytics_page_views: ["session_type", "normalized_source", "normalized_referrer", "ended_at", "max_scroll_depth", "click_count"],
};

function iso(offsetSeconds) {
  return new Date(now + offsetSeconds * 1000).toISOString();
}

function assertOk(condition, message, details = null) {
  if (condition) {
    console.log(`PASS: ${message}`);
    return;
  }
  console.error(`FAIL: ${message}`);
  if (details) console.error(details);
  throw new Error(message);
}

async function insertJourneyData() {
  const sessionRow = {
    session_id: sessionId,
    session_type: "customer",
    normalized_source: "google",
    normalized_referrer: "google.com",
    created_at: iso(0),
    last_seen_at: iso(90),
    first_page: "/",
    last_page: "/try",
    referrer,
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "qa_journey",
    device_type: "desktop",
    browser: "Chrome",
    os: "Windows",
    metadata: { qa_tag: runTag, current_host: "renovision.com" },
  };

  const pageViews = [
    {
      id: pageViewHomeId,
      created_at: iso(1),
      ended_at: iso(30),
      session_id: sessionId,
      session_type: "customer",
      normalized_source: "google",
      normalized_referrer: "google.com",
      page_path: "/",
      page_title: "Renovision",
      referrer,
      duration_seconds: 29,
      max_scroll_depth: 50,
      click_count: 1,
      metadata: { qa_tag: runTag, current_host: "renovision.com" },
    },
    {
      id: pageViewTryId,
      created_at: iso(31),
      ended_at: iso(90),
      session_id: sessionId,
      session_type: "customer",
      normalized_source: "google",
      normalized_referrer: "google.com",
      page_path: "/try",
      page_title: "Try",
      referrer: "https://renovision.com/",
      duration_seconds: 59,
      max_scroll_depth: 75,
      click_count: 3,
      metadata: { qa_tag: runTag, current_host: "renovision.com" },
    },
  ];

  const events = [
    { name: "page_viewed", path: "/", t: 2, meta: { qa_tag: runTag } },
    {
      name: "landing_page_viewed",
      path: "/",
      t: 3,
      meta: { qa_tag: runTag, first_page: true, session_landing: true },
    },
    { name: "scroll_50", path: "/", t: 5, meta: { qa_tag: runTag, scroll_depth: 50 } },
    { name: "hero_cta_clicked", path: "/", t: 8, meta: { qa_tag: runTag, placement: "landing_hero_primary" } },
    { name: "upload_cta_clicked", path: "/", t: 9, meta: { qa_tag: runTag, analytics_id: "upload-cta" } },
    { name: "page_exited", path: "/", t: 30, meta: { qa_tag: runTag, time_on_page_seconds: 29, max_scroll_depth: 50 } },
    { name: "page_viewed", path: "/try", t: 32, meta: { qa_tag: runTag } },
    { name: "upload_started", path: "/try", t: 40, meta: { qa_tag: runTag, style_id: "spa_retreat" } },
    { name: "upload_completed", path: "/try", t: 50, meta: { qa_tag: runTag, style_id: "spa_retreat" } },
    {
      name: "style_selected",
      path: "/try",
      t: 52,
      meta: { qa_tag: runTag, style_id: "spa_retreat", style_name: "Spa retreat" },
    },
    { name: "generation_started", path: "/try", t: 55, meta: { qa_tag: runTag, style_id: "spa_retreat", provider: "vertex" } },
    {
      name: "generation_completed",
      path: "/try",
      t: 70,
      meta: { qa_tag: runTag, style_id: "spa_retreat", provider: "vertex", duration_ms: 15000 },
    },
    { name: "contractor_cta_clicked", path: "/try", t: 80, meta: { qa_tag: runTag } },
    { name: "lead_form_started", path: "/try", t: 84, meta: { qa_tag: runTag } },
    {
      name: "lead_submitted",
      path: "/try",
      t: 88,
      meta: { qa_tag: runTag, timeline: "1–3 months", budget_range: "$20K–$35K", zip_code: "10001" },
    },
    { name: "page_exited", path: "/try", t: 90, meta: { qa_tag: runTag, time_on_page_seconds: 59, max_scroll_depth: 75 } },
  ].map((e) => ({
    created_at: iso(e.t),
    session_id: sessionId,
    session_type: "customer",
    normalized_source: "google",
    normalized_referrer: "google.com",
    event_name: e.name,
    page_path: e.path,
    page_title: e.path === "/" ? "Renovision" : "Try",
    referrer: e.path === "/" ? referrer : "https://renovision.com/",
    metadata: {
      ...e.meta,
      current_host: "renovision.com",
      page_path: e.path,
      timestamp: iso(e.t),
    },
  }));

  const adminNoiseSessionId = `qa-admin-${randomUUID().slice(0, 8)}`;
  const adminSessionRow = {
    session_id: adminNoiseSessionId,
    session_type: "admin",
    normalized_source: "internal",
    normalized_referrer: "renovision.com",
    created_at: iso(4),
    first_page: "/admin/analytics",
    last_page: "/admin/analytics",
    referrer: "https://renovision.com/admin",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    device_type: "desktop",
    browser: "Chrome",
    os: "Windows",
    metadata: { qa_tag: runTag, current_host: "renovision.com", page_path: "/admin/analytics" },
  };

  const { error: sessionErr } = await supabase.from("analytics_sessions").insert([sessionRow, adminSessionRow]);
  if (sessionErr) throw new Error(`session insert failed: ${sessionErr.message}`);

  const { error: pvErr } = await supabase.from("analytics_page_views").insert(pageViews);
  if (pvErr) throw new Error(`page_views insert failed: ${pvErr.message}`);

  const { error: eventsErr } = await supabase.from("analytics_events").insert(events);
  if (eventsErr) throw new Error(`events insert failed: ${eventsErr.message}`);
}

async function ensureRequiredSchema() {
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const { data, error } = await supabase.from(table).select(columns.join(",")).limit(1);
    if (!error) continue;
    const message = String(error.message || "").toLowerCase();
    if (!message.includes("could not find")) throw new Error(`schema preflight failed for ${table}: ${error.message}`);
    throw new Error(
      [
        `Schema preflight failed for ${table}. Missing required columns: ${columns.join(", ")}`,
        "Apply latest analytics migrations first (including 027, 028, 029), then rerun QA.",
      ].join("\n"),
    );
  }
}

async function verifyJourneyData() {
  const { data: sessions, error: sessErr } = await supabase
    .from("analytics_sessions")
    .select("session_id, session_type, first_page, browser, device_type")
    .eq("session_id", sessionId);
  if (sessErr) throw new Error(`verify sessions failed: ${sessErr.message}`);
  assertOk((sessions ?? []).length === 1, "one customer session created");

  const { data: pageViews, error: pvErr } = await supabase
    .from("analytics_page_views")
    .select("page_path, duration_seconds, ended_at, max_scroll_depth, click_count")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (pvErr) throw new Error(`verify page_views failed: ${pvErr.message}`);
  assertOk((pageViews ?? []).length === 2, "one page_view row per page visit (/ and /try)");
  assertOk((pageViews ?? []).every((r) => r.ended_at), "all journey page_views are closed (ended_at set)");
  assertOk((pageViews ?? []).find((r) => r.page_path === "/")?.max_scroll_depth === 50, "home max_scroll_depth updated to 50");
  assertOk((pageViews ?? []).find((r) => r.page_path === "/try")?.click_count === 3, "/try click_count incremented");

  const { data: events, error: eventsErr } = await supabase
    .from("analytics_events")
    .select("event_name, page_path, session_id")
    .eq("session_id", sessionId);
  if (eventsErr) throw new Error(`verify events failed: ${eventsErr.message}`);
  const eventList = events ?? [];

  const countByName = (name) => eventList.filter((e) => e.event_name === name).length;
  assertOk(countByName("page_viewed") === 2, "page_viewed fires once per route entry (/, /try)");
  assertOk(countByName("landing_page_viewed") === 1, "landing_page_viewed fires once when first page is /");

  for (const step of journeySteps) {
    assertOk(countByName(step) === 1, `funnel event present once: ${step}`);
  }

  // Unique-session funnel counts should all be 1 for this seeded journey session.
  const uniqueSessionByStep = new Map();
  for (const step of journeySteps) {
    uniqueSessionByStep.set(
      step,
      new Set(eventList.filter((e) => e.event_name === step).map((e) => e.session_id)).size,
    );
  }
  assertOk(
    Array.from(uniqueSessionByStep.values()).every((v) => v === 1),
    "funnel unique-session counts are 1 at each step",
    Object.fromEntries(uniqueSessionByStep),
  );

  const { data: customerSessions, error: customerErr } = await supabase
    .from("analytics_sessions")
    .select("session_id")
    .eq("session_type", "customer")
    .contains("metadata", { qa_tag: runTag });
  if (customerErr) throw new Error(`verify customer filter failed: ${customerErr.message}`);
  assertOk(
    (customerSessions ?? []).some((s) => s.session_id === sessionId),
    "customer-only filtering includes journey session",
  );
}

async function main() {
  console.log(`Running analytics QA journey: ${runTag}`);
  await ensureRequiredSchema();
  await insertJourneyData();
  await verifyJourneyData();
  console.log("PASS: analytics QA journey verification complete");
  console.log("");
  console.log("Manual checks to run in UI:");
  console.log("1) /admin/analytics?range=24h&traffic=customer");
  console.log("2) Confirm funnel shows +1 progression across all requested steps");
  console.log("3) Confirm page performance for / and /try reflects duration/scroll/click counts");
  console.log("4) Export JSON from /api/admin/analytics/export?range=24h and verify journey present");
  console.log("5) Confirm admin traffic excluded by default (traffic=customer)");
  console.log("");
  console.log(`session_id=${sessionId}`);
  console.log(`qa_tag=${runTag}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
