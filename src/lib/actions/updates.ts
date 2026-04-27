"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createProjectUpdate(
  _prev: { error?: string } | { success: true } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const projectId = String(formData.get("project_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const nextStep = String(formData.get("next_step") ?? "").trim();
  const progressRaw = Number(formData.get("progress_percent"));

  if (!projectId || !title) {
    return { error: "Title is required." };
  }

  const progressPercent = Number.isFinite(progressRaw)
    ? Math.min(100, Math.max(0, Math.round(progressRaw)))
    : 0;

  const supabase = await createClient();
  const { error } = await supabase.from("project_updates").insert({
    project_id: projectId,
    title,
    note,
    next_step: nextStep,
    progress_percent: progressPercent,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/projects");
  return { success: true as const };
}
