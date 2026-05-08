"use server";

import { randomUUID } from "crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PHOTOS_BUCKET } from "@/lib/supabase/constants";
import {
  getOrCreateRenovisionAnonymousSessionId,
  getRenovisionAnonymousSessionIdFromCookie,
} from "@/lib/renovision/anonymous-cookie";
import { ensureRenovisionAnonymousSessionRow } from "@/lib/renovision/usage-repository";
import {
  findHomeownerTryProjectForContext,
  getHomeownerTryProjectById,
  insertHomeownerTryProject,
  listMockupsForHomeownerProject,
  updateHomeownerTryProjectAi,
} from "@/lib/homeowner-try/repository";
import { runHomeownerTryMockupGeneration } from "@/lib/homeowner-try/run-mockup-generation";
import {
  normalizeImageBufferForDisplay,
  normalizedImageDataUrlFromStoragePath,
} from "@/lib/images/normalize-image-exif";
import {
  getBathroomStyleById,
  resolveBathroomStyleIdFromGeneration,
  type BathroomStyleConfig,
  type BathroomStyleId,
} from "@/lib/homeowner-try/bathroom-styles";
import {
  attributionFromFormData,
  mergeAttribution,
  sanitizeAttribution,
  type RenovisionAttribution,
} from "@/lib/renovision/attribution";
import { BOLD_MODERN_MOCKUP_USER_PROMPT } from "@/lib/homeowner-try/bold-modern-mockup-prompt";
import { CLEAN_REFRESH_MOCKUP_USER_PROMPT } from "@/lib/homeowner-try/clean-refresh-mockup-prompt";
import { LUXURY_ESCAPE_MOCKUP_USER_PROMPT } from "@/lib/homeowner-try/luxury-escape-mockup-prompt";
import { SPA_RETREAT_MOCKUP_USER_PROMPT } from "@/lib/homeowner-try/spa-retreat-mockup-prompt";
import { WARM_MINIMALIST_MOCKUP_USER_PROMPT } from "@/lib/homeowner-try/warm-minimalist-mockup-prompt";
import { COASTAL_BEACH_HOUSE_MOCKUP_USER_PROMPT } from "@/lib/homeowner-try/coastal-beach-house-mockup-prompt";
import { buildWetZoneRemodelPromptBlock, detectWetZoneRemodelIntent } from "@/lib/homeowner-try/wet-zone-intent";
import { resolveViewerIsAdmin } from "@/lib/admin/resolve-viewer-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HomeownerTryPageState =
  | {
      ok: true;
      anonymousSessionId: string | null;
      userEmail: string | null;
    }
  | { ok: false; message: string };

export type TryGenerationViewState = {
  generationId: string;
  projectId: string;
  selectedStyle: BathroomStyleId;
  styleName: string;
  uploadedImageUrl: string;
  generatedImageUrl: string;
  estimateRange: { min: number; max: number };
  breakdown: {
    materials: { min: number; max: number };
    labor: { min: number; max: number };
    fixtures: { min: number; max: number };
  };
  detailedBreakdown: Array<{
    category: string;
    min: number;
    max: number;
    reason: string;
  }>;
  reasoning: string[];
  assumptions: string[];
  confidence: "low" | "medium" | "high";
  saveMoneySuggestions: TryTweakSuggestion[];
  improveDesignSuggestions: TryTweakSuggestion[];
  mockupVersions: SignedTryMockupVersion[];
  activeMockupId: string;
  /** True right after first generate while the vision cost estimate runs in the background. */
  estimateRefinementPending?: boolean;
};

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** US ZIP: 5 digits or ZIP+4. Returns canonical form or null. */
function normalizeUsZipCode(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{5}$/.test(t)) return t;
  if (/^\d{5}-\d{4}$/.test(t)) return t;
  return null;
}

/**
 * OpenAI vision can fetch HTTPS URLs. Prefer a signed Supabase URL over a base64 data URL so the
 * chat payload stays small — huge data URLs from `normalizedImageDataUrlFromStoragePath` slow QA/estimate
 * dramatically and can make /try tweaks feel “stuck”.
 */
async function beforeImageUrlForOpenAiVision(
  supabase: SupabaseClient,
  beforeStoragePath: string,
  signedBeforeUrl: string | undefined | null,
): Promise<string> {
  const u = signedBeforeUrl?.trim() ?? "";
  if (u.startsWith("http")) return u;
  return (
    (await normalizedImageDataUrlFromStoragePath(supabase, PHOTOS_BUCKET, beforeStoragePath)) ?? ""
  );
}

const BATHROOM_MASTER_PROMPT = `Generate a photorealistic bathroom remodel based on the input image.

Requirements:
- Preserve the original room layout and structure
- Preserve the same camera angle and framing as the input
- Do NOT add features that wouldn't realistically fit the space
- Adapt design to small or large bathrooms appropriately
- Maintain realistic proportions and spacing
- No people, no text
- Wide angle interior photography style
- Natural lighting

The result should look like a real remodeled version of the same bathroom, not a completely different room.`;

function buildGenerationPrompt(styleId: BathroomStyleId, userText?: string): string {
  if (styleId === "spa_retreat") {
    const parts = [SPA_RETREAT_MOCKUP_USER_PROMPT];
    if (userText?.trim()) parts.push(userText.trim());
    return parts.join("\n\n");
  }
  if (styleId === "bold_modern") {
    const parts = [BOLD_MODERN_MOCKUP_USER_PROMPT];
    if (userText?.trim()) parts.push(userText.trim());
    return parts.join("\n\n");
  }
  if (styleId === "luxury_escape") {
    const parts = [LUXURY_ESCAPE_MOCKUP_USER_PROMPT];
    if (userText?.trim()) parts.push(userText.trim());
    return parts.join("\n\n");
  }
  if (styleId === "clean_refresh") {
    const parts = [CLEAN_REFRESH_MOCKUP_USER_PROMPT];
    if (userText?.trim()) parts.push(userText.trim());
    return parts.join("\n\n");
  }
  if (styleId === "warm_minimalist") {
    const parts = [WARM_MINIMALIST_MOCKUP_USER_PROMPT];
    if (userText?.trim()) parts.push(userText.trim());
    return parts.join("\n\n");
  }
  if (styleId === "coastal_beach_house") {
    const parts = [COASTAL_BEACH_HOUSE_MOCKUP_USER_PROMPT];
    if (userText?.trim()) parts.push(userText.trim());
    return parts.join("\n\n");
  }
  if (styleId === "your_vision") {
    const custom = userText?.trim();
    if (custom) return `${custom}\n\n${BATHROOM_MASTER_PROMPT}`;
    return BATHROOM_MASTER_PROMPT;
  }
  const parts = [BATHROOM_MASTER_PROMPT];
  if (userText?.trim()) parts.push(userText.trim());
  return parts.join("\n\n");
}

/** Prepends wet-zone directive when user vision mentions walk-in shower / tub conversion (initial `/try` upload). */
function buildInitialTryGenerationPrompt(
  styleId: BathroomStyleId,
  userText?: string,
): { prompt: string; wetZoneRemodelIntent: boolean } {
  const base = buildGenerationPrompt(styleId, userText);
  const wet = detectWetZoneRemodelIntent(userText ?? "");
  if (!wet) return { prompt: base, wetZoneRemodelIntent: false };
  return {
    prompt: `${buildWetZoneRemodelPromptBlock()}\n\n${base}`.slice(0, 6000),
    wetZoneRemodelIntent: true,
  };
}

const TRY_SUGGESTIONS_PER_CATEGORY = 4;
const HOMEOWNER_CUSTOM_TWEAK_MAX_CHARS = 1200;
/** Room for surgical scope + custom text + style baseline; server run pipeline also caps raw prompt length. */
const HOMEOWNER_TWEAK_PROMPT_MAX_CHARS = 9000;

function composeTweakFirstPrompt(basePrompt: string, tweakBlocks: string[]): string {
  const blocks = tweakBlocks.map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return basePrompt.slice(0, HOMEOWNER_TWEAK_PROMPT_MAX_CHARS);
  return `${blocks.join("\n\n")}\n\nSTYLE BASELINE (apply after the tweak instructions above):\n${basePrompt}`.slice(
    0,
    HOMEOWNER_TWEAK_PROMPT_MAX_CHARS,
  );
}

function parseRequestedPercent(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*%/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(10, Math.min(40, Math.round(n)));
}

type FixtureScaleDirective = {
  fixture: string;
  direction: "increase" | "decrease";
  percent: number;
};

type FixtureTarget = "tub" | "shower" | "vanity" | "mirror" | "toilet" | "lighting" | "tile";

function extractFixtureScaleDirectives(text: string): FixtureScaleDirective[] {
  const t = text.toLowerCase();
  const wantsIncrease =
    t.includes("bigger") ||
    t.includes("larger") ||
    t.includes("wider") ||
    t.includes("widen") ||
    t.includes("expand") ||
    t.includes("increase") ||
    t.includes("more ");
  const wantsDecrease =
    t.includes("smaller") ||
    t.includes("narrower") ||
    t.includes("shrink") ||
    t.includes("reduce") ||
    t.includes("less ");
  if (!wantsIncrease && !wantsDecrease) return [];
  const direction: "increase" | "decrease" =
    wantsIncrease && !wantsDecrease ? "increase" : wantsDecrease && !wantsIncrease ? "decrease" : "increase";
  const defaultPct = direction === "increase" ? 25 : 20;
  const pct = parseRequestedPercent(t) ?? defaultPct;

  const fixtureAliases: Array<{ fixture: string; aliases: string[] }> = [
    { fixture: "vanity", aliases: ["vanity", "cabinet", "countertop", "sink cabinet"] },
    { fixture: "mirror", aliases: ["mirror", "medicine cabinet"] },
    { fixture: "shower glass", aliases: ["shower glass", "glass panel", "shower door"] },
  ];

  const out: FixtureScaleDirective[] = [];
  for (const f of fixtureAliases) {
    if (f.aliases.some((a) => t.includes(a))) {
      out.push({ fixture: f.fixture, direction, percent: pct });
    }
  }
  return out;
}

function applyFixtureScaleDirectivesIfNeeded(basePrompt: string, allTweakText: string[]): string {
  const joined = allTweakText.join("\n").trim();
  if (!joined) return basePrompt;
  const directives = extractFixtureScaleDirectives(joined);
  if (directives.length === 0) return basePrompt;
  const lines = directives.map((d) =>
    d.direction === "increase"
      ? `- Increase ${d.fixture} size by approximately ${d.percent}% in place (same wall/zone).`
      : `- Decrease ${d.fixture} size by approximately ${d.percent}% in place (same wall/zone).`,
  );
  return composeTweakFirstPrompt(basePrompt, [
    `FIXTURE SCALE OVERRIDES (MANDATORY FOR THIS RUN):
${lines.join("\n")}
- Keep room geometry/camera fixed; do not zoom out or reframe.
- Preserve ROOM SIZE MATCH vs the source: same apparent wall spans, door/opening widths in frame, and floor visible — do not make the room feel larger or smaller than the before photo.
- Scale changes apply only to the named fixture locally; do not stretch tile fields, walls, or perspective to “make space.”
- If a target fixture is partially edge-cropped, keep crop context while still applying the size change.
- Reject no-op outcome: if requested fixture size is visually unchanged, the result is invalid for this run.`,
  ]);
}

function extractCustomPromptTargets(text: string): FixtureTarget[] {
  const t = text.toLowerCase();
  const out: FixtureTarget[] = [];
  const push = (k: FixtureTarget) => {
    if (!out.includes(k)) out.push(k);
  };
  if (t.includes("tub") || t.includes("bathtub")) push("tub");
  if (t.includes("shower") || t.includes("glass")) push("shower");
  if (t.includes("vanity") || t.includes("cabinet") || t.includes("counter")) push("vanity");
  if (t.includes("mirror") || t.includes("medicine cabinet")) push("mirror");
  if (t.includes("toilet")) push("toilet");
  if (t.includes("light") || t.includes("sconce") || t.includes("pendant")) push("lighting");
  if (t.includes("tile") || t.includes("grout") || t.includes("floor")) push("tile");
  return out;
}

function applyCustomPromptHardRequirements(basePrompt: string, customTweakRaw: string): string {
  const custom = customTweakRaw.trim();
  if (!custom) return basePrompt;
  const targets = extractCustomPromptTargets(custom);
  const wetZone = detectWetZoneRemodelIntent(custom);
  const targetLine =
    targets.length > 0
      ? `- Required visible changes must involve: ${targets.join(", ")}.`
      : "- Required visible changes must directly reflect the homeowner custom text.";
  const geometryLine = wetZone
    ? "- Keep the same bathroom outer shell, camera, and perceived room size; tub/shower enclosure, glass, and curb may change within the existing wet footprint to match the custom text."
    : "- Keep room geometry/framing fixed while applying the custom change in place.";
  return composeTweakFirstPrompt(basePrompt, [
    `CUSTOM PROMPT EXECUTION (HIGHEST PRIORITY):
- The custom text below is mandatory for this run and must produce at least one clearly visible change.
${targetLine}
- Limit edits to what the custom text describes; do not restyle unrelated fixtures, walls, or finishes.
- Do not treat the custom text as optional styling; output is invalid if it looks unchanged versus the source.
${geometryLine}
CUSTOM TEXT:
${custom}`,
  ]);
}

/** Lists exactly what this tweak run may change; everything else must stay as the baseline mockup. */
function buildSurgicalTweakScopeBlock(params: {
  saveHintSelections: string[];
  designHintSelections: string[];
  legacyHint: string;
  customTweakRaw: string;
}): string {
  const lines: string[] = [];
  for (const h of params.saveHintSelections) {
    lines.push(`[Lower cost] ${h}`);
  }
  for (const h of params.designHintSelections) {
    lines.push(`[Design upgrade] ${h}`);
  }
  const legacy = params.legacyHint.trim();
  if (legacy) lines.push(`[Hint] ${legacy}`);
  const custom = params.customTweakRaw.trim();
  if (custom) lines.push(`[Custom] ${custom.slice(0, 900)}`);
  if (lines.length === 0) return "";
  const enumerated = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
  return [
    "SURGICAL SCOPE (THIS RUN ONLY) — AUTHORIZED CHANGES:",
    "You may ONLY modify what is necessary to implement the numbered items below.",
    "Do NOT change unrelated tiles, paint, fixtures, lighting, or decor outside what those items imply.",
    "Keep all other areas of the baseline image materially unchanged (same finishes, same colors, same fixtures where not listed).",
    "Do NOT apply a whole-room restyle, broad palette shift, or style refresh beyond these items.",
    "Authorized items:",
    enumerated,
  ].join("\n");
}

/** One tweak line plus an approximate shift to total job cost (vs the estimate you output for this AFTER). */
export type TryTweakSuggestion = {
  text: string;
  /** Whole USD; negative = reduces typical total, positive = increases. Align with `text`. */
  deltaMin: number;
  deltaMax: number;
};

/** Wraps free-text homeowner tweaks so the image model treats them as finish-only deltas on the baseline (or wet-zone remodel when detected). */
function appendHomeownerCustomTweakBlock(basePrompt: string, customTrimmed: string): string {
  if (!customTrimmed) return basePrompt;
  const wet = detectWetZoneRemodelIntent(customTrimmed);
  const finishOnlyRules =
    "- Apply custom requests as literally as possible while preserving the same room geometry/camera and the same **perceived room size** as the before photo (wall spans, floor area, door openings in frame must match the source scale).\n- Allowed custom changes include: finishes/styling plus **local fixture scale adjustments** (example: wider vanity run, larger mirror) without changing how large the room reads.\n- For vanity-size requests: adjust the vanity/counter along its existing wall only; do not widen the room or change tile/wall scale to fake extra space.\n- **Do not** move/remove walls, doors, or windows; change room width; relocate toilet, tub/shower, vanity wall position, or drains; add/remove fixture count; widen the shower footprint; or crop/reframe to hide fixtures.\n- If any phrase implies structural/layout/plumbing relocation, ignore only that incompatible part and still apply all compatible parts visibly.";
  const wetZoneRules =
    "- This text requests a **wet-zone remodel visualization** (tub/shower area). Show a **clear visible change** in the wet zone vs the baseline — no-op is invalid.\n- Keep the same bathroom outer shell, same camera, same perceived room size; wet-zone enclosure, curb, glass, and opening **may** change within the existing wet footprint.\n- Do **not** move exterior walls, windows, or room-scale geometry; do **not** relocate toilet or vanity unless the custom text explicitly asks.\n- Do **not** crop or reframe to hide fixtures.";
  return composeTweakFirstPrompt(basePrompt, [
    `HOMEOWNER CUSTOM TWEAK (apply only compatible parts on top of everything above):\n${customTrimmed}\n\nINTERPRETATION RULES FOR THE CUSTOM TEXT:\n${wet ? wetZoneRules : finishOnlyRules}`,
  ]);
}

