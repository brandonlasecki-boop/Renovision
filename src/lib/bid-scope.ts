import type {
  ProjectQuestionnaireItem,
  ProjectQuestionOption,
  RoomMeasurementRow,
} from "@/types/bid";
import { MCQ_OTHER_OPTION_ID } from "@/lib/questionnaire-mcq";

const TRADES = new Set([
  "general",
  "electrical",
  "plumbing",
  "hvac",
  "drywall",
  "flooring",
  "paint",
  "cabinetry",
  "tile",
  "labor",
  "permits",
  "other",
]);

export function normalizeMaterialTrade(raw: unknown): import("@/types/bid").BidMaterialTrade {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s && TRADES.has(s)) return s as import("@/types/bid").BidMaterialTrade;
  return "general";
}

/**
 * Corrects obvious trade mis-tags from the scope model so retail search and grouping
 * stay aligned with line intent (e.g. shower tile → `tile`, vanity faucets → `plumbing`).
 */
export function refineMaterialTradeFromLineName(
  name: string,
  trade: import("@/types/bid").BidMaterialTrade,
): import("@/types/bid").BidMaterialTrade {
  const n = name.trim().toLowerCase();
  if (/\brough[\s-]?in\b|\brough\s+plumbing\b/i.test(n)) {
    return trade;
  }
  if (/\b(light\s+fixture|vanity\s+light|bath\s+light|sconce|recessed\s+light|led\s+mirror)\b/i.test(n)) {
    return "electrical";
  }
  if (
    /\b(faucets?|lavatory|shower\s+head|shower\s+trim|trim\s+kit|mixing\s+valve|toilet\b|drain\s+assembly)\b/i.test(
      n,
    ) &&
    !/\bvanity\s+cabinet\b|\bbathroom\s+vanity\s+cabinet\b/i.test(n)
  ) {
    return "plumbing";
  }
  if (/\b(mirror|medicine\s+cabinet|shower\s+door|shower\s+enclosure|glass\s+panel|glass\s+enclosure)\b/i.test(n)) {
    return "general";
  }
  if (
    /\bvanity\s+faucets?\b|\bfaucets?\s+for\s+vanity\b|\bsupply\s+(?:and\s+)?install\s+vanity\s+faucets?\b/i.test(
      n,
    )
  ) {
    return "plumbing";
  }
  if (
    /\btile\b/i.test(n) &&
    /\b(shower|floor|wall|walls|backsplash|surround|pan|niche|wet\s*area)\b/i.test(n) &&
    !/\bvanity\s+faucets?\b/i.test(n)
  ) {
    return "tile";
  }
  if (
    /\b(vanity\s+cabinet|vanity\s+combo|bathroom\s+vanity(?:\s+unit)?|vanity\s+with\s+sink|vanity\s+sink\s+base)\b/i.test(
      n,
    )
  ) {
    return "cabinetry";
  }
  if (/\bbathroom\s+vanity\b/i.test(n) && !/\bvanity\s+faucets?\b|\bfaucets?\s+for\s+vanity\b/i.test(n)) {
    return "cabinetry";
  }
  if (
    trade === "plumbing" &&
    /\bvanity\b/i.test(n) &&
    !/\bvanity\s+faucets?\b|\bfaucets?\s+for\s+vanity\b|\bsupply\s+(?:and\s+)?install\s+vanity\s+faucets?\b|\blavatory\s+faucets?\b/i.test(
      n,
    ) &&
    (/\b(cabinet|combo|sink\s+base|new\s+vanity|install\s+(?:the\s+)?vanity|supply\s+(?:and\s+)?install\s+vanity)\b/i.test(
      n,
    ) ||
      (/\bsink\b/i.test(n) && !/\bfaucets?\b/i.test(n)))
  ) {
    return "cabinetry";
  }
  if (
    /\b(vanity|bathroom\s+vanity)\b/i.test(n) &&
    !/\bvanity\s+light\b|\bvanity\s+lighting\b|\bfaucets?\b|\brough[\s-]?in\b|\bplumbing\s+connections?\b/i.test(n) &&
    /\b(supply|install|replace|new|unit|combo|cabinet|sink|top|countertop)\b/i.test(n)
  ) {
    return "cabinetry";
  }
  if (
    /\b(shower\s+door|shower\s+doors|glass\s+door|glass\s+panel|fixed\s+panel|shower\s+enclosure|glass\s+enclosure|frameless|semi[\s-]?frameless|bypass\s+door)\b/i.test(
      n,
    )
  ) {
    return "general";
  }
  if (
    /\b(shower\s+pan|shower\s+base|shower\s+receptor|tile[-\s]?ready\s+pan|shower\s+surround|wall\s+panel|shower\s+wall\s+kit)\b/i.test(
      n,
    )
  ) {
    return "tile";
  }
  if (
    trade === "plumbing" &&
    /\bvanity\b/i.test(n) &&
    !/\bfaucets?\b|\btrim\s+kit\b|\bshowerhead\b|\bvalve\s+only\b|\bdrain\s+only\b/i.test(n) &&
    (/\bvanity\s+(cabinet|combo|unit)\b/i.test(n) ||
      /\b(install|replace|supply\s+and\s+install)\s+(?:a\s+|the\s+|new\s+)?(?:bathroom\s+)?vanity\b/i.test(n) ||
      /\bvanity\s+and\s+sink\b/i.test(n))
  ) {
    return "cabinetry";
  }
  return trade;
}

