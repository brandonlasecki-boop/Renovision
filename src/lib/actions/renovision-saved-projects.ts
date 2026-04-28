"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function renameSavedProjectAction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const savedProjectId = String(formData.get("saved_project_id") ?? "").trim();
  const rawName = String(formData.get("project_name") ?? "").trim();
  const projectName = rawName.slice(0, 80);
  if (!savedProjectId) return { error: "Missing project id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { error } = await supabase
    .from("renovision_saved_projects")
    .update({ project_name: projectName || null })
    .eq("id", savedProjectId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath("/try");
  return { success: true };
}
