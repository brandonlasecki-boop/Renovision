import { trackEvent } from "@/lib/analytics/google-ads";

/** Known placements for `try_cta_click` (extend as you add CTAs). */
export type TryCtaPlacement =
  | "landing_hero_primary"
  | "landing_header"
  | "landing_mobile_bar"
  | "landing_mockup_card"
  | "landing_footer"
  | "landing_final_cta"
  | "landing_why"
  | "landing_faq"
  | "landing_how_it_works"
  | "landing_testimonials"
  | "landing_real_transformations";

/** Fires a Google Ads `gtag` event before navigating to `/try`. */
export function trackTryCtaClick(placement: TryCtaPlacement, href?: string): void {
  trackEvent("try_cta_click", {
    placement,
    ...(href ? { link_href: href } : {}),
  });
  if (placement === "landing_hero_primary") {
    trackEvent("hero_cta_clicked");
  }
  if (placement === "landing_real_transformations") {
    trackEvent("examples_cta_clicked");
  }
}
