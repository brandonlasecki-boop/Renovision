import Image from "next/image";

import { cn } from "@/lib/utils";

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
          ? "h-12 w-[200px] sm:h-14 sm:w-[240px]"
          : "h-14 w-[220px] sm:h-16 sm:w-[260px] md:h-[4.75rem] md:w-[300px]",
        className,
      )}
    >
      <Image
        src="/renovision-logo.png"
        alt="Renovision"
        fill
        className="object-contain object-left"
        priority
        sizes={
          compact
            ? "(max-width: 640px) 200px, 240px"
            : "(max-width: 768px) 220px, (max-width: 1024px) 260px, 300px"
        }
      />
    </div>
  );
}
