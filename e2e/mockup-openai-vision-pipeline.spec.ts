/**
 * Optional end-to-end pipeline check (OpenAI credits + ~30–90s runtime):
 * 1) Download a real bathroom “before” JPEG + a vanity/cabinet reference JPEG (Unsplash, stable IDs).
 * 2) Call the same OpenAI **images/edits** path the app uses (`fetchRoomRemodelImageEdit`) with a
 *    `buildImageEditPrompt` string (layout locks + quote line + reference summary).
 * 3) Ask **OpenAI vision** (chat + images) to judge whether the wet area stayed put and the vanity
 *    picked up reference influence.
 *
 * Run locally:
 *   npx playwright test e2e/mockup-openai-vision-pipeline.spec.ts
 *
 * Requires `OPENAI_API_KEY` in the environment or in `.env.local` (loaded automatically).
 * Skip in CI without secrets: omit the key, or set `E2E_OPENAI_MOCKUP_PIPELINE=0`.
 *
 * Optional: `OPENAI_IMAGE_EDIT_MODEL` (default gpt-image-1), `E2E_MOCKUP_JUDGE_MODEL` (default gpt-4o-mini).
 */
import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";
import { buildImageEditPrompt, fetchRoomRemodelImageEdit } from "../src/lib/ai/openai-bid";
import { loadEnvLocalOptional } from "./helpers/load-env-local";
import {
  fetchUrlToBuffer,
  judgeMockupTripleOpenAI,
} from "./helpers/mockup-vision-openai";

/** Stable Unsplash/imgix JPEGs (avoid Wikimedia thumbs — often 429 from datacenters). */
const FIXTURE_ROOM_JPEG =
  "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1024&q=85";
/** Bathroom interior with visible vanity/cabinet detail (Unsplash/imgix — verified 200). */
const FIXTURE_VANITY_REF_JPEG =
  "https://images.unsplash.com/photo-1620626011761-996317b8d101?w=640&q=85";

const runPipeline = process.env.E2E_OPENAI_MOCKUP_PIPELINE !== "0";

test.describe.configure({ mode: "serial", timeout: 180_000, retries: 1 });

test.describe("mockup pipeline — OpenAI image edit + vision judge", () => {
  test.beforeAll(() => {
    loadEnvLocalOptional();
  });

  test("vision judge sanity: identical before/after → layout preserved, wet area not moved", async () => {
    test.skip(!runPipeline, "Set E2E_OPENAI_MOCKUP_PIPELINE=0 skips; otherwise needs OPENAI_API_KEY");
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    test.skip(!apiKey, "OPENAI_API_KEY not set — skip expensive OpenAI tests");

    const buf = await fetchUrlToBuffer(FIXTURE_ROOM_JPEG);
    const judge = await judgeMockupTripleOpenAI({
      apiKey,
      beforeBytes: buf,
      productRefBytes: buf,
      afterBytes: Buffer.from(buf),
    });
    expect(judge.layout_preserved, judge.summary).toBe(true);
    expect(judge.shower_or_wet_area_moved, judge.summary).toBe(false);
  });

  test("image edit + vision: bathroom before + vanity ref → layout preserved, wet area not moved", async () => {
    test.skip(!runPipeline, "Set E2E_OPENAI_MOCKUP_PIPELINE=0 skips; otherwise needs OPENAI_API_KEY");
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    test.skip(!apiKey, "OPENAI_API_KEY not set — skip expensive OpenAI tests");

    const [beforeBytes, productRefBytes] = await Promise.all([
      fetchUrlToBuffer(FIXTURE_ROOM_JPEG),
      fetchUrlToBuffer(FIXTURE_VANITY_REF_JPEG),
    ]);

    const editPrompt = buildImageEditPrompt({
      scopeDescription:
        "Bathroom refresh: update the existing vanity cabinet toward a white shaker-style finish and simple bar hardware. No shower, tub, toilet, or wall layout changes.",
      roomAnalysis:
        "Residential bathroom photo; preserve tub/shower and all partition walls exactly as framed.",
      remodelEditPrompt:
        "PERMITTED CHANGES ONLY: vanity cabinet finishes (doors, drawers, toe kick, hardware) per quote. UNCHANGED: shower/tub/glass enclosure, toilet position (if visible), floor tile field, wall layout, camera.",
      quoteLineContext:
        "1. Vanity 36in — white shaker cabinet [In-place only — ref(s) for style/finish (product reference image): transform the EXISTING vanity in this photo where it already is—do NOT add another vanity. Match white shaker door style and hardware from the reference on all visible cabinet surfaces including toe kick.]",
      referenceVisualSummary:
        "The attached product-style reference shows a light painted shaker vanity with simple hardware — transfer that cabinet door character, color family, and hardware onto the existing vanity footprint only.",
      imageEditSource: "before",
    });

    const model = process.env.OPENAI_IMAGE_EDIT_MODEL?.trim();
    const afterAb = await fetchRoomRemodelImageEdit({
      apiKey,
      imageBytes: beforeBytes.buffer.slice(
        beforeBytes.byteOffset,
        beforeBytes.byteOffset + beforeBytes.byteLength,
      ) as ArrayBuffer,
      contentType: "image/jpeg",
      editPrompt,
      ...(model ? { model } : {}),
    });
    const afterBytes = Buffer.from(afterAb);

    const judge = await judgeMockupTripleOpenAI({
      apiKey,
      beforeBytes,
      productRefBytes,
      afterBytes,
    });

    // Log for local troubleshooting when assertions fail.
    // eslint-disable-next-line no-console -- intentional e2e diagnostics
    console.log("[mockup vision judge]", judge);

    expect(
      judge.layout_preserved,
      `layout_preserved expected true — ${judge.summary}`,
    ).toBe(true);
    expect(
      judge.shower_or_wet_area_moved,
      `wet area should stay — ${judge.summary}`,
    ).toBe(false);
    expect(
      ["yes", "uncertain"].includes(judge.vanity_shows_reference_influence),
      `vanity should show some reference influence (yes|uncertain), got ${judge.vanity_shows_reference_influence}: ${judge.summary}`,
    ).toBe(true);
  });
});
