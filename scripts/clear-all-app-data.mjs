/**
 * Same outcome as supabase/scripts/clear_all_app_data.sql (no direct Postgres URL needed).
 * Uses service role: deletes public rows in FK-safe order, keeps ADMIN_EMAILS[0], sets is_admin.
 *
 * Run after: npm run storage:empty-project-photos
 * Usage: node --env-file=.env.local scripts/clear-all-app-data.mjs
 */

import { createClient } from "@supabase/supabase-js";

const ZERO = "00000000-0000-0000-0000-000000000000";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (adminEmails.length === 0) {
  console.error("Missing ADMIN_EMAILS in .env.local (comma-separated; first entry is preserved)");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function deleteAllFrom(table, column = "id") {
  const { error } = await supabase.from(table).delete().neq(column, ZERO);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function findAdminUserId() {
  const want = adminEmails[0];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").trim().toLowerCase() === want);
    if (hit) return hit.id;
    if (users.length < perPage) break;
    page += 1;
  }
  throw new Error(`No auth user found for ADMIN_EMAILS first entry: ${want}`);
}

async function main() {
  const adminId = await findAdminUserId();
  console.log("Preserving admin user:", adminEmails[0]);

  const steps = [
    () => deleteAllFrom("renovision_saved_projects"),
    () => deleteAllFrom("homeowner_try_mockups"),
    () => deleteAllFrom("leads"),
    () => deleteAllFrom("bathroom_generations"),
    () => deleteAllFrom("renovision_analytics_events"),
    () => deleteAllFrom("renovision_remodeler_requests"),
    () => deleteAllFrom("homeowner_try_projects"),
    () => deleteAllFrom("renovision_anonymous_sessions"),
    () => deleteAllFrom("renovision_user_generation_usage", "user_id"),
    () => deleteAllFrom("bid_photos"),
    () => deleteAllFrom("bids"),
    () => deleteAllFrom("project_updates"),
    () => deleteAllFrom("project_photos"),
    () => deleteAllFrom("projects"),
    () => deleteAllFrom("company_line_templates"),
    () => deleteAllFrom("companies"),
  ];

  for (const run of steps) {
    await run();
  }

  const { error: profDelErr } = await supabase.from("profiles").delete().neq("id", adminId);
  if (profDelErr) throw new Error(`profiles delete: ${profDelErr.message}`);

  const { error: profUpsertErr } = await supabase.from("profiles").upsert(
    { id: adminId, is_admin: true, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (profUpsertErr) throw new Error(`profiles upsert: ${profUpsertErr.message}`);

  const allIds = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) allIds.push(u.id);
    if (users.length < perPage) break;
    page += 1;
  }

  let deleted = 0;
  for (const id of allIds) {
    if (id === adminId) continue;
    const { error: delErr } = await supabase.auth.admin.deleteUser(id);
    if (delErr) throw delErr;
    deleted += 1;
  }

  console.log(`Deleted ${deleted} other auth user(s). Admin preserved. Done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
