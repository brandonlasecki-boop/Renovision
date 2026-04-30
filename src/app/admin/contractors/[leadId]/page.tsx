import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAdminContractorLeadDetail } from "@/lib/data/admin-contractors";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function EstimateChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

export default async function AdminContractorLeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const detail = await fetchAdminContractorLeadDetail(leadId);
  if (!detail) notFound();

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-renovision-navy">Lead profile</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{detail.fullName || "Unknown lead"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Submitted {new Date(detail.createdAt).toLocaleString()} · Style: {detail.selectedStyle || "—"}
            </p>
          </div>
          <Link href="/admin/contractors" className="text-sm font-medium text-renovision-navy underline-offset-4 hover:underline">
            Back to lead list
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <EstimateChip label="Email" value={detail.email} />
        <EstimateChip label="Phone" value={detail.phone} />
        <EstimateChip label="Street address" value={detail.streetAddress || "—"} />
        <EstimateChip label="ZIP" value={detail.zipCode} />
        <EstimateChip label="Timeline" value={detail.timeline} />
        <EstimateChip label="Budget range" value={detail.budgetRange} />
        <EstimateChip label="Preferred contact" value={detail.preferredContactMethod} />
        <EstimateChip label="Best contact time" value={detail.bestContactTime || "Anytime"} />
        <EstimateChip
          label="Estimate range"
          value={`${usd.format(detail.estimateMin)}-${usd.format(detail.estimateMax)}`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <div className="border-b border-border/70 px-4 py-3">
            <p className="text-sm font-semibold">Original photo</p>
          </div>
          <div className="p-4">
            {detail.originalImageUrl ? (
              <img
                src={detail.originalImageUrl}
                alt="Original homeowner upload"
                className="w-full rounded-xl border border-border/60 object-cover"
              />
            ) : (
              <p className="text-sm text-muted-foreground">No original image available.</p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <div className="border-b border-border/70 px-4 py-3">
            <p className="text-sm font-semibold">Latest version {detail.latestVersionLabel ? `(${detail.latestVersionLabel})` : ""}</p>
          </div>
          <div className="p-4">
            {detail.latestImageUrl ? (
              <img
                src={detail.latestImageUrl}
                alt="Latest generated version"
                className="w-full rounded-xl border border-border/60 object-cover"
              />
            ) : (
              <p className="text-sm text-muted-foreground">No latest image available.</p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Estimate detail</h2>
          <p className="text-sm text-muted-foreground">
            Confidence: {detail.estimateConfidence || "—"} · Project: {detail.projectId ?? "—"} · Generation:{" "}
            {detail.generationId ?? "—"}
          </p>
        </div>

        {detail.estimateBreakdown ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <EstimateChip
              label="Materials"
              value={`${usd.format(detail.estimateBreakdown.materials.min)}-${usd.format(detail.estimateBreakdown.materials.max)}`}
            />
            <EstimateChip
              label="Labor"
              value={`${usd.format(detail.estimateBreakdown.labor.min)}-${usd.format(detail.estimateBreakdown.labor.max)}`}
            />
            <EstimateChip
              label="Fixtures & finishes"
              value={`${usd.format(detail.estimateBreakdown.fixtures.min)}-${usd.format(detail.estimateBreakdown.fixtures.max)}`}
            />
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Line items</h3>
            {detail.estimateDetailedBreakdown.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No detailed line items stored for this lead.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {detail.estimateDetailedBreakdown.map((line, index) => (
                  <div key={`${line.category}-${index}`} className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-sm font-medium">
                      {line.category}{" "}
                      <span className="tabular-nums text-renovision-navy">
                        {usd.format(line.min)}-{usd.format(line.max)}
                      </span>
                    </p>
                    {line.reason ? <p className="mt-1 text-xs text-muted-foreground">{line.reason}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Why this estimate</h3>
              {detail.estimateReasoning.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No rationale captured.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {detail.estimateReasoning.map((point, index) => (
                    <li key={`${index}-${point}`}>- {point}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Assumptions and risks</h3>
              {detail.estimateAssumptions.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No assumptions captured.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {detail.estimateAssumptions.map((point, index) => (
                    <li key={`${index}-${point}`}>- {point}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {detail.notes ? (
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Project notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{detail.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
