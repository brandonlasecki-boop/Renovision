export const GOOGLE_ADS_ID = "AW-18129926962";

/**
 * Google Ads → Submit lead form (1): conversion action label from Tag setup.
 * Override at build time with `NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_SEND_TO` if Google rotates the action.
 */
export const GOOGLE_ADS_LEAD_FORM_CONVERSION_SEND_TO_DEFAULT =
  "AW-18129926962/oEh0CMK9xqccELL2gsVD";

const GOOGLE_ADS_LEAD_CONVERSION_SEND_TO = (
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_SEND_TO ?? GOOGLE_ADS_LEAD_FORM_CONVERSION_SEND_TO_DEFAULT
).trim();

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function canTrackGoogleAds(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/** Google expects `AW-123456789/label` with no extra path segments. */
function isValidLeadConversionSendTo(sendTo: string): boolean {
  return Boolean(sendTo && /^AW-\d+\/[^/]+$/.test(sendTo));
}

export function trackEvent(eventName: string, params?: object): void {
  if (!canTrackGoogleAds()) return;
  window.gtag?.("event", eventName, params ?? {});
}

/**
 * Submit lead form (1) conversion — same payload as Google’s `gtag_report_conversion` snippet,
 * without redirect (`event_callback` only navigates when you pass a URL; static forms often omit it).
 * Trigger from client after the lead form succeeds (see homeowner try lead modal).
 */
export function trackGoogleAdsLeadConversion(redirectUrl?: string): void {
  const sendTo = GOOGLE_ADS_LEAD_CONVERSION_SEND_TO;
  if (!isValidLeadConversionSendTo(sendTo)) {
    console.warn(
      "[google-ads] Lead conversion not sent. Set NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_SEND_TO to a valid AW-…/… label (no quotes, no spaces), then rebuild/redeploy.",
    );
    return;
  }
  const fire = () => {
    if (!canTrackGoogleAds()) {
      console.warn("[google-ads] Lead conversion skipped: gtag is missing (script blocked or not loaded yet).");
      return;
    }
    window.gtag!("event", "conversion", {
      send_to: sendTo,
      value: 1.0,
      currency: "USD",
      event_callback: () => {
        if (typeof redirectUrl !== "undefined" && redirectUrl !== "") {
          window.location.assign(redirectUrl);
          return;
        }
        if (process.env.NODE_ENV === "development") {
          console.info("[google-ads] Lead conversion callback:", sendTo);
        }
      },
    });
  };
  window.setTimeout(fire, 0);
}