function parseRoomMeasurements(raw: unknown): RoomMeasurementRow[] {
  if (!Array.isArray(raw)) return [];
  const out: RoomMeasurementRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : crypto.randomUUID();
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const length_ft =
      typeof o.length_ft === "number" ? o.length_ft : Number(o.length_ft) || 0;
    const width_ft = typeof o.width_ft === "number" ? o.width_ft : Number(o.width_ft) || 0;
    const ceilingRaw = o.ceiling_ft;
    const ceiling_ft =
      ceilingRaw === undefined || ceilingRaw === null
        ? undefined
        : typeof ceilingRaw === "number"
          ? ceilingRaw
          : Number(ceilingRaw) || undefined;
    const notesRaw = typeof o.notes === "string" ? o.notes.trim() : "";
    const notes = notesRaw.length ? notesRaw.slice(0, 500) : undefined;
    const needs_user_measurements = o.needs_user_measurements === true;
    if (!label && length_ft <= 0 && width_ft <= 0) continue;
    out.push({
      id,
      label: label || "Room",
      length_ft,
      width_ft,
      ...(ceiling_ft != null && ceiling_ft > 0 ? { ceiling_ft } : {}),
      ...(notes ? { notes } : {}),
      ...(needs_user_measurements ? { needs_user_measurements: true } : {}),
    });
  }
  return out;
}

function parseQuestionOptions(raw: unknown): ProjectQuestionOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ProjectQuestionOption[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const option_id =
      typeof o.option_id === "string" && o.option_id.trim() ? o.option_id.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!option_id || !label) continue;
    out.push({ option_id, label });
  }
  return out.length > 0 ? out : undefined;
}

function parseQuestionnaire(raw: unknown): ProjectQuestionnaireItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ProjectQuestionnaireItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const question_id =
      typeof o.question_id === "string" && o.question_id.trim()
        ? o.question_id.trim()
        : crypto.randomUUID();
    const question = typeof o.question === "string" ? o.question.trim() : "";
    const answer = typeof o.answer === "string" ? o.answer.trim() : "";
    const options = parseQuestionOptions(o.options);
    const selectedRaw = o.selected_option_id;
    const selected_option_id =
      typeof selectedRaw === "string" && selectedRaw.trim()
        ? selectedRaw.trim()
        : selectedRaw === null
          ? null
          : undefined;
    if (!question && !answer) continue;
    const other_text =
      typeof o.other_text === "string" && o.other_text.trim()
        ? o.other_text.trim()
        : undefined;
    const allow_multiple = o.allow_multiple === true;
    const idsRaw = o.selected_option_ids;
    let selected_option_ids: string[] | undefined;
    if (Array.isArray(idsRaw)) {
      const ids = idsRaw
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
      if (ids.length > 0) selected_option_ids = ids;
    }
    out.push({
      question_id,
      question,
      answer,
      ...(options ? { options } : {}),
      ...(selected_option_id !== undefined ? { selected_option_id } : {}),
      ...(allow_multiple ? { allow_multiple: true } : {}),
      ...(selected_option_ids ? { selected_option_ids } : {}),
      ...(other_text ? { other_text } : {}),
    });
  }
  return out;
}

export { parseRoomMeasurements, parseQuestionnaire };

/** True when there is no saved room data worth preserving (safe to auto-fill from photos). */
export function roomMeasurementsLookEmpty(raw: unknown): boolean {
  const rooms = parseRoomMeasurements(raw);
  if (rooms.length === 0) return true;
  return rooms.every(
    (r) =>
      !r.label.trim() &&
      r.length_ft <= 0 &&
      r.width_ft <= 0 &&
      r.needs_user_measurements !== true,
  );
}

