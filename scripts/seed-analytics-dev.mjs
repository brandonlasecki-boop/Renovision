/**
 * Dev-only analytics seed data for admin dashboard verification.
 *
 * Usage:
 *   DEV_ANALYTICS_SEED_CONFIRM=yes npm run analytics:seed:dev
 *
 * Safety:
 * - Refuses to run in production environments.
 * - Requires explicit confirmation env var.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const confirm = (process.env.DEV_ANALYTICS_SEED_CONFIRM ?? "").trim().toLowerCase();
const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
const vercelEnv = (process.env.VERCEL_ENV ?? "").trim().toLowerCase();
const appEnv = (process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();

if (nodeEnv === "production" || vercelEnv === "production" || appEnv === "production") {
  console.error("Refusing to run analytics seed in production environment.");
  process.exit(1);
}

if (confirm !== "yes") {
  console.error("Missing DEV_ANALYTICS_SEED_CONFIRM=yes confirmation flag.");
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

const nowMs = Date.now();
const seedTag = `dev-seed-${new Date().toISOString().slice(0, 19)}`;
const referrers = [
  "https://www.google.com/",
  "https://www.facebook.com/",
  "https://www.instagram.com/",
  "https://www.tiktok.com/",
  "direct",
];
const utmSources = ["google", "facebook", "instagram", "tiktok", "direct"];
const devices = ["mobile", "desktop", "tablet"];
const browsers = ["Chrome", "Safari", "Firefox", "Edge"];
const oses = ["iOS", "Android", "Windows", "macOS"];

function isoMinusMinutes(mins) {
  return new Date(nowMs - mins * 60 * 1000).toISOString();
}

function pick(arr, idx) {
  return arr[idx % arr.length];
}

async function main() {
  const sessionRows = [];
  const pageViewRows = [];
  const eventRows = [];

  for (let i = 0; i < 10; i += 1) {
    const sessionId = `dev-${seedTag}-${i + 1}-${randomUUID().slice(0, 8)}`;
    const createdAt = isoMinusMinutes(60 * (i + 1));
    const referrer = pick(referrers, i);
    const utmSource = pick(utmSources, i);
    const utmCampaign = utmSource === "direct" ? "organic" : `spring_launch_${utmSource}`;
    const firstPage = i % 3 === 0 ? "/" : "/upload";
    const lastPage = i % 4 === 0 ? "/try" : "/upload";

    sessionRows.push({
      session_id: sessionId,
      created_at: createdAt,
      last_seen_at: isoMinusMinutes(60 * i),
      first_page: firstPage,
      last_page: lastPage,
      referrer,
      utm_source: utmSource,
      utm_medium: utmSource === "direct" ? "none" : "paid_social",
      utm_campaign: utmCampaign,
      device_type: pick(devices, i),
      browser: pick(browsers, i),
      os: pick(oses, i),
      metadata: { seed_tag: seedTag, sample: true },
    });

    const viewedLanding = i < 8;
    const clickedHero = i < 7;
    const uploadStarted = i < 6;
    const uploadCompleted = i < 5;
    const generationCompleted = i < 4;
    const leadSubmitted = i < 2;

    const baseEventTimeMin = 60 * (i + 1);

    if (viewedLanding) {
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 1),
        session_id: sessionId,
        event_name: "landing_page_viewed",
        page_path: "/",
        page_title: "Renovision",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag, session_index: i + 1 },
      });
    }
    if (clickedHero) {
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 2),
        session_id: sessionId,
        event_name: "hero_cta_clicked",
        page_path: "/",
        page_title: "Renovision",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag, placement: "landing_hero_primary" },
      });
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 3),
        session_id: sessionId,
        event_name: "upload_cta_clicked",
        page_path: "/",
        page_title: "Renovision",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag, placement: "landing_hero_primary" },
      });
    }
    if (uploadStarted) {
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 4),
        session_id: sessionId,
        event_name: "upload_started",
        page_path: "/upload",
        page_title: "Upload",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag, style_id: "spa_retreat" },
      });
    }
    if (uploadCompleted) {
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 5),
        session_id: sessionId,
        event_name: "upload_completed",
        page_path: "/upload",
        page_title: "Upload",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag, style_id: "spa_retreat" },
      });
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 6),
        session_id: sessionId,
        event_name: "generation_started",
        page_path: "/try",
        page_title: "Try",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag, style_id: "spa_retreat", provider: "vertex" },
      });
    }
    if (generationCompleted) {
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 7),
        session_id: sessionId,
        event_name: "generation_completed",
        page_path: "/try",
        page_title: "Try",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag, style_id: "spa_retreat", provider: "vertex", duration_ms: 42000 + i * 7000 },
      });
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 8),
        session_id: sessionId,
        event_name: "contractor_cta_clicked",
        page_path: "/try",
        page_title: "Try",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag },
      });
    }
    if (leadSubmitted) {
      eventRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 9),
        session_id: sessionId,
        event_name: "lead_submitted",
        page_path: "/try",
        page_title: "Try",
        referrer: referrer === "direct" ? null : referrer,
        metadata: { seed_tag: seedTag, timeline: "1–3 months", budget_range: "$20K–$35K", zip_code: "10001" },
      });
    }

    const scrollMilestones = [25, 50, 75, 100];
    for (const m of scrollMilestones) {
      if (m <= (25 * ((i % 4) + 1))) {
        eventRows.push({
          created_at: isoMinusMinutes(baseEventTimeMin - (10 + m / 25)),
          session_id: sessionId,
          event_name: `scroll_${m}`,
          page_path: viewedLanding ? "/" : "/upload",
          page_title: viewedLanding ? "Renovision" : "Upload",
          referrer: referrer === "direct" ? null : referrer,
          metadata: { seed_tag: seedTag, scroll_depth: m },
        });
      }
    }

    eventRows.push({
      created_at: isoMinusMinutes(baseEventTimeMin - 15),
      session_id: sessionId,
      event_name: "button_clicked",
      page_path: viewedLanding ? "/" : "/upload",
      page_title: viewedLanding ? "Renovision" : "Upload",
      referrer: referrer === "direct" ? null : referrer,
      metadata: { seed_tag: seedTag, analytics_id: viewedLanding ? "upload-cta" : "upload-button", element_type: "button" },
    });

    eventRows.push({
      created_at: isoMinusMinutes(baseEventTimeMin - 16),
      session_id: sessionId,
      event_name: "page_viewed",
      page_path: viewedLanding ? "/" : "/upload",
      page_title: viewedLanding ? "Renovision" : "Upload",
      referrer: referrer === "direct" ? null : referrer,
      metadata: { seed_tag: seedTag },
    });

    eventRows.push({
      created_at: isoMinusMinutes(baseEventTimeMin - 17),
      session_id: sessionId,
      event_name: "page_exited",
      page_path: viewedLanding ? "/" : "/upload",
      page_title: viewedLanding ? "Renovision" : "Upload",
      referrer: referrer === "direct" ? null : referrer,
      metadata: {
        seed_tag: seedTag,
        time_on_page_seconds: 25 + i * 5,
        max_scroll_depth: 25 * ((i % 4) + 1),
      },
    });

    pageViewRows.push({
      created_at: isoMinusMinutes(baseEventTimeMin - 16),
      ended_at: isoMinusMinutes(baseEventTimeMin - 17),
      session_id: sessionId,
      page_path: viewedLanding ? "/" : "/upload",
      page_title: viewedLanding ? "Renovision" : "Upload",
      referrer: referrer === "direct" ? null : referrer,
      duration_seconds: 25 + i * 5,
      max_scroll_depth: 25 * ((i % 4) + 1),
      click_count: 1 + (i % 3),
      metadata: { seed_tag: seedTag, sample: true },
    });

    if (uploadStarted) {
      pageViewRows.push({
        created_at: isoMinusMinutes(baseEventTimeMin - 4),
        ended_at: isoMinusMinutes(baseEventTimeMin - 7),
        session_id: sessionId,
        page_path: "/try",
        page_title: "Try",
        referrer: referrer === "direct" ? null : referrer,
        duration_seconds: 45 + i * 8,
        max_scroll_depth: 50 + (i % 2) * 25,
        click_count: 2 + (i % 2),
        metadata: { seed_tag: seedTag, sample: true },
      });
    }
  }

  const { error: sessionsErr } = await supabase.from("analytics_sessions").insert(sessionRows);
  if (sessionsErr) throw new Error(`analytics_sessions insert failed: ${sessionsErr.message}`);

  const { error: pageViewsErr } = await supabase.from("analytics_page_views").insert(pageViewRows);
  if (pageViewsErr) throw new Error(`analytics_page_views insert failed: ${pageViewsErr.message}`);

  const { error: eventsErr } = await supabase.from("analytics_events").insert(eventRows);
  if (eventsErr) throw new Error(`analytics_events insert failed: ${eventsErr.message}`);

  console.log("Dev analytics seed complete.");
  console.log(`seed_tag=${seedTag}`);
  console.log(`sessions=${sessionRows.length}, page_views=${pageViewRows.length}, events=${eventRows.length}`);
  console.log("Verify:");
  console.log("- /admin/analytics?range=24h");
  console.log("- /admin/sessions");
  console.log("- /admin/analytics/export-last-24-hours");
  console.log("- /admin/analytics/sessions/[session_id]");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
