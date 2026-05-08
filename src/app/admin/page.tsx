import { redirect } from "next/navigation";

/** Admin home: Renovision control center (estimates overview removed). */
export default function AdminIndexPage() {
  redirect("/admin/overview");
}
