import { randomUUID } from "crypto";
import type { RoomMeasurementRow } from "@/types/bid";

const CHAT_MODEL = "gpt-4o";

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const slice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clampFt(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.round(Math.min(50, Math.max(0.5, v)) * 2) / 2;
}

function clampCeiling(n: unknown): number | undefined {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return undefined;
  const c = Math.round(Math.min(14, Math.max(6, v)) * 2) / 2;
  return c;
}

/** Typical US tub/curtain alcove nominal (ft) when interior is not visible — planning only. */
const NOMINAL_SHOWER_ALCOVE_LENGTH_FT = 5;
const NOMINAL_SHOWER_ALCOVE_WIDTH_FT = 2.5;

function isShowerWetRowLabel(label: string): boolean {
  return /\bshower\b|\bwet\s*area\b/i.test(label);
}

/**
 * If the model returned a shower row with no usable footprint (zeros / needs_user), fill a
 * standard nominal alcove so estimates are not blank — notes always say to verify on site.
 */
function ensureShowerRowHasPlanningFootprint(rooms: RoomMeasurementRow[]): void {
  for (const r of rooms) {
    if (!isShowerWetRowLabel(r.label)) continue;
    const noDims = r.length_ft <= 0 && r.width_ft <= 0;
    if (!noDims && !r.needs_user_measurements) continue;
    r.length_ft = NOMINAL_SHOWER_ALCOVE_LENGTH_FT;
    r.width_ft = NOMINAL_SHOWER_ALCOVE_WIDTH_FT;
    delete r.needs_user_measurements;
    const extra =
      "Nominal ~5×2.5 ft footprint (~60×30 in common US tub/curtain alcove) used for planning because the wet area is partly visible but interior dimensions are blocked or unclear — verify width × depth at the floor/curb with a tape measure.";
    const prev = r.notes?.trim() ?? "";
    r.notes = prev ? `${prev} ${extra}` : extra;
  }
}

/**
 * Vision estimate of room footprint + key fixture envelopes (vanity run, shower) from before photos.
 * Numbers are approximate — UI should show notes and ask the homeowner to verify.
 */
