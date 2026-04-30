/**
 * Detects tub/shower remodel language (walk-in, curbless, tub-to-shower, etc.).
 * Used to override generic "do not change shower opening" guardrails for visualization runs.
 */
export function detectWetZoneRemodelIntent(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.trim()) return false;

  /** Tub removal / swap language without requiring "shower" in the same phrase (model still needs wet-zone path). */
  const tubRemovalOrSwap =
    (t.includes("remove") && (t.includes("tub") || t.includes("bathtub"))) ||
    (t.includes("removing") && (t.includes("tub") || t.includes("bathtub"))) ||
    (t.includes("get rid") && (t.includes("tub") || t.includes("bathtub"))) ||
    (t.includes("take out") && (t.includes("tub") || t.includes("bathtub"))) ||
    (t.includes("take away") && (t.includes("tub") || t.includes("bathtub"))) ||
    (t.includes("lose ") && t.includes("tub")) ||
    (t.includes("without") && (t.includes("tub") || t.includes("bathtub"))) ||
    t.includes("no tub") ||
    t.includes("replace") && t.includes("tub") && t.includes("shower");

  const walkIn =
    t.includes("walk-in") ||
    t.includes("walk in") ||
    t.includes("walkin") ||
    t.includes("walk-in shower") ||
    t.includes("walk in shower");

  const curbless =
    t.includes("curbless") ||
    t.includes("curb-less") ||
    t.includes("zero threshold") ||
    t.includes("zero-threshold") ||
    t.includes("barrier free") ||
    t.includes("barrier-free");

  const tubToShower =
    (t.includes("tub") && (t.includes("shower") || t.includes("remove") || t.includes("replace") || t.includes("convert"))) ||
    t.includes("tub to shower") ||
    t.includes("tub-to-shower") ||
    t.includes("bathtub to shower") ||
    (t.includes("remove") && t.includes("tub")) ||
    (t.includes("replace") && t.includes("tub"));

  const openEnclosure =
    (t.includes("open") && t.includes("shower")) ||
    t.includes("doorless") ||
    (t.includes("frameless") && (t.includes("shower") || t.includes("glass") || t.includes("enclosure")));

  const wetRoom = t.includes("wet room") || (t.includes("wetroom") && t.includes("shower"));

  return walkIn || curbless || tubToShower || openEnclosure || wetRoom || tubRemovalOrSwap;
}

/**
 * Placed **first** in Vertex image-edit prompts so it overrides per-style "shower width locked" / "do not remove fixtures" blocks.
 */
export function buildWetZoneVertexOverrideBanner(): string {
  return [
    "WET-ZONE REMODEL — OVERRIDES CONFLICTING RULES LATER IN THIS PROMPT",
    "The homeowner is changing the tub/shower wet area (e.g. remove tub, add walk-in shower, new glass, curbless).",
    "For the WET ZONE ONLY, IGNORE instructions elsewhere that: lock shower opening width to the original, forbid widening glass, forbid removing fixtures, or require finish-only edits — those rules apply to vanity, toilet, and dry areas, not to replumbing-style visualization of tub→shower.",
    "You MUST show the requested wet-zone result: no bathtub when removal was asked; walk-in / shower enclosure as described; same outer bathroom walls and same camera/room size read as the source.",
  ].join("\n");
}

/**
 * Strong, explicit instructions for the image model when wet-zone remodel language is present.
 * Must be placed early in the prompt (before style baseline) to override shower-enclosure locks.
 */
export function buildWetZoneRemodelPromptBlock(): string {
  return [
    "WET-ZONE REMODEL VISUALIZATION (MANDATORY — HIGHEST PRIORITY):",
    "The homeowner is asking to change the tub/shower / wet area (e.g. walk-in shower, curbless, tub-to-shower, open or frameless enclosure).",
    "You MUST show a clear, obvious change in the wet zone compared to the source image or baseline mockup. A no-op is invalid.",
    "Within the SAME bathroom outer walls, SAME camera, and SAME room footprint:",
    "- Update tub/shower enclosure, curb, pan, and glass to match the request (e.g. walk-in: wider clear opening, minimal or no curb, frameless or panel glass as appropriate).",
    "- If a tub is present and the request implies a shower, visualize tub removed and a shower in that same wet-zone alcove/footprint — do not add new exterior walls.",
    "LOCK everything outside the wet zone: vanity, toilet, mirrors, unrelated walls, floor outside the wet area — keep them matching the baseline unless a tiny blend at the wet-area edge is unavoidable.",
    "Do NOT shrink or expand the overall room; do NOT move windows or exterior doors; plumbing zones stay in the same general locations (visualization only).",
  ].join("\n");
}