/** Optional hint from UI (legacy single-line hint). */
function buildRegenerateAdditionalPrompt(
  styleId: BathroomStyleId,
  hint: string,
  kind: "" | "save_money" | "improve_design",
): string {
  const base = buildGenerationPrompt(styleId);
  const trimmed = hint.trim().slice(0, 800);
  if (!trimmed) return base;
  const focus =
    kind === "save_money"
      ? `SAVE MONEY / LOWER-COST DIRECTION — apply this while keeping identical room geometry, fixture positions, and openings (materials and product selections only; no layout or plumbing moves):\n${trimmed}`
      : kind === "improve_design"
        ? `DESIGN UPGRADE DIRECTION — apply this while keeping identical room geometry and fixture positions (finishes, palette, lighting character, decor level; do not widen the room or move walls):\n${trimmed}`
        : `REMODEL TWEAK (same geometry):\n${trimmed}`;
  return composeTweakFirstPrompt(base, [focus]);
}

/** Multi-select tweak: apply every selected bullet together (same geometry). */
function buildMultiSuggestionPrompt(
  styleId: BathroomStyleId,
  saveHints: string[],
  designHints: string[],
): string {
  const base = buildGenerationPrompt(styleId);
  const blocks: string[] = [];
  const selectedHints = [...saveHints, ...designHints].map((h) => h.trim()).filter(Boolean);
  if (saveHints.length > 0) {
    const body = saveHints.map((h, i) => `${i + 1}. ${h.trim()}`).join("\n");
    blocks.push(
      `SAVE MONEY / LOWER-COST — apply **all** selected items together while keeping identical room geometry, fixture positions, and openings (materials and product selections only; no layout or plumbing moves):\n${body}`,
    );
  }
  if (designHints.length > 0) {
    const body = designHints.map((h, i) => `${i + 1}. ${h.trim()}`).join("\n");
    blocks.push(
      `DESIGN UPGRADE — apply **all** selected items together while keeping identical room geometry and fixture positions (finishes, palette, lighting character, decor; do not widen the room or move walls):\n${body}`,
    );
  }
  if (blocks.length === 0) return base;
  blocks.unshift(
    "MANDATORY EXECUTION: visibly apply each selected tweak on this run. If two selected tweaks conflict, keep layout fixed and apply the closest finish-level version of both.",
  );
  if (selectedHints.length > 0) {
    blocks.unshift(
      `NO-OP IS FORBIDDEN: output must be visually different from the source mockup in ways that clearly reflect these selected tweaks:\n${selectedHints.map((h, i) => `${i + 1}. ${h}`).join("\n")}`,
    );
  }
  blocks.push(
    "CHECKLIST: After rendering, a reviewer must be able to point to visible evidence of each selected bullet (color, fixture style, material, or lighting change) versus the baseline mockup.",
  );
  return composeTweakFirstPrompt(base, blocks);
}

/** Appended when editing from an existing mockup or applying a tweak hint — limits drift. */
function buildTweakEditGuardrails(wetZoneRemodelIntent: boolean): string {
  const outerShell =
    "Do NOT move, remove, or add exterior bathroom walls, doors, windows, niches, or pony walls.";
  const showerLock =
    "Do NOT change shower opening width or glass footprint unless this run explicitly requests a wet-zone remodel (walk-in / curbless / tub-to-shower); those requests override shower-enclosure locks inside the wet footprint only.";
  const wetZoneException = [
    outerShell,
    "WET-ZONE EXCEPTION (THIS RUN): Tub/shower enclosure, curb, glass layout, and walk-in opening MAY change within the existing wet footprint to satisfy the homeowner wet-zone request.",
    "Keep toilet, vanity, and dry areas unchanged unless the authorized bullet/custom text explicitly mentions them.",
  ].join("\n\n");

  const normalShowerLock = [outerShell, showerLock].join("\n\n");

  const base = [
    "TWEAK / ITERATION MODE (HIGHEST PRIORITY FOR THIS RUN):",
    "The homeowner chose specific bullets and/or typed custom directions — those requests must appear in the output image, not be averaged away by generic preservation rules.",
    "Use the provided baseline image as the layout truth: same camera angle, same room footprint, same corners and openings.",
    wetZoneRemodelIntent
      ? "Apply the homeowner-requested changes — including wet-zone remodel visualization when requested — without re-imagining unrelated areas."
      : "Apply only incremental finish and styling changes needed to satisfy the instruction — not a full re-imagination of the room.",
    "SURGICAL EDITS ONLY: Change only what this run explicitly asks for (listed bullets and/or custom text). Leave every unrelated surface, fixture, and finish matching the baseline mockup unless a tiny blend at an edited edge is unavoidable.",
    "Do NOT run a whole-room restyle, palette swap, or unrelated upgrade.",
    wetZoneRemodelIntent ? wetZoneException : normalShowerLock,
    wetZoneRemodelIntent
      ? "Keep toilet location and visibility consistent unless the prompt asks to change it. Vanity/dry zones stay as baseline unless explicitly authorized."
      : "Do NOT change fixture count or plumbing locations. Keep toilet, sink, and wet area in the same positions and visibility as the baseline.",
    "Do NOT widen the room, change perspective, or crop to hide fixtures. If unsure, change nothing about geometry.",
  ];
  return base.join("\n\n");
}

function appendTweakGuardrailsIfNeeded(
  prompt: string,
  opts: { tweakMode: boolean; wetZoneRemodelIntent?: boolean },
): string {
  if (!opts.tweakMode) return prompt;
  return `${prompt}\n\n${buildTweakEditGuardrails(Boolean(opts.wetZoneRemodelIntent))}`;
}

export type SignedTryMockupVersion = {
  id: string;
  label: string;
  imageUrl: string;
  storagePath: string;
  caption?: string | null;
};

async function loadSignedMockupVersionsForProject(
  projectId: string,
  ttlSeconds: number,
): Promise<SignedTryMockupVersion[]> {
  const svc = createServiceClient();
  const rows = await listMockupsForHomeownerProject(projectId);
  const sorted = [...rows].sort((a, b) => a.mockup_generation - b.mockup_generation);
  const out: SignedTryMockupVersion[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    const signed = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(row.storage_path, ttlSeconds);
    if (!signed.data?.signedUrl) continue;
    out.push({
      id: row.id,
      label: `v${i + 1}`,
      imageUrl: signed.data.signedUrl,
      storagePath: row.storage_path,
      caption: row.caption,
    });
  }
  return out;
}

