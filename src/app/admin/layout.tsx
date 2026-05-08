import type { Metadata } from "next";

import { requireAdminUser } from "@/app/admin/require-admin";
import { AdminLayoutShell } from "@/components/admin/admin-layout-shell";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminUser();

  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
