import type { ProjectQuestionDraft, ProjectQuestionOption, ProjectQuestionnaireItem } from "@/types/bid";
import { MCQ_OTHER_OPTION_ID, optionsWithOther } from "@/lib/questionnaire-mcq";

const CHAT_MODEL = "gpt-4o";

/** Sharper vision for small photo sets; more images → lower detail to cap tokens. */
function imageDetailForPhotoCount(count: number): "low" | "high" | "auto" {
  if (count <= 2) return "high";
  if (count <= 4) return "auto";
  return "low";
}

const GAP_COVERAGE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "any",
  "per",
  "are",
  "was",
  "use",
  "not",
  "yet",
  "our",
  "you",
  "all",
  "can",
  "has",
  "its",
]);

function tokenizeForGapCoverage(s: string): string[] {
  const m = s.toLowerCase().match(/[a-z0-9]{3,}/g);
  return m ?? [];
}

/**
 * Heuristic: a critical_gap is "covered" if a substring of the gap appears in some question
 * or enough non-stopword tokens from the gap appear across question stems + options.
 */
export function criticalGapsMissingFromQuestions(
  gaps: string[],
  drafts: ProjectQuestionDraft[],
): string[] {
  const parts: string[] = [];
  for (const q of drafts) {
    parts.push(q.question);
    for (const o of q.options) parts.push(o.label);
  }
  const blob = parts.join(" ").toLowerCase();
  const missing: string[] = [];
  for (const gap of gaps) {
    const g = gap.trim();
    if (!g) continue;
    const lower = g.toLowerCase();
    if (lower.length >= 5 && blob.includes(lower.slice(0, Math.min(48, lower.length)))) {
      continue;
    }
    const gapTokens = tokenizeForGapCoverage(g).filter((t) => !GAP_COVERAGE_STOPWORDS.has(t));
    if (gapTokens.length === 0) {
      missing.push(g);
      continue;
    }
    let hits = 0;
    for (const t of gapTokens) {
      if (blob.includes(t)) hits++;
    }
    const need = gapTokens.length === 1 ? 1 : Math.min(2, gapTokens.length);
    if (hits < need) missing.push(g);
  }
  return missing;
}

function maxAiSlotsBeforeFixedTail(opts?: { projectKind?: string; scopeDescription?: string }): number {
  const scope = opts?.scopeDescription ?? "";
  const pk = opts?.projectKind ?? "";
  const fixed =
    (shouldIncludeVanityCabinetSupplyQuestion(pk, scope) ? 1 : 0) +
    (shouldIncludeShowerWetAreaQuestion(pk, scope) ? 1 : 0);
  return Math.max(7, 12 - fixed);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  let direct = tryParse(text);
  if (direct) return direct;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    direct = tryParse(text.slice(start, end + 1));
    if (direct) return direct;
  }
  return null;
}

function normalizeOptionId(raw: string, index: number): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return s || `opt_${index + 1}`;
}

/** First — job-site ZIP for SerpApi store / delivery pricing (used by quiz + save handler). */
export const JOB_SITE_ZIP_QUESTION_ID = "job_site_zip_for_pricing";

/** Vanity supply path — custom millwork skips retail shelf search for vanity cabinet lines. */
export const VANITY_CABINET_SUPPLY_QUESTION_ID = "vanity_cabinet_supply_path";

/** Shower / tub direction — fixed so broad “redo bathroom” scopes always clarify the wet area. */
export const SHOWER_WET_AREA_QUESTION_ID = "shower_wet_area_plan";

/** Always last — catch-all before scope breakdown (used by quiz UI). */
export const ANYTHING_ELSE_QUESTION_ID = "anything_else_relevant";

const ANYTHING_ELSE_FIXED: ProjectQuestionDraft = {
  question_id: ANYTHING_ELSE_QUESTION_ID,
  question:
    "Anything else about the remodel—layout, fixtures, finishes, or storage—that would change materials or scope?",
  options: [
    { option_id: "no_additional", label: "No — that covers what matters for the remodel" },
    { option_id: "more_shower_wet", label: "I have more detail on shower / tub / waterproofing" },
    { option_id: "more_vanity_storage", label: "I have more detail on vanity, cabinets, or storage" },
    { option_id: "more_finishes", label: "I have more detail on tile, counters, or finishes" },
  ],
};

function homeownerOptionLabels(options: ProjectQuestionOption[]): ProjectQuestionOption[] {
  return options.map((o) => {
    const lower = o.label.toLowerCase();
    if (
      lower.includes("not sure") ||
      lower.includes("tbd") ||
      lower.includes("n/a") ||
      lower === "unknown" ||
      lower.includes("you pick")
    ) {
      return { ...o, label: "No strong preference — use a typical in-stock / mid-grade choice" };
    }
    return o;
  });
}

function appendAnythingElseQuestion(questions: ProjectQuestionDraft[]): ProjectQuestionDraft[] {
  const withoutDup = questions.filter((q) => q.question_id !== ANYTHING_ELSE_QUESTION_ID);
  return [...withoutDup, ANYTHING_ELSE_FIXED];
}

export function buildJobSiteZipQuestion(_hasSavedZipOnEstimate: boolean): ProjectQuestionDraft {
  return {
    question_id: JOB_SITE_ZIP_QUESTION_ID,
    question:
      "What is the job-site ZIP code? (Five digits — used for local Home Depot / Lowe's shelf search.)",
    options: [],
    ui_variant: "zip_input",
  };
}

