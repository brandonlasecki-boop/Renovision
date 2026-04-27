import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Node-only: writes `GCP_SERVICE_ACCOUNT_JSON` to a temp file for ADC.
 * Loaded only from `instrumentation.ts` when `NEXT_RUNTIME === 'nodejs'`
 * so Edge bundles never see `node:fs` / `node:path` / `node:os`.
 */
export function registerGcpServiceAccountJsonFromEnv(): void {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return;
  }

  try {
    JSON.parse(raw);
  } catch {
    console.error(
      "[instrumentation] GCP_SERVICE_ACCOUNT_JSON is set but is not valid JSON — skipping file bootstrap.",
    );
    return;
  }

  const path = join(tmpdir(), "renovision-gcp-sa.json");
  try {
    writeFileSync(path, raw, { encoding: "utf8", mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
  } catch (err) {
    console.error("[instrumentation] Failed to write GCP service account JSON:", err);
  }
}
