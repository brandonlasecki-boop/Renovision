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
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Daily marketing link generator</h3>
      <p className="text-xs text-muted-foreground">
        Pick date + platform + video and copy the exact link to post that day.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          placeholder="platform (tiktok)"
        />
        <input
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          placeholder="campaign (YYYY-MM-DD)"
        />
        <input
          value={video}
          onChange={(e) => setVideo(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          placeholder="video (001)"
        />
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Link ID (src)</p>
        <p className="font-mono text-xs">{src}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={link}
          readOnly
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-xs"
        />
        <button
          type="button"
          className="h-9 rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium hover:bg-muted"
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
