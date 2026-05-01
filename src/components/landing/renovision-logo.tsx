import Image from "next/image";

import { cn } from "@/lib/utils";

import logoMark from "../../../Images/logo_trans.png";

type RenovisionLogoProps = {
  className?: string;
  /** Smaller mark for compact headers */
  compact?: boolean;
};

export function RenovisionLogo({ className, compact }: RenovisionLogoProps) {
  return (
    <div
      className={cn(
        "relative shrink-0",
        compact
          ? "h-14 w-[240px] sm:h-16 sm:w-[288px]"
          : "h-16 w-[264px] sm:h-[4.25rem] sm:w-[312px] md:h-[5.25rem] md:w-[360px]",
        className,
      )}
    >
      <Image
        src={logoMark}
        alt="Renovision"
        fill
        className="object-contain object-left"
        priority
        sizes={
          compact
            ? "(max-width: 640px) 240px, 288px"
            : "(max-width: 768px) 264px, (max-width: 1024px) 312px, 360px"
        }
      />
    </div>
  );
}
