import Image from "next/image";
import { Check, Lock, ShieldCheck, Sparkles, Timer, Upload } from "lucide-react";

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
  "flex h-12 min-h-12 w-full max-w-full items-center justify-center gap-2 bg-renovision-navy px-4 text-[0.9375rem] font-semibold leading-tight text-white shadow-lg shadow-renovision-navy/25 hover:bg-renovision-navy/90 sm:h-[52px] sm:min-h-[52px] sm:px-6 sm:text-base md:px-6 lg:h-12 lg:min-h-12 lg:w-auto lg:px-8 lg:shadow-none",
);

function HeroSocialProofMobile() {
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
        Join <span className="font-semibold text-renovision-orange">1000s</span> of homeowners who are already transforming their bathrooms.
      </p>
    </div>
  );
}

function HeroTrustIconsMobile() {
  const items = [
    { Icon: Lock, label: "No signup" },
    { Icon: Timer, label: "2 minutes" },
    { Icon: ShieldCheck, label: "No spam" },
  ] as const;
  return (
    <div className="grid w-full max-w-md grid-cols-3 gap-1.5 px-0.5">
      {items.map(({ Icon, label }) => (
        <div
          key={label}
          className="flex min-h-0 flex-row items-center justify-center gap-1 rounded-lg border border-border/60 bg-card/90 px-1 py-1 shadow-sm"
        >
          <Icon className="size-3.5 shrink-0 text-renovision-teal" strokeWidth={2} aria-hidden />
          <span className="text-left text-[10px] font-semibold leading-none text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function LandingHero() {
  return (
    <section
      id="preview"
      className="relative scroll-mt-20 overflow-hidden border-b border-border/40 bg-gradient-to-b from-[#fbf8f3] via-[#f8f5ef] to-background px-3 pb-6 pt-2.5 max-md:pb-4 sm:px-6 sm:pb-12 sm:pt-6 md:px-6 md:pb-12 md:pt-6 lg:pb-16 lg:pt-12 lg:px-8"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(232,126,55,0.08),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-3 max-md:gap-2 sm:gap-6 md:gap-8 lg:gap-10">
        {/* Intro */}
        <div className="mx-auto w-full max-w-xl text-center max-md:order-1 sm:max-w-2xl md:order-1">
          <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-renovision-teal/30 bg-white/90 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-renovision-navy shadow-sm backdrop-blur-sm sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.12em] md:text-xs">
            <Sparkles className="size-3 shrink-0 text-renovision-orange sm:size-3.5" aria-hidden />
            AI-powered bathroom visualizer
          </p>
          <h1 className="mt-2 text-balance text-[1.35rem] font-semibold leading-[1.16] tracking-tight text-foreground max-md:mt-1.5 md:hidden">
            See your bathroom{" "}
            <span className="text-renovision-orange">remodeled in seconds.</span>
          </h1>
          <h1 className="mt-2 hidden text-balance text-3xl font-semibold leading-[1.12] tracking-tight text-foreground sm:mt-2.5 sm:text-4xl md:block md:leading-[1.08] lg:text-[2.75rem]">
            See Your Bathroom Remodeled Before You Hire a Contractor
          </h1>
          <p className="mx-auto mt-2 hidden max-w-prose text-pretty text-sm font-semibold leading-snug text-renovision-navy sm:mt-3 sm:text-base md:block">
            Includes a realistic preview + instant cost estimate so you can plan with confidence.
          </p>
          <p className="mx-auto mt-2 hidden max-w-prose text-pretty text-base leading-relaxed text-muted-foreground sm:mt-3 lg:block sm:text-lg">
            Upload a photo, see your remodel in seconds, and decide with confidence before starting your project.
          </p>
          <p className="mx-auto mt-1.5 max-w-prose text-pretty text-[12px] leading-snug text-muted-foreground sm:mt-2 sm:text-sm lg:hidden">
            Upload a photo and see remodel ideas for your space—before you hire anyone.
          </p>
        </div>

        {/* Desktop: CTA + trust line + checklist (single column, before demo) */}
        <div className="mx-auto hidden w-full max-w-xl flex-col space-y-2.5 md:flex md:order-2 md:space-y-3 lg:max-w-xl lg:space-y-4">
          <div className="flex w-full justify-center">
            <TryCtaLink
              placement="landing_hero_primary"
              href={TRY_FLOW_UPLOAD_HREF}
              className={heroCtaClassName}
            >
              <Upload className="size-4 shrink-0 opacity-95 sm:size-[1.125rem]" aria-hidden />
              See My Bathroom Instantly
            </TryCtaLink>
          </div>
          <p className="text-center text-[13px] font-medium leading-snug text-muted-foreground sm:text-sm">
            No signup • Takes 2 min • No spam
          </p>
          <ul className="w-full space-y-2.5 rounded-xl border border-renovision-teal/25 bg-card/95 p-3 text-left shadow-sm ring-1 ring-renovision-teal/15 sm:space-y-3 sm:p-5">
            {(
              [
                "No signup required",
                "Takes under 2 minutes",
                "No contractor contact unless you choose",
              ] as const
            ).map((line) => (
              <li key={line} className="flex gap-2.5 text-sm font-semibold leading-snug text-foreground sm:gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-renovision-teal" strokeWidth={2.25} aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Demo (unchanged component) */}
        <div className="w-full max-w-2xl max-md:order-2 md:order-3 md:max-w-none">
          <LandingHeroTransformation />
        </div>

        {/* Mobile-only: social proof → CTA → icon trust */}
        <div className="mx-auto flex w-full max-w-md max-md:order-3 justify-center md:hidden">
          <HeroSocialProofMobile />
        </div>
        <div className="mx-auto w-full max-w-xl max-md:order-4 md:hidden">
          <TryCtaLink placement="landing_hero_primary" href={TRY_FLOW_UPLOAD_HREF} className={heroCtaClassName}>
            <Upload className="size-4 shrink-0 opacity-95" aria-hidden />
            See My Bathroom Instantly
          </TryCtaLink>
        </div>
        <div className="mx-auto w-full max-w-xl max-md:order-5 md:hidden">
          <HeroTrustIconsMobile />
        </div>
        <LandingHeroEasyStepsMobile />
      </div>
    </section>
  );
}
