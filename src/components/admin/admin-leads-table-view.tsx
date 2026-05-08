import Link from "next/link";
import {
  fetchAdminContractorLeads,
  fetchLatestLeadSummary,
  fetchLeadsTotalCount,
} from "@/lib/data/admin-contractors";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export async function AdminLeadsTableView({
  searchParams,
  basePath,
}: {
  searchParams: Promise<{ q?: string }>;
  basePath: "/admin/leads" | "/admin/contractors";
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const [leads, totalInDatabase, latestLead] = await Promise.all([
    fetchAdminContractorLeads(query),
    fetchLeadsTotalCount(),
    fetchLatestLeadSummary(),
  ]);

  const searchFiltered = Boolean(query);
  const inconsistentList = totalInDatabase > 0 && leads.length === 0 && !searchFiltered;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-renovision-navy">Lead pipeline</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight">Homeowner lead queue</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Table-first lead management view. Open a lead to review contact details, estimates, and project context.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Leads in database</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{totalInDatabase}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{searchFiltered ? "Matching search" : "Rows listed below"}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{leads.length}</p>
          {searchFiltered ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Filtered by search.{" "}
              <Link href={basePath} className="font-medium text-renovision-navy underline-offset-2 hover:underline">
                Clear search
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      {latestLead && totalInDatabase > 0 ? (
        <div className="rounded-xl border border-border/80 bg-card p-4 text-sm shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Newest lead in Supabase (UTC)</p>
          <p className="mt-2 break-all font-mono text-xs text-foreground">{latestLead.createdAt}</p>
          <p className="mt-1 text-muted-foreground">
            Email on file: <span className="text-foreground">{latestLead.email || "—"}</span>
          </p>
        </div>
      ) : null}

      {inconsistentList ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
          <p className="font-medium">Data mismatch</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            The database reports {totalInDatabase} lead(s) but this list is empty. Hard refresh and check server logs.
          </p>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <form action={basePath} method="get" className="flex flex-col gap-2 sm:max-w-xl sm:flex-row">
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
                    {searchFiltered && totalInDatabase > 0
                      ? "No leads match this search. Clear the search or try another term."
                      : "No leads found."}
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.leadId} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs text-muted-foreground" title={`UTC stored: ${lead.createdAt}`}>
                      {new Date(lead.createdAt).toLocaleString()}
                    </td>
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