function shouldIncludeVanityCabinetSupplyQuestion(
  projectKind: string | undefined,
  scopeDescription: string,
): boolean {
  const pk = (projectKind ?? "").toLowerCase();
  if (/\bbathroom\b|\bbath\b|\bpowder\b/.test(pk)) return true;
  const s = scopeDescription.toLowerCase();
  return /\b(bathroom|bath|vanity|powder\s*room|sink\s+cabinet|lavatory)\b/.test(s);
}

export function buildVanityCabinetSupplyQuestion(): ProjectQuestionDraft {
  return {
    question_id: VANITY_CABINET_SUPPLY_QUESTION_ID,
    question:
      "For the bathroom vanity (cabinet or vanity-and-sink unit), what are you planning? (Shelf search follows your answer.)",
    options: optionsWithOther(
      [
        {
          option_id: "vanity_shoppable",
          label: "Shop a standard in-stock or showroom vanity (typical retail SKUs)",
        },
        {
          option_id: "vanity_keep",
          label: "Keep, refinish, or repaint the existing vanity",
        },
        { option_id: "vanity_unsure", label: "Not sure yet" },
      ],
      "Custom millwork / built-in vanity — describe below (no store SKU)",
    ),
  };
}

/** True when Q&A says custom built-in vanity with a written description — retail vanity search should be skipped. */
export function isCustomMillworkVanityFromQuestionnaire(
  items: ProjectQuestionnaireItem[] | undefined,
): boolean {
  const row = items?.find((x) => x.question_id === VANITY_CABINET_SUPPLY_QUESTION_ID);
  if (!row?.selected_option_id) return false;
  if (row.selected_option_id !== MCQ_OTHER_OPTION_ID) return false;
  return Boolean((row.other_text ?? row.answer ?? "").trim());
}

/** Vanity cabinet / combo material line (not vanity lights or tops-only). */
export function isVanityCabinetMaterialLine(line: {
  name: string;
  notes?: string;
  trade?: string;
}): boolean {
  const blob = `${line.name} ${line.notes ?? ""}`;
  if (/\bvanity\s+light\b/i.test(blob)) return false;
  if (/\bvanity\s+top\b|\bcountertop\s+only\b|\btop\s+only\b/i.test(blob)) return false;
  if (/\brough-?in\b|\brough\s+plumbing\b|\bdrain\s*stub\b|\bsupply\s+lines?\s+only\b/i.test(blob)) {
    if (!/\b(cabinet|combo|unit|install\s+vanity)\b/i.test(blob)) return false;
  }
  if ((line.trade === "cabinetry" || line.trade === "plumbing") && /\bvanity\b/i.test(blob)) {
    if (/\b(faucet|faucets|trim|valve)\b/i.test(blob) && !/\b(cabinet|combo|sink\s+base|vanity\s+unit)\b/i.test(blob)) {
      return false;
    }
  }
  if (line.trade === "cabinetry" && /\bvanity\b/i.test(blob)) return true;
  if (/\bvanity\s+(cabinet|combo|with\s+sink|unit)\b/i.test(blob)) return true;
  if (/\bbathroom\s+vanity\b/i.test(blob)) return true;
  return false;
}

export function shouldSkipRetailSearchForVanityCabinetDueToCustomMillwork(
  line: { name: string; notes?: string; trade?: string },
  questionnaire: ProjectQuestionnaireItem[] | undefined,
): boolean {
  if (!isCustomMillworkVanityFromQuestionnaire(questionnaire)) return false;
  return isVanityCabinetMaterialLine(line);
}

/** Bath-like job from project type or free-text scope (matches planner + MCQ bathContext). */
export function isBathroomScopeHint(projectKind: string, scopeDescription: string): boolean {
  const pk = projectKind.trim().toLowerCase();
  const s = scopeDescription.toLowerCase();
  return (
    /\bbathroom\b|\bbath\b|\bpowder\b/i.test(pk) ||
    /\b(bathroom|bath|powder|master\s+bath|half\s+bath|full\s+bath|shower|tub|wet\s*area|vanity|toilet|lavatory)\b/i.test(
      s,
    )
  );
}

/** True when scope already names a wet-area direction (skip fixed shower MCQ). */
export function scopeAlreadySpecifiesShowerWetArea(scopeDescription: string): boolean {
  const s = scopeDescription.toLowerCase();
  if (/\bno\s+shower\b|\bshower\s+not\b|\bwithout\s+a\s+shower\b/i.test(s)) return true;
  return (
    /\b(walk[\s-]?in|curbless|zero[\s-]?entry)\s+shower\b/i.test(s) ||
    /\bshower\s+only\b|\btub\s+only\b|\bkeep\s+(the\s+)?(existing\s+)?tub\b/i.test(s) ||
    /\btub[\s-]?to[\s-]?shower\b/i.test(s) ||
    /\balcove\s+shower\b/i.test(s) ||
    /\bneo[\s-]?angle\b/i.test(s) ||
    /\b(acrylic|fiberglass)\s+(surround|unit|walls|shower)\b/i.test(s) ||
    /\bframeless\b.*\b(shower|door|glass)\b|\b(shower|door)\b.*\bframeless\b/i.test(s) ||
    /\b(shower|tub)\s+(tile|tiled)\s+(walls?|to\s+ceiling)\b/i.test(s)
  );
}

/**
 * Fixed shower/tub question for bathroom remodels when the wet area is still open-ended.
 * Complements OpenAI MCQs (models sometimes skip wet-area detail).
 */
