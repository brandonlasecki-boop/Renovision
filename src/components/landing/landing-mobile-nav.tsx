"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { signOut } from "@/lib/actions/auth";

/**
 * Mobile header menu: account + contact only — no duplicate /try CTA (hero + sticky bar handle that).
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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="landing-mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background text-foreground shadow-sm transition hover:bg-muted/60"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-5" strokeWidth={2} /> : <Menu className="size-5" strokeWidth={2} />}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex justify-end" id="landing-mobile-nav-panel">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <nav
            className="relative flex h-full w-[min(19rem,88vw)] flex-col gap-1 border-l border-border/60 bg-background px-4 py-5 shadow-2xl"
            aria-label="Mobile"
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-renovision-orange">Menu</p>
            <p className="px-3 pb-2 text-xs leading-relaxed text-muted-foreground">
              How it works, FAQ, and more are in the footer below.
            </p>
            <Link
              href="/contact"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/80"
              onClick={() => setOpen(false)}
            >
              Contact
            </Link>
            {showMyProjects ? (
              <Link
                href="/projects"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/80"
                onClick={() => setOpen(false)}
              >
                My projects
              </Link>
            ) : null}
            {showAdmin ? (
              <Link
                href="/admin/renovision"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-renovision-navy hover:bg-muted/80"
                onClick={() => setOpen(false)}
              >
                Admin
              </Link>
            ) : null}
            <div className="mt-auto border-t border-border/60 pt-4">
              {!isLoggedIn ? (
                <Link
                  href="/login?next=/try"
                  className="block rounded-lg px-3 py-2.5 text-center text-sm font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  Log in
                </Link>
              ) : (
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-lg py-2.5 text-center text-sm font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground"
                  >
                    Log out
                  </button>
                </form>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
