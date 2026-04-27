/**
 * Scope pipeline smoke tests — deterministic checks (no live OpenAI).
 * Run: npx vitest run src/lib/scope-smoke.test.ts
 * Loop until 10 consecutive passes: npm run test:scope:smoke
 */
import { describe, expect, it } from "vitest";
import type { BidMaterialLine } from "@/types/bid";
import { buildCompositeScopeDescription } from "@/lib/bid-scope";
import { ensureContractorStatedScopeCoverage } from "@/lib/scope-contractor-coverage";

function lineBlob(lines: BidMaterialLine[]): string {
  return lines.map((l) => `${l.name} ${l.notes ?? ""}`).join(" | ");
}

function assertTokensInOutput(
  scope: string,
  questionnaire: unknown | undefined,
  emptyAiLines: BidMaterialLine[],
  tokensMustAppear: RegExp[],
) {
  const out = ensureContractorStatedScopeCoverage(
    { scope_description: scope, project_questionnaire: questionnaire },
    emptyAiLines,
  );
  const blob = lineBlob(out).toLowerCase();
  expect(out.length).toBeGreaterThan(0);
  for (const re of tokensMustAppear) {
    expect(blob).toMatch(re);
  }
}

describe("scope smoke — 10 scenarios (contractor text → line coverage)", () => {
  it("01 — Hall bath: vanity + faucet swap, no shower", () => {
    assertTokensInOutput(
      `Bathroom refresh for the Smiths. They want to swap out the old vanity for something with drawers and put in a new faucet — brushed nickel if we can match the hardware. No shower work on this phase.`,
      undefined,
      [],
      [/\bvanity\b/, /\bfaucet\b/],
    );
  });

  it("02 — Kitchen: cabinets + quartz, leave floors", () => {
    assertTokensInOutput(
      `Kitchen update: new cabinets along the sink wall and quartz counters. Customer asked to leave the existing wood floors alone — just protect them during install.`,
      undefined,
      [],
      [/\bcabinets?\b|\bcabinetry\b/, /\bquartz\b|\bcountertop\b/],
    );
  });

  it("03 — Tub out, walk-in shower, tile to ceiling", () => {
    assertTokensInOutput(
      `Rip the old tub out and do a walk-in shower with tile to the ceiling. Curbless if code allows in our county.`,
      undefined,
      [],
      [/\bshower\b/, /\btub\b/, /\btile\b/],
    );
  });

  it("04 — Powder room cosmetic: paint, mirror, sconces", () => {
    assertTokensInOutput(
      `Small powder room — fresh paint, bigger mirror, new sconces. No moving plumbing.`,
      undefined,
      [],
      [/\bmirror\b/, /\bpaint\b/, /\blighting\b|\bsconce/],
    );
  });

  it("05 — Full gut main bath: toilet, tub, vanity, tile", () => {
    assertTokensInOutput(
      `Full gut on the main bath: new toilet, tub, vanity, floor tile, wall tile, the works. Customer knows it’ll be a few weeks.`,
      undefined,
      [],
      [/\bvanity\b/, /\btoilet\b/, /\btub\b/, /\btile\b/, /\bgut\b|\bdemolition\b/],
    );
  });

  it("06 — Kitchen backsplash + under-cabinet lighting", () => {
    assertTokensInOutput(
      `Kitchen tweak: new subway backsplash and under-cabinet lighting; counters stay.`,
      undefined,
      [],
      [/\bbacksplash\b/, /\blighting\b/],
    );
  });

  it("07 — Whole-home LVP flooring (main level)", () => {
    assertTokensInOutput(
      `Customer wants new LVP flooring throughout the main level — living, halls, and kitchen open area. Remove existing laminate first.`,
      undefined,
      [],
      [/\bflooring\b|\bfloors?\b/],
    );
  });

  it("08 — Medicine cabinet + mirror in guest bath", () => {
    assertTokensInOutput(
      `Guest bath: replace the medicine cabinet and put in a wider mirror above the sink. Keep the toilet.`,
      undefined,
      [],
      [/\bmedicine\s+cabinet\b/, /\bmirror\b/, /\btoilet\b/],
    );
  });

  it("09 — Demolition down to studs + rough plumbing", () => {
    assertTokensInOutput(
      `Demolition of the existing bathroom down to studs; we’ll keep rough plumbing locations if they pass inspection.`,
      undefined,
      [],
      [/\bdemolition\b|\bgut\b/],
    );
  });

  it("10 — Thin scope + Q&A still surfaces vanity", () => {
    const pq = [
      {
        question_id: "scope_detail",
        question: "What is the homeowner replacing first?",
        answer: "The vanity and sink combo",
        options: [{ option_id: "a", label: "The vanity and sink combo" }],
        selected_option_id: "a",
      },
    ];
    assertTokensInOutput("Bathroom remodel — details in questionnaire.", pq, [], [/\bvanity\b/]);
  });
});

describe("scope smoke — composite string fed to AI (verbatim + context)", () => {
  it("preserves contractor scope text and labels sections", () => {
    const composite = buildCompositeScopeDescription({
      scope_description: "Replace the vanity and faucet only — customer is keeping the tub.",
      project_kind: "Bathroom",
      walkthrough_transcript: "",
      room_measurements: [
        { id: "rm1", label: "Main bath", length_ft: 9, width_ft: 6, ceiling_ft: 8 },
      ],
      project_questionnaire: [
        {
          question_id: "vent",
          question: "Exhaust fan?",
          answer: "Yes, new fan",
          options: [{ option_id: "y", label: "Yes, new fan" }],
          selected_option_id: "y",
        },
      ],
    });

    expect(composite).toContain("Replace the vanity and faucet only");
    expect(composite).toContain("Contractor-stated scope");
    expect(composite).toContain("Project type (contractor-selected): Bathroom");
    expect(composite).toContain("Room measurements");
    expect(composite).toContain("Main bath");
    expect(composite).toContain("Project follow-up answers");
    expect(composite).toMatch(/vanity|faucet/i);
  });

  it("does not drop Q&A answers from composite", () => {
    const c = buildCompositeScopeDescription({
      scope_description: "Kitchen refresh.",
      project_questionnaire: [
        {
          question_id: "cabinets",
          question: "Cabinets?",
          answer: "Paint existing boxes, new doors",
          options: [{ option_id: "a", label: "Paint existing boxes, new doors" }],
          selected_option_id: "a",
        },
      ],
    });
    expect(c).toContain("Paint existing boxes, new doors");
    expect(c).toContain("Kitchen refresh");
  });
});

describe("scope smoke — edge cases", () => {
  it("does not duplicate vanity line when AI already named vanity", () => {
    const scope = "Replace vanity and faucet in hall bath.";
    const aiLines: BidMaterialLine[] = [
      {
        line_id: "1",
        name: "Supply and install new vanity cabinet and top",
        quantity: 1,
        unit: "ea",
        unit_price_usd: 0,
        extended_usd: 0,
        mockup_include: false,
        trade: "cabinetry",
      },
    ];
    const out = ensureContractorStatedScopeCoverage({ scope_description: scope }, aiLines);
    expect(out.filter((l) => /\bvanity\b/i.test(l.name)).length).toBe(1);
  });
});
