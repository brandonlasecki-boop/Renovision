import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import {
  getBathroomStyleById,
  resolveBathroomStyleIdFromGeneration,
} from "@/lib/homeowner-try/bathroom-styles";
import { getRenovisionAnonymousSessionIdFromCookie } from "@/lib/renovision/anonymous-cookie";

export type SavedProjectCard = {
  id: string;
  projectId: string;
  generationId: string | null;
  projectName: string | null;
  selectedStyle: string | null;
  estimateMin: number | null;
  estimateMax: number | null;
  createdAt: string;
  mockupUrl: string | null;
};

export async function listViewerSavedProjects(): Promise<SavedProjectCard[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const svc = createServiceClient();
  const { data } = await svc
    .from("renovision_saved_projects")
    .select(
      "id, project_id, generation_id, project_name, selected_style, estimate_min, estimate_max, created_at, generated_storage_path",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const out: SavedProjectCard[] = [];
  for (const row of rows) {
    const path = String(row.generated_storage_path ?? "");
    const signed = path
      ? await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(path, 60 * 60)
      : { data: { signedUrl: null } };
    out.push({
      id: String(row.id),
      projectId: String(row.project_id),
      generationId: row.generation_id ? String(row.generation_id) : null,
      projectName: row.project_name ? String(row.project_name) : null,
      selectedStyle: row.selected_style ? String(row.selected_style) : null,
      estimateMin: row.estimate_min == null ? null : Number(row.estimate_min),
      estimateMax: row.estimate_max == null ? null : Number(row.estimate_max),
      createdAt: String(row.created_at),
      mockupUrl: signed.data?.signedUrl ?? null,
    });
  }
  return out;
}

/**
 * Guest try sessions: show try projects for this browser (no explicit “save” required).
 * Discover by `homeowner_try_projects.anonymous_session_id` and by `bathroom_generations.session_id`
 * so listings stay in sync with `/try` restore (which keys off generation session_id).
 */
async function listGuestTryProjectsAsCards(): Promise<SavedProjectCard[]> {
  const anonId = await getRenovisionAnonymousSessionIdFromCookie();
  if (!anonId) return [];

  const svc = createServiceClient();

  const [{ data: linkedProjects }, { data: sessionGenRows }] = await Promise.all([
    svc
      .from("homeowner_try_projects")
      .select("id")
      .eq("anonymous_session_id", anonId)
      .is("user_id", null),
    svc.from("bathroom_generations").select("project_id").eq("session_id", anonId),
  ]);

  const projectIds = new Set<string>();
  for (const row of linkedProjects ?? []) {
    projectIds.add(String(row.id));
  }
  for (const row of sessionGenRows ?? []) {
    const pid = row.project_id != null ? String(row.project_id) : "";
    if (pid) projectIds.add(pid);
  }

  if (projectIds.size === 0) return [];

  const ids = [...projectIds];
  const { data: projects } = await svc
    .from("homeowner_try_projects")
    .select("id, created_at")
    .in("id", ids)
    .is("user_id", null)
    .order("updated_at", { ascending: false });

  const out: SavedProjectCard[] = [];
  for (const p of projects ?? []) {
    const projectId = String(p.id);
    const { data: gen } = await svc
      .from("bathroom_generations")
      .select("id, estimate_min, estimate_max, selected_style, generated_image_url")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!gen?.id) continue;

    const genPath = String(gen.generated_image_url ?? "").trim();
    let mockupUrl: string | null = null;
    if (genPath) {
      const signed = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(genPath, 60 * 60);
      mockupUrl = signed.data?.signedUrl ?? null;
    }

    const styleId = resolveBathroomStyleIdFromGeneration(gen.selected_style);
    const styleMeta = getBathroomStyleById(styleId);
    const displayName = styleMeta?.name ?? String(gen.selected_style ?? "Remodel preview");

    out.push({
      id: `guest:${projectId}`,
      projectId,
      generationId: String(gen.id),
      projectName: displayName,
      selectedStyle: gen.selected_style ? String(gen.selected_style) : null,
      estimateMin: gen.estimate_min == null ? null : Number(gen.estimate_min),
      estimateMax: gen.estimate_max == null ? null : Number(gen.estimate_max),
      createdAt: String(p.created_at),
      mockupUrl,
    });
  }
  return out;
}

/**
 * Signed-in try completions live on `homeowner_try_projects` / `bathroom_generations` before the user
 * taps “Save My Project”. Mirror guest discovery but keyed by `user_id`.
 */
