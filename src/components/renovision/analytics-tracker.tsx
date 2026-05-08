"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { endPageView, initAnalytics, teardownAnalytics, trackEvent, trackPageView } from "@/lib/analytics/renovision-analytics";

const LANDING_VIEWED_SESSION_KEY = "renovision_analytics_landing_viewed";
const SESSION_FIRST_PATH_KEY = "renovision_analytics_session_first_path";

export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRouteRef = useRef<string>("");
  const lastTrackedPageViewRouteRef = useRef<string>("");
  const trackingActiveRef = useRef(false);

  const trackRouteEntry = async (route: string, pathOnly: string) => {
    // Dedupe route-entry events on re-renders/strict mode.
    if (lastTrackedPageViewRouteRef.current === route) return;
    lastTrackedPageViewRouteRef.current = route;
    await trackPageView();

    // Record first tracked page for this browser session.
    const existingFirstPath = typeof window !== "undefined" ? sessionStorage.getItem(SESSION_FIRST_PATH_KEY) : null;
    const firstPath = existingFirstPath ?? pathOnly;
    if (!existingFirstPath && typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_FIRST_PATH_KEY, firstPath);
    }

    // Landing event should only be emitted when "/" is the first page in this session,
    // and only once for the session.
    if (pathOnly === "/" && typeof window !== "undefined") {
      const alreadyTracked = sessionStorage.getItem(LANDING_VIEWED_SESSION_KEY);
      const isSessionFirstPage = firstPath === "/";
      if (!alreadyTracked && isSessionFirstPage) {
        sessionStorage.setItem(LANDING_VIEWED_SESSION_KEY, "1");
        await trackEvent("landing_page_viewed", {
          first_page: true,
          session_landing: true,
        });
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!trackingActiveRef.current) {
      initAnalytics();
      trackingActiveRef.current = true;
    }

    const qs = searchParams?.toString() ?? "";
    const pathOnly = pathname ?? "";
    const route = qs ? `${pathOnly}?${qs}` : pathOnly;

    if (!currentRouteRef.current) {
      currentRouteRef.current = route;
      void trackRouteEntry(route, pathOnly);
      return;
    }

    if (currentRouteRef.current === route) return;

    const prev = currentRouteRef.current;
    currentRouteRef.current = route;
    void endPageView().finally(() => {
      if (currentRouteRef.current !== prev) {
        void trackRouteEntry(route, pathOnly);
      }
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    return () => {
      teardownAnalytics();
    };
  }, []);

  return null;
}
