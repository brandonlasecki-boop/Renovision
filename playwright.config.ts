import { defineConfig } from "@playwright/test";

/**
 * Mostly **Node-side** checks (no browser): prompt contracts + optional OpenAI image/vision pipeline.
 *
 * - Default: `npx playwright test` (fast; no API spend)
 * - Optional spend: ensure `OPENAI_API_KEY` and run `npx playwright test e2e/mockup-openai-vision-pipeline.spec.ts`
 * - Disable expensive file in CI: `E2E_OPENAI_MOCKUP_PIPELINE=0`
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
});
