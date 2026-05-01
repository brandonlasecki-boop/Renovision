import { LandingContact } from "@/components/landing/landing-contact";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFinalCta } from "@/components/landing/landing-final-cta";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingMobileTryBar } from "@/components/landing/landing-mobile-try-bar";
import { LandingTestimonials } from "@/components/landing/landing-testimonials";
import { LandingWhy } from "@/components/landing/landing-why";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader />
      <main className="pb-[5.25rem] md:pb-0">
        <LandingHero />
        <LandingHowItWorks />
        <LandingWhy />
        <LandingTestimonials />
        <LandingFaq />
        <LandingContact />
        <LandingFinalCta />
      </main>
      <LandingFooter />
      <LandingMobileTryBar />
    </div>
  );
}
