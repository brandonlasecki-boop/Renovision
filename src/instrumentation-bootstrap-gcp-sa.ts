import { applyGcpServiceAccountJsonFromEnvIfNeeded } from "@/lib/integrations/gcp-service-account-json-bootstrap";

/**
 * Node-only entry from `instrumentation.ts` when `NEXT_RUNTIME === 'nodejs'`
 * so Edge bundles never see `node:fs` / `node:path` / `node:os`.
 */
export function registerGcpServiceAccountJsonFromEnv(): void {
  applyGcpServiceAccountJsonFromEnvIfNeeded();
}
