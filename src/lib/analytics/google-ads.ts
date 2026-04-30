export const GOOGLE_ADS_ID = "AW-18129926962";
export const GOOGLE_ADS_LEAD_CONVERSION_LABEL = "CONVERSION_LABEL_HERE";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function canTrackGoogleAds(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

export function trackGoogleAdsEvent(eventName: string, params?: Record<string, unknown>): void {
  if (!canTrackGoogleAds()) return;
  window.gtag?.("event", eventName, params ?? {});
}

export function trackGoogleAdsLeadConversion(): void {
  if (!canTrackGoogleAds()) return;
  window.gtag?.("event", "conversion", {
    send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_LEAD_CONVERSION_LABEL}`,
  });
}
