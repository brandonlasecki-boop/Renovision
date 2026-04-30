/**
 * Primary creative brief for /try **Bold Modern** mockups (Vertex: Gemini image edit — same packaging as Spa Retreat).
 * Drives `buildGenerationPrompt` and the Vertex-only image prompt so the long brief is not buried by generic stacks.
 */
import { buildWetZoneVertexOverrideBanner } from "@/lib/homeowner-try/wet-zone-intent";

export const BOLD_MODERN_MOCKUP_USER_PROMPT = `You are editing a real bathroom photo.

Your goal is to create a realistic, buildable, HIGH-CONTRAST MODERN remodel — NOT redesign the space.

---

🔒 PRESERVE STRUCTURE (NON-NEGOTIABLE)

Keep the EXACT:
- layout and floor plan
- wall positions and room size
- camera angle and perspective
- spacing between all objects
- camera distance / field-of-view (no zoom-in)

Do NOT:
- move walls, windows, or doors
- change the size of the room
- widen or expand the space
- zoom in, crop tighter, or narrow the visible depth of the room

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

🚿 SHOWER RULE (CRITICAL)

- The shower opening width must match the original EXACTLY
- Do NOT widen the shower
- Do NOT extend glass panels beyond the original footprint
- Keep all shower edges aligned with the original structure

---

📏 REALISM RULES

- Keep fixtures in the same locations and plumbing zones
- Fixture size changes are allowed only when explicitly requested (for example: larger vanity or mirror), and must stay realistic for the same room
- If a fixture is partially cut off in the source, keep it partially cut off rather than zooming out to show the full fixture
- All improvements must be realistic and buildable

---

🔥 REQUIRED TRANSFORMATION (FORCE THIS)

You MUST significantly upgrade the bathroom.

Do NOT make subtle changes.

You MUST:
- Replace pedestal sink with a modern vanity (same wall position; width may increase when explicitly requested)
- Upgrade flooring to modern tile
- Upgrade shower walls to sleek modern tile or stone
- Upgrade lighting to modern fixtures
- Remove clutter completely
- Replace window treatments with a minimal, modern version

The transformation must be bold and clearly visible.

---

🔴 STYLE: BOLD MODERN (HIGH CONTRAST — VIRAL)

Apply a bold, high-contrast modern design using:

- dark or charcoal walls OR strong contrast accents
- matte black fixtures and hardware
- sharp, clean lines
- modern, minimal vanity design
- high contrast between light and dark surfaces
- sleek, contemporary lighting
- clear, balanced exposure so all major surfaces remain easy to see

Optional:
- subtle wood accents for contrast
- geometric or large-format tile

Avoid:
- soft spa tones
- overly warm beige palettes
- traditional or ornate styles
- moody underexposure that makes the room hard to read

This should feel dramatic, modern, and visually striking.

---

🎯 FINAL GOAL

The final image must:
- look like the SAME bathroom
- be dramatically upgraded
- feel bold and modern at a glance
- be realistic and buildable
- preserve the same room depth cues and framing breadth as the source photo

This is a remodel, NOT a redesign.`;

/** When /try passes the bold-modern base plus extra notes, avoid duplicating the long block in the Vertex payload. */
export function additionalPromptAfterBoldModernBase(fullAdditionalPrompt: string): string {
  const base = BOLD_MODERN_MOCKUP_USER_PROMPT;
  const t = fullAdditionalPrompt.trimStart();
  if (t.startsWith(base)) {
    return t.slice(base.length).replace(/^[\s\n]+/, "").trim();
  }
  return fullAdditionalPrompt.trim();
}

/**
 * Vertex: keep the bold-modern brief dominant (same pattern as Spa Retreat).
 */
export function buildVertexBoldModernTryImageEditPrompt(opts: {
  scopeDescription: string;
  roomAnalysis: string;
  additionalPrompt: string;
  quoteLineContext: string;
  /** OpenAI “remodel edit” paragraph(s) — secondary context only. */
  remodelEditFromVision: string;
  wetZoneRemodelIntent?: boolean;
}): string {
  const tail = additionalPromptAfterBoldModernBase(opts.additionalPrompt);
  const blocks: string[] = [];
  if (opts.wetZoneRemodelIntent) {
    blocks.push(buildWetZoneVertexOverrideBanner());
  }
  blocks.push(BOLD_MODERN_MOCKUP_USER_PROMPT);
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
