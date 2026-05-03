"use client";

import Link from "next/link";
import type { ComponentProps, PropsWithChildren } from "react";

import { trackTryCtaClick, type TryCtaPlacement } from "@/lib/analytics/try-cta";

/** Primary CTAs: open the live try flow (style → upload), not a restored previous result. */
export const TRY_FLOW_UPLOAD_HREF = "/try?new=1";

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
      onClick={(e) => {
        trackTryCtaClick(placement, hrefStr);
        onClick?.(e);
      }}
    />
  );
}
