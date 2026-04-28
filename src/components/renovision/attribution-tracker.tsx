"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { parseAttributionParams, saveAttribution } from "@/lib/renovision/attribution";

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
  }, [pathname, searchParams]);

  return null;
}
