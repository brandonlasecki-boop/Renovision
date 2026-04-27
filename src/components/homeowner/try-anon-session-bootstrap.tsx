"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bootstrapTryAnonymousSessionAction } from "@/lib/actions/homeowner-try";

/** Guest first load on `/try`: sets httpOnly anon cookie via Server Action (RSC cannot set cookies). */
export function TryAnonSessionBootstrap() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await bootstrapTryAnonymousSessionAction();
      if (cancelled) return;
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (message) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-center text-sm text-destructive">{message}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">Preparing your session…</p>
    </div>
  );
}
