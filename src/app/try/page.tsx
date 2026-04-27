import Link from "next/link";
import { loadHomeownerTryPageState } from "@/lib/actions/homeowner-try";
import { HomeownerTryClient } from "@/components/homeowner/homeowner-try-client";

export const dynamic = "force-dynamic";

/** Homeowner preview: long AI pipeline; capped at 300s for Vercel Hobby (raise on Pro/Enterprise if needed). */
export const maxDuration = 300;

export const metadata = {
  title: "Try your remodel preview",
};

export default async function RenovisionTryPage() {
  const state = await loadHomeownerTryPageState();

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-renovision-navy-muted/25 to-background">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-renovision-navy">
            Renovision
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
            >
              ← Home
            </Link>
            {state.userEmail ? (
              <span className="hidden text-muted-foreground sm:inline">{state.userEmail}</span>
            ) : null}
            <Link
              href="/login?next=/try"
              className="text-muted-foreground transition hover:text-foreground"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>
      <HomeownerTryClient initial={state} />
    </div>
  );
}
