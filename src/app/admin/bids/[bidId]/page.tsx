import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchAdminBidDetail } from "@/lib/data/admin";
import type { BidMaterialLine } from "@/types/bid";

function formatUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function MetaBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20">
      <p className="border-b border-border/60 bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="max-h-[480px] overflow-auto p-3 text-xs leading-relaxed">{children}</div>
    </div>
  );
}

function MaterialsTable({ lines }: { lines: BidMaterialLine[] }) {
  const filtered = lines.filter((l) => l.name.trim().length > 0);
  if (!filtered.length) {
    return <p className="text-sm text-muted-foreground">No line items saved.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border/80 bg-muted/40">
            <th className="px-3 py-2 font-medium">Line</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Unit $</th>
            <th className="px-3 py-2 font-medium">Extended</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((l) => (
            <tr key={l.line_id ?? l.name} className="border-b border-border/50 last:border-0">
              <td className="px-3 py-2 font-medium">{l.name}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {l.quantity} {l.unit}
              </td>
              <td className="px-3 py-2 tabular-nums">{formatUsd(l.unit_price_usd)}</td>
              <td className="px-3 py-2 tabular-nums">{formatUsd(l.extended_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminBidPage({
  params,
}: {
  params: Promise<{ bidId: string }>;
}) {
  const { bidId } = await params;
  const detail = await fetchAdminBidDetail(bidId);
  if (!detail) {
    notFound();
  }

  const { bid, companyName, photos, lineReferenceUrls, blueprintSignedUrl } = detail;
  const beforePhotos = photos.filter((p) => p.kind === "before");
  const mockupPhotos = [...photos.filter((p) => p.kind === "after_mockup")].sort(
    (a, b) => (a.mockup_generation ?? 0) - (b.mockup_generation ?? 0),
  );

  const totalEstimate = bid.material_estimate.reduce((s, l) => s + (l.extended_usd || 0), 0);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Admin overview
        </Link>
        <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight">{bid.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {companyName ? (
            <>
              Company: <span className="text-foreground">{companyName}</span>
            </>
          ) : (
            "Company: —"
          )}{" "}
          · Estimate ID <span className="font-mono text-xs">{bid.id}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer: {bid.customer_name || "—"}
          {bid.customer_email ? ` · ${bid.customer_email}` : ""}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Scope &amp; AI summary</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border/80 bg-card p-4">
            <h3 className="text-sm font-semibold">Scope</h3>
            <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {bid.scope_description.trim() || "—"}
            </pre>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-4">
            <h3 className="text-sm font-semibold">AI summary</h3>
            <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {bid.ai_summary?.trim() || "—"}
            </pre>
            {bid.ai_last_error ? (
              <p className="mt-2 text-xs text-destructive">Last error: {bid.ai_last_error}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Pricing (material estimate)</h2>
          <p className="text-sm text-muted-foreground">
            Roll total: <span className="font-medium text-foreground">{formatUsd(totalEstimate)}</span>
          </p>
        </div>
        <MaterialsTable lines={bid.material_estimate} />
        {Object.keys(lineReferenceUrls).length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Line reference images uploaded: {Object.keys(lineReferenceUrls).length} (see contractor app
            pricing step for thumbnails).
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Photos</h2>
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Before</h3>
          {beforePhotos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No before photos.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {beforePhotos.map((p) => (
                <div
                  key={p.id}
                  className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl border border-border/80 bg-muted/30"
                >
                  <Image
                    src={p.signedUrl}
                    alt="Before"
                    fill
                    className="object-contain"
                    sizes="(max-width:768px) 100vw, 400px"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Mockups (by generation)</h3>
          {mockupPhotos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mockups yet.</p>
          ) : (
            <div className="space-y-8">
              {mockupPhotos.map((p) => {
                const meta = p.mockup_generation_meta;
                const gen = p.mockup_generation ?? "?";
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        Mockup v{gen}
                        {p.mockup_image_provider ? (
                          <span className="ml-2 font-normal text-muted-foreground">
                            ({p.mockup_image_provider})
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString()}
                      </p>
                    </div>
                    {p.caption ? (
                      <p className="mt-1 text-xs text-muted-foreground">{p.caption}</p>
                    ) : null}
                    <div className="relative mt-3 aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                      <Image
                        src={p.signedUrl}
                        alt={`Mockup v${gen}`}
                        fill
                        className="object-contain"
                        sizes="(max-width:768px) 100vw, 672px"
                        unoptimized
                      />
                    </div>
                    {meta ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {meta.additionalPrompt ? (
                          <MetaBlock label="User notes (this run)">
                            <pre className="whitespace-pre-wrap font-sans">{meta.additionalPrompt}</pre>
                          </MetaBlock>
                        ) : null}
                        {meta.imageEditSource ? (
                          <MetaBlock label="Image edit source">
                            <p className="font-mono">{meta.imageEditSource}</p>
                          </MetaBlock>
                        ) : null}
                        {meta.scopeSnapshot ? (
                          <MetaBlock label="Scope snapshot (composite)">
                            <pre className="whitespace-pre-wrap font-sans">{meta.scopeSnapshot}</pre>
                          </MetaBlock>
                        ) : null}
                        {meta.roomAnalysis ? (
                          <MetaBlock label="Room analysis (vision)">
                            <pre className="whitespace-pre-wrap font-sans">{meta.roomAnalysis}</pre>
                          </MetaBlock>
                        ) : null}
                        {meta.remodelEditPrompt ? (
                          <MetaBlock label="Remodel instructions (model)">
                            <pre className="whitespace-pre-wrap font-sans">{meta.remodelEditPrompt}</pre>
                          </MetaBlock>
                        ) : null}
                        {meta.referenceVisualSummary ? (
                          <MetaBlock label="Reference visual summary">
                            <pre className="whitespace-pre-wrap font-sans">
                              {meta.referenceVisualSummary}
                            </pre>
                          </MetaBlock>
                        ) : null}
                        {meta.fullEditPrompt ? (
                          <MetaBlock label="Full image-edit prompt (sent to API)">
                            <pre className="whitespace-pre-wrap font-sans">{meta.fullEditPrompt}</pre>
                          </MetaBlock>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        No prompt metadata on file (generations before this feature, or migration not
                        applied). Run{" "}
                        <code className="rounded bg-muted px-1">010_bid_mockup_generation_meta</code>{" "}
                        and generate a new mockup to capture prompts.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {blueprintSignedUrl ? (
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Blueprint</h3>
            <a
              href={blueprintSignedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-renovision-navy underline-offset-4 hover:underline"
            >
              Open signed link
            </a>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Walkthrough / questionnaire</h2>
        <div className="rounded-xl border border-border/80 bg-card p-4">
          <h3 className="text-sm font-semibold">Transcript</h3>
          <pre className="mt-2 max-h-[200px] overflow-auto text-xs text-muted-foreground">
            {bid.walkthrough_transcript.trim() || "—"}
          </pre>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-4">
          <h3 className="text-sm font-semibold">Questionnaire (JSON)</h3>
          <pre className="mt-2 max-h-[240px] overflow-auto text-xs text-muted-foreground">
            {JSON.stringify(bid.project_questionnaire, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}
