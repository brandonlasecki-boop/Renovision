/**
 * Empty the project-photos bucket via Storage API (direct SQL on storage.objects is blocked).
 *
 * Usage: node --env-file=.env.local scripts/empty-project-photos-bucket.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const bucket = "project-photos";

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listPrefixPage(prefix, offset) {
  return supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset,
    sortBy: { column: "name", order: "asc" },
  });
}

async function listAllPaths(prefix = "") {
  const paths = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await listPrefixPage(prefix, offset);
    if (error) throw error;
    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const item of batch) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      // Files carry metadata; folder placeholders do not (Supabase Storage API).
      if (item.metadata !== null && item.metadata !== undefined) {
        paths.push(rel);
      } else {
        paths.push(...(await listAllPaths(rel)));
      }
    }

    if (batch.length < 1000) break;
    offset += 1000;
  }

  return paths;
}

async function main() {
  const paths = await listAllPaths("");
  if (paths.length === 0) {
    console.log(`Bucket "${bucket}" is already empty.`);
    return;
  }

  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) throw error;
    console.log(`Removed ${Math.min(i + chunkSize, paths.length)} / ${paths.length} objects`);
  }
  console.log(`Done. Removed ${paths.length} object(s) from "${bucket}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
