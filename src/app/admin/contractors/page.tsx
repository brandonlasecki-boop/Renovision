import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  fetchAdminContractorAccounts,
  parseZipCodesInput,
} from "@/lib/data/admin-contractor-accounts";
import { requireAdminUser } from "@/app/admin/require-admin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";

export const metadata = {
  title: "Admin - Contractor Directory",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function addContractorAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!companyName || !email) return;
  const svc = createServiceClient();
  await svc.from("contractors").insert({
    company_name: companyName.slice(0, 200),
    contact_name: String(formData.get("contact_name") ?? "").trim().slice(0, 200) || null,
    email: email.slice(0, 320),
    phone: String(formData.get("phone") ?? "").trim().slice(0, 80) || null,
    service_zip_codes: parseZipCodesInput(String(formData.get("service_zip_codes") ?? "")),
    notes: String(formData.get("notes") ?? "").trim().slice(0, 4000) || null,
    active: String(formData.get("active") ?? "1") === "1",
  });
  revalidatePath("/admin/contractors");
}

async function editContractorAction(formData: FormData) {
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

async function deactivateContractorAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  const contractorId = String(formData.get("contractor_id") ?? "").trim();
  if (!contractorId) return;
  const svc = createServiceClient();
  await svc.from("contractors").update({ active: false }).eq("id", contractorId);
  revalidatePath("/admin/contractors");
  revalidatePath(`/admin/contractors/${contractorId}`);
}

export default async function AdminContractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: "all" | "active" | "inactive"; shared_since?: string }>;
}) {
  const sp = await searchParams;
  const contractors = await fetchAdminContractorAccounts();
  const q = (sp.q ?? "").trim().toLowerCase();
  const activeFilter = sp.active ?? "all";
  const sharedSince = sp.shared_since ?? "";
  const sharedSinceDate = sharedSince ? new Date(`${sharedSince}T00:00:00.000Z`) : null;
  const filteredContractors = contractors.filter((contractor) => {
    if (activeFilter === "active" && !contractor.active) return false;
    if (activeFilter === "inactive" && contractor.active) return false;
    if (q) {
      const haystack = [
        contractor.companyName,
        contractor.contactName ?? "",
        contractor.email ?? "",
        contractor.phone ?? "",
        contractor.serviceZipCodes.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (sharedSinceDate && contractor.lastSharedDate) {
      return new Date(contractor.lastSharedDate).getTime() >= sharedSinceDate.getTime();
    }
    if (sharedSinceDate && !contractor.lastSharedDate) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-renovision-navy">Partner directory</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight">Contractor partner directory</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Minimal contractor management for lead sharing. User/login onboarding is handled manually for now.
        </p>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <form action="/admin/contractors" method="get" className="grid gap-3 lg:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            Search company/contact/email/phone/ZIP
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Active status
            <select
              name="active"
              defaultValue={activeFilter}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Shared since
            <input
              type="date"
              name="shared_since"
              defaultValue={sharedSince}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Apply filters
            </button>
            <Link href="/admin/contractors" className="h-9 rounded-md border border-border px-3 pt-2 text-sm hover:bg-muted/40">
              Clear
            </Link>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">Add contractor</h3>
        <form action={addContractorAction} className="mt-3 grid gap-3 lg:grid-cols-3">
          <label className="text-xs text-muted-foreground">
            Company name *
            <input name="company_name" required className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Contact name
            <input name="contact_name" className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Email *
            <input name="email" type="email" required className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Phone
            <input name="phone" className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground lg:col-span-2">
            Service ZIP codes (comma separated)
            <input
              name="service_zip_codes"
              placeholder="10001, 10011, 11201"
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground lg:col-span-2">
            Notes
            <textarea name="notes" rows={3} className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-2 text-sm" />
          </label>
          <label className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="active" value="1" defaultChecked className="size-4 rounded border-input" />
            Active
          </label>
          <div className="lg:col-span-3">
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Add contractor
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Contractors</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{filteredContractors.length}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{filteredContractors.filter((c) => c.active).length}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Inactive</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{filteredContractors.filter((c) => !c.active).length}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1380px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Active</th>
                <th className="px-4 py-3 font-semibold">Service ZIP codes</th>
                <th className="px-4 py-3 font-semibold">Leads shared</th>
                <th className="px-4 py-3 font-semibold">Leads accepted</th>
                <th className="px-4 py-3 font-semibold">Last shared date</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContractors.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No contractors match this filter. Try clearing search or status filters.
                  </td>
                </tr>
              ) : (
                filteredContractors.map((contractor) => (
                  <tr key={contractor.id} className="border-b border-border/40 align-top last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{contractor.companyName}</td>
                    <td className="px-4 py-3">{contractor.contactName || "—"}</td>
                    <td className="px-4 py-3">{contractor.email || "—"}</td>
                    <td className="px-4 py-3">{contractor.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge label={contractor.active ? "Active" : "Inactive"} tone={contractor.active ? "success" : "neutral"} />
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3" title={contractor.serviceZipCodes.join(", ") || undefined}>
                      {contractor.serviceZipCodes.length ? contractor.serviceZipCodes.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{contractor.leadsShared}</td>
                    <td className="px-4 py-3 tabular-nums">{contractor.leadsAccepted}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {contractor.lastSharedDate ? new Date(contractor.lastSharedDate).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/admin/contractors/${contractor.id}`}
                          className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted/40"
                        >
                          View profile
                        </Link>
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Edit</summary>
                          <form action={editContractorAction} className="mt-2 space-y-2 rounded-md border border-border/60 p-2">
                            <input type="hidden" name="contractor_id" value={contractor.id} />
                            <input name="company_name" defaultValue={contractor.companyName} required className="h-8 w-full rounded border border-input bg-background px-2 text-xs" />
                            <input name="contact_name" defaultValue={contractor.contactName} className="h-8 w-full rounded border border-input bg-background px-2 text-xs" />
                            <input name="email" defaultValue={contractor.email} required className="h-8 w-full rounded border border-input bg-background px-2 text-xs" />
                            <input name="phone" defaultValue={contractor.phone} className="h-8 w-full rounded border border-input bg-background px-2 text-xs" />
                            <input
                              name="service_zip_codes"
                              defaultValue={contractor.serviceZipCodes.join(", ")}
                              className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                            />
                            <label className="flex items-center gap-2 text-xs">
                              <input type="checkbox" name="active" value="1" defaultChecked={contractor.active} className="size-3.5 rounded border-input" />
                              Active
                            </label>
                            <button type="submit" className="h-8 rounded border border-border px-2 text-xs hover:bg-muted/40">
                              Save
                            </button>
                          </form>
                        </details>
                        {contractor.active ? (
                          <form action={deactivateContractorAction}>
                            <input type="hidden" name="contractor_id" value={contractor.id} />
                            <button type="submit" className="text-left text-xs text-destructive underline-offset-4 hover:underline">
                              Deactivate
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
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
