import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function normalizeProdOrigin(origin: string): string {
  try {
    const u = new URL(origin);
    if (u.hostname === "getrenovision.com") {
      u.hostname = "www.getrenovision.com";
      return u.toString().replace(/\/$/, "");
    }
    return u.origin;
  } catch {
    return origin;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const safeOrigin = normalizeProdOrigin(origin);
  const next = searchParams.get("next") ?? "/projects";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/projects";

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${safeOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    },
  });
  if (error || !data.url) {
    return NextResponse.redirect(`${safeOrigin}/login?next=${encodeURIComponent(safeNext)}`);
  }
  return NextResponse.redirect(data.url);
}
