import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { createServiceClient } from "@/lib/supabase/service";

type EstimateSplit = {
  materials: { min: number; max: number };
  labor: { min: number; max: number };
  fixtures: { min: number; max: number };
};

type EstimateLine = {
  category: string;
  min: number;
  max: number;
  reason: string;
};

export type AdminContractorLeadListRow = {
  leadId: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  zipCode: string;
  timeline: string;
  budgetRange: string;
  preferredContactMethod: string;
  bestContactTime: string;
  selectedStyle: string;
  estimateMin: number;
  estimateMax: number;
  projectId: string | null;
  generationId: string | null;
};

export type AdminContractorLeadDetail = {
  leadId: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  zipCode: string;
  timeline: string;
  budgetRange: string;
  preferredContactMethod: string;
  bestContactTime: string;
  notes: string;
  selectedStyle: string;
  estimateMin: number;
  estimateMax: number;
  estimateConfidence: string;
  estimateBreakdown: EstimateSplit | null;
  estimateDetailedBreakdown: EstimateLine[];
  estimateReasoning: string[];
  estimateAssumptions: string[];
  projectId: string | null;
  generationId: string | null;
  originalImageUrl: string | null;
  latestImageUrl: string | null;
  latestVersionLabel: string | null;
};

function asText(v: unknown): string {
  return String(v ?? "").trim();
}

function asNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function parseEstimateSplit(v: unknown): EstimateSplit | null {
  if (!v || typeof v !== "object") return null;
  const row = v as Record<string, unknown>;
  if (!row.materials || !row.labor || !row.fixtures) return null;
  const materials = row.materials as Record<string, unknown>;
  const labor = row.labor as Record<string, unknown>;
  const fixtures = row.fixtures as Record<string, unknown>;
  return {
    materials: { min: asNumber(materials.min), max: asNumber(materials.max) },
    labor: { min: asNumber(labor.min), max: asNumber(labor.max) },
    fixtures: { min: asNumber(fixtures.min), max: asNumber(fixtures.max) },
  };
}

function parseEstimateLines(v: unknown): EstimateLine[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
    .map((x) => ({
      category: asText(x.category),
      min: asNumber(x.min),
      max: asNumber(x.max),
      reason: asText(x.reason),
    }))
    .filter((x) => x.category);
}

async function signPath(path: string | null): Promise<string | null> {
  if (!path) return null;
  const svc = createServiceClient();
  const { data } = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(path, 60 * 60 * 4);
  return data?.signedUrl ?? null;
}

