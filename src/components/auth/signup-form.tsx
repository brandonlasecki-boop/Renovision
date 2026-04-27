"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SignupForm({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState(signUp, undefined);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Create account
        </CardTitle>
        <CardDescription>
          Save your remodel previews and pick up where you left off across devices.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <input type="hidden" name="next" value={nextPath} />
        <CardContent className="grid gap-4">
          {state && "error" in state && state.error ? (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </div>
          ) : null}
          {state && "success" in state && state.success ? (
            <div className="rounded-lg border border-renovision-teal/30 bg-renovision-teal/10 px-3 py-3 text-sm text-foreground">
              <p className="font-medium">Almost done — confirm your email</p>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">
                We sent a link to{" "}
                <span className="font-medium text-foreground">{state.email}</span>. Open it to activate your account,
                then sign in here. If nothing arrives within a couple of minutes, check spam or your Supabase Auth
                settings (confirm email / SMTP).
              </p>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            className="w-full"
            disabled={pending || (state && "success" in state && state.success)}
          >
            {pending ? "Creating…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
            {" · "}
            <Link href="/" className="text-primary underline-offset-4 hover:underline">
              Back to home
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
