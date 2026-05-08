import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import {
  fetchAdminAnalyticsExportForRange,
  resolveAnalyticsRange,
  type AnalyticsRange,
  type TrafficFilter,
} from "@/lib/data/admin-analytics";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function requireAdminForApi(): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  if (isAdminEmail(user.email)) return { ok: true };

  const svc = createServiceClient();
  const { data: profile, error } = await svc.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (error || !profile?.is_admin) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true };
}

function parseRangeFromQuery(req: NextRequest): AnalyticsRange {
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "24h";
  const startParam = req.nextUrl.searchParams.get("start") ?? undefined;
  const endParam = req.nextUrl.searchParams.get("end") ?? undefined;
  const normalizedRange = rangeParam === "7d" || rangeParam === "30d" || rangeParam === "custom" ? rangeParam : "24h";

  if (startParam && endParam) {
    return resolveAnalyticsRange({ range: "custom", start: startParam, end: endParam });
  }

  return resolveAnalyticsRange({ range: normalizedRange });
}

function parseTrafficFromQuery(req: NextRequest): TrafficFilter {
  const raw = req.nextUrl.searchParams.get("traffic");
  if (raw === "admin" || raw === "all") return raw;
  return "customer";
}

function parseBoolParam(req: NextRequest, key: string): boolean {
  const value = (req.nextUrl.searchParams.get(key) ?? "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminForApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const range = parseRangeFromQuery(req);
  const includeAdmin = parseBoolParam(req, "include_admin");
  const includeLocalDev = parseBoolParam(req, "include_local_dev");
  const sourceFilter = req.nextUrl.searchParams.get("source") ?? "all";
  const deviceFilter = req.nextUrl.searchParams.get("device") ?? "all";
  const trafficFromQuery = parseTrafficFromQuery(req);
  const traffic: TrafficFilter = includeAdmin
    ? trafficFromQuery === "admin" ? "admin" : "all"
    : trafficFromQuery === "admin" ? "customer" : trafficFromQuery;
  const payload = await fetchAdminAnalyticsExportForRange(range, {
    trafficFilter: traffic,
    includeLocalDev,
    sourceFilter,
    deviceFilter,
  });
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