async function mockupBelongsToProject(projectId: string, mockupId: string): Promise<boolean> {
  if (!mockupId) return false;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("homeowner_try_mockups")
    .select("id")
    .eq("project_id", projectId)
    .eq("id", mockupId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

type BathroomEstimateBreakdown = {
  estimateRange: { min: number; max: number };
  breakdown: {
    materials: { min: number; max: number };
    labor: { min: number; max: number };
    fixtures: { min: number; max: number };
  };
  detailedBreakdown: Array<{
    category: string;
    min: number;
    max: number;
    reason: string;
  }>;
  reasoning: string[];
  assumptions: string[];
  confidence: "low" | "medium" | "high";
  /** Image-grounded ways to reduce cost without layout changes (UI shows 4). */
  saveMoneySuggestions: TryTweakSuggestion[];
  /** Image-grounded design upgrades for the selected style (UI shows 4). */
  improveDesignSuggestions: TryTweakSuggestion[];
};

const TRY_ESTIMATE_SNAPSHOT_VERSION = 1;

function tryEstimateSnapshotFromBreakdown(b: BathroomEstimateBreakdown): Record<string, unknown> {
  return {
    v: TRY_ESTIMATE_SNAPSHOT_VERSION,
    estimateRange: b.estimateRange,
    breakdown: b.breakdown,
    detailedBreakdown: b.detailedBreakdown,
    reasoning: b.reasoning,
    assumptions: b.assumptions,
    confidence: b.confidence,
    saveMoneySuggestions: b.saveMoneySuggestions,
    improveDesignSuggestions: b.improveDesignSuggestions,
  };
}

export type TryEstimatePollFields = {
  estimateRange: { min: number; max: number };
  breakdown: TryGenerationViewState["breakdown"];
  detailedBreakdown: TryGenerationViewState["detailedBreakdown"];
  reasoning: string[];
  assumptions: string[];
  confidence: TryGenerationViewState["confidence"];
  saveMoneySuggestions: TryTweakSuggestion[];
  improveDesignSuggestions: TryTweakSuggestion[];
};

function parseTryEstimateSnapshotJson(raw: unknown): TryEstimatePollFields | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (Number(o.v) !== TRY_ESTIMATE_SNAPSHOT_VERSION) return null;
  const er = o.estimateRange as Record<string, unknown> | undefined;
  const bd = o.breakdown as Record<string, unknown> | undefined;
  if (!er || !bd) return null;
  const min = Number(er.min);
  const max = Number(er.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const materials = bd.materials as Record<string, unknown> | undefined;
  const labor = bd.labor as Record<string, unknown> | undefined;
  const fixtures = bd.fixtures as Record<string, unknown> | undefined;
  if (!materials || !labor || !fixtures) return null;
  const confidenceRaw = String(o.confidence ?? "medium").toLowerCase();
  const confidence =
    confidenceRaw === "low" || confidenceRaw === "medium" || confidenceRaw === "high" ? confidenceRaw : "medium";
  const mapSuggestions = (arr: unknown, savings: boolean): TryTweakSuggestion[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((row) => parseSuggestionImpactRow(row, { text: "", deltaMin: 0, deltaMax: 0 }, savings));
  };
  return {
    estimateRange: { min, max },
    breakdown: {
      materials: { min: Number(materials.min), max: Number(materials.max) },
      labor: { min: Number(labor.min), max: Number(labor.max) },
      fixtures: { min: Number(fixtures.min), max: Number(fixtures.max) },
    },
    detailedBreakdown: Array.isArray(o.detailedBreakdown)
      ? o.detailedBreakdown
          .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"))
          .map((x) => ({
            category: String(x.category ?? "").trim().slice(0, 140),
            min: Number(x.min),
            max: Number(x.max),
            reason: String(x.reason ?? "").trim().slice(0, 320),
          }))
          .filter((x) => x.category)
      : [],
    reasoning: Array.isArray(o.reasoning) ? o.reasoning.map((x) => String(x).trim()).filter(Boolean) : [],
    assumptions: Array.isArray(o.assumptions) ? o.assumptions.map((x) => String(x).trim()).filter(Boolean) : [],
    confidence,
    saveMoneySuggestions: mapSuggestions(o.saveMoneySuggestions, true),
    improveDesignSuggestions: mapSuggestions(o.improveDesignSuggestions, false),
  };
}

type VisibleScopeDiffSignals = {
  mirrorChanged: boolean;
  doorOrWindowChanged: boolean;
};

const TRY_DELTA_ABS_CAP = 25_000;

function clampDeltaPair(deltaMin: number, deltaMax: number, savings: boolean): { deltaMin: number; deltaMax: number } {
  let a = Math.round(deltaMin);
  let b = Math.round(deltaMax);
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = 0;
  if (a > b) [a, b] = [b, a];
  a = Math.max(-TRY_DELTA_ABS_CAP, Math.min(TRY_DELTA_ABS_CAP, a));
  b = Math.max(-TRY_DELTA_ABS_CAP, Math.min(TRY_DELTA_ABS_CAP, b));
  if (savings) {
    b = Math.min(b, 0);
    a = Math.min(a, b);
  } else {
    a = Math.max(a, 0);
    b = Math.max(b, a);
  }
  return { deltaMin: a, deltaMax: b };
}

function parseSuggestionImpactRow(
  row: unknown,
  fallback: TryTweakSuggestion,
  savings: boolean,
): TryTweakSuggestion {
  if (typeof row === "string") {
    const text = row.trim().slice(0, 400) || fallback.text;
    return { text, ...clampDeltaPair(fallback.deltaMin, fallback.deltaMax, savings) };
  }
  if (row && typeof row === "object") {
    const o = row as Record<string, unknown>;
    const text =
      String(o.text ?? o.label ?? o.suggestion ?? "")
        .trim()
        .slice(0, 400) || fallback.text;
    const dMin = Number(o.delta_min ?? o.deltaMin ?? o.min);
    const dMax = Number(o.delta_max ?? o.deltaMax ?? o.max);
    const pair = Number.isFinite(dMin) && Number.isFinite(dMax)
      ? clampDeltaPair(dMin, dMax, savings)
      : clampDeltaPair(fallback.deltaMin, fallback.deltaMax, savings);
    return { text, ...pair };
  }
  return { ...fallback, text: fallback.text || "—" };
}

function normalizeTryTweakSuggestions(
  raw: unknown,
  fallbacks: TryTweakSuggestion[],
  maxTextLen: number,
  count: number,
  savings: boolean,
): TryTweakSuggestion[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: TryTweakSuggestion[] = [];
  for (let i = 0; i < count; i += 1) {
    const fb = fallbacks[i] ?? fallbacks[fallbacks.length - 1];
    const parsed = parseSuggestionImpactRow(arr[i], fb, savings);
    out.push({
      text: parsed.text.slice(0, maxTextLen),
      deltaMin: parsed.deltaMin,
      deltaMax: parsed.deltaMax,
    });
  }
  return out;
}

function suggestionAppearsToBeLayoutOrUpsizeDrift(text: string): boolean {
  const t = normalizeSuggestionTextForCompare(text);
  if (!t) return false;
  // Common hallucinations: asking to enlarge dominant fixtures or change spatial layout.
  const upsizeFixture =
    /(bigger|larger|enlarge|expand|wider|increase size|upsize|oversized|full width|wall to wall).{0,30}(mirror|vanity|shower|toilet|window|door)/.test(
      t,
    ) ||
    /(mirror|vanity|shower|toilet|window|door).{0,30}(bigger|larger|enlarge|expand|wider|increase size|upsize|oversized|full width|wall to wall)/.test(
      t,
    );
  const layoutMove =
    /(move|relocate|reposition|shift|open up|open the room|widen the room|reframe|zoom out|change layout|change floor plan|increase spacing)/.test(
      t,
    );
  return upsizeFixture || layoutMove;
}

function suggestionAppearsPhysicallyInfeasibleForVisibleScene(text: string): boolean {
  const t = normalizeSuggestionTextForCompare(text);
  if (!t) return false;
  // Common impossible recommendation when mirror already occupies the vanity wall.
  const blockedVanityWallAddOn =
    /(add|install|introduce|create|put).{0,24}(backsplash|accent wall|feature wall|wall panel|wallpaper)/.test(
      t,
    ) &&
    /(behind|above|around).{0,24}(vanity|mirror)/.test(t);
  // Similar impossible asks near mirror/vanity when no free wall zone is implied.
  const blockedMirrorZoneAddOn =
    /(add|install|introduce|create|put).{0,28}(tile strip|tile band|slab splash|stone splash|mosaic)/.test(
      t,
    ) &&
    /(behind|under|around).{0,24}(mirror|vanity)/.test(t);
  // Universal guard: do not propose "space behind sinks/vanity" add-ons in tweak cards.
  const assumesBehindSinkRoom =
    /(behind|back wall behind|area behind|space behind|wall behind).{0,20}(sink|sinks|vanity)/.test(t) ||
    /(backsplash|accent wall|feature wall|tile band|wall panel|wallpaper).{0,28}(sink|sinks|vanity)/.test(
      t,
    );
  return blockedVanityWallAddOn || blockedMirrorZoneAddOn || assumesBehindSinkRoom;
}

function sanitizeSuggestionsAgainstImageAGuardrails(
  suggestions: TryTweakSuggestion[],
  fallbacks: TryTweakSuggestion[],
): TryTweakSuggestion[] {
  return suggestions.map((row, idx) => {
    const blocked =
      suggestionAppearsToBeLayoutOrUpsizeDrift(row.text) ||
      suggestionAppearsPhysicallyInfeasibleForVisibleScene(row.text);
    if (!blocked) return row;
    const fb = fallbacks[idx] ?? fallbacks[fallbacks.length - 1];
    return {
      text: fb?.text || row.text,
      deltaMin: fb?.deltaMin ?? row.deltaMin,
      deltaMax: fb?.deltaMax ?? row.deltaMax,
    };
  });
}

function normalizeSuggestionTextForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function suggestionTextsAreSimilar(a: string, b: string): boolean {
  const na = normalizeSuggestionTextForCompare(a);
  const nb = normalizeSuggestionTextForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" ").filter((w) => w.length > 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return false;
  let overlap = 0;
  for (const w of wa) {
    if (wb.has(w)) overlap += 1;
  }
  const ratio = overlap / Math.min(wa.size, wb.size);
  return ratio >= 0.7;
}

function pruneUsedTweakSuggestions(params: {
  suggestions: TryTweakSuggestion[];
  selectedThisRun: string[];
  fallbackSuggestions: TryTweakSuggestion[];
}): TryTweakSuggestion[] {
  const selected = params.selectedThisRun.map(normalizeSuggestionTextForCompare).filter(Boolean);
  const out: TryTweakSuggestion[] = [];
  for (const row of params.suggestions) {
    const isBlocked = selected.some((picked) => suggestionTextsAreSimilar(row.text, picked));
    const isDup = out.some((existing) => suggestionTextsAreSimilar(existing.text, row.text));
    if (isBlocked || isDup) continue;
    out.push(row);
  }
  if (out.length < TRY_SUGGESTIONS_PER_CATEGORY) {
    for (const fb of params.fallbackSuggestions) {
      const isBlocked = selected.some((picked) => suggestionTextsAreSimilar(fb.text, picked));
      const isDup = out.some((existing) => suggestionTextsAreSimilar(existing.text, fb.text));
      if (isBlocked || isDup) continue;
      out.push(fb);
      if (out.length >= TRY_SUGGESTIONS_PER_CATEGORY) break;
    }
  }
  return out.slice(0, TRY_SUGGESTIONS_PER_CATEGORY);
}

function clampMoney(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function textMentionsMirrorWork(text: string): boolean {
  const t = text.toLowerCase();
  return /(mirror|medicine cabinet|vanity light|sconce)/.test(t);
}

function hasBreakdownTopic(
  rows: Array<{ category: string; reason: string }>,
  pattern: RegExp,
): boolean {
  return rows.some((row) => pattern.test(`${row.category} ${row.reason}`.toLowerCase()));
}

function estimateLineRangeFromTotalBand(
  totalMin: number,
  totalMax: number,
  pctMin: number,
  pctMax: number,
  hardFloor: number,
): { min: number; max: number } {
  const min = Math.max(hardFloor, Math.round(totalMin * pctMin));
  const max = Math.max(min, Math.round(totalMax * pctMax));
  return { min, max };
}

async function detectVisibleScopeDiffSignals(params: {
  apiKey: string;
  beforeImageUrl: string;
  afterImageUrl: string;
}): Promise<VisibleScopeDiffSignals | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "Compare two bathroom images and return strict JSON only. Detect visible change signals conservatively.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "IMAGE A = latest mockup (after). IMAGE B = original before." },
              { type: "image_url", image_url: { url: params.afterImageUrl, detail: "low" } },
              { type: "image_url", image_url: { url: params.beforeImageUrl, detail: "low" } },
              {
                type: "text",
                text:
                  'Return JSON: {"mirror_changed": boolean, "door_or_window_changed": boolean}. Use true only if clearly visible differences exist.',
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseJsonObject(raw);
    if (!parsed) return null;
    return {
      mirrorChanged: Boolean(parsed.mirror_changed),
      doorOrWindowChanged: Boolean(parsed.door_or_window_changed),
    };
  } catch {
    return null;
  }
}

function tweakPair(text: string, deltaMin: number, deltaMax: number): TryTweakSuggestion {
  return { text, deltaMin, deltaMax };
}

/** When vision/JSON fails, tweak bullets must still match the homeowner's style — not generic spa copy. */
function fallbackTweakSuggestionsForStyle(styleId: BathroomStyleId): {
  saveMoneySuggestions: TryTweakSuggestion[];
  improveDesignSuggestions: TryTweakSuggestion[];
} {
  switch (styleId) {
    case "spa_retreat":
      return {
        saveMoneySuggestions: [
          tweakPair(
            "Choose larger-format porcelain in a calm spa tone instead of small-format mosaic or intricate layouts.",
            -900,
            -350,
          ),
          tweakPair(
            "Keep existing lighting locations; upgrade to simpler damp-rated fixtures with similar warm-white output.",
            -450,
            -150,
          ),
          tweakPair(
            "Swap premium stone-look materials for durable porcelain with a similar soft, bright character.",
            -800,
            -250,
          ),
          tweakPair(
            "Phase towels, plants, and styling; finish wet-area and vanity surfaces first for the spa feel.",
            -600,
            -150,
          ),
        ],
        improveDesignSuggestions: [
          tweakPair(
            "Add cohesive warm accent pieces (linen towels, small wood accessory) that deepen the spa-calm palette.",
            80,
            400,
          ),
          tweakPair(
            "Introduce slightly richer shower wall texture while staying bright and hotel-inspired.",
            200,
            900,
          ),
          tweakPair(
            "Unify metal finishes on hooks, bars, and shower hardware for a cleaner resort-like look.",
            120,
            450,
          ),
          tweakPair(
            "Softer one-step wall tone shift to tie floor and shower tile into one calm field.",
            150,
            550,
          ),
        ],
      };
    case "clean_refresh":
      return {
        saveMoneySuggestions: [
          tweakPair(
            "Use standard white or soft-neutral field tile with simple stack or offset pattern instead of specialty shapes.",
            -700,
            -250,
          ),
          tweakPair(
            "Retain vanity carcass if sound; refinish or replace doors and top only for a budget modern look.",
            -900,
            -350,
          ),
          tweakPair(
            "Paint and refresh hardware rather than a full fixture package where locations already work.",
            -500,
            -150,
          ),
          tweakPair(
            "Phase accessories; prioritize tub or shower surround and vanity counter visibility first.",
            -550,
            -150,
          ),
        ],
        improveDesignSuggestions: [
          tweakPair(
            "Step up to a slightly crisper vanity faucet and coordinating cabinet hardware for a simple modern read.",
            100,
            380,
          ),
          tweakPair(
            "Add one quality LED vanity bar or sconce tier for cleaner task light without moving boxes.",
            150,
            550,
          ),
          tweakPair(
            "Unify grout and trim in white or stone-neutral choices so the refresh feels intentional, not patched.",
            120,
            400,
          ),
          tweakPair(
            "Introduce subtle contrast on one focal plane (shower niche face or vanity wall) within the same neutral family.",
            180,
            650,
          ),
        ],
      };
    case "luxury_escape":
      return {
        saveMoneySuggestions: [
          tweakPair(
            "Keep a premium look with large-format porcelain slabs or book-matched lookalikes instead of full natural stone everywhere.",
            -2500,
            -800,
          ),
          tweakPair(
            "Retain hero stone or tile on one focal wall; simplify secondary walls to coordinated porcelain.",
            -1800,
            -500,
          ),
          tweakPair(
            "Specify mid-tier designer fixture lines with the same silhouette; avoid custom metal finishes.",
            -1200,
            -400,
          ),
          tweakPair(
            "Phase decorative lighting and art; lock wet-area and vanity statement finishes first.",
            -900,
            -300,
          ),
        ],
        improveDesignSuggestions: [
          tweakPair(
            "Layer dim-to-warm lighting and a subtle accent (niche glow, toe-kick, or cove) to deepen dramatic contrast.",
            250,
            900,
          ),
          tweakPair(
            "Upgrade to a thicker countertop edge and undermount refinement for a more bespoke vanity moment.",
            400,
            1200,
          ),
          tweakPair(
            "Tighten the metal story to one luxury family across all touch points (brass, bronze, or polished nickel).",
            200,
            650,
          ),
          tweakPair(
            "Add textural wall treatment or richer grout contrast on a key tile plane for a more editorial feel.",
            300,
            950,
          ),
        ],
      };
    case "bold_modern":
      return {
        saveMoneySuggestions: [
          tweakPair(
            "Keep the dark accent story with large-format charcoal or ink tile instead of small mosaic labor.",
            -850,
            -300,
          ),
          tweakPair(
            "Use matte-black stock hardware lines rather than fully custom pulls and brackets.",
            -500,
            -180,
          ),
          tweakPair(
            "Simplify shower glass to standard black-channel framing versus fully custom steel details when A allows.",
            -1200,
            -400,
          ),
          tweakPair(
            "Phase decor; prioritize surfaces and fixtures that carry the sleek modern contrast.",
            -550,
            -150,
          ),
        ],
        improveDesignSuggestions: [
          tweakPair(
            "Sharpen contrast: crisper black trim, slim LED profile, or darker grout for a more architectural read.",
            150,
            600,
          ),
          tweakPair(
            "Upgrade to a slimmer vanity profile or integrated handle detail for a more bespoke modern line.",
            350,
            1100,
          ),
          tweakPair(
            "Unify all metals to matte black or one intentional mixed-metal story — no stray chrome.",
            120,
            450,
          ),
          tweakPair(
            "Add a linear accent (stacked tile or metal trim) that reinforces the bold graphic character.",
            200,
            750,
          ),
        ],
      };
    case "warm_minimalist":
      return {
        saveMoneySuggestions: [
          tweakPair(
            "Keep the wood-tone vanity direction with veneer or RTA fronts instead of full custom millwork.",
            -1100,
            -400,
          ),
          tweakPair(
            "Use large soft-neutral field tile with minimal pattern instead of handmade variation everywhere.",
            -750,
            -250,
          ),
          tweakPair(
            "Retain existing lighting locations; upgrade to simple architectural fixtures with warm CCT.",
            -450,
            -150,
          ),
          tweakPair(
            "Phase styling objects; invest in tile and wood hardware cohesion first.",
            -550,
            -150,
          ),
        ],
        improveDesignSuggestions: [
          tweakPair(
            "Refine wood stain warmth one step and match towel and textile tones for a calmer minimalist envelope.",
            100,
            450,
          ),
          tweakPair(
            "Add quiet texture (fine-grain tile, limewash hint, or wool-look rug) without breaking simple shapes.",
            200,
            750,
          ),
          tweakPair(
            "Unify to warm brass or soft black hardware so the palette feels edited, not mixed.",
            120,
            480,
          ),
          tweakPair(
            "Improve indirect lighting (sconce glow, dimmer curve) to flatter the wood and neutrals.",
            180,
            620,
          ),
        ],
      };
    case "your_vision":
      return {
        saveMoneySuggestions: [
          tweakPair(
            "Prioritize paint, hardware, and standard-format tile over bespoke materials while matching your described look.",
            -900,
            -320,
          ),
          tweakPair(
            "Keep fixture locations; upgrade finishes and fixture lines that fit your palette without moving plumbing.",
            -750,
            -250,
          ),
          tweakPair(
            "Use in-stock vanity sizes and porcelain field tile in your chosen tone instead of full custom pieces.",
            -1100,
            -400,
          ),
          tweakPair(
            "Phase decor and accessories after locking surfaces and lighting that match your vision.",
            -500,
            -150,
          ),
        ],
        improveDesignSuggestions: [
          tweakPair(
            "Tighten palette cohesion (metal family + grout + wall tone) so the room reads closer to your written direction.",
            150,
            650,
          ),
          tweakPair(
            "Upgrade one focal plane (vanity wall or shower feature) with richer texture while staying in-budget.",
            200,
            800,
          ),
          tweakPair(
            "Improve vanity lighting quality (sconce or bar) for a more polished version of the same layout.",
            120,
            520,
          ),
          tweakPair(
            "Add intentional contrast or accent tile only where your description calls for a focal moment.",
            180,
            700,
          ),
        ],
      };
    case "coastal_beach_house":
      return {
        saveMoneySuggestions: [
          tweakPair(
            "Use affordable light glazed tile in sand or sea-glass tones instead of specialty artisan mosaics.",
            -800,
            -280,
          ),
          tweakPair(
            "Paint shiplap or flat panels in airy white or soft blue versus solid surfacing on large vertical areas.",
            -600,
            -200,
          ),
          tweakPair(
            "Choose stock bathroom lines with relaxed shapes versus bespoke boutique coastal fixtures.",
            -500,
            -180,
          ),
          tweakPair(
            "Phase woven accents and art; finish floor and shower in the bright beachy palette first.",
            -550,
            -150,
          ),
        ],
        improveDesignSuggestions: [
          tweakPair(
            "Layer a soft blue-green accent in towels or ceramics without muddying the airy base.",
            90,
            400,
          ),
          tweakPair(
            "Add natural texture (light wood shelf, linen, subtle seagrass) within the bright relaxed mood.",
            150,
            550,
          ),
          tweakPair(
            "Upgrade to consistent coastal metals (polished nickel or brushed gold) on hooks and vanity.",
            130,
            480,
          ),
          tweakPair(
            "Improve natural-light feel with lighter privacy glass and brighter wall bounce.",
            180,
            600,
          ),
        ],
      };
    default: {
      const _n: never = styleId;
      return _n;
    }
  }
}

function styleLockBlockForEstimate(cfg: BathroomStyleConfig): string {
  return [
    "**STYLE LOCK (save_money + improve_design):**",
    `- Homeowner chose **${cfg.name}** — ${cfg.subtitle}.`,
    `- Every tweak line must stay in that lane: same palette family, fixture character, and mood as IMAGE A and this style.`,
    "- save_money: cheaper swaps, trims, or phasing that **still read as this same style** — never undo the look to pivot to a different interior genre.",
    "- improve_design: refinements that **deepen this style** (quality, cohesion, lighting, detail) — not a different named aesthetic (no farmhouse, industrial, or cottage cues unless IMAGE A already established them).",
    `- Design intent anchor: ${cfg.scopeSeed}`,
  ].join("\n");
}

function defaultEstimateFromStyle(style: BathroomStyleConfig): BathroomEstimateBreakdown {
  const tweakFallbacks = fallbackTweakSuggestionsForStyle(style.id);
  return {
    estimateRange: { min: style.estimateMin, max: style.estimateMax },
    breakdown: {
      materials: { min: style.materialMin, max: style.materialMax },
      labor: { min: style.laborMin, max: style.laborMax },
      fixtures: { min: style.fixturesMin, max: style.fixturesMax },
    },
    detailedBreakdown: [
      {
        category: "Materials (tile, paint, misc finishes)",
        min: style.materialMin,
        max: style.materialMax,
        reason: "Based on selected style finish level and visible surface upgrade scope.",
      },
      {
        category: "Labor (demo, prep, install, cleanup)",
        min: style.laborMin,
        max: style.laborMax,
        reason: "Reflects typical labor effort for a bathroom remodel with unchanged layout.",
      },
      {
        category: "Fixtures / finishes (vanity, lighting, accessories)",
        min: style.fixturesMin,
        max: style.fixturesMax,
        reason: "Includes fixture-level swaps and finish hardware seen in the design direction.",
      },
    ],
    reasoning: [
      "Estimate uses style defaults because image-based cost reasoning was unavailable.",
    ],
    assumptions: [
      "No major plumbing relocation",
      "No structural changes",
      "No hidden damage behind walls",
    ],
    confidence: "low",
    saveMoneySuggestions: tweakFallbacks.saveMoneySuggestions,
    improveDesignSuggestions: tweakFallbacks.improveDesignSuggestions,
  };
}

/** Vision + JSON estimator: tweak bullets are AFTER-only; BEFORE is for cost delta vs transformation. */
const TRY_ESTIMATE_SYSTEM_PROMPT = [
  "You analyze bathroom BEFORE + AFTER (mockup) images and return structured JSON when asked.",
  "There are two images in the user message. **IMAGE A is always the CURRENT MOCKUP (AFTER)** — the only source of truth for what the room already looks like after the redesign.",
  "**IMAGE B is the original BEFORE** — use it for pricing (what changed, labor/materials implied by the transformation) and for layout continuity. Do **not** let IMAGE B steer `improve_design` or `save_money` text: the homeowner is already looking at the result in A; never suggest “add X” if X is already clearly present in A.",
  "**Style lock:** `save_money` and `improve_design` must preserve the **named renovation style** in the user message (human-readable title and subtitle). Offer cheaper or richer options **within that same aesthetic** — never steer toward a conflicting interior genre unless IMAGE A already mixes it in clearly.",
  "**improve_design (hard rule):** Each `text` must describe a **net-new or finer-tier** change a viewer would still want **after** studying IMAGE A alone. If you could point to A and say “it already looks like that,” the suggestion is invalid. Forbidden: repeating the style brief (spa/modern/luxury) as if A had not delivered it.",
  "**save_money:** Only trims/swaps/phasing that still make sense **given what A already shows**. Never propose undoing a finish that is already the hero of A.",
  "When JSON is requested, respond with **JSON only** (no markdown fences).",
].join("\n");

async function estimateBathroomCostsFromBeforeAfter(params: {
  beforeImageUrl: string;
  afterImageUrl: string;
  selectedStyle: BathroomStyleId;
  userDescription: string;
  styleDefaults: BathroomEstimateBreakdown;
}): Promise<BathroomEstimateBreakdown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return params.styleDefaults;

  /** Faster vision tokens on estimate-only images; set TRY_DISABLE_FAST_HOMEOWNER_ESTIMATE=1 for full detail (slower). */
  const fastEstimate = process.env.TRY_DISABLE_FAST_HOMEOWNER_ESTIMATE?.trim() !== "1";
  const estimateImageDetail = fastEstimate ? ("low" as const) : ("high" as const);

  const signalsPromise = detectVisibleScopeDiffSignals({
    apiKey,
    beforeImageUrl: params.beforeImageUrl,
    afterImageUrl: params.afterImageUrl,
  });

  const styleCfgForPrompt =
    getBathroomStyleById(params.selectedStyle) ?? getBathroomStyleById("clean_refresh");

  const prompt = [
    "You are a senior remodeling estimator for U.S. homeowner bathroom work (typical metro contractor pricing — not design-magazine or coastal luxury unless IMAGE A clearly shows that tier).",
    "IMAGE A (mockup) is already shown above this text; IMAGE B (original) is shown above too. For **save_money** and **improve_design** only: reason from **IMAGE A first** — those lines must read as refinements on the current render, not as if the homeowner were still staring at the old B photo.",
    "IMAGE A may be an AI render of the same room as IMAGE B — if layout, fixture count, and wet-area footprint look unchanged vs B, treat the job as FINISH / COSMETIC scope (tile, paint, surfaces, fixture style swaps, lighting, accessories) unless you see clear evidence of layout moves, added/removed fixtures, enlargements, or high-end custom work.",
    "Bias CONSERVATIVE on totals: do not assume full gut, unseen plumbing behind walls, permits-heavy structural work, or premium stone throughout unless visible in IMAGE A. Most same-footprint refresh-style mockups should land well below a speculative whole-bath rebuild.",
    "Prioritize labor + materials implied by what you can SEE different between IMAGE B and IMAGE A — not what a full style mood board could cost.",
    "Do not use generic broad ranges when visual evidence suggests a tighter range.",
    "Return JSON only with this exact shape:",
    "{",
    '  "estimate_min": number,',
    '  "estimate_max": number,',
    '  "materials_min": number,',
    '  "materials_max": number,',
    '  "labor_min": number,',
    '  "labor_max": number,',
    '  "fixtures_min": number,',
    '  "fixtures_max": number,',
    '  "detailed_breakdown": [',
    "    {",
    '      "category": "string",',
    '      "min": number,',
    '      "max": number,',
    '      "reason": "string"',
    "    }",
    "  ],",
    '  "reasoning": ["string"],',
    '  "assumptions": ["string"],',
    '  "confidence": "low|medium|high",',
    `  "save_money": [ exactly ${TRY_SUGGESTIONS_PER_CATEGORY} objects, each: { "text": string, "delta_min": number, "delta_max": number } ],`,
    `  "improve_design": [ exactly ${TRY_SUGGESTIONS_PER_CATEGORY} objects, each: { "text": string, "delta_min": number, "delta_max": number } ],`,
    "}",
    "Rules:",
    "- all numbers are whole USD dollars",
    "- max values must be >= min values",
    "- totals should roughly align with breakdown subtotals",
    "- estimate_min and estimate_max must reflect ONLY the incremental remodel scope visible between IMAGE B and IMAGE A (not the cost to build the entire bathroom from scratch unless IMAGE A clearly implies new construction-level scope).",
    "- include demolition/prep and finish labor inside labor values",
    "- detailed_breakdown should contain 4-8 line items tied to visible scope",
    "- reasons must be concrete and image-grounded, not generic",
    "- reasoning should summarize key cost drivers in 2-5 bullets",
    "- assumptions should list uncertainty factors impacting range",
    `- save_money: exactly ${TRY_SUGGESTIONS_PER_CATEGORY} objects. Each has "text" (concrete cost-saving idea grounded in **IMAGE A** as the new baseline; material swaps, scope trims, phasing; no layout or plumbing moves) and "delta_min"/"delta_max" (whole USD change to the **job total midpoint** ((estimate_min+estimate_max)/2) if that suggestion alone were fully applied vs the current scope shown in A). Both deltas must be <= 0; delta_min <= delta_max (e.g. -800 and -300 means roughly $300–$800 off the midpoint).`,
    `- improve_design: exactly ${TRY_SUGGESTIONS_PER_CATEGORY} objects with "text" and "delta_min"/"delta_max". Deltas are **added finish cost** vs the same midpoint — use 0 or positive numbers; delta_min <= delta_max.`,
    "- Each save_money and improve_design `text` must be something you can defend while looking **only at IMAGE A** (B may explain why cost exists, but must not cause you to suggest adding what A already shows).",
    "- Delta bands should be plausible vs your estimate_min/estimate_max (same order of magnitude as the job, not six-figure swings for paint-only tweaks).",
    "- improve_design — **mandatory mental pass before JSON**: (1) Silently inventory what IMAGE A already shows (tile, metals, glass, vanity, lighting, paint, niche, fixtures, decor). (2) Your four lines must each target a gap, weakness, or finer tier **in A** — not a headline upgrade already prominent in A. (3) If you cannot find four distinct ideas, use **smaller** refinements (mirror size/shape, hardware cohesion, grout/contrast, shelf/styling, fan grille, switch/dimmer tier, towel storage) that A plausibly does not yet emphasize.",
    "- improve_design — **forbidden violations** (treat as hard errors to avoid): suggesting a finish or fixture style that already matches IMAGE A; generic style language that ignores what A already changed from B.",
    "- CONSISTENCY CHECK (required before JSON): if IMAGE A still shows the same mirror footprint/style as IMAGE B, do not include mirror replacement/refinishing cost lines. Only include mirror-related dollars when a visible mirror change is clearly present in A vs B.",
    "- improve_design — NEVER propose enlarging/resizing fixtures (e.g., bigger mirror, wider vanity, larger shower) unless IMAGE A clearly shows that element as undersized/problematic. Prefer finish/material/lighting/accessory refinements over size changes.",
    "- improve_design — NEVER suggest adding wall features into blocked zones. If IMAGE A shows a large mirror or fixture occupying the vanity wall, do not suggest backsplash/accent-wall/tile-band additions behind or above that occupied area unless your suggestion explicitly replaces that existing element first.",
    "- improve_design — Treat the wall behind sinks/vanity as potentially occupied by mirror/cabinet/lighting; default to NO available wall area there. Do not suggest additions 'behind sinks' unless replacement/demolition of existing elements is explicitly the suggestion.",
    "- save_money: Same discipline — propose trims or swaps that still make sense given what IMAGE A already established vs B; do not recommend undoing or replacing something that is already the cheaper path in A.",
    "- **STYLE LOCK (mandatory):** All `save_money` and `improve_design` lines must match the **selected renovation style** named below (palette, fixture character, mood). Forbidden: genre pivots (e.g. farmhouse shiplap, industrial exposed pipe, cottage florals) when they conflict with that named style and are not already visible in IMAGE A.",
    params.userDescription.trim()
      ? "- User notes describe this analysis pass (e.g. a new tweak): if visible scope in A vs B changed, move dollars accordingly; save_money and improve_design must be freshly written for **this exact IMAGE A** (no canned lines; nothing already visible in A)."
      : "",
    styleCfgForPrompt
      ? [
          `**Selected renovation style:** ${styleCfgForPrompt.name} — ${styleCfgForPrompt.subtitle} (id: ${params.selectedStyle}).`,
          styleLockBlockForEstimate(styleCfgForPrompt),
        ].join("\n")
      : `Selected style: ${params.selectedStyle}`,
    params.userDescription.trim() ? `User notes: ${params.userDescription.trim()}` : "",
    `Style marketing anchor only (NOT a minimum job size — many finish-only same-layout pairs should price BELOW this band): about $${params.styleDefaults.estimateRange.min}-$${params.styleDefaults.estimateRange.max} for a broad "${styleCfgForPrompt?.name ?? params.selectedStyle}" direction. If images show modest finish updates, your JSON totals should usually sit in the lower portion of that anchor or under it.`,
  ]
    .filter(Boolean)
    .join("\n");

  const userNotesForEstimate = params.userDescription.trim();
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        /** Lower temperature so vision sticks to IMAGE A for tweak bullets (less “invent from BEFORE”). */
        temperature: userNotesForEstimate.length > 12 ? 0.26 : 0.2,
        max_tokens: 2000,
        messages: [
          { role: "system", content: TRY_ESTIMATE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Photo order in this message: **1st photo = IMAGE A** (current mockup). **2nd photo = IMAGE B** (original before). Scroll back to IMAGE A immediately before you write `save_money` and `improve_design`.",
              },
              {
                type: "text",
                text: "IMAGE A — CURRENT MOCKUP (latest render). This frame is the achieved design: every visible finish, palette choice, and style direction lives here. Tweak suggestions must describe deltas **from this frame**, not from imagination of the old room.",
              },
              { type: "image_url", image_url: { url: params.afterImageUrl, detail: estimateImageDetail } },
              {
                type: "text",
                text: "IMAGE B — ORIGINAL BEFORE. Use with A for cost totals, breakdown, reasoning, and assumptions (what changed, what labor likely applied). Do **not** use B alone to justify `improve_design` lines that duplicate what A already shows.",
              },
              { type: "image_url", image_url: { url: params.beforeImageUrl, detail: estimateImageDetail } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
  } catch {
    await signalsPromise.catch(() => null);
    console.warn("[try-estimate] OpenAI request aborted or timed out; using style defaults.");
    return params.styleDefaults;
  }
  if (!res.ok) {
    await signalsPromise.catch(() => null);
    const errText = await res.text().catch(() => "");
    console.warn("[try-estimate] OpenAI chat completions failed:", res.status, errText.slice(0, 500));
    return params.styleDefaults;
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    await signalsPromise.catch(() => null);
    console.warn("[try-estimate] Could not parse estimator JSON; using style defaults. Snippet:", raw.slice(0, 280));
    return params.styleDefaults;
  }

  const visibleSignals = await signalsPromise;

  const out: BathroomEstimateBreakdown = {
    estimateRange: {
      min: clampMoney(parsed.estimate_min, params.styleDefaults.estimateRange.min),
      max: clampMoney(parsed.estimate_max, params.styleDefaults.estimateRange.max),
    },
    breakdown: {
      materials: {
        min: clampMoney(parsed.materials_min, params.styleDefaults.breakdown.materials.min),
        max: clampMoney(parsed.materials_max, params.styleDefaults.breakdown.materials.max),
      },
      labor: {
        min: clampMoney(parsed.labor_min, params.styleDefaults.breakdown.labor.min),
        max: clampMoney(parsed.labor_max, params.styleDefaults.breakdown.labor.max),
      },
      fixtures: {
        min: clampMoney(parsed.fixtures_min, params.styleDefaults.breakdown.fixtures.min),
        max: clampMoney(parsed.fixtures_max, params.styleDefaults.breakdown.fixtures.max),
      },
    },
    detailedBreakdown: [],
    reasoning: [],
    assumptions: [],
    confidence: "medium",
    saveMoneySuggestions: params.styleDefaults.saveMoneySuggestions,
    improveDesignSuggestions: params.styleDefaults.improveDesignSuggestions,
  };

  if (out.estimateRange.max < out.estimateRange.min) {
    out.estimateRange.max = out.estimateRange.min;
  }
  if (out.breakdown.materials.max < out.breakdown.materials.min) {
    out.breakdown.materials.max = out.breakdown.materials.min;
  }
  if (out.breakdown.labor.max < out.breakdown.labor.min) {
    out.breakdown.labor.max = out.breakdown.labor.min;
  }
  if (out.breakdown.fixtures.max < out.breakdown.fixtures.min) {
    out.breakdown.fixtures.max = out.breakdown.fixtures.min;
  }

  const detailedRaw = Array.isArray(parsed.detailed_breakdown) ? parsed.detailed_breakdown : [];
  out.detailedBreakdown = detailedRaw
    .map((row) => {
      const record = row as Record<string, unknown>;
      const category = String(record.category ?? "").trim().slice(0, 140);
      if (!category) return null;
      const min = clampMoney(record.min, 0);
      const max = clampMoney(record.max, min);
      const reason = String(record.reason ?? "")
        .trim()
        .slice(0, 320);
      return {
        category,
        min,
        max: Math.max(max, min),
        reason: reason || "Image-visible scope in this category drives this range.",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 8);

  // If this run does not explicitly request mirror work, hide mirror-specific line items to avoid
  // presenting costs that aren't clearly tied to requested / visible deltas.
  if (!textMentionsMirrorWork(userNotesForEstimate)) {
    out.detailedBreakdown = out.detailedBreakdown.filter((row) => {
      const combined = `${row.category} ${row.reason}`.toLowerCase();
      return !/(mirror|medicine cabinet)/.test(combined);
    });
  }

  if (visibleSignals?.doorOrWindowChanged) {
    const hasDoorWindowLine = hasBreakdownTopic(
      out.detailedBreakdown,
      /(door|window|trim|opening|frame|casing)/,
    );
    if (!hasDoorWindowLine) {
      const r = estimateLineRangeFromTotalBand(
        out.estimateRange.min,
        out.estimateRange.max,
        0.04,
        0.11,
        180,
      );
      out.detailedBreakdown.push({
        category: "Door / window / trim updates",
        min: r.min,
        max: r.max,
        reason:
          "After-vs-before image comparison indicates visible door/window or adjacent trim differences that require material and labor allowance.",
      });
    }
  }

  if (visibleSignals && !visibleSignals.mirrorChanged && !textMentionsMirrorWork(userNotesForEstimate)) {
    out.detailedBreakdown = out.detailedBreakdown.filter((row) => {
      const combined = `${row.category} ${row.reason}`.toLowerCase();
      return !/(mirror|medicine cabinet)/.test(combined);
    });
  }

  if (out.detailedBreakdown.length === 0) {
    out.detailedBreakdown = params.styleDefaults.detailedBreakdown;
  }

  out.reasoning = Array.isArray(parsed.reasoning)
    ? parsed.reasoning.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
    : [];
  if (out.reasoning.length === 0) {
    out.reasoning = params.styleDefaults.reasoning;
  }

  out.assumptions = Array.isArray(parsed.assumptions)
    ? parsed.assumptions.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];
  if (out.assumptions.length === 0) {
    out.assumptions = params.styleDefaults.assumptions;
  }

  const confidenceRaw = String(parsed.confidence ?? "")
    .trim()
    .toLowerCase();
  out.confidence =
    confidenceRaw === "low" || confidenceRaw === "medium" || confidenceRaw === "high"
      ? confidenceRaw
      : params.styleDefaults.confidence;

  out.saveMoneySuggestions = normalizeTryTweakSuggestions(
    parsed.save_money,
    params.styleDefaults.saveMoneySuggestions,
    320,
    TRY_SUGGESTIONS_PER_CATEGORY,
    true,
  );
  out.saveMoneySuggestions = sanitizeSuggestionsAgainstImageAGuardrails(
    out.saveMoneySuggestions,
    params.styleDefaults.saveMoneySuggestions,
  );
  out.improveDesignSuggestions = normalizeTryTweakSuggestions(
    parsed.improve_design,
    params.styleDefaults.improveDesignSuggestions,
    320,
    TRY_SUGGESTIONS_PER_CATEGORY,
    false,
  );
  out.improveDesignSuggestions = sanitizeSuggestionsAgainstImageAGuardrails(
    out.improveDesignSuggestions,
    params.styleDefaults.improveDesignSuggestions,
  );

  return out;
}

async function runTryPriceEstimateForMockup(params: {
  projectId: string;
  afterStoragePath: string;
  selectedStyle: BathroomStyleId;
  userDescription?: string;
}): Promise<BathroomEstimateBreakdown | null> {
  const svc = createServiceClient();
  const project = await getHomeownerTryProjectById(params.projectId);
  if (!project?.before_storage_path) return null;
  const [beforeSignedPre, afterSigned] = await Promise.all([
    svc.storage.from(PHOTOS_BUCKET).createSignedUrl(project.before_storage_path, 60 * 60),
    svc.storage.from(PHOTOS_BUCKET).createSignedUrl(params.afterStoragePath, 60 * 60),
  ]);
  const beforeDataUrl = await beforeImageUrlForOpenAiVision(
    svc,
    project.before_storage_path,
    beforeSignedPre.data?.signedUrl,
  );
  if (!beforeDataUrl || !afterSigned.data?.signedUrl) return null;
  const styleConfig = getBathroomStyleById(params.selectedStyle) ?? getBathroomStyleById("clean_refresh");
  if (!styleConfig) return null;
  const styleDefaults = defaultEstimateFromStyle(styleConfig);
  return estimateBathroomCostsFromBeforeAfter({
    beforeImageUrl: beforeDataUrl,
    afterImageUrl: afterSigned.data.signedUrl,
    selectedStyle: params.selectedStyle,
    userDescription: (params.userDescription ?? "").trim().slice(0, 1600),
    styleDefaults,
  });
}

async function evaluateBathroomResultQuality(params: {
  beforeImageUrl: string;
  afterImageUrl: string;
  selectedStyle: BathroomStyleId;
  /** When true, wet-area enclosure may legitimately change — do not fail QA for glass/opening edits. */
  wetZoneRemodelIntent?: boolean;
}): Promise<{ pass: boolean; issues: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { pass: true, issues: [] };

  const wetNote = params.wetZoneRemodelIntent
    ? "IMPORTANT: Homeowner requested tub/shower remodel visualization (e.g. walk-in). wet_area_preserved must be true if a shower/tub wet zone still exists in the same general corner/alcove of the room (same plumbing zone), EVEN IF glass, door, curb, or enclosure layout changed. Only false if the wet fixture vanished or moved to a different wall zone."
    : "";

  const prompt = [
    "Compare BEFORE and AFTER bathroom images and return JSON only.",
    wetNote,
    "Evaluate:",
    "1) layout_preserved: same room architecture, walls/subwalls/pony walls preserved (true/false)",
    "2) toilet_visible_in_before: is toilet visible in BEFORE (true/false)",
    "3) toilet_preserved_if_visible: if a toilet is visible in BEFORE, it is still visible in AFTER (true/false/unknown)",
    params.wetZoneRemodelIntent
      ? "4) wet_area_preserved: tub/shower wet zone still present in the same general bathroom zone (true/false/unknown). Enclosure/glass/curb changes alone do NOT count as failure."
      : "4) wet_area_preserved: shower/tub/wet-area footprint preserved and still present (true/false/unknown)",
    "5) realistic_same_room: AFTER still looks like the same bathroom, not redesigned geometry (true/false)",
    "6) spa_retreat_strength_0_to_10: only score this when style is spa_retreat, else set to null",
    "7) issues: short list of concrete failures",
    `Selected style: ${params.selectedStyle}`,
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "text", text: "BEFORE image" },
              { type: "image_url", image_url: { url: params.beforeImageUrl, detail: "high" } },
              { type: "text", text: "AFTER image" },
              { type: "image_url", image_url: { url: params.afterImageUrl, detail: "high" } },
            ],
          },
        ],
      }),
    });
  } catch {
    return { pass: true, issues: [] };
  }

  if (!res.ok) return { pass: true, issues: [] };
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) return { pass: true, issues: [] };

  const layout = parsed.layout_preserved === true;
  const realistic = parsed.realistic_same_room === true;
  const toiletVisibleBefore = parsed.toilet_visible_in_before === true;
  const toilet = parsed.toilet_preserved_if_visible;
  const wetArea = parsed.wet_area_preserved;
  const toiletOk = toiletVisibleBefore ? toilet === true : true;
  const wetAreaOk =
    params.wetZoneRemodelIntent
      ? wetArea !== false
      : wetArea === true;
  const spaScore =
    typeof parsed.spa_retreat_strength_0_to_10 === "number"
      ? parsed.spa_retreat_strength_0_to_10
      : null;
  const spaOk = params.selectedStyle !== "spa_retreat" || (spaScore != null && spaScore >= 7);
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((x) => String(x)).slice(0, 6)
    : [];

  return {
    pass: layout && realistic && toiletOk && wetAreaOk && spaOk,
    issues,
  };
}

