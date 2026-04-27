import { createClient } from "@/lib/supabase/server";
import type { Company, Project, ProjectPhoto, ProjectUpdate } from "@/types";

export type ProjectDetail = {
  project: Project;
  company: Company;
  updates: ProjectUpdate[];
  photos: ProjectPhoto[];
};

export async function getCompanyForUser(): Promise<Company | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  return data as Company | null;
}

export async function getProjectsForUser(): Promise<Project[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!company?.id) return [];

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("company_id", company.id)
    .order("updated_at", { ascending: false });

  return (projects ?? []) as Project[];
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", (project as Project).company_id)
    .maybeSingle();

  if (!company) return null;

  const { data: updates } = await supabase
    .from("project_updates")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const { data: photos } = await supabase
    .from("project_photos")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return {
    project: project as Project,
    company: company as Company,
    updates: (updates ?? []) as ProjectUpdate[],
    photos: (photos ?? []) as ProjectPhoto[],
  };
}