export async function fetchAdminContractorLeads(search: string): Promise<AdminContractorLeadListRow[]> {
  const svc = createServiceClient();
  const { data: leads, error } = await svc
    .from("leads")
    .select(
      "id, created_at, first_name, last_name, name, email, phone, zip_code, timeline, budget_range, preferred_contact_method, best_contact_time, selected_style, estimate_min, estimate_max, generation_id",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const generationIds = [...new Set((leads ?? []).map((l) => asText(l.generation_id)).filter(Boolean))];
  const { data: generations, error: gErr } = generationIds.length
    ? await svc.from("bathroom_generations").select("id, project_id").in("id", generationIds)
    : { data: [], error: null };
  if (gErr) throw new Error(gErr.message);

  const projectIdByGeneration = new Map((generations ?? []).map((g) => [asText(g.id), asText(g.project_id)]));

  const rows: AdminContractorLeadListRow[] = (leads ?? []).map((l) => {
    const firstName = asText(l.first_name);
    const lastName = asText(l.last_name);
    const fallbackName = asText(l.name);
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || fallbackName || "Unknown";
    const generationId = asText(l.generation_id) || null;
    const projectId = generationId ? projectIdByGeneration.get(generationId) || null : null;
    return {
      leadId: asText(l.id),
      createdAt: asText(l.created_at),
      firstName: firstName || fallbackName.split(" ")[0] || "",
      lastName: lastName,
      fullName,
      email: asText(l.email),
      phone: asText(l.phone),
      zipCode: asText(l.zip_code),
      timeline: asText(l.timeline),
      budgetRange: asText(l.budget_range),
      preferredContactMethod: asText(l.preferred_contact_method),
      bestContactTime: asText(l.best_contact_time),
      selectedStyle: asText(l.selected_style),
      estimateMin: asNumber(l.estimate_min),
      estimateMax: asNumber(l.estimate_max),
      projectId,
      generationId,
    };
  });

  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const haystack = [
      r.leadId,
      r.firstName,
      r.lastName,
      r.fullName,
      r.email,
      r.phone,
      r.zipCode,
      r.projectId ?? "",
      r.generationId ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export async function fetchAdminContractorLeadDetail(leadId: string): Promise<AdminContractorLeadDetail | null> {
  const svc = createServiceClient();
  const id = leadId.trim();
  if (!id) return null;

  const { data: lead, error } = await svc
    .from("leads")
    .select(
      "id, created_at, generation_id, first_name, last_name, name, email, phone, zip_code, timeline, budget_range, preferred_contact_method, best_contact_time, project_notes, selected_style, estimate_min, estimate_max, estimate_breakdown, estimate_detailed_breakdown, estimate_reasoning, estimate_assumptions, estimate_confidence",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) return null;

  const generationId = asText(lead.generation_id) || null;
  let projectId: string | null = null;
  let generatedImagePath: string | null = null;
  if (generationId) {
    const { data: generation } = await svc
      .from("bathroom_generations")
      .select("project_id, generated_image_url")
      .eq("id", generationId)
      .maybeSingle();
    projectId = asText(generation?.project_id) || null;
    generatedImagePath = asText(generation?.generated_image_url) || null;
  }

  let originalImagePath: string | null = null;
  let latestImagePath: string | null = generatedImagePath;
  let latestVersionLabel: string | null = null;

  if (projectId) {
    const { data: project } = await svc
      .from("homeowner_try_projects")
      .select("before_storage_path")
      .eq("id", projectId)
      .maybeSingle();
    originalImagePath = asText(project?.before_storage_path) || null;

    const { data: latestMockup } = await svc
      .from("homeowner_try_mockups")
      .select("storage_path, mockup_generation")
      .eq("project_id", projectId)
      .order("mockup_generation", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestMockup?.storage_path) {
      latestImagePath = asText(latestMockup.storage_path);
      latestVersionLabel = `v${asNumber(latestMockup.mockup_generation)}`;
    }
  }

  const [originalImageUrl, latestImageUrl] = await Promise.all([
    signPath(originalImagePath),
    signPath(latestImagePath),
  ]);

  const firstName = asText(lead.first_name);
  const lastName = asText(lead.last_name);
  const fallbackName = asText(lead.name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || fallbackName || "Unknown";

  return {
    leadId: asText(lead.id),
    createdAt: asText(lead.created_at),
    firstName: firstName || fallbackName.split(" ")[0] || "",
    lastName,
    fullName,
    email: asText(lead.email),
    phone: asText(lead.phone),
    zipCode: asText(lead.zip_code),
    timeline: asText(lead.timeline),
    budgetRange: asText(lead.budget_range),
    preferredContactMethod: asText(lead.preferred_contact_method),
    bestContactTime: asText(lead.best_contact_time),
    notes: asText(lead.project_notes),
    selectedStyle: asText(lead.selected_style),
    estimateMin: asNumber(lead.estimate_min),
    estimateMax: asNumber(lead.estimate_max),
    estimateConfidence: asText(lead.estimate_confidence),
    estimateBreakdown: parseEstimateSplit(lead.estimate_breakdown),
    estimateDetailedBreakdown: parseEstimateLines(lead.estimate_detailed_breakdown),
    estimateReasoning: asStringArray(lead.estimate_reasoning),
    estimateAssumptions: asStringArray(lead.estimate_assumptions),
    projectId,
    generationId,
    originalImageUrl,
    latestImageUrl,
    latestVersionLabel,
  };
}
