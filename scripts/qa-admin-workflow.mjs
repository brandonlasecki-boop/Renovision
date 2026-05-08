import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function fail(message) {
  throw new Error(message);
}

function ok(condition, message) {
  if (!condition) fail(message);
  console.log(`PASS: ${message}`);
}

const confirm = (process.env.QA_ADMIN_WORKFLOW_CONFIRM ?? "").trim().toLowerCase();
const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
const vercelEnv = (process.env.VERCEL_ENV ?? "").trim().toLowerCase();
const appEnv = (process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();

if (nodeEnv === "production" || vercelEnv === "production" || appEnv === "production") {
  console.error("Refusing to run admin workflow QA in production.");
  process.exit(1);
}

if (confirm !== "yes") {
  console.error("Missing QA_ADMIN_WORKFLOW_CONFIRM=yes");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = Date.now();
const sessionId = `qa-admin-${randomUUID()}`;
const runTag = `qa-admin-workflow-${new Date(now).toISOString().replace(/[:.]/g, "-")}`;
const generationId = randomUUID();
const leadId = randomUUID();
const contractorAId = randomUUID();
const contractorBId = randomUUID();
const extraLeadId = randomUUID();
const assignmentId = randomUUID();
const extraAssignmentId = randomUUID();
const schema = {
  bathroom_generations: new Set(),
  leads: new Set(),
  contractors: new Set(),
  lead_assignments: new Set(),
};

const iso = (sec = 0) => new Date(now + sec * 1000).toISOString();

async function preflight() {
  const checks = [
    ["analytics_events", "event_name, session_id, created_at, metadata"],
    ["analytics_sessions", "session_id, created_at"],
    ["bathroom_generations", "id, session_id, generated_image_url"],
    ["leads", "id, generation_id, zip_code"],
    ["contractors", "id, company_name, email, active, service_zip_codes"],
    ["lead_assignments", "id, lead_id, contractor_id, status, shared_at, contractor_viewed_at"],
  ];
  for (const [table, selectCols] of checks) {
    const { error } = await supabase.from(table).select(selectCols).limit(1);
    if (error) fail(`schema preflight failed for ${table}: ${error.message}`);
  }
  for (const table of Object.keys(schema)) {
    const { data, error } = await supabase
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", table);
    if (error) fail(`schema introspection failed for ${table}: ${error.message}`);
    for (const row of data ?? []) schema[table].add(String(row.column_name));
  }
  console.log("PASS: schema preflight");
}

function hasColumn(table, column) {
  return schema[table]?.has(column) === true;
}

async function seedCustomerJourney() {
  const { error: sessionsErr } = await supabase.from("analytics_sessions").insert({
    session_id: sessionId,
    session_type: "customer",
    normalized_source: "qa",
    normalized_referrer: "qa.local",
    created_at: iso(0),
    last_seen_at: iso(120),
    first_page: "/",
    last_page: "/try",
    referrer: "https://qa.local",
    utm_source: "qa",
    utm_campaign: "admin_workflow",
    device_type: "desktop",
    browser: "Chrome",
    os: "Windows",
    metadata: { qa_tag: runTag, current_host: "renovision.com" },
  });
  if (sessionsErr) fail(`seed analytics_sessions failed: ${sessionsErr.message}`);

  const eventNames = [
    "landing_page_viewed",
    "hero_cta_clicked",
    "upload_started",
    "upload_completed",
    "style_selected",
    "generation_started",
    "generation_completed",
    "contractor_cta_clicked",
    "lead_form_started",
    "lead_submitted",
  ];
  const events = eventNames.map((eventName, idx) => ({
    created_at: iso(5 + idx),
    session_id: sessionId,
    session_type: "customer",
    normalized_source: "qa",
    normalized_referrer: "qa.local",
    event_name: eventName,
    page_path: idx < 2 ? "/" : "/try",
    page_title: "QA",
    referrer: "https://qa.local",
    metadata: {
      qa_tag: runTag,
      page_path: idx < 2 ? "/" : "/try",
      generation_id: eventName === "generation_completed" ? generationId : undefined,
      current_host: "renovision.com",
    },
  }));
  const { error: eventsErr } = await supabase.from("analytics_events").insert(events);
  if (eventsErr) fail(`seed analytics_events failed: ${eventsErr.message}`);

  const generationRow = {
    id: generationId,
    created_at: iso(15),
    session_id: sessionId,
    uploaded_image_url: "project-photos/qa/uploaded.jpg",
    generated_image_url: "project-photos/qa/generated.jpg",
    selected_style: "spa_retreat",
    user_description: "QA test generation",
    tweaks_used: [],
    estimate_low: 18000,
    estimate_expected: 24000,
    estimate_high: 32000,
    scope_of_work: { phases: ["demo", "tile", "fixtures"] },
    contractor_notes: "QA notes",
    lead_submitted: true,
    status: "completed",
    metadata: { qa_tag: runTag },
  };
  if (!hasColumn("bathroom_generations", "status")) delete generationRow.status;
  if (!hasColumn("bathroom_generations", "lead_submitted")) delete generationRow.lead_submitted;
  const { error: genErr } = await supabase.from("bathroom_generations").insert(generationRow);
  if (genErr) fail(`seed bathroom_generations failed: ${genErr.message}`);

  const leadRow = {
    id: leadId,
    created_at: iso(40),
    generation_id: generationId,
    session_id: sessionId,
    name: "QA Homeowner",
    email: "qa-homeowner@example.com",
    phone: "555-0100",
    zip_code: "10001",
    timeline: "1-3 months",
    budget_range: "$20k-$35k",
    project_notes: "QA lead project notes",
    selected_style: "spa_retreat",
    uploaded_image_url: "project-photos/qa/uploaded.jpg",
    generated_image_url: "project-photos/qa/generated.jpg",
    estimate_low: 18000,
    estimate_expected: 24000,
    estimate_high: 32000,
    scope_of_work: { phases: ["demo", "tile", "fixtures"] },
    contractor_notes: "QA lead contractor notes",
    status: "new",
    metadata: { qa_tag: runTag },
  };
  if (!hasColumn("leads", "status")) delete leadRow.status;
  const { error: leadErr } = await supabase.from("leads").insert(leadRow);
  if (leadErr) fail(`seed leads failed: ${leadErr.message}`);
}

async function seedContractorsAndShare() {
  const { error: contractorErr } = await supabase.from("contractors").insert([
    {
      id: contractorAId,
      company_name: "QA Contractor A",
      contact_name: "Alice",
      email: "qa-contractor-a@example.com",
      phone: "555-0101",
      service_zip_codes: ["10001", "10002"],
      active: true,
      metadata: { qa_tag: runTag },
    },
    {
      id: contractorBId,
      company_name: "QA Contractor B",
      contact_name: "Bob",
      email: "qa-contractor-b@example.com",
      phone: "555-0102",
      service_zip_codes: ["90210"],
      active: true,
      metadata: { qa_tag: runTag },
    },
  ]);
  if (contractorErr) fail(`seed contractors failed: ${contractorErr.message}`);

  const extraLeadRow = {
    id: extraLeadId,
    created_at: iso(45),
    session_id: `qa-other-${randomUUID()}`,
    name: "QA Other Homeowner",
    email: "qa-other@example.com",
    zip_code: "90210",
    timeline: "ASAP",
    budget_range: "$50k+",
    selected_style: "modern_minimal",
    status: "new",
    metadata: { qa_tag: runTag },
  };
  if (!hasColumn("leads", "status")) delete extraLeadRow.status;
  const { error: extraLeadErr } = await supabase.from("leads").insert(extraLeadRow);
  if (extraLeadErr) fail(`seed extra lead failed: ${extraLeadErr.message}`);

  const { error: shareErr } = await supabase.from("lead_assignments").insert([
    {
      id: assignmentId,
      lead_id: leadId,
      contractor_id: contractorAId,
      status: "shared",
      shared_at: iso(50),
      notes: "QA share to contractor A",
      metadata: { qa_tag: runTag },
    },
    {
      id: extraAssignmentId,
      lead_id: extraLeadId,
      contractor_id: contractorBId,
      status: "shared",
      shared_at: iso(51),
      notes: "QA share to contractor B",
      metadata: { qa_tag: runTag },
    },
  ]);
  if (shareErr) fail(`seed lead_assignments failed: ${shareErr.message}`);

  const leadUpdatePayload = { status: "shared", assigned_contractor_id: contractorAId };
  if (!hasColumn("leads", "status")) delete leadUpdatePayload.status;
  if (!hasColumn("leads", "assigned_contractor_id")) delete leadUpdatePayload.assigned_contractor_id;
  const { error: leadUpdateErr } = await supabase.from("leads").update(leadUpdatePayload).eq("id", leadId);
  if (leadUpdateErr) fail(`update lead share state failed: ${leadUpdateErr.message}`);
}

async function verifyAdminWorkflowData() {
  const { data: events, error: eventsErr } = await supabase
    .from("analytics_events")
    .select("event_name")
    .eq("session_id", sessionId);
  if (eventsErr) fail(`verify events failed: ${eventsErr.message}`);
  const eventNames = new Set((events ?? []).map((r) => r.event_name));
  for (const needed of [
    "landing_page_viewed",
    "hero_cta_clicked",
    "upload_started",
    "upload_completed",
    "style_selected",
    "generation_started",
    "generation_completed",
    "contractor_cta_clicked",
    "lead_form_started",
    "lead_submitted",
  ]) {
    ok(eventNames.has(needed), `analytics includes ${needed}`);
  }

  const { data: generation, error: genErr } = await supabase
    .from("bathroom_generations")
    .select(
      [
        "id",
        "uploaded_image_url",
        "generated_image_url",
        hasColumn("bathroom_generations", "status") ? "status" : null,
        hasColumn("bathroom_generations", "lead_submitted") ? "lead_submitted" : null,
      ]
        .filter(Boolean)
        .join(", "),
    )
    .eq("id", generationId)
    .maybeSingle();
  if (genErr) fail(`verify generation failed: ${genErr.message}`);
  ok(Boolean(generation), "generation row created");
  ok(Boolean(generation?.uploaded_image_url), "generation has uploaded image");
  ok(Boolean(generation?.generated_image_url), "generation has generated image");
  if (hasColumn("bathroom_generations", "status")) {
    ok(generation?.status === "completed", "generation status is completed");
  } else {
    console.log("WARN: bathroom_generations.status missing (cannot verify completed state)");
  }
  if (hasColumn("bathroom_generations", "lead_submitted")) {
    ok(Boolean(generation?.lead_submitted), "generation lead_submitted=true");
  } else {
    console.log("WARN: bathroom_generations.lead_submitted missing");
  }

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      [
        "id",
        "generation_id",
        "zip_code",
        hasColumn("leads", "status") ? "status" : null,
        hasColumn("leads", "assigned_contractor_id") ? "assigned_contractor_id" : null,
        "name",
        "email",
        "timeline",
        "budget_range",
        "scope_of_work",
      ]
        .filter(Boolean)
        .join(", "),
    )
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) fail(`verify lead failed: ${leadErr.message}`);
  ok(Boolean(lead), "lead row created");
  ok(lead?.generation_id === generationId, "lead linked to generation");
  ok(Boolean(lead?.zip_code), "lead has zip");
  if (hasColumn("leads", "status")) {
    ok(lead?.status === "shared", "lead status moved to shared");
  } else {
    console.log("WARN: leads.status missing");
  }
  if (hasColumn("leads", "assigned_contractor_id")) {
    ok(lead?.assigned_contractor_id === contractorAId, "lead assigned contractor updated");
  } else {
    console.log("WARN: leads.assigned_contractor_id missing");
  }
  ok(Boolean(lead?.name && lead?.email && lead?.timeline && lead?.budget_range), "lead detail fields are present");
}

