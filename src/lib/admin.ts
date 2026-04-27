/**
 * Admin access: `profiles.is_admin` (see migration 012) or allowlisted email via `ADMIN_EMAILS`
 * (comma-separated, server-only). Example: ADMIN_EMAILS=you@company.com
 */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}
