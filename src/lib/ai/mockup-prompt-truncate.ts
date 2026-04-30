/**
 * Image-edit prompts grew (layout gates + full estimate). Naive `slice(0, N)` drops the
 * tail where scope, remodel instructions, and quote lines live — models then ignore the job.
 * Prefer keeping both the opening rules and the closing task text.
 */
export const MOCKUP_PROMPT_TRUNCATE_MARKER =
  "\n\n[... middle of prompt omitted for length — opening rules above; job scope / lines / remodel below ...]\n\n";

export function truncateMockupTextPrompt(
  full: string,
  maxChars: number,
  marker: string = MOCKUP_PROMPT_TRUNCATE_MARKER,
): string {
  if (full.length <= maxChars) return full;
  if (maxChars < 400) return full.slice(0, maxChars);
  const m = marker.length <= maxChars - 200 ? marker : "\n…\n";
  const budget = maxChars - m.length;
  if (budget < 400) return full.slice(0, maxChars);
  /** Favor head for layout gates; tail ~47% for scope, remodel, and product-ref text. */
  const tailChars = Math.min(Math.floor(budget * 0.47), full.length);
  const headChars = Math.max(0, budget - tailChars);
  return full.slice(0, headChars) + m + full.slice(-tailChars);
}

/**
 * Repeated at the **end** of image-edit text after truncation so layout rules stay in the model’s
 * recency window even when the middle of the prompt is omitted.
 */
export const MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX = [
  "LAYOUT REINFORCEMENT (truncation tail — still applies):",
  "Room photo = only floor plan: keep walls, openings, shower curb/glass, niches, partitions, and left–right framing.",
  "Toilet / tub / shower / vanity / drains: same footprints unless scope or per-run notes explicitly move/remove them.",
  "Wet box is rigid: tile/SKU = new skin on existing wet surfaces only — never slide or resize the enclosure for a catalog layout.",
  "Mirrors/glass: reflections do not move real fixtures — anchor to direct-view curbs and walls.",
  "Product refs: match materials/hardware on each ZONE (full vanity height in frame when that line is the vanity). Catalog vanity backdrops are not layout authority.",
].join("\n");

/**
 * End-of-prompt reinforcement for `/try` **Update preview** runs: must NOT contradict the PRIORITY
 * homeowner block at the top (the default suffix’s “wet box rigid” line often overwrote tweak intent).
 */
export const MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX_HOMEOWNER_TWEAK = [
  "LAYOUT (HOMEOWNER TWEAK RUN — READ LAST, BUT MUST MATCH THE TOP OF THIS PROMPT):",
  "The section at the BEGINNING labeled PRIORITY — HOMEOWNER TWEAKS lists the changes for THIS image. Implement those visible finish/fixture updates — they override generic preservation wording when they name a surface, fixture, or zone.",
  "Keep the same camera angle and overall room footprint as the input image (no widening, no reframing). Wet-zone glass/enclosure may change only when those tweak bullets or wet-zone wording explicitly describe it.",
  "Do not substitute a whole-room restyle or unrelated upgrades for the numbered bullets.",
  "Product JPEG references (if present): match materials/finishes to their labeled quote zones only.",
].join("\n");

export type TruncateMockupLayoutOpts = {
  /** `/try` tweak from an existing mockup — use {@link MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX_HOMEOWNER_TWEAK}. */
  homeownerMockupTweak?: boolean;
  /**
   * Inserted after the truncated body and **before** {@link MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX}.
   * Used when long prompts would drop a critical middle section (e.g. luxury OpenAI vision-built prompt).
   */
  preLayoutReinforcementBlock?: string;
};

/**
 * Truncates long mockup prompts then appends a layout reinforcement suffix within `maxChars`.
 */
export function truncateMockupTextPromptWithLayoutReinforcement(
  full: string,
  maxChars: number,
  marker: string = MOCKUP_PROMPT_TRUNCATE_MARKER,
  opts?: TruncateMockupLayoutOpts,
): string {
  const suffix = opts?.homeownerMockupTweak
    ? MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX_HOMEOWNER_TWEAK
    : MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX;
  const sep = "\n\n";
  const preRaw = opts?.preLayoutReinforcementBlock?.trim() ?? "";
  const preBlock = preRaw ? `${sep}${preRaw}` : "";
  const suffixBlock = `${sep}${suffix}`;
  const reservedLen = preBlock.length + suffixBlock.length;
  const innerMax = maxChars - reservedLen;
  // Prefer full reinforcement; if the budget cannot fit it, fall back to plain truncation.
  if (innerMax < 80) {
    return truncateMockupTextPrompt(full, maxChars, marker);
  }
  const body = truncateMockupTextPrompt(full, innerMax, marker);
  return `${body}${preBlock}${suffixBlock}`;
}
