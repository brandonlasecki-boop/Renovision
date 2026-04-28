import { headers } from "next/headers";

function cleanEnvOrigin(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeProdHost(host: string): string {
  const clean = host.trim().toLowerCase();
  if (clean === "getrenovision.com") return "www.getrenovision.com";
  return clean;
}

export async function resolveAppOrigin(): Promise<string> {
  const envOrigin = cleanEnvOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (envOrigin) return envOrigin;

  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const host = forwardedHost || h.get("host");
  const forwardedProto = h.get("x-forwarded-proto");
  const proto = forwardedProto || (process.env.NODE_ENV === "production" ? "https" : "http");
  if (host) return `${proto}://${normalizeProdHost(host)}`;

  return "http://localhost:3000";
}
