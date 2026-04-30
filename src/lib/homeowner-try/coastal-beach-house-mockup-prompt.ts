import { buildWetZoneVertexOverrideBanner } from "@/lib/homeowner-try/wet-zone-intent";

/** Primary remodel brief for Coastal Beach House — geometry + coastal finishes (Vertex image edit). */
export const COASTAL_BEACH_HOUSE_MOCKUP_USER_PROMPT = `You are editing a real bathroom photo.

Your goal is to create a realistic, buildable, COASTAL BEACH HOUSE remodel — NOT redesign the space.

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
- Do NOT widen, expand, or optimize the shower

Maintain exact spacing between all elements.

---

📏 REALISM RULES

- Do NOT enlarge or upscale fixtures
- Everything must fit within the same physical dimensions
- All improvements must be realistic and buildable

---

🔥 REQUIRED TRANSFORMATION

You MUST clearly upgrade the bathroom while preserving structure.

You MUST:
- Replace pedestal sink with a clean coastal-style vanity (same position and width)
- Upgrade flooring to light, beach-inspired tile
- Upgrade shower walls with clean, bright tile
- Upgrade lighting to soft, natural-feeling fixtures
- Remove clutter completely
- Simplify or replace window treatments with a light, airy version

The transformation must be clearly visible.

---

🌊 STYLE: COASTAL BEACH HOUSE (BRIGHT + AIRY)

Apply a coastal design using:

- light, airy colors (white, soft blue, sand, light gray)
- natural textures (light wood, woven elements, linen)
- bright, fresh lighting (natural feel)
- clean white or soft blue tile
- light wood or white vanity

Optional subtle decor:
- small plant
- woven basket
- simple coastal accents

The space should feel:
- fresh
- airy
- relaxing
- like a beach house

Avoid:
- dark heavy tones
- high contrast dramatic styles
- overly luxurious marble everywhere
- clutter

---

🎯 FINAL GOAL

The final image must:
- look like the SAME bathroom
- maintain exact geometry and proportions
- feel like a bright, coastal transformation
- be realistic and buildable
- show a noticeable but believable upgrade

This is a remodel, NOT a redesign.`;

/** When /try passes the coastal base plus extra notes, avoid duplicating the long block in the Vertex payload. */
export function additionalPromptAfterCoastalBeachHouseBase(fullAdditionalPrompt: string): string {
  const base = COASTAL_BEACH_HOUSE_MOCKUP_USER_PROMPT;
  const t = fullAdditionalPrompt.trimStart();
  if (t.startsWith(base)) {
    return t.slice(base.length).replace(/^[\s\n]+/, "").trim();
  }
  return fullAdditionalPrompt.trim();
}

export function buildVertexCoastalBeachHouseTryImageEditPrompt(opts: {
  scopeDescription: string;
  roomAnalysis: string;
  additionalPrompt: string;
  quoteLineContext: string;
  remodelEditFromVision: string;
  wetZoneRemodelIntent?: boolean;
}): string {
  const tail = additionalPromptAfterCoastalBeachHouseBase(opts.additionalPrompt);
  const blocks: string[] = [];
  if (opts.wetZoneRemodelIntent) {
    blocks.push(buildWetZoneVertexOverrideBanner());
  }
  blocks.push(COASTAL_BEACH_HOUSE_MOCKUP_USER_PROMPT);
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