export function shouldIncludeShowerWetAreaQuestion(
  projectKind: string | undefined,
  scopeDescription: string,
): boolean {
  const pk = projectKind ?? "";
  const scope = scopeDescription.trim();
  if (!isBathroomScopeHint(pk, scope)) return false;
  if (scopeAlreadySpecifiesShowerWetArea(scope)) return false;
  const s = scope.toLowerCase();
  if (/\bno\s+shower\b|\b(no|skip|exclude)\s+(shower|wet)\b/i.test(s)) return false;
  const broadBathRemodel =
    /\b(redo|remodel|renovate|gut|replace|new|update|refresh|overhaul)\b[\s\S]{0,48}\b(bath|bathroom)\b/i.test(
      s,
    ) ||
    /\b(bath|bathroom)\b[\s\S]{0,48}\b(redo|remodel|renovate|gut|replace|new|update|refresh|overhaul|entire|whole|full)\b/i.test(
      s,
    ) ||
    /\b(entire|whole|full)\s+(bath|bathroom)\b/i.test(s);
  if (broadBathRemodel) return true;
  const pkLower = pk.trim().toLowerCase();
  const typedBathroom = /\bbathroom\b|\bbath\b|\bpowder\b/i.test(pkLower);
  if (!typedBathroom) return false;
  if (
    /\b(faucet\s+only|paint\s+only|mirror\s+only|lighting\s+only|hardware\s+only|sconce\s+only|towel\s+bar)\b/i.test(
      s,
    )
  ) {
    return false;
  }
  return true;
}

export function buildShowerWetAreaQuestion(): ProjectQuestionDraft {
  return {
    question_id: SHOWER_WET_AREA_QUESTION_ID,
    question:
      "For the tub / shower area, what is the plan? (This drives waterproofing, tile, glass, and rough plumbing.)",
    options: optionsWithOther(
      [
        {
          option_id: "wet_keep_refresh",
          label: "Keep existing tub or shower footprint — refinish, new doors, or surface updates only",
        },
        {
          option_id: "wet_new_tub_or_shower_same_layout",
          label: "Replace tub or shower in the same location (standard curb / alcove)",
        },
        {
          option_id: "wet_tub_to_shower",
          label: "Tub-to-shower conversion (new pan, walls, and glass)",
        },
        {
          option_id: "wet_walk_in_curbless",
          label: "Walk-in or curbless tiled shower (larger layout / drain work likely)",
        },
        { option_id: "wet_unsure", label: "Not sure yet — want options in the bid" },
      ],
      "Something else — describe the wet-area goal",
    ),
  };
}

/** Prepends ZIP question and appends the fixed “anything else” tail; strips duplicate fixed ids from the model. */
export function mergeFixedProjectQuestions(
  aiQuestions: ProjectQuestionDraft[],
  hasSavedZipOnEstimate: boolean,
  opts?: { projectKind?: string; scopeDescription?: string },
): ProjectQuestionDraft[] {
  const scope = (opts?.scopeDescription ?? "").trim();
  const filtered = aiQuestions.filter(
    (q) =>
      q.question_id !== JOB_SITE_ZIP_QUESTION_ID &&
      q.question_id !== ANYTHING_ELSE_QUESTION_ID &&
      q.question_id !== VANITY_CABINET_SUPPLY_QUESTION_ID &&
      q.question_id !== SHOWER_WET_AREA_QUESTION_ID,
  );
  const vanityQ =
    shouldIncludeVanityCabinetSupplyQuestion(opts?.projectKind, scope) ? [buildVanityCabinetSupplyQuestion()] : [];
  const showerQ =
    shouldIncludeShowerWetAreaQuestion(opts?.projectKind, scope) ? [buildShowerWetAreaQuestion()] : [];
  const fixedCount = vanityQ.length + showerQ.length;
  const maxAi = Math.max(7, 12 - fixedCount);
  const withTail = appendAnythingElseQuestion(filtered.slice(0, maxAi));
  return [buildJobSiteZipQuestion(hasSavedZipOnEstimate), ...vanityQ, ...showerQ, ...withTail];
}

/** When the homeowner entered a 5-digit ZIP, returns it for `bids.site_postal_code`. */
export function extractSitePostalCodeFromQuestionnaire(
  items: ProjectQuestionnaireItem[],
): string | undefined {
  const row = items.find((x) => x.question_id === JOB_SITE_ZIP_QUESTION_ID);
  if (!row?.selected_option_id) return undefined;
  if (row.selected_option_id === "zip_skip" || row.selected_option_id === "zip_unsure") {
    return undefined;
  }
  if (row.selected_option_id === "zip_use_estimate") {
    const d = (row.answer ?? "").replace(/\D/g, "");
    if (d.length >= 5) return d.slice(0, 5);
    return undefined;
  }
  if (row.selected_option_id === "zip_manual") {
    const d = (row.answer ?? row.other_text ?? "").replace(/\D/g, "");
    if (d.length >= 5) return d.slice(0, 5);
  }
  const raw = (row.other_text ?? row.answer ?? "").replace(/\D/g, "");
  if (raw.length >= 5) return raw.slice(0, 5);
  return undefined;
}

/**
 * Job-site ZIP is required whenever the fixed ZIP question is present in the questionnaire.
 * Returns an error message, or null when satisfied (or when no ZIP row exists — legacy data).
 */
export function validateJobSiteZipQuestionnaire(
  items: ProjectQuestionnaireItem[],
  estimateSitePostal: string | null | undefined,
): string | null {
  const row = items.find((x) => x.question_id === JOB_SITE_ZIP_QUESTION_ID);
  if (!row) return null;
  const sid = row.selected_option_id?.trim();
  if (!sid) {
    return "Enter the 5-digit job-site ZIP code for local shelf pricing.";
  }
  if (sid === "zip_skip" || sid === "zip_unsure") {
    return "Job-site ZIP is required. Enter 5 digits, or use the ZIP saved on this estimate when that option appears.";
  }
  if (sid === "zip_use_estimate") {
    const z = String(estimateSitePostal ?? "").replace(/\D/g, "");
    if (z.length < 5) {
      return "Save a 5-digit ZIP on this estimate first, or type the job-site ZIP.";
    }
    return null;
  }
  const extracted = extractSitePostalCodeFromQuestionnaire(items);
  if (!extracted) {
    return "Enter the full 5-digit job-site ZIP code.";
  }
  return null;
}

