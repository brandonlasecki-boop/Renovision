"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/is-uuid";

const BUCKET = "project-photos";

export async function uploadProjectPhoto(
  _prev: { error?: string } | { success: true } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const file = formData.get("file");

  if (!projectId) {
    return { error: "Missing project." };
  }
  if (!isUuid(projectId)) {
    return { error: "Invalid project." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to upload photos." };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    return {
      error:
        "Could not access this project. Confirm you’re logged into the correct account and the project exists.",
    };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)
    ? ext
    : "jpg";
  const path = `${projectId}/${crypto.randomUUID()}.${safeExt}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data: maxRow } = await supabase
    .from("project_photos")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { error: insertError } = await supabase.from("project_photos").insert({
    project_id: projectId,
    storage_path: path,
    sort_order: nextOrder,
  });

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: insertError.message };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: true as const };
}

export async function deleteProjectPhotoForm(formData: FormData): Promise<void> {
  const photoId = String(formData.get("photo_id") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const storagePath = String(formData.get("storage_path") ?? "");
  if (!photoId || !projectId || !storagePath) {
    return;
  }

  const supabase = await createClient();
  const { error: delDb } = await supabase
    .from("project_photos")
    .delete()
    .eq("id", photoId);

  if (delDb) {
    return;
  }

  await supabase.storage.from(BUCKET).remove([storagePath]);
  revalidatePath(`/dashboard/projects/${projectId}`);
}
