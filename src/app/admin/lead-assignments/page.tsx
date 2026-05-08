import Link from "next/link";
import { fetchAdminContractorLeads } from "@/lib/data/admin-contractors";

export const metadata = {
  title: "Admin lead assignments",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLeadAssignmentsPage() {
  // Assignment model does not exist yet; use lead queue as dispatch source.
  const leads = await fetchAdminContractorLeads("");

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-renovision-navy">Dispatch queue</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight">Lead assignments</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This page is dedicated to assignment workflows. Today it surfaces unassigned leads; next step is explicit
          assignee state and routing actions.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Open leads</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{leads.length}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Assigned</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">0</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Unassigned</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{leads.length}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Lead</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">ZIP</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No leads available for assignment.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.leadId} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium">{lead.fullName}</td>
                    <td className="px-4 py-3">{lead.email || "—"}</td>
                    <td className="px-4 py-3">{lead.zipCode || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-200">
                        Unassigned
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/leads/${lead.leadId}`}
                        className="inline-flex rounded-lg bg-renovision-navy/10 px-3 py-1.5 text-xs font-semibold text-renovision-navy hover:bg-renovision-navy/15"
                      >
                        Open lead
                      </Link>
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