const QUALITY_RESCUE_PROMPT = [
  "QUALITY RESCUE — PRIORITIZE THESE NON-NEGOTIABLES:",
  "- Keep every wall/subwall/pony wall exactly as-is",
  "- Keep toilet visible if it is visible in the source image",
  "- Keep shower/tub wet-area present and in the same footprint",
  "- Keep same room geometry and framing",
  "- No architectural redesign; finishes and style only",
].join("\n");

const QUALITY_RESCUE_PROMPT_WET_ZONE = [
  "QUALITY RESCUE (WET-ZONE REMODEL OK) — PRIORITIZE:",
  "- Keep every exterior bathroom wall, window, and door position as-is; same camera and room size read as the source",
  "- Keep toilet visible if it is visible in the source image; keep vanity/dry areas unless the main prompt required changes",
  "- In the wet zone: show a clear walk-in/curbless/tub-to-shower style result as requested; glass, curb, and opening may change within the existing wet footprint",
  "- No new room addition, no moving the wet zone to a different wall, no hiding fixtures by reframing",
].join("\n");

/**
 * @param allowCookieMutation - Must be `false` when called from a Server Component (e.g. `/try` page load).
 * Next.js only allows `cookies().set` inside Server Actions / Route Handlers, not during RSC render.
 * When `true`, ensures the anonymous session row exists before DB writes; read-only callers skip that upsert.
 */
