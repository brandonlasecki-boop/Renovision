import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";

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
