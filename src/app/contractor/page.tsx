import Link from "next/link";
import { fetchContractorLeadAssignments, requireContractorContext } from "@/lib/data/contractor-portal";

export default async function ContractorHomePage() {
  const ctx = await requireContractorContext();
  const assignments = await fetchContractorLeadAssignments(ctx.contractor.id);
  const openCount = assignments.filter((a) => a.assignmentStatus !== "declined" && a.assignmentStatus !== "accepted").length;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Welcome</h1>
        <p className="mt-2 text-sm text-muted-foreground">Review and respond to leads shared with your contractor account.</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Total assignments</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{assignments.length}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Needs response</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{openCount}</p>
        </div>
      </section>
      <section>
        <Link href="/contractor/leads" className="inline-flex rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40">
          Go to shared leads
        </Link>
      </section>
    </div>
  );
}
