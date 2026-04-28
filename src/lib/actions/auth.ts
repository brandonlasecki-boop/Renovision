"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveAppOrigin } from "@/lib/app-origin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function signIn(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error: string } | undefined> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/projects");
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/projects";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUp(
  _prev: { error?: string; success?: boolean; email?: string } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true; email: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const nextRaw = String(formData.get("next") ?? "/projects").trim();
  const nextPath =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/projects";
  const base = await resolveAppOrigin();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // When "Confirm email" is off in Supabase, you get a session immediately — same as a good login UX.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(nextPath);
  }

  if (!data.user) {
    return {
      error:
        "We could not create this account. The email may already be in use — try signing in, or use a different email.",
    };
  }

  return { success: true as const, email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function sendMagicLink(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const email = String(formData.get("email") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "/projects").trim();
  const nextPath =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/projects";
  if (!email) return { error: "Email is required." };

  const base = await resolveAppOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function resendConfirmationEmail(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const email = String(formData.get("email") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "/projects").trim();
  const nextPath =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/projects";
  if (!email) return { error: "Email is required." };

  const base = await resolveAppOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (error) return { error: error.message };
  return { success: true };
}
