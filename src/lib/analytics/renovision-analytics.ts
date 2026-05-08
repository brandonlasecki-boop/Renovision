"use client";

import { createClient } from "@/lib/supabase/client";

const SESSION_STORAGE_KEY = "renovision_analytics_session_id";
const PAGE_VIEW_ID_KEY = "renovision_analytics_page_view_id";
const PAGE_START_TS_KEY = "renovision_analytics_page_start_ts";
const LAST_SCROLL_MILESTONE_KEY = "renovision_analytics_last_scroll_milestone";
const AD_LANDING_SYNC_KEY = "renovision_analytics_ad_landing_tracked";
const ANALYTICS_BOOTSTRAPPED_SESSION_KEY = "renovision_analytics_bootstrapped";
const SCROLL_DEBOUNCE_MS = 200;
const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

type JsonObject = Record<string, unknown>;

let initialized = false;
let scrollTimeoutId: number | null = null;
let removeListeners: (() => void) | null = null;
const scrollEventsSent = new Set<number>();
let activePageViewId: string | null = null;
let activePagePath: string | null = null;

function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

function devLog(message: string, error?: unknown): void {
  if (!isDev()) return;
  if (error) {
    console.info(`[renovision-analytics] ${message}`, error);
    return;
  }
  console.info(`[renovision-analytics] ${message}`);
}

function safeStorageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function getCurrentPath(): string {
  if (typeof window === "undefined") return "/";
  const { pathname, search } = window.location;
  return `${pathname}${search}`;
}

function isAdminPath(path: string): boolean {
  return path.startsWith("/admin");
}

function getSessionType(path: string): "admin" | "customer" {
  return isAdminPath(path) ? "admin" : "customer";
}

function getCurrentHost(): string {
  if (typeof window === "undefined") return "";
  return (window.location.hostname || "").toLowerCase();
}

function isLocalhostHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isLocalRuntime(): boolean {
  return isLocalhostHost(getCurrentHost());
}

function getUtmParams(): JsonObject {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") ?? undefined,
    utm_medium: params.get("utm_medium") ?? undefined,
    utm_campaign: params.get("utm_campaign") ?? undefined,
  };
}

function parseHostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeSource(input: {
  utmSource?: string | null;
  referrer?: string | null;
  currentHost: string;
}): { normalizedSource: string; normalizedReferrer: string | null } {
  const utm = (input.utmSource ?? "").trim().toLowerCase();
  if (utm) {
    return { normalizedSource: utm, normalizedReferrer: parseHostFromUrl(input.referrer) };
  }

  const referrerHost = parseHostFromUrl(input.referrer);
  if (!referrerHost) {
    return { normalizedSource: "direct", normalizedReferrer: null };
  }
  if (isLocalhostHost(referrerHost)) {
    return { normalizedSource: "local_dev", normalizedReferrer: referrerHost };
  }
  if (referrerHost === input.currentHost) {
    return { normalizedSource: "internal", normalizedReferrer: referrerHost };
  }
  return { normalizedSource: referrerHost, normalizedReferrer: referrerHost };
}

function hasGoogleClickParams(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const gclid = params.get("gclid");
  const utmSource = (params.get("utm_source") ?? "").toLowerCase();
  return Boolean(gclid) || utmSource === "google";
}

function detectDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const ua = window.navigator.userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) return "mobile";
  return "desktop";
}

function detectBrowser(): string {
  if (typeof window === "undefined") return "unknown";
  const ua = window.navigator.userAgent;
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  if (ua.includes("Firefox/")) return "Firefox";
  return "unknown";
}

function detectOS(): string {
  if (typeof window === "undefined") return "unknown";
  const ua = window.navigator.userAgent;
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod")) return "iOS";
  if (ua.includes("Linux")) return "Linux";
  return "unknown";
}

async function safeInsert(table: "analytics_sessions" | "analytics_events" | "analytics_page_views", payload: JsonObject): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from(table).insert(payload);
    if (error) devLog(`insert into ${table} failed`, error);
  } catch (error) {
    devLog(`insert into ${table} failed`, error);
  }
}

async function safeInsertPageView(payload: JsonObject): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("analytics_page_views").insert(payload);
    if (error) {
      devLog("insert into analytics_page_views failed", error);
      return false;
    }
    return true;
  } catch (error) {
    devLog("insert into analytics_page_views failed", error);
    return false;
  }
}

async function safeUpdatePageView(pageViewId: string, payload: JsonObject): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("analytics_page_views").update(payload).eq("id", pageViewId);
    if (error) devLog("update analytics_page_views failed", error);
  } catch (error) {
    devLog("update analytics_page_views failed", error);
  }
}

async function safeIncrementPageViewClickCount(pageViewId: string): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("analytics_page_view_increment_click_count", {
      p_page_view_id: pageViewId,
    });
    if (error) devLog("increment analytics_page_views click_count failed", error);
  } catch (error) {
    devLog("increment analytics_page_views click_count failed", error);
  }
}

