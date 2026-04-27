/**
 * Contract tests: the mockup pipeline must always append layout / occlusion guards
 * so image models do not invent toilets, walls, or fixture positions when the
 * before photo is partial (e.g. toilet out of frame).
 *
 * These tests do not call OpenAI and do not judge rendered pixels — only the
 * final prompt string. For your bathroom sample image, place a copy under
 * e2e/fixtures/ for manual runs; automated tests do not require the file.
 */
import { expect, test } from "@playwright/test";
import {
  appendMockupLayoutFooter,
  buildImageEditPrompt,
  FIXTURE_OCCLUSION_AND_INFERENCE,
  IMAGE_EDIT_SPATIAL_LOCK,
  MOCKUP_IN_PLACE_EDIT_HEADER,
} from "../src/lib/ai/openai-bid";

const MUST_SUBSTRINGS = [
  "OFF-CAMERA & NO-INFERENCE",
  "The room photo defines what exists",
  "Do not infer hidden fixture locations",
  "If the photo does not show a toilet",
  "partition walls",
  "door knobs",
  "towel bars",
  "Do NOT add objects, furniture, decor",
  "TASK: Photorealistic edit",
] as const;

function assertMockupPromptContract(prompt: string) {
  for (const s of MUST_SUBSTRINGS) {
    expect(prompt, `prompt must include: ${s}`).toContain(s);
  }
  expect(prompt.split("OFF-CAMERA & NO-INFERENCE").length).toBe(2);
}

const bathroomVisionPartial =
  "Narrow bathroom; pedestal sink on left wall; small cabinet beside sink; walk-in shower with frosted door on right; window on back wall; baseboard heater. Toilet: NOT VISIBLE IN FRAME — do not infer position.";

test.describe("mockup image-edit prompt contract (5 remodel scenarios)", () => {
  test("1 — modern vanity + quartz (scope omits toilet)", () => {
    const p = buildImageEditPrompt({
      scopeDescription:
        "Install new floating vanity with quartz countertop and undermount sink. Paint walls soft gray. No toilet or shower work.",
      roomAnalysis: bathroomVisionPartial,
      remodelEditPrompt:
        "PERMITTED CHANGES ONLY: replace pedestal with floating vanity and quartz top; paint walls. UNCHANGED: shower, floor, window, room layout.",
    });
    assertMockupPromptContract(p);
  });

  test("2 — paint + vanity hardware only", () => {
    const p = buildImageEditPrompt({
      scopeDescription: "Repaint bathroom walls and ceiling. No fixture changes.",
      roomAnalysis: bathroomVisionPartial,
      remodelEditPrompt:
        "PERMITTED CHANGES ONLY: new wall/ceiling paint per notes. UNCHANGED: all fixtures, tile, layout.",
    });
    assertMockupPromptContract(p);
  });

  test("3 — lighting swap only (minimal change)", () => {
    const p = buildImageEditPrompt({
      scopeDescription: "Replace vanity light bar with two modern sconces. No plumbing.",
      roomAnalysis: bathroomVisionPartial,
      remodelEditPrompt:
        "PERMITTED CHANGES ONLY: vanity lighting per quote line. UNCHANGED: vanity, mirror, shower, toilet area (off-camera), layout.",
    });
    assertMockupPromptContract(p);
  });

  test("4 — shower door + floor (still partial photo)", () => {
    const p = buildImageEditPrompt({
      scopeDescription:
        "New framed glass shower door. Replace vinyl floor with LVP. No layout changes.",
      roomAnalysis: bathroomVisionPartial,
      remodelEditPrompt:
        "PERMITTED CHANGES ONLY: shower enclosure door; flooring. UNCHANGED: vanity zone unless noted, walls except where floor meets.",
    });
    assertMockupPromptContract(p);
  });

  test("5 — additional-instructions-only mode (regenerate note)", () => {
    const p = buildImageEditPrompt({
      scopeDescription: "(omitted in this mode)",
      roomAnalysis: "",
      remodelEditPrompt: "PERMITTED CHANGES ONLY: swap mirror for round frameless 30in. UNCHANGED: everything else.",
      additionalPrompt:
        "Only replace the oval mirror above the sink with a 30 inch round frameless mirror. Do not change vanity, paint, tile, or shower.",
      imageEditSource: "before",
    });
    assertMockupPromptContract(p);
  });

  test("7 — quote lines with refs include override (vanity/lighting/tile)", () => {
    const p = buildImageEditPrompt({
      scopeDescription: "Bathroom refresh per quote.",
      roomAnalysis: bathroomVisionPartial,
      remodelEditPrompt:
        "Apply mockup-enabled quote lines; preserve layout.",
      quoteLineContext:
        "1. Vanity 36in — white shaker [In-place only — ref(s) for style/finish (contractor uploaded reference photo): transform EXISTING fixture in place]",
      imageEditSource: "before",
    });
    assertMockupPromptContract(p);
    expect(p).toContain("QUOTE-DRIVEN LOOKS");
    expect(p).toContain("In-place only");
    expect(p).toContain(MOCKUP_IN_PLACE_EDIT_HEADER.slice(0, 40));
  });

  test("6 — additional notes must not drop mockup quote lines", () => {
    const quoteLineContext = [
      "1. Floating vanity 36in — white shaker [Use ref(s) ONLY for this line — contractor uploaded reference photo]",
      "2. Brushed nickel widespread faucet",
    ].join("\n");
    const p = buildImageEditPrompt({
      scopeDescription: "Vanity and faucet refresh.",
      roomAnalysis: bathroomVisionPartial,
      remodelEditPrompt: "PERMITTED CHANGES ONLY: swap vanity and faucet per quote lines. UNCHANGED: layout, tile, shower.",
      additionalPrompt: "Prefer the warmer wall paint from the sample in notes.",
      quoteLineContext,
      imageEditSource: "before",
    });
    assertMockupPromptContract(p);
    expect(p).toContain("Floating vanity 36in");
    expect(p).toContain("Mockup quote lines");
  });
});

test("appendMockupLayoutFooter is idempotent", () => {
  const once = appendMockupLayoutFooter(IMAGE_EDIT_SPATIAL_LOCK);
  expect(once).toContain(FIXTURE_OCCLUSION_AND_INFERENCE.slice(0, 40));
  const twice = appendMockupLayoutFooter(once);
  expect(twice).toBe(once);
});