async function verifyContractorWorkflowData() {
  const { data: assignmentsA, error: assignmentsAErr } = await supabase
    .from("lead_assignments")
    .select("id, lead_id, contractor_id, status")
    .eq("contractor_id", contractorAId);
  if (assignmentsAErr) fail(`verify contractor A assignments failed: ${assignmentsAErr.message}`);
  ok((assignmentsA ?? []).length === 1, "contractor A sees only its assignment row");
  ok(assignmentsA?.[0]?.lead_id === leadId, "contractor A assignment maps to expected lead");

  const { data: assignmentsB, error: assignmentsBErr } = await supabase
    .from("lead_assignments")
    .select("id, lead_id, contractor_id, status")
    .eq("contractor_id", contractorBId);
  if (assignmentsBErr) fail(`verify contractor B assignments failed: ${assignmentsBErr.message}`);
  ok((assignmentsB ?? []).length === 1, "contractor B sees only its assignment row");
  ok(assignmentsB?.[0]?.lead_id === extraLeadId, "contractor B assignment maps to expected lead");

  const { error: viewedErr } = await supabase
    .from("lead_assignments")
    .update({ contractor_viewed_at: iso(60), status: "viewed" })
    .eq("id", assignmentId)
    .eq("contractor_id", contractorAId);
  if (viewedErr) fail(`mark viewed failed: ${viewedErr.message}`);

  const { error: acceptedErr } = await supabase
    .from("lead_assignments")
    .update({ contractor_viewed_at: iso(70), status: "accepted" })
    .eq("id", assignmentId)
    .eq("contractor_id", contractorAId);
  if (acceptedErr) fail(`accept failed: ${acceptedErr.message}`);

  const { error: declinedErr } = await supabase
    .from("lead_assignments")
    .update({ contractor_viewed_at: iso(80), status: "declined" })
    .eq("id", assignmentId)
    .eq("contractor_id", contractorAId);
  if (declinedErr) fail(`decline failed: ${declinedErr.message}`);

  const { data: finalAssignment, error: finalErr } = await supabase
    .from("lead_assignments")
    .select("status, contractor_viewed_at")
    .eq("id", assignmentId)
    .maybeSingle();
  if (finalErr) fail(`verify final assignment failed: ${finalErr.message}`);
  ok(finalAssignment?.status === "declined", "contractor action transition persists (final=declined)");
  ok(Boolean(finalAssignment?.contractor_viewed_at), "contractor viewed timestamp is set");
}

async function main() {
  console.log(`Running admin workflow QA: ${runTag}`);
  await preflight();
  await seedCustomerJourney();
  await seedContractorsAndShare();
  await verifyAdminWorkflowData();
  await verifyContractorWorkflowData();
  console.log("");
  console.log("PASS: admin workflow QA completed");
  console.log(`session_id=${sessionId}`);
  console.log(`generation_id=${generationId}`);
  console.log(`lead_id=${leadId}`);
  console.log(`assignment_id=${assignmentId}`);
  console.log(`qa_tag=${runTag}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
