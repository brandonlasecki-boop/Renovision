import { unstable_noStore as noStore } from "next/cache";
import { fetchAdminAnalyticsSessionDetail } from "@/lib/data/admin-analytics";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { createServiceClient } from "@/lib/supabase/service";

type LeadRow = {
  id: string;
  created_at: string;
  generation_id: string | null;
  session_id: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  zip_code: string | null;
  timeline: string | null;
  budget_range: string | null;
  project_notes: string | null;
  selected_style: string | null;
  uploaded_image_url: string | null;
  generated_image_url: string | null;
  estimate_low: number | null;
  estimate_expected: number | null;
  estimate_high: number | null;
  estimate_min: number | null;
  estimate_max: number | null;
  scope_of_work: unknown;
  contractor_notes: string | null;
  status: string | null;
  assigned_contractor_id: string | null;
  metadata: Record<string, unknown> | null;
};

type ContractorRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  active: boolean | null;
};

type AssignmentRow = {
  id: string;
  created_at: string;
  contractor_id: string;
  shared_by: string | null;
  shared_at: string | null;
  status: string;
  contractor_viewed_at: string | null;
  contractor_response: string | null;
  notes: string | null;
};

export type LeadFilterParams = {
  status?: string;
  start?: string;
  end?: string;
  zip?: string;
  budget?: string;
  timeline?: string;
  style?: string;
  assigned?: "all" | "assigned" | "unassigned";
  contractorId?: string;
  q?: string;
};

export type AdminLeadListItem = {
  id: string;
  createdAt: string;
  name: string;
  zipCode: string;
  timeline: string;
  budgetRange: string;
  selectedStyle: string;
  estimateLow: number | null;
  estimateExpected: number | null;
  estimateHigh: number | null;
  status: string;
  assignedContractorName: string;
  generatedThumbUrl: string | null;
};

export type AdminLeadFilters = {
  statuses: string[];
  budgets: string[];
  timelines: string[];
  styles: string[];
  contractors: Array<{ id: string; name: string; active: boolean; serviceZipCodes: string[] }>;
};

export type LeadContractorOption = {
  id: string;
  name: string;
  active: boolean;
  serviceZipCodes: string[];
};

export function getEligibleContractorsForLead(
  lead: { zip_code?: string | null } | { zipCode?: string | null },
  contractors: LeadContractorOption[],
) {
  const zip = asText(
    (lead as { zip_code?: string | null }).zip_code ??
      (lead as { zipCode?: string | null }).zipCode,
  );
  const zipNorm = zip.toLowerCase();
  const activeContractors = contractors.filter((c) => c.active);
  const eligible = activeContractors.filter((c) =>
    c.serviceZipCodes.map((z) => asText(z).toLowerCase()).includes(zipNorm),
  );
  const ineligible = activeContractors.filter(
    (c) => !c.serviceZipCodes.map((z) => asText(z).toLowerCase()).includes(zipNorm),
  );
  return {
    eligibleContractors: eligible,
    nonMatchingContractors: ineligible,
  };
}

export type AdminLeadDetail = {
  id: string;
  createdAt: string;
  status: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  zipCode: string;
  timeline: string;
  budgetRange: string;
  notes: string;
  selectedStyle: string;
  estimateLow: number | null;
  estimateExpected: number | null;
  estimateHigh: number | null;
  uploadedImageUrl: string | null;
  generatedImageUrl: string | null;
  scopeOfWork: unknown;
  contractorNotes: string;
  generationId: string | null;
  sessionId: string;
  assignedContractorId: string | null;
  assignedContractorName: string;
  metadata: Record<string, unknown>;
  analyticsTimeline: Awaited<ReturnType<typeof fetchAdminAnalyticsSessionDetail>> | null;
  assignmentHistory: Array<{
    id: string;
    createdAt: string;
    contractorName: string;
    status: string;
    sharedAt: string | null;
    viewedAt: string | null;
    contractorResponse: string | null;
    notes: string | null;
  }>;
};

