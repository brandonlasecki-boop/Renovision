import {
  truncateMockupTextPromptWithLayoutReinforcement,
  type TruncateMockupLayoutOpts,
} from "@/lib/ai/mockup-prompt-truncate";
import { normalizeMaterialTrade } from "@/lib/bid-scope";
import {
  enumerateMockupProductRefSlots,
  lineDescribesNewVanityCabinetAssembly,
  lineHasMockupVisualReference,
  lineShouldAutoEnableMockupInclude,
  mockupFixtureZoneHint,
  quoteHasNewVanityCabinetAssembly,
} from "@/lib/bid-mockup";
import { retailImageUrlForLightbox } from "@/lib/integrations/retail-product-image-lightbox";
import type { BidMaterialLine } from "@/types/bid";

const CHAT_MODEL = "gpt-4o";
/** Image edit (reference photo → remodeled). Falls back to DALL·E if unset / edit fails. */
/** OpenAI image edits; override with OPENAI_IMAGE_EDIT_MODEL. Other endpoints differ (e.g. some third-party APIs). */
const DEFAULT_IMAGE_EDIT_MODEL = "gpt-image-1";

type VisionContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

export type MaterialsAndVisionResult = {
  materials: BidMaterialLine[];
  summary: string;
  roomAnalysis: string;
  remodelEditPrompt: string;
};

/** Human-readable quote lines for prompts (notes + whether a reference image exists). */
export function formatQuoteLinesForPrompt(lines: BidMaterialLine[]): string {
  return lines
    .filter((l) => l.name.trim().length > 0)
    .map((l) => {
      const notes = l.notes?.trim() ? ` — Notes: ${l.notes.trim()}` : "";
      const ref = l.reference_storage_path
        ? " — (your reference photo attached)"
        : l.hd_image_url || l.lw_image_url
          ? " — (retail listing image available)"
          : "";
      const trade = l.trade && l.trade !== "general" ? ` [${l.trade}]` : "";
      return `- ${l.name.trim()}${trade}${notes}${ref}`;
    })
    .join("\n");
}

const MAX_MOCKUP_ESTIMATE_CONTEXT_LINES = 55;

/**
 * Every priced line for the mockup image model — tags which rows drive labeled product/contractor
 * images vs context-only (labor, other rooms, no ref).
 */
export function formatFullQuoteLinesForMockupEstimateContext(lines: BidMaterialLine[]): string {
  const named = lines.filter((l) => l.name.trim().length > 0);
  if (!named.length) return "";
  const slice = named.slice(0, MAX_MOCKUP_ESTIMATE_CONTEXT_LINES);
  const overflow = named.length - slice.length;
  const body = slice
    .map((l) => {
      const notes = l.notes?.trim() ? ` — Notes: ${l.notes.trim()}` : "";
      const trade = l.trade && l.trade !== "general" ? ` [${l.trade}]` : "";
      const visual = lineHasMockupVisualReference(l);
      const mockOn = l.mockup_include !== false;
      const tag = mockOn && visual
        ? " — [mockup: ON + product/contractor ref may be attached after room photo — apply only to matching fixture/ZONE]"
        : mockOn && !visual
          ? " — [mockup: ON but no product/contractor image on line — text/notes only; do not invent that object]"
          : " — [mockup: OFF — estimate context only; do not add to this image from this line]";
      return `- ${l.name.trim()}${trade}${notes}${tag}`;
    })
    .join("\n");
  return overflow > 0
    ? `${body}\n… and ${overflow} more line(s) omitted here — still treat the job as whole-scope; do not invent unstated work in this room.`
    : body;
}

/**
 * First-read rules: inventory geometry, then replace looks only — moves require explicit
 * customer/contractor authorization in scope or per-run notes.
 */
export const MOCKUP_ANALYZE_THEN_REPLACE_GATE = [
  "DEFAULT — DO NOT MOVE ANYTHING (full layout freeze):",
  "Unless **contractor scope** (including walkthrough transcript, guided Q&A answers, measurements, or any notes merged into the scope text below) **or** the explicit **per-run additional instructions** for this mockup **clearly** require **moving, removing, or relocating** a *named* wall, partition, toilet, tub, shower enclosure, vanity *as a location change*, doorway, or window — **leave every such element exactly where the FIRST image shows it** (same footprint, same wall anchor, same curb and glass edges).",
  "Estimate lines and mockup product images define **what** finishes and products should look like — **not** new coordinates for fixtures. Never relocate the shower, toilet, or tub to match a catalog layout the customer did not request.",
  "",
  "ORDER OF OPERATIONS (mandatory):",
  "1) **Read** the input photo: note where the shower/tub enclosure, toilet, vanity, major walls, knee walls, and openings sit in **direct view** (not mirror guesses).",
  "2) **Check authorization**: list only relocations/removals **explicitly** allowed by scope or per-run notes — if none, **all positions are frozen**.",
  "3) **Edit** by applying finishes, materials, and in-place replacements on those **same** locations only.",
  "",
].join("\n");

/** Tight gate so models do not “improve” bathroom layout from vague remodel language. */
export const MOCKUP_LAYOUT_SCOPE_GATE = [
  "FLOOR PLAN & LAYOUT (non-negotiable unless scope names a structural change):",
  "The FIRST image is the only authority for wall positions, fixture footprints, door/window openings, ceiling line, and room width. Do **not** widen the room, remove or merge walls/partitions/glass, slide tub vs vanity vs toilet, geometrically mirror or rotate the **layout**, apply a **whole-frame left–right reversal** of the photograph, or “open” the bath **unless** contractor scope **explicitly** names that layout or demolition for this space.",
  "Walkthrough voice notes, questionnaire answers, and measurements that appear inside the **contractor scope** block count as customer intent — they still must **explicitly** name a layout or demolition change before you may move or remove a fixture or wall.",
  "Do **not** infer layout from **mirror or shower-glass reflections alone** — reflections can show a shower or toilet from another angle; the **real** fixture stays where **direct-view** walls and curbs place it.",
  "Words like “refresh”, “update”, or “remodel” without explicit relocation/demolition language mean **finishes and in-place fixture looks only** — not permission to move architecture or plumbing layout.",
  "",
].join("\n");

/**
 * Prepended to every mockup image-edit prompt. Stops models from pasting catalog
 * products into corners or adding duplicate vanities.
 */
export const MOCKUP_IN_PLACE_EDIT_HEADER = [
  "IN-PLACE EDIT ONLY — NO NEW OBJECTS:",
  "The INPUT photograph already shows the room. **Do NOT add** a second vanity, duplicate cabinet, or freestanding vanity. **Do NOT** place a vanity or catalog product in a corner, empty floor, alcove, or wall that does not already show that vanity/cabinet in the INPUT IMAGE.",
  "Do NOT paste, composite, or float the reference/product image into the scene as a new object. Reference images are **style guides only**—copy their colors, wood/stain, door style, hardware, and countertop **onto** the **existing** vanity/cabinet pixels that are **already visible** in the room photo.",
  "Do NOT relocate the vanity to a different wall or position. It must stay **exactly where it already sits**; only its materials and appearance may change.",
  "",
].join("\n");

/** When the quote includes supply/install of a new vanity cabinet (double / integrated top). */
export const MOCKUP_IN_PLACE_EDIT_HEADER_VANITY_REPLACE = [
  "IN-PLACE EDIT — NEW VANITY CABINET ON QUOTE:",
  "The INPUT photograph shows the jobsite. The quote includes **supply/install of a new vanity cabinet** (may be double width and/or integrated sinks). For that line’s reference: treat it as the **full target vanity** that **replaces** the existing vanity on **the same wall**—match basin count, countertop + sink integration, cabinet door/drawer layout, finish, and hardware from the catalog; blend photorealistically (no floating cutout).",
  "**Still forbidden:** a **second** vanity elsewhere, pasting a catalog card into a corner or empty floor, or moving the vanity to a different wall.",
  "**Toilet & shower/tub never move:** Keep the toilet (if visible), tub/shower, shower curb, pan, glass enclosure, and shower walls in the **same positions and footprints** as the FIRST image. Do **not** slide them, swap ends of the room, shrink the shower, or steal alcove space to “fit” a wider vanity unless scope explicitly names that plumbing/layout change.",
  "For **other** quoted lines (tile fields, sconces, rough supplies, deck-mount faucets on an existing top, etc.), product references remain **finish guides on the existing fixture or surface** unless that line’s ZONE explicitly names a full replacement.",
  "Do NOT remove tub/shower surrounds, partition walls, or window/door openings unless contractor scope explicitly requires that demolition.",
  "",
].join("\n");

/**
 * Appended after SPATIAL LOCK in every mockup image-edit path so vanity (or any) edits
 * do not drag toilet / shower geometry.
 */
export const MOCKUP_WET_AREA_LAYOUT_FREEZE = [
  "",
  "WET-AREA & WC — ABSOLUTE LAYOUT (non-negotiable, including vanity replacement):",
  "Keep the **toilet** (if visible), **tub/shower**, shower curb, pan, glass door or fixed panel, shower opening, shower wall tile field, niches, and visible drains in the **same positions, footprints, and wall relationships** as the FIRST image unless contractor scope or a quote line **explicitly** names removing, replacing, or relocating that fixture or structure.",
  "The shower/tub is a **rigid assembly in space**: do **not** translate, pivot, or resize the whole enclosure to “fit” a tile SKU, vanity reference, or cleaner composition — only the **materials on the existing surfaces** may change unless scope names structural work.",
  "Forbidden: swapping toilet and shower sides of the room, rotating or geometrically mirroring the floor plan, whole-frame left–right reversal of the photo, moving the toilet beside the shower curb, widening the shower by borrowing from the toilet zone, deleting or shrinking the wet area to make room for a vanity, or “rebalancing” plumbing layout for aesthetics.",
  "",
].join("\n");

