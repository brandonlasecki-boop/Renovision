"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check } from "lucide-react";

export function CopyShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input readOnly value={url} className="font-mono text-xs sm:flex-1" />
      <Button type="button" variant="secondary" size="sm" onClick={copy} className="shrink-0">
        {copied ? (
          <>
            <Check className="mr-1.5 size-4" />
            Copied
          </>
        ) : (
          <>
            <Copy className="mr-1.5 size-4" />
            Copy link
          </>
        )}
      </Button>
    </div>
  );
}
