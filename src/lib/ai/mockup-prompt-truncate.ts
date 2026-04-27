/**
 * Image-edit prompts grew (layout gates + full estimate). Naive `slice(0, N)` drops the
 * tail where scope, remodel instructions, and quote lines live — models then ignore the job.
 * Prefer keeping both the opening rules and the closing task text.
 */
const DEFAULT_MARKER =
  "\n\n[... middle of prompt omitted for length — opening rules above; job scope / lines / remodel below ...]\n\n";

export function truncateMockupTextPrompt(
  full: string,
  maxChars: number,
  marker: string = DEFAULT_MARKER,
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
 * Truncates long mockup prompts then appends {@link MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX} within `maxChars`.
 */
export function truncateMockupTextPromptWithLayoutReinforcement(
  full: string,
  maxChars: number,
  marker: string = DEFAULT_MARKER,
): string {
  const suffix = MOCKUP_LAYOUT_REINFORCEMENT_SUFFIX;
  const sep = "\n\n";
  const suffixBlock = `${sep}${suffix}`;
  const suffixLen = suffixBlock.length;
  const innerMax = maxChars - suffixLen;
  // Prefer full reinforcement; if the budget cannot fit it, fall back to plain truncation.
  if (innerMax < 80) {
    return truncateMockupTextPrompt(full, maxChars, marker);
  }
  const body = truncateMockupTextPrompt(full, innerMax, marker);
  return `${body}${suffixBlock}`;
}
