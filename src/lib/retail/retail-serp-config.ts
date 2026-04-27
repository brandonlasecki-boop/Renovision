/**
 * When true, retail attach skips all SerpApi / Google storefront search.
 * Home Depot links are set from OpenAI only ({@link fetchRetailHomedepotDirectLinksBatch}).
 * Set `RETAIL_DISABLE_SERP=true` (and `OPENAI_API_KEY`) for OpenAI-only product URLs (no shelf prices).
 */
export function isRetailSerpDisabled(): boolean {
  const v = process.env.RETAIL_DISABLE_SERP?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
