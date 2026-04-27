import type { GoogleAuthOptions } from "google-auth-library";

/**
 * Vercel → Vertex without service account **keys** (blocked by org policy `iam.disableServiceAccountKeyCreation`).
 *
 * Follow: https://vercel.com/docs/oidc/gcp
 *
 * Set these on Vercel (values from GCP after you create the pool + OIDC provider + SA impersonation):
 * - `GCP_PROJECT_NUMBER` — numeric project number (IAM & Admin → Settings)
 * - `GCP_WORKLOAD_IDENTITY_POOL_ID` — pool id
 * - `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` — OIDC provider id
 * - `GCP_SERVICE_ACCOUNT_EMAIL` — service account to impersonate (Vertex AI User), **no key**
 *
 * Optional (if the OIDC token must be scoped explicitly):
 * - `VERCEL_OIDC_PROJECT` — Vercel project id or slug for `getVercelOidcToken`
 * - `VERCEL_OIDC_TEAM` — Vercel team id or slug
 *
 * `GOOGLE_CLOUD_PROJECT` stays your **project id** string for the Vertex API path (same as local).
 */

const WIF_KEYS = [
  "GCP_PROJECT_NUMBER",
  "GCP_WORKLOAD_IDENTITY_POOL_ID",
  "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GCP_SERVICE_ACCOUNT_EMAIL",
] as const;

export function isVercelWorkloadIdentityVertexConfigured(): boolean {
  return WIF_KEYS.every((k) => Boolean(process.env[k]?.trim()));
}

let cached: Promise<GoogleAuthOptions | undefined> | undefined;

export function loadVercelWorkloadIdentityGoogleAuthOptions(): Promise<GoogleAuthOptions | undefined> {
  if (cached) return cached;
  cached = loadOnce();
  return cached;
}

async function loadOnce(): Promise<GoogleAuthOptions | undefined> {
  if (!isVercelWorkloadIdentityVertexConfigured()) {
    return undefined;
  }

  const projectNumber = process.env.GCP_PROJECT_NUMBER!.trim();
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID!.trim();
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID!.trim();
  const saEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL!.trim();

  const [{ ExternalAccountClient }, { getVercelOidcToken }] = await Promise.all([
    import("google-auth-library"),
    import("@vercel/oidc"),
  ]);

  const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  const service_account_impersonation_url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:generateAccessToken`;

  const oidcProject = process.env.VERCEL_OIDC_PROJECT?.trim();
  const oidcTeam = process.env.VERCEL_OIDC_TEAM?.trim();

  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url,
    subject_token_supplier: {
      getSubjectToken: async () =>
        getVercelOidcToken({
          ...(oidcProject ? { project: oidcProject } : {}),
          ...(oidcTeam ? { team: oidcTeam } : {}),
        }),
    },
  });

  if (!authClient) {
    throw new Error(
      "Workload Identity: google-auth-library could not build an external account client from the current WIF env. Check pool/provider ids and google-auth-library version.",
    );
  }

  return { authClient };
}
