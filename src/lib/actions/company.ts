"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertCompany(
  _prev: { error?: string } | { success: true } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim() || null;
  const brandColor = String(formData.get("brand_color") ?? "").trim() || "#0f172a";

  if (!name) {
    return { error: "Company name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("companies")
      .update({
        name,
        tagline,
        brand_color: brandColor,
      })
      .eq("id", existing.id);
    if (error) {
      return { error: error.message };
    }
  } else {
    const { error } = await supabase.from("companies").insert({
      owner_id: user.id,
      name,
      tagline,
      brand_color: brandColor,
    });
    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/dashboard");
  return { success: true as const };
}
