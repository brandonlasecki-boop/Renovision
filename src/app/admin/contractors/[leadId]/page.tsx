import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fetchAdminContractorDetail, parseZipCodesInput } from "@/lib/data/admin-contractor-accounts";
import { requireAdminUser } from "@/app/admin/require-admin";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

async function updateContractorAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  const contractorId = String(formData.get("contractor_id") ?? "").trim();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!contractorId || !companyName || !email) return;
  const svc = createServiceClient();
  await svc
    .from("contractors")
    .update({
      company_name: companyName.slice(0, 200),
      contact_name: String(formData.get("contact_name") ?? "").trim().slice(0, 200) || null,
      email: email.slice(0, 320),
      phone: String(formData.get("phone") ?? "").trim().slice(0, 80) || null,
      service_zip_codes: parseZipCodesInput(String(formData.get("service_zip_codes") ?? "")),
      notes: String(formData.get("notes") ?? "").trim().slice(0, 4000) || null,
      active: String(formData.get("active") ?? "") === "1",
    })
    .eq("id", contractorId);
  revalidatePath("/admin/contractors");
  revalidatePath(`/admin/contractors/${contractorId}`);
}

export default async function AdminContractorLeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const detail = await fetchAdminContractorDetail(leadId);
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-renovision-navy">Contractor profile</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{detail.companyName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Created {new Date(detail.createdAt).toLocaleString()}</p>
          </div>
          <Link href="/admin/contractors" className="text-sm font-medium text-renovision-navy underline-offset-4 hover:underline">
            Back to contractors
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Company</p><p className="mt-1 text-sm font-medium text-foreground">{detail.companyName}</p></div>
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contact</p><p className="mt-1 text-sm font-medium text-foreground">{detail.contactName || "—"}</p></div>
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Email</p><p className="mt-1 text-sm font-medium text-foreground">{detail.email || "—"}</p></div>
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Phone</p><p className="mt-1 text-sm font-medium text-foreground">{detail.phone || "—"}</p></div>
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active</p><p className="mt-1 text-sm font-medium text-foreground">{detail.active ? "Yes" : "No"}</p></div>
        <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Service ZIP codes</p><p className="mt-1 text-sm font-medium text-foreground">{detail.serviceZipCodes.length ? detail.serviceZipCodes.join(", ") : "—"}</p></div>
      </section>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Edit contractor</h2>
        <form action={updateContractorAction} className="mt-3 grid gap-3 lg:grid-cols-2">
          <input type="hidden" name="contractor_id" value={detail.id} />
          <label className="text-xs text-muted-foreground">
            Company name *
            <input name="company_name" required defaultValue={detail.companyName} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Contact name
            <input name="contact_name" defaultValue={detail.contactName} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Email *
            <input name="email" type="email" required defaultValue={detail.email} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Phone
            <input name="phone" defaultValue={detail.phone} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground lg:col-span-2">
            Service ZIP codes (comma separated)
            <input
              name="service_zip_codes"
              defaultValue={detail.serviceZipCodes.join(", ")}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground lg:col-span-2">
            Notes
            <textarea name="notes" rows={4} defaultValue={detail.notes} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-2 text-sm" />
          </label>
          <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="active" value="1" defaultChecked={detail.active} className="size-4 rounded border-input" />
            Active
          </label>
          <div className="lg:col-span-2">
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Save contractor
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-5 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Assigned / shared leads</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Lead status</th>
                <th className="px-3 py-2 font-medium">Assignment status</th>
                <th className="px-3 py-2 font-medium">Shared at</th>
                <th className="px-3 py-2 font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {detail.assignedOrSharedLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No assigned/shared leads.
                  </td>
                </tr>
              ) : (
                detail.assignedOrSharedLeads.map((row) => (
                  <tr key={row.assignmentId} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{row.leadName}</td>
                    <td className="px-3 py-2">{row.leadStatus}</td>
                    <td className="px-3 py-2">{row.assignmentStatus}</td>
                    <td className="px-3 py-2">{row.sharedAt ? new Date(row.sharedAt).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/leads/${row.leadId}`} className="underline-offset-4 hover:underline">
                        View lead
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Lead response history</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Viewed at</th>
                <th className="px-3 py-2 font-medium">Response</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {detail.leadResponseHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No response history.
                  </td>
                </tr>
              ) : (
                detail.leadResponseHistory.map((row) => (
                  <tr key={row.assignmentId} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{row.assignmentStatus}</td>
                    <td className="px-3 py-2">{row.viewedAt ? new Date(row.viewedAt).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">{row.contractorResponse || "—"}</td>
                    <td className="px-3 py-2">{row.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
