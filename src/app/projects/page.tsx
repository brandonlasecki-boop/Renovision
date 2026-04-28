import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listViewerSavedProjects } from "@/lib/data/renovision-saved-projects";
import { Button } from "@/components/ui/button";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function MyProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/projects");

  const projects = await listViewerSavedProjects();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-renovision-navy">
            Renovision
          </Link>
          <Link href="/try" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Start new design
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Projects</h1>
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No saved projects yet. Generate a bathroom mockup, then tap Save My Project.
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => (
              <article key={p.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {p.mockupUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.mockupUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-muted" />
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{p.selectedStyle || "Saved remodel"}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.estimateMin != null && p.estimateMax != null
                          ? `${usd.format(p.estimateMin)}–${usd.format(p.estimateMax)}`
                          : "Estimate pending"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Saved {new Date(p.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild variant="outline">
                      <Link href={`/projects/${p.id}`}>View Project</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/try?restore_generation_id=${encodeURIComponent(p.generationId ?? "")}&restore_project_id=${encodeURIComponent(p.projectId)}`}>
                        Try Another Style
                      </Link>
                    </Button>
                    <Button asChild>
                      <Link href={`/projects/${p.id}#connect`}>Connect Me</Link>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
