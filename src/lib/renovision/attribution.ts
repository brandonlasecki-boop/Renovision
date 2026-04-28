export const RENOVISION_ATTRIBUTION_STORAGE_KEY = "renovision_attribution";

type AttributionKey = "src" | "source" | "campaign" | "video" | "v" | "platform";

const TRACKING_KEYS: AttributionKey[] = ["src", "source", "campaign", "video", "v", "platform"];
const MAX_VALUE_LEN = 120;

export type RenovisionAttribution = {
  src?: string;
  source?: string;
  campaign?: string;
  video?: string;
  v?: string;
  platform?: string;
  landing_url?: string;
  referrer?: string;
  first_seen_at?: string;
  last_seen_at?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function cleanValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_VALUE_LEN);
}

function cleanUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString().slice(0, 2000);
  } catch {
    return undefined;
  }
}

function pickTrackingKeys(input: Partial<RenovisionAttribution> | null | undefined): RenovisionAttribution {
  const out: RenovisionAttribution = {};
  if (!input) return out;
  for (const key of TRACKING_KEYS) {
    const value = cleanValue(input[key]);
    if (value) out[key] = value;
  }
  return out;
}

export function parseAttributionParams(urlLike: string): RenovisionAttribution {
  try {
    const parsed = new URL(urlLike, "https://renovision.local");
    const out: RenovisionAttribution = {};
    for (const key of TRACKING_KEYS) {
      const value = cleanValue(parsed.searchParams.get(key));
      if (value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function sanitizeAttribution(input: unknown): RenovisionAttribution | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<RenovisionAttribution>;
  const tracked = pickTrackingKeys(raw);
  const landingUrl = cleanUrl(raw.landing_url);
  const referrer = cleanUrl(raw.referrer);
  const firstSeenAt = typeof raw.first_seen_at === "string" ? raw.first_seen_at : undefined;
  const lastSeenAt = typeof raw.last_seen_at === "string" ? raw.last_seen_at : undefined;
  const hasTracking = TRACKING_KEYS.some((key) => Boolean(tracked[key]));
  if (!hasTracking && !landingUrl && !referrer) return null;
  return {
    ...tracked,
    ...(landingUrl ? { landing_url: landingUrl } : {}),
    ...(referrer ? { referrer } : {}),
    ...(firstSeenAt ? { first_seen_at: firstSeenAt } : {}),
    ...(lastSeenAt ? { last_seen_at: lastSeenAt } : {}),
  };
}

export function mergeAttribution(
  existing: RenovisionAttribution | null,
  incoming: RenovisionAttribution | null,
): RenovisionAttribution | null {
  const safeExisting = sanitizeAttribution(existing);
  const safeIncoming = sanitizeAttribution(incoming);
  if (!safeExisting && !safeIncoming) return null;

  const seenAt = nowIso();
  const merged: RenovisionAttribution = {
    ...(safeExisting ?? {}),
    ...(safeIncoming ?? {}),
  };

  merged.first_seen_at = safeExisting?.first_seen_at ?? safeIncoming?.first_seen_at ?? seenAt;
  merged.last_seen_at = seenAt;
  return merged;
}

export function getStoredAttribution(): RenovisionAttribution | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(RENOVISION_ATTRIBUTION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return sanitizeAttribution(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveAttribution(input: Partial<RenovisionAttribution>): RenovisionAttribution | null {
  if (typeof window === "undefined") return null;
  const existing = getStoredAttribution();
  const merged = mergeAttribution(existing, input as RenovisionAttribution);
  if (!merged) return existing;
  window.localStorage.setItem(RENOVISION_ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function attributionFromFormData(formData: FormData, key = "attribution_json"): RenovisionAttribution | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  try {
    return sanitizeAttribution(JSON.parse(raw));
  } catch {
    return null;
  }
}
