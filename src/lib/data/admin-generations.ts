import { unstable_noStore as noStore } from "next/cache";
import { fetchAdminAnalyticsSessionDetail } from "@/lib/data/admin-analytics";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { createServiceClient } from "@/lib/supabase/service";

const SIGNED_URL_TTL_SEC = 60 * 60;

type GenerationRow = {
  id: string;
  created_at: string;
  selected_style: string | null;
  uploaded_image_url: string | null;
  generated_image_url: string | null;
  estimate_low: number | null;
  estimate_expected: number | null;
  estimate_high: number | null;
  estimate_min: number | null;
  estimate_max: number | null;
  tweaks_used: unknown;
  lead_submitted: boolean | null;
  session_id: string | null;
  status: string | null;
  user_description: string | null;
  scope_of_work: unknown;
  contractor_notes: string | null;
  metadata: Record<string, unknown> | null;
};

type LeadLite = {
  id: string;
  generation_id: string | null;
  zip_code: string | null;
  created_at: string;
};

export type AdminGenerationListFilters = {
  start?: string;
  end?: string;
  style?: string;
  leadSubmitted?: "all" | "yes" | "no";
  status?: string;
  sessionId?: string;
  zipCode?: string;
};

export type AdminGenerationListItem = {
  id: string;
  createdAt: string;
  selectedStyle: string;
  uploadedThumbUrl: string | null;
  generatedThumbUrl: string | null;
  estimateLow: number | null;
  estimateExpected: number | null;
  estimateHigh: number | null;
  tweaksSummary: string;
  leadSubmitted: boolean;
  sessionId: string;
  status: string;
  linkedLeadZipCode: string | null;
  linkedLeadId: string | null;
};

export type AdminGenerationDetail = {
  id: string;
  createdAt: string;
  selectedStyle: string;
  uploadedImageUrl: string | null;
  generatedImageUrl: string | null;
  estimateLow: number | null;
  estimateExpected: number | null;
  estimateHigh: number | null;
  userDescription: string;
  tweaksUsed: Array<Record<string, unknown>>;
  scopeOfWork: unknown;
  contractorNotes: string;
  leadSubmitted: boolean;
  sessionId: string;
  status: string;
  metadata: Record<string, unknown>;
  linkedLead: { id: string; zipCode: string; createdAt: string } | null;
  analyticsTimeline: Awaited<ReturnType<typeof fetchAdminAnalyticsSessionDetail>> | null;
};

function asText(v: unknown): string {
  return String(v ?? "").trim();
}

function asNumberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeStoragePath(value: string): string {
  const v = value.trim().replace(/^\//, "");
  if (v.startsWith(`${PHOTOS_BUCKET}/`)) return v.slice(PHOTOS_BUCKET.length + 1);
  return v;
}

async function signImagePath(pathOrUrl: string | null | undefined): Promise<string | null> {
  const raw = asText(pathOrUrl);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const svc = createServiceClient();
  const { data } = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(normalizeStoragePath(raw), SIGNED_URL_TTL_SEC);
  return data?.signedUrl ?? null;
}

async function signImagePathsBatch(paths: string[]): Promise<Map<string, string>> {
  const svc = createServiceClient();
  const unique = Array.from(new Set(paths.map((p) => asText(p)).filter(Boolean)));
  const out = new Map<string, string>();
  const localPaths: string[] = [];
  for (const p of unique) {
    if (/^https?:\/\//i.test(p)) out.set(p, p);
    else localPaths.push(p);
  }
  if (localPaths.length) {
    const normalized = localPaths.map((p) => normalizeStoragePath(p));
    const { data } = await svc.storage.from(PHOTOS_BUCKET).createSignedUrls(normalized, SIGNED_URL_TTL_SEC);
    if (data?.length) {
      for (let i = 0; i < localPaths.length; i += 1) {
        const signed = data[i]?.signedUrl;
        if (signed) out.set(localPaths[i], signed);
      }
    }
  }
  return out;
}

function summarizeTweaks(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "None";
  const typed = value
    .map((entry) => (entry && typeof entry === "object" ? asText((entry as Record<string, unknown>).type) : ""))
    .filter(Boolean);
  if (!typed.length) return `${value.length} tweak(s)`;
  const unique = Array.from(new Set(typed));
  return `${value.length} tweak(s): ${unique.slice(0, 2).join(", ")}${unique.length > 2 ? "..." : ""}`;
}

export async function fetchAdminGenerationStylesAndStatuses() {
  noStore();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("bathroom_generations")
    .select("selected_style, status")
    .order("created_at", { ascending: false })
    .limit(1500);
  if (error) throw new Error(error.message);
  const styles = Array.from(
    new Set((data ?? []).map((r) => asText(r.selected_style)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const statuses = Array.from(
    new Set((data ?? []).map((r) => asText(r.status)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  return { styles, statuses };
}

export async function fetchAdminGenerations(filters: AdminGenerationListFilters): Promise<AdminGenerationListItem[]> {
  noStore();
  const svc = createServiceClient();
  let query = svc
    .from("bathroom_generations")
    .select(
      "id, created_at, selected_style, uploaded_image_url, generated_image_url, estimate_low, estimate_expected, estimate_high, estimate_min, estimate_max, tweaks_used, lead_submitted, session_id, status, user_description, scope_of_work, contractor_notes, metadata",
    )
    .order("created_at", { ascending: false })
    .limit(350);

  if (filters.start) query = query.gte("created_at", `${filters.start}T00:00:00.000Z`);
  if (filters.end) query = query.lte("created_at", `${filters.end}T23:59:59.999Z`);
  if (asText(filters.style) && filters.style !== "all") query = query.eq("selected_style", filters.style);
  if (asText(filters.status) && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.leadSubmitted === "yes") query = query.eq("lead_submitted", true);
  if (filters.leadSubmitted === "no") query = query.eq("lead_submitted", false);
  if (asText(filters.sessionId)) query = query.ilike("session_id", `%${asText(filters.sessionId)}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const generations = (data ?? []) as GenerationRow[];

  const generationIds = generations.map((g) => g.id);
  let leadsByGeneration = new Map<string, LeadLite>();
  if (generationIds.length) {
    const { data: leads, error: leadsError } = await svc
      .from("leads")
      .select("id, generation_id, zip_code, created_at")
      .in("generation_id", generationIds)
      .order("created_at", { ascending: false });
    if (leadsError) throw new Error(leadsError.message);
    for (const lead of (leads ?? []) as LeadLite[]) {
      const genId = asText(lead.generation_id);
      if (!genId || leadsByGeneration.has(genId)) continue;
      leadsByGeneration.set(genId, lead);
    }
  }

  const zipFilter = asText(filters.zipCode).toLowerCase();
  const filtered = generations.filter((g) => {
    if (!zipFilter) return true;
    const zip = asText(leadsByGeneration.get(g.id)?.zip_code).toLowerCase();
    return zip.includes(zipFilter);
  });

  const pathsToSign = filtered.flatMap((g) => [asText(g.uploaded_image_url), asText(g.generated_image_url)]).filter(Boolean);
  const signedMap = await signImagePathsBatch(pathsToSign);

  return filtered.map((g) => {
    const linkedLead = leadsByGeneration.get(g.id) ?? null;
    const estimateLow = asNumberOrNull(g.estimate_low ?? g.estimate_min);
    const estimateHigh = asNumberOrNull(g.estimate_high ?? g.estimate_max);
    const estimateExpected =
      asNumberOrNull(g.estimate_expected) ??
      (estimateLow != null && estimateHigh != null ? Math.round((estimateLow + estimateHigh) / 2) : null);
    const uploadedRaw = asText(g.uploaded_image_url);
    const generatedRaw = asText(g.generated_image_url);
    return {
      id: g.id,
      createdAt: g.created_at,
      selectedStyle: asText(g.selected_style) || "—",
      uploadedThumbUrl: uploadedRaw ? (signedMap.get(uploadedRaw) ?? null) : null,
      generatedThumbUrl: generatedRaw ? (signedMap.get(generatedRaw) ?? null) : null,
      estimateLow,
      estimateExpected,
      estimateHigh,
      tweaksSummary: summarizeTweaks(g.tweaks_used),
      leadSubmitted: Boolean(g.lead_submitted),
      sessionId: asText(g.session_id) || "—",
      status: asText(g.status) || "unknown",
      linkedLeadZipCode: linkedLead ? asText(linkedLead.zip_code) || null : null,
      linkedLeadId: linkedLead ? linkedLead.id : null,
    };
  });
}

export async function fetchAdminGenerationDetail(generationId: string): Promise<AdminGenerationDetail | null> {
  noStore();
  const id = asText(generationId);
  if (!id) return null;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("bathroom_generations")
    .select(
      "id, created_at, selected_style, uploaded_image_url, generated_image_url, estimate_low, estimate_expected, estimate_high, estimate_min, estimate_max, tweaks_used, lead_submitted, session_id, status, user_description, scope_of_work, contractor_notes, metadata",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as GenerationRow;

  const { data: lead } = await svc
    .from("leads")
    .select("id, zip_code, created_at")
    .eq("generation_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [uploadedImageUrl, generatedImageUrl] = await Promise.all([
    signImagePath(row.uploaded_image_url),
    signImagePath(row.generated_image_url),
  ]);

  const estimateLow = asNumberOrNull(row.estimate_low ?? row.estimate_min);
  const estimateHigh = asNumberOrNull(row.estimate_high ?? row.estimate_max);
  const estimateExpected =
    asNumberOrNull(row.estimate_expected) ??
    (estimateLow != null && estimateHigh != null ? Math.round((estimateLow + estimateHigh) / 2) : null);
  const sessionId = asText(row.session_id);
  const analyticsTimeline = sessionId ? await fetchAdminAnalyticsSessionDetail(sessionId) : null;
  const tweaksUsed = Array.isArray(row.tweaks_used)
    ? row.tweaks_used.filter((t): t is Record<string, unknown> => Boolean(t && typeof t === "object"))
    : [];

  return {
    id: row.id,
    createdAt: row.created_at,
    selectedStyle: asText(row.selected_style) || "—",
    uploadedImageUrl,
    generatedImageUrl,
    estimateLow,
    estimateExpected,
    estimateHigh,
    userDescription: asText(row.user_description),
    tweaksUsed,
    scopeOfWork: row.scope_of_work,
    contractorNotes: asText(row.contractor_notes),
    leadSubmitted: Boolean(row.lead_submitted),
    sessionId: sessionId || "—",
    status: asText(row.status) || "unknown",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    linkedLead: lead
      ? {
          id: asText(lead.id),
          zipCode: asText(lead.zip_code),
          createdAt: asText(lead.created_at),
        }
      : null,
    analyticsTimeline,
  };
}
