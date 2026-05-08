import Link from "next/link";
import { fetchAdminAnalyticsSessionDetail } from "@/lib/data/admin-analytics";

function summarizeMetadata(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const obj = value as Record<string, unknown>;
  const keys = ["event_name", "error_code", "style_id", "page_path", "duration_ms", "analytics_id"];
  const picked = keys
    .filter((k) => k in obj)
    .map((k) => `${k}:${String(obj[k])}`);
  if (picked.length) return picked.slice(0, 4).join(" | ");
  try {
    const text = JSON.stringify(obj);
    return text.length > 160 ? `${text.slice(0, 160)}...` : text;
  } catch {
    return "—";
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "—";
  }
}

export async function AdminSessionTimeline({
  sessionId,
  maxRows = 80,
}: {
  sessionId: string;
  maxRows?: number;
}) {
  const sid = sessionId.trim();
  if (!sid || sid === "—") {
    return <p className="text-sm text-muted-foreground">No session ID available.</p>;
  }
  const data = await fetchAdminAnalyticsSessionDetail(sid);
  if (!data) {
    return <p className="text-sm text-muted-foreground">No analytics timeline available for this session.</p>;
  }

  const items = data.timeline.slice(-maxRows);
  return (
    <div className="space-y-2">
      <Link
        href={`/admin/analytics/sessions/${encodeURIComponent(data.summary.sessionId)}`}
        className="text-sm underline-offset-4 hover:underline"
      >
        Open full session timeline
      </Link>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="px-3 py-2 font-medium">Timestamp</th>
              <th className="px-3 py-2 font-medium">Event / Page</th>
              <th className="px-3 py-2 font-medium">Page path</th>
              <th className="px-3 py-2 font-medium">Metadata summary</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const label = item.type === "page_view" ? "page_view" : item.eventName;
              const pagePath = item.pagePath ?? "—";
              const metadata = item.metadata;
              return (
                <tr key={`${item.type}-${item.time}-${idx}`} className="border-b border-border/40 last:border-0 align-top">
                  <td className="px-3 py-2 text-xs">{new Date(item.time).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{label}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{pagePath}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <p>{summarizeMetadata(metadata)}</p>
                    {metadata && typeof metadata === "object" ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] underline-offset-2 hover:underline">
                          Expand raw metadata
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded-md border border-border/60 bg-muted/20 p-2 text-[11px] text-foreground">
                          {safeJson(metadata)}
                        </pre>
                      </details>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                  No timeline items.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
