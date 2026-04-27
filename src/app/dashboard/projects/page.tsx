import Link from "next/link";
import { getCompanyForUser, getProjectsForUser } from "@/lib/data/dashboard";
import { NewProjectForm } from "@/components/dashboard/new-project-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export default async function ProjectsPage() {
  const company = await getCompanyForUser();
  const projects = await getProjectsForUser();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each project has its own client-facing page and share link.
        </p>
      </div>

      {!company ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-lg">Create your company first</CardTitle>
            <CardDescription>
              Add your business profile before creating projects.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/company" className={cn(buttonVariants())}>
              Go to company
              <ArrowRight className="ml-1 size-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-lg">New project</CardTitle>
            <CardDescription>
              Example: “Bathroom remodel — Maple Ave” or “ADU — Phase 2”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewProjectForm />
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-medium text-muted-foreground">Your projects</h2>
        <ul className="mt-3 divide-y divide-border/80 rounded-xl border border-border/80 bg-card">
          {projects.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No projects yet.
            </li>
          ) : (
            projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-muted/40"
                >
                  <span className="font-medium">{p.title}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
