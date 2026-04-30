/**
 * One GPT-4o vision call that analyzes the **same** pixels sent to OpenAI image edit and outputs
 * a single strict luxury remodel prompt (used only when Luxury Escape + OpenAI mockup provider).
 */

const LUXURY_OPENAI_PROMPT_BUILDER_SYSTEM = `You are building a bathroom image transformation system.

Your task is to take an input bathroom image and generate ONE prompt for a luxury remodel that changes ONLY finishes and styling — NEVER floor plan, camera, or fixture positions.

Step 1: Analyze the image and extract structure

* Identify positions of:

  * vanity (single or double)
  * mirror (size and placement)
  * toilet
  * shower or bathtub
* Describe layout in simple terms (e.g., "double vanity along left wall, large mirror above, shower at back")
* Note what appears only in mirror reflections vs direct view — do not treat reflections as extra fixtures.
* Build an internal **fixture anchor map** before writing the final prompt:
  * For each major fixture (vanity, mirror, toilet, shower/tub), mark whether it is direct-view, mirror-only, partial/cut-off, or ambiguous.
  * If a fixture is partially hidden or cut by the camera edge, infer its same-location continuation from wall intersections, floor lines, plumbing cues, and reflection correspondence.
  * If confidence is low, preserve the existing geometry and visibility footprint from the source (never delete or relocate ambiguous fixtures).

Step 2: Identify risk areas

* Detect if:

  * mirror is large (risk of expansion/duplication)
  * double sinks exist
  * shower glass is visible
  * tight space (risk of widening)
  * risk of **push-in / tighter crop / telephoto look** — model might fake a closer vantage; forbid it

Step 3: Generate a STRICT transformation prompt

The downstream image model must (**shot-for-shot vs the source photo**):

* Preserve exact layout, spacing, camera angle, **and frame edges** — same content at left/right/top/bottom of the frame (same slice of walls, door jambs, ceiling line, floor visible)
* Same **horizontal and vertical field of view** — no closer framing, no “hero” crop, no stepping toward fixtures
* Honor the Step-1 fixture anchor map for direct-view, mirror-only, and partial/cut-off fixtures
* NOT move, duplicate, or remove any fixtures
* NOT change room dimensions or perceived room size
* NOT crop, zoom in, zoom out, reframe, widen, or change aspect ratio vs the source image

Add explicit constraints:

* Vanity: same size and wall position — upgrade cabinet faces, countertop, faucet style only
* Mirror: same outer dimensions and placement — frame/backlight allowed; do not extend glass area
* Shower/tub: same footprint and opening width — do not expand glass or curb line
* Toilet: same location and visibility in frame

Step 4: Apply luxury style (finishes only — must read as a **full remodel**, not a filter)

Luxury style must include **visible** upgrades on every major zone that appears in frame (vanity top, cabinet fronts, fixtures/metal, shower/tub surfaces, floor if visible, mirror edge treatment):

* marble-look or quartz countertop with clear veining or consistent premium stone character
* upgraded vanity finish (paint/stain/laminate reading high-end)
* coordinated metal (e.g. brushed gold or warm nickel) on faucets, handles, shower hardware where visible
* modern mirror treatment (framed or backlit, **same mirror glass outline**)
* shower glass/tile/wall finish upgraded within the **same** enclosure outline
* soft, dimensional lighting: realistic highlights on stone and metal, ambient fill — should feel like a styled luxury bath photo, not the same snapshot with a slight tint

The downstream image must be **obviously** different from the source in materials and lighting while geometry stays locked.

Step 5: Output ONLY the final prompt (no explanation)

The final prompt MUST be structured exactly as follows:

1) Start with a section header line: GEOMETRY LOCK (NON-NEGOTIABLE)
2) Under it, write at least 8 short imperative lines that explicitly forbid widening the room, moving fixtures, changing shower opening width, extending mirrors, duplicating fixtures seen in reflections, changing camera angle, **zoom / push-in / tighter crop / telephoto focal length**, **different aspect ratio**, or cropping the frame differently than the source.
3) Then a blank line and header: LUXURY FINISH DIRECTION
4) Under it, bullet the luxury material and lighting upgrades only — nothing that implies demolition, relocation, or larger footprints. Include at least 3 bullets that name **concrete visual outcomes** (e.g. “white quartz with grey veining”, “warm LED vanity glow”, “frameless glass reads clearer / less dated”) tied to what you see in the photo.
5) End LUXURY FINISH DIRECTION with one imperative line: the output must be **unmistakably** a luxury finish pass versus the input (bold material and lighting change), not a mild color grade — still without moving fixtures or changing room size.

The final prompt must be ready for an image-edit model — no preamble, no meta-commentary.`;

/** Inserted after GPT-generated strict prompt; backs up layout if downstream context is verbose. */
export const LUXURY_OPENAI_APPENDED_GEOMETRY_LOCK = `FIXED LAYOUT CONTRACT (HONOR WITH THE GENERATED PROMPT ABOVE):
- **Shot-for-shot framing:** match the source photo’s crop rectangle — same horizontal and vertical field of view; no push-in, no stepping closer, no tighter telephoto look.
- Same apparent **lens / distance**: output must not look like a longer focal length than the input (no enlarged fixtures from “moving nearer”).
- Preserve what appears at the **four edges** of the frame (walls, door/architraves, ceiling line, floor band) — same as the input.
- Same camera position, height, and field of view as the input — do not zoom, uncrop, reframe, or change aspect ratio.
- Same apparent room width, depth, and ceiling; do not make the space feel larger, more open, or deeper.
- Same number and type of plumbing fixtures; same wall for vanity; same toilet zone; same wet-area footprint.
- Shower/tub: same curb line, same glass/panel width and height — do not extend glass, widen the opening, or add panels beyond the source outline.
- Mirror: same glass area and wall position (frame, backlight, or finish on the same rectangle only).
- Reflections: do not duplicate or relocate fixtures that appear only in mirrors; anchor to real walls and floor.`;

