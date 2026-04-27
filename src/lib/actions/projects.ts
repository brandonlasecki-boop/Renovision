"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function getCompanyIdForUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." as const, companyId: null };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!company) {
    return { error: "Create your company first." as const, companyId: null };
  }

  return { companyId: company.id as string, error: null };
}

export async function createProject(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error: string } | undefined> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "Project title is required." };
  }

  const { companyId, error } = await getCompanyIdForUser();
  if (error || !companyId) {
    return { error: error ?? "No company." };
  }

  const supabase = await createClient();
  const { data, error: insertError } = await supabase
    .from("projects")
    .insert({ company_id: companyId, title })
    .select("id")
    .single();

  if (insertError || !data) {
    return { error: insertError?.message ?? "Could not create project." };
  }

  revalidatePath("/dashboard/projects");
  redirect(`/dashboard/projects/${data.id}`);
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/dashboard/projects");
  return { success: true as const };
}
