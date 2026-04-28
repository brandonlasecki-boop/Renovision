"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function renameSavedProjectAction(
  formData: FormData,
): Promise<void> {
  const savedProjectId = String(formData.get("saved_project_id") ?? "").trim();
  const rawName = String(formData.get("project_name") ?? "").trim();
  const projectName = rawName.slice(0, 80);
  if (!savedProjectId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("renovision_saved_projects")
    .update({ project_name: projectName || null })
    .eq("id", savedProjectId)
    .eq("user_id", user.id);

  revalidatePath("/projects");
  revalidatePath("/try");
}