/** Shown wherever AI-filled room sizes may appear (automatic or manual “from photos”). */
export const ROOM_MEASUREMENTS_AI_DISCLAIMER =
  "Sizes from your photos are estimated automatically and are approximate. For the closest numbers, update these fields with a tape measure on site.";

/** Merge UI edits; clear needs_user_measurements once both dimensions look filled in. */
export function applyRoomMeasurementPatch(
  prev: RoomMeasurementRow,
  patch: Partial<RoomMeasurementRow>,
): RoomMeasurementRow {
  const merged = { ...prev, ...patch };
  if (
    merged.needs_user_measurements &&
    merged.length_ft >= 0.5 &&
    merged.width_ft >= 0.5
  ) {
    return { ...merged, needs_user_measurements: false };
  }
  return merged;
}

/** One line for prompts — avoid "sq ft floor" (reads like flooring scope to the model). */
export function formatRoomMeasurementLineForScope(r: RoomMeasurementRow): string {
  const lf = Math.max(0, r.length_ft);
  const wf = Math.max(0, r.width_ft);
  const sq = lf * wf;
  const ceil =
    r.ceiling_ft != null && r.ceiling_ft > 0 ? `, ceiling ~${r.ceiling_ft} ft` : "";
  const note = r.notes?.trim() ? ` — ${r.notes.trim()}` : "";
  if (r.needs_user_measurements === true) {
    return `- ${r.label}: dimensions not estimated from photos — homeowner to add length × width in feet when available${note}`;
  }
  return `- ${r.label}: ~${lf} x ${wf} ft (~${sq.toFixed(0)} sq ft footprint, sizing only — not a flooring scope item)${ceil}${note}`;
}

/**
 * Single string passed to the estimate + vision model: base scope plus walkthrough data.
 */
export function buildCompositeScopeDescription(input: {
  scope_description: string;
  project_kind?: string;
  walkthrough_transcript?: string;
  room_measurements?: unknown;
  project_questionnaire?: unknown;
}): string {
  const parts: string[] = [];
  const base = input.scope_description?.trim() ?? "";
  if (base) {
    parts.push(
      [
        "--- Contractor-stated scope (verbatim — every deliverable here must appear in the estimate) ---",
        base,
      ].join("\n"),
    );
  }

  const kind = input.project_kind?.trim();
  if (kind) {
    parts.push(`Project type (contractor-selected): ${kind}`);
  }

  const rooms = parseRoomMeasurements(input.room_measurements);
  if (rooms.length > 0) {
    const lines = rooms.map((r) => formatRoomMeasurementLineForScope(r));
    parts.push(`--- Room measurements (contractor-entered) ---\n${lines.join("\n")}`);
  }

  const transcript = input.walkthrough_transcript?.trim();
  if (transcript) {
    parts.push(`--- Walkthrough / voice notes ---\n${transcript}`);
  }

  const qa = parseQuestionnaire(input.project_questionnaire).filter(
    (q) => q.question.length > 0 || q.answer.length > 0 || (q.options && q.options.length > 0),
  );
  if (qa.length > 0) {
    const lines = qa.map((q) => {
      let ans = q.answer || "";
      if (q.allow_multiple && q.options && q.options.length > 0 && q.selected_option_ids?.length) {
        const parts: string[] = [];
        for (const oid of q.selected_option_ids) {
          if (oid === MCQ_OTHER_OPTION_ID) {
            const t = q.other_text?.trim();
            if (t) parts.push(t);
          } else {
            const hit = q.options.find((o) => o.option_id === oid);
            if (hit?.label) parts.push(hit.label);
          }
        }
        if (parts.length > 0) ans = parts.join("; ");
      } else if (q.selected_option_id === MCQ_OTHER_OPTION_ID) {
        ans = q.other_text?.trim() || q.answer || "(other — no detail)";
      } else if (q.options && q.options.length > 0 && q.selected_option_id) {
        const hit = q.options.find((o) => o.option_id === q.selected_option_id);
        if (hit?.label) ans = hit.label;
      }
      return `Q: ${q.question}\nA: ${ans || "(no answer)"}`;
    });
    parts.push(`--- Project follow-up answers ---\n${lines.join("\n\n")}`);
  }

  return parts.join("\n\n").trim();
}
