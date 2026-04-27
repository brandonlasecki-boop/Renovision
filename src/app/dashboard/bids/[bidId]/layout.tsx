import type { ReactNode } from "react";

/** Always read fresh bid data after mutations (router.refresh + revalidatePath). */
export const dynamic = "force-dynamic";

/**
 * `generateBidAi` (materials + Vertex mockup) can run several minutes — Vertex alone may use up to
 * `VERTEX_MOCKUP_REQUEST_TIMEOUT_MS` (default 5m, max 10m via env) plus image downloads. Without this, hosts default to
 * ~60s and kill the action, leaving the estimate stuck in `ai_status: pending` with no error.
 * Vercel caps this by plan (often 300s on Pro, up to 800s on Enterprise).
 */
export const maxDuration = 800;

export default function BidIdLayout({ children }: { children: ReactNode }) {
  return children;
}
