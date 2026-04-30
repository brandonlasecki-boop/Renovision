export const GOOGLE_ADS_ID = "AW-18129926962";
const GOOGLE_ADS_LEAD_CONVERSION_SEND_TO =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_SEND_TO ??
  "AW-18129926962/REPLACE_WITH_REAL_LABEL";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function canTrackGoogleAds(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

export function trackEvent(eventName: string, params?: object): void {
  if (!canTrackGoogleAds()) return;
  window.gtag?.("event", eventName, params ?? {});
}

export function trackGoogleAdsLeadConversion(): void {
  if (!canTrackGoogleAds()) return;
  if (GOOGLE_ADS_LEAD_CONVERSION_SEND_TO.includes("REPLACE_WITH_REAL_LABEL")) {
    console.warn(
      "[google-ads] Lead conversion send_to is still a placeholder. Set NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_SEND_TO.",
    );
  }
  window.gtag?.("event", "conversion", {
    send_to: GOOGLE_ADS_LEAD_CONVERSION_SEND_TO,
    value: 1.0,
    currency: "USD",
  });
}
