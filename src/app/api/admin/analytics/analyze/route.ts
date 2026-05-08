import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { fetchAdminAnalyticsExportForRange, resolveAnalyticsRange, type AnalyticsRange } from "@/lib/data/admin-analytics";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function requireAdminForApi(): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { ok: false, status: 401, message: "Unauthorized" };
  if (isAdminEmail(user.email)) return { ok: true };

  const svc = createServiceClient();
  const { data: profile, error } = await svc.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (error || !profile?.is_admin) return { ok: false, status: 403, message: "Forbidden" };
  return { ok: true };
}

function parseRange(payload: { range?: string; start?: string; end?: string }): AnalyticsRange {
  if (payload.start && payload.end) {
    return resolveAnalyticsRange({ range: "custom", start: payload.start, end: payload.end });
  }
  const r = payload.range === "7d" || payload.range === "30d" || payload.range === "custom" ? payload.range : "24h";
  return resolveAnalyticsRange({ range: r });
}

function compactAnalyticsForAi(exportJson: Awaited<ReturnType<typeof fetchAdminAnalyticsExportForRange>>) {
  return {
    ...exportJson,
    sessions: exportJson.sessions.slice(0, 800),
    events: exportJson.events.slice(0, 1500),
    page_views: exportJson.page_views.slice(0, 1000),
    _truncated_for_ai: {
      sessions_total: exportJson.sessions.length,
      sessions_sent: Math.min(exportJson.sessions.length, 800),
      events_total: exportJson.events.length,
      events_sent: Math.min(exportJson.events.length, 1500),
      page_views_total: exportJson.page_views.length,
      page_views_sent: Math.min(exportJson.page_views.length, 1000),
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminForApi();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { range?: string; start?: string; end?: string };
  const range = parseRange(body);
  const exportJson = await fetchAdminAnalyticsExportForRange(range, {
    trafficFilter: "customer",
    includeLocalDev: false,
  });
  const aiInput = compactAnalyticsForAi(exportJson);

  const prompt = [
    "You are an embedded advisor for Renovision acting simultaneously as:",
    "- product strategist",
    "- conversion rate optimization (CRO) expert",
    "- startup operator",
    "- analytics analyst",
    "",
    "Business context:",
    "Renovision lets homeowners upload a bathroom photo, see an AI remodel mockup, get an estimate, and optionally connect with contractors.",
    "Primary business goal: maximize qualified homeowner leads sold to remodelers.",
    "Primary optimization priority: increase upload conversion and downstream lead conversion without lowering lead quality.",
    "",
    "Analyze the provided analytics JSON for:",
    "- visitor behavior",
    "- landing page performance",
    "- page-by-page dropoff",
    "- upload conversion",
    "- generation conversion",
    "- lead conversion",
    "- traffic source quality",
    "- mobile vs desktop issues",
    "- scroll/click behavior",
    "- friction points",
    "",
    "Output format (use EXACT headings and order):",
    "1. Executive Summary",
    "2. Biggest Funnel Leak",
    "3. Evidence From Data",
    "4. Likely Causes",
    "5. Top 5 Fixes Ranked by Impact",
    "6. Experiments to Run Next",
    "7. Questions the Data Still Cannot Answer",
    "",
    "Response rules:",
    "- Be direct, practical, and opinionated.",
    "- Prioritize revenue impact and upload conversion.",
    "- Do not give generic advice.",
    "- Cite concrete evidence from this dataset (events, pages, source groups, device patterns, conversion deltas).",
    "- If uncertain, state the uncertainty and still recommend the best next action.",
    "- Keep the analysis concise but high-signal.",
    "",
    "Analytics JSON:",
    JSON.stringify(aiInput),
  ].join("\n");

  const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!openAiRes.ok) {
    const errText = await openAiRes.text();
    return NextResponse.json({ error: `OpenAI analyze failed: ${errText.slice(0, 500)}` }, { status: 502 });
  }

  const result = (await openAiRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const analysis = result.choices?.[0]?.message?.content?.trim() ?? "";
  if (!analysis) {
    return NextResponse.json({ error: "AI returned an empty analysis." }, { status: 502 });
  }

  return NextResponse.json({
    analyzed_at: new Date().toISOString(),
    range: { start: range.startIso, end: range.endIso },
    analysis,
  });
}