export type BathroomAreaStatus = "in_scope" | "excluded" | "unknown";

/** Per-area bath scope signal from the planner (drives MCQ depth). */
export type BathroomAreaRow = {
  area: string;
  status: BathroomAreaStatus;
};

/** Step 1 of two-step questionnaire flow — infer intent and gaps before MCQs are written. */
export type ProjectQuestionPlan = {
  intent_summary: string;
  scope_breadth: "targeted_updates" | "single_room_remodel" | "multi_room_or_unclear";
  primary_spaces: string[];
  already_specified: string[];
  critical_gaps: string[];
  optional_topics: string[];
  do_not_ask_about: string[];
  /** Scope vs what photos suggest — each should be resolved with one MCQ when possible. */
  photo_scope_tensions: string[];
  /** When project is a bathroom, classify major packs so unknowns become questions. */
  bathroom_areas: BathroomAreaRow[];
};

function readStringArray(v: unknown, max = 24): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (s) out.push(s.slice(0, 200));
    if (out.length >= max) break;
  }
  return out;
}

function parseBathroomAreas(v: unknown, max = 14): BathroomAreaRow[] {
  if (!Array.isArray(v)) return [];
  const out: BathroomAreaRow[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const area = typeof o.area === "string" ? o.area.trim().slice(0, 120) : "";
    if (!area) continue;
    const st = o.status;
    const status: BathroomAreaStatus =
      st === "in_scope" || st === "excluded" || st === "unknown" ? st : "unknown";
    out.push({ area, status });
    if (out.length >= max) break;
  }
  return out;
}

function inferScopeBreadthWhenInvalid(
  criticalGapCount: number,
): "targeted_updates" | "single_room_remodel" {
  if (criticalGapCount === 0) return "single_room_remodel";
  return criticalGapCount <= 3 ? "targeted_updates" : "single_room_remodel";
}

function parseQuestionPlan(parsed: Record<string, unknown> | null): ProjectQuestionPlan | null {
  if (!parsed) return null;
  const intent_summary =
    typeof parsed.intent_summary === "string" ? parsed.intent_summary.trim().slice(0, 900) : "";
  const sbRaw = parsed.scope_breadth;
  const critical_gaps = readStringArray(parsed.critical_gaps, 20);
  const scope_breadth: ProjectQuestionPlan["scope_breadth"] =
    sbRaw === "targeted_updates" || sbRaw === "single_room_remodel" || sbRaw === "multi_room_or_unclear"
      ? sbRaw
      : inferScopeBreadthWhenInvalid(critical_gaps.length);
  const primary_spaces = readStringArray(parsed.primary_spaces, 12);
  const already_specified = readStringArray(parsed.already_specified, 20);
  const optional_topics = readStringArray(parsed.optional_topics, 16);
  const do_not_ask_about = readStringArray(parsed.do_not_ask_about, 16);
  const photo_scope_tensions = readStringArray(parsed.photo_scope_tensions, 8);
  const bathroom_areas = parseBathroomAreas(parsed.bathroom_areas, 14);
  if (!intent_summary && critical_gaps.length === 0) return null;
  return {
    intent_summary: intent_summary || "Remodel intent inferred from scope and notes.",
    scope_breadth,
    primary_spaces,
    already_specified,
    critical_gaps,
    optional_topics,
    do_not_ask_about,
    photo_scope_tensions,
    bathroom_areas,
  };
}

function formatQuestionPlanForMcqPrompt(plan: ProjectQuestionPlan): string {
  const lines = [
    `Intent summary: ${plan.intent_summary}`,
    `Scope breadth: ${plan.scope_breadth} — targeted_updates = only named areas; single_room_remodel = one room gut/partial without exhaustive list; multi_room_or_unclear = multiple rooms or scope boundary unclear.`,
    `Primary spaces: ${plan.primary_spaces.length ? plan.primary_spaces.join(" | ") : "(not listed — infer from scope)"}`,
    `Already specified by homeowner (do NOT ask them to pick again): ${
      plan.already_specified.length ? plan.already_specified.join(" | ") : "(none — many details may still be open)"
    }`,
    "Critical gaps — each line MUST be covered by at least one multiple-choice question (combine only when natural):",
    ...plan.critical_gaps.map((g) => `  • ${g}`),
  ];
  if (plan.bathroom_areas.length) {
    lines.push(
      "Bathroom area checklist (in_scope = include MCQs for details; excluded = do not ask; unknown = MUST clarify):",
    );
    for (const row of plan.bathroom_areas) {
      lines.push(`  • ${row.area}: ${row.status}`);
    }
  }
  if (plan.photo_scope_tensions.length) {
    lines.push("Photo vs written scope — resolve each with a direct MCQ (or merge into an existing question stem):");
    plan.photo_scope_tensions.forEach((t) => lines.push(`  • ${t}`));
  }
  if (plan.optional_topics.length) {
    lines.push("Optional topics (use if you still have room under the 10–12 question cap):");
    plan.optional_topics.forEach((t) => lines.push(`  • ${t}`));
  }
  if (plan.do_not_ask_about.length) {
    lines.push("Do NOT ask about:");
    plan.do_not_ask_about.forEach((t) => lines.push(`  • ${t}`));
  }
  return lines.join("\n");
}

/**
 * Lightweight pass: infer remodel breadth, spaces, and what still needs MCQs for a faithful scope.
 * Returns null on parse/network failure — caller falls back to single-step MCQ generation.
 */
