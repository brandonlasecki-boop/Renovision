import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Next title for a new estimate owned by this user: `Quote-001`, `Quote-002`, …
 * Based on current row count for the owner (simple sequential; not gap-free after deletes).
 */
export async function getNextSequentialQuoteTitle(
  supabase: Pick<SupabaseClient, "from">,
  ownerId: string,
): Promise<string> {
  const { count, error } = await supabase
    .from("bids")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (error) {
    return "Quote-001";
  }
  const n = (count ?? 0) + 1;
  return `Quote-${String(n).padStart(3, "0")}`;
}
