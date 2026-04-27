/**
 * Runs `vitest run` on scope smoke tests until 10 consecutive passes (exit 0).
 * Max 40 attempts to avoid infinite loops.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let consecutive = 0;
const target = 10;
const maxAttempts = 40;

for (let attempt = 0; attempt < maxAttempts && consecutive < target; attempt++) {
  const r = spawnSync(
    "npx",
    ["vitest", "run", "src/lib/scope-smoke.test.ts"],
    {
      cwd: root,
      stdio: "inherit",
      shell: true,
    },
  );
  if (r.status === 0) {
    consecutive++;
    console.log(`\n[scope-smoke] PASS ${consecutive}/${target} (attempt ${attempt + 1})\n`);
  } else {
    consecutive = 0;
    console.log(`\n[scope-smoke] FAIL — reset streak (attempt ${attempt + 1})\n`);
  }
}

process.exit(consecutive >= target ? 0 : 1);
