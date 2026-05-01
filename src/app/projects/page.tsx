import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { listProjectsForProjectsPage } from "@/lib/data/renovision-saved-projects";
import { buttonVariants } from "@/components/ui/button";
import { renameSavedProjectAction } from "@/lib/actions/renovision-saved-projects";
import { getRenovisionAnonymousSessionIdFromCookie } from "@/lib/renovision/anonymous-cookie";
import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function MyProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { rows } = await listProjectsForProjectsPage();
  const hasGuestSession = !user && (await getRenovisionAnonymousSessionIdFromCookie());

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-renovision-navy">
            Renovision
          </Link>
          <Link href="/try?new=1" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Start new design
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Projects</h1>
          {user ? null : (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {hasGuestSession
                ? "Your previews are tied to this browser. Create a free account to access them on any device."
                : "Start a bathroom preview to see it here, or sign in to load saved work from your account."}
            </p>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {user ? (
              <p>
                No projects yet. Complete a bathroom preview on{" "}
                <Link href="/try" className="font-medium text-renovision-navy underline-offset-4 hover:underline">
                  Try your remodel
                </Link>
                — it will appear here. Use <span className="font-medium text-foreground">Save My Project</span> on
                the result to add a named copy to this list.
              </p>
            ) : (
              <p>
                No projects on this device yet.{" "}
                <Link href="/try" className="font-medium text-renovision-navy underline-offset-4 hover:underline">
                  Start a free preview
                </Link>{" "}
                — it will show up here automatically.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map(({ card: p, isGuest, isSavedRow }) => (
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
                      <p className="text-sm font-semibold">{p.projectName || p.selectedStyle || "Saved remodel"}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.estimateMin != null && p.estimateMax != null
                          ? `${usd.format(p.estimateMin)}–${usd.format(p.estimateMax)}`
                          : "Estimate pending"}
                      </p>
                      <p className="text-xs text-muted-foreground">Updated {new Date(p.createdAt).toLocaleDateString()}</p>
                      {isGuest ? (
                        <p className="text-[11px] text-muted-foreground">On this device — sign in to save to your account.</p>
                      ) : isSavedRow ? (
                        <form action={renameSavedProjectAction} className="pt-1">
                          <input type="hidden" name="saved_project_id" value={p.id} />
                          <input
                            name="project_name"
                            defaultValue={p.projectName ?? ""}
                            maxLength={80}
                            placeholder="Rename project"
                            className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/80"
                          />
                          <button
                            type="submit"
                            className="ml-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            Save
                          </button>
                        </form>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Open the preview and use Save My Project to add a custom name.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                      href={`/try?restore_generation_id=${encodeURIComponent(p.generationId ?? "")}&restore_project_id=${encodeURIComponent(p.projectId)}`}
                      className={cn(buttonVariants({ variant: "outline" }), "justify-center")}
                    >
                      View My Project
                    </Link>
                    <Link
                      href={`/try?restore_generation_id=${encodeURIComponent(p.generationId ?? "")}&restore_project_id=${encodeURIComponent(p.projectId)}`}
                      className={cn(buttonVariants({ variant: "outline" }), "justify-center")}
                    >
                      Try Another Style
                    </Link>
                    <Link
                      href={`/try?restore_generation_id=${encodeURIComponent(p.generationId ?? "")}&restore_project_id=${encodeURIComponent(p.projectId)}`}
                      className={cn(buttonVariants(), "justify-center")}
                    >
                      Connect Me
                    </Link>
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
