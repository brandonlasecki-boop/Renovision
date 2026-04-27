import { isAdminEmail } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

/** True if this user may access `/admin` (env allowlist or `profiles.is_admin`). */
export async function resolveViewerIsAdmin(params: {
  userId: string;
  email: string | null | undefined;
}): Promise<boolean> {
  if (isAdminEmail(params.email)) {
    return true;
  }
  const svc = createServiceClient();
  const { data, error } = await svc.from("profiles").select("is_admin").eq("id", params.userId).maybeSingle();
  if (error || !data) {
    return false;
  }
  return Boolean(data.is_admin);
}
