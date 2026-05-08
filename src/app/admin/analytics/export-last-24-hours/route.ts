import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchAdminAnalyticsExportLast24Hours } from "@/lib/data/admin-analytics";

async function requireAdminForRoute(): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  if (isAdminEmail(user.email)) {
    return { ok: true };
  }

  const svc = createServiceClient();
  const { data: profile, error } = await svc.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (error || !profile?.is_admin) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return { ok: true };
}

export async function GET() {
  const auth = await requireAdminForRoute();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const payload = await fetchAdminAnalyticsExportLast24Hours();
  const filename = `analytics-last-24-hours-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
