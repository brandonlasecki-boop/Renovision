import Image, { type StaticImageData } from "next/image";

import { TryCtaLink, TRY_FLOW_UPLOAD_HREF } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import afterBuild from "../../../Images/after_build.png";
import afterDark from "../../../Images/after_dark.png";
import afterSmall from "../../../Images/after_small.png";
import beforeBuild from "../../../Images/before_build.png";
import beforeDark from "../../../Images/before_dark.png";
import beforeSmall from "../../../Images/before_small.png";

type TransformationCard = {
  before: StaticImageData;
  after: StaticImageData;
  title: string;
  description: string;
  beforeAlt: string;
  afterAlt: string;
};

const CARDS: TransformationCard[] = [
  {
    before: beforeSmall,
    after: afterSmall,
    title: "Small Bathroom, Bigger Feel",
    description: "From cramped and cluttered to bright and open.",
    beforeAlt: "Small bathroom before remodel",
    afterAlt: "Same small bathroom after remodel, brighter and more open",
  },
  {
    before: beforeDark,
    after: afterDark,
    title: "Dark to Bright",
    description: "Turn a dated bathroom into a clean, spa-like space.",
    beforeAlt: "Dark dated bathroom before remodel",
    afterAlt: "Same bathroom transformed into a bright spa-like space",
  },
  {
    before: beforeBuild,
    after: afterBuild,
    title: "Builder-Grade to Luxury",
    description: "See how a basic bathroom can feel high-end.",
    beforeAlt: "Builder-grade bathroom before upgrade",
    afterAlt: "Same bathroom with a more luxurious high-end look",
  },
];

function TransformationCardView({ card }: { card: TransformationCard }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm ring-1 ring-black/[0.04] max-md:rounded-xl dark:border-border dark:bg-card">
      <div className="grid grid-cols-2 gap-px bg-border">
        <div className="relative aspect-[3/2] w-full bg-muted max-md:min-h-0 sm:aspect-[4/5] sm:min-h-[180px] md:min-h-[200px] lg:aspect-[3/4] lg:min-h-[260px]">
          <Image
            src={card.before}
            alt={card.beforeAlt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 360px"
            className="object-cover"
          />
          <span className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground shadow-sm dark:bg-background/95">
            Before
          </span>
        </div>
        <div className="relative aspect-[3/2] w-full bg-muted max-md:min-h-0 sm:aspect-[4/5] sm:min-h-[180px] md:min-h-[200px] lg:aspect-[3/4] lg:min-h-[260px]">
          <Image
            src={card.after}
            alt={card.afterAlt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 360px"
            className="object-cover"
          />
          <span className="absolute bottom-2 right-2 rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground shadow-sm dark:bg-background/95">
            After
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-4 sm:gap-2 sm:p-5 md:p-6">
        <h3 className="text-balance text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg md:text-xl">
          {card.title}
        </h3>
        <p className="text-pretty text-[13px] leading-relaxed text-muted-foreground sm:text-sm md:text-[15px]">
          {card.description}
        </p>
      </div>
    </article>
  );
}

export function LandingRealTransformationsSection() {
  return (
    <section
      id="real-transformations"
      aria-labelledby="real-transformations-heading"
      className="scroll-mt-20 border-b border-border/40 bg-muted/20 px-3 py-9 sm:scroll-mt-24 sm:px-6 sm:py-14 md:py-16 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="real-transformations-heading"
            className="text-balance text-[1.25rem] font-semibold leading-snug tracking-tight text-foreground sm:text-2xl sm:leading-tight md:text-3xl lg:text-[2rem]"
          >
            See More Real Transformations
          </h2>
          <p className="mt-2 text-pretty text-[13px] leading-relaxed text-muted-foreground sm:mt-3 sm:text-sm md:text-base">
            Real bathrooms. Real possibilities. See what your space could become.
          </p>
        </div>

        <ul className="mt-7 grid list-none grid-cols-1 gap-6 max-md:-mx-3 max-md:w-[calc(100%+1.5rem)] sm:mx-0 sm:mt-10 sm:w-full sm:gap-7 md:gap-8 lg:mt-12 lg:grid-cols-3">
          {CARDS.map((card) => (
            <li key={card.title}>
              <TransformationCardView card={card} />
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-8 hidden max-w-xl border-t border-border/50 pt-8 text-center sm:mt-12 sm:pt-10 md:block md:pt-12 lg:mt-14">
          <TryCtaLink
            placement="landing_real_transformations"
            href={TRY_FLOW_UPLOAD_HREF}
            className={cn(
              buttonVariants({ size: "lg" }),
              "inline-flex h-12 min-h-12 w-full max-w-md items-center justify-center bg-renovision-navy px-4 text-[0.9375rem] font-semibold leading-tight text-white shadow-md shadow-renovision-navy/20 hover:bg-renovision-navy/90 sm:h-[52px] sm:min-h-[52px] sm:px-6 sm:text-base md:px-8",
            )}
          >
            See My Bathroom Instantly
          </TryCtaLink>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground sm:mt-4 sm:text-sm md:text-base">
            Upload a photo and preview your remodel in seconds.
          </p>
        </div>
      </div>
    </section>
  );
}
