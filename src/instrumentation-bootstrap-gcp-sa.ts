import "server-only";

/**
 * Node-only entry from `instrumentation.ts` when `NEXT_RUNTIME === 'nodejs'`
 * so Edge bundles never see `node:fs` / `node:path` / `node:os`.
 */
export async function registerGcpServiceAccountJsonFromEnv(): Promise<void> {
  const { applyGcpServiceAccountJsonFromEnvIfNeededAsync } = await import(
    "@/lib/integrations/gcp-service-account-json-bootstrap"
  );
  await applyGcpServiceAccountJsonFromEnvIfNeededAsync();
}