/** Detailed list for the image-edit step (mockup must follow these selections). */
export function formatQuoteLinesForImageEdit(lines: BidMaterialLine[]): string {
  if (!lines.length) return "";
  const slotEntries = enumerateMockupProductRefSlots(lines);
  const lineIdToRefIdx = new Map<string, number[]>();
  for (const e of slotEntries) {
    const id = e.line.line_id?.trim();
    if (id) lineIdToRefIdx.set(id, e.refIndices);
  }

  const refIndexBanner =
    slotEntries.length > 0
      ? [
          "MULTIMODAL REF MAP (each catalog/contractor JPEG after the room photo is labeled “[Mockup product ref N]…” — **N is NOT the row number below**; use this map so the correct SKU hits the correct fixture):",
          ...slotEntries.map((e) => {
            const nums = e.refIndices.map((n) => `**${n}**`).join(" then ");
            return `- Line **${e.line.name.trim()}** → JPEG ref number(s) ${nums} (order: retail shelf image first if present, then contractor photo)`;
          }),
          "",
        ].join("\n")
      : "";

  const body = lines
    .filter((l) => l.name.trim().length > 0)
    .map((l, i) => {
      const notes = l.notes?.trim() ? ` — ${l.notes.trim()}` : "";
      const zone = mockupFixtureZoneHint(l);
      const bits: string[] = [];
      if (l.reference_storage_path) {
        bits.push("contractor uploaded reference photo");
      }
      if (l.hd_image_url) {
        bits.push("Home Depot product image");
      }
      if (l.lw_image_url) {
        bits.push("Lowe's product image");
      }
      const id = l.line_id?.trim();
      const idx = id ? lineIdToRefIdx.get(id) : undefined;
      const jpegRefHint =
        idx && idx.length === 1
          ? ` [JPEG ref **${idx[0]}** only]`
          : idx && idx.length >= 2
            ? ` [JPEG refs **${idx[0]}** = retail shelf, **${idx[1]}** = contractor photo — same order as labeled images]`
            : "";
      const vanityInPlaceCabinetExtra =
        !lineDescribesNewVanityCabinetAssembly(l) &&
        (zone.includes("ONLY the existing vanity / sink cabinet") ||
          (/\bvanity\b|\bvanities\b/i.test(l.name) && !zone.includes("Faucet / trim on the existing sink")))
          ? " **Full cabinet height:** carry the same wood/stain/paint, door style, and hardware from the reference down through **every** visible drawer/door front, cabinet sides (gables), and **toe kick / base**—not only the countertop, sink bowl, or a narrow band under the faucet."
          : "";
      const ref =
        bits.length > 0
          ? lineDescribesNewVanityCabinetAssembly(l)
            ? ` [Full vanity replacement — ref(s) (${bits.join("; ")}): use the catalog as the **target vanity** (cabinet + top + sinks + hardware). Replace the **entire visible cabinet volume** in the photo on that wall (counter through toe kick, all fronts and sides shown in frame) — match sink count, integrated top, door/drawer rhythm, finish, and hardware from the ref. **Do not** move toilet, tub/shower, glass, or doors to gain width; if the SKU is wider than the photo run, favor correct styling within the existing strip over stealing floor from adjacent fixtures. Photorealistic merge — no floating cutout; no second vanity.]`
            : ` [In-place only — ref(s) for style/finish (${bits.join("; ")}): transform the EXISTING fixture in this photo where it already is—do NOT add another vanity or put one in a corner. Match the reference on **all** visible vanity/cabinet surfaces (counter, sink, **every** door and drawer front, face frame, end panels, **toe kick**) while keeping the same footprint, wall position, and door/drawer **layout** as the room photo.${vanityInPlaceCabinetExtra}]`
          : " [Apply this line item in the mockup where it matches a visible fixture/surface]";
      return `${i + 1}.${jpegRefHint} ${l.name.trim()}${notes} (${zone})${ref}`;
    })
    .join("\n");

  return refIndexBanner + body;
}

/**
 * Mockup-enabled lines that have **no** shelf or contractor product image — still drive intent by name/notes.
 */
export function formatMockupLinesTextOnlyNoProductImages(lines: BidMaterialLine[]): string {
  if (!lines.length) return "";
  const body = lines
    .map((l) => {
      const notes = l.notes?.trim() ? ` — Notes: ${l.notes.trim()}` : "";
      const trade = l.trade && l.trade !== "general" ? ` [${l.trade}]` : "";
      return `- ${l.name.trim()}${trade}${notes} — (no product JPEG on this line; follow line text + contractor scope)`;
    })
    .join("\n");
  return ["Mockup line items without product JPEGs (text only):", body].join("\n");
}

/**
 * Multimodal ref map when shelf/contractor images exist, plus text-only lines for mockup-on rows without images.
 */
export function buildMockupQuoteLineContextFromVisualAndTextLines(params: {
  visualRefLines: BidMaterialLine[];
  allMockupOnNamedLines: BidMaterialLine[];
}): string {
  const visual = formatQuoteLinesForImageEdit(params.visualRefLines).trim();
  const noImg = params.allMockupOnNamedLines.filter(
    (l) =>
      l.name.trim().length > 0 &&
      l.mockup_include !== false &&
      !lineHasMockupVisualReference(l),
  );
  const textBlock = formatMockupLinesTextOnlyNoProductImages(noImg).trim();
  return [visual, textBlock].filter(Boolean).join("\n\n");
}

/** Fallback when OpenAI chat is unavailable — no network call. */
export function buildDeterministicNoRefMockupRemodelPrompt(
  mockupEnabledNamedLines: BidMaterialLine[],
  additionalNotes?: string,
): string {
  const lines = mockupEnabledNamedLines.filter((l) => l.name.trim().length > 0);
  const list = formatQuoteLinesForPrompt(lines);
  const parts = [
    "NO product shelf or contractor JPEGs are attached — the image model sees only the room photo.",
    "Change only what contractor scope (including walkthrough, Q&A, and measurements when saved) and the line list clearly describe. Do NOT remove walls, widen openings, relocate fixtures, or add fixtures unless scope explicitly requests that work.",
    "",
    "PERMITTED VISUAL CHANGES (from mockup-enabled lines — interpret conservatively; omit if unsure):",
    list || "(no mockup-enabled line names — follow contractor scope text only)",
    "",
    "UNCHANGED unless scope explicitly names relocation or demolition:",
    "Room footprint, walls, doors, windows, fixture positions, mirrors — keep as in the source photo.",
  ];
  const add = additionalNotes?.trim();
  if (add) {
    parts.push(
      "",
      "Per-run contractor notes (may narrow or add finish detail — still no layout moves unless scope above agrees):",
      add,
    );
  }
  return parts.join("\n");
}

/**
 * GPT‑4o turns composite scope + estimate into minimal Vertex/OpenAI image-edit instructions
 * when no product reference JPEGs are attached.
 */
