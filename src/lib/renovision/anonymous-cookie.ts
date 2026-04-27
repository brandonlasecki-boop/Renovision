import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { RENOVISION_ANON_COOKIE_NAME } from "@/lib/renovision/usage-constants";

const ANON_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;

export async function getOrCreateRenovisionAnonymousSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(RENOVISION_ANON_COOKIE_NAME)?.value?.trim();
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (raw && uuidRe.test(raw)) {
    return raw.toLowerCase();
  }

  const id = randomUUID();
  cookieStore.set(RENOVISION_ANON_COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANON_COOKIE_MAX_AGE_SEC,
  });
  return id;
}

export async function getRenovisionAnonymousSessionIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(RENOVISION_ANON_COOKIE_NAME)?.value?.trim();
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!raw || !uuidRe.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
}
