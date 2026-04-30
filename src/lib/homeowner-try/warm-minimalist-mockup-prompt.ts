/**
 * Primary creative brief for /try **Warm Minimalist** mockups (Vertex: Gemini image edit — same packaging as other styles).
 * Drives `buildGenerationPrompt` and the Vertex-only image prompt so the long brief is not buried by generic stacks.
 */
import { buildWetZoneVertexOverrideBanner } from "@/lib/homeowner-try/wet-zone-intent";

export const WARM_MINIMALIST_MOCKUP_USER_PROMPT = `You are editing a real bathroom photo.

Your goal is to create a realistic, buildable, WARM MINIMALIST remodel — NOT redesign the space.

---

🔒 PRESERVE STRUCTURE (NON-NEGOTIABLE)

Keep the EXACT:
- layout and floor plan
- wall positions and room size
- camera angle and perspective
- spacing between all objects

Do NOT:
- move walls, windows, or doors
- change the size of the room

---

🚨 GEOMETRY LOCK (CRITICAL — HIGHEST PRIORITY)

You must preserve the EXACT geometry of the original image.

- Do NOT widen the room
- Do NOT increase spacing between objects
- Do NOT make the room feel larger or more open
- Do NOT change distances between walls, fixtures, or edges

All objects must remain in the exact same positions, scale, and proportions.

If unsure, make NO geometric changes.

This rule overrides ALL styling instructions.

---

🚽 FIXTURE RULES

The bathroom contains:
- one toilet
- one sink
- one shower

You MUST:
- keep all fixtures in the SAME position
- NOT duplicate or remove fixtures
- NOT move plumbing locations

If any fixture is partially hidden:
→ keep the same edge-crop context (do not zoom/reframe to fully reveal it)

---

🚿 SHOWER + SPACING LOCK

- The shower opening width must match the original EXACTLY
- Glass panels must NOT extend beyond the original footprint
- Do NOT widen or optimize the shower

Maintain exact spacing between all elements.

---

📏 REALISM RULES

- Do not change fixture size unless explicitly requested by homeowner notes/tweaks
- Everything must fit within the same physical dimensions
- All improvements must be realistic and buildable

---

🔥 REQUIRED TRANSFORMATION

You MUST clearly upgrade the bathroom while keeping it simple and refined.

You MUST:
- Replace pedestal sink with a clean, modern vanity (same wall position; width may increase when explicitly requested)
- Use natural wood or light wood tones for the vanity
- Upgrade flooring to warm neutral tile
- Upgrade shower walls with simple, clean tile
- Upgrade lighting to soft, warm fixtures
- Remove clutter completely
- Simplify window treatments to a clean, minimal version

The transformation must be visible but not dramatic or over-designed.

---

🌾 STYLE: WARM MINIMALIST (WOOD + SOFT NEUTRALS)

Apply a warm minimalist design using:

- soft neutral tones (beige, cream, warm white)
- natural wood vanity or wood accents
- simple, clean surfaces (no heavy patterns)
- matte or soft finishes (not glossy luxury)
- warm, soft lighting
- minimal decor (1–2 elements max, like a plant or towel)

The space should feel:
- calm
- warm
- modern
- uncluttered
- intentionally simple

Avoid:
- high contrast or dark dramatic styles
- heavy marble or luxury finishes
- excessive decor
- overly bright or clinical lighting

---

🎯 FINAL GOAL

The final image must:
- look like the SAME bathroom
- maintain exact geometry and proportions
- feel warm, minimal, and modern
- be realistic and buildable
- show a clean, refined upgrade without overdesign

This is a remodel, NOT a redesign.`;

/** When /try passes the warm-minimalist base plus extra notes, avoid duplicating the long block in the Vertex payload. */
export function additionalPromptAfterWarmMinimalistBase(fullAdditionalPrompt: string): string {
  const base = WARM_MINIMALIST_MOCKUP_USER_PROMPT;
  const t = fullAdditionalPrompt.trimStart();
  if (t.startsWith(base)) {
    return t.slice(base.length).replace(/^[\s\n]+/, "").trim();
  }
  return fullAdditionalPrompt.trim();
}

/**
 * Vertex / Gemini image edit: keep the warm-minimalist brief dominant. The generic `buildImageEditPrompt` stack is long and
 * can truncate or bury the style instructions after `truncateMockupTextPromptWithLayoutReinforcement`.
 */
export function buildVertexWarmMinimalistTryImageEditPrompt(opts: {
  scopeDescription: string;
  roomAnalysis: string;
  additionalPrompt: string;
  quoteLineContext: string;
  /** OpenAI “remodel edit” paragraph(s) — secondary context only. */
  remodelEditFromVision: string;
  wetZoneRemodelIntent?: boolean;
}): string {
  const tail = additionalPromptAfterWarmMinimalistBase(opts.additionalPrompt);
  const blocks: string[] = [];
  if (opts.wetZoneRemodelIntent) {
    blocks.push(buildWetZoneVertexOverrideBanner());
  }
  blocks.push(WARM_MINIMALIST_MOCKUP_USER_PROMPT);
  const scope = opts.scopeDescription.trim();
  if (scope) {
    blocks.push(
      `Contractor scope (context only — geometry still locked to the photo):\n${scope.slice(0, 3000)}`,
    );
  }
  const room = opts.roomAnalysis.trim();
  if (room) {
    blocks.push(`Room analysis (context only):\n${room.slice(0, 2500)}`);
  }
  const quote = opts.quoteLineContext.trim();
  if (quote) {
    blocks.push(`Quote line finishes (where they match visible elements):\n${quote.slice(0, 5000)}`);
  }
  const visionRemodel = opts.remodelEditFromVision.trim();
  if (visionRemodel) {
    blocks.push(
      opts.wetZoneRemodelIntent
        ? `OpenAI remodel notes (wet-zone changes allowed — homeowner + notes win for tub/shower):\n${visionRemodel.slice(0, 2000)}`
        : `OpenAI remodel notes (context only — do not override geometry locks above):\n${visionRemodel.slice(0, 2000)}`,
    );
  }
  if (tail) {
    blocks.push(
      opts.wetZoneRemodelIntent
        ? `This run (homeowner — apply tub/shower changes exactly as written):\n${tail.slice(0, 12000)}`
        : `This run (homeowner notes, UI tweaks, or rescue text):\n${tail.slice(0, 12000)}`,
    );
  }
  return blocks.join("\n\n");
}
