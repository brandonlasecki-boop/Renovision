"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { deleteBidPhotoForm } from "@/lib/actions/bids";
import type { BidPhotoWithUrl } from "@/types/bid";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

function downloadFilename(photo: BidPhotoWithUrl, bidId: string): string {
  if (photo.kind === "after_mockup" && photo.mockup_generation != null) {
    return `mockup-v${photo.mockup_generation}-${bidId.slice(0, 8)}.png`;
  }
  const base = photo.storage_path.split("/").pop() || "image";
  if (base.includes(".")) return base;
  const kind = photo.kind === "after_mockup" ? "mockup" : "before";
  return `${kind}-${bidId.slice(0, 8)}.png`;
}

async function downloadPhoto(photo: BidPhotoWithUrl, bidId: string) {
  const name = downloadFilename(photo, bidId);
  try {
    const res = await fetch(photo.signedUrl);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    window.open(photo.signedUrl, "_blank", "noopener,noreferrer");
  }
}

function photoAlt(p: BidPhotoWithUrl): string {
  return (
    p.caption ||
    (p.kind === "before"
      ? "Before"
      : p.mockup_generation != null
        ? `Mockup v${p.mockup_generation}`
        : "Mockup")
  );
}

export function BidPhotoGrid({
  bidId,
  photos,
  allowDeleteKinds,
  downloadableKinds = [],
}: {
  bidId: string;
  photos: BidPhotoWithUrl[];
  allowDeleteKinds: ("before" | "after_mockup")[];
  /** Offer a download button for these kinds (e.g. mockups). */
  downloadableKinds?: ("before" | "after_mockup")[];
}) {
  const [enlarged, setEnlarged] = useState<BidPhotoWithUrl | null>(null);

  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEnlarged(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [enlarged]);

  if (!photos.length) {
    return <p className="text-sm text-muted-foreground">No photos yet.</p>;
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2">
        {photos.map((p) => (
          <li
            key={p.id}
            className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm"
          >
            <button
              type="button"
              className="group relative aspect-[4/3] w-full cursor-zoom-in bg-muted text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setEnlarged(p)}
              aria-label={`View larger: ${photoAlt(p)}`}
            >
              <Image
                src={p.signedUrl}
                alt=""
                fill
                className="object-cover transition group-hover:brightness-[0.97]"
                sizes="(max-width: 640px) 100vw, 50vw"
                unoptimized
              />
              <span className="sr-only">{photoAlt(p)}</span>
            </button>
            <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {p.kind === "before"
                    ? "Before"
                    : p.mockup_generation != null
                      ? `Mockup v${p.mockup_generation}`
                      : "Mockup"}
                </p>
                {p.caption ? (
                  <p
                    className={
                      p.kind === "after_mockup"
                        ? "line-clamp-4 text-xs leading-snug text-muted-foreground break-words"
                        : "line-clamp-2 text-xs leading-snug text-muted-foreground break-words"
                    }
                  >
                    {p.caption}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {downloadableKinds.includes(p.kind) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => downloadPhoto(p, bidId)}
                  >
                    <Download className="mr-1 size-3.5" />
                    Download
                  </Button>
                ) : null}
                {allowDeleteKinds.includes(p.kind) ? (
                  <form action={deleteBidPhotoForm}>
                    <input type="hidden" name="photo_id" value={p.id} />
                    <input type="hidden" name="bid_id" value={bidId} />
                    <input type="hidden" name="storage_path" value={p.storage_path} />
                    <Button type="submit" variant="ghost" size="sm" className="h-8">
                      Remove
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {enlarged ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/88 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged photo"
          onClick={() => setEnlarged(null)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full border border-white/20 bg-background/95 text-foreground shadow-md transition hover:bg-background"
            onClick={(e) => {
              e.stopPropagation();
              setEnlarged(null);
            }}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          <div
            className="relative max-h-[min(92vh,100%)] max-w-[min(96vw,100%)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- lightbox needs native img for max dimensions */}
            <img
              src={enlarged.signedUrl}
              alt={photoAlt(enlarged)}
              className="max-h-[min(92vh,100%)] max-w-[min(96vw,100%)] object-contain shadow-2xl"
            />
            {enlarged.caption ? (
              <p className="mt-3 max-w-[min(96vw,36rem)] text-center text-[11px] leading-snug text-white/80">
                {enlarged.caption}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
