import Image from "next/image";

import { cn } from "@/lib/utils";

import logoMark from "../../../Images/logo_trans1.png";

type RenovisionLogoProps = {
  className?: string;
  /** Smaller mark for compact headers */
  compact?: boolean;
  /**
   * Marketing header: readable logo on the left on phones, scales up from `md` (pair with a
   * relatively positioned parent link that sets width on desktop).
   */
  preset?: "default" | "header";
};

export function RenovisionLogo({ className, compact, preset = "default" }: RenovisionLogoProps) {
  const isHeader = preset === "header";

  const boxClass = isHeader
    ? "relative h-12 w-[188px] shrink-0 object-left md:absolute md:left-0 md:top-1/2 md:h-[4.75rem] md:w-[min(100%,420px)] md:-translate-y-1/2 lg:h-[5rem] lg:w-[min(100%,480px)]"
    : cn(
        "relative shrink-0",
        compact
          ? "h-14 w-[240px] sm:h-16 sm:w-[288px]"
          : "h-16 w-[264px] sm:h-[4.25rem] sm:w-[312px] md:h-[5.25rem] md:w-[360px]",
      );

  const imageSizes = isHeader
    ? "(max-width: 767px) 188px, (max-width: 1024px) 420px, 480px"
    : compact
      ? "(max-width: 640px) 240px, 288px"
      : "(max-width: 768px) 264px, (max-width: 1024px) 312px, 360px";

  return (
    <div className={cn(boxClass, className)}>
      <Image
        src={logoMark}
        alt="Renovision"
        fill
        className="object-contain object-left"
        priority
        sizes={imageSizes}
      />
    </div>
  );
}
