/**
 * Primary creative brief for /try **Clean Refresh** mockups (Vertex: Gemini image edit — same packaging as other styles).
 * Drives `buildGenerationPrompt` and the Vertex-only image prompt so the long brief is not buried by generic stacks.
 */
export const CLEAN_REFRESH_MOCKUP_USER_PROMPT = `You are editing a real bathroom photo.

Your goal is to create a realistic, buildable, CLEAN MODERN remodel — NOT redesign the space.

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
→ it must remain partially hidden in the SAME way

---

🚿 SHOWER + SPACING LOCK

- The shower opening width must match the original EXACTLY
- Glass panels must NOT extend beyond the original footprint
- Do NOT widen or optimize the shower

Maintain exact spacing between all objects.

---

📏 REALISM RULES

- Do NOT enlarge or upscale fixtures
- Everything must fit within the same physical dimensions
- All improvements must be realistic and affordable

---

🔥 REQUIRED TRANSFORMATION

You MUST upgrade the bathroom clearly, but keep it realistic and cost-conscious.

You MUST:
- Replace pedestal sink with a simple modern vanity (same position and width)
- Upgrade flooring to clean, affordable tile
- Upgrade shower walls to simple, modern tile
- Upgrade lighting to clean, modern fixtures
- Remove clutter completely
- Simplify window treatments (clean, minimal)

Avoid dramatic or expensive upgrades.

---

🧼 STYLE: CLEAN MODERN (SIMPLE + RELATABLE)

Apply a clean, modern design using:

- white, light gray, or soft neutral tones
- simple, practical materials
- clean tile (subway tile or large format)
- basic modern vanity (not luxury)
- chrome or simple black fixtures
- bright, even lighting

The space should feel:
- clean
- fresh
- simple
- achievable

Avoid:
- luxury marble finishes
- dramatic contrast
- heavy decor
- spa-like warmth

---

🎯 FINAL GOAL

The final image must:
- look like the SAME bathroom
- maintain exact geometry and proportions
- feel like a clean, realistic upgrade
- be clearly improved but affordable
- be something a typical homeowner could actually do

This is a remodel, NOT a redesign.`;

/** When /try passes the clean-refresh base plus extra notes, avoid duplicating the long block in the Vertex payload. */
export function additionalPromptAfterCleanRefreshBase(fullAdditionalPrompt: string): string {
  const base = CLEAN_REFRESH_MOCKUP_USER_PROMPT;
  const t = fullAdditionalPrompt.trimStart();
  if (t.startsWith(base)) {
    return t.slice(base.length).replace(/^[\s\n]+/, "").trim();
  }
  return fullAdditionalPrompt.trim();
}

/**
 * Vertex / Gemini image edit: keep the clean-refresh brief dominant. The generic `buildImageEditPrompt` stack is long and
 * can truncate or bury the style instructions after `truncateMockupTextPromptWithLayoutReinforcement`.
 */
export function buildVertexCleanRefreshTryImageEditPrompt(opts: {
  scopeDescription: string;
  roomAnalysis: string;
  additionalPrompt: string;
  quoteLineContext: string;
  /** OpenAI “remodel edit” paragraph(s) — secondary context only. */
  remodelEditFromVision: string;
}): string {
  const tail = additionalPromptAfterCleanRefreshBase(opts.additionalPrompt);
  const blocks: string[] = [CLEAN_REFRESH_MOCKUP_USER_PROMPT];
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
      `OpenAI remodel notes (context only — do not override geometry locks above):\n${visionRemodel.slice(0, 2000)}`,
    );
  }
  if (tail) {
    blocks.push(`This run (homeowner notes, UI tweaks, or rescue text):\n${tail.slice(0, 8000)}`);
  }
  return blocks.join("\n\n");
}