export async function fetchProjectQuestionPlanFromOpenAI(params: {
  apiKey: string;
  title: string;
  projectKind: string;
  scopeDescription: string;
  measurementsSummary: string;
  transcriptPreview: string;
  beforePhotoUrls: string[];
}): Promise<ProjectQuestionPlan | null> {
  const {
    apiKey,
    title,
    projectKind,
    scopeDescription,
    measurementsSummary,
    transcriptPreview,
    beforePhotoUrls,
  } = params;

  const bathroomPlannerPack =
    /\bbathroom\b|\bbath\b|\bpowder\b/i.test(projectKind.trim()) ||
    /\b(bathroom|bath|powder|master\s+bath|half\s+bath|full\s+bath|shower|tub|wet\s*area|vanity|toilet|lavatory)\b/i.test(
      scopeDescription,
    );

  const planText = [
    "You are a senior US residential remodeling estimator (bath/kitchen specialist) reading homeowner-facing scope and optional site photos.",
    "Your output will drive a second model that writes multiple-choice questions — be precise about what is still unknown.",
    "Return JSON ONLY (no markdown). Shape:",
    '{"intent_summary":"string","scope_breadth":"targeted_updates|single_room_remodel|multi_room_or_unclear","primary_spaces":["string"],"already_specified":["string"],"critical_gaps":["string"],"optional_topics":["string"],"do_not_ask_about":["string"],"photo_scope_tensions":["string"],"bathroom_areas":[{"area":"string","status":"in_scope|excluded|unknown"}]}',
    "",
    "Field rules:",
    "- intent_summary: 2–4 sentences, plain English, what they want overall.",
    "- scope_breadth: targeted_updates if they ONLY named specific items or partial work (e.g. vanity + paint only, no shower) — questions must stay narrow. single_room_remodel for one-room gut / entire bath / full kitchen without an itemized fixture list. multi_room_or_unclear when multiple rooms or boundaries are vague.",
    '- NEVER classify scope_breadth as targeted_updates when the homeowner uses broad bath-rebuild language alone ("redo the bathroom", "remodel the bath", "new bathroom", "gut the bathroom", "entire bathroom") — those are single_room_remodel until they itemize specific zones to skip.',
    '- Phrases like "update entire bathroom", "redo the whole bath", "gut the bathroom" are NOT detailed specs — put shower/tub/waterproofing/enclosure/valve/drain/fan themes in critical_gaps unless already_specified lists concrete product/system choices. Always include at least one critical_gap that names **shower or tub configuration** (keep vs replace vs convert) when wet-area details are missing.',
    "- already_specified: short quotes of decisions truly written in scope or notes (e.g. Schluter, frameless door). Do NOT list vague phrases like entire bathroom as if it were a spec.",
    "- critical_gaps: 4–14 short noun phrases each describing ONE theme that must become an MCQ for accurate scope (e.g. shower wall system, vanity width/sinks, lighting level). For targeted_updates, only gaps tied to named work.",
    bathroomPlannerPack
      ? [
          "- BATHROOMS (extra): Prefer gaps that drive real estimates — not vague style. Typical high-value themes include: remodel depth (cosmetic refresh vs mid vs full gut), overall finish tier (budget vs mid vs luxury), tub/shower plan (keep vs replace; combo vs walk-in; tile level), vanity/cabinet tier (stock vs semi-custom vs custom), countertop material, mirror approach (keep large mirror vs two mirrors vs LED), lighting upgrade level (swap fixtures vs add recessed vs sconces), floor keep vs replace + material when floors are in scope, toilet/faucet/shower trim replacement, wall treatment (paint only vs wainscot/tile height), plumbing or drain location changes, added circuits or fan upgrade, heated floor, known moisture/damage or house age band when it changes code expectations.",
          "- Put remodel_depth and finish_tier in critical_gaps whenever bath scope is broad or gut-like and not already specified.",
        ].join("\n")
      : "",
    "- optional_topics: nice-to-have clarifications if question budget allows.",
    "- do_not_ask_about: logistics, scheduling, pets, OR product areas clearly out of scope for this prompt.",
    '- photo_scope_tensions: 0–8 short bullets where photos **contradict** or **tighten** written scope (e.g. "scope says new walk-in; photo shows existing tub alcove"). Use [] if aligned or no photos.',
    "- bathroom_areas: REQUIRED when the job is a bathroom, powder room, or clearly bath-heavy scope; otherwise use []. Each object: area (short label) + status in_scope | excluded | unknown. Use at least: wet_area; layout_or_drain_moves; vanity; toilet; exhaust_fan; lighting; mirror; flooring; drywall_paint; accessories (niche, bench, grab bars, medicine cabinet); electrical_plumbing_moves; finish_tier; moisture_or_age_risk. Mark excluded only when scope/photos clearly rule work out; otherwise unknown.",
    bathroomPlannerPack
      ? ""
      : "- For non-bathroom jobs: set bathroom_areas to [] and photo_scope_tensions may still list any photo vs text mismatches.",
    "",
    `Project title: ${title.trim() || "(untitled)"}`,
    `Project type / room focus: ${projectKind.trim() || "not specified"}`,
    "Contractor / homeowner scope:",
    scopeDescription.trim().slice(0, 12000) || "(none yet)",
    measurementsSummary.trim()
      ? `Measurements:\n${measurementsSummary.slice(0, 4000)}`
      : "No room dimensions entered yet.",
    transcriptPreview.trim()
      ? `Voice / walkthrough notes (excerpt):\n${transcriptPreview.slice(0, 2000)}`
      : "No voice notes yet.",
    beforePhotoUrls.length > 0
      ? `You have ${Math.min(6, beforePhotoUrls.length)} site photo(s) — use them for layout, visible finishes, and wet-area clues.`
      : "No site photos — rely on text only.",
  ].join("\n");

  const visionDetail = imageDetailForPhotoCount(Math.min(6, beforePhotoUrls.length));
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } }
  > = [{ type: "text", text: planText }];

  for (const url of beforePhotoUrls.slice(0, 6)) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    userContent.push({
      type: "image_url",
      image_url: { url, detail: visionDetail },
    });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.2,
        max_tokens: 2500,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseJsonObject(raw);
    return parseQuestionPlan(parsed);
  } catch {
    return null;
  }
}

