"use client";

import Link, { type LinkProps } from "next/link";

import { trackTryCtaClick, type TryCtaPlacement } from "@/lib/analytics/try-cta";

type Props = Omit<LinkProps, "onClick"> & {
  placement: TryCtaPlacement;
  onClick?: LinkProps["onClick"];
};

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
