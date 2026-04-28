import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewerSavedProject } from "@/lib/data/renovision-saved-projects";

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
}
