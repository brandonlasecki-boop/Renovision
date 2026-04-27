import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function requireAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    redirect("/login?next=/admin");
  }

  if (isAdminEmail(user.email)) {
    return user;
  }

  const svc = createServiceClient();
  const { data: profile, error } = await svc.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (error || !profile?.is_admin) {
    redirect("/dashboard");
  }

  return user;
}
