import Image from "next/image";
import { Sparkles, Upload } from "lucide-react";

import { LandingHeroEasyStepsMobile } from "@/components/landing/landing-hero-easy-steps-mobile";
import { LandingHeroTransformation } from "@/components/landing/landing-hero-transformation";
import { TryCtaLink, TRY_FLOW_UPLOAD_HREF } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SOCIAL_PROOF_AVATARS = [
  "/landing/hero-social-avatar-1.png",
  "/landing/hero-social-avatar-2.png",
  "/landing/hero-social-avatar-3.png",
] as const;

const heroCtaClassName = cn(
  buttonVariants({ size: "lg" }),
  "flex h-12 min-h-12 w-full max-w-full items-center justify-center gap-2 bg-renovision-navy px-4 text-[0.9375rem] font-semibold leading-tight text-white shadow-lg shadow-renovision-navy/25 hover:bg-renovision-navy/90 sm:h-[52px] sm:min-h-[52px] sm:px-6 sm:text-base md:px-6 lg:h-[52px] lg:min-h-[52px]",
);

function HeroSocialProof() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-1.5 px-1">
      <div
        className="flex justify-center -space-x-2.5 rtl:space-x-reverse"
        role="img"
        aria-label="Homeowners using Renovision"
      >
        {SOCIAL_PROOF_AVATARS.map((src) => (
          <div
            key={src}
            className="relative size-9 shrink-0 overflow-hidden rounded-full border-2 border-background ring-1 ring-border/50"
          >
            <Image src={src} alt="" fill className="object-cover" sizes="36px" />
          </div>
        ))}
      </div>
      <p className="text-center text-[13px] leading-snug text-muted-foreground">
        Join <span className="font-semibold text-renovision-orange">1,000+</span> homeowners remodeling smarter
      </p>
    </div>
  );
}

/** One line under the hero CTA — urgency + trust. */
function HeroTrustLine() {
  return (
    <p className="w-full max-w-md px-1 text-center text-[11px] font-medium leading-tight tracking-tight text-muted-foreground">
      Most people see results in under 60 seconds • No signup
    </p>
  );
}

export function LandingHero() {
  return (
    <section
      id="preview"
      className="relative scroll-mt-20 overflow-hidden border-b border-border/40 bg-gradient-to-b from-[#fbf8f3] via-[#f8f5ef] to-background px-3 pb-6 pt-2 max-md:pb-3 max-md:pt-1 sm:px-6 sm:pb-12 sm:pt-6 md:px-6 md:pb-12 md:pt-6 lg:pb-16 lg:pt-12 lg:px-8"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(232,126,55,0.08),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-3 max-md:gap-1.5 sm:gap-5 md:gap-6 lg:gap-8">
        {/* Intro — same headline story on all breakpoints */}
        <div className="order-1 mx-auto w-full max-w-xl text-center sm:max-w-2xl">
          <p className="mx-auto inline-flex max-md:py-0.5 max-md:pl-2 max-md:pr-2.5 max-md:text-[8.5px] max-md:tracking-[0.08em] items-center gap-1.5 rounded-full border border-renovision-teal/30 bg-white/90 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-renovision-navy shadow-sm backdrop-blur-sm sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.12em] md:text-xs">
            <Sparkles className="size-3 shrink-0 text-renovision-orange sm:size-3.5" aria-hidden />
            AI-powered bathroom visualizer
          </p>
          <h1 className="mx-auto mt-2 max-w-[22rem] text-balance text-[1.28rem] font-semibold leading-[1.12] tracking-tight text-foreground max-md:mt-1 sm:mt-2 sm:max-w-none sm:text-2xl sm:leading-[1.14] md:mt-2.5 md:text-3xl md:leading-[1.1] lg:text-[2.35rem] lg:leading-[1.08]">
            See your bathroom{" "}
            <span className="text-renovision-orange">remodeled in seconds.</span>
          </h1>
        </div>

        {/* Demo */}
        <div className="order-2 w-full max-w-2xl md:max-w-none">
          <LandingHeroTransformation />
        </div>

        {/* Social proof + value line + CTA + trust — same order as mobile */}
        <div className="order-3 mx-auto flex w-full max-w-md justify-center">
          <HeroSocialProof />
        </div>
        <p className="order-4 mx-auto w-full max-w-md px-1 text-center text-[13px] font-semibold leading-snug text-renovision-navy sm:text-sm">
          Upload a photo → get 5 remodel ideas instantly
        </p>
        <div className="order-5 mx-auto w-full max-w-xl">
          <TryCtaLink placement="landing_hero_primary" href={TRY_FLOW_UPLOAD_HREF} className={heroCtaClassName}>
            <Upload className="size-4 shrink-0 opacity-95 sm:size-[1.125rem]" aria-hidden />
            See MY Bathroom Transformed
          </TryCtaLink>
        </div>
        <div className="order-6 mx-auto flex w-full max-w-xl justify-center">
          <HeroTrustLine />
        </div>
        <LandingHeroEasyStepsMobile />
      </div>
    </section>
  );
}
