/**
 * Primary creative brief for /try **Luxury Escape** mockups (Vertex: Gemini image edit — same packaging as Spa / Bold Modern).
 */
export const LUXURY_ESCAPE_MOCKUP_USER_PROMPT = `You are editing a real bathroom photo.

Your goal is to create a realistic, buildable, HIGH-END LUXURY remodel — NOT redesign the space.

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
- widen or expand the space

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

🚿 SHOWER RULE (CRITICAL)

- The shower opening width must match the original EXACTLY
- Do NOT widen the shower
- Do NOT extend glass panels beyond the original footprint
- Keep all shower edges aligned with the original structure

---

📏 REALISM RULES

- Do NOT enlarge or upscale fixtures
- Everything must fit within the same physical dimensions
- All improvements must be realistic and buildable

---

🔥 REQUIRED TRANSFORMATION (FORCE THIS)

You MUST significantly upgrade the bathroom.

Do NOT make subtle changes.

You MUST:
- Replace any pedestal sink with a modern vanity (same location and width)
- Upgrade countertops to marble or quartz
- Replace flooring with polished tile or marble-look tile
- Upgrade shower walls to marble or high-end tile
- Upgrade lighting to modern, premium fixtures
- Remove clutter and outdated elements completely
- Replace or simplify window treatments with a clean, modern version

You MUST remove:
- outdated colors (green, dull tones)
- low-end finishes
- clutter or worn items

The transformation must be clearly visible and dramatic.

---

💎 STYLE: HIGH-END LUXURY (HOTEL STYLE — STRONG)

Apply a luxury design with:

- bright white / soft neutral color palette
- marble or quartz surfaces (very visible)
- polished, reflective finishes
- clean, modern vanity cabinetry
- gold, brass, or high-end hardware
- crisp, high-end lighting (not soft spa lighting)
- minimal, elegant decor (hotel-like)

Avoid:
- wood-heavy or rustic styles
- cozy/spa styling
- overly warm tones
- clutter

This should feel like a high-end hotel bathroom.

---

🎯 FINAL GOAL

The final image must:
- look like the SAME bathroom
- be clearly upgraded and more premium
- show a noticeable transformation at a glance
- be realistic and buildable

This is a remodel, NOT a redesign.`;

export function additionalPromptAfterLuxuryEscapeBase(fullAdditionalPrompt: string): string {
  const base = LUXURY_ESCAPE_MOCKUP_USER_PROMPT;
  const t = fullAdditionalPrompt.trimStart();
  if (t.startsWith(base)) {
    return t.slice(base.length).replace(/^[\s\n]+/, "").trim();
  }
  return fullAdditionalPrompt.trim();
}

export function buildVertexLuxuryEscapeTryImageEditPrompt(opts: {
  scopeDescription: string;
  roomAnalysis: string;
  additionalPrompt: string;
  quoteLineContext: string;
  remodelEditFromVision: string;
}): string {
  const tail = additionalPromptAfterLuxuryEscapeBase(opts.additionalPrompt);
  const blocks: string[] = [LUXURY_ESCAPE_MOCKUP_USER_PROMPT];
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
