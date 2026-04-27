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
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estimates & contractors</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Accounts, estimates, and mockup prompts (set{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">ADMIN_EMAILS</code> or{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">profiles.is_admin</code>, plus{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          on the server). Homeowner /try analytics live on{" "}
          <Link href="/admin/renovision" className="font-medium text-renovision-navy underline-offset-4 hover:underline">
            Renovision control center
          </Link>
          .
        </p>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
        <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Estimates</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 last:border-0">
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
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Recent estimates</h2>
        <p className="text-sm text-muted-foreground">
          Open an estimate to see scope, pricing lines, before/after images, and per-generation prompts.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {bids.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                    No estimates yet.
                  </td>
                </tr>
              ) : (
                bids.map((b) => (
                  <tr key={b.id} className="border-b border-border/50 last:border-0">
                    <td className="max-w-[220px] truncate px-4 py-3 font-medium">{b.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.company_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.customer_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(b.updated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/bids/${b.id}`}
                        className="text-renovision-navy font-medium underline-offset-4 hover:underline"
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
      </section>
    </div>
  );
}
