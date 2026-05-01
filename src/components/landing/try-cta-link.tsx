"use client";

import Link from "next/link";
import type { ComponentProps, PropsWithChildren } from "react";

import { trackTryCtaClick, type TryCtaPlacement } from "@/lib/analytics/try-cta";

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