/** Forces full-scene anchoring before any styling; protects mirror/partial/cropped fixtures. */
export const LUXURY_OPENAI_SPATIAL_ANCHOR_PROTOCOL = `SPATIAL ANCHOR PROTOCOL (RUN BEFORE STYLING):
- Build one coherent room map from all evidence: direct view pixels first, then mirror correspondences, then partial edge/crop cues.
- Treat fixtures that are partially hidden, off-edge, or mirror-dominant as still present in their original footprint.
- Do not "clean up" ambiguity by removing, shrinking, or relocating uncertain fixtures; uncertainty means preserve source geometry.
- Mirror-only clues are spatial evidence for existing fixtures, not permission to add duplicates.
- Keep shower/tub enclosure, curb, glass span, vanity run, and toilet zone anchored to source intersections and wall planes.
- If evidence conflicts, keep the source shot composition and footprint exactly as-is and only restyle surfaces.`;

/** Rich finish pass — inserted after geometry lock so the image model does not under-render luxury. */
export const LUXURY_OPENAI_FINISH_COMPOSITION_MANDATE = `LUXURY FINISH + COMPOSITION (SAME GEOMETRY — GO DEEP ON MATERIALS):
Produce a **cohesive** luxury look **inside the exact same frame and crop** as the input — do not recompose, reframe, or “clean up” the shot. Every visible surface the style touches must read as clearly upgraded (counter, cabinetry, wall tile/paint where shown, shower/tub surround, floor if visible, mirror surround, fixture metals).
Lighting must feel **designed** within that fixed view: dimensional highlights on stone and metal, soft ambient fill, realistic shadows — not the source with a flat filter.
Timid output (barely different from the input, or only global color shift) is invalid. If unsure about **layout or framing**, match the input photo; if unsure about **finishes**, apply the luxury direction boldly while keeping footprints, camera, and **edge-to-edge framing** locked.`;

/** Appended as the last text in the OpenAI image-edit prompt (recency) for luxury + OpenAI. */
export const LUXURY_OPENAI_TRAILING_GEOMETRY_ENFORCEMENT = `LAYOUT — FINAL (LOCK ONLY THIS):
**Framing / shot:** identical crop and viewing distance as the input — no zoom-in, no tighter crop, no telephoto feel, no aspect change; edges of the picture must match the source.
Fixture positions, room footprint, door/window placement, mirror glass outline, shower/tub enclosure outline, and camera/framing must match the input image.

FINISH — FINAL (BE BOLD HERE):
You **must** deliver obvious luxury material and lighting transformation — stone/quartz character, cabinet finish, metal tones, tile/glass/wall reads, and mirror treatment must be clearly renewed. Do not choose minimal edits to “play it safe”; playing safe on finishes is a failure for this task.`;

/** Pinned before layout reinforcement when the API truncates long prompts (middle omitted). */
export function buildLuxuryOpenAiPreReinforcementBlock(strictPrompt: string): string {
  const cap = strictPrompt.trim().slice(0, 4500);
  return [
    "VISION-BUILT LUXURY PROMPT (REPEAT — LONG PROMPTS MAY HAVE OMITTED THIS FROM THE MIDDLE):",
    cap,
    LUXURY_OPENAI_SPATIAL_ANCHOR_PROTOCOL,
    LUXURY_OPENAI_APPENDED_GEOMETRY_LOCK,
    "Finish depth: luxury means unmistakable surface + lighting upgrade across visible zones — not a mild filter.",
  ].join("\n\n");
}

function stripOuterCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\s*\r?\n?/, "");
    const close = t.lastIndexOf("```");
    if (close >= 0) t = t.slice(0, close);
  }
  return t.trim();
}

export async function generateLuxuryOpenAiStrictImagePrompt(params: {
  apiKey: string;
  /** Same bathroom image the image-edit API will receive (data URL). */
  sourceImageDataUrl: string;
}): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 2200,
      temperature: 0.18,
      messages: [
        { role: "system", content: LUXURY_OPENAI_PROMPT_BUILDER_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Attached is the bathroom image. Follow Steps 1–4 internally, then output ONLY the final image-edit prompt from Step 5 with the two required headers (GEOMETRY LOCK and LUXURY FINISH DIRECTION). Do not skip the geometry section — it is the highest priority for layout preservation. GEOMETRY LOCK must forbid zoom/push-in/tighter crop and demand **shot-for-shot** framing vs this photo. The LUXURY FINISH DIRECTION section must push a **strong, visible** material and lighting upgrade (full-room coherence); weak or filter-only language is not acceptable. Bullet concrete finishes and lighting that will read clearly in the final image.',
            },
            {
              type: "image_url",
              image_url: { url: params.sourceImageDataUrl, detail: "high" },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Luxury OpenAI prompt builder failed: ${res.status} ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  const out = stripOuterCodeFences(raw).slice(0, 12_000);
  if (!out) {
    throw new Error("Luxury OpenAI prompt builder returned empty content.");
  }
  return out;
}
