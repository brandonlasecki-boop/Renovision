import Link from "next/link";

import { fetchAdminRecentBids, fetchAdminUsers } from "@/lib/data/admin";

export default async function AdminOverviewPage() {
  let users: Awaited<ReturnType<typeof fetchAdminUsers>> = [];
  let bids: Awaited<ReturnType<typeof fetchAdminRecentBids>> = [];
  let loadError: string | null = null;

  try {
    [users, bids] = await Promise.all([fetchAdminUsers(), fetchAdminRecentBids()]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load admin data.";
  }

  return (
    <div className="space-y-12 sm:space-y-14">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-sm ring-1 ring-black/[0.03] sm:p-8 dark:ring-white/[0.04]">
        <div
          className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-renovision-teal/[0.08] blur-2xl"
          aria-hidden
        />
        <div className="relative max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-renovision-navy dark:text-renovision-teal">
            Contractor data
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Estimates &amp; contractors</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Accounts, estimates, and mockup prompts. Server env:{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">ADMIN_EMAILS</code> or{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">profiles.is_admin</code>, plus{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>.
            Homeowner <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">/try</code> analytics:{" "}
            <Link
              href="/admin/renovision"
              className="font-semibold text-renovision-navy underline-offset-4 hover:underline dark:text-renovision-orange"
            >
              Renovision control center
            </Link>
            .
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-4 text-sm text-destructive shadow-sm"
          role="alert"
        >
          <p className="font-semibold">Could not load admin data</p>
          <p className="mt-1 opacity-90">{loadError}</p>
        </div>
      ) : null}

      <section className="space-y-4">
        <header className="space-y-1 border-b border-border/60 pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
          <p className="text-sm text-muted-foreground">Contractor profiles and estimate counts.</p>
        </header>
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/80 bg-gradient-to-r from-muted/50 to-muted/25">
                <th className="px-4 py-3.5 font-semibold">Email</th>
                <th className="px-4 py-3.5 font-semibold">Company</th>
                <th className="px-4 py-3.5 font-semibold">Estimates</th>
                <th className="px-4 py-3.5 font-semibold">Joined</th>
                <th className="px-4 py-3.5 font-semibold">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-border/40 transition-colors hover:bg-muted/20 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs sm:text-sm">{u.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.company?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{u.bidCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header className="space-y-1 border-b border-border/60 pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Recent estimates</h2>
          <p className="text-sm text-muted-foreground">
            Open a row for scope, pricing lines, before/after images, and prompts.
          </p>
        </header>
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/80 bg-gradient-to-r from-muted/50 to-muted/25">
                <th className="px-4 py-3.5 font-semibold">Title</th>
                <th className="px-4 py-3.5 font-semibold">Company</th>
                <th className="px-4 py-3.5 font-semibold">Customer</th>
                <th className="px-4 py-3.5 font-semibold">Updated</th>
                <th className="px-4 py-3.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {bids.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                    No estimates yet.
                  </td>
                </tr>
              ) : (
                bids.map((b) => (
                  <tr key={b.id} className="border-b border-border/40 transition-colors hover:bg-muted/20 last:border-0">
                    <td className="max-w-[220px] truncate px-4 py-3 font-medium">{b.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.company_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.customer_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(b.updated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/bids/${b.id}`}
                        className="inline-flex rounded-lg bg-renovision-navy/10 px-3 py-1.5 text-xs font-semibold text-renovision-navy transition-colors hover:bg-renovision-navy/15 dark:bg-renovision-orange/15 dark:text-renovision-orange dark:hover:bg-renovision-orange/25"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </div>
  );
}