function parseQuestionDraftsFromModelList(list: unknown[]): ProjectQuestionDraft[] {
  const out: ProjectQuestionDraft[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const question = typeof o.question === "string" ? o.question.trim() : "";
    if (!question) continue;

    let question_id =
      typeof o.question_id === "string" && o.question_id.trim()
        ? o.question_id.trim().toLowerCase().replace(/\s+/g, "_")
        : "";
    if (!question_id) {
      question_id = `q_${out.length + 1}`;
    }

    const optRaw = o.options;
    const options: ProjectQuestionOption[] = [];
    if (Array.isArray(optRaw)) {
      const seen = new Set<string>();
      for (let i = 0; i < optRaw.length; i++) {
        const item = optRaw[i];
        if (!item || typeof item !== "object") continue;
        const oo = item as Record<string, unknown>;
        const label = typeof oo.label === "string" ? oo.label.trim() : "";
        if (!label) continue;
        let oid =
          typeof oo.option_id === "string" && oo.option_id.trim()
            ? normalizeOptionId(oo.option_id, i)
            : "";
        if (!oid) oid = normalizeOptionId(label, i);
        if (seen.has(oid)) oid = `${oid}_${i}`;
        seen.add(oid);
        options.push({ option_id: oid, label });
      }
    }

    if (options.length < 2) continue;

    const allow_multiple = o.allow_multiple === true;
    out.push({
      question_id,
      question,
      options: homeownerOptionLabels(options),
      ...(allow_multiple ? { allow_multiple: true } : {}),
    });
  }
  return out;
}

async function fetchSupplementalQuestionsForCriticalGaps(params: {
  apiKey: string;
  missingGaps: string[];
  existingQuestions: ProjectQuestionDraft[];
  title: string;
  projectKind: string;
  scopeDescription: string;
  intentSummary: string;
}): Promise<ProjectQuestionDraft[]> {
  const {
    apiKey,
    missingGaps,
    existingQuestions,
    title,
    projectKind,
    scopeDescription,
    intentSummary,
  } = params;
  if (missingGaps.length === 0) return [];
  const maxNew = Math.min(6, missingGaps.length + 1);
  const stems =
    existingQuestions.length > 0
      ? existingQuestions.map((q) => `- ${q.question}`).join("\n")
      : "(none)";

  const text = [
    "You write multiple-choice REMODEL questions for US homeowners. Return JSON ONLY (no markdown).",
    'Shape: {"questions":[{"question_id":"snake_case_slug","question":"string","options":[{"option_id":"a","label":"string"},...],"allow_multiple":false}]}',
    "",
    "A first pass missed themes listed below. Write NEW questions so EACH theme is clearly covered by at least one question (combine two themes in one question only when natural).",
    `Write at most ${maxNew} questions.`,
    "Rules: exactly 4 or 5 options per question; concise labels (~70 chars); include a typical in-stock / mid-grade / no-preference option when it fits.",
    "Forbidden: scheduling, pets, parking, noise tolerance, who lives in the home, DIY vs contractor, regional labor pricing.",
    "Do not duplicate topics already asked in the existing stems.",
    "",
    "Planner intent:",
    intentSummary.trim().slice(0, 800) || "(none)",
    "",
    "Themes still needing MCQs:",
    ...missingGaps.map((g) => `  • ${g}`),
    "",
    "Existing question stems:",
    stems,
    "",
    `Project title: ${title.trim() || "(untitled)"}`,
    `Project type: ${projectKind.trim() || "not specified"}`,
    "Scope excerpt:",
    scopeDescription.trim().slice(0, 6000) || "(none)",
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.25,
        max_tokens: 3500,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseJsonObject(raw);
    if (!parsed) return [];
    const ql = parsed.questions;
    if (!Array.isArray(ql)) return [];
    return parseQuestionDraftsFromModelList(ql);
  } catch {
    return [];
  }
}

/**
 * Vision + text: multiple-choice follow-ups (SimplyWise-style) from scope, notes, measurements, and site photos.
 */
