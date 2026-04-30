import Link from "next/link";
import { fetchAdminContractorLeads } from "@/lib/data/admin-contractors";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const metadata = {
  title: "Admin contractors",
  robots: { index: false, follow: false },
};

export default async function AdminContractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const leads = await fetchAdminContractorLeads(query);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-renovision-navy">Contractor pipeline</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Homeowner lead list</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Every homeowner who submitted the Renovision connect form. Open a lead to view the original photo, latest
          rendered version, and full estimate details.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Total leads</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{leads.length}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <form action="/admin/contractors" method="get" className="flex flex-col gap-2 sm:max-w-xl sm:flex-row">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name, email, phone, ZIP, address, project id, or lead id"
            className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
          >
            Search
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1380px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Address</th>
                <th className="px-4 py-3 font-semibold">ZIP</th>
                <th className="px-4 py-3 font-semibold">Timeline</th>
                <th className="px-4 py-3 font-semibold">Budget</th>
                <th className="px-4 py-3 font-semibold">Preferred contact</th>
                <th className="px-4 py-3 font-semibold">Style</th>
                <th className="px-4 py-3 font-semibold">Estimate</th>
                <th className="px-4 py-3 font-semibold">Lead detail</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                    No leads found.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.leadId} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium">{lead.fullName}</td>
                    <td className="px-4 py-3">{lead.email || "—"}</td>
                    <td className="px-4 py-3">{lead.phone || "—"}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground" title={lead.streetAddress || undefined}>
                      {lead.streetAddress || "—"}
                    </td>
                    <td className="px-4 py-3">{lead.zipCode || "—"}</td>
                    <td className="px-4 py-3">{lead.timeline || "—"}</td>
                    <td className="px-4 py-3">{lead.budgetRange || "—"}</td>
                    <td className="px-4 py-3">
                      {lead.preferredContactMethod || "—"}
                      {lead.bestContactTime ? ` (${lead.bestContactTime})` : ""}
                    </td>
                    <td className="px-4 py-3">{lead.selectedStyle || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {usd.format(lead.estimateMin)}-{usd.format(lead.estimateMax)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/contractors/${lead.leadId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-lg bg-renovision-navy/10 px-3 py-1.5 text-xs font-semibold text-renovision-navy hover:bg-renovision-navy/15"
                      >
                        Open in new tab
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
