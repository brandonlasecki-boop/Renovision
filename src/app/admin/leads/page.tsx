import Image from "next/image";
import Link from "next/link";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { fetchAdminLeadFilterOptions, fetchAdminLeads, type LeadFilterParams } from "@/lib/data/admin-leads";

export const metadata = {
  title: "Admin - Leads Pipeline",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    start?: string;
    end?: string;
    zip?: string;
    budget?: string;
    timeline?: string;
    style?: string;
    assigned?: "all" | "assigned" | "unassigned";
    contractor_id?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const filters: LeadFilterParams = {
    status: sp.status,
    start: sp.start,
    end: sp.end,
    zip: sp.zip,
    budget: sp.budget,
    timeline: sp.timeline,
    style: sp.style,
    assigned: sp.assigned,
    contractorId: sp.contractor_id,
    q: sp.q,
  };
  const [rows, options] = await Promise.all([fetchAdminLeads(filters), fetchAdminLeadFilterOptions()]);
  const newCount = rows.filter((row) => row.status === "new").length;
  const sharedCount = rows.filter((row) => row.status === "shared" || row.status === "assigned").length;
  const closedCount = rows.filter((row) => row.status === "closed").length;

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const estimateLabel = (low: number | null, expected: number | null, high: number | null) => {
    if (low == null && expected == null && high == null) return "—";
    return `${low != null ? usd.format(low) : "—"} / ${expected != null ? usd.format(expected) : "—"} / ${
      high != null ? usd.format(high) : "—"
    }`;
  };

  const statusTone = (status: string) => {
    if (status === "new") return "info" as const;
    if (status === "shared" || status === "assigned" || status === "reviewed") return "warn" as const;
    if (status === "closed") return "success" as const;
    if (status === "bad_fit") return "danger" as const;
    return "neutral" as const;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-renovision-navy">Leads pipeline</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Admin leads CRM pipeline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Submitted leads only, sorted with new leads first. Review and route homeowner requests quickly.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <AdminStatusBadge label={`New: ${newCount}`} tone="info" />
          <AdminStatusBadge label={`Shared/Assigned: ${sharedCount}`} tone="warn" />
          <AdminStatusBadge label={`Closed: ${closedCount}`} tone="success" />
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <form action="/admin/leads" method="get" className="grid gap-3 lg:grid-cols-5">
          <label className="text-xs text-muted-foreground">
            Status
            <select name="status" defaultValue={filters.status || "all"} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">All</option>
              {options.statuses.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Date start
            <input name="start" type="date" defaultValue={filters.start ?? ""} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Date end
            <input name="end" type="date" defaultValue={filters.end ?? ""} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            ZIP
            <input name="zip" type="text" defaultValue={filters.zip ?? ""} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Budget range
            <select name="budget" defaultValue={filters.budget || "all"} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">All</option>
              {options.budgets.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Timeline
            <select name="timeline" defaultValue={filters.timeline || "all"} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">All</option>
              {options.timelines.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Selected style
            <select name="style" defaultValue={filters.style || "all"} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">All</option>
              {options.styles.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Assigned
            <select name="assigned" defaultValue={filters.assigned || "all"} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">All</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Contractor assigned
            <select name="contractor_id" defaultValue={filters.contractorId || "all"} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">All</option>
              {options.contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Search name/email/phone
            <input name="q" type="text" defaultValue={filters.q ?? ""} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <div className="flex items-end gap-2 lg:col-span-5">
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Apply filters
            </button>
            <Link href="/admin/leads" className="h-9 rounded-md border border-border px-3 pt-2 text-sm hover:bg-muted/40">
              Clear
            </Link>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
        <table className="w-full min-w-[1480px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">ZIP</th>
              <th className="px-4 py-2 font-medium">Timeline</th>
              <th className="px-4 py-2 font-medium">Budget</th>
              <th className="px-4 py-2 font-medium">Style</th>
              <th className="px-4 py-2 font-medium">Estimate (L / E / H)</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Assigned contractor</th>
              <th className="px-4 py-2 font-medium">Generated image</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 align-top last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{row.zipCode || "—"}</td>
                <td className="px-4 py-3">{row.timeline || "—"}</td>
                <td className="px-4 py-3">{row.budgetRange || "—"}</td>
                <td className="px-4 py-3">{row.selectedStyle || "—"}</td>
                <td className="px-4 py-3 tabular-nums">{estimateLabel(row.estimateLow, row.estimateExpected, row.estimateHigh)}</td>
                <td className="px-4 py-3">
                  <AdminStatusBadge label={row.status} tone={statusTone(row.status)} />
                </td>
                <td className="px-4 py-3">{row.assignedContractorName}</td>
                <td className="px-4 py-3">
                  {row.generatedThumbUrl ? (
                    <a href={row.generatedThumbUrl} target="_blank" rel="noreferrer" className="group relative block h-16 w-24 overflow-hidden rounded-md border border-border/60">
                      <Image src={row.generatedThumbUrl} alt="Generated lead image thumbnail" fill className="object-cover" sizes="96px" loading="lazy" unoptimized />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/leads/${row.id}`}
                    className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted/40"
                  >
                    Open lead
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  No submitted leads match this filter. Try widening date range or clearing status/search filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