export async function fetchRoomDimensionsFromPhotosOpenAI(params: {
  apiKey: string;
  scopeDescription: string;
  projectKind: string;
  beforePhotoUrls: string[];
}): Promise<{ rooms: RoomMeasurementRow[]; analysisSummary: string }> {
  const { apiKey, scopeDescription, projectKind, beforePhotoUrls } = params;
  const urls = beforePhotoUrls.filter((u) => u.startsWith("http://") || u.startsWith("https://")).slice(0, 6);

  if (urls.length === 0) {
    return { rooms: [], analysisSummary: "" };
  }

  const instructions = [
    `You are an experienced residential field measurer. From the BEFORE remodel photos, estimate dimensions that help scope and pricing — not architectural precision.`,
    `Use visual scale cues when possible: interior passage doors are often ~30–36 in wide; a 36 in vanity cabinet is a common module; shower curbs and glass panels; floor/wall tile repeats; ceiling height vs door height.`,
    `Return JSON ONLY (no markdown):`,
    `{"analysis_summary":"2-4 sentences: what you saw, confidence, caveats (angle, clutter, missing view)","rooms":[`,
    `  {"label":"short name","length_ft":number,"width_ft":number,"ceiling_ft":number_or_omit,"notes":"string","needs_user_measurements":boolean_optional}`,
    `]}`,
    `Field needs_user_measurements: set true ONLY for rows where no planning number is reasonable at all (omit those rows if possible). Do NOT use it for a standard tub/shower alcove that is partly visible but hidden by a curtain or door — use nominal dimensions below instead.`,
    `Rules for "rooms" array:`,
    `- Always try to include ONE row for the overall bathroom/kitchen footprint if the photo shows that space (label e.g. "Bathroom floor print" or "Kitchen footprint"). length_ft and width_ft are the room floor rough rectangle in feet (nearest 0.5 ft).`,
    `- If a vanity or cabinet run is visible and relevant to replacement, add a row labeled exactly "Vanity / cabinet run (replace)" with length_ft = run length along the wall in feet, width_ft = depth from wall in feet (nearest 0.5). If you truly cannot see it, omit the row — do not use generic labels like "Room 2".`,
    `- For project type bathroom (or scope clearly a bath remodel): you MUST include a row labeled exactly "Shower / wet area (replace)".`,
    `  • If you can see the curb/pan or tile envelope: estimate length_ft x width_ft at the floor (nearest 0.5 ft).`,
    `  • If the shower/tub alcove is clearly present but the interior is hidden (shower curtain drawn, frosted door, tight angle): still set length_ft and width_ft — use nominal **5 x 2.5 ft** (~60×30 in typical US alcove) unless scale cues clearly suggest a different standard width (e.g. 54 in); set needs_user_measurements false and state in notes that the interior was not visible and this is a nominal planning footprint to verify with a tape measure.`,
    `- ceiling_ft only when you can infer (e.g. standard 8 ft or from door proportion); omit if unknown.`,
    `- For rows with real dimensions: notes must say what you used for scale and that the homeowner should verify with a tape measure.`,
    `- Do not leave the shower row with zero dimensions when a tub/curtain alcove or shower area is visible in the frame — use nominal 5 x 2.5 ft in that obscured-interior case as above.`,
    `- 2–6 rows total is typical for a bath photo set; fewer is fine.`,
    ``,
    `Project type hint: ${projectKind.trim() || "unspecified"}`,
    `Scope (for context only):`,
    scopeDescription.trim().slice(0, 4000) || "(none)",
  ].join("\n");

  type VisionPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

  const userContent: VisionPart[] = [{ type: "text", text: instructions }];
  urls.forEach((url, i) => {
    userContent.push({
      type: "image_url",
      image_url: { url, detail: i < 2 ? "high" : "low" },
    });
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.2,
      max_tokens: 2500,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Could not parse room dimensions JSON.");
  }

  const analysis_summary =
    typeof parsed.analysis_summary === "string" ? parsed.analysis_summary.trim().slice(0, 1200) : "";

  const list = parsed.rooms;
  const rooms: RoomMeasurementRow[] = [];
  if (Array.isArray(list)) {
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim().slice(0, 120) : "";
      const needs_user_measurements = o.needs_user_measurements === true;
      const length_ft = needs_user_measurements ? 0 : clampFt(o.length_ft, 0);
      const width_ft = needs_user_measurements ? 0 : clampFt(o.width_ft, 0);
      if (!label) continue;
      if (!needs_user_measurements && Math.max(length_ft, width_ft) < 1) continue;
      const ceiling_ft = needs_user_measurements ? undefined : clampCeiling(o.ceiling_ft);
      const notesRaw = typeof o.notes === "string" ? o.notes.trim().slice(0, 400) : "";
      const suffix = "AI estimate from photos — verify with a tape measure.";
      const askSuffix =
        "Not sized from photos — add length × width (ft) when available, or verify with a tape measure.";
      const notes = needs_user_measurements
        ? notesRaw
          ? `${notesRaw}${notesRaw.endsWith(".") ? "" : "."} ${askSuffix}`
          : askSuffix
        : notesRaw && /verify|tape measure/i.test(notesRaw)
          ? `${notesRaw}${notesRaw.endsWith(".") ? "" : "."}`
          : notesRaw
            ? `${notesRaw}${notesRaw.endsWith(".") ? "" : "."} ${suffix}`
            : suffix;
      rooms.push({
        id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID(),
        label: label || "Room",
        length_ft,
        width_ft,
        ...(ceiling_ft != null ? { ceiling_ft } : {}),
        notes,
        ...(needs_user_measurements ? { needs_user_measurements: true } : {}),
      });
    }
  }

  const kind = projectKind.trim().toLowerCase();
  const scopeLooksBath = /\bbath(room)?\b/i.test(scopeDescription) || /\bshower\b/i.test(scopeDescription);
  const wantShowerRow = kind === "bathroom" || scopeLooksBath;
  if (wantShowerRow) {
    const hasShower = rooms.some((r) => /\bshower\b|\bwet\s*area\b/i.test(r.label));
    if (!hasShower) {
      rooms.push({
        id: randomUUID(),
        label: "Shower / wet area (replace)",
        length_ft: NOMINAL_SHOWER_ALCOVE_LENGTH_FT,
        width_ft: NOMINAL_SHOWER_ALCOVE_WIDTH_FT,
        notes:
          "No dedicated shower row from vision — added nominal ~5×2.5 ft (~60×30 in) typical alcove for planning; add a clearer shower photo or measure at curb.",
      });
    }
  }

  ensureShowerRowHasPlanningFootprint(rooms);

  return { rooms, analysisSummary: analysis_summary };
}
