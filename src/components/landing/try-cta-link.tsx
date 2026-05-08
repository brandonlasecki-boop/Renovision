"use client";

import Link from "next/link";
import type { ComponentProps, PropsWithChildren } from "react";

import { trackTryCtaClick, type TryCtaPlacement } from "@/lib/analytics/try-cta";
import { trackEvent as trackAnalyticsEvent } from "@/lib/analytics/renovision-analytics";

/** Primary CTAs: dedicated upload entry (fresh flow; no auto-restore of last generation). */
export const TRY_FLOW_UPLOAD_HREF = "/upload";

type BaseLinkProps = ComponentProps<typeof Link>;

type Props = PropsWithChildren<
  Omit<BaseLinkProps, "onClick"> & {
    placement: TryCtaPlacement;
    onClick?: BaseLinkProps["onClick"];
  }
>;

export function TryCtaLink({ placement, href, onClick, ...rest }: Props) {
  const hrefStr = typeof href === "string" ? href : undefined;
  return (
    <Link
      {...rest}
      href={href}
      data-analytics-id={rest["data-analytics-id"] ?? "upload-cta"}
      onClick={(e) => {
        trackTryCtaClick(placement, hrefStr);
        if (placement === "landing_hero_primary") {
          void trackAnalyticsEvent("hero_cta_clicked", {
            placement,
            href: hrefStr ?? null,
          });
        }
        onClick?.(e);
      }}
    />
  );
}
