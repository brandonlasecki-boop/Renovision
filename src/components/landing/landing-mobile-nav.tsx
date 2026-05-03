"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { TryCtaLink, TRY_FLOW_UPLOAD_HREF } from "@/components/landing/try-cta-link";
import { buttonVariants } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

const inPageLinkClass =
  "rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/80";

/**
 * Mobile header drawer: full-height panel portaled to `document.body` so it is not clipped by
 * the sticky header’s backdrop filter (which breaks nested `position: fixed`).
 */
export function LandingMobileNav({
  showMyProjects,
  showAdmin,
  isLoggedIn,
}: {
  showMyProjects: boolean;
  showAdmin: boolean;
  isLoggedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => setOpen(false);

  const drawer = open ? (
    <div className="fixed inset-0 z-[200] flex justify-end" id="landing-mobile-nav-panel" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close menu"
        onClick={close}
      />
      <nav
        className="relative flex h-full w-[min(20rem,90vw)] max-w-full flex-col gap-0.5 overflow-y-auto border-l border-border/60 bg-background px-4 py-5 shadow-2xl"
        aria-label="Mobile menu"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-renovision-orange">Menu</p>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 text-foreground hover:bg-muted/60"
            aria-label="Close menu"
            onClick={close}
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        <TryCtaLink
          placement="landing_mobile_menu"
          href={TRY_FLOW_UPLOAD_HREF}
          className={cn(
            buttonVariants({ size: "default" }),
            "mb-3 w-full justify-center bg-renovision-navy font-semibold text-white shadow-md hover:bg-renovision-navy/90",
          )}
          onClick={close}
        >
          See My Bathroom Instantly
        </TryCtaLink>

        <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
        <a href="#how-it-works" className={inPageLinkClass} onClick={close}>
          How it works
        </a>
        <a href="#why-renovision" className={inPageLinkClass} onClick={close}>
          Why Renovision
        </a>
        <a href="#faq" className={inPageLinkClass} onClick={close}>
          FAQ
        </a>

        <div className="my-3 border-t border-border/60" />

        <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Account</p>
        <Link href="/contact" className={inPageLinkClass} onClick={close}>
          Contact
        </Link>
        {showMyProjects ? (
          <Link href="/projects" className={inPageLinkClass} onClick={close}>
            My projects
          </Link>
        ) : null}
        {showAdmin ? (
          <Link href="/admin/renovision" className={inPageLinkClass} onClick={close}>
            Admin dashboard
          </Link>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
          {!isLoggedIn ? (
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "default", size: "default" }),
                  "w-full justify-center font-semibold",
                )}
                onClick={close}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ variant: "outline", size: "default" }),
                  "w-full justify-center font-semibold",
                )}
                onClick={close}
              >
                Sign up
              </Link>
            </>
          ) : (
            <form action={signOut}>
              <button
                type="submit"
                className={cn(
                  buttonVariants({ variant: "outline", size: "default" }),
                  "w-full justify-center font-semibold",
                )}
              >
                Log out
              </button>
            </form>
          )}
        </div>
      </nav>
    </div>
  ) : null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="landing-mobile-nav-panel"
        aria-haspopup="dialog"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted/60"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-5" strokeWidth={2} /> : <Menu className="size-5" strokeWidth={2} />}
      </button>

      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </div>
  );
}
