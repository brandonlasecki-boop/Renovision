import Link from "next/link";
import {
  loadHomeownerTryPageState,
  loadLatestTryGenerationForViewer,
  loadTryGenerationForViewer,
  saveMyProjectForViewer,
} from "@/lib/actions/homeowner-try";
import { HomeownerTryClient } from "@/components/homeowner/homeowner-try-client";
import { TryAnonSessionBootstrap } from "@/components/homeowner/try-anon-session-bootstrap";
import { TryPageChromeHeader } from "@/components/homeowner/try-page-chrome-header";
import { createClient } from "@/lib/supabase/server";
import { resolveViewerIsAdmin } from "@/lib/admin/resolve-viewer-admin";

export const dynamic = "force-dynamic";

/** Homeowner preview: long AI pipeline; capped at 300s for Vercel Hobby (raise on Pro/Enterprise if needed). */
export const maxDuration = 300;

export const metadata = {
  title: "Preview your bathroom remodel",
};

export default async function RenovisionTryPage({
  searchParams,
}: {
  searchParams: Promise<{
    restore_generation_id?: string;
    restore_project_id?: string;
    auto_save_project?: string;
    new?: string;
    r?: string;
  }>;
}) {
  const sp = await searchParams;
  const state = await loadHomeownerTryPageState();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const showAdminNav = user
    ? await resolveViewerIsAdmin({ userId: user.id, email: user.email })
    : false;
  const explicitRestore = sp.restore_generation_id && sp.restore_project_id;
  const forceNew = sp.new === "1";
  const shouldLoadLatest =
    !forceNew &&
    state.ok &&
    (Boolean(user) || Boolean(state.anonymousSessionId));
  const restoredGeneration = explicitRestore
    ? await loadTryGenerationForViewer({
        generationId: sp.restore_generation_id!,
        projectId: sp.restore_project_id!,
      })
    : shouldLoadLatest
      ? await loadLatestTryGenerationForViewer()
      : null;
  const autoSavedProject =
    restoredGeneration &&
    user &&
    sp.auto_save_project === "1"
      ? await saveMyProjectForViewer({
          generationId: restoredGeneration.generationId,
          projectId: restoredGeneration.projectId,
        }).then((r) => "success" in r && r.success)
      : false;

  if (!state.ok) {
    return (
      <div className="min-h-screen bg-muted/30 px-4 py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-border/80 bg-card p-6 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-renovision-navy underline-offset-4 hover:underline"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const needsAnonymousBootstrap = !state.userEmail && !state.anonymousSessionId;

  if (needsAnonymousBootstrap) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-renovision-navy-muted/25 to-background">
        <TryPageChromeHeader
          user={user}
          showAdminNav={showAdminNav}
          anonymousSessionId={null}
          userEmail={state.userEmail}
        />
        <TryAnonSessionBootstrap />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-renovision-navy-muted/25 to-background">
      <TryPageChromeHeader
        user={user}
        showAdminNav={showAdminNav}
        anonymousSessionId={state.anonymousSessionId}
        userEmail={state.userEmail}
      />
      <HomeownerTryClient
        initial={state}
        restoredGeneration={restoredGeneration}
        autoSavedProject={autoSavedProject}
        startNewProject={forceNew}
        startNewToken={sp.r ?? ""}
      />
    </div>
  );
}