/** Blocks generation/regeneration when style is admin-preview-only and viewer is not admin. */
async function gateAdminOnlyStyle(
  style: BathroomStyleConfig,
  viewer: Awaited<ReturnType<typeof getViewerContext>>,
): Promise<string | null> {
  if (!style.adminOnly) return null;
  if (!viewer.userId) {
    return "Sign in with an admin account to use this preview style.";
  }
  const allowed = await resolveViewerIsAdmin({
    userId: viewer.userId,
    email: viewer.userEmail,
  });
  if (!allowed) return "That style is not available yet.";
  return null;
}

async function getViewerContext(allowCookieMutation: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const anonymousSessionId = user
    ? await getRenovisionAnonymousSessionIdFromCookie()
    : allowCookieMutation
      ? await getOrCreateRenovisionAnonymousSessionId()
      : await getRenovisionAnonymousSessionIdFromCookie();

  if (anonymousSessionId && allowCookieMutation) {
    await ensureRenovisionAnonymousSessionRow(anonymousSessionId);
  }

  return {
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    anonymousSessionId: anonymousSessionId ?? null,
  };
}

async function trackTryEvent(opts: {
  eventType: string;
  userId: string | null;
  anonymousSessionId: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const svc = createServiceClient();
  await svc.from("renovision_analytics_events").insert({
    event_type: opts.eventType,
    user_id: opts.userId,
    anonymous_session_id: opts.anonymousSessionId,
    project_id: opts.projectId ?? null,
    metadata: opts.metadata ?? {},
  });
}

async function persistViewerAttribution(params: {
  viewer: { userId: string | null; anonymousSessionId: string | null };
  attribution: RenovisionAttribution | null;
}): Promise<void> {
  const incoming = sanitizeAttribution(params.attribution);
  if (!incoming) return;
  const svc = createServiceClient();

  if (params.viewer.anonymousSessionId) {
    const { data: row } = await svc
      .from("renovision_anonymous_sessions")
      .select("id, attribution")
      .eq("id", params.viewer.anonymousSessionId)
      .maybeSingle();
    const merged = mergeAttribution(
      sanitizeAttribution((row as { attribution?: unknown } | null)?.attribution ?? null),
      incoming,
    );
    if (merged) {
      await svc
        .from("renovision_anonymous_sessions")
        .update({ attribution: merged, updated_at: new Date().toISOString() })
        .eq("id", params.viewer.anonymousSessionId);
    }
  }

  if (params.viewer.userId) {
    const { data: profileRow } = await svc
      .from("profiles")
      .select("id, last_renovision_attribution")
      .eq("id", params.viewer.userId)
      .maybeSingle();
    const merged = mergeAttribution(
      sanitizeAttribution(
        (profileRow as { last_renovision_attribution?: unknown } | null)?.last_renovision_attribution ?? null,
      ),
      incoming,
    );
    if (merged) {
      await svc
        .from("profiles")
        .upsert({ id: params.viewer.userId, last_renovision_attribution: merged }, { onConflict: "id" });
    }
  }
}

/**
 * Captures attribution immediately on marketing-link landing so admin metrics can show link usage
 * even before a generation/save/lead action happens.
 */
export async function captureRenovisionAttributionAction(
  incoming: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const attribution = sanitizeAttribution(incoming);
    if (!attribution) return { ok: true };
    const viewer = await getViewerContext(true);
    await persistViewerAttribution({ viewer, attribution });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not capture attribution.",
    };
  }
}

export async function captureHomePageVisitAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const viewer = await getViewerContext(true);
    await trackTryEvent({
      eventType: "home_page_view",
      userId: viewer.userId,
      anonymousSessionId: viewer.anonymousSessionId,
      projectId: null,
      metadata: {},
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not track home page visit.",
    };
  }
}

export async function captureTryPageVisitAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const viewer = await getViewerContext(true);
    await trackTryEvent({
      eventType: "try_page_view",
      userId: viewer.userId,
      anonymousSessionId: viewer.anonymousSessionId,
      projectId: null,
      metadata: {},
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not track Try page visit.",
    };
  }
}

export async function loadHomeownerTryPageState(): Promise<HomeownerTryPageState> {
  try {
    const { userEmail, anonymousSessionId } = await getViewerContext(false);
    return {
      ok: true,
      anonymousSessionId,
      userEmail,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not load page.",
    };
  }
}

/** First visit to `/try` as guest: RSC cannot set cookies — client calls this Server Action, then `router.refresh()`. */
export async function bootstrapTryAnonymousSessionAction(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    await getViewerContext(true);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not start session.",
    };
  }
}

/** Storage / edge gateways sometimes return bare numeric codes — treat as non-actionable for users. */
function isLikelyOpaqueErrorMessage(message: string): boolean {
  const t = message.trim();
  if (!t) return true;
  if (/^\d{6,}$/.test(t)) return true;
  const digits = t.replace(/\D/g, "").length;
  return t.length >= 8 && digits / t.length >= 0.85;
}

function friendlyTryGenerationFailureMessage(cause: unknown): string {
  const msg = cause instanceof Error ? cause.message : String(cause ?? "");
  if (isLikelyOpaqueErrorMessage(msg)) {
    return (
      "We couldn’t finish generating your preview just now. " +
      "Please wait a few seconds and try again. If it keeps happening, use a smaller photo (under 8 MB), JPG or PNG, and a stable connection."
    );
  }
  const trimmed = msg.trim();
  if (trimmed.length <= 400) return `We couldn’t finish generating your preview: ${trimmed}`;
  return `We couldn’t finish generating your preview: ${trimmed.slice(0, 380)}…`;
}

function safeGenerationErrorMetadata(cause: unknown): { error_code: string; message_preview: string } {
  const raw = cause instanceof Error ? cause.message : String(cause ?? "");
  const msg = raw.trim().toLowerCase();
  let errorCode = "generation_failed";
  if (!raw.trim()) errorCode = "unknown";
  else if (msg.includes("timeout") || msg.includes("timed out")) errorCode = "timeout";
  else if (msg.includes("rate limit") || msg.includes("429")) errorCode = "rate_limited";
  else if (msg.includes("storage") || msg.includes("upload")) errorCode = "storage_error";
  else if (msg.includes("vertex")) errorCode = "vertex_error";
  else if (msg.includes("openai")) errorCode = "openai_error";
  const preview = raw.replace(/\s+/g, " ").slice(0, 180);
  return {
    error_code: errorCode,
    message_preview: preview,
  };
}

function scopeOfWorkFromEstimate(est: {
  detailedBreakdown: unknown;
  reasoning: unknown;
  assumptions: unknown;
  breakdown: unknown;
}) {
  return {
    detailed_breakdown: est.detailedBreakdown,
    reasoning: est.reasoning,
    assumptions: est.assumptions,
    estimate_breakdown: est.breakdown,
  };
}

function tweaksUsedForRegeneration(params: {
  saveHintSelections: string[];
  designHintSelections: string[];
  legacyHint: string;
  customTweakRaw: string;
}) {
  const now = new Date().toISOString();
  const rows: Array<{ type: string; text: string; timestamp: string }> = [];
  for (const text of params.saveHintSelections) rows.push({ type: "save_money", text, timestamp: now });
  for (const text of params.designHintSelections) rows.push({ type: "improve_design", text, timestamp: now });
  if (params.legacyHint) rows.push({ type: "legacy_hint", text: params.legacyHint, timestamp: now });
  if (params.customTweakRaw) rows.push({ type: "custom_tweak", text: params.customTweakRaw, timestamp: now });
  return rows;
}

export async function generateBathroomMockupAction(
  _prev: unknown,
  formData: FormData,
): Promise<
  | { error: string }
  | {
      success: true;
      generationId: string;
      projectId: string;
      selectedStyle: BathroomStyleId;
      styleName: string;
      uploadedImageUrl: string;
      generatedImageUrl: string;
      estimateRange: { min: number; max: number };
      breakdown: {
        materials: { min: number; max: number };
        labor: { min: number; max: number };
        fixtures: { min: number; max: number };
      };
      detailedBreakdown: Array<{
        category: string;
        min: number;
        max: number;
        reason: string;
      }>;
      reasoning: string[];
      assumptions: string[];
      confidence: "low" | "medium" | "high";
      saveMoneySuggestions: TryTweakSuggestion[];
      improveDesignSuggestions: TryTweakSuggestion[];
      mockupVersions: SignedTryMockupVersion[];
      activeMockupId: string;
      estimateRefinementPending?: boolean;
    }
