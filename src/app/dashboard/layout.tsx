import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { resolveViewerIsAdmin } from "@/lib/admin/resolve-viewer-admin";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const showAdminNav = await resolveViewerIsAdmin({ userId: user.id, email: user.email });

  return (
    <DashboardShell userEmail={user.email} showAdminNav={showAdminNav}>
      {children}
    </DashboardShell>
  );
}
