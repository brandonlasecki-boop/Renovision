import Link from "next/link";
import { requireContractorContext } from "@/lib/data/contractor-portal";

export const metadata = {
  title: "Contractor Portal",
  robots: { index: false, follow: false },
};

export default async function ContractorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContractorContext();
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border/70 bg-background/95 px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Contractor Portal</p>
            <p className="text-sm font-semibold">{ctx.contractor.company_name}</p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/contractor" className="underline-offset-4 hover:underline">
              Overview
            </Link>
            <Link href="/contractor/leads" className="underline-offset-4 hover:underline">
              Leads
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