function asText(v: unknown): string {
  return String(v ?? "").trim();
}

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeStoragePath(pathOrUrl: string): string {
  const v = pathOrUrl.trim().replace(/^\//, "");
  if (v.startsWith(`${PHOTOS_BUCKET}/`)) return v.slice(PHOTOS_BUCKET.length + 1);
  return v;
}

async function signPath(pathOrUrl: string | null | undefined): Promise<string | null> {
  const raw = asText(pathOrUrl);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const svc = createServiceClient();
  const { data } = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(normalizeStoragePath(raw), 60 * 60);
  return data?.signedUrl ?? null;
}

async function signPathsBatch(paths: string[]): Promise<Map<string, string>> {
  const svc = createServiceClient();
  const unique = Array.from(new Set(paths.map((p) => asText(p)).filter(Boolean)));
  const out = new Map<string, string>();
  const local: string[] = [];
  for (const p of unique) {
    if (/^https?:\/\//i.test(p)) out.set(p, p);
    else local.push(p);
  }
  if (local.length) {
    const normalized = local.map((p) => normalizeStoragePath(p));
    const { data } = await svc.storage.from(PHOTOS_BUCKET).createSignedUrls(normalized, 60 * 60);
    if (data?.length) {
      for (let i = 0; i < local.length; i += 1) {
        const signed = data[i]?.signedUrl;
        if (signed) out.set(local[i], signed);
      }
    }
  }
  return out;
}

function statusRank(status: string): number {
  const s = status.toLowerCase();
  if (s === "new") return 0;
  if (s === "reviewed") return 1;
  if (s === "contacted") return 2;
  if (s === "assigned") return 3;
  if (s === "shared") return 4;
  if (s === "closed") return 5;
  if (s === "bad_fit") return 6;
  return 99;
}

function fullName(row: LeadRow): string {
  const first = asText(row.first_name);
  const last = asText(row.last_name);
  const combined = [first, last].filter(Boolean).join(" ");
  if (combined) return combined;
  return asText(row.name) || "Unknown";
}

export async function fetchAdminLeadFilterOptions(): Promise<AdminLeadFilters> {
  noStore();
  const svc = createServiceClient();
  const [leadRes, contractorRes] = await Promise.all([
    svc
      .from("leads")
      .select("status, budget_range, timeline, selected_style")
      .order("created_at", { ascending: false })
      .limit(2000),
    svc
      .from("contractors")
      .select("id, company_name, contact_name, active, service_zip_codes")
      .order("company_name", { ascending: true }),
  ]);
  if (leadRes.error) throw new Error(leadRes.error.message);
  if (contractorRes.error) throw new Error(contractorRes.error.message);

  const statuses = Array.from(new Set((leadRes.data ?? []).map((r) => asText(r.status)).filter(Boolean))).sort();
  const budgets = Array.from(new Set((leadRes.data ?? []).map((r) => asText(r.budget_range)).filter(Boolean))).sort();
  const timelines = Array.from(new Set((leadRes.data ?? []).map((r) => asText(r.timeline)).filter(Boolean))).sort();
  const styles = Array.from(new Set((leadRes.data ?? []).map((r) => asText(r.selected_style)).filter(Boolean))).sort();
  const contractors = (contractorRes.data ?? []).map((c) => ({
    id: c.id,
    name: asText(c.company_name) || asText(c.contact_name) || c.id,
    active: Boolean(c.active),
    serviceZipCodes: Array.isArray(c.service_zip_codes) ? c.service_zip_codes.map((z) => asText(z)).filter(Boolean) : [],
  }));

  return { statuses, budgets, timelines, styles, contractors };
}

export function buildLeadShareSummary(input: {
  homeownerName: string;
  zipCode: string;
  timeline: string;
  budgetRange: string;
  projectNotes: string;
  selectedStyle: string;
  estimateLow: number | null;
  estimateExpected: number | null;
  estimateHigh: number | null;
  uploadedImageUrl: string | null;
  generatedImageUrl: string | null;
  scopeOfWork: unknown;
}): string {
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const scopePreview = (() => {
    try {
      const text = JSON.stringify(input.scopeOfWork ?? {});
      return text.length > 420 ? `${text.slice(0, 420)}...` : text;
    } catch {
      return "—";
    }
  })();
  return [
    "Lead Share Summary",
    `Homeowner: ${input.homeownerName || "—"}`,
    `ZIP Code: ${input.zipCode || "—"}`,
    `Timeline: ${input.timeline || "—"}`,
    `Budget Range: ${input.budgetRange || "—"}`,
    `Selected Style: ${input.selectedStyle || "—"}`,
    `Estimate (L/E/H): ${input.estimateLow != null ? usd.format(input.estimateLow) : "—"} / ${
      input.estimateExpected != null ? usd.format(input.estimateExpected) : "—"
    } / ${input.estimateHigh != null ? usd.format(input.estimateHigh) : "—"}`,
    `Project Notes: ${input.projectNotes || "—"}`,
    `Uploaded Image: ${input.uploadedImageUrl || "—"}`,
    `Generated Image: ${input.generatedImageUrl || "—"}`,
    `Scope Summary: ${scopePreview}`,
  ].join("\n");
}

export async function fetchAdminLeads(params: LeadFilterParams): Promise<AdminLeadListItem[]> {
  noStore();
  const svc = createServiceClient();
  let query = svc
    .from("leads")
    .select(
      "id, created_at, first_name, last_name, name, email, phone, zip_code, timeline, budget_range, selected_style, generated_image_url, estimate_low, estimate_expected, estimate_high, estimate_min, estimate_max, status, assigned_contractor_id",
    )
    .order("created_at", { ascending: false })
    .limit(1200);

  if (asText(params.status) && params.status !== "all") query = query.eq("status", params.status);
  if (params.start) query = query.gte("created_at", `${params.start}T00:00:00.000Z`);
  if (params.end) query = query.lte("created_at", `${params.end}T23:59:59.999Z`);
  if (asText(params.zip)) query = query.ilike("zip_code", `%${asText(params.zip)}%`);
  if (asText(params.budget) && params.budget !== "all") query = query.eq("budget_range", params.budget);
  if (asText(params.timeline) && params.timeline !== "all") query = query.eq("timeline", params.timeline);
  if (asText(params.style) && params.style !== "all") query = query.eq("selected_style", params.style);
  if (params.assigned === "assigned") query = query.not("assigned_contractor_id", "is", null);
  if (params.assigned === "unassigned") query = query.is("assigned_contractor_id", null);
  if (asText(params.contractorId) && params.contractorId !== "all") query = query.eq("assigned_contractor_id", params.contractorId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LeadRow[];

  const q = asText(params.q).toLowerCase();
  const searched = q
    ? rows.filter((row) => {
        const hay = [fullName(row), asText(row.email), asText(row.phone)].join(" ").toLowerCase();
        return hay.includes(q);
      })
    : rows;

  const contractorIds = Array.from(new Set(searched.map((r) => asText(r.assigned_contractor_id)).filter(Boolean)));
  const contractorById = new Map<string, string>();
  if (contractorIds.length) {
    const { data: contractors, error: cErr } = await svc
      .from("contractors")
      .select("id, company_name, contact_name")
      .in("id", contractorIds);
    if (cErr) throw new Error(cErr.message);
    for (const c of (contractors ?? []) as ContractorRow[]) {
      contractorById.set(c.id, asText(c.company_name) || asText(c.contact_name) || c.id);
    }
  }

  const imagePaths = searched.map((r) => asText(r.generated_image_url)).filter(Boolean);
  const signedMap = await signPathsBatch(imagePaths);

  return searched
    .map((row) => {
      const low = asNumber(row.estimate_low ?? row.estimate_min);
      const high = asNumber(row.estimate_high ?? row.estimate_max);
      const expected = asNumber(row.estimate_expected) ?? (low != null && high != null ? Math.round((low + high) / 2) : null);
      const contractorId = asText(row.assigned_contractor_id);
      const imageRaw = asText(row.generated_image_url);
      return {
        id: row.id,
        createdAt: row.created_at,
        name: fullName(row),
        zipCode: asText(row.zip_code),
        timeline: asText(row.timeline),
        budgetRange: asText(row.budget_range),
        selectedStyle: asText(row.selected_style),
        estimateLow: low,
        estimateExpected: expected,
        estimateHigh: high,
        status: asText(row.status) || "new",
        assignedContractorName: contractorId ? contractorById.get(contractorId) ?? "Unknown contractor" : "Unassigned",
        generatedThumbUrl: imageRaw ? signedMap.get(imageRaw) ?? null : null,
      };
    })
    .sort((a, b) => {
      const rankDelta = statusRank(a.status) - statusRank(b.status);
      if (rankDelta !== 0) return rankDelta;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export async function fetchAdminLeadDetail(leadId: string): Promise<AdminLeadDetail | null> {
  noStore();
  const id = asText(leadId);
  if (!id) return null;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("leads")
    .select(
      "id, created_at, generation_id, session_id, first_name, last_name, name, email, phone, street_address, zip_code, timeline, budget_range, project_notes, selected_style, uploaded_image_url, generated_image_url, estimate_low, estimate_expected, estimate_high, estimate_min, estimate_max, scope_of_work, contractor_notes, status, assigned_contractor_id, metadata",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as LeadRow;

  const [assignedContractor, assignmentsRes, uploadedImageUrl, generatedImageUrl] = await Promise.all([
    row.assigned_contractor_id
      ? svc
          .from("contractors")
          .select("id, company_name, contact_name")
          .eq("id", row.assigned_contractor_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    svc
      .from("lead_assignments")
      .select("id, created_at, contractor_id, shared_by, shared_at, status, contractor_viewed_at, contractor_response, notes")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    signPath(row.uploaded_image_url),
    signPath(row.generated_image_url),
  ]);
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);

  const contractorIds = Array.from(
    new Set(((assignmentsRes.data ?? []) as AssignmentRow[]).map((a) => asText(a.contractor_id)).filter(Boolean)),
  );
  const contractorById = new Map<string, string>();
  if (contractorIds.length) {
    const { data: contractors } = await svc.from("contractors").select("id, company_name, contact_name").in("id", contractorIds);
    for (const c of (contractors ?? []) as ContractorRow[]) {
      contractorById.set(c.id, asText(c.company_name) || asText(c.contact_name) || c.id);
    }
  }

  const low = asNumber(row.estimate_low ?? row.estimate_min);
  const high = asNumber(row.estimate_high ?? row.estimate_max);
  const expected = asNumber(row.estimate_expected) ?? (low != null && high != null ? Math.round((low + high) / 2) : null);
  const sessionId = asText(row.session_id);
  const analyticsTimeline = sessionId ? await fetchAdminAnalyticsSessionDetail(sessionId) : null;

  return {
    id: row.id,
    createdAt: row.created_at,
    status: asText(row.status) || "new",
    name: fullName(row),
    firstName: asText(row.first_name),
    lastName: asText(row.last_name),
    email: asText(row.email),
    phone: asText(row.phone),
    streetAddress: asText(row.street_address),
    zipCode: asText(row.zip_code),
    timeline: asText(row.timeline),
    budgetRange: asText(row.budget_range),
    notes: asText(row.project_notes),
    selectedStyle: asText(row.selected_style),
    estimateLow: low,
    estimateExpected: expected,
    estimateHigh: high,
    uploadedImageUrl,
    generatedImageUrl,
    scopeOfWork: row.scope_of_work,
    contractorNotes: asText(row.contractor_notes),
    generationId: asText(row.generation_id) || null,
    sessionId: sessionId || "—",
    assignedContractorId: asText(row.assigned_contractor_id) || null,
    assignedContractorName:
      assignedContractor.data && typeof assignedContractor.data === "object"
        ? asText((assignedContractor.data as ContractorRow).company_name) ||
          asText((assignedContractor.data as ContractorRow).contact_name) ||
          "Assigned"
        : "Unassigned",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    analyticsTimeline,
    assignmentHistory: ((assignmentsRes.data ?? []) as AssignmentRow[]).map((a) => ({
      id: a.id,
      createdAt: a.created_at,
      contractorName: contractorById.get(a.contractor_id) ?? a.contractor_id,
      status: a.status,
      sharedAt: a.shared_at,
      viewedAt: a.contractor_viewed_at,
      contractorResponse: a.contractor_response,
      notes: a.notes,
    })),
  };
}
