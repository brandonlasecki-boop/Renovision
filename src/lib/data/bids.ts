import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { isAllowedHomedepotProductImageUrl } from "@/lib/integrations/serpapi-homedepot";
import { isAllowedLowesProductImageUrl } from "@/lib/integrations/serpapi-lowes";
import { lineHasMockupVisualReference } from "@/lib/bid-mockup";
import {
  normalizeMaterialTrade,
  parseQuestionnaire,
  parseRoomMeasurements,
} from "@/lib/bid-scope";
import type {
  Bid,
  BidDetail,
  BidLineTemplate,
  BidMaterialLine,
  BidMockupGenerationMeta,
  BidPhoto,
  BidPhotoWithUrl,
} from "@/types/bid";

/** SerpApi / older rows sometimes store `http://` catalog URLs; allowlists require `https:`. */
function normalizeHttpsProductImageUrl(raw: string): string {
  const t = raw.trim();
  if (!t || !/^http:\/\//i.test(t)) return t;
  try {
    const u = new URL(t);
    u.protocol = "https:";
    return u.toString();
  } catch {
    return t.replace(/^http:\/\//i, "https://");
  }
}

export function parseMaterialEstimate(raw: unknown): BidMaterialLine[] {
  if (!Array.isArray(raw)) return [];
  const out: BidMaterialLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    if (!name.trim()) continue;
    const quantity = typeof o.quantity === "number" ? o.quantity : Number(o.quantity) || 0;
    const unit = typeof o.unit === "string" ? o.unit : "";
    const unit_price_usd =
      typeof o.unit_price_usd === "number"
        ? o.unit_price_usd
        : Number(o.unit_price_usd) || 0;
    const unit_cost_raw = o.unit_cost_usd;
    const unit_cost_usd =
      unit_cost_raw !== undefined && unit_cost_raw !== null
        ? Math.max(0, typeof unit_cost_raw === "number" ? unit_cost_raw : Number(unit_cost_raw) || 0)
        : undefined;
    const markup_raw = o.markup_pct;
    const markup_pct =
      markup_raw !== undefined && markup_raw !== null
        ? (typeof markup_raw === "number" ? markup_raw : Number(markup_raw) || 0)
        : undefined;
    const extended_usd =
      typeof o.extended_usd === "number"
        ? o.extended_usd
        : Number(o.extended_usd) || quantity * unit_price_usd;
    const notes = typeof o.notes === "string" ? o.notes : undefined;
    const trade = normalizeMaterialTrade(o.trade);
    const line_id =
      typeof o.line_id === "string" && o.line_id.trim() ? o.line_id.trim() : undefined;
    const refRaw = o.reference_storage_path;
    const reference_storage_path =
      typeof refRaw === "string" && refRaw.trim() ? refRaw.trim() : undefined;
    const hd_product_url =
      typeof o.hd_product_url === "string" && o.hd_product_url.trim()
        ? o.hd_product_url.trim()
        : undefined;
    const hd_title =
      typeof o.hd_title === "string" && o.hd_title.trim()
        ? o.hd_title.trim().slice(0, 500)
        : undefined;
    const hd_unit_price_usd =
      o.hd_unit_price_usd !== undefined && o.hd_unit_price_usd !== null
        ? Math.max(0, typeof o.hd_unit_price_usd === "number" ? o.hd_unit_price_usd : Number(o.hd_unit_price_usd) || 0)
        : undefined;
    const hd_price_raw =
      typeof o.hd_price_raw === "string" && o.hd_price_raw.trim()
        ? o.hd_price_raw.trim()
        : undefined;
    const hd_price_was_raw = o.hd_price_was_usd;
    const hd_price_was_usd =
      hd_price_was_raw !== undefined && hd_price_was_raw !== null
        ? Math.max(
            0,
            typeof hd_price_was_raw === "number"
              ? hd_price_was_raw
              : Number(hd_price_was_raw) || 0,
          )
        : undefined;
    const hd_pct_raw = o.hd_percentage_off;
    const hd_percentage_off =
      hd_pct_raw !== undefined && hd_pct_raw !== null
        ? Math.max(
            0,
            typeof hd_pct_raw === "number" ? hd_pct_raw : Number(hd_pct_raw) || 0,
          )
        : undefined;
    const hd_badge_raw = o.hd_price_badge;
    const hd_price_badge =
      typeof hd_badge_raw === "string" && hd_badge_raw.trim()
        ? hd_badge_raw.trim().slice(0, 80)
        : undefined;
    const hd_product_id =
      typeof o.hd_product_id === "string" && o.hd_product_id.trim()
        ? o.hd_product_id.trim()
        : undefined;
    const hd_fetched_at =
      typeof o.hd_fetched_at === "string" && o.hd_fetched_at.trim()
        ? o.hd_fetched_at.trim()
        : undefined;
    const rawHdImg = normalizeHttpsProductImageUrl(
      typeof o.hd_image_url === "string" ? o.hd_image_url.trim() : "",
    );
    const hd_image_url =
      rawHdImg &&
      rawHdImg.length <= 2000 &&
      isAllowedHomedepotProductImageUrl(rawHdImg)
        ? rawHdImg
        : undefined;
    const lw_product_url =
      typeof o.lw_product_url === "string" && o.lw_product_url.trim()
        ? o.lw_product_url.trim()
        : undefined;
    const lw_title =
      typeof o.lw_title === "string" && o.lw_title.trim()
        ? o.lw_title.trim().slice(0, 500)
        : undefined;
    const lw_unit_price_usd =
      o.lw_unit_price_usd !== undefined && o.lw_unit_price_usd !== null
        ? Math.max(0, typeof o.lw_unit_price_usd === "number" ? o.lw_unit_price_usd : Number(o.lw_unit_price_usd) || 0)
        : undefined;
    const lw_price_raw =
      typeof o.lw_price_raw === "string" && o.lw_price_raw.trim()
        ? o.lw_price_raw.trim()
        : undefined;
    const lw_price_was_raw = o.lw_price_was_usd;
    const lw_price_was_usd =
      lw_price_was_raw !== undefined && lw_price_was_raw !== null
        ? Math.max(
            0,
            typeof lw_price_was_raw === "number"
              ? lw_price_was_raw
              : Number(lw_price_was_raw) || 0,
          )
        : undefined;
    const lw_pct_raw = o.lw_percentage_off;
    const lw_percentage_off =
      lw_pct_raw !== undefined && lw_pct_raw !== null
        ? Math.max(
            0,
            typeof lw_pct_raw === "number" ? lw_pct_raw : Number(lw_pct_raw) || 0,
          )
        : undefined;
    const lw_badge_raw = o.lw_price_badge;
    const lw_price_badge =
      typeof lw_badge_raw === "string" && lw_badge_raw.trim()
        ? lw_badge_raw.trim().slice(0, 80)
        : undefined;
    const lw_product_id =
      typeof o.lw_product_id === "string" && o.lw_product_id.trim()
        ? o.lw_product_id.trim()
        : undefined;
    const lw_fetched_at =
      typeof o.lw_fetched_at === "string" && o.lw_fetched_at.trim()
        ? o.lw_fetched_at.trim()
        : undefined;
    const rawLwImg = normalizeHttpsProductImageUrl(
      typeof o.lw_image_url === "string" ? o.lw_image_url.trim() : "",
    );
    const lw_image_url =
      rawLwImg &&
      rawLwImg.length <= 2000 &&
      isAllowedLowesProductImageUrl(rawLwImg)
        ? rawLwImg
        : undefined;
    const wantsMockup = o.mockup_include !== false;
    const pricing_approved = o.pricing_approved === true ? true : undefined;
    const msrRaw = o.mockup_shelf_retailer;
    const mockup_shelf_retailerCandidate =
      msrRaw === "hd" || msrRaw === "lw" ? (msrRaw as "hd" | "lw") : undefined;
    const parsed: BidMaterialLine = {
      ...(line_id ? { line_id } : {}),
      name,
      quantity,
      unit,
      unit_price_usd,
      extended_usd,
      ...(unit_cost_usd !== undefined ? { unit_cost_usd } : {}),
      ...(markup_pct !== undefined ? { markup_pct } : {}),
      notes,
      ...(trade !== "general" ? { trade } : {}),
      ...(reference_storage_path ? { reference_storage_path } : {}),
      ...(hd_product_url ? { hd_product_url } : {}),
      ...(hd_title ? { hd_title } : {}),
      ...(hd_unit_price_usd !== undefined ? { hd_unit_price_usd } : {}),
      ...(hd_price_raw ? { hd_price_raw } : {}),
      ...(hd_price_was_usd !== undefined ? { hd_price_was_usd } : {}),
      ...(hd_percentage_off !== undefined ? { hd_percentage_off } : {}),
      ...(hd_price_badge ? { hd_price_badge } : {}),
      ...(hd_product_id ? { hd_product_id } : {}),
      ...(hd_fetched_at ? { hd_fetched_at } : {}),
      ...(hd_image_url ? { hd_image_url } : {}),
      ...(lw_product_url ? { lw_product_url } : {}),
      ...(lw_title ? { lw_title } : {}),
      ...(lw_unit_price_usd !== undefined ? { lw_unit_price_usd } : {}),
      ...(lw_price_raw ? { lw_price_raw } : {}),
      ...(lw_price_was_usd !== undefined ? { lw_price_was_usd } : {}),
      ...(lw_percentage_off !== undefined ? { lw_percentage_off } : {}),
      ...(lw_price_badge ? { lw_price_badge } : {}),
      ...(lw_product_id ? { lw_product_id } : {}),
      ...(lw_fetched_at ? { lw_fetched_at } : {}),
      ...(lw_image_url ? { lw_image_url } : {}),
      mockup_include: false,
    };
    parsed.mockup_include =
      wantsMockup && lineHasMockupVisualReference(parsed) ? true : false;
    if (pricing_approved) {
      parsed.pricing_approved = true;
    }
    if (
      mockup_shelf_retailerCandidate &&
      parsed.hd_image_url &&
      parsed.lw_image_url
    ) {
      parsed.mockup_shelf_retailer = mockup_shelf_retailerCandidate;
    }
    out.push(parsed);
  }
  return out;
}

export function mapLineTemplateRow(row: Record<string, unknown>): BidLineTemplate {
  const trade = normalizeMaterialTrade(row.trade);
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    name: String(row.name),
    quantity: Math.max(0, Number(row.quantity) || 0),
    unit: String(row.unit ?? "ea").trim() || "ea",
    notes: row.notes != null && String(row.notes).trim() ? String(row.notes) : undefined,
    default_unit_price_usd: Math.max(0, Number(row.default_unit_price_usd) || 0),
    ...(trade !== "general" ? { trade } : {}),
    created_at: String(row.created_at),
  };
}

