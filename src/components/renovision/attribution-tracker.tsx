"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { parseAttributionParams, saveAttribution } from "@/lib/renovision/attribution";
import { captureRenovisionAttributionAction } from "@/lib/actions/homeowner-try";

const ATTRIBUTION_SYNC_KEY = "renovision_attribution_synced_key";

export function AttributionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const incoming = parseAttributionParams(url);
    const hasIncoming = Object.keys(incoming).length > 0;
    if (!hasIncoming) return;

    saveAttribution({
      ...incoming,
      landing_url: url,
      referrer: document.referrer || undefined,
    });

    const syncKey = JSON.stringify({
      src: incoming.src ?? incoming.source ?? "",
      campaign: incoming.campaign ?? "",
      video: incoming.video ?? incoming.v ?? "",
      platform: incoming.platform ?? "",
      path: window.location.pathname,
    });
    if (window.sessionStorage.getItem(ATTRIBUTION_SYNC_KEY) === syncKey) return;
    window.sessionStorage.setItem(ATTRIBUTION_SYNC_KEY, syncKey);

    void captureRenovisionAttributionAction({
      ...incoming,
      landing_url: url,
      referrer: document.referrer || undefined,
    });
  }, [pathname, searchParams]);

  return null;
}
