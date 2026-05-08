import Image from "next/image";
import Link from "next/link";
import { fetchContractorLeadAssignments, requireContractorContext } from "@/lib/data/contractor-portal";

export default async function ContractorLeadsPage() {
  const ctx = await requireContractorContext();
  const rows = await fetchContractorLeadAssignments(ctx.contractor.id);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Shared Leads</h1>
        <p className="mt-2 text-sm text-muted-foreground">Only leads assigned to your contractor account are shown.</p>
      </section>
      <section className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
        <table className="w-full min-w-[1060px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-4 py-2 font-medium">Shared at</th>
              <th className="px-4 py-2 font-medium">Lead ZIP</th>
              <th className="px-4 py-2 font-medium">Timeline</th>
              <th className="px-4 py-2 font-medium">Budget range</th>
              <th className="px-4 py-2 font-medium">Selected style</th>
              <th className="px-4 py-2 font-medium">Generated image</th>
              <th className="px-4 py-2 font-medium">Assignment status</th>
              <th className="px-4 py-2 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.assignmentId} className="border-b border-border/40 align-top last:border-0">
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(row.sharedAt).toLocaleString()}</td>
                <td className="px-4 py-3">{row.zipCode || "—"}</td>
                <td className="px-4 py-3">{row.timeline || "—"}</td>
                <td className="px-4 py-3">{row.budgetRange || "—"}</td>
                <td className="px-4 py-3">{row.selectedStyle || "—"}</td>
                <td className="px-4 py-3">
                  {row.generatedImageUrl ? (
                    <a href={row.generatedImageUrl} target="_blank" rel="noreferrer" className="group relative block h-16 w-24 overflow-hidden rounded-md border border-border/60">
                      <Image src={row.generatedImageUrl} alt="Generated lead image" fill className="object-cover" sizes="96px" unoptimized />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">{row.assignmentStatus}</td>
                <td className="px-4 py-3">
                  <Link href={`/contractor/leads/${row.assignmentId}`} className="underline-offset-4 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No leads shared with your account yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
