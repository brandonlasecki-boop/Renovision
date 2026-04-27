import { createServiceClient } from "@/lib/supabase/service";
import {
  RENOVISION_SIGNED_IN_FREE_ALLOWANCE,
} from "@/lib/renovision/usage-constants";

export type AnonymousSessionRow = {
  id: string;
  initial_generations_used: number;
  regenerations_used: number;
};

export async function ensureRenovisionAnonymousSessionRow(
  sessionId: string,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("renovision_anonymous_sessions").upsert(
    { id: sessionId },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) {
    throw new Error(error.message);
  }
}

export async function getAnonymousSessionRow(
  sessionId: string,
): Promise<AnonymousSessionRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("renovision_anonymous_sessions")
    .select("id, initial_generations_used, regenerations_used")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    id: String(data.id),
    initial_generations_used: Number(data.initial_generations_used ?? 0),
    regenerations_used: Number(data.regenerations_used ?? 0),
  };
}

/** After a successful first preview for an anonymous session (atomic). */
export async function incrementAnonymousInitialGeneration(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("renovision_bump_anonymous_initial", {
    p_id: sessionId,
  });
  if (error) {
    return { ok: false, reason: error.message };
  }
  if (data !== true) {
    return {
      ok: false,
      reason: "Your free first preview was already used in this browser.",
    };
  }
  return { ok: true };
}

/** Anonymous refinement after the first mockup exists (atomic). */
export async function incrementAnonymousRegeneration(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("renovision_bump_anonymous_regeneration", {
    p_id: sessionId,
  });
  if (error) {
    return { ok: false, reason: error.message };
  }
  if (data !== true) {
    return {
      ok: false,
      reason: "Guest preview limit reached.",
    };
  }
  return { ok: true };
}

export async function getSignedInFreeUsed(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("renovision_user_generation_usage")
    .select("signed_in_free_used")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return 0;
  return Number(data.signed_in_free_used ?? 0);
}

export async function incrementSignedInFreeUsage(
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("renovision_bump_signed_in_free", {
    p_user_id: userId,
  });
  if (error) {
    return { ok: false, reason: error.message };
  }
  if (data !== true) {
    return {
      ok: false,
      reason: `Free account limit reached (${RENOVISION_SIGNED_IN_FREE_ALLOWANCE} previews).`,
    };
  }
  return { ok: true };
}
