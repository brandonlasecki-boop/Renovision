/**
 * Next loads this file for multiple runtimes. Do **not** import `node:fs` here —
 * Edge middleware bundling would pull it in and fail on Vercel.
 *
 * GCP service-account JSON bootstrap (Vercel): see `instrumentation-bootstrap-gcp-sa.ts`.
 * WIF (no keys): `src/lib/ai/vercel-wif-vertex-auth.ts` + https://vercel.com/docs/oidc/gcp
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerGcpServiceAccountJsonFromEnv } = await import(
    "./instrumentation-bootstrap-gcp-sa"
  );
  await registerGcpServiceAccountJsonFromEnv();
}
