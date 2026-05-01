import { Mail } from "lucide-react";

const CONTACT_EMAIL = "hello@getrenovision.com";

export function LandingContact() {
  return (
    <section
      id="contact"
      className="scroll-mt-24 border-b border-border/40 bg-background px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Contact us</h2>
        <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
          Questions about Renovision? We&apos;d love to hear from you.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-6 inline-flex items-center justify-center gap-2 text-base font-semibold text-renovision-navy underline-offset-4 transition-colors hover:text-renovision-navy/90 hover:underline"
        >
          <Mail className="size-5 shrink-0" strokeWidth={2} aria-hidden />
          {CONTACT_EMAIL}
        </a>
      </div>
    </section>
  );
}
