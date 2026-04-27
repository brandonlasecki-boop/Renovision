import type { BidMockupGenerationMeta, BidPhotoWithUrl } from "@/types/bid";

/** Oldest → newest (v1, v2, …). Null generation sorts as 0; tie-break by created_at. */
export function sortMockupsByVersionAsc(
  photos: BidPhotoWithUrl[],
): BidPhotoWithUrl[] {
  return [...photos].sort((a, b) => {
    const ga = a.mockup_generation ?? 0;
    const gb = b.mockup_generation ?? 0;
    if (ga !== gb) return ga - gb;
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });
}

/** @deprecated — internal provider only; not shown in customer-facing UI. */
export function mockupProviderBadge(
  provider: string | null | undefined,
): string | null {
  if (!provider) return null;
  if (provider === "vertex_gemini") return "Vertex";
  if (provider === "openai") return "OpenAI";
  if (provider === "openai_dalle_fallback") return "DALL·E concept";
  return null;
}

/** Short label for compare dropdowns / sliders (no provider names). */
export function mockupVersionLabel(p: BidPhotoWithUrl): string {
  return p.mockup_generation != null ? `v${p.mockup_generation}` : "Mockup";
}

/**
 * One plain sentence for contractors: whether shelf/contractor images actually reached the model.
 * Shown under mockup thumbnails and appended to the stored caption on new renders.
 */
export function formatMockupProductRefStatusLine(
  meta: BidMockupGenerationMeta | null | undefined,
): string | null {
  if (!meta || meta.usedConceptFallback) return null;
  const provider = String(meta.usedMockupProvider ?? "");
  const urlCount =
    typeof meta.mockup_reference_urls_count === "number"
      ? meta.mockup_reference_urls_count
      : null;
  const vf = meta.vertex_reference_fetch;
  const loaded =
    vf && typeof vf.loaded === "number" && Number.isFinite(vf.loaded) ? vf.loaded : null;
  const attempted =
    vf && typeof vf.attempted === "number" && Number.isFinite(vf.attempted)
      ? vf.attempted
      : null;
  const hasSummary =
    typeof meta.referenceVisualSummary === "string" &&
    meta.referenceVisualSummary.trim().length > 0;
  const omit = Boolean(meta.vertex_inline_product_refs_omitted_ambiguous_room);
  const authFb = Boolean(meta.openai_after_vertex_auth_fallback);

  const nUrls = urlCount ?? attempted ?? 0;

  if (provider === "vertex_gemini") {
    if (omit) {
      return `Product images: not attached this run (weak-room omit env).${hasSummary ? " Text-only product notes were sent." : ""}`;
    }
    if (nUrls <= 0) {
      return "Product images: none — enable Mockup on quote lines and add a Home Depot/Lowe’s product image or a contractor reference photo.";
    }
    if (loaded === 0) {
      return `Product images: 0 of ${nUrls} reached the AI (downloads failed). Try re-saving shelf links or re-uploading reference photos.`;
    }
    if (loaded != null && loaded < nUrls) {
      return `Product images: ${loaded} of ${nUrls} reached the AI; some downloads failed.`;
    }
    const base = `Product images: ${loaded ?? nUrls} of ${nUrls} shelf/contractor image(s) were sent to the AI.`;
    const slots = meta.mockup_reference_slot_summaries;
    if (slots && slots.length > 0) {
      return `${base} With this render: ${slots.join(" · ")}.`;
    }
    return base;
  }

  if (provider === "openai") {
    if (authFb) {
      return "Product images: Vertex failed auth → OpenAI ran without shelf photos (text only). Fix Google credentials or use MOCKUP_IMAGE_PROVIDER=openai for intentional OpenAI-only dev.";
    }
    if (nUrls <= 0) {
      return "Product images: none on mockup lines.";
    }
    return `Product images: OpenAI only sees the room photo — ${nUrls} product image(s) were summarized as text. For stronger shelf matching, use Vertex (GOOGLE_CLOUD_PROJECT + credentials).`;
  }

  if (provider === "openai_dalle_fallback") {
    return "Product images: concept fallback — not a faithful photo edit.";
  }

  return null;
}
