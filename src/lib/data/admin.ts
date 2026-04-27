import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { mapBidRow } from "@/lib/data/bids";
import type { Bid, BidMaterialLine, BidMockupGenerationMeta, BidPhotoWithUrl } from "@/types/bid";

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  company: { id: string; name: string } | null;
  bidCount: number;
};

export type AdminBidListRow = {
  id: string;
  title: string;
  company_id: string;
  company_name: string;
  customer_name: string;
  updated_at: string;
  created_at: string;
};

function bidCountMap(rows: { company_id: string }[] | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) {
    const id = String(r.company_id);
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const svc = createServiceClient();
  const { data: companies } = await svc.from("companies").select("id, owner_id, name, created_at");
  const companyByOwner = new Map(
    (companies ?? []).map((c) => [String(c.owner_id), { id: String(c.id), name: String(c.name) }]),
  );

  const { data: bidRows } = await svc.from("bids").select("company_id");
  const counts = bidCountMap(bidRows as { company_id: string }[] | null);

  const { data: list, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(error.message);
  }

  const users = list?.users ?? [];
  const rows: AdminUserRow[] = users.map((u) => {
    const co = companyByOwner.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      company: co ?? null,
      bidCount: co ? (counts.get(co.id) ?? 0) : 0,
    };
  });

  return rows.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function fetchAdminRecentBids(limit = 80): Promise<AdminBidListRow[]> {
  const svc = createServiceClient();
  const { data: bids, error } = await svc
    .from("bids")
    .select("id, title, company_id, customer_name, updated_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !bids?.length) {
    return [];
  }

  const { data: companies } = await svc.from("companies").select("id, name");
  const nameById = new Map((companies ?? []).map((c) => [String(c.id), String(c.name)]));

  return bids.map((b) => {
    const cid = b.company_id != null ? String(b.company_id) : null;
    return {
    id: String(b.id),
    title: String(b.title ?? ""),
    company_id: cid ?? "",
    company_name: cid ? (nameById.get(cid) ?? "—") : "—",
    customer_name: String(b.customer_name ?? ""),
    updated_at: String(b.updated_at),
    created_at: String(b.created_at),
  };
  });
}

export type AdminBidDetail = {
  bid: Bid;
  companyName: string | null;
  photos: BidPhotoWithUrl[];
  lineReferenceUrls: Record<string, string>;
  blueprintSignedUrl: string | null;
};

function parsePhotoMeta(raw: unknown): BidMockupGenerationMeta | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as BidMockupGenerationMeta;
}

export async function fetchAdminBidDetail(bidId: string): Promise<AdminBidDetail | null> {
  const id = bidId.trim();
  if (!id) return null;

  const svc = createServiceClient();
  const { data: bidRow, error: bidError } = await svc.from("bids").select("*").eq("id", id).maybeSingle();
  if (bidError || !bidRow) {
    return null;
  }

  const { data: photoRows, error: photoError } = await svc
    .from("bid_photos")
    .select("*")
    .eq("bid_id", id);

  const br = bidRow as { company_id: string | null };
  const { data: co } =
    br.company_id != null
      ? await svc.from("companies").select("name").eq("id", String(br.company_id)).maybeSingle()
      : { data: null };
  const companyName = co?.name != null ? String(co.name) : null;

  if (photoError || !photoRows) {
    const bid = mapBidRow(bidRow as Record<string, unknown>);
    const lineReferenceUrls = await buildAdminLineReferenceUrlMap(svc, bid.material_estimate);
    const blueprintSignedUrl = await adminSignedBlueprintUrl(svc, bid.blueprint_storage_path);
    return { bid, companyName, photos: [], lineReferenceUrls, blueprintSignedUrl };
  }

  const ordered = [...photoRows].sort((a, b) => {
    const ka = a.kind === "before" ? 0 : 1;
    const kb = b.kind === "before" ? 0 : 1;
    if (ka !== kb) return ka - kb;
    if (a.kind === "before") {
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    }
    return Number(b.mockup_generation ?? 0) - Number(a.mockup_generation ?? 0);
  });

  const photoResults = await Promise.all(
    ordered.map(async (p) => {
      const row = p as Record<string, unknown>;
      const { data } = await svc.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(String(p.storage_path), 60 * 60 * 4);
      const signedUrl = data?.signedUrl ?? "";
      if (!signedUrl) return null;
      return {
        id: String(p.id),
        bid_id: String(p.bid_id),
        storage_path: String(p.storage_path),
        sort_order: Number(p.sort_order),
        caption: p.caption != null ? String(p.caption) : null,
        kind: p.kind as BidPhotoWithUrl["kind"],
        mockup_generation:
          p.kind === "after_mockup" && p.mockup_generation != null
            ? Number(p.mockup_generation)
            : null,
        mockup_image_provider:
          p.kind === "after_mockup" && row.mockup_image_provider != null
            ? String(row.mockup_image_provider)
            : null,
        mockup_generation_meta:
          p.kind === "after_mockup" ? parsePhotoMeta(row.mockup_generation_meta) : null,
        created_at: String(p.created_at),
        signedUrl,
      };
    }),
  );
  const photos: BidPhotoWithUrl[] = photoResults.flatMap((x) => (x ? [x] : []));

  const bid = mapBidRow(bidRow as Record<string, unknown>);
  const lineReferenceUrls = await buildAdminLineReferenceUrlMap(svc, bid.material_estimate);
  const blueprintSignedUrl = await adminSignedBlueprintUrl(svc, bid.blueprint_storage_path);

  return { bid, companyName, photos, lineReferenceUrls, blueprintSignedUrl };
}

async function adminSignedBlueprintUrl(
  svc: ReturnType<typeof createServiceClient>,
  path: string | null,
): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data } = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(path.trim(), 60 * 60 * 4);
  return data?.signedUrl ?? null;
}

async function buildAdminLineReferenceUrlMap(
  svc: ReturnType<typeof createServiceClient>,
  lines: BidMaterialLine[],
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const line of lines) {
    if (!line.line_id || !line.reference_storage_path) continue;
    const { data } = await svc.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(line.reference_storage_path, 60 * 60 * 4);
    if (data?.signedUrl) {
      urls[line.line_id] = data.signedUrl;
    }
  }
  return urls;
}