export async function fetchProjectQuestionsFromOpenAI(params: {
  apiKey: string;
  title: string;
  projectKind: string;
  scopeDescription: string;
  measurementsSummary: string;
  transcriptPreview: string;
  /** Signed HTTPS URLs to before photos (max 6 used). */
  beforePhotoUrls: string[];
  /** When true, ZIP question offers “use estimate ZIP” first. */
  hasSavedPostalCode?: boolean;
}): Promise<ProjectQuestionDraft[]> {
  const {
    apiKey,
    title,
    projectKind,
    scopeDescription,
    measurementsSummary,
    transcriptPreview,
    beforePhotoUrls,
    hasSavedPostalCode,
  } = params;

  const questionPlan = await fetchProjectQuestionPlanFromOpenAI({
    apiKey,
    title,
    projectKind,
    scopeDescription,
    measurementsSummary,
    transcriptPreview,
    beforePhotoUrls,
  });

  const bathContext =
    /\bbathroom\b|\bbath\b|\bpowder\b/i.test(projectKind.trim()) ||
    /\b(bathroom|bath|powder|master\s+bath|shower|tub|vanity|toilet)\b/i.test(scopeDescription);

  const photoNote =
    beforePhotoUrls.length > 0
      ? `You are given ${Math.min(6, beforePhotoUrls.length)} site photo(s) of current conditions. Read them like an estimator: name what you see (vanity run, mirror, floor type cues, tub vs shower zone, lighting) and turn uncertainties into clear MCQs.`
      : `No site photos were provided—ask conservative clarifying questions from scope and notes only.`;

  const planSection =
    questionPlan != null
      ? [
          "",
          "--- Question plan (internal — obey; homeowner never sees this block) ---",
          formatQuestionPlanForMcqPrompt(questionPlan),
          "--- End question plan ---",
          "",
        ].join("\n")
      : "";

  const textBlock = [
    `You are helping a homeowner define a REMODEL so a contractor can price it without a giant allowance. Tone: friendly, non-jargony, mobile-first — but be as concrete as a good estimator chat: call out what photos show, separate cosmetic vs gut, and ask about cost drivers (wet area, layout moves, finish tier, electrical/plumbing).`,
    `Questions must clarify gaps — they must NEVER contradict or erase work already stated in scope (e.g. if they said "replace the vanity", ask style, size, sinks, or faucet sourcing — not whether the vanity is included).`,
    planSection,
    questionPlan != null
      ? `TWO-STEP MODE: A planner already analyzed intent. You MUST align your questions with the plan: (1) Cover EVERY bullet under "Critical gaps" with at least one clear multiple-choice question unless the same decision is already in "Already specified". (2) Respect "Do NOT ask about". (3) Match depth to scope_breadth — fewer, sharper questions for targeted_updates; fuller room/system coverage for single_room_remodel or multi_room_or_unclear. (4) Use intent_summary to keep tone and priorities consistent. (5) When "Bathroom area checklist" appears: ask about every row marked unknown (combine only when natural); skip rows marked excluded. (6) When "Photo vs written scope" appears: add a question that resolves each tension.`
      : "",
    `Return JSON only, no markdown fences.`,
    `Shape: {"questions":[{"question_id":"snake_case_slug","question":"short clear question","options":[{"option_id":"a","label":"first choice"},...],"allow_multiple":false}]}`,
    `Rules:`,
    `- Return exactly 10 to 12 questions (inclusive). The app prepends a fixed ZIP question, may insert fixed bath questions (vanity shelf path, shower/tub plan), then appends one fixed catch-all — do NOT duplicate those ids or the catch-all "anything else" question.`,
    beforePhotoUrls.length > 0 && bathContext
      ? `- PHOTO READBACK (bath): Your FIRST question MUST briefly list 2–4 visible observations from the photos (vanity layout, mirror, floor cue, wet area type if visible, lighting/cabinet era). Then ask which option best matches — include: "Yes — that matches this bathroom", "Mostly right — a few details are off", "Several of those are wrong", and "Hard to tell from these photos". Keep the readback factual and humble (guess visible finishes; do not invent hidden conditions).`
      : beforePhotoUrls.length > 0
        ? `- PHOTO READBACK (non-bath): When photos are useful, your FIRST question should state 2–3 visible observations and ask the homeowner to confirm or pick the closest correction option (same spirit as bath readback).`
        : "",
    bathContext && questionPlan?.scope_breadth !== "targeted_updates"
      ? `- REMODEL DEPTH (bath): Include ONE question that separates cosmetic refresh (surfaces/fixtures, minimal demo) vs mid-range remodel (new vanity/floor/fixtures, limited layout changes) vs full gut (demo to studs, layout/plumbing/electrical changes likely). Use plain labels the homeowner understands.`
      : "",
    bathContext
      ? `- FINISH TIER: Include ONE question for overall material level when not already specified: budget / rental-grade vs typical mid-range vs high-end luxury (define in option labels with 1 short clue each).`
      : "",
    `- FULL-BATH / GUT / "ENTIRE BATHROOM" / "REDO THE WHOLE BATHROOM": Phrases like these are NOT detailed shower specs. You MUST still include at least two questions that cover the wet area (e.g. tub vs walk-in shower, wall system/tile vs surround, pan/curb, waterproofing expectations, door/enclosure style, valve/trim level, niche/bench) **unless** the contractor scope or voice notes already spell those out line-by-line, OR TWO-STEP MODE says scope_breadth is targeted_updates and the question plan's critical_gaps intentionally omits wet work (partial bath updates only).`,
    `- CONFLICT RULE: "Do not re-ask what scope already names" applies only to **specific** choices already written (e.g. "Schluter shower", "frameless sliding door"). It does NOT apply to broad remodel phrases — those still need wet-area and fixture-level follow-ups.`,
    `- Each question must have exactly 4 or 5 options. For finish/fixture questions where the homeowner may not care, include one option: "No strong preference — typical in-stock / mid-grade" (never label it "You pick").`,
    `- Most questions are single-select (omit allow_multiple or set allow_multiple false). For 1 to 3 questions where "select all that apply" is natural (e.g. shower: body sprays + rain head + handheld; mirror: anti-fog + lighting), set "allow_multiple": true.`,
    `- option_id: short unique slug per option within that question (e.g. schluter, liquid, unknown).`,
    `- Labels: mobile-friendly; prefer under ~80 chars but go slightly longer when needed for clarity on cost-driving choices.`,
    `- FORBIDDEN topics (never ask): contractor scheduling, availability, calendar, pets, children, who lives in the home, staying in the home during construction, noise tolerance unrelated to product choices, parking, DIY vs who will swing the hammer, or "what state for labor rates" — those are out of scope here.`,
    `- FLOORING: You MAY ask keep vs replace and material level when (a) scope or notes mention floors, OR (b) photos clearly show floor finish in a bathroom/kitchen context AND scope_breadth is single_room_remodel or multi_room_or_unclear, OR (c) the question plan marks flooring unknown/in_scope. Do NOT ask flooring only because footprint measurements exist — those lines explicitly say sizing is not a flooring scope cue.`,
    `- RISK / AGE (allowed): One question MAY ask about known water damage, mold, or soft walls, or approximate home age (e.g. pre-1980 vs newer) when it changes realistic expectations for plumbing/electrical behind walls — keep it product/scope related, not scheduling.`,
    `- Bathroom expertise: include rich shower/wet-area questions when a bath remodel is plausible — wall system (tile vs acrylic/panels), pan/curb, niche or bench, number and type of shower heads (fixed, handheld, rain, body sprays), thermostatic vs pressure-balance valve, door swing/clearance when photos suggest tight layout.`,
    `- Shower door / enclosure: If contractor scope, notes, or transcript **already** specifies the door type (e.g. sliding shower door, bypass, barn door, pivot, frameless hinged, curtain only), do **NOT** ask them to choose a door type again — that decision is already made. Only ask door/glass questions when scope is silent or ambiguous.`,
    `- Read the **Contractor-stated scope** line-by-line: never ask the homeowner to pick a fixture type or finish that is **already explicitly named** there (same for voice notes when they repeat scope). Ask follow-ups only for true gaps (sizes, grades, colors not stated, rough-in unknowns).`,
    `- Vanity / bath storage: single vs double sink when the vanity run or photos suggest width; drawer vs door preference; freestanding vs built-in when relevant.`,
    `- Vanity faucet sourcing: If the scope mentions replacing or installing a vanity (or vanity+sink) and does not already specify faucet, include ONE question with options such as: separate faucet purchase, reuse existing faucet, faucet included with vanity/combo package, or undecided. This question is for procurement clarity only — it must NOT replace or erase vanity cabinet/box scope elsewhere.`,
    `- Kitchen when relevant: cabinet refinish vs replace, counter material level, sink/backsplash, hood/range, circuits if scope hints.`,
    `- Tailor to project type when known (bathroom vs kitchen vs other).`,
    `- Do NOT invent scope: every question must tie to an explicit or clearly implied topic from scope, transcript, measurements, or photos.`,
    `- Single-select questions: exactly one option. Multi-select questions (allow_multiple true): user may pick any subset of options.`,
    photoNote,
    ``,
    `Project title: ${title.trim() || "(untitled)"}`,
    `Project type / room focus: ${projectKind.trim() || "not specified"}`,
    `Scope (may be partial):`,
    scopeDescription.trim() || "(none yet)",
    measurementsSummary.trim()
      ? `Measurements:\n${measurementsSummary}`
      : "No room dimensions entered yet.",
    transcriptPreview.trim()
      ? `Voice / walkthrough notes (excerpt):\n${transcriptPreview.slice(0, 2000)}`
      : "No voice notes yet.",
  ].filter((s) => s !== "").join("\n");

  const visionDetailMcq = imageDetailForPhotoCount(Math.min(6, beforePhotoUrls.length));
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } }
  > = [{ type: "text", text: textBlock }];

  for (const url of beforePhotoUrls.slice(0, 6)) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    userContent.push({
      type: "image_url",
      image_url: { url, detail: visionDetailMcq },
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.35,
      max_tokens: 6000,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI chat error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Could not parse questions JSON.");
  }

  const list = parsed.questions;
  let drafts = parseQuestionDraftsFromModelList(Array.isArray(list) ? list : []);

  if (questionPlan && questionPlan.critical_gaps.length > 0) {
    let missing = criticalGapsMissingFromQuestions(questionPlan.critical_gaps, drafts);
    if (missing.length > 0) {
      const extra = await fetchSupplementalQuestionsForCriticalGaps({
        apiKey,
        missingGaps: missing,
        existingQuestions: drafts,
        title,
        projectKind,
        scopeDescription,
        intentSummary: questionPlan.intent_summary,
      });
      const seen = new Set(drafts.map((d) => d.question_id));
      for (let q of extra) {
        let qid = q.question_id;
        if (seen.has(qid)) {
          qid = `${q.question_id}_gap_fill`;
          let n = 2;
          while (seen.has(qid)) {
            qid = `${q.question_id}_gap_fill_${n}`;
            n += 1;
          }
          q = { ...q, question_id: qid };
        }
        drafts.push(q);
        seen.add(q.question_id);
      }
      missing = criticalGapsMissingFromQuestions(questionPlan.critical_gaps, drafts);
      if (missing.length > 0) {
        const extra2 = await fetchSupplementalQuestionsForCriticalGaps({
          apiKey,
          missingGaps: missing,
          existingQuestions: drafts,
          title,
          projectKind,
          scopeDescription,
          intentSummary: questionPlan.intent_summary,
        });
        for (let q of extra2) {
          let qid = q.question_id;
          if (seen.has(qid)) {
            qid = `${q.question_id}_gap_fill_2`;
            let n = 2;
            while (seen.has(qid)) {
              qid = `${q.question_id}_gap_fill_2_${n}`;
              n += 1;
            }
            q = { ...q, question_id: qid };
          }
          drafts.push(q);
          seen.add(q.question_id);
        }
      }
    }
  }

  const cap = maxAiSlotsBeforeFixedTail({ projectKind, scopeDescription });
  return mergeFixedProjectQuestions(drafts.slice(0, cap), hasSavedPostalCode === true, {
    projectKind,
    scopeDescription,
  });
}
