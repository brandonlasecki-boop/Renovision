"use client";

import { useMemo, useState } from "react";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function MarketingLinkBuilder({ baseUrl }: { baseUrl: string }) {
  const [platform, setPlatform] = useState("tiktok");
  const [campaign, setCampaign] = useState(todayIsoDate());
  const [video, setVideo] = useState("001");
  const [copied, setCopied] = useState(false);

  const src = useMemo(() => {
    const p = slugify(platform) || "platform";
    const c = slugify(campaign) || "campaign";
    const v = slugify(video) || "video";
    return `${c}-${p}-${v}`;
  }, [platform, campaign, video]);

  const link = useMemo(() => {
    const params = new URLSearchParams();
    params.set("src", src);
    params.set("platform", platform.trim() || "tiktok");
    params.set("campaign", campaign.trim() || todayIsoDate());
    params.set("video", video.trim() || "001");
    return `${baseUrl}/?${params.toString()}`;
  }, [baseUrl, src, platform, campaign, video]);

  return (
    <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Daily marketing link generator</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Pick date, platform, and video — copy the tracked URL for that day&apos;s post.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="platform (tiktok)"
        />
        <input
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="campaign (YYYY-MM-DD)"
        />
        <input
          value={video}
          onChange={(e) => setVideo(e.target.value)}
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="video (001)"
        />
      </div>
      <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Link ID (src)</p>
        <p className="mt-0.5 font-mono text-xs">{src}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={link}
          readOnly
          className="h-10 flex-1 rounded-xl border border-input bg-background px-3 font-mono text-xs"
        />
        <button
          type="button"
          className="h-10 shrink-0 rounded-xl bg-renovision-navy px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 dark:bg-renovision-orange dark:text-renovision-navy"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