async function safeUpsertSession(payload: JsonObject): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("analytics_sessions").upsert(payload, { onConflict: "session_id" });
    if (error) devLog("upsert analytics_sessions failed", error);
  } catch (error) {
    devLog("upsert analytics_sessions failed", error);
  }
}

function setPageStart(nowMs: number): void {
  if (typeof sessionStorage === "undefined") return;
  safeStorageSet(sessionStorage, PAGE_START_TS_KEY, String(nowMs));
}

function getPageStart(): number {
  if (typeof sessionStorage === "undefined") return Date.now();
  const raw = safeStorageGet(sessionStorage, PAGE_START_TS_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function getLastScrollMilestone(): number {
  if (typeof sessionStorage === "undefined") return 0;
  const raw = safeStorageGet(sessionStorage, LAST_SCROLL_MILESTONE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function setLastScrollMilestone(value: number): void {
  if (typeof sessionStorage === "undefined") return;
  safeStorageSet(sessionStorage, LAST_SCROLL_MILESTONE_KEY, String(value));
}

function buildBaseEventMetadata(extra: JsonObject = {}): JsonObject {
  if (typeof window === "undefined") return extra;
  const sessionId = getSessionId();
  return {
    session_id: sessionId,
    current_host: getCurrentHost(),
    page_path: getCurrentPath(),
    referrer: document.referrer || null,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function calculateScrollPercent(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const doc = document.documentElement;
  const scrollTop = window.scrollY || doc.scrollTop || 0;
  const scrollHeight = doc.scrollHeight - doc.clientHeight;
  if (scrollHeight <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((scrollTop / scrollHeight) * 100)));
}

function getClickableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest("a, button, [role='button'], [data-analytics-click]");
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = safeStorageGet(localStorage, SESSION_STORAGE_KEY);
  if (existing) return existing;
  const nextId = crypto.randomUUID();
  safeStorageSet(localStorage, SESSION_STORAGE_KEY, nextId);
  return nextId;
}

export async function trackEvent(eventName: string, metadata: JsonObject = {}): Promise<void> {
  if (typeof window === "undefined") return;
  if (isLocalRuntime()) return;
  const pagePath = getCurrentPath();
  const sessionId = getSessionId();
  const utm = getUtmParams();
  const normalized = normalizeSource({
    utmSource: typeof utm.utm_source === "string" ? utm.utm_source : null,
    referrer: document.referrer || null,
    currentHost: getCurrentHost(),
  });
  const baseMetadata = buildBaseEventMetadata(metadata);
  await safeInsert("analytics_events", {
    session_id: sessionId,
    session_type: getSessionType(pagePath),
    normalized_source: normalized.normalizedSource,
    normalized_referrer: normalized.normalizedReferrer,
    event_name: eventName,
    page_path: pagePath,
    page_title: document.title || null,
    referrer: document.referrer || null,
    metadata: baseMetadata,
  });
}

export async function trackPageView(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isLocalRuntime()) return;
  const pagePath = getCurrentPath();
  const sessionId = getSessionId();
  const nowIso = new Date().toISOString();
  const utm = getUtmParams();
  const normalized = normalizeSource({
    utmSource: typeof utm.utm_source === "string" ? utm.utm_source : null,
    referrer: document.referrer || null,
    currentHost: getCurrentHost(),
  });

  setPageStart(Date.now());
  setLastScrollMilestone(0);
  scrollEventsSent.clear();

  const nextPageViewId = crypto.randomUUID();
  const inserted = await safeInsertPageView({
    id: nextPageViewId,
    session_id: sessionId,
    session_type: getSessionType(pagePath),
    normalized_source: normalized.normalizedSource,
    normalized_referrer: normalized.normalizedReferrer,
    page_path: pagePath,
    page_title: document.title || null,
    referrer: document.referrer || null,
    max_scroll_depth: 0,
    click_count: 0,
    metadata: { current_host: getCurrentHost() },
  });

  activePageViewId = inserted ? nextPageViewId : null;
  activePagePath = inserted ? pagePath : null;
  safeStorageSet(sessionStorage, PAGE_VIEW_ID_KEY, inserted ? nextPageViewId : "");

  await safeUpsertSession({
    session_id: sessionId,
    session_type: getSessionType(pagePath),
    normalized_source: normalized.normalizedSource,
    normalized_referrer: normalized.normalizedReferrer,
    created_at: nowIso,
    last_seen_at: nowIso,
    first_page: pagePath,
    last_page: pagePath,
    referrer: document.referrer || null,
  });

  await trackEvent("page_viewed");
}

export async function endPageView(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isLocalRuntime()) return;
  const pagePath = activePagePath ?? getCurrentPath();
  const pageViewId = activePageViewId;
  if (!pageViewId) return;
  activePageViewId = null;
  activePagePath = null;
  const sessionId = getSessionId();
  const nowMs = Date.now();
  const durationSeconds = Math.max(0, Math.floor((nowMs - getPageStart()) / 1000));
  const maxScrollDepth = getLastScrollMilestone();

  await trackEvent("page_exited", {
    ended_at: new Date(nowMs).toISOString(),
    time_on_page_seconds: durationSeconds,
    max_scroll_depth: maxScrollDepth,
  });

  await safeUpdatePageView(pageViewId, {
    ended_at: new Date(nowMs).toISOString(),
    duration_seconds: durationSeconds,
    max_scroll_depth: maxScrollDepth,
  });
}

export async function trackScrollDepth(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isLocalRuntime()) return;
  const percent = calculateScrollPercent();
  const lastMilestone = getLastScrollMilestone();

  for (const milestone of SCROLL_MILESTONES) {
    if (percent >= milestone && milestone > lastMilestone) {
      setLastScrollMilestone(milestone);
      if (!scrollEventsSent.has(milestone)) {
        scrollEventsSent.add(milestone);
        if (activePageViewId) {
          await safeUpdatePageView(activePageViewId, { max_scroll_depth: milestone });
        }
        await trackEvent(`scroll_${milestone}`, { scroll_depth: milestone });
      }
    }
  }
}

export async function trackClick(event: Event): Promise<void> {
  if (typeof window === "undefined") return;
  if (isLocalRuntime()) return;
  const element = getClickableElement(event.target);
  if (!element) return;

  const href = element instanceof HTMLAnchorElement ? element.href : undefined;
  let isOutbound = false;
  if (href) {
    try {
      isOutbound = new URL(href, window.location.origin).origin !== window.location.origin;
    } catch {
      isOutbound = false;
    }
  }
  const text = (element.textContent ?? "").trim().slice(0, 160);
  const elementId = element.id || element.getAttribute("data-testid") || null;
  const elementType = element.tagName.toLowerCase();

  const analyticsId = element.getAttribute("data-analytics-id") || null;
  const baseClickMeta = {
    element_id: elementId,
    element_type: elementType,
    analytics_id: analyticsId,
    href: href ?? null,
    is_outbound: isOutbound,
    element_text_preview: text ? text.slice(0, 80) : null,
  };

  if (element instanceof HTMLAnchorElement || href) {
    await trackEvent("link_clicked", baseClickMeta);
  } else {
    await trackEvent("button_clicked", baseClickMeta);
  }
  if (activePageViewId) {
    await safeIncrementPageViewClickCount(activePageViewId);
  }

  if (analyticsId === "upload-cta") await trackEvent("upload_cta_clicked", baseClickMeta);
}

function handleDebouncedScroll(): void {
  if (scrollTimeoutId) window.clearTimeout(scrollTimeoutId);
  scrollTimeoutId = window.setTimeout(() => {
    void trackScrollDepth();
  }, SCROLL_DEBOUNCE_MS);
}

function handleRouteChange(): void {
  void trackScrollDepth();
}

export function initAnalytics(): void {
  if (typeof window === "undefined" || initialized) return;
  if (isLocalRuntime()) return;
  initialized = true;
  const alreadyBootstrapped = safeStorageGet(sessionStorage, ANALYTICS_BOOTSTRAPPED_SESSION_KEY) === "1";

  const sessionId = getSessionId();
  const pagePath = getCurrentPath();
  const nowIso = new Date().toISOString();
  const utm = getUtmParams();

  if (!alreadyBootstrapped) {
    void safeUpsertSession({
      session_id: sessionId,
      session_type: getSessionType(pagePath),
      created_at: nowIso,
      last_seen_at: nowIso,
      first_page: pagePath,
      last_page: pagePath,
      referrer: document.referrer || null,
      utm_source: utm.utm_source ?? null,
      utm_medium: utm.utm_medium ?? null,
      utm_campaign: utm.utm_campaign ?? null,
      device_type: detectDeviceType(),
      browser: detectBrowser(),
      os: detectOS(),
      metadata: { current_host: getCurrentHost() },
    });

    if (hasGoogleClickParams()) {
      const alreadyTracked = safeStorageGet(sessionStorage, AD_LANDING_SYNC_KEY);
      if (!alreadyTracked) {
        safeStorageSet(sessionStorage, AD_LANDING_SYNC_KEY, "1");
        void trackEvent("ad_landing_click", {
          source: "google_ads",
        });
      }
    }
  }

  const onScroll = () => handleDebouncedScroll();
  const onClick = (event: Event) => {
    void trackClick(event);
  };
  const onPopState = () => handleRouteChange();
  const onPageHide = () => {
    void endPageView();
  };
  const onBeforeUnload = () => {
    void endPageView();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      void endPageView();
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick, { passive: true });
  window.addEventListener("popstate", onPopState);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("visibilitychange", onVisibilityChange);

  removeListeners = () => {
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("click", onClick);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };

  // Mark this browser session as analytics-bootstrapped to guard one-time side effects.
  if (typeof sessionStorage !== "undefined") {
    safeStorageSet(sessionStorage, ANALYTICS_BOOTSTRAPPED_SESSION_KEY, "1");
  }
}

export function teardownAnalytics(): void {
  if (!initialized) return;
  initialized = false;
  if (removeListeners) {
    removeListeners();
    removeListeners = null;
  }
  if (scrollTimeoutId) {
    window.clearTimeout(scrollTimeoutId);
    scrollTimeoutId = null;
  }
  activePageViewId = null;
  activePagePath = null;
}
