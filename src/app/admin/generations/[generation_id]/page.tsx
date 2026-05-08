import Image from "next/image";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { fetchAdminGenerationDetail } from "@/lib/data/admin-generations";
import { requireAdminUser } from "@/app/admin/require-admin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminSessionTimeline } from "@/components/admin/admin-session-timeline";

export const metadata = {
  title: "Generation detail",
  robots: { index: false, follow: false },
};

async function markGenerationReviewedAction(formData: FormData) {
  "use server";
  const user = await requireAdminUser();
  const generationId = String(formData.get("generation_id") ?? "").trim();
  if (!generationId) return;

  const svc = createServiceClient();
  const { data: row } = await svc.from("bathroom_generations").select("metadata").eq("id", generationId).maybeSingle();
  const current = row?.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const next = {
    ...current,
    admin_reviewed_at: new Date().toISOString(),
    admin_reviewed_by: user.email ?? user.id,
  };
  await svc.from("bathroom_generations").update({ metadata: next }).eq("id", generationId);

  revalidatePath("/admin/generations");
  revalidatePath(`/admin/generations/${generationId}`);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "—";
  }
}

export default async function AdminGenerationDetailPage({
  params,
}: {
  params: Promise<{ generation_id: string }>;
}) {
  const { generation_id } = await params;
  const id = decodeURIComponent(generation_id);
  const detail = await fetchAdminGenerationDetail(id);

  if (!detail) {
    return (
      <div className="space-y-4">
        <Link href="/admin/generations" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to generations
        </Link>
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">Generation not found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/admin/generations" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to generations
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Generation detail</h1>
        <p className="font-mono text-xs text-muted-foreground">{detail.id}</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium">Uploaded image</p>
          {detail.uploadedImageUrl ? (
            <a href={detail.uploadedImageUrl} target="_blank" rel="noreferrer" className="group relative block h-[340px] overflow-hidden rounded-lg border border-border/60">
              <Image src={detail.uploadedImageUrl} alt="Uploaded image" fill className="object-cover" sizes="(max-width: 1200px) 100vw, 48vw" unoptimized />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No uploaded image found.</p>
          )}
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium">Generated image</p>
          {detail.generatedImageUrl ? (
            <a href={detail.generatedImageUrl} target="_blank" rel="noreferrer" className="group relative block h-[340px] overflow-hidden rounded-lg border border-border/60">
              <Image src={detail.generatedImageUrl} alt="Generated image" fill className="object-cover" sizes="(max-width: 1200px) 100vw, 48vw" unoptimized />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No generated image found.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Generation metadata</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Created at</p><p className="text-sm">{new Date(detail.createdAt).toLocaleString()}</p></div>
          <div><p className="text-xs text-muted-foreground">Selected style</p><p className="text-sm">{detail.selectedStyle}</p></div>
          <div><p className="text-xs text-muted-foreground">Lead submitted</p><p className="text-sm">{detail.leadSubmitted ? "Yes" : "No"}</p></div>
          <div><p className="text-xs text-muted-foreground">Status</p><p className="text-sm">{detail.status}</p></div>
          <div><p className="text-xs text-muted-foreground">Session ID</p><p className="text-xs font-mono">{detail.sessionId}</p></div>
          <div><p className="text-xs text-muted-foreground">Estimate low</p><p className="text-sm">{detail.estimateLow ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Estimate expected</p><p className="text-sm">{detail.estimateExpected ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Estimate high</p><p className="text-sm">{detail.estimateHigh ?? "—"}</p></div>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">User description</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{detail.userDescription || "—"}</p>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Contractor notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{detail.contractorNotes || "—"}</p>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">Scope of work</p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-border/70 bg-muted/20 p-3 text-xs">{safeJson(detail.scopeOfWork)}</pre>
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Tweaks used</h2>
        {detail.tweaksUsed.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Timestamp</th>
                  <th className="px-3 py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {detail.tweaksUsed.map((tweak, idx) => (
                  <tr key={`${idx}-${String(tweak.type ?? "")}`} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{String(tweak.type ?? "—")}</td>
                    <td className="px-3 py-2">{String(tweak.timestamp ?? tweak.created_at ?? "—")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{safeJson(tweak)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No tweaks recorded.</p>
        )}
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Linked lead</h2>
        {detail.linkedLead ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm">
              Lead <span className="font-mono text-xs">{detail.linkedLead.id}</span> (ZIP {detail.linkedLead.zipCode || "—"})
            </p>
            <Link href={`/admin/leads?q=${encodeURIComponent(detail.linkedLead.id)}`} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
              View linked lead
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No linked lead for this generation.</p>
        )}
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Analytics timeline for session</h2>
        <AdminSessionTimeline sessionId={detail.sessionId} maxRows={120} />
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <form action={markGenerationReviewedAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="generation_id" value={detail.id} />
          <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40">
            Mark as reviewed
          </button>
        </form>
      </section>
    </div>
  );
}
