import { unstable_noStore as noStore } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

type ContractorRow = {
  id: string;
  created_at: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  active: boolean | null;
  service_zip_codes: string[] | null;
  notes: string | null;
};

type LeadAssignmentRow = {
  id: string;
  created_at: string;
  lead_id: string;
  contractor_id: string;
  shared_at: string | null;
  status: string;
  contractor_viewed_at: string | null;
  contractor_response: string | null;
  notes: string | null;
};

export type AdminContractorListItem = {
  id: string;
  createdAt: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  active: boolean;
  serviceZipCodes: string[];
  leadsShared: number;
  leadsAccepted: number;
  lastSharedDate: string | null;
};

export type AdminContractorDetail = {
  id: string;
  createdAt: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  active: boolean;
  serviceZipCodes: string[];
  notes: string;
  assignedOrSharedLeads: Array<{
    assignmentId: string;
    leadId: string;
    leadName: string;
    leadStatus: string;
    sharedAt: string | null;
    assignmentStatus: string;
  }>;
  leadResponseHistory: Array<{
    assignmentId: string;
    createdAt: string;
    assignmentStatus: string;
    viewedAt: string | null;
    contractorResponse: string | null;
    notes: string | null;
  }>;
};

function asText(v: unknown): string {
  return String(v ?? "").trim();
}

export function parseZipCodesInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((z) => z.trim())
        .filter(Boolean),
    ),
  );
}

export async function fetchAdminContractorAccounts(): Promise<AdminContractorListItem[]> {
  noStore();
  const svc = createServiceClient();
  const [contractorsRes, assignmentsRes] = await Promise.all([
    svc
      .from("contractors")
      .select("id, created_at, company_name, contact_name, email, phone, active, service_zip_codes, notes")
      .order("created_at", { ascending: false }),
    svc
      .from("lead_assignments")
      .select("id, contractor_id, shared_at, status")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);
  if (contractorsRes.error) throw new Error(contractorsRes.error.message);
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);

  const assignments = (assignmentsRes.data ?? []) as Array<
    Pick<LeadAssignmentRow, "id" | "contractor_id" | "shared_at" | "status">
  >;
  const byContractor = new Map<
    string,
    { shared: number; accepted: number; lastSharedAt: string | null }
  >();
  for (const assignment of assignments) {
    const cid = asText(assignment.contractor_id);
    if (!cid) continue;
    const prev = byContractor.get(cid) ?? { shared: 0, accepted: 0, lastSharedAt: null };
    const nextShared = prev.shared + 1;
    const nextAccepted = prev.accepted + (assignment.status === "accepted" ? 1 : 0);
    const lastSharedAt =
      !prev.lastSharedAt || (assignment.shared_at && new Date(assignment.shared_at) > new Date(prev.lastSharedAt))
        ? assignment.shared_at ?? prev.lastSharedAt
        : prev.lastSharedAt;
    byContractor.set(cid, { shared: nextShared, accepted: nextAccepted, lastSharedAt });
  }

  return ((contractorsRes.data ?? []) as ContractorRow[]).map((c) => {
    const metric = byContractor.get(c.id) ?? { shared: 0, accepted: 0, lastSharedAt: null };
    return {
      id: c.id,
      createdAt: c.created_at,
      companyName: asText(c.company_name),
      contactName: asText(c.contact_name),
      email: asText(c.email),
      phone: asText(c.phone),
      active: Boolean(c.active),
      serviceZipCodes: Array.isArray(c.service_zip_codes) ? c.service_zip_codes.map((z) => asText(z)).filter(Boolean) : [],
      leadsShared: metric.shared,
      leadsAccepted: metric.accepted,
      lastSharedDate: metric.lastSharedAt,
    };
  });
}

export async function fetchAdminContractorDetail(contractorId: string): Promise<AdminContractorDetail | null> {
  noStore();
  const id = asText(contractorId);
  if (!id) return null;
  const svc = createServiceClient();
  const [contractorRes, assignmentsRes] = await Promise.all([
    svc
      .from("contractors")
      .select("id, created_at, company_name, contact_name, email, phone, active, service_zip_codes, notes")
      .eq("id", id)
      .maybeSingle(),
    svc
      .from("lead_assignments")
      .select("id, created_at, lead_id, contractor_id, shared_at, status, contractor_viewed_at, contractor_response, notes")
      .eq("contractor_id", id)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  if (contractorRes.error) throw new Error(contractorRes.error.message);
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);
  if (!contractorRes.data) return null;

  const assignments = (assignmentsRes.data ?? []) as LeadAssignmentRow[];
  const leadIds = Array.from(new Set(assignments.map((a) => a.lead_id).filter(Boolean)));
  const leadById = new Map<string, { name: string; status: string }>();
  if (leadIds.length) {
    const { data: leads, error: leadErr } = await svc
      .from("leads")
      .select("id, first_name, last_name, name, status")
      .in("id", leadIds);
    if (leadErr) throw new Error(leadErr.message);
    for (const lead of leads ?? []) {
      const first = asText(lead.first_name);
      const last = asText(lead.last_name);
      const name = [first, last].filter(Boolean).join(" ") || asText(lead.name) || "Unknown";
      leadById.set(asText(lead.id), { name, status: asText(lead.status) || "new" });
    }
  }

  const contractor = contractorRes.data as ContractorRow;
  return {
    id: contractor.id,
    createdAt: contractor.created_at,
    companyName: asText(contractor.company_name),
    contactName: asText(contractor.contact_name),
    email: asText(contractor.email),
    phone: asText(contractor.phone),
    active: Boolean(contractor.active),
    serviceZipCodes: Array.isArray(contractor.service_zip_codes)
      ? contractor.service_zip_codes.map((z) => asText(z)).filter(Boolean)
      : [],
    notes: asText(contractor.notes),
    assignedOrSharedLeads: assignments.map((a) => ({
      assignmentId: a.id,
      leadId: a.lead_id,
      leadName: leadById.get(a.lead_id)?.name ?? "Unknown",
      leadStatus: leadById.get(a.lead_id)?.status ?? "—",
      sharedAt: a.shared_at,
      assignmentStatus: a.status,
    })),
    leadResponseHistory: assignments.map((a) => ({
      assignmentId: a.id,
      createdAt: a.created_at,
      assignmentStatus: a.status,
      viewedAt: a.contractor_viewed_at,
      contractorResponse: a.contractor_response,
      notes: a.notes,
    })),
  };
}
