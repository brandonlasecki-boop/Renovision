import "server-only";

/**
 * Writes `GCP_SERVICE_ACCOUNT_JSON` to a temp file and sets `GOOGLE_APPLICATION_CREDENTIALS`
 * so Vertex / google-auth-library can use ADC-style auth on hosts without `gcloud` (e.g. Vercel).
 *
 * Safe to call multiple times. No-op if `GOOGLE_APPLICATION_CREDENTIALS` is already set or JSON env is absent.
 * Also invoked from `instrumentation-bootstrap-gcp-sa.ts` at process startup.
 *
 * **No top-level Node built-in imports:** Webpack may parse this file for the client graph;
 * static node-colon-fs style imports cause UnhandledSchemeError. Built-ins load in the function
 * body via dynamic import with webpackIgnore (see implementation).
 */
export async function applyGcpServiceAccountJsonFromEnvIfNeededAsync(): Promise<void> {
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

  const [{ writeFileSync }, { join }, { tmpdir }] = await Promise.all([
    import(/* webpackIgnore: true */ "node:fs"),
    import(/* webpackIgnore: true */ "node:path"),
    import(/* webpackIgnore: true */ "node:os"),
  ]);

  const credentialsPath = join(tmpdir(), "renovision-gcp-sa.json");
  try {
    writeFileSync(credentialsPath, raw, { encoding: "utf8", mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  } catch (err) {
    console.error("[gcp-bootstrap] Failed to write GCP service account JSON:", err);
  }
}
