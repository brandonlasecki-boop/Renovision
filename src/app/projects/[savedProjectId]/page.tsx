import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { loadViewerSavedProject } from "@/lib/data/renovision-saved-projects";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function SavedProjectDetailPage({
  params,
}: {
  params: Promise<{ savedProjectId: string }>;
}) {
  const { savedProjectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/projects/${encodeURIComponent(savedProjectId)}`);

  const project = await loadViewerSavedProject(savedProjectId);
  if (!project) notFound();

  const tryHref =
    project.generationId && project.projectId
      ? `/try?restore_generation_id=${encodeURIComponent(project.generationId)}&restore_project_id=${encodeURIComponent(project.projectId)}`
      : "/try?new=1";
  redirect(tryHref);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/projects" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            ← My Projects
          </Link>
          <Link href="/" className="text-sm font-semibold tracking-tight text-renovision-navy">
            Renovision
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{project.selectedStyle || "Saved remodel"}</h1>
        {project.estimateMin != null && project.estimateMax != null ? (
          <p className="text-sm text-muted-foreground">
            Estimate: {usd.format(project.estimateMin)}–{usd.format(project.estimateMax)}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original</p>
            {project.originalUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={project.originalUrl} alt="Original uploaded bathroom" className="w-full rounded-xl object-cover" />
            ) : (
              <div className="aspect-[4/3] rounded-xl bg-muted" />
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mockup</p>
            {project.mockupUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={project.mockupUrl} alt="Generated remodel mockup" className="w-full rounded-xl object-cover" />
            ) : (
              <div className="aspect-[4/3] rounded-xl bg-muted" />
            )}
          </div>
        </div>

        <div id="connect" className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/try?restore_generation_id=${encodeURIComponent(project.generationId ?? "")}&restore_project_id=${encodeURIComponent(project.projectId)}`}
            className={buttonVariants()}
          >
            Connect Me With a Remodeler
          </Link>
          <Link
            href={`/try?restore_generation_id=${encodeURIComponent(project.generationId ?? "")}&restore_project_id=${encodeURIComponent(project.projectId)}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Try Another Style
          </Link>
        </div>
      </main>
    </div>
  );
}