export async function synthesizeMockupInstructionsForVertexNoProductImages(params: {
  apiKey: string;
  scopeText: string;
  fullEstimateText: string;
  mockupLinesWithoutImagesText: string;
  additionalNotes?: string;
  beforeImageUrl?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const scope = params.scopeText.trim().slice(0, 24_000);
  const est = params.fullEstimateText.trim().slice(0, 20_000);
  const lines = params.mockupLinesWithoutImagesText.trim().slice(0, 8000);
  const add = params.additionalNotes?.trim().slice(0, 4000) ?? "";

  const instructionText = [
    "You write instructions for an image-to-image model: one jobsite room photo in, one edited photo out.",
    "There are NO separate product or shelf JPEGs — only the room photo and the text below.",
    "",
    "CONTRACTOR SCOPE (may include initial scope, voice walkthrough transcript, guided Q&A, and measurements):",
    scope || "(none)",
    "",
    "SAVED ESTIMATE (all named lines; mockup tags show intent):",
    est || "(none)",
    "",
    "MOCKUP-ENABLED LINES WITHOUT PRODUCT IMAGES (names + notes only):",
    lines || "(none — rely on scope + estimate only)",
    "",
    ...(add
      ? ["PER-RUN CONTRACTOR NOTES (this mockup run only):", add, ""]
      : []),
    "OUTPUT RULES:",
    "1) Start your reply with the exact heading line: PERMITTED VISUAL CHANGES ONLY:",
    "2) Then 3–12 short bullets — each bullet must be traceable to explicit wording in scope, Q&A, measurements, line notes, or per-run notes. If something is vague, omit it.",
    "3) Then a blank line and the heading: UNCHANGED UNLESS EXPLICITLY NAMED ABOVE:",
    "4) Then bullets stating walls, room shape, door/window openings, and fixture positions stay as in the photo unless scope clearly authorizes demolition or relocation.",
    "5) Do NOT invent wall removal, fixture moves, new openings, or new fixtures (including toilets) that scope does not clearly require.",
    "6) If contractor scope does NOT require toilet / WC work, do not use the word toilet in your output.",
    "7) End with one line: LAYOUT FREEZE: Same camera and footprint — finishes and named swaps only unless scope explicitly authorizes structural changes.",
  ].join("\n");

  const content: VisionContent[] = [{ type: "text", text: instructionText }];
  if (params.beforeImageUrl?.trim()) {
    content.push({
      type: "image_url",
      image_url: { url: retailImageUrlForLightbox(params.beforeImageUrl.trim()), detail: "high" },
    });
    content.push({
      type: "text",
      text: "Use this photo only to ground what already exists — do not invent new walls or fixture positions.",
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: params.signal,
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 1600,
      temperature: 0.15,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Mockup instruction synthesis failed: ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const out = data.choices?.[0]?.message?.content?.trim() ?? "";
  const clipped = out.slice(0, 12_000);
  if (!clipped) {
    throw new Error("Mockup instruction synthesis returned empty content.");
  }
  return clipped;
}

/** One line per mockup-enabled row for GPT compression (names + notes, capped). */
export function formatMockupLinesForCompression(lines: BidMaterialLine[], maxLines = 32): string {
  const rows = lines.filter((l) => l.name.trim().length > 0 && l.mockup_include !== false).slice(0, maxLines);
  return rows
    .map((l, i) => {
      const notes = l.notes?.trim() ? ` — ${l.notes.trim()}` : "";
      return `${i + 1}. ${l.name.trim()}${notes}`;
    })
    .join("\n");
}

/** True when the compressed brief tagged the scene as mirror-heavy (shower/tub mainly in reflection). */
export function mirrorHeavySceneFromVertexJobBrief(brief: string): boolean {
  return /\bSCENE_HINT:\s*MIRROR_HEAVY\b/i.test(brief.trim());
}

/**
 * One GPT‑4o pass: compress full composite scope + estimate into a **short** briefing for Vertex
 * (Q&A / walkthrough / measurements distilled to bullets; no wall of raw JSON).
 * When `beforeImageUrls` are provided, the model **must** read the job-site photo(s) and anchor
 * tub/shower/wet areas to **direct-view** geometry (not mirror reflections).
 */
export async function compressMockupJobContextForVertexImagePrompt(params: {
  apiKey: string;
  compositeScope: string;
  fullEstimateText: string;
  mockupLinesSummary: string;
  additionalNotes?: string;
  /** Signed before-photo URL(s) — up to two angles; enables vision + mirror/reflection analysis. */
  beforeImageUrls?: string[];
  signal?: AbortSignal;
}): Promise<string> {
  const scope = params.compositeScope.trim().slice(0, 28_000);
  const est = params.fullEstimateText.trim().slice(0, 22_000);
  const lines = params.mockupLinesSummary.trim().slice(0, 6000);
  const add = params.additionalNotes?.trim().slice(0, 4000) ?? "";
  const photoUrls = (params.beforeImageUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 2);

  const sourcesText = [
    "You compress contractor job context for a **room image edit** model (Vertex). Output must be **plain text**, under **3200 characters total**, no markdown code fences.",
    "",
    "SOURCE A — COMPOSITE SCOPE (may include initial write-up, voice walkthrough transcript, guided Q&A answers, and room measurements):",
    scope || "(empty)",
    "",
    "SOURCE B — FULL ESTIMATE LINES (tags show mockup on/off and refs):",
    est || "(empty)",
    "",
    "SOURCE C — MOCKUP-ENABLED LINE NAMES + NOTES (priority rows):",
    lines || "(none)",
    "",
    ...(add ? ["SOURCE D — PER-RUN CONTRACTOR NOTES:", add, ""] : []),
  ].join("\n");

  const outputSpec = [
    "YOUR OUTPUT — use these exact section headings in order (omit a section only if there is truly nothing to say):",
    "JOB SUMMARY:",
    "2–4 sentences: room/space, what the homeowner asked for, and what this mockup should show.",
    "",
    "Q&A / WALKTHROUGH HIGHLIGHTS:",
    "3–10 bullets: only decisions or facts that change how the room should look (materials, colors, keep/remove items, constraints). Do NOT paste raw questionnaire JSON.",
    "",
    "MEASUREMENTS & SIZING:",
    "2–8 bullets: only numbers that matter to the visual (e.g. vanity run width, ceiling height) if present in SOURCE A; otherwise write \"None stated in scope.\"",
    "",
    "PHOTO READING — DIRECT VIEW VS MIRROR/GLASS:",
    "2–8 bullets. If BEFORE photo(s) were attached above, base this on pixels; otherwise write \"No before images — rely on SOURCE A only.\" First list **direct-view** geometry (walls meeting floor, vanity run, visible curb/pan/door track, shower glass frames you see without looking “into” a mirror). Then say what appears **only** inside mirror, medicine cabinet door, or reflective shower glass.",
    "Use this **reflection checklist** when photos exist: (1) Does a large vertical pane (often above the sink) show a second copy of a doorway, window, or shower that does not line up with the real wall depth beside you? (2) Is there a thin **frame** or bevel around that pane? (3) Does tile/grout in the “shower” not meet the floor at the same plane as nearby real tile? (4) Is there **left–right reversal** vs objects clearly in direct view? (5) Does parallax differ — reflected features “slide” vs head movement? Call out which cues you used.",
    "If the wet area is mirror-only or ambiguous: write explicitly that the **physical** shower/tub enclosure, curb, drain, and tiled wet walls stay where **direct-view** tile, glass frames, and floor planes place them — **never** move or rebuild the wet area to match a reflected view.",
    "",
    "MIRROR / REFLECTION ANCHOR:",
    "2–5 bullets: concrete anchor for the image model (e.g. \"Shower appears in vanity mirror only — real enclosure stays on the back/right wall per direct-view curb and floor tile\"). Name the **likely mirror plane** (e.g. wall above vanity) vs **back/side wall** where direct-view curbs/glass attach. If no mirrors confuse layout, write: No mirror ambiguity for wet-area placement.",
    "",
    "LAYOUT / STRUCTURAL:",
    "If SOURCE A explicitly authorizes demolition, moving fixtures, or new openings, list it in 1–4 bullets. If not clearly stated, write exactly: None stated — preserve existing walls, openings, and fixture positions from the photo.",
    "",
    "ESTIMATE / MOCKUP LINE INTENT:",
    "Up to 20 short lines mapping SOURCE C (+ relevant SOURCE B) to **visual** intent only (finishes, swap this fixture, paint this surface). Skip labor-only or other-room lines.",
    "",
    "PERMITTED VISUAL CHANGES ONLY:",
    "5–10 bullets: what the image model may change as **finishes or named fixture looks** on existing geometry.",
    "",
    "UNCHANGED UNLESS EXPLICITLY NAMED ABOVE:",
    "3–6 bullets defaulting to: keep walls, door/window openings, floor plan, fixture positions, mirrors, and trim as in the photo.",
    "",
    "HARD CONSTRAINTS:",
    "One line: If SOURCE A does not require toilet/WC work, do not mention toilets. Same camera and room — no whole-frame flip.",
    "",
    "FINAL LINE (required):",
    "As the **last line** of your entire reply, print **exactly one** of:",
    "- SCENE_HINT: MIRROR_HEAVY  (use if tub/shower/wet area is mostly or only visible in a mirror/reflection, OR wet placement is ambiguous from direct-view pixels), or",
    "- SCENE_HINT: STANDARD       (use if the wet enclosure is clearly readable in direct view without relying on a mirror).",
    "**Tie-break:** If you are not sure whether the clearest shower/tub view is direct or reflected, choose **SCENE_HINT: MIRROR_HEAVY** (safer — downstream image model will not snap the wet area to a reflection).",
    "Print nothing after that final line.",
  ].join("\n");

  const content: VisionContent[] = [{ type: "text", text: sourcesText }];

  if (photoUrls.length > 0) {
    content.push({
      type: "text",
      text: [
        "",
        "ATTACHED IMAGE(S): BEFORE job-site photo(s) for this mockup. Read them **before** writing PHOTO READING and MIRROR / REFLECTION ANCHOR.",
        "Treat reflections as **virtual copies** — they are not a second bathroom layout.",
        "Bathrooms: a **large vertical mirror** over the vanity often shows the shower/tub on an **opposite** wall — that reflected shower is **not** where the physical enclosure sits. Anchor the real wet area to **curbs, pans, door tracks, and wall tile** you see **outside** the mirror plane.",
        "",
      ].join("\n"),
    });
    photoUrls.forEach((url, i) => {
      content.push({
        type: "image_url",
        image_url: { url: retailImageUrlForLightbox(url), detail: i === 0 ? "high" : "high" },
      });
    });
  }

  content.push({ type: "text", text: outputSpec });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: params.signal,
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: photoUrls.length > 0 ? 1700 : 1400,
      temperature: photoUrls.length > 0 ? 0.1 : 0.12,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Mockup job brief compression failed: ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const out = data.choices?.[0]?.message?.content?.trim() ?? "";
  const clipped = out.slice(0, 3600);
  if (!clipped) throw new Error("Mockup job brief compression returned empty content.");
  return clipped;
}

/** Short rules so quoted SKUs drive looks without implying a new floor plan. */
export function quoteDrivenProductReferenceBlock(opts?: { vanityCabinetReplacement?: boolean }): string {
  if (opts?.vanityCabinetReplacement) {
    return [
      "",
      "QUOTE-DRIVEN LOOKS:",
      "New vanity cabinet on quote: replace the vanity on that wall using its reference (basins, top, doors, finish, hardware). No second vanity; toilet/shower/glass stay fixed; ignore catalog room backdrops.",
      "Other lines: finishes on the named existing fixture or surface only. One reference per line—no cross-wiring.",
      "",
    ].join("\n");
  }
  return [
    "",
    "QUOTE-DRIVEN LOOKS:",
    "Product references = finishes on the existing fixture (full cabinet height where applicable). No pasted catalog card, no duplicate vanity.",
    "Tile/shower = same enclosure, new surface appearance only.",
    "",
  ].join("\n");
}

/** When vision summary fails or returns empty, still tell the image model what to honor. */
export function buildReferenceVisualFallbackText(
  refs: { label: string; url: string }[],
): string {
  const lines = refs.slice(0, 12).map(
    (r, i) =>
      `${i + 1}. ${r.label} — in-place only: apply finishes from this look on the existing fixture; do not paste as a new object; do not use for a different line (e.g. vanity vs vanity light).`,
  );
  return [
    "REFERENCE LOOKS (from contractor photos + Home Depot images — one block per line below; never mix references across lines):",
    ...lines,
    "Wet area: product JPEGs never relocate shower/tub/curb/glass or change enclosure handedness — only retexture/refinish the **same** wet surfaces and vanity footprint shown in the room photo.",
  ].join("\n");
}

/**
 * True when scope may require toilet supply, replacement, relocation, or rough-in.
 * If false, image prompts must not "preserve" or name a toilet (that primes models to draw one).
 */
export function scopeMentionsToiletWork(scope: string): boolean {
  const s = scope.trim().toLowerCase();
  if (!s) return false;
  if (
    /\bno\s+toilet\b|\bwithout\s+toilet\b|\bomit\s+toilet\b|\bexclude\s+toilet\b|\bno\s+toilet\s+work\b|\btoilet\s+not\b|\bnot\s+including\s+toilet\b/i.test(
      s,
    )
  ) {
    return false;
  }
  return /\btoilet\b|water\s*closet|commode|\bwc\b|w\.c\./i.test(s);
}

const TOILET_INFERENCE_LINE =
  /\btoilet\b|water\s*closet|commode|toilet\s*paper|tp\s*holder|\bwc\b/i;

/**
 * Heuristic: vision text suggests mirrors, heavy crop, or partial fixture view — used for softer
 * reference-copy wording. Vertex still sends catalog/contractor pixels by default; set
 * `MOCKUP_OMIT_INLINE_REFS_WEAK_ROOM=1` to omit inline refs on weak geometry.
 */
export function roomAnalysisSuggestsWeakFixtureGeometry(roomAnalysis: string): boolean {
  const s = roomAnalysis.trim().toLowerCase();
  if (!s) return false;
  const patterns: RegExp[] = [
    /\bmirror\b|\breflection\b|\breflected\b|\breflective\b/,
    /\bthrough\s+the\s+mirror\b|\bin\s+the\s+glass\b|\bglass\s+shows\b|\bvisible\s+in\s+the\s+mirror\b/,
    /\bnot\s+visible\b|\bpartially\s+visible\b|\bbarely\s+visible\b|\boutside\s+the\s+frame\b|\bout\s+of\s+frame\b|\bcropped\b|\btight\s+crop\b/,
    /\bunclear\b|\bambiguous\b|\bdifficult\s+to\s+see\b|\blimited\s+view\b|\bnarrow\s+field\b|\bpartial\s+view\b/,
    /\bshower\b.*\b(only|mostly|primarily|largely)\b.*\b(mirror|reflection|glass)\b/,
    /\b(mostly|only|primarily|largely)\b.*\b(in\s+the\s+mirror|reflection|reflected)\b/,
    /\btoilet\b.*\b(only|mostly|primarily)\b.*\b(mirror|reflection)\b/,
    /\b(wet\s*area|shower|tub)\b.*\b(not\s+fully|not\s+clearly|hard\s+to)\b.*\b(see|visible)\b/,
  ];
  return patterns.some((p) => p.test(s));
}

/** Removes lines that mention toilets / TP (layout hints) when scope omits toilet work. */
export function sanitizeRoomAnalysisForMockupImage(
  roomAnalysis: string,
  scopeComposite: string,
): string {
  const raw = roomAnalysis.trim();
  if (!raw) return raw;
  if (scopeMentionsToiletWork(scopeComposite)) return raw;
  const lines = raw.split(/\r?\n/);
  const kept = lines.filter((line) => !TOILET_INFERENCE_LINE.test(line));
  const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (out.length > 0) return out;
  return "Use only the INPUT IMAGE for layout. Vision text omitted so off-camera fixtures are not inferred.";
}

/** Strips toilet-related instructions from vision remodelEditPrompt when scope omits toilet work. */
export function sanitizeRemodelEditPromptForMockupImage(
  remodelEditPrompt: string,
  scopeComposite: string,
): string {
  const raw = remodelEditPrompt.trim();
  if (!raw) return raw;
  if (scopeMentionsToiletWork(scopeComposite)) return raw;
  const lines = raw.split(/\r?\n/);
  const kept = lines.filter((line) => !TOILET_INFERENCE_LINE.test(line));
  const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (out.length > 0) return out;
  return [
    "PERMITTED CHANGES ONLY: apply only what contractor scope and quote lines name for visible surfaces and fixtures.",
    "UNCHANGED: room layout, walls, windows, door openings, and any fixture not named in scope — do NOT add a toilet or fixtures not visible in the photo.",
  ].join("\n");
}

/** Very first lines of the image-edit prompt when scope does not mention toilet work. */
export function buildImageEditLeadIn(scopeMentionsToilet: boolean): string {
  if (scopeMentionsToilet) return "";
  return [
    "!! READ FIRST — HARD CONSTRAINTS:",
    "The contractor scope does NOT require toilet work. You MUST NOT draw, add, or place a toilet. If the photo does not show a toilet, the output must NOT show one.",
    "You MUST NOT add partition walls, half-walls, or new door/window openings unless the scope explicitly names that structural work.",
    "Change only finishes and items named in scope — do not redesign whole walls or zones.",
    "",
  ].join("\n");
}

/** When AI returns new line items, re-attach stable ids and reference image paths from the previous quote when names match. */
export function mergeMaterialsPreservingRefs(
  vision: BidMaterialLine[],
  previous: BidMaterialLine[],
): BidMaterialLine[] {
  const prevByLower = new Map<string, BidMaterialLine>();
  for (const row of previous) {
    const k = row.name.trim().toLowerCase();
    if (k) prevByLower.set(k, row);
  }
  return vision.map((v) => {
    const k = v.name.trim().toLowerCase();
    const prev = k ? prevByLower.get(k) : undefined;
    if (prev?.line_id) {
      const mergedTrade = normalizeMaterialTrade(v.trade ?? prev.trade);
      const hdFromPrev = {
        ...(prev.hd_product_url ? { hd_product_url: prev.hd_product_url } : {}),
        ...(prev.hd_title ? { hd_title: prev.hd_title } : {}),
        ...(prev.hd_unit_price_usd !== undefined
          ? { hd_unit_price_usd: prev.hd_unit_price_usd }
          : {}),
        ...(prev.hd_price_raw ? { hd_price_raw: prev.hd_price_raw } : {}),
        ...(prev.hd_product_id ? { hd_product_id: prev.hd_product_id } : {}),
        ...(prev.hd_fetched_at ? { hd_fetched_at: prev.hd_fetched_at } : {}),
        ...(prev.hd_image_url ? { hd_image_url: prev.hd_image_url } : {}),
        ...(prev.lw_product_url ? { lw_product_url: prev.lw_product_url } : {}),
        ...(prev.lw_title ? { lw_title: prev.lw_title } : {}),
        ...(prev.lw_unit_price_usd !== undefined
          ? { lw_unit_price_usd: prev.lw_unit_price_usd }
          : {}),
        ...(prev.lw_price_raw ? { lw_price_raw: prev.lw_price_raw } : {}),
        ...(prev.lw_product_id ? { lw_product_id: prev.lw_product_id } : {}),
        ...(prev.lw_fetched_at ? { lw_fetched_at: prev.lw_fetched_at } : {}),
        ...(prev.lw_image_url ? { lw_image_url: prev.lw_image_url } : {}),
      };
      const merged: BidMaterialLine = {
        ...v,
        line_id: prev.line_id,
        ...(prev.reference_storage_path
          ? { reference_storage_path: prev.reference_storage_path }
          : {}),
        ...(mergedTrade !== "general" ? { trade: mergedTrade } : {}),
        ...hdFromPrev,
        mockup_include: false,
        ...(prev.pricing_approved === true ? { pricing_approved: true as const } : {}),
      };
      merged.mockup_include =
        lineHasMockupVisualReference(merged) && prev.mockup_include !== false
          ? lineShouldAutoEnableMockupInclude(merged) || prev.mockup_include === true
          : false;
      return merged;
    }
    const solo: BidMaterialLine = {
      ...v,
      mockup_include: false,
    };
    solo.mockup_include =
      lineShouldAutoEnableMockupInclude(solo) && v.mockup_include !== false ? true : false;
    return solo;
  });
}

export async function fetchMaterialsAndSummaryFromOpenAI(params: {
  apiKey: string;
  companyName: string;
  scopeDescription: string;
  beforeImageUrls: string[];
  /**
   * Optional AI-rendered “after” mockup(s) of the same room (same bid). When present, the model
   * must compare before vs after and align materials with every substantive visual delta.
   */
  afterMockupImageUrls?: string[];
  /** Saved quote lines from the bid — notes and reference flags inform vision + mockup. */
  quoteLines?: BidMaterialLine[];
  /** Signed URLs for product/finish reference images (not the job site). */
  referenceImageUrls?: { label: string; url: string }[];
  /** Extra instructions: refinements, recommendations, what to emphasize in the mockup. */
  additionalPrompt?: string;
  /**
   * Homeowner `/try` first pass: use `detail: "low"` for job-site + ref images and a lower `max_tokens`
   * cap so vision returns faster (still one full JSON). Contractor bids keep the default (high detail).
   */
  homeownerTryFastVision?: boolean;
}): Promise<MaterialsAndVisionResult> {
  const {
    apiKey,
    companyName,
    scopeDescription,
    beforeImageUrls,
    afterMockupImageUrls = [],
    quoteLines,
    referenceImageUrls,
    additionalPrompt,
    homeownerTryFastVision = false,
  } = params;

  const visionDetail = homeownerTryFastVision ? ("low" as const) : ("high" as const);

  const afterUrls = afterMockupImageUrls.filter((u) => u.trim().length > 0).slice(0, 2);
  const hasAfterMockup = afterUrls.length > 0;

  const visionMaxTokens = homeownerTryFastVision
    ? hasAfterMockup
      ? 6000
      : 2200
    : hasAfterMockup
      ? 8192
      : 4096;

  const additionalTrimForVision = additionalPrompt?.trim() ?? "";
  const additionalBlock =
    additionalTrimForVision.length > 0
      ? [
          ``,
          `Contractor additional instructions for THIS run (apply to summary, materials, and roomAnalysis; for remodelEditPrompt follow the strict image rules below):`,
          additionalTrimForVision,
          `For remodelEditPrompt: start with PERMITTED CHANGES ONLY: then short bullets of ONLY the visual changes required by these additional instructions plus scope and quote lines. If additional instructions name a single item (e.g. square smart mirror, one light fixture), bullets must be ONLY that item—do not also change floor tile, vanity, countertop, wall paint, shower tile, doors, door knobs, wall outline, or trim in the image description unless scope names those. End UNCHANGED: list surfaces and fixtures that stay the same — if contractor scope does NOT mention toilet work, do NOT list or name "toilet" in PERMITTED or UNCHANGED (the image model will draw one). Do NOT add optional upgrades or unrelated style changes. Do NOT move plumbing fixtures unless the scope explicitly requires relocating rough plumbing.`,
          `If they ask for recommendations, put practical suggestions in the summary and materials with approximate US pricing; do not treat recommendations as extra image edits unless they explicitly ask to show those in the mockup.`,
        ].join("\n")
      : "";

  const quoteBlock =
    quoteLines && quoteLines.length > 0
      ? [
          ``,
          `Contractor quote line items (authoritative for product selections, colors, finishes, and fixtures):`,
          formatQuoteLinesForPrompt(quoteLines),
          `Incorporate these line items into roomAnalysis and remodelEditPrompt only where they apply to scope. Notes (e.g. paint color names, fixture styles) must drive permitted visual changes; do not add unrelated image changes beyond scope and quote.`,
        ].join("\n")
      : "";

  const intro: VisionContent[] = [
    {
      type: "text",
      text: [
        `You help residential remodeling contractors in the US prepare internal bid support.`,
        `Company: ${companyName || "Contractor"}.`,
        `The homeowner's requested scope (verbatim from the contractor):`,
        scopeDescription.trim() || "(no scope text provided)",
        ...(scopeMentionsToiletWork(scopeDescription.trim())
          ? []
          : [
              `CRITICAL — downstream image model: If this scope does NOT mention toilet, water closet, WC, or commode work, your JSON fields roomAnalysis and remodelEditPrompt must NOT contain the word "toilet" or "toilet paper" — those substrings are pasted into an image-edit prompt and cause a hallucinated toilet.`,
            ]),
        additionalBlock,
        quoteBlock,
        `You will receive one or more BEFORE photos of the existing job-site space first.`,
        ...(hasAfterMockup
          ? [
              `You will then receive one or more AFTER MOCKUP image(s): AI-produced target render(s) of the **same room** as the BEFORE set (same camera / footprint). These are NOT catalog product sheets — they show the intended finished look.`,
              `BEFORE vs AFTER (mandatory when AFTER mockup images are present):`,
              `- Systematically compare BEFORE photos to EACH AFTER mockup. In roomAnalysis, after your baseline room inventory, append a section exactly titled "--- Before vs after mockup ---" then bullet every substantive visual difference (surfaces, fixtures, lighting, hardware, trim, paint/tile/stone, mirrors, glass, accessories removed/added, grout/color, cabinet faces, countertops, etc.). Omit microscopic JPEG noise; include anything a contractor would scope or price.`,
              `- WINDOWS, DOORS & ROUGH OPENINGS (critical — do not skip): For every window and exterior/interior door **visible** in BEFORE, compare rough opening width/height, sill/stool line, head height, number of lites/mullions, grille pattern, and trim/casing footprint to AFTER. If AFTER shows a **larger** window or door, a **new** opening, a **combined** opening where BEFORE had separate units, or **less** visible jamb/casing (suggesting a wider unit), you MUST call that out explicitly in the diff (e.g. "window rough opening appears widened/taller vs before"). Treat obvious fenestration changes as **structural/envelope work**, not a finish-only swap.`,
              `- When you identify any opening enlargement, new opening, or non-cosmetic window/door change vs BEFORE: materials MUST add separate ROM lines (even if contractor scope did not mention them) for: selective demo and framing repair; header/jack/king stud package or engineered header as appropriate; sill pan / extension jambs / insulation & air sealing; WRB integration and exterior flashing; new or resized window or door **unit + install labor**; interior and exterior trim/stop; drywall/patch and paint touch-up; exterior siding or stucco patch/match where applicable; **permit / plan review allowance** when work is beyond a same-size insert replacement. Use trades general, labor, permits, drywall, paint, other as fits; split into multiple lines so the estimate is bid-ready.`,
              `- materials: must include explicit ROM line items for **each** substantive delta you listed (plus scope-driven work visible only in BEFORE). Reconcile with contractor quote lines when provided: keep their intent, add any missing lines implied by the AFTER image that scope/quote did not capture, and adjust quantities/notes when the AFTER image makes a clearer quantity (e.g. wall tile field, shower surround, vanity run). Do not drop a visible change because it was absent from an older quote.`,
              `- remodelEditPrompt: describe how to transform the BEFORE photo toward the AFTER look while respecting layout rules below; do not invent new fixture locations.`,
            ]
          : []),
        ...(referenceImageUrls?.length
          ? [
              `Additional images after the room photos (and after any AFTER mockups) are PRODUCT/FINISH REFERENCES ONLY (not the job site). Use them to infer colors, materials, fixture shapes, and styles to apply in the BEFORE room.`,
            ]
          : []),
        `BATH VANITY / CABINET SIZING (when BEFORE photos show a bathroom): From the photos, estimate the maximum realistic vanity or cabinet width that fits the visible wall run (clearances, adjacent toilet/tub, door swing, trim). State that range in roomAnalysis (e.g. "vanity wall ~36–48 in usable"). For any vanity or vanity+sink material line, put sizing in notes so the ROM does not assume a fixture clearly wider than that visible space unless scope names a specific width.`,
        `Reply with a single JSON object only, no markdown, with this exact shape:`,
        `{"summary":"2-4 sentences for the contractor, professional tone","materials":[{"name":"string","quantity":number,"unit":"string","unit_price_usd":number,"extended_usd":number,"notes":"optional","trade":"one of: general | electrical | plumbing | hvac | drywall | flooring | paint | cabinetry | tile | labor | permits | other"}],"roomAnalysis":"Detailed: room type; layout; doors, windows, major walls; visible plumbing fixtures, drains, tub/shower, vanity/sink; visible electrical; flooring/wall finishes; constraints. For bathrooms: include approximate max vanity width that fits the visible layout (from the photo), not a catalog default. If contractor scope does NOT mention toilet work, do NOT use the word toilet here. CRITICAL: If a fixture is not visible in any before photo, write NOT VISIBLE IN FRAME — do not guess position or describe off-camera coordinates. Never infer fixture placement from accessories alone.${hasAfterMockup ? " When AFTER mockups are provided, you MUST include the section --- Before vs after mockup --- with an exhaustive bullet list of visual differences as instructed above. In that section, explicitly compare each visible window and exterior/interior door between BEFORE and AFTER (rough opening size, head/sill lines, mullions, casing footprint); if AFTER suggests a larger, new, or merged opening, say so plainly." : ""}","remodelEditPrompt":"Instructions for an image editor that will receive the BEFORE photo. If contractor scope does NOT mention toilet work, do NOT use the word toilet in this field. CRITICAL: For fixtures VISIBLE in the photo, keep shower/tub, vanity, drains in place unless scope requires moving rough plumbing. If a fixture is NOT visible, do not instruct the editor to add or place it. Never swap fixture locations. Demand the SAME room, SAME camera angle, SAME wall/window/door openings and ceiling line. FORMAT: (1) PERMITTED CHANGES ONLY: bullets of ONLY visual changes required by scope, quote lines, additional instructions${hasAfterMockup ? ", and the AFTER mockup relative to BEFORE" : ""}. (2) UNCHANGED: layout, perspective, finishes not changing — if scope omits toilet work, do not list toilet. (3) Only describe pixels that may change; no people; no text in image."}`,
        `Materials must be a detailed ROM itemization where appropriate: include separate lines for electrical (rough-in, devices, GFCI/AFCI as needed), plumbing (supply, drain, valves, fixtures if in scope), HVAC/ventilation if relevant, drywall/patch, paint, flooring, tile/backer, cabinetry, permits, demo, and labor buckets when the scope implies them. When BEFORE vs AFTER (or scope) implies **larger or new windows/doors**, include explicit framing, opening prep, flashing, unit+install, trim, and permit lines — never fold that into a single generic "window" material line without construction detail. Tag each line with the correct "trade". Use many lines when the scope is large; do not collapse into one lump sum unless scope is tiny.`,
        `Rules for materials: approximate US retail pricing as of 2026; quantity * unit_price_usd ≈ extended_usd.`,
      ].join("\n"),
    },
  ];

  const beforeCap =
    hasAfterMockup || (referenceImageUrls?.length ?? 0) > 0 ? 4 : 6;
  const imageParts: VisionContent[] = beforeImageUrls.slice(0, beforeCap).map((url) => ({
    type: "image_url",
    image_url: { url, detail: visionDetail },
  }));

  const afterParts: VisionContent[] = [];
  if (hasAfterMockup) {
    afterParts.push({
      type: "text",
      text: `--- AFTER MOCKUP (${afterUrls.length} image(s)) — same room as BEFORE above; use for visual diff vs BEFORE only ---`,
    });
    for (const url of afterUrls) {
      afterParts.push({
        type: "image_url",
        image_url: { url, detail: visionDetail },
      });
    }
  }

  const refParts: VisionContent[] = [];
  const refCap = referenceImageUrls?.slice(0, 6) ?? [];
  if (refCap.length > 0) {
    refParts.push({
      type: "text",
      text: `The following images are NOT the job site. They are product/finish references (fixtures, tile, paint chips, catalog photos). Match their color, style, and character when describing changes to the BEFORE room.`,
    });
    for (const ref of refCap) {
      refParts.push({
        type: "text",
        text: `Reference: ${ref.label}`,
      });
      refParts.push({
        type: "image_url",
        image_url: { url: ref.url, detail: visionDetail },
      });
    }
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.15,
      max_tokens: visionMaxTokens,
      messages: [
        {
          role: "user",
          content: [...intro, ...imageParts, ...afterParts, ...refParts],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI chat error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Could not parse AI response as JSON.");
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const roomAnalysis =
    typeof parsed.roomAnalysis === "string"
      ? parsed.roomAnalysis
      : typeof parsed.room_analysis === "string"
        ? parsed.room_analysis
        : "";
  const remodelEditPrompt =
    typeof parsed.remodelEditPrompt === "string"
      ? parsed.remodelEditPrompt
      : typeof parsed.mockupPrompt === "string"
        ? parsed.mockupPrompt
        : summary;

  const materials: BidMaterialLine[] = [];
  if (Array.isArray(parsed.materials)) {
    for (const row of parsed.materials) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) continue;
      const quantity =
        typeof o.quantity === "number" ? o.quantity : Number(o.quantity) || 0;
      const unit = typeof o.unit === "string" ? o.unit : "each";
      const unit_price_usd =
        typeof o.unit_price_usd === "number"
          ? o.unit_price_usd
          : Number(o.unit_price_usd) || 0;
      let extended_usd =
        typeof o.extended_usd === "number"
          ? o.extended_usd
          : Number(o.extended_usd) || quantity * unit_price_usd;
      extended_usd = Math.round(extended_usd * 100) / 100;
      const notes = typeof o.notes === "string" ? o.notes : undefined;
      const trade = normalizeMaterialTrade(o.trade);
      materials.push({
        name,
        quantity,
        unit,
        unit_price_usd: Math.round(unit_price_usd * 100) / 100,
        extended_usd,
        mockup_include: false,
        notes,
        ...(trade !== "general" ? { trade } : {}),
      });
    }
  }

  return { materials, summary, roomAnalysis, remodelEditPrompt };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  let direct = tryParse(text);
  if (direct) return direct;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    direct = tryParse(text.slice(start, end + 1));
    if (direct) return direct;
  }
  return null;
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Remodel the same room using the before image as reference (OpenAI image edits).
 * Uses multipart/form-data per https://platform.openai.com/docs/api-reference/images/createEdit
 */
/**
 * `1024x1024` on a wide/tall source often looks "zoomed" or re-cropped. GPT Image edit supports
 * `auto` so output aspect follows the input. DALL·E 2 only supports fixed squares.
 * Override: `MOCKUP_OPENAI_IMAGE_EDIT_SIZE=1024x1024|1024x1536|1536x1024|auto`
 */
export function resolveOpenAiImageEditOutputSize(model: string): string {
  const raw = process.env.MOCKUP_OPENAI_IMAGE_EDIT_SIZE?.trim();
  if (raw && /^(1024x1024|1024x1536|1536x1024|auto)$/i.test(raw)) {
    return raw.toLowerCase();
  }
  if (/dall-e-2/i.test(model)) return "1024x1024";
  if (/gpt-image|chatgpt-image/i.test(model.toLowerCase())) return "auto";
  return "1024x1024";
}

function openAiImageEditPromptMaxChars(model: string): number {
  if (/dall-e-2/i.test(model)) return 1000;
  const raw = process.env.MOCKUP_OPENAI_IMAGE_EDIT_PROMPT_MAX_CHARS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 4000) {
    return Math.min(32_000, Math.floor(parsed));
  }
  /** GPT Image models allow 32k chars; stay below to avoid edge-case API issues. */
  return 24_000;
}

export async function fetchRoomRemodelImageEdit(params: {
  apiKey: string;
  imageBytes: ArrayBuffer;
  contentType: string;
  editPrompt: string;
  model?: string;
  /** Forwarded to {@link truncateMockupTextPromptWithLayoutReinforcement} (e.g. luxury OpenAI pin). */
  mockupTruncateOpts?: TruncateMockupLayoutOpts;
}): Promise<ArrayBuffer> {
  const { apiKey, imageBytes, contentType, editPrompt } = params;
  const model = params.model?.trim() || DEFAULT_IMAGE_EDIT_MODEL;

  const form = new FormData();
  const ext = extForMime(contentType);
  const filename = `before.${ext}`;
  const blob = new Blob([new Uint8Array(imageBytes)], {
    type: contentType || "image/jpeg",
  });
  form.append("image", blob, filename);
  form.append(
    "prompt",
    truncateMockupTextPromptWithLayoutReinforcement(
      editPrompt,
      openAiImageEditPromptMaxChars(model),
      undefined,
      params.mockupTruncateOpts,
    ),
  );
  form.append("model", model);
  form.append("size", resolveOpenAiImageEditOutputSize(model));
  form.append("output_format", "png");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI image edit error ${res.status}: ${errText.slice(0, 800)}`);
  }

  const json = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const b64 = json.data?.[0]?.b64_json;
  if (b64) {
    const buf = Buffer.from(b64, "base64");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const url = json.data?.[0]?.url;
  if (url) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      throw new Error("Failed to download edited image URL.");
    }
    return imgRes.arrayBuffer();
  }

  throw new Error("No image data in edit response.");
}

/** Last resort: text-only generation (will not match the room). */
export async function fetchFallbackConceptImage(params: {
  apiKey: string;
  prompt: string;
}): Promise<ArrayBuffer> {
  const { apiKey, prompt } = params;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: prompt.slice(0, 3900),
      size: "1024x1024",
      quality: "standard",
      n: 1,
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI image error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = (await res.json()) as { data?: { url?: string }[] };
  const url = json.data?.[0]?.url;
  if (!url) {
    throw new Error("No image URL returned from OpenAI.");
  }

  const imgRes = await fetch(url);
  if (!imgRes.ok) {
    throw new Error("Failed to download generated image.");
  }
  return imgRes.arrayBuffer();
}

/** Strong mirror/reflection handling — models often mis-read shower/toilet position from glass. */
const MIRROR_GLASS_LOCK = [
  "MIRRORS, GLASS & REFLECTIONS (read the photograph literally):",
  "Wall mirrors, medicine cabinets, vanity mirrors, and reflective shower door / enclosure glass show **virtual copies** of parts of the room. Those reflections are **not** a second floor plan and **not** permission to place a second shower, tub, toilet, or vanity elsewhere.",
  "Anchor the **real** toilet, tub/shower, vanity, curbs, drains, and knee/pony walls using **direct (non-reflected) pixels** — wall intersections, floor tile seams, glass frames, and hardware you see **outside** the mirror plane. If the shower (or toilet) is **only** clearly visible **inside** a mirror or distant reflection, do **not** invent or move a full-size wet zone to that reflected pose; keep the **actual** wet area where the direct-view walls and curbs already place it.",
  "Do **not** remove a toilet, knee wall, pony wall, WC partition, or shower curb that appears in **direct** view because a reflection makes the space look emptier or different.",
  "Unless mirror, medicine cabinet, or shower glass **replacement** is explicitly named in PERMITTED VISUAL CHANGES or contractor scope for this run, keep each mirror/glass panel’s frame, size, position, and general reflection character consistent with the input — do not replace the mirror just to “fix” geometry.",
  "A **flat vertical pane** over the sink (mirror or reflective medicine cabinet) often shows the opposite wall’s shower/tub — that image is **depth-compressed**; do not treat it as a second room or a cue to relocate the real wet zone.",
].join("\n");

/**
 * Extra guard when OpenAI job-brief compression tagged `SCENE_HINT: MIRROR_HEAVY` — reinforces direct-view anchoring for Vertex / OpenAI image edit.
 */
const MIRROR_HEAVY_SCENE_IMAGE_LOCK = [
  "MIRROR-HEAVY SCENE (compressed job brief flagged strong mirror/reflection risk):",
  "Read **direct-view pixels first**: floor–wall junctions, vanity footprint, visible curb / pan lip / threshold, shower-door **tracks and hinges** on metal you see without interpreting mirror glass.",
  "Shower or tub tile visible **inside** the vanity mirror or **in** reflective enclosure glass is a **virtual copy** — not where to draw the physical enclosure. Do **not** slide the wet area toward that reflected pose.",
  "Product / catalog references are **finish guides only** — they never override direct-view curb, glass uprights, or wall corners that already define the real wet footprint.",
  "If reflected vs direct placement conflicts, **trust direct-view structure**; leave ambiguous reflected regions unchanged rather than “correcting” layout.",
  "",
].join("\n");

/**
 * When scope includes toilet work, we can name the toilet. Otherwise avoid the word — it primes image models to draw one.
 */
export function getImageEditSpatialLock(scopeMentionsToilet: boolean): string {
  if (scopeMentionsToilet) {
    return [
      "SPATIAL LOCK (non-negotiable):",
      "AUTHORIZED LAYOUT CHANGES ONLY: You may translate, remove, or add a fixture or wall **only** when **contractor scope** (including embedded walkthrough / questionnaire / measurements) **or** explicit **per-run additional instructions** **name** that change for that element. Otherwise **zero** movement of shower, tub, toilet, vanity, partitions, or openings vs the FIRST image.",
      "The INPUT IMAGE is the only source of truth for layout. Text analysis or scope may mention fixtures — if a fixture is not visible in the photo, you must NOT add it or place it.",
      "For every plumbing fixture that IS clearly visible (toilet if shown, shower/tub, vanity/sink, drains), keep the SAME footprint and wall relationship as in the photo.",
      "If a fixture is not visible or is cut off by the frame, do NOT invent, add, or reposition it. Leave that region consistent with the photo.",
      "TOILET IN FRAME: If a toilet is visible in the input, it must remain visible and in substantially the same location and footprint unless contractor scope explicitly requires removing, replacing, or relocating that toilet. Never delete it, crop it out of frame, or slide it off-camera to open floor space.",
      "WALLS & PARTITIONS: Do not remove, dissolve, merge, or “open up” walls, pony walls, knee walls, or glass partitions that appear in the input unless contractor scope explicitly names demolition or layout change for that structure.",
      "SUB-WALLS & PRIVACY PARTITIONS: Short knee walls, pony walls, tiled half-walls, glass between toilet and vanity, and WC dividers are **real structure** in the photo — never delete, merge into one plane, or dissolve them to widen the room or simplify the layout unless scope **explicitly** names removing that specific wall or partition.",
      "Forbidden: moving the toilet next to the shower opening, abutting the toilet to the shower curb, putting the toilet inside the shower, swapping toilet and shower locations, or clustering fixtures into an unusable or code-unrealistic layout.",
      "Forbidden: inventing a new bathroom layout, new partition walls, half-walls, or new door/window openings unless the contractor scope explicitly requires that structural change.",
      "Forbidden: inferring fixture positions from accessories (e.g. toilet paper, towels) to hallucinate a toilet or relocate fixtures.",
      "SHOWER / TUB / GLASS: Keep tub, shower base, curb, pan, door, fixed glass, and shower wall tile in the **same footprint and wall position** as the input — never trade places with the toilet or vanity or “open” the wet area by moving fixtures.",
      "You may only change finishes, colors, materials, textures, and the visible style of existing fixtures in frame—not their positions.",
      MIRROR_GLASS_LOCK,
    ].join("\n");
  }
  return [
    "SPATIAL LOCK (non-negotiable):",
    "AUTHORIZED LAYOUT CHANGES ONLY: You may translate, remove, or add a fixture or wall **only** when **contractor scope** (including embedded walkthrough / questionnaire / measurements) **or** explicit **per-run additional instructions** **name** that change. Otherwise **zero** movement of shower, tub, toilet, vanity, partitions, or openings vs the FIRST image.",
    "The INPUT IMAGE is the only source of truth for layout. Do NOT add a toilet, water closet, or WC unless the contractor scope explicitly requires toilet work AND the photo shows where it belongs.",
    "Do NOT “preserve” or “restore” a toilet — that wording causes models to invent one. If no toilet appears in the photo, the output must not show a toilet.",
    "TOILET IN FRAME: If a toilet IS visible in the input photo, keep it fully in frame and in the same location and footprint unless contractor scope explicitly names toilet remove, replace, or relocate. Never push it out of the picture or erase it to clear space.",
    "For fixtures that ARE visible (shower/tub, vanity/sink, drains, etc.), keep the SAME footprint and wall relationship as in the photo.",
    "WALLS & PARTITIONS: Do not remove, dissolve, or open up walls or half-walls shown in the input unless the scope explicitly requires that demolition.",
    "SUB-WALLS & PRIVACY PARTITIONS: Knee walls, pony walls, tiled dividers, and glass between toilet and vanity are **real** — never remove them to “open” the bath unless scope explicitly names that demolition.",
    "Forbidden: inventing a new bathroom layout, partition walls, half-walls, or new door/window openings unless the scope explicitly requires that structural change.",
    "Forbidden: inferring hidden fixtures from accessories (paper rolls, towels, stacks) — do not hallucinate fixtures.",
    "SHOWER / TUB / GLASS: Keep tub, shower base, curb, pan, door, fixed glass, and shower wall tile in the **same footprint and wall position** as the input — never trade places with the toilet or vanity.",
    "You may only change finishes, colors, materials, textures, and the visible style of what is shown in the photo—not room geometry.",
    MIRROR_GLASS_LOCK,
  ].join("\n");
}

/** @deprecated Prefer getImageEditSpatialLock(scopeMentionsToiletWork(scope)) for mockup prompts. */
export const IMAGE_EDIT_SPATIAL_LOCK = getImageEditSpatialLock(true);

export function getRemodelLayoutGuard(scopeMentionsToilet: boolean): string {
  if (scopeMentionsToilet) {
    return [
      "CRITICAL — LAYOUT & PLUMBING:",
      "For each fixture that appears in the INPUT IMAGE, keep the toilet (if visible), bathtub/shower, vanity/sink, and visible drains in the SAME positions as in that photo.",
      "If the toilet (or any fixture) is not visible in the image, do NOT add or place it. Do not “complete” the room by drawing fixtures that are out of frame.",
      "Never place the toilet inside the shower or tub. Never swap or merge fixture locations (e.g. toilet and shower). Never move the toilet to sit flush beside the shower in a way that differs from the photo.",
      "Preserve door and window openings, floor plan shape, and wall positions. Only change finishes, colors, materials, surfaces, and the visible style of fixtures—do not redraw the room layout.",
      "Wall mirrors / medicine cabinets / reflective glass: keep position, size, and frame as in the input unless explicitly named in PERMITTED VISUAL CHANGES.",
      "Reflections: do not relocate the real shower, toilet, or tub to match content you see **only** in a mirror or reflective panel — anchor fixtures to **direct-view** geometry.",
    ].join("\n");
  }
  return [
    "CRITICAL — LAYOUT:",
    "Do NOT add a toilet or WC. If the source photo does not show a toilet, the output must not show one.",
    "If a toilet IS visible in the source photo, keep it in the same place and fully in frame unless scope explicitly requires toilet remove/replace/relocate — never delete it or slide it out of view.",
    "Keep visible fixtures (shower/tub, vanity/sink, drains, etc.) in the SAME positions as in the photo. Do not add walls, partitions, or new door/window openings unless the scope explicitly requires them.",
    "Preserve door and window openings, floor plan shape, and wall positions. Do not remove walls or widen the room unless scope explicitly names that demolition or layout change.",
    "Wall mirrors / medicine cabinets / reflective glass: keep position, size, and frame as in the input unless explicitly named in PERMITTED VISUAL CHANGES.",
    "Reflections: do not relocate the real shower, toilet, or tub to match content you see **only** in a mirror or reflective panel — anchor fixtures to **direct-view** geometry.",
  ].join("\n");
}

/** @deprecated Prefer getRemodelLayoutGuard(scopeMentionsToiletWork(scope)). */
export const REMODEL_LAYOUT_GUARD = getRemodelLayoutGuard(true);

/**
 * Single layout / safety footer for every mockup image-edit (OpenAI + Vertex text tail).
 * Kept short so the model sees scope, quote lines, and product summaries within token limits.
 */
export const MOCKUP_IMAGE_EDIT_LAYOUT_FOOTER = [
  "OFF-CAMERA & NO-INFERENCE (mandatory):",
  "The room photo defines what exists and where. Do not add toilets, walls, partition walls, doors, or fixtures unless contractor scope names them.",
  "Do not move or remove visible toilet, shower, tub, vanity, curbs, enclosure glass, or partitions unless scope requires it. Do not infer hidden fixture locations from accessories (e.g. toilet paper, towels).",
  "Mirror or shower-glass reflections are not a second layout — keep real fixtures on direct-view walls and curbs.",
  "Do NOT add objects, furniture, decor, plants, or small props in empty corners unless that type of object already sits in that spot in the photo. No people, pets, or logos.",
  "Do not change door knobs, levers, hinges, towel bars, rings, hooks, or holders unless scope names them.",
  "VANITY / CABINET: No second vanity; product images are finish guides on the existing footprint only — not a pasted catalog object.",
  "",
].join("\n");

/** @deprecated Use {@link MOCKUP_IMAGE_EDIT_LAYOUT_FOOTER}. */
export const FIXTURE_OCCLUSION_AND_INFERENCE = MOCKUP_IMAGE_EDIT_LAYOUT_FOOTER;

export type AppendMockupLayoutFooterOpts = {
  /** GPT‑4o text describing catalog + contractor reference images (after layout footer). */
  productRefTail?: string;
};

/**
 * Prepended when OpenAI image edit runs after Vertex RAPT/auth failure: that path cannot attach
 * shelf/contractor JPEGs — force the model to lean on the PRIORITY text block at the prompt tail.
 */
export const OPENAI_MOCKUP_FALLBACK_NO_REF_PIXELS_PREFIX = [
  "[CRITICAL — OPENAI IMAGE EDIT ONLY THE ROOM PHOTO]",
  "Vertex was unavailable for this request, so **no separate product JPEGs** are attached. You still **must** follow the **PRIORITY — PRODUCT/FINISH REFERENCES** section (after the OFF-CAMERA block at the end of this prompt) and implement those finishes on the correct ZONE in the room image.",
  "Missing pixel refs is **not** permission to skip quoted product looks — use the written reference descriptions as the source of truth for colors, materials, and hardware.",
  "",
].join("\n");

/** Appends occlusion rules, then optional product-reference tail (tail survives truncation better). */
export function appendMockupLayoutFooter(
  prompt: string,
  opts?: AppendMockupLayoutFooterOpts,
): string {
  const t = prompt.trimEnd();
  const refTail = opts?.productRefTail?.trim() ?? "";
  const alreadyFooter = t.includes("OFF-CAMERA & NO-INFERENCE");
  let base = t;
  if (!alreadyFooter) {
    base = `${t}\n\n${MOCKUP_IMAGE_EDIT_LAYOUT_FOOTER}`;
  }
  if (!refTail) return base;
  if (base.endsWith(refTail)) return base;
  return `${base}\n\n${refTail}`;
}

/**
 * Stops spurious edits: models often “upgrade” door hardware, wall paint, or wall shape when changing a vanity.
 */
export const SURFACE_ARCHITECTURE_HARDWARE_LOCK = [
  "DOORS, TRIM, HARDWARE & WALLS (non-negotiable):",
  "Do NOT add, remove, replace, or restyle door knobs, levers, handles, deadbolts, hinges, latches, or door slab / jamb / casing paint and wood grain unless contractor scope or PERMITTED VISUAL CHANGES explicitly names that door or hardware.",
  "Do NOT change door position, swing, size, frame, arch, or the opening shape.",
  "Do NOT redraw, bulge, straighten, or shift wall planes. Keep wall and ceiling outlines identical to the photo (same corners, angles, and intersections).",
  "Do NOT change drywall or plaster texture, wallpaper pattern, or sheen on walls/ceiling except on surfaces explicitly named for paint or wall finish in scope.",
  "Do NOT recolor baseboards, crown, chair rail, window trim, or door trim unless scope names that trim or whole-room paint including trim.",
  "Do NOT add, move, or replace outlets, switches, thermostats, or cover plates unless explicitly named.",
  "BATH ACCESSORIES (towel bars, rings, hooks, racks): Do NOT add, remove, replace, relocate, or restyle towel bars, towel rings, robe hooks, freestanding or wall-mounted racks, toilet paper holders, or similar wall-mounted accessories unless contractor scope or PERMITTED VISUAL CHANGES explicitly names that item.",
  "Do NOT “balance the room” by tweaking unrelated zones — if it is not named in PERMITTED CHANGES or scope, copy it from the input unchanged.",
].join("\n");

/** Short rules so the image model does not invent unrelated edits (full scope + vision path). */
export const MINIMAL_CHANGE_PROTOCOL = [
  "MINIMAL-CHANGE RULES:",
  "Change only what scope, quote lines, and the remodel instructions below explicitly require.",
  "If the instructions name only one or a few items (e.g. a mirror), change ONLY those pixels—keep floor tile, vanity, countertop, cabinets, wall paint (elsewhere), shower/tub tile, grout, doors, trim, hardware, towel bars/hooks, and every other surface identical to the source photo (same color, pattern, and texture).",
  "Do not restyle, recolor, sharpen, or “improve” unrelated areas. Do not relocate fixtures or alter floor plan.",
].join("\n");

/** Used when contractor additional instructions drive the mockup — no scope/quote/vision in the image prompt. */
export const ADDITIONAL_ONLY_ZERO_DRIFT = [
  "ADDITIONAL-INSTRUCTIONS-ONLY — ZERO DRIFT:",
  "The ONLY allowed differences from the input photo are those strictly required to implement PERMITTED VISUAL CHANGES below.",
  "Scope, quote lines, and AI analysis are intentionally omitted from this prompt so you cannot infer extra edits from them.",
  "Everything else must match the input pixel-for-pixel in content: same floor and wall tile, vanity, countertop, paint, grout, fixtures, lighting, doors, door hardware, trim, wall shape, towel bars/racks/hooks—unless PERMITTED VISUAL CHANGES explicitly names replacing that specific item or surface.",
  "Do not sharpen, denoise, recolor, relight, or “enhance” the rest of the scene. Do not relocate any fixture or change room geometry.",
  "Do not coordinate or harmonize unrelated finishes: changing one item (e.g. mirror) does not permit restyling the vanity, cabinets, countertop, doors, or walls.",
].join("\n");

/**
 * Tightens note-driven runs so the model does not “remodel the whole wet area” when only one object is named.
 */
export const INCREMENTAL_SURGICAL_EDIT = [
  "ANALYZE-FIRST: Confirm each fixture’s **current** position in the FIRST image before changing pixels — only then apply scope/quote-driven **looks** on those coordinates.",
  "LAYOUT — NO DOMINO MOVES: Never move the toilet, tub/shower, shower glass, or drains to “make room for” a vanity, mirror, tile, or paint change unless **contractor scope, questionnaire/walkthrough text in scope, or per-run notes** (not catalog images) explicitly names that relocation. Those fixtures stay where the FIRST image shows them.",
  "NAMED ELEMENTS ONLY (parse PERMITTED VISUAL CHANGES):",
  "List the concrete nouns the contractor named (e.g. mirror, medicine cabinet, sconce, faucet, paint color, one wall). Do NOT treat unnamed doors, door hardware, baseboards, or wall areas as permitted edits.",
  "ANTI-COORDINATION: Do not “make the room cohesive,” match wood tones, or unify styles across the room. A permitted change to one object never authorizes edits elsewhere to match it.",
  "LINE-TO-REFERENCE DISCIPLINE: Product reference images are labeled per quote line. Apply each reference ONLY to the fixture/surface that line describes (e.g. a vanity cabinet reference must not drive sconces; a vanity light reference must not replace the vanity cabinet or mirror unless that line explicitly names the mirror or vanity).",
  "If the wet area (shower, tub, shower door, glass, shower walls, shower tile, pan, curb, shower head, tub filler) is NOT explicitly named, reproduce it exactly from the input image — same tile, pattern, grout, fixtures, and enclosure. Do not retile, restyle, widen, or replace the shower/tub to “match” another change.",
  "If the shower appears **mainly in a mirror reflection**, still keep the **physical** shower enclosure, curb, and glass in the **direct-view** location — do not “move” the wet area to the mirror’s virtual position.",
  "VANITY ZONE (unless vanity, cabinets, countertop, or sink are explicitly named): Keep the vanity cabinet, drawers, open shelves, legs, countertop, undermount/drop-in sink, backsplash at the vanity, and vanity-side faucet and hardware visually identical to the input — same color, wood grain, stone pattern, edge profile, and style. Do not restyle, recolor, refinish, or replace the vanity or counter to coordinate with a new mirror, wall paint, or sconce.",
  "Do not invent a coordinated redesign. Unnamed regions must be copied from the input unchanged.",
].join("\n");

/** When the edit source is the previous mockup PNG, not the original before photo. */
export const LATEST_MOCKUP_AS_BASELINE = [
  "SOURCE IMAGE CONTEXT:",
  "The attached image is the latest mockup render (most recent iteration). It is the baseline for this edit — not the raw jobsite photo.",
  "Preserve the full scene except where PERMITTED VISUAL CHANGES requires a change. Do not revert to a different layout, strip prior finishes, or redraw the shower/bath or vanity from scratch.",
].join("\n");

/** v2+ full-path: scope/vision text must not trigger a whole-room redo on top of an existing mockup. */
export const MOCKUP_ITERATION_REFINE = [
  "MOCKUP ITERATION (v2+):",
  "The input is already an AI mockup of this room — not the original jobsite snapshot.",
  "Do NOT reinterpret the entire scope from scratch, retile the wet area, relight the room, or restyle unrelated finishes to ‘match’ the write-up.",
  "Apply small deltas: only what quote lines, product references, or explicit scope items still need changed vs what is already visible in this image.",
].join("\n");

/** When “Changes for this render” / per-run notes are present — suppresses re-driving the whole quote. */
export const PER_RUN_TWEAK_IMAGE_LOCK = [
  "PER-RUN TWEAK MODE (contractor “Changes for this render” is non-empty):",
  "The ONLY intentional edits are **PERMITTED VISUAL CHANGES** below. The input image is already correct for everything else.",
  "Do NOT re-execute, complete, or “fix” mockup quote lines, full-estimate context, or contractor scope for this pass unless PERMITTED VISUAL CHANGES explicitly names the same fixture or surface.",
  "If catalog/contractor product JPEGs are still attached after the room image, treat them as **inactive** unless PERMITTED VISUAL CHANGES explicitly points at that product or line — do not apply shelf looks to any surface not named.",
  "If a REFERENCE LOOKS / product-summary block appears later in this prompt, same rule: ignore for pixels unless PERMITTED VISUAL CHANGES names that item.",
  "Do not relight, recolor, sharpen, denoise, or beautify the room globally. Match exposure, white balance, and grain to the input outside the edited region.",
].join("\n");

/**
 * Text for image edit + DALL·E fallback. When additionalPrompt is set, vision remodelEditPrompt
 * is excluded so the image model cannot drift from analysis/scope.
 */
/**
 * How many catalog/contractor reference images to send through the GPT‑4o vision “reference summary” step.
 * Lower = faster mockups; clamped 3–12. Override with `MOCKUP_REFERENCE_VISION_MAX_REFS`.
 */
export function mockupReferenceVisionMaxRefs(): number {
  const raw = process.env.MOCKUP_REFERENCE_VISION_MAX_REFS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  const fallback = 5;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(12, Math.max(3, Math.floor(parsed)));
}

/**
 * Vision pass: convert product/finish reference URLs into concrete text for the image-edit model
 * (image edits API only accepts the room photo, not these URLs).
 */
export async function summarizeReferenceImagesForMockup(params: {
  apiKey: string;
  refs: { label: string; url: string }[];
  /** When true, emphasize finish-only guidance — never imply relocating fixtures to match SKUs. */
  weakRoomGeometry?: boolean;
  /** When aborted (e.g. deadline), callers should fall back to `buildReferenceVisualFallbackText`. */
  signal?: AbortSignal;
}): Promise<string> {
  const refs = params.refs.slice(0, mockupReferenceVisionMaxRefs());
  if (refs.length === 0) return "";

  const weakNote = params.weakRoomGeometry
    ? "ROOM PHOTO MAY HAVE AMBIGUOUS DIRECT GEOMETRY (mirror-heavy or partial views). Describe **finishes and styles only** — never write instructions that imply moving the shower, tub, toilet, vanity, or walls to match a catalog image. If a fixture is unclear from the label alone, say so briefly."
    : "";

  const content: VisionContent[] = [
    {
      type: "text",
      text: [
        ...(weakNote ? [weakNote] : []),
        "These are contractor-selected product/finish reference images (only for lines the contractor turned on for mockup and that have images). Each label matches ONE intent — do not merge or confuse different lines.",
        "If a label begins with THIS REGENERATION, it is a one-time attachment for this run only: it describes what to match when the contractor’s Notes name a specific swap (e.g. replace faucet with this look). That attachment takes priority over older quote-line product refs for the object named in Notes.",
        "Write plain text starting with REFERENCE LOOKS:",
        "For EACH label below, a separate short subsection: list colors, materials, wood/stain, metal finish, stone/tile, hardware shape, and style for THAT line only.",
        "For vanity/cabinet references: explicitly describe **each knob, pull, handle, or cup** (shape, metal finish, approximate proportions) visible on the catalog image — the image-edit step must reproduce those exactly, not approximate.",
        "Important: the downstream image model edits the **existing** vanity in place—never describe or imply a second vanity or new placement. Keep door/drawer positions from the room photo; describe finishes to transfer onto those surfaces.",
        "State explicitly: reference images are style guides for the fixture already in the room—not objects to paste into the scene.",
        "Critical: If one label mentions vanity/cabinet and another mentions lighting or sconce, keep those subsections strictly separate — never attribute a lighting SKU to a vanity line or vice versa.",
        "Be specific; max ~320 words.",
      ].join(" "),
    },
  ];
  refs.forEach((r, i) => {
    content.push({ type: "text", text: `Label: ${r.label}` });
    content.push({
      type: "image_url",
      image_url: {
        url: retailImageUrlForLightbox(r.url),
        /** First two refs at high detail; rest low — cuts latency vs all-high. */
        detail: i < 2 ? "high" : "low",
      },
    });
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: params.signal,
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 900,
      temperature: 0.2,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Reference summary failed: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const out = data.choices?.[0]?.message?.content?.trim() ?? "";
  const clipped = out.slice(0, 4000);
  if (clipped.length > 0) return clipped;
  return buildReferenceVisualFallbackText(refs);
}

export function buildStrictRemodelEditPrompt(params: {
  remodelEditPrompt: string;
  additionalPrompt?: string;
  /** When set, avoids “preserve toilet” phrasing if scope omits toilet work (reduces hallucinated toilets). */
  scopeDescription?: string;
}): string {
  const base = params.remodelEditPrompt.trim();
  const add = params.additionalPrompt?.trim() ?? "";
  const toiletScope = scopeMentionsToiletWork(params.scopeDescription ?? "");
  const header = toiletScope
    ? [
        "Implement ONLY the changes described in the sections below.",
        "Preserve visible toilet, shower/tub, vanity, and other plumbing fixture LOCATIONS exactly as in the source photo unless scope explicitly requires relocation.",
        "Do not change room layout, door/window positions, footprint, or camera angle unless explicitly required below.",
        "",
      ].join("\n")
    : [
        "Implement ONLY the changes described in the sections below.",
        "CRITICAL: Do NOT add, draw, or relocate a toilet. If no toilet appears in the source photo, the output must NOT show a toilet.",
        "Preserve visible fixtures (shower/tub, vanity/sink, drains, etc.) in the same positions as in the photo unless scope explicitly requires relocation.",
        "Do not change room layout, door/window positions, footprint, or camera angle unless explicitly required below.",
        "",
      ].join("\n");

  if (add) {
    const finishFreeze = [
      "",
      "TWEAK-ONLY — GLOBAL SOURCE LOCK:",
      "The output must match the **input image** everywhere except the **smallest** regions needed to satisfy PERMITTED VISUAL CHANGES. No whole-room refresh, no “while we’re here” upgrades, no harmonizing unrelated finishes.",
      "FINISH FREEZE:",
      "Only what PERMITTED VISUAL CHANGES names may look different. All other surfaces and objects must match the input photo.",
      "Mirror/medicine-cabinet/sconce-only wording does NOT include permission to change vanity, cabinets, countertop, sink, vanity faucet, doors, door knobs/levers, wall planes, trim, or towel bars/racks/hooks unless those words appear.",
      "Do not interpret unstated “bathroom remodel” intent — implement the written instructions only.",
      "",
    ].join("\n");

    return (
      header +
      "PERMITTED VISUAL CHANGES (contractor additional instructions — the ONLY edits allowed in this image):\n" +
      add +
      finishFreeze
    );
  }
  return header + base;
}

export type BuildImageEditPromptParams = {
  scopeDescription: string;
  roomAnalysis: string;
  remodelEditPrompt: string;
  /**
   * When set, replaces the long “Contractor scope” + full estimate dump with this OpenAI-compressed
   * brief (scope / Q&A / measurements / line intent). Still pass {@link scopeCompositeForRules} for toilet/sanitize rules.
   */
  vertexJobBrief?: string;
  /** Raw composite scope for rule hints when {@link vertexJobBrief} is used (toilet wording, sanitizers). */
  scopeCompositeForRules?: string;
  /** Saved quote line notes (colors, SKUs, styles) — must appear in the remodel. */
  quoteLineContext?: string;
  /** Per-run refinements (color changes, “show shower head”, etc.). */
  additionalPrompt?: string;
  /**
   * When `latest_mockup`, the image being edited is the previous mockup (refinement pass).
   * When `before`, it is the original jobsite photo.
   */
  imageEditSource?: "before" | "latest_mockup";
  /** GPT-4o vision summary of contractor + Home Depot reference images (product looks). */
  referenceVisualSummary?: string;
  /**
   * Mockup-enabled material lines for this render (optional). When any line is a **new vanity cabinet**
   * supply/install, prompts switch from “skins only” to **full vanity replacement** semantics.
   */
  mockupQuoteLines?: BidMaterialLine[];
  /**
   * Full saved estimate (all named lines) with mockup/ref tags — gives job context; labeled images
   * still apply only to mockup-on lines with refs.
   */
  fullEstimateContext?: string;
  /** Vision/room text suggests mirror-heavy or partial fixture view — tighten ref + layout rules. */
  weakRoomGeometryEvidence?: boolean;
  /** Vertex skipped sending catalog/contractor pixels (text summary only). */
  inlineProductPixelsOmitted?: boolean;
  /**
   * Luxury + OpenAI strict path: shorten supporting text so {@link truncateMockupTextPromptWithLayoutReinforcement}
   * does not omit the vision-built geometry section from the middle of the prompt.
   */
  compactForLuxuryOpenAiStrict?: boolean;
};

/**
 * Single mockup image-edit prompt: short task rules + contractor content + one layout footer.
 * (Earlier stacked “full/compact” guardrails were removed as a reset — iterate in product if quality regresses.)
 */
export function buildImageEditPrompt(params: BuildImageEditPromptParams): string {
  const {
    scopeDescription,
    roomAnalysis,
    remodelEditPrompt,
    quoteLineContext,
    additionalPrompt,
    imageEditSource = "before",
    referenceVisualSummary,
    mockupQuoteLines,
    fullEstimateContext,
    weakRoomGeometryEvidence = false,
    inlineProductPixelsOmitted = false,
    compactForLuxuryOpenAiStrict = false,
    vertexJobBrief: vertexJobBriefRaw,
    scopeCompositeForRules: scopeCompositeForRulesRaw,
  } = params;

  const vertexBrief = vertexJobBriefRaw?.trim() ?? "";
  const mirrorHeavyScene = mirrorHeavySceneFromVertexJobBrief(vertexBrief);
  const scopeTrim = scopeDescription.trim();
  const ruleScope = (scopeCompositeForRulesRaw ?? scopeDescription).trim();
  const scopeHasToilet = scopeMentionsToiletWork(ruleScope);

  const vanityCabinetReplacement = quoteHasNewVanityCabinetAssembly(mockupQuoteLines ?? []);
  const inPlaceHeader = vanityCabinetReplacement
    ? MOCKUP_IN_PLACE_EDIT_HEADER_VANITY_REPLACE
    : MOCKUP_IN_PLACE_EDIT_HEADER;
  const quoteTrimmed = quoteLineContext?.trim() ?? "";
  const additionalTrimmed = additionalPrompt?.trim() ?? "";
  /** Contractor filled “Changes for this render” — image model must not re-run the whole quote/estimate. */
  const perRunTweakMode = additionalTrimmed.length > 0;
  const quoteForPrompt = perRunTweakMode ? "" : quoteTrimmed;
  const leadIn = buildImageEditLeadIn(scopeHasToilet);
  const roomForImage = sanitizeRoomAnalysisForMockupImage(roomAnalysis, ruleScope);
  const remodelForImage = sanitizeRemodelEditPromptForMockupImage(remodelEditPrompt, ruleScope);
  const remodelMerged = buildStrictRemodelEditPrompt({
    remodelEditPrompt: remodelForImage,
    additionalPrompt,
    scopeDescription: ruleScope,
  });
  const refVisualTrimmed = referenceVisualSummary?.trim() ?? "";

  const refVisualHowToCore = vanityCabinetReplacement
    ? "Apply each labeled image only to its quote line. New vanity cabinet: replace the vanity on that wall from the reference; toilet, shower, glass, and curbs stay fixed."
    : "Apply each reference as finishes on the fixture that line names—never a second object or new layout.";
  const refVisualHowTo = weakRoomGeometryEvidence
    ? `${refVisualHowToCore} Weak/partial photo: if unsure, leave pixels unchanged rather than forcing a catalog layout.`
    : refVisualHowToCore;
  const refVisualHeading = inlineProductPixelsOmitted
    ? "PRIORITY — PRODUCT/FINISH REFERENCES (text summary only; finish hints, not layout)."
    : "PRIORITY — PRODUCT/FINISH REFERENCES (from quote-line photos when attached).";

  const footerOpts: AppendMockupLayoutFooterOpts = {
    ...(refVisualTrimmed.length
      ? {
          productRefTail: ["", refVisualHeading, refVisualHowTo, refVisualTrimmed].join("\n"),
        }
      : {}),
  };

  const quoteSection = quoteForPrompt.length
    ? ["", "Mockup quote lines (do each line that matches this photo):", quoteForPrompt].join("\n")
    : "";

  const fullEst = vertexBrief.length > 0 ? "" : (fullEstimateContext?.trim() ?? "");
  const fullEstForPrompt =
    compactForLuxuryOpenAiStrict ? "" : perRunTweakMode ? "" : fullEst;
  const fullEstSection =
    fullEstForPrompt.length > 0
      ? [
          "",
          "COMPLETE ESTIMATE (context only — ignore work for other rooms):",
          fullEstForPrompt,
          "[mockup: ON + ref] may have JPEGs after the room image; [mockup: OFF] is context only.",
          "",
        ].join("\n")
      : "";

  const quoteRefBlock =
    quoteForPrompt.length > 0 ? quoteDrivenProductReferenceBlock({ vanityCabinetReplacement }) : "";

  const taskCore = [
    "TASK: Photorealistic edit of the attached room image. Same room, same camera — no whole-frame flip.",
    scopeHasToilet
      ? "Keep toilet, shower/tub, vanity, curbs, glass, and openings where the photo shows them unless scope explicitly authorizes moving or removing them."
      : "If no toilet appears in the photo, do not add one.",
    "Unless contractor scope (including walkthrough, Q&A, measurements), line notes, or per-run notes explicitly require demolition, relocation, or new openings, keep walls and fixture positions as in the photo — finishes and explicitly requested swaps only.",
    "Product / catalog images (when present) are finish guides for their labeled quote line only — not a new floor plan.",
    "",
  ].join("\n");

  const weakBlock = weakRoomGeometryEvidence
    ? "WEAK / PARTIAL VIEW: Prefer leaving ambiguous areas unchanged; do not relocate fixtures to match SKUs.\n\n"
    : "";

  const mirrorHeavyBlock = mirrorHeavyScene ? `${MIRROR_HEAVY_SCENE_IMAGE_LOCK}\n` : "";

  const roomNotesForImage =
    compactForLuxuryOpenAiStrict && roomForImage.trim().length > 2800
      ? `${roomForImage.trim().slice(0, 2800)}\n\n[Room notes truncated for length — photo wins.]`
      : roomForImage.trim() || "(see photo)";

  const corePrefix = [
    ...(leadIn ? [leadIn] : []),
    inPlaceHeader,
    taskCore,
    weakBlock,
    mirrorHeavyBlock,
    fullEstSection,
    quoteSection,
  ].join("");

  if (additionalTrimmed.length > 0) {
    const baselineBlock =
      imageEditSource === "latest_mockup" ? `${LATEST_MOCKUP_AS_BASELINE}\n\n` : "";
    const tweakGuards = [
      PER_RUN_TWEAK_IMAGE_LOCK,
      MOCKUP_ITERATION_REFINE,
      INCREMENTAL_SURGICAL_EDIT,
      MINIMAL_CHANGE_PROTOCOL,
      SURFACE_ARCHITECTURE_HARDWARE_LOCK,
    ].join("\n\n");
    return appendMockupLayoutFooter(
      [
        corePrefix,
        baselineBlock,
        tweakGuards,
        "",
        "Implement **only** PERMITTED VISUAL CHANGES below. Every other pixel must match the input image (same materials, colors, grout, lighting character, and geometry).",
        "",
        remodelMerged,
      ].join("\n"),
      footerOpts,
    );
  }

  const scopeForContractorDisplay =
    compactForLuxuryOpenAiStrict && scopeTrim.length > 4000
      ? `${scopeTrim.slice(0, 4000)}\n\n[Scope truncated for length — photo wins.]`
      : scopeTrim || "(none)";

  const contractorScopeBlock =
    vertexBrief.length > 0
      ? [
          "IMAGE JOB BRIEF (OpenAI-compressed from full scope, walkthrough, Q&A, measurements, estimate):",
          compactForLuxuryOpenAiStrict && vertexBrief.length > 4500
            ? `${vertexBrief.slice(0, 4500)}\n\n[Job brief truncated — photo wins.]`
            : vertexBrief,
          "",
        ].join("\n")
      : [
          imageEditSource === "latest_mockup"
            ? "Contractor scope (reference only):"
            : "Contractor scope:",
          scopeForContractorDisplay,
          "",
        ].join("\n");

  if (imageEditSource === "latest_mockup") {
    return appendMockupLayoutFooter(
      [
        corePrefix,
        LATEST_MOCKUP_AS_BASELINE,
        "",
        "You are refining a prior mockup: small pixel deltas only; do not revert layout or restyle unrelated areas.",
        "",
        quoteRefBlock,
        contractorScopeBlock,
        "Remodel / delta:",
        remodelMerged,
      ].join("\n"),
      footerOpts,
    );
  }

  return appendMockupLayoutFooter(
    [
      corePrefix,
      quoteRefBlock,
      contractorScopeBlock,
      "Room notes (photo wins if text disagrees):",
      roomNotesForImage,
      "",
      "Remodel instructions:",
      remodelMerged,
    ].join("\n"),
    footerOpts,
  );
}
