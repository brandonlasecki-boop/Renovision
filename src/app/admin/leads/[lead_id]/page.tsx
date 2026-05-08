import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/app/admin/require-admin";
import {
  buildLeadShareSummary,
  fetchAdminLeadDetail,
  fetchAdminLeadFilterOptions,
  getEligibleContractorsForLead,
} from "@/lib/data/admin-leads";
import { createServiceClient } from "@/lib/supabase/service";
import { ShareWithContractorModal } from "@/app/admin/leads/[lead_id]/share-with-contractor-modal";
import { AdminSessionTimeline } from "@/components/admin/admin-session-timeline";

export const metadata = {
  title: "Lead detail",
  robots: { index: false, follow: false },
};

type LeadStatus = "new" | "reviewed" | "contacted" | "assigned" | "shared" | "closed" | "bad_fit";

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "—";
  }
}

async function updateLeadStatusAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as LeadStatus;
  if (!leadId || !status) return;
  const allowed: LeadStatus[] = ["new", "reviewed", "contacted", "assigned", "shared", "closed", "bad_fit"];
  if (!allowed.includes(status)) return;
  const svc = createServiceClient();
  await svc.from("leads").update({ status }).eq("id", leadId);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
}

async function addInternalNoteAction(formData: FormData) {
  "use server";
  const user = await requireAdminUser();
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const note = String(formData.get("internal_note") ?? "").trim();
  if (!leadId || !note) return;
  const svc = createServiceClient();
  const { data } = await svc.from("leads").select("metadata").eq("id", leadId).maybeSingle();
  const current = data?.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {};
  const existingNotes = Array.isArray(current.internal_notes) ? (current.internal_notes as unknown[]) : [];
  const nextNotes = [
    {
      note: note.slice(0, 2000),
      at: new Date().toISOString(),
      by: user.email ?? user.id,
    },
    ...existingNotes,
  ].slice(0, 50);
  await svc
    .from("leads")
    .update({
      metadata: {
        ...current,
        internal_notes: nextNotes,
      },
    })
    .eq("id", leadId);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
}

async function assignShareLeadAction(
  _prev: { ok: false; message: string } | { ok: true; message: string; summary: string; contractorName: string; sharedAtIso: string } | null,
  formData: FormData,
) {
  "use server";
  const user = await requireAdminUser();
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const contractorId = String(formData.get("contractor_id") ?? "").trim();
  const assignmentNote = String(formData.get("assignment_note") ?? "").trim();
  const summaryText = String(formData.get("summary_text") ?? "").trim();
  if (!leadId || !contractorId) return { ok: false, message: "Missing lead or contractor." };
  const svc = createServiceClient();
  const sharedAt = new Date().toISOString();
  const { data: contractor } = await svc
    .from("contractors")
    .select("company_name, contact_name")
    .eq("id", contractorId)
    .maybeSingle();
  const contractorName = String(contractor?.company_name ?? contractor?.contact_name ?? contractorId).trim();

  const { data: leadRow } = await svc.from("leads").select("session_id").eq("id", leadId).maybeSingle();

  await svc.from("leads").update({ assigned_contractor_id: contractorId, status: "shared" }).eq("id", leadId);
  await svc.from("lead_assignments").insert({
    lead_id: leadId,
    contractor_id: contractorId,
    shared_by: user.id,
    shared_at: sharedAt,
    status: "shared",
    notes: assignmentNote || "Shared from admin lead detail page",
  });
  await svc.from("analytics_events").insert({
    session_id: String(leadRow?.session_id ?? `admin-lead-${leadId}`),
    user_id: user.id,
    event_name: "lead_shared_with_contractor",
    page_path: `/admin/leads/${leadId}`,
    page_title: "Admin Lead Detail",
    metadata: {
      lead_id: leadId,
      contractor_id: contractorId,
      contractor_name: contractorName,
      has_note: Boolean(assignmentNote),
      session_type: "admin",
    },
  });
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  return {
    ok: true,
    message: `Lead shared with ${contractorName}.`,
    summary: summaryText,
    contractorName,
    sharedAtIso: sharedAt,
  };
}

