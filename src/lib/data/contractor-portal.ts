import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import { createServiceClient } from "@/lib/supabase/service";

type ContractorRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  active: boolean | null;
  user_id: string | null;
};

type AssignmentListRow = {
  id: string;
  created_at: string;
  lead_id: string;
  shared_at: string | null;
  status: string;
  contractor_viewed_at: string | null;
  contractor_response: string | null;
  notes: string | null;
};

type LeadRow = {
  id: string;
  zip_code: string | null;
  timeline: string | null;
  budget_range: string | null;
  selected_style: string | null;
  generated_image_url: string | null;
};

type LeadDetailRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  zip_code: string | null;
  timeline: string | null;
  budget_range: string | null;
  project_notes: string | null;
  selected_style: string | null;
  generated_image_url: string | null;
  uploaded_image_url: string | null;
  estimate_low: number | null;
  estimate_expected: number | null;
  estimate_high: number | null;
  estimate_min: number | null;
  estimate_max: number | null;
  scope_of_work: unknown;
  contractor_notes: string | null;
};

function asText(v: unknown): string {
  return String(v ?? "").trim();
}

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeStoragePath(value: string): string {
  const v = value.trim().replace(/^\//, "");
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

export async function requireContractorContext() {
  noStore();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/contractor");

  const svc = createServiceClient();
  const { data: contractor, error } = await svc
    .from("contractors")
    .select("id, company_name, contact_name, email, phone, active, user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !contractor) redirect("/dashboard");
  if (!contractor.active) redirect("/dashboard");
  return {
    userId: user.id,
    userEmail: user.email ?? "",
    contractor: contractor as ContractorRow,
  };
}

export function contractorCanSeeContactBeforeAccepted(): boolean {
  return process.env.CONTRACTOR_PORTAL_SHOW_HOMEOWNER_CONTACT_BEFORE_ACCEPTED === "1";
}

export function contractorCanSeeUploadedImageBeforeAccepted(): boolean {
  return process.env.CONTRACTOR_PORTAL_SHOW_UPLOADED_IMAGE_BEFORE_ACCEPTED === "1";
}

export async function fetchContractorLeadAssignments(contractorId: string) {
  noStore();
  const svc = createServiceClient();
  const { data: assignments, error } = await svc
    .from("lead_assignments")
    .select("id, created_at, lead_id, shared_at, status, contractor_viewed_at, contractor_response, notes")
    .eq("contractor_id", contractorId)
    .order("shared_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const rows = (assignments ?? []) as AssignmentListRow[];
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id)));
  const leadMap = new Map<string, LeadRow>();
  if (leadIds.length) {
    const { data: leads, error: leadsErr } = await svc
      .from("leads")
      .select("id, zip_code, timeline, budget_range, selected_style, generated_image_url")
      .in("id", leadIds);
    if (leadsErr) throw new Error(leadsErr.message);
    for (const lead of (leads ?? []) as LeadRow[]) leadMap.set(lead.id, lead);
  }

  const signedMap = new Map<string, string | null>();
  for (const row of rows) {
    const lead = leadMap.get(row.lead_id);
    const path = asText(lead?.generated_image_url);
    if (!path) continue;
    if (!signedMap.has(path)) signedMap.set(path, await signPath(path));
  }

  return rows.map((row) => {
    const lead = leadMap.get(row.lead_id);
    const path = asText(lead?.generated_image_url);
    return {
      assignmentId: row.id,
      leadId: row.lead_id,
      sharedAt: row.shared_at ?? row.created_at,
      zipCode: asText(lead?.zip_code),
      timeline: asText(lead?.timeline),
      budgetRange: asText(lead?.budget_range),
      selectedStyle: asText(lead?.selected_style),
      generatedImageUrl: path ? (signedMap.get(path) ?? null) : null,
      assignmentStatus: row.status,
    };
  });
}

export async function fetchContractorLeadAssignmentDetail(contractorId: string, assignmentId: string) {
  noStore();
  const svc = createServiceClient();
  const { data: assignment, error } = await svc
    .from("lead_assignments")
    .select("id, created_at, lead_id, shared_at, status, contractor_viewed_at, contractor_response, notes")
    .eq("id", assignmentId)
    .eq("contractor_id", contractorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!assignment) return null;

  const { data: lead, error: leadErr } = await svc
    .from("leads")
    .select(
      "id, name, first_name, last_name, email, phone, zip_code, timeline, budget_range, project_notes, selected_style, generated_image_url, uploaded_image_url, estimate_low, estimate_expected, estimate_high, estimate_min, estimate_max, scope_of_work, contractor_notes",
    )
    .eq("id", assignment.lead_id)
    .maybeSingle();
  if (leadErr) throw new Error(leadErr.message);
  if (!lead) return null;
  const leadRow = lead as LeadDetailRow;

  const isAccepted = assignment.status === "accepted";
  const showContact = isAccepted || contractorCanSeeContactBeforeAccepted();
  const showUploadedImage = isAccepted || contractorCanSeeUploadedImageBeforeAccepted();

  const generatedImageUrl = await signPath(leadRow.generated_image_url);
  const uploadedImageUrl = showUploadedImage ? await signPath(leadRow.uploaded_image_url) : null;

  const fullName =
    [asText(leadRow.first_name), asText(leadRow.last_name)].filter(Boolean).join(" ") || asText(leadRow.name) || "Homeowner";
  const estimateLow = asNumber(leadRow.estimate_low ?? leadRow.estimate_min);
  const estimateHigh = asNumber(leadRow.estimate_high ?? leadRow.estimate_max);
  const estimateExpected =
    asNumber(leadRow.estimate_expected) ??
    (estimateLow != null && estimateHigh != null ? Math.round((estimateLow + estimateHigh) / 2) : null);

  return {
    assignmentId: assignment.id,
    leadId: assignment.lead_id,
    sharedAt: assignment.shared_at ?? assignment.created_at,
    assignmentStatus: assignment.status,
    contractorViewedAt: assignment.contractor_viewed_at,
    contractorResponse: asText(assignment.contractor_response),
    assignmentNote: asText(assignment.notes),
    projectSummary: `${asText(leadRow.selected_style) || "Remodel"} project in ${asText(leadRow.zip_code) || "local area"}`,
    zipCode: asText(leadRow.zip_code),
    timeline: asText(leadRow.timeline),
    budgetRange: asText(leadRow.budget_range),
    projectNotes: asText(leadRow.project_notes),
    selectedStyle: asText(leadRow.selected_style),
    generatedImageUrl,
    uploadedImageUrl,
    estimateLow,
    estimateExpected,
    estimateHigh,
    scopeOfWork: leadRow.scope_of_work,
    contractorNotes: asText(leadRow.contractor_notes),
    homeowner: showContact
      ? {
          name: fullName,
          email: asText(leadRow.email),
          phone: asText(leadRow.phone),
        }
      : null,
    contactHidden: !showContact,
  };
}
