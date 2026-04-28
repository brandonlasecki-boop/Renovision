"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendMagicLink } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MagicLinkForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, undefined);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold tracking-tight">Save your remodel design</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send a secure sign-in link.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <input type="hidden" name="next" value={nextPath} />
        <CardContent className="grid gap-4">
          {state && "error" in state ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          {state && "success" in state && state.success ? (
            <p className="text-sm text-renovision-teal">Check your inbox for the sign-in link.</p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@email.com" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending link…" : "Send Magic Link"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Prefer password?{" "}
            <Link href={`/signup?next=${encodeURIComponent(nextPath)}`} className="text-primary underline-offset-4 hover:underline">
              Create account
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
