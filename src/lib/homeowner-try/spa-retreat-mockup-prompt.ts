/**
 * Primary creative brief for /try **Spa Retreat** mockups (Vertex: Gemini 3.1 Flash Image / “Nano Banana 2”).
 * Kept in one module so the same text drives `buildGenerationPrompt` and the Vertex-only image prompt.
 */
import { buildWetZoneVertexOverrideBanner } from "@/lib/homeowner-try/wet-zone-intent";

export const SPA_RETREAT_MOCKUP_USER_PROMPT = `You are editing a real bathroom photo.

Your goal is to create a realistic, buildable, SPA-STYLE remodel — NOT redesign the space.

---

PRESERVE STRUCTURE (NON-NEGOTIABLE)

Keep the EXACT:
- layout and floor plan
- wall positions and room size
- camera angle and perspective
- spacing between all objects

Do NOT:
- move walls, windows, or doors
- change the size of the room

---

GEOMETRY LOCK (CRITICAL — HIGHEST PRIORITY)

You must preserve the EXACT geometry of the original image.

- Do NOT widen the room
- Do NOT increase spacing between objects
- Do NOT make the room feel larger or more open
- Do NOT change distances between walls, fixtures, or edges

All objects must remain in the exact same positions, scale, and proportions.

If unsure, make NO geometric changes.

This rule overrides ALL styling instructions.

---

FIXTURE RULES

The bathroom contains:
- one toilet
- one sink
- one shower

You MUST:
- keep all fixtures in the SAME position
- NOT duplicate or remove fixtures
- NOT move plumbing locations

If any fixture is partially hidden:
-> it must remain partially hidden in the SAME way

---

SHOWER + SPACING LOCK

- The shower opening width must match the original EXACTLY
- Glass panels must NOT extend beyond the original footprint
- Do NOT widen, expand, or optimize the shower

Maintain exact spacing between:
- vanity and wall
- toilet and wall
- shower and walkway

No element may be moved, widened, or resized.

---

REALISM RULES

- Do NOT enlarge or upscale fixtures
- Everything must fit within the same physical dimensions
- All improvements must be realistic and buildable

---

REQUIRED TRANSFORMATION

You MUST upgrade the bathroom noticeably while keeping structure unchanged.

You MUST:
- Replace pedestal sink with a modern vanity (same position and width)
- Upgrade flooring to warm neutral tile
- Upgrade shower walls with clean, calming tile
- Upgrade lighting to soft, warm fixtures
- Remove clutter completely
- Simplify or replace window treatments with a minimal spa-like version

Do NOT make subtle changes — the upgrade should be clearly visible.

---

STYLE: SPA RETREAT (CALM + NATURAL)

Apply a spa-inspired design using:

- warm beige, cream, and soft neutral tones
- natural wood vanity or accents
- soft, warm lighting (not bright white)
- calming textures (stone, tile, linen)
- minimal decor such as:
  - small plant
  - candle
  - neatly folded towels

The space should feel:
- relaxing
- warm
- clean
- peaceful

Avoid:
- dark dramatic contrast
- glossy luxury finishes
- clutter
- overly modern/high-contrast looks

---

FINAL GOAL

The final image must:
- look like the SAME bathroom
- maintain exact geometry and proportions
- feel like a calm spa upgrade
- be realistic and buildable
- show a clear but believable transformation

This is a remodel, NOT a redesign.`;

/** When /try passes the spa base plus extra notes, avoid duplicating the long spa block in the Vertex payload. */
export function additionalPromptAfterSpaRetreatBase(fullAdditionalPrompt: string): string {
  const base = SPA_RETREAT_MOCKUP_USER_PROMPT;
  const t = fullAdditionalPrompt.trimStart();
  if (t.startsWith(base)) {
    return t.slice(base.length).replace(/^[\s\n]+/, "").trim();
  }
  return fullAdditionalPrompt.trim();
}

/**
 * Vertex / Nano Banana 2: keep the spa brief dominant. The generic `buildImageEditPrompt` stack is long and
 * can truncate or bury the spa instructions after `truncateMockupTextPromptWithLayoutReinforcement`.
 */
export function buildVertexSpaRetreatTryImageEditPrompt(opts: {
  scopeDescription: string;
  roomAnalysis: string;
  additionalPrompt: string;
  quoteLineContext: string;
  /** OpenAI “remodel edit” paragraph(s) — secondary context only. */
  remodelEditFromVision: string;
  /** When true, prepend override so style “shower width locked” does not block tub→shower. */
  wetZoneRemodelIntent?: boolean;
}): string {
  const tail = additionalPromptAfterSpaRetreatBase(opts.additionalPrompt);
  const blocks: string[] = [];
  if (opts.wetZoneRemodelIntent) {
    blocks.push(buildWetZoneVertexOverrideBanner());
  }
  blocks.push(SPA_RETREAT_MOCKUP_USER_PROMPT);
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