export async function getCompanyLineTemplatesForBid(
  bidId: string,
): Promise<BidLineTemplate[]> {
  const supabase = await createClient();
  const { data: bid } = await supabase
    .from("bids")
    .select("company_id")
    .eq("id", bidId)
    .maybeSingle();
  if (!bid?.company_id) return [];

  const { data: rows, error } = await supabase
    .from("company_line_templates")
    .select("*")
    .eq("company_id", bid.company_id)
    .order("created_at", { ascending: false });

  if (error || !rows) {
    return [];
  }
  return rows.map((r) => mapLineTemplateRow(r as Record<string, unknown>));
}

function parseMockupGenerationMeta(raw: unknown): BidMockupGenerationMeta | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as BidMockupGenerationMeta;
}

export function mapBidRow(row: Record<string, unknown>): Bid {
  const id = String(row.id);
  const companyRaw = row.company_id;
  return {
    id,
    owner_id: row.owner_id != null ? String(row.owner_id) : undefined,
    company_id: companyRaw != null ? String(companyRaw) : null,
    quote_family_id:
      row.quote_family_id != null && String(row.quote_family_id).trim()
        ? String(row.quote_family_id)
        : id,
    status: row.status as Bid["status"],
    title: String(row.title),
    customer_name: String(row.customer_name ?? ""),
    customer_email: row.customer_email != null ? String(row.customer_email) : null,
    customer_phone: row.customer_phone != null ? String(row.customer_phone) : null,
    site_address_line1:
      row.site_address_line1 != null ? String(row.site_address_line1) : null,
    site_city: row.site_city != null ? String(row.site_city) : null,
    site_state: row.site_state != null ? String(row.site_state) : null,
    site_postal_code:
      row.site_postal_code != null ? String(row.site_postal_code) : null,
    scope_description: String(row.scope_description ?? ""),
    internal_notes: row.internal_notes != null ? String(row.internal_notes) : null,
    project_kind: String(row.project_kind ?? ""),
    walkthrough_transcript: String(row.walkthrough_transcript ?? ""),
    room_measurements: parseRoomMeasurements(row.room_measurements),
    project_questionnaire: parseQuestionnaire(row.project_questionnaire),
    walkthrough_completed_at:
      row.walkthrough_completed_at != null
        ? String(row.walkthrough_completed_at)
        : null,
    blueprint_storage_path:
      row.blueprint_storage_path != null ? String(row.blueprint_storage_path) : null,
    material_estimate: parseMaterialEstimate(row.material_estimate),
    ai_summary: row.ai_summary != null ? String(row.ai_summary) : null,
    ai_status: row.ai_status as Bid["ai_status"],
    ai_last_error: row.ai_last_error != null ? String(row.ai_last_error) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Other bids in the same quote family (original + copies), newest first. */
export async function getQuoteFamilyPeers(
  bidId: string,
): Promise<{ id: string; title: string }[]> {
  const supabase = await createClient();
  const { data: row, error: rowErr } = await supabase
    .from("bids")
    .select("company_id, quote_family_id, owner_id")
    .eq("id", bidId)
    .maybeSingle();

  if (rowErr || !row) {
    return [];
  }

  const r = row as { company_id: string | null; quote_family_id?: string | null; owner_id: string };
  const familyId =
    r.quote_family_id != null && String(r.quote_family_id).trim()
      ? String(r.quote_family_id)
      : bidId;

  const { data: peers, error } = await supabase
    .from("bids")
    .select("id, title, updated_at")
    .eq("owner_id", r.owner_id)
    .eq("quote_family_id", familyId)
    .order("updated_at", { ascending: false });

  if (error || !peers?.length) {
    return [];
  }

  return peers.map((p) => ({
    id: String((p as { id: string }).id),
    title: String((p as { title: string }).title ?? "Quote"),
  }));
}

export async function getBidsForUser(): Promise<Bid[]> {
  const supabase = await createClient();
  // Use * so missing migrations (optional columns) do not break the query with "column does not exist".
  const { data: rows, error } = await supabase
    .from("bids")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error || !rows) {
    return [];
  }
  return rows.map((r) => mapBidRow(r as Record<string, unknown>));
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Loose UUID check for route param (avoids treating `new` or junk as an id). */
function looksLikeBidUuid(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.trim());
}

async function safeLineRefMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lines: BidMaterialLine[],
): Promise<Record<string, string>> {
  try {
    return await buildLineReferenceUrlMap(supabase, lines);
  } catch {
    return {};
  }
}