export default async function AdminLeadDetailPage({
  params,
}: {
  params: Promise<{ lead_id: string }>;
}) {
  const { lead_id } = await params;
  const id = decodeURIComponent(lead_id);
  const [detail, options] = await Promise.all([fetchAdminLeadDetail(id), fetchAdminLeadFilterOptions()]);
  if (!detail) notFound();
  const { eligibleContractors, nonMatchingContractors } = getEligibleContractorsForLead(
    { zipCode: detail.zipCode },
    options.contractors,
  );
  const shareSummary = buildLeadShareSummary({
    homeownerName: detail.name,
    zipCode: detail.zipCode,
    timeline: detail.timeline,
    budgetRange: detail.budgetRange,
    projectNotes: detail.notes,
    selectedStyle: detail.selectedStyle,
    estimateLow: detail.estimateLow,
    estimateExpected: detail.estimateExpected,
    estimateHigh: detail.estimateHigh,
    uploadedImageUrl: detail.uploadedImageUrl,
    generatedImageUrl: detail.generatedImageUrl,
    scopeOfWork: detail.scopeOfWork,
  });

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/admin/leads" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to leads
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Lead detail</h1>
        <p className="font-mono text-xs text-muted-foreground">{detail.id}</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 text-sm">{detail.status}</p></div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Assigned contractor</p><p className="mt-1 text-sm">{detail.assignedContractorName}</p></div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Timeline</p><p className="mt-1 text-sm">{detail.timeline || "—"}</p></div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Budget</p><p className="mt-1 text-sm">{detail.budgetRange || "—"}</p></div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Actions</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <form action={updateLeadStatusAction} className="space-y-2 rounded-lg border border-border/70 p-3">
            <input type="hidden" name="lead_id" value={detail.id} />
            <p className="text-sm font-medium">Update status</p>
            <select name="status" defaultValue={detail.status} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              {(["new", "reviewed", "contacted", "assigned", "shared", "closed", "bad_fit"] as const).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Save status
            </button>
          </form>

          <form action={addInternalNoteAction} className="space-y-2 rounded-lg border border-border/70 p-3">
            <input type="hidden" name="lead_id" value={detail.id} />
            <p className="text-sm font-medium">Add internal note</p>
            <textarea
              name="internal_note"
              rows={4}
              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              placeholder="Operator note..."
            />
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
              Add note
            </button>
          </form>

          <div className="space-y-2 rounded-lg border border-border/70 p-3">
            <p className="text-sm font-medium">Share with contractor</p>
            <p className="text-xs text-muted-foreground">
              Manual share flow with service-area warning, assignment history, and reusable share summary.
            </p>
            <ShareWithContractorModal
              leadId={detail.id}
              leadZip={detail.zipCode}
              summaryText={shareSummary}
              contractors={options.contractors}
              action={assignShareLeadAction}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <form action={updateLeadStatusAction}>
            <input type="hidden" name="lead_id" value={detail.id} />
            <input type="hidden" name="status" value="bad_fit" />
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
              Mark bad fit
            </button>
          </form>
          <form action={updateLeadStatusAction}>
            <input type="hidden" name="lead_id" value={detail.id} />
            <input type="hidden" name="status" value="contacted" />
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
              Mark contacted
            </button>
          </form>
          <form action={updateLeadStatusAction}>
            <input type="hidden" name="lead_id" value={detail.id} />
            <input type="hidden" name="status" value="closed" />
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
              Mark closed
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Homeowner contact + project details</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Name</p><p className="text-sm">{detail.name}</p></div>
          <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{detail.email || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm">{detail.phone || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">ZIP</p><p className="text-sm">{detail.zipCode || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Timeline</p><p className="text-sm">{detail.timeline || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Budget range</p><p className="text-sm">{detail.budgetRange || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Selected style</p><p className="text-sm">{detail.selectedStyle || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Created</p><p className="text-sm">{new Date(detail.createdAt).toLocaleString()}</p></div>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{detail.notes || "—"}</p>
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Eligible Contractors</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ZIP-based eligibility helper for manual routing preparation (no auto-routing applied).
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Matching ZIP ({eligibleContractors.length})</p>
            {eligibleContractors.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {eligibleContractors.map((c) => (
                  <li key={c.id}>
                    {c.name}
                    <span className="text-muted-foreground"> — {c.serviceZipCodes.join(", ") || "No ZIPs"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No active contractors match this ZIP.</p>
            )}
          </div>
          <div>
            <p className="text-sm font-medium">Non-matching ZIP ({nonMatchingContractors.length})</p>
            {nonMatchingContractors.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {nonMatchingContractors.map((c) => (
                  <li key={c.id}>
                    {c.name}
                    <span className="text-muted-foreground"> — {c.serviceZipCodes.join(", ") || "No ZIPs"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">None.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium">Uploaded image</p>
          {detail.uploadedImageUrl ? (
            <a href={detail.uploadedImageUrl} target="_blank" rel="noreferrer" className="group relative block h-[320px] overflow-hidden rounded-lg border border-border/60">
              <Image src={detail.uploadedImageUrl} alt="Uploaded image" fill className="object-cover" sizes="(max-width: 1200px) 100vw, 48vw" unoptimized />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No uploaded image.</p>
          )}
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium">Generated image</p>
          {detail.generatedImageUrl ? (
            <a href={detail.generatedImageUrl} target="_blank" rel="noreferrer" className="group relative block h-[320px] overflow-hidden rounded-lg border border-border/60">
              <Image src={detail.generatedImageUrl} alt="Generated image" fill className="object-cover" sizes="(max-width: 1200px) 100vw, 48vw" unoptimized />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No generated image.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Estimate + scope</h2>
        <p className="mt-2 text-sm">
          {detail.estimateLow != null ? usd.format(detail.estimateLow) : "—"} /{" "}
          {detail.estimateExpected != null ? usd.format(detail.estimateExpected) : "—"} /{" "}
          {detail.estimateHigh != null ? usd.format(detail.estimateHigh) : "—"}
        </p>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Full scope of work</p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-border/70 bg-muted/20 p-3 text-xs">{safeJson(detail.scopeOfWork)}</pre>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Contractor notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{detail.contractorNotes || "—"}</p>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Linked generation</p>
          <p className="mt-1 text-sm">{detail.generationId ? <Link className="underline-offset-4 hover:underline" href={`/admin/generations/${detail.generationId}`}>{detail.generationId}</Link> : "—"}</p>
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Assignment history</h2>
        {detail.assignmentHistory.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Contractor</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Shared</th>
                  <th className="px-3 py-2 font-medium">Viewed</th>
                  <th className="px-3 py-2 font-medium">Response</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {detail.assignmentHistory.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{row.contractorName}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.sharedAt ? new Date(row.sharedAt).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">{row.viewedAt ? new Date(row.viewedAt).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">{row.contractorResponse || "—"}</td>
                    <td className="px-3 py-2">{row.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No assignment history yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Analytics session timeline</h2>
        <AdminSessionTimeline sessionId={detail.sessionId} maxRows={120} />
      </section>
    </div>
  );
}
