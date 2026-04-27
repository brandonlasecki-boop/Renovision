import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Writes `GCP_SERVICE_ACCOUNT_JSON` to a temp file and sets `GOOGLE_APPLICATION_CREDENTIALS`
 * so Vertex / google-auth-library can use ADC-style auth on hosts without `gcloud` (e.g. Vercel).
 *
 * Safe to call multiple times. No-op if `GOOGLE_APPLICATION_CREDENTIALS` is already set or JSON env is absent.
 * Also invoked from `instrumentation-bootstrap-gcp-sa.ts` at process startup.
 */
export function applyGcpServiceAccountJsonFromEnvIfNeeded(): void {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return;

  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return;

  try {
    JSON.parse(raw);
  } catch {
    console.error(
      "[gcp-bootstrap] GCP_SERVICE_ACCOUNT_JSON is set but is not valid JSON — check the Vercel env value.",
    );
    return;
  }

  const path = join(tmpdir(), "renovision-gcp-sa.json");
  try {
    writeFileSync(path, raw, { encoding: "utf8", mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
  } catch (err) {
    console.error("[gcp-bootstrap] Failed to write GCP service account JSON:", err);
  }
}