async function loadBidDetailOnce(id: string): Promise<BidDetail | null> {
  const supabase = await createClient();
  const { data: bidRow, error: bidError } = await supabase
    .from("bids")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (bidError || !bidRow) {
    return null;
  }

  const { data: photoRows, error: photoError } = await supabase
    .from("bid_photos")
    .select("*")
    .eq("bid_id", id);

  if (photoError || !photoRows) {
    const bid = mapBidRow(bidRow as Record<string, unknown>);
    const lineReferenceUrls = await safeLineRefMap(supabase, bid.material_estimate);
    const blueprintSignedUrl = await signedBlueprintUrl(supabase, bid.blueprint_storage_path);
    return { bid, photos: [], lineReferenceUrls, blueprintSignedUrl };
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

  const photos: BidPhoto[] = ordered.map((p) => {
    const row = p as Record<string, unknown>;
    return {
      id: String(p.id),
      bid_id: String(p.bid_id),
      storage_path: String(p.storage_path),
      sort_order: Number(p.sort_order),
      caption: p.caption != null ? String(p.caption) : null,
      kind: p.kind as BidPhoto["kind"],
      mockup_generation:
        p.kind === "after_mockup" && p.mockup_generation != null
          ? Number(p.mockup_generation)
          : null,
      mockup_image_provider:
        p.kind === "after_mockup" && row.mockup_image_provider != null
          ? String(row.mockup_image_provider)
          : null,
      mockup_generation_meta:
        p.kind === "after_mockup" ? parseMockupGenerationMeta(row.mockup_generation_meta) : null,
      created_at: String(p.created_at),
    };
  });

  const withUrls: BidPhotoWithUrl[] = (
    await Promise.all(
      photos.map(async (p) => {
        const { data } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .createSignedUrl(p.storage_path, 60 * 60 * 4);
        const signedUrl = data?.signedUrl ?? "";
        if (!signedUrl) return null;
        return { ...p, signedUrl };
      }),
    )
  ).filter((x): x is BidPhotoWithUrl => x !== null);

  const bid = mapBidRow(bidRow as Record<string, unknown>);
  const lineReferenceUrls = await safeLineRefMap(supabase, bid.material_estimate);
  const blueprintSignedUrl = await signedBlueprintUrl(supabase, bid.blueprint_storage_path);

  return {
    bid,
    photos: withUrls,
    lineReferenceUrls,
    blueprintSignedUrl,
  };
}

export async function getBidDetail(bidId: string): Promise<BidDetail | null> {
  let raw = bidId.trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep trimmed */
  }
  const id = raw.trim();
  if (!id || !looksLikeBidUuid(id)) {
    return null;
  }

  const backoffMs = [0, 50, 120, 250, 500, 800, 1200, 1800];
  for (const ms of backoffMs) {
    if (ms > 0) await sleepMs(ms);
    try {
      const detail = await loadBidDetailOnce(id);
      if (detail) return detail;
    } catch {
      /* transient or signing — retry */
    }
  }
  return null;
}

async function signedBlueprintUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(path.trim(), 60 * 60 * 4);
  return data?.signedUrl ?? null;
}

/** Signed URLs for line `reference_storage_path` images (key = `line_id`). */
export async function buildLineReferenceUrlMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lines: BidMaterialLine[],
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const line of lines) {
    if (!line.line_id || !line.reference_storage_path) continue;
    const { data } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(line.reference_storage_path, 60 * 60 * 4);
    if (data?.signedUrl) {
      urls[line.line_id] = data.signedUrl;
    }
  }
  return urls;
}