> {
  try {
  const startNewProject = str(formData, "start_new_project") === "1";
  const selectedStyleId = str(formData, "selected_style");
  const userDescription = String(formData.get("user_description") ?? "").trim().slice(0, 1600);
  const style = getBathroomStyleById(selectedStyleId);
  if (!style) return { error: "Choose a style to continue." };
  if (style.id === "your_vision" && !userDescription) {
    return { error: "Describe your vision in the box below, or pick a preset style above." };
  }

  const viewer = await getViewerContext(true);
  if (!viewer.userId && !viewer.anonymousSessionId) {
    return { error: "Could not start your session." };
  }
  const adminGate = await gateAdminOnlyStyle(style, viewer);
  if (adminGate) return { error: adminGate };

  const file = formData.get("bathroom_photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please upload your bathroom photo." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { error: "Image must be 20 MB or smaller." };
  }
  const incomingAttribution = attributionFromFormData(formData);
  await persistViewerAttribution({ viewer, attribution: incomingAttribution });

  // Logged-in flow: every fresh upload should create a distinct project timeline.
  // Anonymous flow can still reuse context unless "start new" is explicitly requested.
  const shouldForceNewProject = startNewProject || Boolean(viewer.userId);
  const existingProject = shouldForceNewProject
    ? null
    : await findHomeownerTryProjectForContext({
        userId: viewer.userId,
        anonymousSessionId: viewer.anonymousSessionId,
      });
  const projectId = existingProject?.id ?? randomUUID();
  const svc = createServiceClient();

  const buf = Buffer.from(await file.arrayBuffer());
  const fileMime = file.type?.split(";")[0]?.trim() || "image/jpeg";
  const normalizedUpload = await normalizeImageBufferForDisplay(buf, fileMime);
  const ext =
    normalizedUpload.contentType === "image/png"
      ? "png"
      : normalizedUpload.contentType === "image/webp"
        ? "webp"
        : "jpg";
  const beforePath = `homeowner-tries/${projectId}/before-${randomUUID()}.${ext}`;
  const { error: uploadErr } = await svc.storage.from(PHOTOS_BUCKET).upload(beforePath, normalizedUpload.buffer, {
    contentType: normalizedUpload.contentType,
    upsert: false,
  });
  if (uploadErr) {
    const um = uploadErr.message?.trim() ?? "";
    if (isLikelyOpaqueErrorMessage(um)) {
      return {
        error:
          "Could not upload your photo. Check your connection and try again, or pick a smaller JPG or PNG.",
      };
    }
    return { error: um };
  }

  const scopeDescription = `${style.scopeSeed}. ${
    userDescription || "Keep the same room layout and camera angle while upgrading finishes."
  }`;

  if (existingProject) {
    const projectAttribution = mergeAttribution(
      sanitizeAttribution((existingProject as { attribution?: unknown }).attribution ?? null),
      incomingAttribution,
    );
    await updateHomeownerTryProjectAi(projectId, {
      scope_description: scopeDescription,
      ai_summary: null,
      material_estimate: [],
      ai_status: "idle",
      ai_last_error: null,
    });
    const svc2 = createServiceClient();
    await svc2
      .from("homeowner_try_projects")
      .update({
        before_storage_path: beforePath,
        attribution: projectAttribution,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
  } else {
    await insertHomeownerTryProject({
      id: projectId,
      anonymous_session_id: viewer.userId ? null : viewer.anonymousSessionId!,
      user_id: viewer.userId,
      before_storage_path: beforePath,
      scope_description: scopeDescription,
      attribution: incomingAttribution,
    });
  }

  await trackTryEvent({
    eventType: "image_uploaded",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId,
    metadata: { selected_style: style.id },
  });
  await trackTryEvent({
    eventType: "generation_started",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId,
    metadata: { selected_style: style.id, mode: "initial" },
  });

  const { prompt: initialTryPrompt, wetZoneRemodelIntent: initialWetZoneIntent } =
    buildInitialTryGenerationPrompt(style.id, userDescription);

  const generationId = randomUUID();
  const result = await runHomeownerTryMockupGeneration({
    projectId,
    selectedStyle: style.id,
    additionalPrompt: initialTryPrompt,
    regenerateFromRoom: true,
    refineFromMockupId: null,
    requireVertex: true,
    wetZoneRemodelIntent: initialWetZoneIntent,
  });

  if (!result.ok) {
    const safeError = safeGenerationErrorMetadata(result.message);
    await svc.from("bathroom_generations").upsert(
      {
        id: generationId,
        session_id: viewer.anonymousSessionId,
        user_id: viewer.userId,
        project_id: projectId,
        selected_style: style.name,
        user_description: userDescription || null,
        uploaded_image_url: beforePath,
        generated_image_url: null,
        tweaks_used: [],
        estimate_min: null,
        estimate_max: null,
        estimate_low: null,
        estimate_expected: null,
        estimate_high: null,
        scope_of_work: null,
        contractor_notes: null,
        lead_submitted: false,
        status: "failed",
        metadata: { generation_error: safeError },
        attribution: incomingAttribution,
      },
      { onConflict: "id" },
    );
    await trackTryEvent({
      eventType: "generation_failed",
      userId: viewer.userId,
      anonymousSessionId: viewer.anonymousSessionId,
      projectId,
      metadata: { selected_style: style.id, generation_id: generationId, error_code: safeError.error_code },
    });
    return { error: result.message };
  }

  const mockups = await listMockupsForHomeownerProject(projectId);
  let latest = [...mockups].sort((a, b) => b.mockup_generation - a.mockup_generation)[0];
  if (!latest?.storage_path || !latest.id) {
    return { error: "Could not load the generated image." };
  }

  const [uploadedSigned, generatedSignedInitial] = await Promise.all([
    svc.storage.from(PHOTOS_BUCKET).createSignedUrl(beforePath, 60 * 60),
    svc.storage.from(PHOTOS_BUCKET).createSignedUrl(latest.storage_path, 60 * 60),
  ]);
  let generatedSigned = generatedSignedInitial;
  if (!uploadedSigned.data?.signedUrl || !generatedSigned.data?.signedUrl) {
    return { error: "Could not prepare image preview." };
  }

  const styleDefaults = defaultEstimateFromStyle(style);

  /** When rescue rerender is disabled, skip QA vision call to reduce latency. */
  const allowRescue = process.env.TRY_QA_RESCUE_REGEN?.trim() === "1";
  if (allowRescue) {
    const beforeForVision = await beforeImageUrlForOpenAiVision(svc, beforePath, uploadedSigned.data?.signedUrl);
    const qualityCheck = await evaluateBathroomResultQuality({
      beforeImageUrl: beforeForVision,
      afterImageUrl: generatedSigned.data.signedUrl,
      selectedStyle: style.id,
      wetZoneRemodelIntent: initialWetZoneIntent,
    });
    if (!qualityCheck.pass) {
      await runHomeownerTryMockupGeneration({
        projectId,
        selectedStyle: style.id,
        additionalPrompt: `${initialTryPrompt}\n\n${initialWetZoneIntent ? QUALITY_RESCUE_PROMPT_WET_ZONE : QUALITY_RESCUE_PROMPT}`,
        regenerateFromRoom: true,
        refineFromMockupId: null,
        requireVertex: true,
        wetZoneRemodelIntent: initialWetZoneIntent,
      });
      const rerunMockups = await listMockupsForHomeownerProject(projectId);
      const rerunLatest = [...rerunMockups].sort((a, b) => b.mockup_generation - a.mockup_generation)[0];
      if (rerunLatest?.storage_path && rerunLatest.id) {
        generatedSigned = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(rerunLatest.storage_path, 60 * 60);
        latest = rerunLatest;
      }
    }
  }
  if (!generatedSigned.data?.signedUrl) {
    return { error: "Could not prepare generated image after quality check." };
  }

  const uploadedSignedUrl = uploadedSigned.data.signedUrl;
  const generatedSignedUrl = generatedSigned.data.signedUrl;

  const { error: genInsertError } = await svc.from("bathroom_generations").insert({
    id: generationId,
    session_id: viewer.anonymousSessionId,
    user_id: viewer.userId,
    project_id: projectId,
    selected_style: style.name,
    user_description: userDescription || null,
    uploaded_image_url: beforePath,
    generated_image_url: latest.storage_path,
    tweaks_used: [],
    estimate_low: styleDefaults.estimateRange.min,
    estimate_expected: Math.round((styleDefaults.estimateRange.min + styleDefaults.estimateRange.max) / 2),
    estimate_high: styleDefaults.estimateRange.max,
    estimate_min: styleDefaults.estimateRange.min,
    estimate_max: styleDefaults.estimateRange.max,
    scope_of_work: null,
    contractor_notes: null,
    try_estimate_snapshot: null,
    refinements_used: 0,
    selected_variation: null,
    lead_submitted: false,
    status: "completed",
    metadata: {},
    attribution: incomingAttribution,
  });
  if (genInsertError) {
    console.error("[try] bathroom_generations insert failed:", genInsertError);
    return {
      error:
        "Your preview was created but could not be saved to your account. This is usually a database configuration issue — confirm Supabase migrations are applied and `SUPABASE_SERVICE_ROLE_KEY` is set. Details: " +
        genInsertError.message,
    };
  }

  const styleIdForAfter = style.id;
  after(async () => {
    try {
      const svcInner = createServiceClient();
      const styleCfg = getBathroomStyleById(styleIdForAfter) ?? getBathroomStyleById("clean_refresh");
      if (!styleCfg) return;
      const defaults = defaultEstimateFromStyle(styleCfg);
      const est = await estimateBathroomCostsFromBeforeAfter({
        beforeImageUrl: uploadedSignedUrl,
        afterImageUrl: generatedSignedUrl,
        selectedStyle: styleIdForAfter,
        userDescription,
        styleDefaults: defaults,
      });
      await svcInner
        .from("bathroom_generations")
        .update({
          status: "completed",
          estimate_low: est.estimateRange.min,
          estimate_expected: Math.round((est.estimateRange.min + est.estimateRange.max) / 2),
          estimate_high: est.estimateRange.max,
          estimate_min: est.estimateRange.min,
          estimate_max: est.estimateRange.max,
          scope_of_work: scopeOfWorkFromEstimate(est),
          try_estimate_snapshot: tryEstimateSnapshotFromBreakdown(est),
        })
        .eq("id", generationId);
      revalidatePath("/try");
      revalidatePath("/upload");
      revalidatePath("/projects");
    } catch (e) {
      console.error("[try] deferred homeowner estimate failed:", e);
    }
  });
  if (process.env.NODE_ENV !== "production" && incomingAttribution) {
    console.log("[renovision][attribution][generation]", { generationId, projectId, attribution: incomingAttribution });
  }

  await trackTryEvent({
    eventType: "generation_completed",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId,
    metadata: { selected_style: style.id, generation_id: generationId },
  });

  // Logged-in users should always have their latest project available in My Projects.
  if (viewer.userId) {
    const autoSaveResult = await saveMyProjectForViewerCore({
      generationId,
      projectId,
      attribution: incomingAttribution,
    });
    if (!("ok" in autoSaveResult)) {
      console.warn("[renovision][auto-save] generation auto-save failed", autoSaveResult);
    }
  }

  const versionTtl = 60 * 60;
  const mockupVersions = await loadSignedMockupVersionsForProject(projectId, versionTtl);
  const finalRows = await listMockupsForHomeownerProject(projectId);
  const activeMockupRow = [...finalRows].sort((a, b) => b.mockup_generation - a.mockup_generation)[0];
  if (!activeMockupRow?.id) {
    return { error: "Could not resolve mockup version." };
  }

  revalidatePath("/try");
  revalidatePath("/upload");
  revalidatePath("/projects");
  return {
    success: true,
    generationId,
    projectId,
    selectedStyle: style.id,
    styleName: style.name,
    uploadedImageUrl: uploadedSigned.data.signedUrl,
    generatedImageUrl: generatedSigned.data.signedUrl,
    estimateRange: styleDefaults.estimateRange,
    breakdown: styleDefaults.breakdown,
    detailedBreakdown: styleDefaults.detailedBreakdown,
    reasoning: styleDefaults.reasoning,
    assumptions: styleDefaults.assumptions,
    confidence: styleDefaults.confidence,
    saveMoneySuggestions: styleDefaults.saveMoneySuggestions,
    improveDesignSuggestions: styleDefaults.improveDesignSuggestions,
    mockupVersions,
    activeMockupId: activeMockupRow.id,
    estimateRefinementPending: true,
  };
  } catch (e) {
    console.error("[try] generateBathroomMockupAction failed:", e);
    return { error: friendlyTryGenerationFailureMessage(e) };
  }
}

export async function regenerateBathroomMockupAction(
  _prev: unknown,
  formData: FormData,
): Promise<
  | { error: string }
  | {
      success: true;
      uploadedImageUrl: string;
      generatedImageUrl: string;
      projectId: string;
      selectedStyle: BathroomStyleId;
      styleName: string;
      estimateRange: { min: number; max: number };
      breakdown: {
        materials: { min: number; max: number };
        labor: { min: number; max: number };
        fixtures: { min: number; max: number };
      };
      detailedBreakdown: Array<{
        category: string;
        min: number;
        max: number;
        reason: string;
      }>;
      reasoning: string[];
      assumptions: string[];
      confidence: "low" | "medium" | "high";
      saveMoneySuggestions: TryTweakSuggestion[];
      improveDesignSuggestions: TryTweakSuggestion[];
      mockupVersions: SignedTryMockupVersion[];
      activeMockupId: string;
    }
> {
  const generationId = str(formData, "generation_id");
  const projectId = str(formData, "project_id");
  const selectedStyleRaw = str(formData, "selected_style");
  const selectedStyle = (getBathroomStyleById(selectedStyleRaw)?.id ?? "clean_refresh") as BathroomStyleId;
  const selectedStyleConfig = getBathroomStyleById(selectedStyle) ?? getBathroomStyleById("clean_refresh");
  if (!selectedStyleConfig) return { error: "Invalid style." };
  if (!generationId || !projectId) return { error: "Missing generation context." };

  const saveHintSelections = formData
    .getAll("save_money_option")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const designHintSelections = formData
    .getAll("improve_design_option")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const legacyHint = String(formData.get("regeneration_hint") ?? "").trim().slice(0, 800);
  const kindRaw = str(formData, "suggestion_kind");
  const legacyKind: "" | "save_money" | "improve_design" =
    kindRaw === "save_money" || kindRaw === "improve_design" ? kindRaw : "";
  const imageSource = str(formData, "image_source") || "original";
  const sourceMockupId = str(formData, "source_mockup_id");

  const viewer = await getViewerContext(true);
  const adminGate = await gateAdminOnlyStyle(selectedStyleConfig, viewer);
  if (adminGate) return { error: adminGate };
  const incomingAttribution = attributionFromFormData(formData);
  await persistViewerAttribution({ viewer, attribution: incomingAttribution });
  const svc = createServiceClient();

  let regenerateFromRoom = true;
  let refineFromMockupId: string | null = null;
  if (imageSource === "current_mockup") {
    regenerateFromRoom = false;
    if (sourceMockupId && (await mockupBelongsToProject(projectId, sourceMockupId))) {
      refineFromMockupId = sourceMockupId;
    } else {
      const rows = await listMockupsForHomeownerProject(projectId);
      const newest = [...rows].sort((a, b) => b.mockup_generation - a.mockup_generation)[0];
      if (!newest?.id) return { error: "No saved mockup to tweak from yet." };
      refineFromMockupId = newest.id;
    }
  }

  const customTweakRaw = String(formData.get("custom_tweak") ?? "")
    .trim()
    .slice(0, HOMEOWNER_CUSTOM_TWEAK_MAX_CHARS);
  const userDescriptionRegen = String(formData.get("user_description") ?? "").trim().slice(0, 1600);
  const forceOpenAiComparison = false;

  const multiHintActive = saveHintSelections.length > 0 || designHintSelections.length > 0;
  if (imageSource === "current_mockup" && !multiHintActive && !legacyHint && !customTweakRaw) {
    return {
      error:
        "Select at least one suggestion, add custom directions, or both — then click Apply changes.",
    };
  }

  if (
    selectedStyle === "your_vision" &&
    !userDescriptionRegen &&
    !multiHintActive &&
    !legacyHint &&
    !customTweakRaw
  ) {
    return {
      error: "Describe your vision in the text box, or pick a preset style above.",
    };
  }

  let suggestionKind: "" | "save_money" | "improve_design" | "both" = "";
  let additionalPromptCore: string;
  if (multiHintActive) {
    if (saveHintSelections.length > 0 && designHintSelections.length > 0) suggestionKind = "both";
    else if (saveHintSelections.length > 0) suggestionKind = "save_money";
    else suggestionKind = "improve_design";
    additionalPromptCore = buildMultiSuggestionPrompt(
      selectedStyle,
      saveHintSelections,
      designHintSelections,
    );
  } else if (legacyHint) {
    suggestionKind = legacyKind;
    additionalPromptCore = buildRegenerateAdditionalPrompt(selectedStyle, legacyHint, legacyKind);
  } else {
    additionalPromptCore = buildGenerationPrompt(selectedStyle, userDescriptionRegen);
  }

  if (customTweakRaw) {
    additionalPromptCore = appendHomeownerCustomTweakBlock(additionalPromptCore, customTweakRaw);
    additionalPromptCore = applyCustomPromptHardRequirements(additionalPromptCore, customTweakRaw);
  }

  additionalPromptCore = applyFixtureScaleDirectivesIfNeeded(additionalPromptCore, [
    ...saveHintSelections,
    ...designHintSelections,
    legacyHint,
    customTweakRaw,
  ]);

  const surgicalScope = buildSurgicalTweakScopeBlock({
    saveHintSelections,
    designHintSelections,
    legacyHint,
    customTweakRaw,
  });
  if (surgicalScope) {
    additionalPromptCore = `${surgicalScope}\n\n${additionalPromptCore}`.slice(0, HOMEOWNER_TWEAK_PROMPT_MAX_CHARS);
  }

  const combinedTweakTextForWetZone = [
    ...saveHintSelections,
    ...designHintSelections,
    legacyHint,
    customTweakRaw,
    ...(regenerateFromRoom && userDescriptionRegen ? [userDescriptionRegen] : []),
  ].join("\n");
  const wetZoneRemodelIntent = detectWetZoneRemodelIntent(combinedTweakTextForWetZone);
  if (wetZoneRemodelIntent) {
    additionalPromptCore = `${buildWetZoneRemodelPromptBlock()}\n\n${additionalPromptCore}`.slice(
      0,
      HOMEOWNER_TWEAK_PROMPT_MAX_CHARS,
    );
  }

  const hintForTelemetry = [
    multiHintActive
      ? [saveHintSelections.join("\n"), designHintSelections.join("\n")].filter(Boolean).join("\n---\n")
      : legacyHint,
    customTweakRaw ? `Custom: ${customTweakRaw}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const tweakMode =
    regenerateFromRoom === false ||
    multiHintActive ||
    Boolean(legacyHint) ||
    Boolean(customTweakRaw);
  const additionalPromptFinal = appendTweakGuardrailsIfNeeded(additionalPromptCore, {
    tweakMode,
    wetZoneRemodelIntent,
  });

  await trackTryEvent({
    eventType: "generation_started",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId,
    metadata: {
      mode: hintForTelemetry ? "regenerate_with_hint" : "regenerate",
      suggestion_kind: suggestionKind || null,
      hint_length: hintForTelemetry.length,
      image_source: imageSource,
      from_mockup_id: refineFromMockupId,
      wet_zone_remodel: wetZoneRemodelIntent,
      image_provider: "vertex",
    },
  });

  const run = await runHomeownerTryMockupGeneration({
    projectId,
    selectedStyle,
    additionalPrompt: additionalPromptFinal,
    regenerateFromRoom,
    refineFromMockupId,
    requireVertex: true,
    wetZoneRemodelIntent,
    forceOpenAiComparison,
  });
  if (!run.ok) {
    const safeError = safeGenerationErrorMetadata(run.message);
    const { data: existingGeneration } = await svc.from("bathroom_generations").select("metadata").eq("id", generationId).maybeSingle();
    const existingMetadata =
      existingGeneration && typeof (existingGeneration as { metadata?: unknown }).metadata === "object"
        ? ((existingGeneration as { metadata?: Record<string, unknown> }).metadata ?? {})
        : {};
    await svc
      .from("bathroom_generations")
      .update({
        status: "failed",
        metadata: {
          ...existingMetadata,
          generation_error: safeError,
          last_failed_at: new Date().toISOString(),
        },
      })
      .eq("id", generationId);
    await trackTryEvent({
      eventType: "generation_failed",
      userId: viewer.userId,
      anonymousSessionId: viewer.anonymousSessionId,
      projectId,
      metadata: { mode: "regenerate", generation_id: generationId, error_code: safeError.error_code },
    });
    return { error: run.message };
  }

  const mockups = await listMockupsForHomeownerProject(projectId);
  let latest = [...mockups].sort((a, b) => b.mockup_generation - a.mockup_generation)[0];
  if (!latest?.storage_path || !latest.id) {
    return { error: "Could not load regenerated image." };
  }
  const project = await getHomeownerTryProjectById(projectId);
  if (!project?.before_storage_path) return { error: "Missing source image." };
  const [beforeSigned, generatedSignedInitial] = await Promise.all([
    svc.storage.from(PHOTOS_BUCKET).createSignedUrl(project.before_storage_path, 60 * 60),
    svc.storage.from(PHOTOS_BUCKET).createSignedUrl(latest.storage_path, 60 * 60),
  ]);
  let generatedSigned = generatedSignedInitial;
  const beforeForVision =
    (await beforeImageUrlForOpenAiVision(svc, project.before_storage_path, beforeSigned.data?.signedUrl)) ||
    generatedSigned.data?.signedUrl ||
    "";
  /** When rescue rerender is disabled, skip QA vision call to reduce latency. */
  const allowRescue = process.env.TRY_QA_RESCUE_REGEN?.trim() === "1";
  if (allowRescue && beforeForVision && generatedSigned.data?.signedUrl) {
    const qa = await evaluateBathroomResultQuality({
      beforeImageUrl: beforeForVision,
      afterImageUrl: generatedSigned.data.signedUrl,
      selectedStyle,
      wetZoneRemodelIntent,
    });
    if (!qa.pass) {
        const rescuePrompt = `${additionalPromptFinal}\n\n${wetZoneRemodelIntent ? QUALITY_RESCUE_PROMPT_WET_ZONE : QUALITY_RESCUE_PROMPT}`;
        await runHomeownerTryMockupGeneration({
          projectId,
          selectedStyle,
          additionalPrompt: rescuePrompt,
          regenerateFromRoom,
          refineFromMockupId,
          requireVertex: true,
          wetZoneRemodelIntent,
          forceOpenAiComparison,
        });
        const rerunMockups = await listMockupsForHomeownerProject(projectId);
        const rerunLatest = [...rerunMockups].sort((a, b) => b.mockup_generation - a.mockup_generation)[0];
        if (rerunLatest?.storage_path && rerunLatest.id) {
          generatedSigned = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(rerunLatest.storage_path, 60 * 60);
          latest = rerunLatest;
        }
    }
  }
  if (!generatedSigned.data?.signedUrl) return { error: "Could not prepare regenerated image." };

  const beforeForEstimate =
    beforeForVision ?? beforeSigned.data?.signedUrl ?? generatedSigned.data.signedUrl;
  if (!beforeForEstimate) return { error: "Could not prepare the before photo for the estimate." };

  const styleConfig = getBathroomStyleById(selectedStyle) ?? getBathroomStyleById("clean_refresh");
  if (!styleConfig) return { error: "Missing style configuration." };
  const styleDefaults = defaultEstimateFromStyle(styleConfig);
  const estimateContextParts: string[] = [];
  if (suggestionKind === "save_money") {
    estimateContextParts.push("Regeneration was driven by budget-down suggestion(s) from the UI.");
  } else if (suggestionKind === "improve_design") {
    estimateContextParts.push("Regeneration was driven by design-upgrade suggestion(s) from the UI.");
  } else if (suggestionKind === "both") {
    estimateContextParts.push(
      "Regeneration applied both lower-cost and design-upgrade suggestion(s) from the UI in one pass.",
    );
  }
  if (hintForTelemetry) {
    estimateContextParts.push(`Tweak / hint / custom text: ${hintForTelemetry}`);
    estimateContextParts.push(
      "When writing new save_money/improve_design suggestions for this updated AFTER image, avoid repeating the exact same wording from the selected tweak text above unless still visually unresolved.",
    );
  }
  if (imageSource === "current_mockup") {
    estimateContextParts.push(
      "AFTER is a new render tweaked from the prior mockup (same real room as BEFORE); small visible finish changes may shift cost vs the previous after image.",
    );
  } else {
    estimateContextParts.push("AFTER is a new render generated again from the original BEFORE photo.");
  }
  const estimateUserNotes = estimateContextParts.join(" ").slice(0, 1600);

  const estimateFromImages = await estimateBathroomCostsFromBeforeAfter({
    beforeImageUrl: beforeForEstimate,
    afterImageUrl: generatedSigned.data.signedUrl,
    selectedStyle,
    userDescription: estimateUserNotes,
    styleDefaults,
  });
  const selectedSaveTextsThisRun = [
    ...saveHintSelections,
    ...(legacyKind === "save_money" && legacyHint ? [legacyHint] : []),
  ];
  const selectedDesignTextsThisRun = [
    ...designHintSelections,
    ...(legacyKind === "improve_design" && legacyHint ? [legacyHint] : []),
    ...(customTweakRaw ? [customTweakRaw] : []),
  ];
  const saveMoneySuggestions = pruneUsedTweakSuggestions({
    suggestions: estimateFromImages.saveMoneySuggestions,
    selectedThisRun: selectedSaveTextsThisRun,
    fallbackSuggestions: styleDefaults.saveMoneySuggestions,
  });
  const improveDesignSuggestions = pruneUsedTweakSuggestions({
    suggestions: estimateFromImages.improveDesignSuggestions,
    selectedThisRun: selectedDesignTextsThisRun,
    fallbackSuggestions: styleDefaults.improveDesignSuggestions,
  });

  const versionTtl = 60 * 60;
  const mockupVersions = await loadSignedMockupVersionsForProject(projectId, versionTtl);
  const { data: existingGeneration } = await svc
    .from("bathroom_generations")
    .select("attribution")
    .eq("id", generationId)
    .maybeSingle();
  const mergedGenerationAttribution = mergeAttribution(
    sanitizeAttribution((existingGeneration as { attribution?: unknown } | null)?.attribution ?? null),
    incomingAttribution,
  );

  const tweakRows = tweaksUsedForRegeneration({
    saveHintSelections,
    designHintSelections,
    legacyHint,
    customTweakRaw,
  });
  await svc.from("bathroom_generations").upsert(
    {
      id: generationId,
      session_id: viewer.anonymousSessionId,
      user_id: viewer.userId,
      project_id: projectId,
      selected_style: selectedStyleConfig.name,
      user_description: userDescriptionRegen || null,
      uploaded_image_url: project.before_storage_path,
      generated_image_url: latest.storage_path,
      tweaks_used: tweakRows,
      estimate_low: estimateFromImages.estimateRange.min,
      estimate_expected: Math.round((estimateFromImages.estimateRange.min + estimateFromImages.estimateRange.max) / 2),
      estimate_high: estimateFromImages.estimateRange.max,
      estimate_min: estimateFromImages.estimateRange.min,
      estimate_max: estimateFromImages.estimateRange.max,
      scope_of_work: scopeOfWorkFromEstimate(estimateFromImages),
      contractor_notes: null,
      status: "completed",
      attribution: mergedGenerationAttribution,
      metadata: {
        regenerated_at: new Date().toISOString(),
      },
    },
    { onConflict: "id" },
  );

  await trackTryEvent({
    eventType: "generation_completed",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId,
    metadata: { mode: "regenerate", generation_id: generationId },
  });

  // Logged-in users should always have their latest project available in My Projects.
  if (viewer.userId) {
    const autoSaveResult = await saveMyProjectForViewerCore({
      generationId,
      projectId,
      attribution: incomingAttribution,
    });
    if (!("ok" in autoSaveResult)) {
      console.warn("[renovision][auto-save] regenerate auto-save failed", autoSaveResult);
    }
  }

  revalidatePath("/try");
  revalidatePath("/upload");
  revalidatePath("/projects");
  return {
    success: true,
    uploadedImageUrl: beforeSigned.data?.signedUrl ?? "",
    generatedImageUrl: generatedSigned.data.signedUrl,
    projectId,
    selectedStyle,
    styleName: selectedStyleConfig?.name ?? "Clean Refresh",
    estimateRange: estimateFromImages.estimateRange,
    breakdown: estimateFromImages.breakdown,
    detailedBreakdown: estimateFromImages.detailedBreakdown,
    reasoning: estimateFromImages.reasoning,
    assumptions: estimateFromImages.assumptions,
    confidence: estimateFromImages.confidence,
    saveMoneySuggestions,
    improveDesignSuggestions,
    mockupVersions,
    activeMockupId: latest.id,
  };
}

type TryEstimateClientFields = Pick<
  BathroomEstimateBreakdown,
  | "estimateRange"
  | "breakdown"
  | "detailedBreakdown"
  | "reasoning"
  | "assumptions"
  | "confidence"
  | "saveMoneySuggestions"
  | "improveDesignSuggestions"
>;

export async function selectTryMockupVersionAction(
  _prev: unknown,
  formData: FormData,
): Promise<
  | { error: string }
  | ({
      success: true;
      generatedImageUrl: string;
      activeMockupId: string;
      mockupVersions: SignedTryMockupVersion[];
    } & Partial<TryEstimateClientFields>)
> {
  const generationId = str(formData, "generation_id");
  const projectId = str(formData, "project_id");
  const mockupId = str(formData, "mockup_id");
  if (!generationId || !projectId || !mockupId) return { error: "Missing selection." };

  const viewer = await getViewerContext(true);
  const svc = createServiceClient();

  if (!(await mockupBelongsToProject(projectId, mockupId))) {
    return { error: "Invalid mockup for this project." };
  }

  const { data: row, error } = await svc
    .from("homeowner_try_mockups")
    .select("storage_path")
    .eq("id", mockupId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error || !row?.storage_path) return { error: "Could not load mockup." };

  const storagePath = String(row.storage_path);
  const signed = await svc.storage.from(PHOTOS_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (!signed.data?.signedUrl) return { error: "Could not sign mockup image." };

  const { data: genStyleRow } = await svc
    .from("bathroom_generations")
    .select("selected_style")
    .eq("id", generationId)
    .maybeSingle();
  const styleId = resolveBathroomStyleIdFromGeneration(genStyleRow?.selected_style);
  const imageEstimate = await runTryPriceEstimateForMockup({
    projectId,
    afterStoragePath: storagePath,
    selectedStyle: styleId,
    userDescription:
      "User switched which saved mockup version is shown. AFTER is the newly selected mockup render vs the same original BEFORE photo. Re-score visible scope and write fresh save_money (4) and improve_design (4) lines for this AFTER image.",
  });

  const genPatch: {
    generated_image_url: string;
    selected_variation: string;
    estimate_min?: number;
    estimate_max?: number;
  } = {
    generated_image_url: storagePath,
    selected_variation: mockupId,
  };
  if (imageEstimate) {
    genPatch.estimate_min = imageEstimate.estimateRange.min;
    genPatch.estimate_max = imageEstimate.estimateRange.max;
  }
  await svc.from("bathroom_generations").update(genPatch).eq("id", generationId);

  await trackTryEvent({
    eventType: "try_mockup_version_selected",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId,
    metadata: { generation_id: generationId, mockup_id: mockupId },
  });

  const mockupVersions = await loadSignedMockupVersionsForProject(projectId, 60 * 60);
  revalidatePath("/try");
  revalidatePath("/upload");
  revalidatePath("/projects");
  return {
    success: true,
    generatedImageUrl: signed.data.signedUrl,
    activeMockupId: mockupId,
    mockupVersions,
    ...(imageEstimate
      ? {
          estimateRange: imageEstimate.estimateRange,
          breakdown: imageEstimate.breakdown,
          detailedBreakdown: imageEstimate.detailedBreakdown,
          reasoning: imageEstimate.reasoning,
          assumptions: imageEstimate.assumptions,
          confidence: imageEstimate.confidence,
          saveMoneySuggestions: imageEstimate.saveMoneySuggestions,
          improveDesignSuggestions: imageEstimate.improveDesignSuggestions,
        }
      : {}),
  };
}

export async function loadTryGenerationForViewer(params: {
  generationId: string;
  projectId: string;
}): Promise<TryGenerationViewState | null> {
  const generationId = String(params.generationId || "").trim();
  const projectId = String(params.projectId || "").trim();
  if (!generationId || !projectId) return null;

  const viewer = await getViewerContext(false);
  const svc = createServiceClient();
  const { data: generation } = await svc
    .from("bathroom_generations")
    .select(
      "id, project_id, selected_style, uploaded_image_url, generated_image_url, estimate_min, estimate_max, try_estimate_snapshot",
    )
    .eq("id", generationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!generation) return null;

  const { data: project } = await svc
    .from("homeowner_try_projects")
    .select("id, user_id, anonymous_session_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const canView =
    // Post-signup restore links can target a guest project. Allow logged-in viewers
    // to load unclaimed projects so `auto_save_project=1` can claim/save them.
    (viewer.userId && (project.user_id === viewer.userId || project.user_id == null)) ||
    (!viewer.userId && viewer.anonymousSessionId && project.anonymous_session_id === viewer.anonymousSessionId);
  if (!canView) return null;

  const styleId = resolveBathroomStyleIdFromGeneration(generation.selected_style);
  const style = getBathroomStyleById(styleId) ?? getBathroomStyleById("clean_refresh");
  if (!style) return null;
  const defaults = defaultEstimateFromStyle(style);

  const [beforeSigned, afterSigned] = await Promise.all([
    svc.storage.from(PHOTOS_BUCKET).createSignedUrl(String(generation.uploaded_image_url || ""), 60 * 60),
    svc.storage.from(PHOTOS_BUCKET).createSignedUrl(String(generation.generated_image_url || ""), 60 * 60),
  ]);
  if (!beforeSigned.data?.signedUrl || !afterSigned.data?.signedUrl) return null;

  const mockupVersions = await loadSignedMockupVersionsForProject(projectId, 60 * 60);
  const active = mockupVersions.at(-1);

  const snapshot = parseTryEstimateSnapshotJson(
    (generation as { try_estimate_snapshot?: unknown }).try_estimate_snapshot,
  );

  return {
    generationId,
    projectId,
    selectedStyle: styleId,
    styleName: style.name,
    uploadedImageUrl: beforeSigned.data.signedUrl,
    generatedImageUrl: afterSigned.data.signedUrl,
    estimateRange: snapshot?.estimateRange ?? {
      min: clampMoney(generation.estimate_min, defaults.estimateRange.min),
      max: clampMoney(generation.estimate_max, defaults.estimateRange.max),
    },
    breakdown: snapshot?.breakdown ?? defaults.breakdown,
    detailedBreakdown: snapshot?.detailedBreakdown ?? defaults.detailedBreakdown,
    reasoning: snapshot?.reasoning ?? defaults.reasoning,
    assumptions: snapshot?.assumptions ?? defaults.assumptions,
    confidence: snapshot?.confidence ?? defaults.confidence,
    saveMoneySuggestions: snapshot?.saveMoneySuggestions ?? defaults.saveMoneySuggestions,
    improveDesignSuggestions: snapshot?.improveDesignSuggestions ?? defaults.improveDesignSuggestions,
    mockupVersions,
    activeMockupId: active?.id ?? "",
  };
}

export async function pollTryEstimateRefinementAction(
  generationId: string,
  projectId: string,
): Promise<{ ready: false } | ({ ready: true } & TryEstimatePollFields)> {
  const genId = String(generationId || "").trim();
  const projId = String(projectId || "").trim();
  if (!genId || !projId) return { ready: false };

  const viewer = await getViewerContext(false);
  const svc = createServiceClient();
  const { data: generation } = await svc
    .from("bathroom_generations")
    .select("project_id, try_estimate_snapshot")
    .eq("id", genId)
    .maybeSingle();
  if (!generation || String(generation.project_id) !== projId) return { ready: false };

  const { data: project } = await svc
    .from("homeowner_try_projects")
    .select("user_id, anonymous_session_id")
    .eq("id", projId)
    .maybeSingle();
  if (!project) return { ready: false };

  const canView =
    (viewer.userId && (project.user_id === viewer.userId || project.user_id == null)) ||
    (!viewer.userId && viewer.anonymousSessionId && project.anonymous_session_id === viewer.anonymousSessionId);
  if (!canView) return { ready: false };

  const parsed = parseTryEstimateSnapshotJson(
    (generation as { try_estimate_snapshot?: unknown }).try_estimate_snapshot,
  );
  if (!parsed) return { ready: false };
  return { ready: true, ...parsed };
}

export async function loadLatestTryGenerationForViewer(): Promise<TryGenerationViewState | null> {
  const viewer = await getViewerContext(false);
  const svc = createServiceClient();

  let generationId = "";
  let projectId = "";

  if (viewer.userId) {
    const { data: latest } = await svc
      .from("bathroom_generations")
      .select("id, project_id")
      .eq("user_id", viewer.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    generationId = String(latest?.id ?? "").trim();
    projectId = String(latest?.project_id ?? "").trim();
  } else if (viewer.anonymousSessionId) {
    const { data: latest } = await svc
      .from("bathroom_generations")
      .select("id, project_id")
      .eq("session_id", viewer.anonymousSessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    generationId = String(latest?.id ?? "").trim();
    projectId = String(latest?.project_id ?? "").trim();
  }

  if (!generationId || !projectId) return null;
  return loadTryGenerationForViewer({ generationId, projectId });
}

async function saveMyProjectForViewerCore(params: {
  generationId: string;
  projectId: string;
  attribution: RenovisionAttribution | null;
}): Promise<
  | { ok: true }
  | { error: string }
  | {
      requiresAuth: true;
      loginPath: string;
      signupPath: string;
      magicLinkPath: string;
      googlePath: string;
    }
> {
  const generationId = params.generationId.trim();
  const projectId = params.projectId.trim();
  if (!generationId || !projectId) return { error: "Missing project context." };
  const viewer = await getViewerContext(true);
  await persistViewerAttribution({ viewer, attribution: params.attribution });
  const nextPath = `/try?restore_generation_id=${encodeURIComponent(generationId)}&restore_project_id=${encodeURIComponent(projectId)}&auto_save_project=1`;
  if (!viewer.userId) {
    return {
      requiresAuth: true,
      loginPath: `/login?next=${encodeURIComponent(nextPath)}`,
      signupPath: `/signup?next=${encodeURIComponent(nextPath)}`,
      magicLinkPath: `/auth/magic-link?next=${encodeURIComponent(nextPath)}`,
      googlePath: `/auth/google/start?next=${encodeURIComponent(nextPath)}`,
    };
  }

  const svc = createServiceClient();
  const { data: generation } = await svc
    .from("bathroom_generations")
    .select("id, project_id, uploaded_image_url, generated_image_url, selected_style, estimate_min, estimate_max, attribution")
    .eq("id", generationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!generation) return { error: "Could not find this generated project." };

  const { data: lead } = await svc
    .from("leads")
    .select("id, zip_code")
    .eq("generation_id", generationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await svc
    .from("homeowner_try_projects")
    .update({
      user_id: viewer.userId,
      anonymous_session_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  await svc.from("bathroom_generations").update({ user_id: viewer.userId }).eq("id", generationId);

  const payload = {
    user_id: viewer.userId,
    project_id: projectId,
    generation_id: generationId,
    before_storage_path: generation.uploaded_image_url,
    generated_storage_path: generation.generated_image_url,
    selected_style: generation.selected_style,
    estimate_min: generation.estimate_min,
    estimate_max: generation.estimate_max,
    zip_code: lead?.zip_code ?? null,
    lead_id: lead?.id ?? null,
    attribution: mergeAttribution(
      sanitizeAttribution((generation as { attribution?: unknown }).attribution ?? null),
      params.attribution,
    ),
    status: "saved",
    updated_at: new Date().toISOString(),
  };

  const { error } = await svc.from("renovision_saved_projects").upsert(payload, {
    onConflict: "user_id,project_id",
  });
  if (error) return { error: error.message };

  await trackTryEvent({
    eventType: "project_saved",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId,
    metadata: { generation_id: generationId },
  });
  return { ok: true };
}

export async function saveMyProjectForViewer(params: {
  generationId: string;
  projectId: string;
  attribution?: RenovisionAttribution | null;
}): Promise<
  | { success: true }
  | { error: string }
  | { requiresAuth: true; loginPath: string; signupPath: string; magicLinkPath: string; googlePath: string }
> {
  const res = await saveMyProjectForViewerCore({
    generationId: params.generationId,
    projectId: params.projectId,
    attribution: params.attribution ?? null,
  });
  if ("ok" in res) return { success: true };
  return res;
}

export async function saveMyProjectAction(
  _prev: unknown,
  formData: FormData,
): Promise<
  | { error: string }
  | { success: true }
  | { requiresAuth: true; loginPath: string; signupPath: string; magicLinkPath: string; googlePath: string }
> {
  const result = await saveMyProjectForViewerCore({
    generationId: str(formData, "generation_id"),
    projectId: str(formData, "project_id"),
    attribution: attributionFromFormData(formData),
  });
  if ("ok" in result) return { success: true };
  return result;
}

export async function trackConnectClickedAction(
  _prev: unknown,
  formData: FormData,
): Promise<{ success: true }> {
  const projectId = str(formData, "project_id");
  const generationId = str(formData, "generation_id");
  const viewer = await getViewerContext(true);
  const incomingAttribution = attributionFromFormData(formData);
  await persistViewerAttribution({ viewer, attribution: incomingAttribution });
  await trackTryEvent({
    eventType: "connect_clicked",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId: projectId || null,
    metadata: { generation_id: generationId || null, attribution: incomingAttribution },
  });
  return { success: true };
}

function userFacingLeadInsertError(err: { message: string; code?: string }): string {
  const code = String(err.code ?? "");
  const msg = err.message.toLowerCase();
  if (code === "23503" || msg.includes("foreign key") || msg.includes("violates foreign key")) {
    return "That preview is no longer linked to your session (it may have expired). Create a new mockup on /try and submit the form again.";
  }
  if (process.env.NODE_ENV !== "production") {
    return `Could not save lead: ${err.message}`;
  }
  return "We couldn’t save your request. Please try again in a moment.";
}

function leadInsertErrorCode(err: { message: string; code?: string }): string {
  const code = String(err.code ?? "");
  const msg = err.message.toLowerCase();
  if (code === "23503" || msg.includes("foreign key")) return "generation_missing_or_invalid";
  if (code === "42501" || msg.includes("row level security")) return "permission_denied";
  if (code === "23514" || msg.includes("check constraint")) return "invalid_status_or_constraint";
  if (code === "22P02" || msg.includes("invalid input syntax")) return "invalid_input";
  return "insert_failed";
}

export async function submitBathroomLeadAction(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string; errorCode?: string } | { success: true; leadId: string }> {
  const generationId = str(formData, "generation_id");
  const projectId = str(formData, "project_id");
  const selectedStyle = str(formData, "selected_style");
  const estimateMin = Number(str(formData, "estimate_min") || "0");
  const estimateMax = Number(str(formData, "estimate_max") || "0");
  const firstName = str(formData, "first_name").slice(0, 80);
  const lastName = str(formData, "last_name").slice(0, 80);
  const name = [firstName, lastName].filter(Boolean).join(" ").slice(0, 120);
  const email = str(formData, "email").slice(0, 180);
  const phone = str(formData, "phone").slice(0, 40);
  const zipRaw = str(formData, "zip_code").slice(0, 20);
  const zipCode = normalizeUsZipCode(zipRaw);
  const streetAddress = str(formData, "street_address").slice(0, 500);
  const timeline = str(formData, "timeline").slice(0, 60);
  const budgetRange = str(formData, "budget_range").slice(0, 60);
  const preferredContactMethod = str(formData, "preferred_contact_method").slice(0, 40);
  const bestContactTime = str(formData, "best_contact_time").slice(0, 40);
  const notes = str(formData, "project_notes").slice(0, 2000);
  const estimateConfidence = str(formData, "estimate_confidence").slice(0, 20);

  const safeJson = (key: string): unknown => {
    const raw = str(formData, key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const estimateBreakdown = safeJson("estimate_breakdown_json");
  const estimateDetailedBreakdown = safeJson("estimate_detailed_breakdown_json");
  const estimateReasoning = safeJson("estimate_reasoning_json");
  const estimateAssumptions = safeJson("estimate_assumptions_json");

  if (!generationId || !selectedStyle) return { error: "Missing generation details.", errorCode: "missing_generation_details" };
  if (!zipCode) {
    return { error: "Please enter a valid US ZIP code (5 digits, or ZIP+4).", errorCode: "invalid_zip_code" };
  }
  if (!firstName || !email || !phone || !timeline || !budgetRange || !preferredContactMethod) {
    return { error: "Please complete all required fields.", errorCode: "missing_required_fields" };
  }

  const viewer = await getViewerContext(true);
  const incomingAttribution = attributionFromFormData(formData);
  await persistViewerAttribution({ viewer, attribution: incomingAttribution });
  const svc = createServiceClient();
  const { data: generationRow, error: generationLoadError } = await svc
    .from("bathroom_generations")
    .select(
      "id, session_id, uploaded_image_url, generated_image_url, selected_style, estimate_low, estimate_expected, estimate_high, estimate_confidence, scope_of_work, contractor_notes, estimate_min, estimate_max, try_estimate_snapshot",
    )
    .eq("id", generationId)
    .maybeSingle();
  if (generationLoadError) {
    console.error("[try] bathroom_generations load failed before lead insert:", generationLoadError.message);
    return {
      error: "We couldn’t load this project snapshot. Please regenerate and try again.",
      errorCode: "generation_load_failed",
    };
  }
  if (!generationRow) {
    return {
      error: "That preview could not be found. Please create a new preview and submit again.",
      errorCode: "generation_not_found",
    };
  }

  const resolvedEstimateLow = Number(generationRow.estimate_low ?? estimateMin ?? generationRow.estimate_min ?? 0);
  const resolvedEstimateHigh = Number(generationRow.estimate_high ?? estimateMax ?? generationRow.estimate_max ?? 0);
  const resolvedEstimateExpected =
    generationRow.estimate_expected != null
      ? Number(generationRow.estimate_expected)
      : Math.round((resolvedEstimateLow + resolvedEstimateHigh) / 2);
  const resolvedSessionId =
    typeof generationRow.session_id === "string" && generationRow.session_id.trim()
      ? generationRow.session_id.trim()
      : viewer.anonymousSessionId;
  const scopeOfWorkFromForm =
    estimateDetailedBreakdown || estimateReasoning || estimateAssumptions
      ? {
          detailed_breakdown: estimateDetailedBreakdown,
          reasoning: estimateReasoning,
          assumptions: estimateAssumptions,
          estimate_breakdown: estimateBreakdown,
        }
      : null;
  const resolvedScopeOfWork =
    generationRow.scope_of_work ??
    scopeOfWorkFromForm ??
    (generationRow.try_estimate_snapshot ? { try_estimate_snapshot: generationRow.try_estimate_snapshot } : null);

  const { data: insertedLead, error: leadInsertError } = await svc
    .from("leads")
    .insert({
      generation_id: generationId,
      session_id: resolvedSessionId ?? null,
      first_name: firstName,
      last_name: lastName || null,
      name,
      email,
      phone,
      street_address: streetAddress || null,
      zip_code: zipCode,
      timeline,
      budget_range: budgetRange,
      preferred_contact_method: preferredContactMethod,
      best_contact_time: bestContactTime || null,
      project_notes: notes || null,
      selected_style: selectedStyle || String(generationRow.selected_style ?? ""),
      uploaded_image_url: String(generationRow.uploaded_image_url ?? "") || null,
      generated_image_url: String(generationRow.generated_image_url ?? "") || null,
      estimate_low: resolvedEstimateLow,
      estimate_expected: resolvedEstimateExpected,
      estimate_high: resolvedEstimateHigh,
      scope_of_work: resolvedScopeOfWork,
      contractor_notes: generationRow.contractor_notes ?? null,
      estimate_min: estimateMin,
      estimate_max: estimateMax,
      estimate_breakdown: estimateBreakdown,
      estimate_detailed_breakdown: estimateDetailedBreakdown,
      estimate_reasoning: estimateReasoning,
      estimate_assumptions: estimateAssumptions,
      estimate_confidence: estimateConfidence || generationRow.estimate_confidence || null,
      attribution: incomingAttribution,
    })
    .select("id")
    .single();
  if (leadInsertError) {
    console.error("[try] leads insert failed:", leadInsertError.message, leadInsertError);
    return { error: userFacingLeadInsertError(leadInsertError), errorCode: leadInsertErrorCode(leadInsertError) };
  }
  if (!insertedLead?.id) {
    console.error("[try] leads insert returned no row");
    return {
      error:
        process.env.NODE_ENV !== "production"
          ? "Lead insert returned no row (check RLS and grants)."
          : "We couldn’t save your request. Please try again in a moment.",
      errorCode: "insert_returned_no_row",
    };
  }
  if (process.env.NODE_ENV !== "production" && incomingAttribution) {
    console.log("[renovision][attribution][lead]", { generationId, projectId, attribution: incomingAttribution });
  }
  const { error: generationFlagError } = await svc
    .from("bathroom_generations")
    .update({ lead_submitted: true })
    .eq("id", generationId);
  if (generationFlagError) {
    console.error("[try] bathroom_generations lead_submitted update failed:", generationFlagError.message);
  }

  await trackTryEvent({
    eventType: "lead_submitted",
    userId: viewer.userId,
    anonymousSessionId: viewer.anonymousSessionId,
    projectId: projectId || null,
    metadata: { generation_id: generationId, selected_style: selectedStyle },
  });

  revalidatePath("/try");
  revalidatePath("/upload");
  revalidatePath("/projects");
  revalidatePath("/admin/contractors");
  revalidatePath("/admin/leads");
  console.info("[try] lead_inserted", { leadId: insertedLead.id, generationId, projectId });
  return { success: true, leadId: insertedLead.id };
}
