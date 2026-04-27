import { Buffer } from "node:buffer";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

export async function fetchUrlToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function bufferToImageDataUrl(buf: Buffer): string {
  const mime = sniffMime(buf);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function sniffMime(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  return "image/jpeg";
}

export type MockupVisionJudge = {
  /** True if image 3 is still clearly the same room / camera as image 1 (walls, openings, wet zone in same place). */
  layout_preserved: boolean;
  /** True if shower, tub, or wet enclosure appears relocated vs image 1 (bad for our contract). */
  shower_or_wet_area_moved: boolean;
  /** Whether the vanity zone in image 3 seems influenced by the cabinet reference (image 2). */
  vanity_shows_reference_influence: "yes" | "no" | "uncertain";
  /** One sentence for humans / CI logs. */
  summary: string;
};

function parseJudgeJson(raw: string): MockupVisionJudge | null {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  let o = tryParse(raw.trim());
  if (!o) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) o = tryParse(raw.slice(start, end + 1));
  }
  if (!o) return null;
  const layout_preserved = Boolean(o.layout_preserved);
  const shower_or_wet_area_moved = Boolean(o.shower_or_wet_area_moved);
  const inf = o.vanity_shows_reference_influence;
  const vanity_shows_reference_influence =
    inf === "yes" || inf === "no" || inf === "uncertain" ? inf : "uncertain";
  const summary = typeof o.summary === "string" ? o.summary.slice(0, 500) : "";
  return {
    layout_preserved,
    shower_or_wet_area_moved,
    vanity_shows_reference_influence,
    summary,
  };
}

/**
 * Uses OpenAI vision (chat) to compare before / product ref / after mockup.
 * Intended for optional Playwright pipeline checks when `OPENAI_API_KEY` is set.
 */
export async function judgeMockupTripleOpenAI(params: {
  apiKey: string;
  beforeBytes: Buffer;
  productRefBytes: Buffer;
  afterBytes: Buffer;
  /** Default gpt-4o-mini — cheap; override with E2E_MOCKUP_JUDGE_MODEL */
  model?: string;
}): Promise<MockupVisionJudge> {
  const model =
    params.model?.trim() ||
    process.env.E2E_MOCKUP_JUDGE_MODEL?.trim() ||
    "gpt-4o-mini";
  const u1 = bufferToImageDataUrl(params.beforeBytes);
  const u2 = bufferToImageDataUrl(params.productRefBytes);
  const u3 = bufferToImageDataUrl(params.afterBytes);

  const instructions = [
    "You are a QA reviewer for bathroom remodel mockups.",
    "You will see THREE images in order:",
    "1) BEFORE — original jobsite bathroom photo.",
    "2) PRODUCT REFERENCE — catalog / shelf photo of a vanity or cabinet the contractor wants (style/finish reference).",
    "3) AFTER — model output that should edit ONLY finishes in the same room, especially the vanity zone, using image 2 as a style guide.",
    "",
    "Answer strictly as JSON with keys:",
    '- "layout_preserved" (boolean): same room geometry, walls, door/window openings, and camera viewpoint as image 1.',
    '- "shower_or_wet_area_moved" (boolean): true if tub/shower/glass enclosure/wet wall layout clearly moved, shrank, or swapped vs image 1.',
    '- "vanity_shows_reference_influence" (string): one of "yes", "no", "uncertain" — does the vanity/cabinet area in image 3 look more like the cabinet style in image 2 than image 1 did?',
    '- "summary" (string): one short sentence explaining your choice.',
    "Return JSON only, no markdown fences.",
  ].join("\n");

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instructions },
            { type: "image_url", image_url: { url: u1, detail: "low" } },
            { type: "image_url", image_url: { url: u2, detail: "low" } },
            { type: "image_url", image_url: { url: u3, detail: "low" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI chat ${res.status}: ${err.slice(0, 600)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJudgeJson(text);
  if (!parsed) {
    throw new Error(`Could not parse judge JSON from model: ${text.slice(0, 400)}`);
  }
  return parsed;
}
