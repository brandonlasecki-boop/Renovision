"use client";

import { useState } from "react";

type Props = {
  range: "24h" | "7d" | "30d" | "custom";
  startDate: string;
  endDate: string;
};

export function AnalyticsAiAnalyzer({ range, startDate, endDate }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>("");

  async function onAnalyze() {
    setLoading(true);
    setError(null);
    setAnalysis("");
    try {
      const res = await fetch("/api/admin/analytics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          range,
          ...(range === "custom" ? { start: startDate, end: endDate } : {}),
        }),
      });
      const json = (await res.json()) as { analysis?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Analyze request failed.");
        return;
      }
      setAnalysis(json.analysis ?? "");
    } catch {
      setError("Could not run AI analysis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onAnalyze}
        disabled={loading}
        className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Analyzing..." : "Analyze with AI"}
      </button>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {analysis ? (
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold tracking-tight">AI Analysis</h3>
          <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{analysis}</pre>
        </div>
      ) : null}
    </div>
  );
}
