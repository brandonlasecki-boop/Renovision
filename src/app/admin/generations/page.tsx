import Image from "next/image";
import Link from "next/link";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import {
  fetchAdminGenerations,
  fetchAdminGenerationStylesAndStatuses,
  type AdminGenerationListFilters,
} from "@/lib/data/admin-generations";

export const metadata = {
  title: "Admin - Generations Review Board",
  robots: { index: false, follow: false },
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function estimateLabel(low: number | null, expected: number | null, high: number | null): string {
  if (low == null && expected == null && high == null) return "—";
  const left = low != null ? usd.format(low) : "—";
  const mid = expected != null ? usd.format(expected) : "—";
  const right = high != null ? usd.format(high) : "—";
  return `${left} / ${mid} / ${right}`;
}

export default async function AdminGenerationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    style?: string;
    lead_submitted?: string;
    status?: string;
    session_id?: string;
    zip?: string;
  }>;
}) {
  const sp = await searchParams;
  const filters: AdminGenerationListFilters = {
    start: sp.start,
    end: sp.end,
    style: sp.style,
    leadSubmitted:
      sp.lead_submitted === "yes" || sp.lead_submitted === "no" || sp.lead_submitted === "all"
        ? sp.lead_submitted
        : "all",
    status: sp.status,
    sessionId: sp.session_id,
    zipCode: sp.zip,
  };
  const [rows, options] = await Promise.all([
    fetchAdminGenerations(filters),
    fetchAdminGenerationStylesAndStatuses(),
  ]);
  const completedCount = rows.filter((row) => row.status === "completed").length;
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const withLeadCount = rows.filter((row) => row.leadSubmitted).length;

  const statusTone = (status: string) => {
    if (status === "completed") return "success" as const;
    if (status === "failed") return "danger" as const;
    if (status === "reviewed") return "info" as const;
    return "warn" as const;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-renovision-navy">Generations review board</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Upload and generation visual review board</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review every uploaded photo and generated result in one table. Thumbnail images use signed URLs for private
          bucket access.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <AdminStatusBadge label={`Completed: ${completedCount}`} tone="success" />
          <AdminStatusBadge label={`Failed: ${failedCount}`} tone={failedCount > 0 ? "danger" : "neutral"} />
          <AdminStatusBadge label={`Lead submitted: ${withLeadCount}`} tone="info" />
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <form action="/admin/generations" method="get" className="grid gap-3 lg:grid-cols-7">
          <label className="text-xs text-muted-foreground">
            Start date
            <input
              type="date"
              name="start"
              defaultValue={filters.start ?? ""}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            End date
            <input
              type="date"
              name="end"
              defaultValue={filters.end ?? ""}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Selected style
            <select
              name="style"
              defaultValue={filters.style || "all"}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All styles</option>
              {options.styles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Lead submitted
            <select
              name="lead_submitted"
              defaultValue={filters.leadSubmitted || "all"}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Generation status
            <select
              name="status"
              defaultValue={filters.status || "all"}
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All statuses</option>
              {options.statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Session ID search
            <input
              type="text"
              name="session_id"
              defaultValue={filters.sessionId ?? ""}
              placeholder="contains..."
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            ZIP (linked lead)
            <input
              type="text"
              name="zip"
              defaultValue={filters.zipCode ?? ""}
              placeholder="e.g. 10001"
              className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <div className="flex items-end gap-2 lg:col-span-7">
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Apply filters
            </button>
            <Link href="/admin/generations" className="h-9 rounded-md border border-border px-3 pt-2 text-sm hover:bg-muted/40">
              Clear
            </Link>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Generation ID</th>
              <th className="px-4 py-2 font-medium">Style</th>
              <th className="px-4 py-2 font-medium">Uploaded</th>
              <th className="px-4 py-2 font-medium">Generated</th>
              <th className="px-4 py-2 font-medium">Estimate (L / E / H)</th>
              <th className="px-4 py-2 font-medium">Tweaks</th>
              <th className="px-4 py-2 font-medium">Lead submitted</th>
              <th className="px-4 py-2 font-medium">Session ID</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Linked ZIP</th>
              <th className="px-4 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 align-top last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs">{row.id}</td>
                <td className="px-4 py-3">{row.selectedStyle}</td>
                <td className="px-4 py-3">
                  {row.uploadedThumbUrl ? (
                    <a href={row.uploadedThumbUrl} target="_blank" rel="noopener noreferrer" className="group relative block h-16 w-24 overflow-hidden rounded-md border border-border/60">
                      <Image
                        src={row.uploadedThumbUrl}
                        alt="Uploaded image thumbnail"
                        fill
                        className="object-cover"
                        sizes="96px"
                        loading="lazy"
                        unoptimized
                      />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.generatedThumbUrl ? (
                    <a href={row.generatedThumbUrl} target="_blank" rel="noopener noreferrer" className="group relative block h-16 w-24 overflow-hidden rounded-md border border-border/60">
                      <Image
                        src={row.generatedThumbUrl}
                        alt="Generated image thumbnail"
                        fill
                        className="object-cover"
                        sizes="96px"
                        loading="lazy"
                        unoptimized
                      />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{estimateLabel(row.estimateLow, row.estimateExpected, row.estimateHigh)}</td>
                <td className="max-w-[220px] truncate px-4 py-3" title={row.tweaksSummary}>
                  {row.tweaksSummary}
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge label={row.leadSubmitted ? "Yes" : "No"} tone={row.leadSubmitted ? "info" : "neutral"} />
                </td>
                <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs">{row.sessionId}</td>
                <td className="px-4 py-3">
                  <AdminStatusBadge label={row.status} tone={statusTone(row.status)} />
                </td>
                <td className="px-4 py-3">{row.linkedLeadZipCode ?? "—"}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/generations/${row.id}`}
                    className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-muted/40"
                  >
                    Review
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                  No generations found for this range/filter. Try widening dates or clearing style/session filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