async function listSignedInTryProjectsAsCards(
  userId: string,
  excludeProjectIds: Set<string>,
): Promise<SavedProjectCard[]> {
  const svc = createServiceClient();

  const [{ data: linkedProjects }, { data: userGenRows }] = await Promise.all([
    svc.from("homeowner_try_projects").select("id").eq("user_id", userId),
    svc.from("bathroom_generations").select("project_id").eq("user_id", userId),
  ]);

  const projectIds = new Set<string>();
  for (const row of linkedProjects ?? []) {
    projectIds.add(String(row.id));
  }
  for (const row of userGenRows ?? []) {
    const pid = row.project_id != null ? String(row.project_id) : "";
    if (pid) projectIds.add(pid);
  }

  for (const id of excludeProjectIds) {
    projectIds.delete(id);
  }

  if (projectIds.size === 0) return [];

  const ids = [...projectIds];
  const { data: projects } = await svc
    .from("homeowner_try_projects")
    .select("id, created_at")
    .in("id", ids)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  const out: SavedProjectCard[] = [];
  for (const p of projects ?? []) {
    const projectId = String(p.id);
    const { data: gen } = await svc
      .from("bathroom_generations")
      .select("id, estimate_min, estimate_max, selected_style, generated_image_url")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!gen?.id) continue;

    const genPath = String(gen.generated_image_url ?? "").trim();
    let mockupUrl: string | null = null;
    if (genPath) {
      const signed = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(genPath, 60 * 60);
      mockupUrl = signed.data?.signedUrl ?? null;
    }

    const styleId = resolveBathroomStyleIdFromGeneration(gen.selected_style);
    const styleMeta = getBathroomStyleById(styleId);
    const displayName = styleMeta?.name ?? String(gen.selected_style ?? "Remodel preview");

    out.push({
      id: `try:${projectId}`,
      projectId,
      generationId: String(gen.id),
      projectName: displayName,
      selectedStyle: gen.selected_style ? String(gen.selected_style) : null,
      estimateMin: gen.estimate_min == null ? null : Number(gen.estimate_min),
      estimateMax: gen.estimate_max == null ? null : Number(gen.estimate_max),
      createdAt: String(p.created_at),
      mockupUrl,
    });
  }
  return out;
}

/** Signed-in: saved rows plus try projects not yet in `renovision_saved_projects`. Guests: try projects for this browser. */
export async function listProjectsForProjectsPage(): Promise<{
  rows: Array<{ card: SavedProjectCard; isGuest: boolean; isSavedRow: boolean }>;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const saved = await listViewerSavedProjects();
    const savedProjectIds = new Set(saved.map((c) => c.projectId));
    const tryCards = await listSignedInTryProjectsAsCards(user.id, savedProjectIds);
    const rows = [
      ...saved.map((card) => ({ card, isGuest: false, isSavedRow: true as const })),
      ...tryCards.map((card) => ({ card, isGuest: false, isSavedRow: false as const })),
    ];
    rows.sort((a, b) => new Date(b.card.createdAt).getTime() - new Date(a.card.createdAt).getTime());
    return { rows };
  }
  const cards = await listGuestTryProjectsAsCards();
  return { rows: cards.map((card) => ({ card, isGuest: true, isSavedRow: false as const })) };
}

export type SavedProjectDetail = {
  id: string;
  projectId: string;
  generationId: string | null;
  projectName: string | null;
  selectedStyle: string | null;
  estimateMin: number | null;
  estimateMax: number | null;
  createdAt: string;
  originalUrl: string | null;
  mockupUrl: string | null;
};

export async function loadViewerSavedProject(savedProjectId: string): Promise<SavedProjectDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();
  const { data } = await svc
    .from("renovision_saved_projects")
    .select(
      "id, user_id, project_id, generation_id, project_name, selected_style, estimate_min, estimate_max, created_at, before_storage_path, generated_storage_path",
    )
    .eq("id", savedProjectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;

  const beforePath = String(data.before_storage_path ?? "");
  const generatedPath = String(data.generated_storage_path ?? "");
  const [beforeSigned, generatedSigned] = await Promise.all([
    beforePath ? svc.storage.from(PHOTOS_BUCKET).createSignedUrl(beforePath, 60 * 60) : Promise.resolve({ data: { signedUrl: null } }),
    generatedPath ? svc.storage.from(PHOTOS_BUCKET).createSignedUrl(generatedPath, 60 * 60) : Promise.resolve({ data: { signedUrl: null } }),
  ]);

  return {
    id: String(data.id),
    projectId: String(data.project_id),
    generationId: data.generation_id ? String(data.generation_id) : null,
    projectName: data.project_name ? String(data.project_name) : null,
    selectedStyle: data.selected_style ? String(data.selected_style) : null,
    estimateMin: data.estimate_min == null ? null : Number(data.estimate_min),
    estimateMax: data.estimate_max == null ? null : Number(data.estimate_max),
    createdAt: String(data.created_at),
    originalUrl: beforeSigned.data?.signedUrl ?? null,
    mockupUrl: generatedSigned.data?.signedUrl ?? null,
  };
}
