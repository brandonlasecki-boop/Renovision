import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Vercel / other hosts have no `gcloud auth application-default login`.
 * If you set `GCP_SERVICE_ACCOUNT_JSON` to the **full service account JSON** (same as the key file
 * Google lets you download), we write it to a temp file and point `GOOGLE_APPLICATION_CREDENTIALS`
 * there so `@google/genai` + Vertex can use ADC-style auth.
 *
 * Do not set this in the browser — server-only. Prefer disabling SA keys in org policy + WIF when you can.
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
