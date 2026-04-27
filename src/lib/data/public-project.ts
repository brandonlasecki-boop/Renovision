import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import type { PublicPhotoView, PublicProjectPayload } from "@/types";

export async function getPublicProjectData(
  shareToken: string,
): Promise<{ data: PublicProjectPayload; photos: PublicPhotoView[] } | null> {
  const supabase = createServiceClient();
  const { data: raw, error } = await supabase.rpc("get_public_project", {
    p_token: shareToken,
  });

  if (error || raw == null) {
    return null;
  }

  const payload = raw as unknown as PublicProjectPayload;
  if (!payload?.project || !payload?.company) {
    return null;
  }

  const photos: PublicPhotoView[] = [];
  for (const p of payload.photos ?? []) {
    const { data } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(p.storage_path, 60 * 60 * 4);
    const url = data?.signedUrl;
    if (url) {
      photos.push({
        id: p.id,
        url,
        caption: p.caption,
        sort_order: p.sort_order,
      });
    }
  }

  photos.sort((a, b) => a.sort_order - b.sort_order);

  return { data: payload, photos };
}
