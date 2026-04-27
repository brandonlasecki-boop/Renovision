import { createServiceClient } from "@/lib/supabase/service";
import type { BidMaterialLine } from "@/types/bid";

export type HomeownerTryProjectRow = {
  id: string;
  anonymous_session_id: string | null;
  user_id: string | null;
  before_storage_path: string;
  scope_description: string;
  ai_summary: string | null;
  material_estimate: unknown;
  ai_status: "idle" | "pending" | "complete" | "failed";
  ai_last_error: string | null;
};

export type HomeownerTryMockupRow = {
  id: string;
  mockup_generation: number;
  storage_path: string;
  caption: string | null;
};

export async function getHomeownerTryProjectById(
  projectId: string,
): Promise<HomeownerTryProjectRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("homeowner_try_projects")
    .select(
      "id, anonymous_session_id, user_id, before_storage_path, scope_description, ai_summary, material_estimate, ai_status, ai_last_error",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return data as unknown as HomeownerTryProjectRow;
}

export async function findHomeownerTryProjectForContext(opts: {
  userId: string | null;
  anonymousSessionId: string | null;
}): Promise<HomeownerTryProjectRow | null> {
  const supabase = createServiceClient();
  if (opts.userId) {
    const { data, error } = await supabase
      .from("homeowner_try_projects")
      .select(
        "id, anonymous_session_id, user_id, before_storage_path, scope_description, ai_summary, material_estimate, ai_status, ai_last_error",
      )
      .eq("user_id", opts.userId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (data) return data as unknown as HomeownerTryProjectRow;
  }
  if (opts.anonymousSessionId) {
    const { data, error } = await supabase
      .from("homeowner_try_projects")
      .select(
        "id, anonymous_session_id, user_id, before_storage_path, scope_description, ai_summary, material_estimate, ai_status, ai_last_error",
      )
      .eq("anonymous_session_id", opts.anonymousSessionId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (data) return data as unknown as HomeownerTryProjectRow;
  }
  return null;
}

export async function insertHomeownerTryProject(row: {
  id: string;
  anonymous_session_id: string | null;
  user_id: string | null;
  before_storage_path: string;
  scope_description: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("homeowner_try_projects").insert({
    id: row.id,
    anonymous_session_id: row.anonymous_session_id,
    user_id: row.user_id,
    before_storage_path: row.before_storage_path,
    scope_description: row.scope_description,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function claimHomeownerTryProjectsForUser(
  anonymousSessionId: string,
  userId: string,
): Promise<void> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data: updatedRows, error } = await supabase
    .from("homeowner_try_projects")
    .update({
      user_id: userId,
      anonymous_session_id: null,
      converted_from_anon_session_id: anonymousSessionId,
      anon_converted_at: now,
      updated_at: now,
    })
    .eq("anonymous_session_id", anonymousSessionId)
    .select("id");
  if (error) {
    throw new Error(error.message);
  }
  if (updatedRows?.length) {
    await supabase.from("renovision_analytics_events").insert({
      event_type: "anonymous_converted_to_signup",
      user_id: userId,
      anonymous_session_id: anonymousSessionId,
      metadata: { project_ids: updatedRows.map((r) => r.id) },
    });
  }
}

export async function insertRenovisionRemodelerRequest(row: {
  user_id: string | null;
  email: string | null;
  project_id: string | null;
  note: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { data: inserted, error } = await supabase
    .from("renovision_remodeler_requests")
    .insert({
      user_id: row.user_id,
      email: row.email?.trim() || null,
      project_id: row.project_id,
      note: row.note.trim().slice(0, 4000),
    })
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  await supabase.from("renovision_analytics_events").insert({
    event_type: "remodeler_request_submitted",
    user_id: row.user_id,
    project_id: row.project_id,
    metadata: {
      request_id: inserted?.id ?? null,
      has_guest_email: Boolean(row.user_id == null && row.email),
    },
  });
}

export async function listMockupsForHomeownerProject(
  projectId: string,
): Promise<HomeownerTryMockupRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("homeowner_try_mockups")
    .select("id, mockup_generation, storage_path, caption")
    .eq("project_id", projectId)
    .order("mockup_generation", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as HomeownerTryMockupRow[];
}

export async function updateHomeownerTryProjectAi(
  projectId: string,
  patch: {
    ai_summary?: string | null;
    material_estimate?: BidMaterialLine[];
    ai_status?: "idle" | "pending" | "complete" | "failed";
    ai_last_error?: string | null;
    scope_description?: string;
  },
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("homeowner_try_projects")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (error) {
    throw new Error(error.message);
  }
}
