import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProjectDetail } from "@/lib/data/dashboard";
import { CopyShareLink } from "@/components/dashboard/copy-share-link";
import { ProjectPhotoUpload } from "@/components/dashboard/project-photo-upload";
import { ProjectPhotoGrid } from "@/components/dashboard/project-photo-grid";
import { ProjectUpdateForm } from "@/components/dashboard/project-update-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

const BUCKET = "project-photos";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const detail = await getProjectDetail(projectId);
  if (!detail) {
    notFound();
  }

  const supabase = await createClient();
  const photosWithUrls = await Promise.all(
    detail.photos.map(async (p) => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(p.storage_path, 60 * 60 * 4);
      return { ...p, signedUrl: data?.signedUrl ?? "" };
    }),
  );

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const shareUrl = `${baseUrl}/p/${detail.project.share_token}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/projects"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-2 inline-flex")}
          >
            <ArrowLeft className="mr-1 size-4" />
            Projects
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.project.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{detail.company.name}</p>
        </div>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-lg">Client share link</CardTitle>
          <CardDescription>
            Send this link instead of texting photos—clients always see the latest work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyShareLink url={shareUrl} />
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">Photos</h2>
          <ProjectPhotoGrid
            projectId={detail.project.id}
            photos={photosWithUrls.filter((p) => p.signedUrl)}
          />
          <ProjectPhotoUpload projectId={detail.project.id} />
        </div>
        <div>
          <ProjectUpdateForm projectId={detail.project.id} />
        </div>
      </div>

      {detail.updates.length > 0 ? (
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-lg">Recent updates</CardTitle>
            <CardDescription>Newest first—same order as the client page.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {detail.updates.slice(0, 5).map((u) => (
                <li key={u.id} className="text-sm">
                  <p className="font-medium">{u.title}</p>
                  <p className="text-muted-foreground">
                    {u.progress_percent}% · {new Date(u.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
