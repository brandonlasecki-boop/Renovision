import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  fetchContractorLeadAssignmentDetail,
  requireContractorContext,
} from "@/lib/data/contractor-portal";
import { createServiceClient } from "@/lib/supabase/service";

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "—";
  }
}

async function markViewedAction(formData: FormData) {
  "use server";
  const ctx = await requireContractorContext();
  const assignmentId = String(formData.get("assignment_id") ?? "").trim();
  if (!assignmentId) return;
  const svc = createServiceClient();
  await svc
    .from("lead_assignments")
    .update({ contractor_viewed_at: new Date().toISOString(), status: "viewed" })
    .eq("id", assignmentId)
    .eq("contractor_id", ctx.contractor.id);
  revalidatePath("/contractor/leads");
  revalidatePath(`/contractor/leads/${assignmentId}`);
}

async function acceptLeadAction(formData: FormData) {
  "use server";
  const ctx = await requireContractorContext();
  const assignmentId = String(formData.get("assignment_id") ?? "").trim();
  if (!assignmentId) return;
  const svc = createServiceClient();
  await svc
    .from("lead_assignments")
    .update({ contractor_viewed_at: new Date().toISOString(), status: "accepted" })
    .eq("id", assignmentId)
    .eq("contractor_id", ctx.contractor.id);
  revalidatePath("/contractor/leads");
  revalidatePath(`/contractor/leads/${assignmentId}`);
}

async function declineLeadAction(formData: FormData) {
  "use server";
  const ctx = await requireContractorContext();
  const assignmentId = String(formData.get("assignment_id") ?? "").trim();
  if (!assignmentId) return;
  const svc = createServiceClient();
  await svc
    .from("lead_assignments")
    .update({ contractor_viewed_at: new Date().toISOString(), status: "declined" })
    .eq("id", assignmentId)
    .eq("contractor_id", ctx.contractor.id);
  revalidatePath("/contractor/leads");
  revalidatePath(`/contractor/leads/${assignmentId}`);
}

async function addResponseNoteAction(formData: FormData) {
  "use server";
  const ctx = await requireContractorContext();
  const assignmentId = String(formData.get("assignment_id") ?? "").trim();
  const response = String(formData.get("contractor_response") ?? "").trim();
  if (!assignmentId) return;
  const svc = createServiceClient();
  await svc
    .from("lead_assignments")
    .update({
      contractor_viewed_at: new Date().toISOString(),
      contractor_response: response ? response.slice(0, 3000) : null,
    })
    .eq("id", assignmentId)
    .eq("contractor_id", ctx.contractor.id);
  revalidatePath("/contractor/leads");
  revalidatePath(`/contractor/leads/${assignmentId}`);
}

export default async function ContractorLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireContractorContext();
  const { id } = await params;
  const detail = await fetchContractorLeadAssignmentDetail(ctx.contractor.id, decodeURIComponent(id));
  if (!detail) notFound();
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/contractor/leads" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to leads
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Lead Assignment</h1>
        <p className="font-mono text-xs text-muted-foreground">{detail.assignmentId}</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Shared at</p><p className="mt-1 text-sm">{new Date(detail.sharedAt).toLocaleString()}</p></div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Assignment status</p><p className="mt-1 text-sm">{detail.assignmentStatus}</p></div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Viewed at</p><p className="mt-1 text-sm">{detail.contractorViewedAt ? new Date(detail.contractorViewedAt).toLocaleString() : "—"}</p></div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">ZIP</p><p className="mt-1 text-sm">{detail.zipCode || "—"}</p></div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Contractor Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={markViewedAction}>
            <input type="hidden" name="assignment_id" value={detail.assignmentId} />
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
              Mark viewed
            </button>
          </form>
          <form action={acceptLeadAction}>
            <input type="hidden" name="assignment_id" value={detail.assignmentId} />
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
              Accept lead
            </button>
          </form>
          <form action={declineLeadAction}>
            <input type="hidden" name="assignment_id" value={detail.assignmentId} />
            <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
              Decline lead
            </button>
          </form>
        </div>
        <form action={addResponseNoteAction} className="mt-4 space-y-2">
          <input type="hidden" name="assignment_id" value={detail.assignmentId} />
          <label className="block text-xs text-muted-foreground">
            Add response note
            <textarea
              name="contractor_response"
              rows={4}
              defaultValue={detail.contractorResponse}
              className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            />
          </label>
          <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40">
            Save response note
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Project Summary</h2>
        <p className="mt-2 text-sm">{detail.projectSummary}</p>
        {detail.homeowner ? (
          <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
            <p className="text-xs text-muted-foreground">Homeowner contact (visible after acceptance or admin setting)</p>
            <p className="mt-1">Name: {detail.homeowner.name || "—"}</p>
            <p>Email: {detail.homeowner.email || "—"}</p>
            <p>Phone: {detail.homeowner.phone || "—"}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Homeowner contact info is hidden until assignment is accepted (or admin setting allows early visibility).
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
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
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium">Uploaded image</p>
          {detail.uploadedImageUrl ? (
            <a href={detail.uploadedImageUrl} target="_blank" rel="noreferrer" className="group relative block h-[320px] overflow-hidden rounded-lg border border-border/60">
              <Image src={detail.uploadedImageUrl} alt="Uploaded image" fill className="object-cover" sizes="(max-width: 1200px) 100vw, 48vw" unoptimized />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">Uploaded image not available for this assignment yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Lead Details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Timeline</p><p className="text-sm">{detail.timeline || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Budget range</p><p className="text-sm">{detail.budgetRange || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Selected style</p><p className="text-sm">{detail.selectedStyle || "—"}</p></div>
          <div>
            <p className="text-xs text-muted-foreground">Estimate (L / E / H)</p>
            <p className="text-sm">
              {detail.estimateLow != null ? usd.format(detail.estimateLow) : "—"} /{" "}
              {detail.estimateExpected != null ? usd.format(detail.estimateExpected) : "—"} /{" "}
              {detail.estimateHigh != null ? usd.format(detail.estimateHigh) : "—"}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Project notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{detail.projectNotes || "—"}</p>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Scope of work</p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-border/70 bg-muted/20 p-3 text-xs">{safeJson(detail.scopeOfWork)}</pre>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Contractor notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{detail.contractorNotes || "—"}</p>
        </div>
      </section>
    </div>
  );
}
