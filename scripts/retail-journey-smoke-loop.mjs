/**
 * Runs retail journey SerpApi integration tests until 5 consecutive passes.
 * Requires SERPAPI_API_KEY in the environment (e.g. `npm run retail:smoke:loop:local` loads `.env.local`).
 * Max 30 rounds.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = 5;
const maxRounds = 30;

if (!process.env.SERPAPI_API_KEY?.trim()) {
  console.error("Missing SERPAPI_API_KEY — set it (e.g. dotenv or export) before retail:smoke:loop.");
  process.exit(1);
}

let consecutive = 0;
for (let round = 0; round < maxRounds && consecutive < target; round++) {
  const vitestEntry = path.join(root, "node_modules", "vitest", "vitest.mjs");
  const r = spawnSync(process.execPath, [vitestEntry, "run", "src/lib/integrations/retail-journey-smoke.integration.test.ts"], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status === 0) {
    consecutive++;
    console.log(`\n[retail-smoke] PASS ${consecutive}/${target} (round ${round + 1})\n`);
  } else {
    consecutive = 0;
    console.log(`\n[retail-smoke] FAIL — reset streak (round ${round + 1})\n`);
  }
}

process.exit(consecutive >= target ? 0 : 1);
