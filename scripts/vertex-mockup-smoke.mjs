/**
 * Minimal Vertex image-generation probe (same SDK path as app mockups).
 *
 * Usage (from repo root, after `npm install`):
 *   node scripts/vertex-mockup-smoke.mjs
 *
 * Loads `.env.local` if present. Requires:
 *   - GOOGLE_CLOUD_PROJECT
 *   - Application Default Credentials (e.g. `gcloud auth application-default login`)
 *
 * Optional: VERTEX_MOCKUP_IMAGE_MODEL, VERTEX_MOCKUP_IMAGE_LOCATION (default: global)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI, Modality } from "@google/genai";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const project = (process.env.GOOGLE_CLOUD_PROJECT ?? "").replace(/^\uFEFF/, "").trim();
const location = (process.env.VERTEX_MOCKUP_IMAGE_LOCATION ?? "global").trim() || "global";
const model =
  (process.env.VERTEX_MOCKUP_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview").trim();

if (!project) {
  console.error("Missing GOOGLE_CLOUD_PROJECT (set in .env.local or the shell).");
  process.exit(1);
}

/** 1×1 transparent PNG */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  console.log("Vertex smoke test", { project, location, model });
  const client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
  });
  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: PNG_1PX } },
            {
              text: "Edit this tiny placeholder image into a photorealistic close-up of a single white ceramic bathroom wall tile with soft grout lines. Output one square image only.",
            },
          ],
        },
      ],
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });
    const data = response.data;
    if (data) {
      console.log("OK: received aggregated image bytes (base64 length)", data.length);
      process.exit(0);
    }
    const parts = response.candidates?.[0]?.content?.parts;
    for (const part of parts ?? []) {
      if (part?.inlineData?.data) {
        console.log("OK: received image in candidate parts (base64 length)", part.inlineData.data.length);
        process.exit(0);
      }
    }
    console.error("No image in response.", {
      candidates: response.candidates?.length,
      finishReason: response.candidates?.[0]?.finishReason,
      promptFeedback: response.promptFeedback,
      text: response.text?.slice(0, 200),
    });
    process.exit(2);
  } catch (e) {
    console.error("Vertex call failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

void main();
