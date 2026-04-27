import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Vercel / other hosts have no `gcloud auth application-default login`.
 * If org policy **blocks** SA keys, use Workload Identity Federation env vars instead (see
 * `src/lib/ai/vercel-wif-vertex-auth.ts` + https://vercel.com/docs/oidc/gcp ).
 *
 * If you **can** use a downloaded key JSON, set `GCP_SERVICE_ACCOUNT_JSON` to the full file contents;
 * we write it under the OS temp dir and set `GOOGLE_APPLICATION_CREDENTIALS` for ADC-style auth.
 * Server-only; never commit secrets.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
