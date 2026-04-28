import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";

export default async function MagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const nextPath =
    sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/projects";

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-renovision-navy">
            Renovision
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
          >
            ← Home
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12">
        <MagicLinkForm nextPath={nextPath} />
      </main>
    </div>
  );
}
