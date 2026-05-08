import Link from "next/link";

export const metadata = {
  title: "Admin settings",
  robots: { index: false, follow: false },
};

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-renovision-navy">Settings</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Admin tools & configuration</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Operational shortcuts for analytics exports and AI analysis endpoints.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold">Analytics export API</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">GET /api/admin/analytics/export?range=24h</p>
          <p className="mt-2 text-xs text-muted-foreground">Supports range=24h|7d|30d and start/end date params.</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold">AI analytics analysis API</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">POST /api/admin/analytics/analyze</p>
          <p className="mt-2 text-xs text-muted-foreground">Uses server-side OpenAI only; admin-gated.</p>
        </div>
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">Quick actions</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/analytics?range=24h" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
            View last 24h analytics
          </Link>
          <Link href="/admin/analytics/export-last-24-hours" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
            Export JSON
          </Link>
          <Link href="/admin/analytics#ai-analyzer" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
            Analyze with AI
          </Link>
          <Link href="/admin/sessions" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
            View recent sessions
          </Link>
        </div>
      </section>
    </div>
  );
}
