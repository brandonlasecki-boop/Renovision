"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { MutableRefObject } from "react";
import {
  applyRetailShelfCandidateChoiceAction,
  clearBidLineReferencePhoto,
  deleteCompanyLineTemplate,
  estimatePerLineQuotePricingAction,
  fetchHomeDepotPricingForBid,
  fetchRetailShelfCandidatesForLineAction,
  generateBidPricedBreakdownAction,
  replaceBidLineHomeDepotFromPrompt,
  replaceBidLineLowesFromPrompt,
  saveCompanyLineTemplate,
  substituteBidLineHomeDepotFromUrl,
  substituteBidLineLowesFromUrl,
  updateBidQuoteLines,
  uploadBidLineReferencePhoto,
} from "@/lib/actions/bids";
import type { RetailUrlProbeReportRow } from "@/lib/retail/attach-retail-pricing-to-lines";
import {
  catalogRetailImageUrlForMockup,
  effectiveMockupShelfRetailerForLine,
  getMockupReferenceSlotPreviews,
  lineHasDualRetailShelfImagesForMockup,
  lineHasMockupVisualReference,
  vanityLinesMissingMockupVisual,
  winningRetailCatalogTabForLine as winningRetailTabForLine,
} from "@/lib/bid-mockup";
import {
  normalizeHomedepotProductUrl,
  type HomeDepotSearchHit,
} from "@/lib/integrations/serpapi-homedepot";
import { retailImageUrlForLightbox } from "@/lib/integrations/retail-product-image-lightbox";
import { normalizeLowesProductUrl, type LowesSearchHit } from "@/lib/integrations/serpapi-lowes";
import type { BidLineTemplate, BidMaterialLine, BidMaterialTrade } from "@/types/bid";
import { BidCollapsibleSection } from "@/components/dashboard/bid-collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
  ImagePlus,
  Loader2,
  PackageSearch,
  PenLine,
  Plus,
  Search,
  Store,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

/**
 * Mockup reference list preview — same loading rules as line-item shelf `<img>` (default referrer).
 * Do **not** set `referrerPolicy="no-referrer"`: Home Depot / Lowe’s CDNs often reject hotlinks with no Referer.
 */
function MockupSlotThumb({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const t = src.trim();
  if (!t) {
    return (
      <div
        className="flex size-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/50 text-[10px] text-muted-foreground"
        title={title}
      >
        Photo
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className="flex size-14 shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10"
        title="Preview did not load in the browser (CDN or expired link); the AI may still use this image."
      >
        <ImageOff className="size-5 shrink-0 opacity-80 text-amber-900 dark:text-amber-100" aria-hidden />
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- external retail + Supabase signed URLs */
    <img
      src={t}
      alt=""
      title={title}
      decoding="async"
      loading="lazy"
      className="size-14 shrink-0 rounded-md border border-border/60 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function retailSkuDigits(id: string | undefined | null): string {
  return String(id ?? "").replace(/\D/g, "");
}

function retailSimilarHitKey(h: HomeDepotSearchHit | LowesSearchHit): string {
  return `${retailSkuDigits(h.product_id)}-${h.title.slice(0, 40)}`;
}

/** Every named line from the server still has $0 (or unset) sell price — auto-run AI line pricing once. */
function initialServerLinesLookUnpriced(rows: BidMaterialLine[]): boolean {
  const named = rows.filter((l) => String(l.name ?? "").trim().length > 0);
  if (named.length === 0) return false;
  return named.every((l) => {
    const p = l.unit_price_usd;
    return !Number.isFinite(p) || p === 0;
  });
}

const MAX_UNDO_REMOVES = 25;

/** Session-only stack depth per line for “previous shelf listing” (similar / describe / paste URL). */
const MAX_RETAIL_UNDO = 10;

const RETAIL_UNDO_KEYS: (keyof BidMaterialLine)[] = [
  "hd_product_url",
  "hd_title",
  "hd_unit_price_usd",
  "hd_price_raw",
  "hd_price_was_usd",
  "hd_percentage_off",
  "hd_price_badge",
  "hd_product_id",
  "hd_fetched_at",
  "hd_image_url",
  "lw_product_url",
  "lw_title",
  "lw_unit_price_usd",
  "lw_price_raw",
  "lw_price_was_usd",
  "lw_percentage_off",
  "lw_price_badge",
  "lw_product_id",
  "lw_fetched_at",
  "lw_image_url",
  "unit_cost_usd",
  "unit_price_usd",
  "extended_usd",
  "markup_pct",
  "mockup_include",
  "mockup_shelf_retailer",
  "pricing_approved",
];

function pickRetailSnapshot(line: BidMaterialLine): Partial<BidMaterialLine> {
  const out: Partial<BidMaterialLine> = {};
  const src = line as Record<string, unknown>;
  const dst = out as Record<string, unknown>;
  for (const k of RETAIL_UNDO_KEYS) {
    if (Object.prototype.hasOwnProperty.call(line, k)) {
      dst[k as string] = src[k as string];
    }
  }
  return out;
}

function applyRetailSnapshot(line: BidMaterialLine, snap: Partial<BidMaterialLine>): BidMaterialLine {
  const next: BidMaterialLine = { ...line };
  const r = next as Record<string, unknown>;
  const s = snap as Record<string, unknown>;
  for (const k of RETAIL_UNDO_KEYS) {
    const key = k as string;
    if (Object.prototype.hasOwnProperty.call(snap, k)) {
      const v = s[key];
      if (v === undefined) {
        delete r[key];
      } else {
        r[key] = v;
      }
    } else {
      delete r[key];
    }
  }
  return next;
}

function cloneLines(lines: BidMaterialLine[]): BidMaterialLine[] {
  return lines.map((l) => ({ ...l }));
}

const TRADE_OPTIONS: { value: BidMaterialTrade; label: string }[] = [
  { value: "general", label: "General" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "hvac", label: "HVAC" },
  { value: "drywall", label: "Drywall" },
  { value: "flooring", label: "Flooring" },
  { value: "paint", label: "Paint" },
  { value: "cabinetry", label: "Cabinetry" },
  { value: "tile", label: "Tile" },
  { value: "labor", label: "Labor" },
  { value: "permits", label: "Permits" },
  { value: "other", label: "Other" },
];

/** Display order for scope breakdown sections (mobile-first). */
const TRADE_SECTION_ORDER: BidMaterialTrade[] = [
  "permits",
  "general",
  "labor",
  "drywall",
  "electrical",
  "plumbing",
  "hvac",
  "cabinetry",
  "tile",
  "flooring",
  "paint",
  "other",
];

function tradeLabel(t: BidMaterialTrade): string {
  return TRADE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function groupLineIndicesByTrade(lines: BidMaterialLine[]): Map<BidMaterialTrade, number[]> {
  const m = new Map<BidMaterialTrade, number[]>();
  lines.forEach((line, index) => {
    const t = (line.trade ?? "general") as BidMaterialTrade;
    const arr = m.get(t) ?? [];
    arr.push(index);
    m.set(t, arr);
  });
  return m;
}

function emptyLine(): BidMaterialLine {
  return {
    line_id: crypto.randomUUID(),
    name: "",
    quantity: 1,
    unit: "ea",
    unit_cost_usd: 0,
    markup_pct: 0,
    unit_price_usd: 0,
    extended_usd: 0,
    mockup_include: false,
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineHasPricing(row: BidMaterialLine): boolean {
  const sell = Number(row.unit_price_usd) || 0;
  const cost = Number(row.unit_cost_usd) || 0;
  return sell > 0 || cost > 0;
}

function pricingRowSurfaceClass(row: BidMaterialLine): string {
  const named = String(row.name ?? "").trim().length > 0;
  if (!named) return "";
  if (row.pricing_approved === true) {
    return "border-l-[3px] border-l-emerald-500/80 bg-emerald-500/[0.09]";
  }
  if (lineHasPricing(row)) {
    return "border-l-[3px] border-l-amber-500/75 bg-amber-500/[0.1]";
  }
  return "border-l-[3px] border-l-sky-500/70 bg-sky-500/[0.08]";
}

function patchClearsPricingApproval(patch: Partial<BidMaterialLine>): boolean {
  if (patch.pricing_approved === true) return false;
  return (
    patch.unit_cost_usd !== undefined ||
    patch.markup_pct !== undefined ||
    patch.unit_price_usd !== undefined ||
    patch.quantity !== undefined ||
    patch.name !== undefined ||
    patch.notes !== undefined ||
    patch.unit !== undefined
  );
}

/** Mockup needs a contractor upload or a retail product image (Home Depot / Lowe's). */
function rowCanUseMockup(
  row: BidMaterialLine,
  localRefOverrides: Record<string, string>,
): boolean {
  if (row.line_id && localRefOverrides[row.line_id]) return true;
  return lineHasMockupVisualReference(row);
}

function lineFromTemplate(t: BidLineTemplate): BidMaterialLine {
  const q = Math.max(0, t.quantity);
  const sell = Math.max(0, t.default_unit_price_usd);
  return {
    line_id: crypto.randomUUID(),
    name: t.name,
    quantity: q,
    unit: t.unit || "ea",
    unit_cost_usd: sell,
    markup_pct: 0,
    unit_price_usd: sell,
    extended_usd: roundMoney(q * sell),
    notes: t.notes,
    mockup_include: false,
    ...(t.trade && t.trade !== "general" ? { trade: t.trade } : {}),
  };
}

export function BidQuoteEditor({
  bidId,
  initialLines,
  lineReferenceUrls,
  initialLineTemplates = [],
  variant = "full",
  /**
   * Updated synchronously on every render with `JSON.stringify(lines)` so mockup submit can read
   * the latest editor state (avoids a frame lag vs useEffect + hidden input).
   */
  linesSnapshotOutRef,
  /** On the Mockup setup page: show exactly which product images will be sent on Regenerate. */
  mockupRefPreview = false,
  /**
   * When set, associates a hidden `material_estimate_snapshot` with this HTML form `id` so mockup
   * submit includes the latest in-editor line data (shelf URLs, mockup toggles) without relying on ref timing.
   */
  materialSnapshotFormId,
}: {
  bidId: string;
  initialLines: BidMaterialLine[];
  lineReferenceUrls: Record<string, string>;
  /** Reusable line presets for this company (from DB). */
  initialLineTemplates?: BidLineTemplate[];
  /** scopeOnly: hide pricing and reference photos — for trade breakdown before pricing. */
  variant?: "full" | "scopeOnly";
  linesSnapshotOutRef?: MutableRefObject<string>;
  mockupRefPreview?: boolean;
  materialSnapshotFormId?: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<BidMaterialLine[]>(() =>
    initialLines.length
      ? initialLines.map((l) => ({
          ...l,
          line_id: l.line_id ?? crypto.randomUUID(),
        }))
      : [emptyLine()],
  );
  const [localRefOverrides, setLocalRefOverrides] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ error?: string; success?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pricedPending, startPriced] = useTransition();
  const [lineEstimatePending, startLineEstimate] = useTransition();
  const [uploadingLineId, setUploadingLineId] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [lineTemplates, setLineTemplates] = useState<BidLineTemplate[]>(initialLineTemplates);
  const [libraryBusy, setLibraryBusy] = useState(false);
  /** Snapshots before each line removal (session-only; cleared after save / server refresh). */
  const [undoRemoveStack, setUndoRemoveStack] = useState<BidMaterialLine[][]>([]);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const scopeOnly = variant === "scopeOnly";

  const mockupRefSlots = useMemo(() => {
    if (!mockupRefPreview || scopeOnly) return [];
    return getMockupReferenceSlotPreviews(lines);
  }, [mockupRefPreview, scopeOnly, lines]);

  const vanityMockupGaps = useMemo(() => {
    if (!mockupRefPreview || scopeOnly) return [];
    return vanityLinesMissingMockupVisual(lines);
  }, [mockupRefPreview, scopeOnly, lines]);

  const goToAdjacentLine = useCallback((delta: -1 | 1) => {
    setEditIndex((i) => {
      if (i === null) return null;
      const len = linesRef.current.length;
      if (len === 0) return null;
      const j = i + delta;
      if (j < 0 || j >= len) return i;
      return j;
    });
  }, []);

  const [hdRetailEnabled, setHdRetailEnabled] = useState(false);
  /** Bulk fetch: include Home Depot (SerpApi home_depot engine). */
  const [retailHomeDepot, setRetailHomeDepot] = useState(true);
  /** Bulk fetch: include Lowe's (SerpApi Google `site:lowes.com` — best-effort). Default off — HD has richer images. */
  const [retailLowes, setRetailLowes] = useState(false);
  /** When true, bulk search picks the first result that looks on sale (was price / % off / badge). */
  const [hdPreferSale, setHdPreferSale] = useState(false);
  const [hdFetchPending, setHdFetchPending] = useState(false);
  const [hdFetchMessage, setHdFetchMessage] = useState<string | null>(null);
  const [hdUrlProbeReport, setHdUrlProbeReport] = useState<RetailUrlProbeReportRow[] | null>(null);
  const [hdModalPaste, setHdModalPaste] = useState("");
  const [hdActionBusyId, setHdActionBusyId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  /** Line id with retail “similar” / “prompt” tools open (list or modal). */
  const [retailToolsLineId, setRetailToolsLineId] = useState<string | null>(null);
  const [retailToolsMode, setRetailToolsMode] = useState<"similar" | "prompt" | null>(null);
  const [retailSimilarPack, setRetailSimilarPack] = useState<{
    q: string;
    home_depot: HomeDepotSearchHit[];
    lowes: LowesSearchHit[];
  } | null>(null);
  /** Keys of similar hits the user opened in order — last is “current”; pop = previous product in this list. */
  const [retailSimilarVisitStack, setRetailSimilarVisitStack] = useState<string[]>([]);
  const [retailPromptDraft, setRetailPromptDraft] = useState("");
  const retailUndoStacksRef = useRef<Record<string, Partial<BidMaterialLine>[]>>({});
  /** States reachable after an undo (forward). */
  const retailRedoStacksRef = useRef<Record<string, Partial<BidMaterialLine>[]>>({});
  const [retailUndoVersion, setRetailUndoVersion] = useState(0);

  useEffect(() => {
    setRetailToolsLineId(null);
    setRetailToolsMode(null);
    setRetailSimilarPack(null);
    setRetailSimilarVisitStack([]);
    setRetailPromptDraft("");
  }, [editIndex]);

  useEffect(() => {
    retailUndoStacksRef.current = {};
    retailRedoStacksRef.current = {};
    setRetailUndoVersion((v) => v + 1);
    try {
      const legacyRetail = localStorage.getItem(`bid-hd-retail:${bidId}`) === "1";
      const hdFlag = localStorage.getItem(`bid-retail-hd:${bidId}`);
      const lwFlag = localStorage.getItem(`bid-retail-lowes:${bidId}`);
      const hdOn = hdFlag !== null ? hdFlag === "1" : true;
      const lwOn = lwFlag === "1";
      setRetailHomeDepot(hdOn);
      setRetailLowes(lwOn);
      setHdRetailEnabled(legacyRetail || hdOn || lwOn);
      setHdPreferSale(localStorage.getItem(`bid-hd-prefer-sale:${bidId}`) === "1");
    } catch {
      /* ignore */
    }
  }, [bidId]);

  const groupedIndices = useMemo(() => groupLineIndicesByTrade(lines), [lines]);

  const orderedTradeSections = useMemo(() => {
    const seen = new Set<BidMaterialTrade>();
    const out: BidMaterialTrade[] = [];
    for (const t of TRADE_SECTION_ORDER) {
      if ((groupedIndices.get(t)?.length ?? 0) > 0) {
        out.push(t);
        seen.add(t);
      }
    }
    for (const t of groupedIndices.keys()) {
      if (!seen.has(t)) out.push(t);
    }
    return out;
  }, [groupedIndices]);

  const initialJson = useRef(JSON.stringify(initialLines));
  const initialTemplatesJson = useRef(JSON.stringify(initialLineTemplates));
  useEffect(() => {
    const next = JSON.stringify(initialLines);
    if (next !== initialJson.current) {
      initialJson.current = next;
      setLines(
        initialLines.length
          ? initialLines.map((l) => ({
              ...l,
              line_id: l.line_id ?? crypto.randomUUID(),
            }))
          : [emptyLine()],
      );
      setLocalRefOverrides({});
      setUndoRemoveStack([]);
    }
  }, [initialLines]);

  useEffect(() => {
    const next = JSON.stringify(initialLineTemplates);
    if (next !== initialTemplatesJson.current) {
      initialTemplatesJson.current = next;
      setLineTemplates(initialLineTemplates);
    }
  }, [initialLineTemplates]);

  useEffect(() => {
    if (message?.success) setSectionOpen(false);
  }, [message?.success]);

  useEffect(() => {
    if (message?.error) setSectionOpen(true);
  }, [message?.error]);

  useEffect(() => {
    if (editIndex !== null && (editIndex < 0 || editIndex >= lines.length)) {
      setEditIndex(null);
    }
  }, [editIndex, lines.length]);

  useEffect(() => {
    if (editIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditIndex(null);
        return;
      }
      if (!e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToAdjacentLine(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToAdjacentLine(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editIndex, goToAdjacentLine]);

  useEffect(() => {
    setHdModalPaste("");
  }, [editIndex]);

  const showBlockingLoader =
    hdFetchPending ||
    pricedPending ||
    isPending ||
    libraryBusy;

  useEffect(() => {
    if (!showBlockingLoader) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showBlockingLoader]);

  const autoLinePricingRef = useRef<{ bidId: string; kicked: boolean }>({ bidId: "", kicked: false });
  useEffect(() => {
    if (scopeOnly) return;
    if (autoLinePricingRef.current.bidId !== bidId) {
      autoLinePricingRef.current = { bidId, kicked: false };
    }
    if (autoLinePricingRef.current.kicked) return;
    if (!initialServerLinesLookUnpriced(initialLines)) return;
    autoLinePricingRef.current.kicked = true;
    startLineEstimate(async () => {
      const res = await estimatePerLineQuotePricingAction(bidId);
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      setUndoRemoveStack([]);
      router.refresh();
    });
  }, [bidId, scopeOnly, initialLines, router]);

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }),
    [],
  );

  const subtotal = useMemo(
    () =>
      roundMoney(
        lines
          .filter((row) => String(row.name ?? "").trim().length > 0)
          .reduce((s, row) => {
            const ext = roundMoney(
              (Number(row.quantity) || 0) * (Number(row.unit_price_usd) || 0),
            );
            return s + ext;
          }, 0),
      ),
    [lines],
  );

  const namedCount = useMemo(
    () => lines.filter((row) => String(row.name ?? "").trim().length > 0).length,
    [lines],
  );

  function refPreviewUrl(line: BidMaterialLine): string | undefined {
    if (!line.line_id) return undefined;
    return localRefOverrides[line.line_id] ?? lineReferenceUrls[line.line_id];
  }

  function updateRow(i: number, patch: Partial<BidMaterialLine>) {
    setLines((prev) => {
      const next = [...prev];
      const prevRow = next[i];
      let row: BidMaterialLine = { ...prevRow, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "mockup_shelf_retailer")) {
        if (patch.mockup_shelf_retailer !== "hd" && patch.mockup_shelf_retailer !== "lw") {
          delete row.mockup_shelf_retailer;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "pricing_approved")) {
        if (patch.pricing_approved === true) {
          row.pricing_approved = true;
        } else {
          delete row.pricing_approved;
        }
      } else if (prevRow.pricing_approved === true && patchClearsPricingApproval(patch)) {
        delete row.pricing_approved;
      }
      const q = Math.max(0, Number(row.quantity) || 0);
      const explicitSell = Object.prototype.hasOwnProperty.call(patch, "unit_price_usd");
      let sell = Math.max(0, Number(row.unit_price_usd) || 0);
      if (!explicitSell) {
        const costOrMarkupChanged =
          patch.unit_cost_usd !== undefined || patch.markup_pct !== undefined;
        if (costOrMarkupChanged) {
          const c = Math.max(0, Number(row.unit_cost_usd) ?? 0);
          const mRaw =
            row.markup_pct !== undefined && row.markup_pct !== null
              ? Number(row.markup_pct)
              : 0;
          const m = Number.isNaN(mRaw) ? 0 : mRaw;
          sell = roundMoney(c * (1 + m / 100));
        }
      } else {
        sell = Math.max(0, Number(patch.unit_price_usd) || 0);
      }
      row.quantity = q;
      row.unit_price_usd = sell;
      row.extended_usd = roundMoney(q * sell);
      next[i] = row;
      return next;
    });
    setMessage(null);
  }

  /** Reference images are removed from storage only after a successful save (see updateBidQuoteLines). */
  function removeRow(i: number) {
    const snapshot = cloneLines(linesRef.current);
    setUndoRemoveStack((stack) => [...stack.slice(-(MAX_UNDO_REMOVES - 1)), snapshot]);
    setLines((prev) => {
      const next = prev.filter((_, j) => j !== i);
      return next.length ? next : [emptyLine()];
    });
    setMessage(null);
  }

  const undoLastRemove = useCallback(() => {
    setUndoRemoveStack((stack) => {
      if (stack.length === 0) return stack;
      const snapshot = stack[stack.length - 1];
      setLines(cloneLines(snapshot));
      setEditIndex(null);
      setMessage(null);
      return stack.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "z" || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (undoRemoveStack.length === 0) return;
      e.preventDefault();
      undoLastRemove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoRemoveStack.length, undoLastRemove]);

  function addRow() {
    setLines((prev) => {
      const next = [...prev, emptyLine()];
      setEditIndex(next.length - 1);
      return next;
    });
    setMessage(null);
  }

  function handleGeneratePricedBreakdown() {
    if (
      !window.confirm(
        "Replace all line items with an AI-priced takeoff from your saved scope (includes supplies like grout, fasteners, caulk, etc.)? Current lines will be replaced.",
      )
    ) {
      return;
    }
    setMessage(null);
    startPriced(async () => {
      const res = await generateBidPricedBreakdownAction(bidId);
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      setMessage({ success: true });
      setUndoRemoveStack([]);
      router.refresh();
    });
  }

  function handleEstimateLinePricing() {
    setMessage(null);
    startLineEstimate(async () => {
      const res = await estimatePerLineQuotePricingAction(bidId);
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      setUndoRemoveStack([]);
      router.refresh();
    });
  }

  async function handleHomeDepotFetch() {
    setHdFetchMessage(null);
    setHdUrlProbeReport(null);
    setMessage(null);
    if (!retailHomeDepot && !retailLowes) {
      setMessage({ error: "Choose Home Depot and/or Lowe's before fetching." });
      return;
    }
    setHdFetchPending(true);
    try {
      const res = await fetchHomeDepotPricingForBid(bidId, {
        preferSale: hdPreferSale,
        retailers: { homeDepot: retailHomeDepot, lowes: retailLowes },
      });
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      if (Array.isArray(res.material_estimate)) {
        const mat = res.material_estimate;
        const mapped =
          mat.length > 0
            ? mat.map((l) => ({
                ...l,
                line_id: l.line_id?.trim() ? l.line_id.trim() : crypto.randomUUID(),
              }))
            : [emptyLine()];
        setLines(mapped);
        initialJson.current = JSON.stringify(mat);
      }
      const parts: string[] = [
        `Updated ${res.updated} line${res.updated === 1 ? "" : "s"} (Home Depot: ${res.updated_hd}, Lowe's: ${res.updated_lowes}).`,
      ];
      if (res.retail_validation_corrections > 0) {
        parts.push(
          `${res.retail_validation_corrections} Home Depot line${res.retail_validation_corrections === 1 ? "" : "s"} refined after shelf check (better title match).`,
        );
      }
      if (res.retail_vision_validation_corrections > 0) {
        parts.push(
          `${res.retail_vision_validation_corrections} Home Depot line${res.retail_vision_validation_corrections === 1 ? "" : "s"} corrected after photo + product image check.`,
        );
      }
      if (res.retail_url_probe_hits > 0) {
        parts.push(
          `${res.retail_url_probe_hits} line${res.retail_url_probe_hits === 1 ? "" : "s"} linked to a Home Depot product URL from the AI pass (see details below).`,
        );
      }
      if (Array.isArray(res.retail_url_probe_report)) {
        setHdUrlProbeReport(
          res.retail_url_probe_report.length > 0 ? res.retail_url_probe_report : null,
        );
      } else {
        setHdUrlProbeReport(null);
      }
      if (res.sale_matches > 0) {
        parts.push(
          `${res.sale_matches} with sale-style pricing (per SerpApi — verify on the retailer site).`,
        );
      }
      if (res.skipped > 0) {
        parts.push(
          `${res.skipped} skipped (labor/permits, or non-retail lines such as demolition).`,
        );
      }
      if (res.failed.length > 0) {
        parts.push(`${res.failed.length} no match.`);
      }
      setHdFetchMessage(parts.join(" "));
      setUndoRemoveStack([]);
      router.refresh();
    } finally {
      setHdFetchPending(false);
    }
  }

  async function handleRetailApplyProductUrl(lineId: string, url: string) {
    if (!lineId) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (lower.includes("homedepot.com")) {
      const lineBefore = linesRef.current.find((l) => l.line_id === lineId);
      const beforeSnap = lineBefore ? pickRetailSnapshot(lineBefore) : {};
      setHdActionBusyId(lineId);
      setMessage(null);
      try {
        const res = await substituteBidLineHomeDepotFromUrl(bidId, lineId, url);
        if ("error" in res) {
          setMessage({ error: res.error });
          return;
        }
        if (Object.keys(beforeSnap).length > 0) {
          pushRetailUndoSnapshot(lineId, beforeSnap);
        }
        setHdModalPaste("");
        router.refresh();
      } finally {
        setHdActionBusyId(null);
      }
      return;
    }
    if (lower.includes("lowes.com")) {
      const lineBefore = linesRef.current.find((l) => l.line_id === lineId);
      const beforeSnap = lineBefore ? pickRetailSnapshot(lineBefore) : {};
      setHdActionBusyId(lineId);
      setMessage(null);
      try {
        const res = await substituteBidLineLowesFromUrl(bidId, lineId, url);
        if ("error" in res) {
          setMessage({ error: res.error });
          return;
        }
        if (Object.keys(beforeSnap).length > 0) {
          pushRetailUndoSnapshot(lineId, beforeSnap);
        }
        setHdModalPaste("");
        router.refresh();
      } finally {
        setHdActionBusyId(null);
      }
      return;
    }
    setMessage({ error: "Paste a homedepot.com or lowes.com product URL." });
  }

  function closeRetailTools() {
    setRetailToolsLineId(null);
    setRetailToolsMode(null);
    setRetailSimilarPack(null);
    setRetailSimilarVisitStack([]);
    setRetailPromptDraft("");
  }

  const pushSimilarVisit = useCallback((key: string) => {
    setRetailSimilarVisitStack((prev) => {
      if (prev[prev.length - 1] === key) return prev;
      return [...prev, key].slice(-20);
    });
  }, []);

  function pushRetailUndoSnapshot(lineId: string, snap: Partial<BidMaterialLine>) {
    if (Object.keys(snap).length === 0) return;
    const prev = retailUndoStacksRef.current[lineId] ?? [];
    retailUndoStacksRef.current = {
      ...retailUndoStacksRef.current,
      [lineId]: [...prev, snap].slice(-MAX_RETAIL_UNDO),
    };
    retailRedoStacksRef.current = {
      ...retailRedoStacksRef.current,
      [lineId]: [],
    };
    setRetailUndoVersion((v) => v + 1);
  }

  async function handleRetailUndo(lineId: string) {
    const stack = retailUndoStacksRef.current[lineId];
    if (!stack?.length) return;
    const snap = stack[stack.length - 1]!;
    const prevLines = linesRef.current;
    const idx = prevLines.findIndex((l) => l.line_id === lineId);
    if (idx === -1) return;

    const currentSnap = pickRetailSnapshot(prevLines[idx]!);
    const newUndo = stack.slice(0, -1);
    const newRedo = [...(retailRedoStacksRef.current[lineId] ?? []), currentSnap].slice(-MAX_RETAIL_UNDO);

    retailUndoStacksRef.current = {
      ...retailUndoStacksRef.current,
      [lineId]: newUndo,
    };
    retailRedoStacksRef.current = {
      ...retailRedoStacksRef.current,
      [lineId]: newRedo,
    };
    setRetailUndoVersion((v) => v + 1);

    const merged = applyRetailSnapshot(prevLines[idx]!, snap);
    const newLines = prevLines.map((l, i) => (i === idx ? merged : l));

    setHdActionBusyId(lineId);
    setMessage(null);
    setLines(newLines);
    try {
      const payload = newLines.filter((r) => String(r.name ?? "").trim().length > 0);
      const result = await updateBidQuoteLines(bidId, payload);
      if ("error" in result) {
        retailUndoStacksRef.current = {
          ...retailUndoStacksRef.current,
          [lineId]: [...newUndo, snap],
        };
        retailRedoStacksRef.current = {
          ...retailRedoStacksRef.current,
          [lineId]: newRedo.slice(0, -1),
        };
        setRetailUndoVersion((v) => v + 1);
        setLines(prevLines);
        setMessage({ error: result.error });
        return;
      }
      router.refresh();
    } finally {
      setHdActionBusyId(null);
    }
  }

  async function handleRetailRedo(lineId: string) {
    const redoStack = retailRedoStacksRef.current[lineId];
    if (!redoStack?.length) return;
    const snap = redoStack[redoStack.length - 1]!;
    const prevLines = linesRef.current;
    const idx = prevLines.findIndex((l) => l.line_id === lineId);
    if (idx === -1) return;

    const currentSnap = pickRetailSnapshot(prevLines[idx]!);
    const newRedo = redoStack.slice(0, -1);
    const newUndo = [...(retailUndoStacksRef.current[lineId] ?? []), currentSnap].slice(-MAX_RETAIL_UNDO);

    retailRedoStacksRef.current = {
      ...retailRedoStacksRef.current,
      [lineId]: newRedo,
    };
    retailUndoStacksRef.current = {
      ...retailUndoStacksRef.current,
      [lineId]: newUndo,
    };
    setRetailUndoVersion((v) => v + 1);

    const merged = applyRetailSnapshot(prevLines[idx]!, snap);
    const newLines = prevLines.map((l, i) => (i === idx ? merged : l));

    setHdActionBusyId(lineId);
    setMessage(null);
    setLines(newLines);
    try {
      const payload = newLines.filter((r) => String(r.name ?? "").trim().length > 0);
      const result = await updateBidQuoteLines(bidId, payload);
      if ("error" in result) {
        retailRedoStacksRef.current = {
          ...retailRedoStacksRef.current,
          [lineId]: [...newRedo, snap],
        };
        retailUndoStacksRef.current = {
          ...retailUndoStacksRef.current,
          [lineId]: newUndo.slice(0, -1),
        };
        setRetailUndoVersion((v) => v + 1);
        setLines(prevLines);
        setMessage({ error: result.error });
        return;
      }
      router.refresh();
    } finally {
      setHdActionBusyId(null);
    }
  }

  async function handleFetchSimilarProducts(lineId: string) {
    const row = linesRef.current.find((l) => l.line_id === lineId);
    if (!row?.line_id) return;
    const tab = winningRetailTabForLine(row);
    if (!tab) return;
    /** Widths and notes typed under “Describe instead” refine shelf search for Similar too. */
    const searchHint = retailPromptDraft.trim() || undefined;
    setMessage(null);
    setRetailToolsLineId(lineId);
    setRetailToolsMode("similar");
    setRetailSimilarPack(null);
    setRetailSimilarVisitStack([]);
    setHdActionBusyId(lineId);
    try {
      const excludeHd =
        tab === "hd"
          ? [retailSkuDigits(row.hd_product_id)].filter((id) => id.length >= 6 && id.length <= 12)
          : [];
      const excludeLw =
        tab === "lw"
          ? [retailSkuDigits(row.lw_product_id)].filter((id) => id.length >= 6 && id.length <= 12)
          : [];
      const res = await fetchRetailShelfCandidatesForLineAction(bidId, lineId, {
        preferSale: hdPreferSale,
        includeHomeDepot: tab === "hd",
        includeLowes: tab === "lw",
        ...(excludeHd.length > 0 ? { excludeHomeDepotProductIds: excludeHd } : {}),
        ...(excludeLw.length > 0 ? { excludeLowesProductIds: excludeLw } : {}),
        perStoreMax: 8,
        ...(searchHint ? { searchHint } : {}),
      });
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      setRetailSimilarPack({
        q: res.q,
        home_depot: res.home_depot,
        lowes: res.lowes,
      });
      const firstHits = tab === "hd" ? res.home_depot : res.lowes;
      if (firstHits[0]) {
        setRetailSimilarVisitStack([retailSimilarHitKey(firstHits[0])]);
      } else {
        setRetailSimilarVisitStack([]);
      }
    } finally {
      setHdActionBusyId(null);
    }
  }

  async function handleApplySimilarHit(
    lineId: string,
    retailer: "home_depot" | "lowes",
    hit: HomeDepotSearchHit | LowesSearchHit,
  ) {
    if (!lineId) return;
    const lineBefore = linesRef.current.find((l) => l.line_id === lineId);
    const beforeSnap = lineBefore ? pickRetailSnapshot(lineBefore) : {};
    setHdActionBusyId(lineId);
    setMessage(null);
    try {
      const res = await applyRetailShelfCandidateChoiceAction(bidId, lineId, { retailer, hit });
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      if (Object.keys(beforeSnap).length > 0) {
        pushRetailUndoSnapshot(lineId, beforeSnap);
      }
      setLines(
        res.lines.map((l) => ({
          ...l,
          line_id: l.line_id ?? crypto.randomUUID(),
        })),
      );
      closeRetailTools();
      router.refresh();
    } finally {
      setHdActionBusyId(null);
    }
  }

  async function handleRetailPromptReplace(lineId: string, tab: "hd" | "lw") {
    const prompt = retailPromptDraft.trim();
    if (!lineId || !prompt) return;
    const lineBefore = linesRef.current.find((l) => l.line_id === lineId);
    const beforeSnap = lineBefore ? pickRetailSnapshot(lineBefore) : {};
    setHdActionBusyId(lineId);
    setMessage(null);
    try {
      if (tab === "hd") {
        const res = await replaceBidLineHomeDepotFromPrompt(bidId, lineId, prompt, {
          preferSale: hdPreferSale,
        });
        if ("error" in res) {
          setMessage({ error: res.error });
          return;
        }
      } else {
        const res = await replaceBidLineLowesFromPrompt(bidId, lineId, prompt, {
          preferSale: hdPreferSale,
        });
        if ("error" in res) {
          setMessage({ error: res.error });
          return;
        }
      }
      if (Object.keys(beforeSnap).length > 0) {
        pushRetailUndoSnapshot(lineId, beforeSnap);
      }
      closeRetailTools();
      router.refresh();
    } finally {
      setHdActionBusyId(null);
    }
  }

  function renderRetailReplacementTools(row: BidMaterialLine, tab: "hd" | "lw") {
    const lineId = row.line_id!;
    const openHere = retailToolsLineId === lineId;
    const busy = hdActionBusyId === lineId;
    const storeLabel = tab === "hd" ? "Home Depot" : "Lowe's";
    const retailer: "home_depot" | "lowes" = tab === "hd" ? "home_depot" : "lowes";
    const hits = tab === "hd" ? retailSimilarPack?.home_depot ?? [] : retailSimilarPack?.lowes ?? [];
    const similarOpen = openHere && retailToolsMode === "similar";
    const promptOpen = openHere && retailToolsMode === "prompt";
    const similarBrowseTop =
      retailSimilarVisitStack.length > 0
        ? retailSimilarVisitStack[retailSimilarVisitStack.length - 1]!
        : null;

    const canRetailUndo =
      retailUndoVersion >= 0 && (retailUndoStacksRef.current[lineId]?.length ?? 0) > 0;
    const canRetailRedo =
      retailUndoVersion >= 0 && (retailRedoStacksRef.current[lineId]?.length ?? 0) > 0;

    return (
      <div className="mt-3 space-y-3 rounded-xl border border-border/40 bg-muted/20 p-3 ring-1 ring-border/15">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">Change linked product</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Same store ({storeLabel}). Pick a similar SKU or describe what you need. Back / forward for
              shelf history live inside each panel below.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-border/60 bg-background/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {tab === "hd" ? "HD" : "LW"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
          <Button
            type="button"
            variant={similarOpen ? "secondary" : "outline"}
            className="min-h-[3rem] h-auto w-full touch-manipulation flex-col gap-0.5 py-2.5 text-left sm:min-h-[2.875rem] sm:flex-row sm:items-center sm:justify-start sm:gap-2 sm:py-0"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              if (similarOpen && !busy) {
                closeRetailTools();
                return;
              }
              void handleFetchSimilarProducts(lineId);
            }}
          >
            {busy && similarOpen ? (
              <span className="inline-flex w-full items-center justify-center gap-2 sm:justify-start">
                <Loader2 className="size-[1.125rem] shrink-0 animate-spin" aria-hidden />
                <span className="text-sm font-medium">Searching…</span>
              </span>
            ) : (
              <>
                <span className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-start">
                  <PackageSearch className="size-[1.125rem] shrink-0 opacity-80" aria-hidden />
                  <span className="text-sm font-semibold">
                    {similarOpen ? "Close matches" : "Similar products"}
                  </span>
                </span>
                <span className="hidden text-[11px] font-normal text-muted-foreground sm:block">
                  Other SKUs, same search
                </span>
                <span className="text-center text-[11px] font-normal leading-tight text-muted-foreground sm:hidden">
                  Other SKUs from the same search
                </span>
              </>
            )}
          </Button>
          <Button
            type="button"
            variant={promptOpen ? "secondary" : "outline"}
            className="min-h-[3rem] h-auto w-full touch-manipulation flex-col gap-0.5 py-2.5 text-left sm:min-h-[2.875rem] sm:flex-row sm:items-center sm:justify-start sm:gap-2 sm:py-0"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              if (promptOpen) {
                closeRetailTools();
                return;
              }
              setRetailToolsLineId(lineId);
              setRetailToolsMode("prompt");
              setRetailSimilarPack(null);
              setRetailSimilarVisitStack([]);
              setRetailPromptDraft("");
            }}
          >
            <span className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-start">
              <PenLine className="size-[1.125rem] shrink-0 opacity-80" aria-hidden />
              <span className="text-sm font-semibold">
                {promptOpen ? "Close" : "Describe instead"}
              </span>
            </span>
            <span className="hidden text-[11px] font-normal text-muted-foreground sm:block">
              Free-text search at {storeLabel}
            </span>
            <span className="text-center text-[11px] font-normal leading-tight text-muted-foreground sm:hidden">
              Tell us size, finish, brand — we search {storeLabel}
            </span>
          </Button>
        </div>

        {similarOpen ? (
          <div className="space-y-2.5 rounded-xl border border-border/50 bg-background/95 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {(canRetailUndo || canRetailRedo) && (
                  <div className="flex shrink-0 items-center gap-1" data-retail-history-v={retailUndoVersion}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 touch-manipulation rounded-full border border-border/50"
                      disabled={busy || !canRetailUndo}
                      aria-label="Previous shelf listing"
                      title="Previous listing"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRetailUndo(lineId);
                      }}
                    >
                      <ArrowLeft className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 touch-manipulation rounded-full border border-border/50"
                      disabled={busy || !canRetailRedo}
                      aria-label="Next shelf listing"
                      title="Forward"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRetailRedo(lineId);
                      }}
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>
                  </div>
                )}
                {hits.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 touch-manipulation rounded-full border border-border/50"
                    disabled={busy || retailSimilarVisitStack.length <= 1}
                    aria-label="Previous product in this match list"
                    title="Previous product in list"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRetailSimilarVisitStack((s) => (s.length <= 1 ? s : s.slice(0, -1)));
                    }}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                ) : null}
                <p className="min-w-0 text-xs font-semibold text-foreground">
                  {busy ? "Looking up options…" : `Matches${hits.length ? ` (${hits.length})` : ""}`}
                </p>
              </div>
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            {retailSimilarPack?.q ? (
              <p className="rounded-lg bg-muted/50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground break-words">
                {retailSimilarPack.q}
              </p>
            ) : null}
            {!busy && hits.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 bg-muted/25 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                No other shelf matches yet. Use{" "}
                <span className="font-medium text-foreground">Describe instead</span> and add details like
                dimensions or finish.
              </p>
            ) : null}
            <ul className="max-h-[min(52vh,380px)] space-y-2.5 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] pr-0.5">
              {hits.map((h) => {
                const key = retailSimilarHitKey(h);
                const isBrowseFocus = similarBrowseTop != null && similarBrowseTop === key;
                return (
                  <li
                    key={key}
                    className={`relative cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm ring-1 ring-border/10 ${
                      isBrowseFocus
                        ? "border-primary/50 ring-2 ring-primary/35"
                        : "border-border/60"
                    }`}
                    onClick={() => pushSimilarVisit(key)}
                  >
                    {isBrowseFocus && retailSimilarVisitStack.length > 1 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-2 top-2 z-10 size-9 rounded-full border border-border/60 shadow-sm"
                        disabled={busy}
                        aria-label="Previous product in this list"
                        title="Previous product"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRetailSimilarVisitStack((s) => (s.length <= 1 ? s : s.slice(0, -1)));
                        }}
                      >
                        <ChevronLeft className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                    <div className="flex gap-3 p-3">
                      {h.image_url ? (
                        <button
                          type="button"
                          className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-border/50 bg-muted active:opacity-90"
                          onClick={(e) => {
                            e.stopPropagation();
                            pushSimilarVisit(key);
                            setLightboxSrc(retailImageUrlForLightbox(h.image_url!));
                          }}
                          aria-label="View product image larger"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- retail CDN */}
                          <img src={h.image_url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <div className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-lg bg-muted" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-3 text-[13px] font-medium leading-snug text-foreground">
                          {h.title}
                        </p>
                        <p className="mt-1.5 text-base font-bold tabular-nums tracking-tight text-foreground">
                          {fmt.format(h.price_usd)}
                        </p>
                        <Button
                          type="button"
                          className="mt-3 min-h-12 w-full touch-manipulation rounded-xl text-sm font-semibold"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleApplySimilarHit(lineId, retailer, h);
                          }}
                        >
                          Use this product for pricing & mockup
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {promptOpen ? (
          <div className="space-y-3 rounded-xl border border-border/50 bg-background/95 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {(canRetailUndo || canRetailRedo) && (
                  <div className="flex shrink-0 items-center gap-1 pt-0.5" data-retail-history-v={retailUndoVersion}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 touch-manipulation rounded-full border border-border/50"
                      disabled={busy || !canRetailUndo}
                      aria-label="Previous shelf listing"
                      title="Previous listing"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRetailUndo(lineId);
                      }}
                    >
                      <ArrowLeft className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 touch-manipulation rounded-full border border-border/50"
                      disabled={busy || !canRetailRedo}
                      aria-label="Next shelf listing"
                      title="Forward"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRetailRedo(lineId);
                      }}
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Label className="text-xs font-semibold text-foreground" htmlFor={`retail-prompt-${lineId}`}>
                    What should we look for?
                  </Label>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {storeLabel} — include width in inches (e.g. 100 inch double vanity), color, style, or brand.
                  </p>
                </div>
              </div>
            </div>
            <Textarea
              id={`retail-prompt-${lineId}`}
              className="min-h-[7.5rem] resize-y text-base leading-normal sm:text-sm"
              placeholder="Example: at least 100 inch bathroom vanity cabinet double sink white shaker…"
              value={retailPromptDraft}
              onChange={(e) => setRetailPromptDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <Button
              type="button"
              className="min-h-12 w-full touch-manipulation rounded-xl text-base font-semibold sm:text-sm"
              disabled={busy || !retailPromptDraft.trim()}
              onClick={(e) => {
                e.stopPropagation();
                void handleRetailPromptReplace(lineId, tab);
              }}
            >
              {busy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="size-[1.125rem] shrink-0 animate-spin" aria-hidden />
                  Searching {storeLabel}…
                </span>
              ) : (
                <span className="inline-flex items-center justify-center gap-2">
                  <Search className="size-4 shrink-0 opacity-90 sm:hidden" aria-hidden />
                  Search {storeLabel}
                </span>
              )}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  function addScopeLine() {
    setLines((prev) => {
      const next = [...prev, emptyLine()];
      setEditIndex(next.length - 1);
      return next;
    });
    setMessage(null);
  }

  function handleSave() {
    setMessage(null);
    const payload = lines.filter((r) => String(r.name ?? "").trim().length > 0);
    startTransition(async () => {
      const result = await updateBidQuoteLines(bidId, payload);
      if ("error" in result) {
        setMessage({ error: result.error });
        return;
      }
      setMessage({ success: true });
      setUndoRemoveStack([]);
      router.refresh();
    });
  }

  async function handleRefFile(lineId: string, file: File | null) {
    if (!file || !lineId) return;
    setUploadingLineId(lineId);
    setMessage(null);
    try {
      const result = await uploadBidLineReferencePhoto(bidId, lineId, file);
      if ("error" in result) {
        setMessage({ error: result.error });
        return;
      }
      setLocalRefOverrides((prev) => ({ ...prev, [lineId]: result.signedUrl }));
      setLines((prev) =>
        prev.map((row) =>
          row.line_id === lineId
            ? {
                ...row,
                reference_storage_path: result.storagePath,
                mockup_include: true,
              }
            : row,
        ),
      );
    } finally {
      setUploadingLineId(null);
    }
  }

  async function handleClearRef(lineId: string) {
    setUploadingLineId(lineId);
    setMessage(null);
    try {
      const result = await clearBidLineReferencePhoto(bidId, lineId);
      if ("error" in result) {
        setMessage({ error: result.error });
        return;
      }
      setLocalRefOverrides((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setLines((prev) =>
        prev.map((row) => {
          if (row.line_id !== lineId) return row;
          const next: BidMaterialLine = { ...row, reference_storage_path: undefined };
          const eligible = lineHasMockupVisualReference(next);
          return {
            ...next,
            mockup_include: eligible && row.mockup_include !== false ? true : false,
          };
        }),
      );
    } finally {
      setUploadingLineId(null);
    }
  }

  function insertTemplateLine(t: BidLineTemplate) {
    setLines((prev) => {
      const next = [...prev, lineFromTemplate(t)];
      if (scopeOnly) {
        setEditIndex(next.length - 1);
      }
      return next;
    });
    setMessage(null);
  }

  async function removeTemplateFromLibrary(templateId: string) {
    setLibraryBusy(true);
    setMessage(null);
    try {
      const res = await deleteCompanyLineTemplate(bidId, templateId);
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      setLineTemplates((prev) => prev.filter((x) => x.id !== templateId));
    } finally {
      setLibraryBusy(false);
    }
  }

  async function handleSaveCurrentLineToLibrary() {
    if (editIndex === null) return;
    const row = lines[editIndex];
    if (!String(row.name ?? "").trim()) {
      setMessage({ error: "Add a description before saving to your library." });
      return;
    }
    setLibraryBusy(true);
    setMessage(null);
    try {
      const res = await saveCompanyLineTemplate(bidId, {
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        trade: row.trade,
        notes: row.notes,
        default_unit_price_usd: row.unit_price_usd,
      });
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      setLineTemplates((prev) => [res.template, ...prev]);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function handleSaveRowToLibrary(i: number) {
    const row = lines[i];
    if (!String(row.name ?? "").trim()) {
      setMessage({ error: "Add a description before saving to your library." });
      return;
    }
    setLibraryBusy(true);
    setMessage(null);
    try {
      const res = await saveCompanyLineTemplate(bidId, {
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        trade: row.trade,
        notes: row.notes,
        default_unit_price_usd: row.unit_price_usd,
      });
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      setLineTemplates((prev) => [res.template, ...prev]);
    } finally {
      setLibraryBusy(false);
    }
  }

  const materialJson = JSON.stringify(lines);
  if (linesSnapshotOutRef) {
    linesSnapshotOutRef.current = materialJson;
  }

  return (
    <>
      {materialSnapshotFormId && !scopeOnly ? (
        <input
          type="hidden"
          name="material_estimate_snapshot"
          form={materialSnapshotFormId}
          value={materialJson}
          readOnly
          aria-hidden
        />
      ) : null}
      {mockupRefPreview && !scopeOnly ? (
        <div className="mb-4 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-3 shadow-sm ring-1 ring-primary/10 sm:px-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            What the next mockup will send
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Shown here even when <span className="font-medium text-foreground">Line items</span> is collapsed.
            Shelf previews use the same URL stored on the line (not the hi-res variant) so your browser is more
            likely to display them. When you click{" "}
            <span className="font-medium text-foreground">Regenerate mockup</span>, these go to the AI in this
            order.
          </p>
          {mockupRefSlots.length === 0 ? (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              No mockup product images yet — add shelf links or reference photos in Line items, then regenerate.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {mockupRefSlots.map((slot, idx) => {
                const lid = slot.line_id ?? "";
                const signed =
                  slot.kind === "contractor" && lid
                    ? localRefOverrides[lid] ?? lineReferenceUrls[lid]
                    : "";
                const retailSrc =
                  slot.kind === "retail" && slot.shelfImageUrl ? String(slot.shelfImageUrl).trim() : "";
                const thumbSrc = slot.kind === "retail" ? retailSrc : signed;
                const thumbTitle =
                  slot.kind === "retail"
                    ? `${slot.storeLabel ?? "Shelf"} preview`
                    : "Contractor photo — save the quote or refresh if you just uploaded.";
                return (
                  <li
                    key={`${slot.kind}-${lid || slot.lineName}-${idx}`}
                    className="flex items-center gap-2.5 text-xs"
                  >
                    <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{idx + 1}.</span>
                    <MockupSlotThumb src={thumbSrc} title={thumbTitle} />
                    <span className="min-w-0 leading-snug">
                      <span className="font-medium text-foreground">{slot.lineName}</span>
                      {slot.kind === "retail" ? (
                        <span className="text-muted-foreground"> — {slot.storeLabel} shelf</span>
                      ) : (
                        <span className="text-muted-foreground"> — contractor photo</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {vanityMockupGaps.length > 0 ? (
            <div className="mt-2.5 rounded-md border border-amber-500/35 bg-amber-500/[0.08] px-2.5 py-2 text-[11px] leading-snug text-amber-950 dark:text-amber-100">
              <span className="font-medium">Vanity line still needs an image:</span>{" "}
              {vanityMockupGaps.map((l) => l.name.trim()).join("; ")} — add a shelf product image or contractor
              reference so the mockup can match the cabinet.
            </div>
          ) : null}
        </div>
      ) : null}
    <BidCollapsibleSection
      title={scopeOnly ? "Scope by trade" : "Line items"}
      open={sectionOpen}
      onOpenChange={setSectionOpen}
      summaryWhenCollapsed={
        <span>
          {namedCount} line{namedCount === 1 ? "" : "s"}
          {scopeOnly ? "" : ` · ${fmt.format(subtotal)} subtotal`}
        </span>
      }
    >
      <div className="space-y-3">
      {message?.error ? (
        <p className="text-sm text-destructive">{message.error}</p>
      ) : null}
      {message?.success ? (
        <p className="text-sm text-muted-foreground">Quote saved.</p>
      ) : null}

      {!scopeOnly ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            When you open pricing, we run an <span className="font-medium text-foreground">AI line estimate</span>{" "}
            automatically if sell prices are still blank (from your saved scope). Use{" "}
            <span className="font-medium text-foreground">Re-estimate</span> any time after scope changes.{" "}
            <span className="font-medium text-foreground">Retail shelf fetch</span> below is optional — it links real
            SKUs for shelf-based costs and mockups; your estimate does not depend on it.
          </p>
          {lineEstimatePending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              Running AI line estimate from your saved scope…
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 text-[11px] sm:text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/35 px-2.5 py-1 font-medium text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full bg-sky-500" aria-hidden />
              Awaiting estimate
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/35 px-2.5 py-1 font-medium text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              Estimated — review
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/35 px-2.5 py-1 font-medium text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full bg-emerald-600" aria-hidden />
              Approved
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11 w-full touch-manipulation sm:min-h-9 sm:w-auto"
              disabled={
                lineEstimatePending || pricedPending || namedCount === 0
              }
              onClick={handleEstimateLinePricing}
            >
              {lineEstimatePending ? "Estimating…" : "Re-estimate line pricing"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11 w-full touch-manipulation sm:min-h-9 sm:w-auto"
              disabled={pricedPending || lineEstimatePending || namedCount === 0}
              onClick={handleGeneratePricedBreakdown}
            >
              {pricedPending ? "Generating…" : "AI priced breakdown"}
            </Button>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/15 p-3 shadow-sm sm:p-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 touch-manipulation">
              <input
                type="checkbox"
                checked={hdRetailEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setHdRetailEnabled(on);
                  try {
                    if (on) {
                      localStorage.setItem(`bid-hd-retail:${bidId}`, "1");
                      localStorage.setItem(`bid-retail-hd:${bidId}`, "1");
                      localStorage.setItem(`bid-retail-lowes:${bidId}`, "0");
                      setRetailHomeDepot(true);
                      setRetailLowes(false);
                    } else {
                      localStorage.removeItem(`bid-hd-retail:${bidId}`);
                    }
                  } catch {
                    /* ignore */
                  }
                }}
                className="size-5 shrink-0 rounded border-input"
              />
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                Optional retail shelf pricing
              </span>
            </label>
            {hdRetailEnabled ? (
              <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
                <div className="flex flex-wrap gap-x-5 gap-y-2 pl-1">
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 touch-manipulation">
                    <input
                      type="checkbox"
                      checked={retailHomeDepot}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setRetailHomeDepot(on);
                        try {
                          localStorage.setItem(`bid-retail-hd:${bidId}`, on ? "1" : "0");
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="size-4 shrink-0 rounded border-input"
                    />
                    <span className="text-sm">Home Depot</span>
                  </label>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 touch-manipulation">
                    <input
                      type="checkbox"
                      checked={retailLowes}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setRetailLowes(on);
                        try {
                          localStorage.setItem(`bid-retail-lowes:${bidId}`, on ? "1" : "0");
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="size-4 shrink-0 rounded border-input"
                    />
                    <span className="text-sm">Lowe&apos;s</span>
                  </label>
                </div>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 pl-1 touch-manipulation">
                  <input
                    type="checkbox"
                    checked={hdPreferSale}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setHdPreferSale(on);
                      try {
                        if (on) {
                          localStorage.setItem(`bid-hd-prefer-sale:${bidId}`, "1");
                        } else {
                          localStorage.removeItem(`bid-hd-prefer-sale:${bidId}`);
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="size-4 shrink-0 rounded border-input"
                  />
                  <span className="text-sm">Prefer sale prices</span>
                </label>
                <p className="pl-1 text-xs font-medium text-foreground">
                  Optional add-on: link real retailer listings when you want shelf-accurate material costs and better
                  mockup references. Skip this if you already like your AI line prices.
                </p>
                <p className="pl-1 text-xs leading-relaxed text-muted-foreground">
                  Bulk fetch searches each enabled store, then keeps{" "}
                  <span className="font-medium text-foreground">one best-priced shelf match per line</span> for
                  your estimate and mockup. Add a job-site ZIP for more accurate local Home Depot pricing. Paste a
                  product URL when editing a line if you want a specific listing.
                </p>
                <p className="pl-1 text-xs leading-relaxed text-muted-foreground">
                  After photos, mockup images use Google Vertex Gemini on the server when{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">GOOGLE_CLOUD_PROJECT</code> is set
                  (unless you set <code className="rounded bg-muted px-1 py-0.5 text-[10px]">MOCKUP_IMAGE_PROVIDER=openai</code> for local dev). If Vertex is misconfigured or the image call fails, the estimate shows that error.
                </p>
                <Button
                  type="button"
                  variant="default"
                  className="min-h-11 w-full touch-manipulation sm:w-auto"
                  disabled={
                    hdFetchPending || namedCount === 0 || (!retailHomeDepot && !retailLowes)
                  }
                  onClick={() => void handleHomeDepotFetch()}
                >
                  {hdFetchPending ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                      Fetching store prices…
                    </span>
                  ) : (
                    "Fetch store prices (optional)"
                  )}
                </Button>
                {hdFetchPending ? (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full w-2/5 animate-pulse rounded-full bg-primary/55" />
                  </div>
                ) : null}
                {hdFetchMessage ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">{hdFetchMessage}</p>
                ) : null}
                {hdUrlProbeReport && hdUrlProbeReport.length > 0 ? (
                  <details className="mt-2 rounded-lg border border-border/70 bg-muted/25 px-2.5 py-2 text-left">
                    <summary className="cursor-pointer text-xs font-medium text-foreground">
                      OpenAI Home Depot URL plan (this fetch)
                    </summary>
                    <ul className="mt-2 max-h-64 space-y-3 overflow-y-auto text-xs leading-snug">
                      {hdUrlProbeReport.map((row) => (
                        <li
                          key={row.plan_index}
                          className="border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
                        >
                          <div className="font-medium text-foreground">
                            #{row.plan_index} — {row.line_name}
                          </div>
                          <div className="text-muted-foreground">
                            Shoppable at Home Depot: {row.shoppable_hd ? "yes" : "no"}
                          </div>
                          {row.serp_candidate_urls && row.serp_candidate_urls.length > 0 ? (
                            <div className="mt-1.5">
                              <div className="text-[11px] font-medium text-muted-foreground">
                                Serp search candidates (real links from Home Depot engine)
                              </div>
                              <ul className="mt-0.5 list-none space-y-0.5 pl-0">
                                {row.serp_candidate_urls.map((u) => (
                                  <li key={`cand-${u}`} className="break-all text-[11px]">
                                    <a
                                      href={u}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:text-foreground"
                                    >
                                      {u}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {row.homedepot_urls.length > 0 ? (
                            <ul className="mt-1.5 list-none space-y-1 pl-0">
                              {row.homedepot_urls.map((u) => (
                                <li key={u} className="break-all">
                                  <a
                                    href={u}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                                  >
                                    {u}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-muted-foreground">
                              No product URLs in model output (line still uses text search if shoppable).
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {lineTemplates.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm shadow-sm sm:px-4">
          <p className="text-xs font-semibold tracking-tight text-foreground">Company library</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Click a saved line to insert it into this quote. Library items are not part of scope until you
            add them.
          </p>
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-background/95 p-1.5">
            {lineTemplates.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-muted/60"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground"
                  disabled={libraryBusy}
                  onClick={() => insertTemplateLine(t)}
                >
                  {t.name}
                </button>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t.quantity} {t.unit}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  disabled={libraryBusy}
                  aria-label={`Remove ${t.name} from library`}
                  onClick={() => void removeTemplateFromLibrary(t.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {scopeOnly ? (
        <>
          <div className="space-y-5">
            {orderedTradeSections.map((trade) => {
              const indices = groupedIndices.get(trade);
              if (!indices?.length) return null;
              return (
                <section key={trade} className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {tradeLabel(trade)}
                  </h3>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {indices.map((i) => {
                      const row = lines[i];
                      const title = row.name.trim() || "Untitled line";
                      const notePrev = row.notes?.trim()
                        ? row.notes.length > 72
                          ? `${row.notes.slice(0, 72)}…`
                          : row.notes
                        : null;
                      return (
                        <li key={row.line_id ?? `idx-${i}`}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-3 text-left transition hover:bg-muted/50 sm:py-2.5"
                            onClick={() => setEditIndex(i)}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="line-clamp-2 text-sm font-medium leading-snug">{title}</p>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {row.quantity} {row.unit}
                                </span>
                              </div>
                              {notePrev ? (
                                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{notePrev}</p>
                              ) : null}
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          {editIndex !== null && lines[editIndex] ? (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="scope-line-edit-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
                aria-label="Close"
                onClick={() => setEditIndex(null)}
              />
              <div
                className="relative z-10 max-h-[min(92vh,900px)] w-full max-w-lg overflow-y-auto rounded-t-[1.25rem] border border-border/60 bg-background px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-xl sm:rounded-2xl sm:p-5 sm:pb-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden"
                  aria-hidden
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-10 shrink-0 touch-manipulation sm:size-9"
                    disabled={editIndex <= 0}
                    aria-label="Previous line"
                    title="Previous line (Alt+←)"
                    onClick={() => goToAdjacentLine(-1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div className="min-w-0 flex-1 text-center">
                    <h4 id="scope-line-edit-title" className="text-base font-semibold tracking-tight">
                      Edit line
                    </h4>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {editIndex + 1} of {lines.length}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-10 shrink-0 touch-manipulation sm:size-9"
                    disabled={editIndex >= lines.length - 1}
                    aria-label="Next line"
                    title="Next line (Alt+→)"
                    onClick={() => goToAdjacentLine(1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <div className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={lines[editIndex].name}
                      onChange={(e) => updateRow(editIndex, { name: e.target.value })}
                      placeholder="What’s included"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Trade</Label>
                    <select
                      className="flex min-h-11 w-full touch-manipulation rounded-md border border-input bg-background px-3 text-sm sm:min-h-10"
                      value={lines[editIndex].trade ?? "general"}
                      onChange={(e) =>
                        updateRow(editIndex, { trade: e.target.value as BidMaterialTrade })
                      }
                    >
                      {TRADE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={String(lines[editIndex].quantity)}
                        onChange={(e) =>
                          updateRow(editIndex, { quantity: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Unit</Label>
                      <Input
                        value={lines[editIndex].unit}
                        onChange={(e) => updateRow(editIndex, { unit: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      value={lines[editIndex].notes ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateRow(editIndex, { notes: v.length ? v : undefined });
                      }}
                      rows={3}
                      className="text-sm"
                      placeholder="Specs, color, SKU…"
                    />
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    Reuse this line on your other estimates (same company account).
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    disabled={libraryBusy || !lines[editIndex].name.trim()}
                    onClick={() => void handleSaveCurrentLineToLibrary()}
                  >
                    <Bookmark className="mr-1.5 size-4" />
                    Remember for future estimates
                  </Button>
                </div>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11 touch-manipulation sm:min-h-9"
                    size="sm"
                    onClick={() => {
                      void removeRow(editIndex);
                      setEditIndex(null);
                    }}
                  >
                    Remove line
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 touch-manipulation sm:min-h-9"
                    onClick={() => setEditIndex(null)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="space-y-5">
            {orderedTradeSections.map((trade) => {
              const indices = groupedIndices.get(trade);
              if (!indices?.length) return null;
              return (
                <section key={trade} className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {tradeLabel(trade)}
                  </h3>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {indices.map((i) => {
                      const row = lines[i];
                      const retailTab = winningRetailTabForLine(row);
                      const canMockup = rowCanUseMockup(row, localRefOverrides);
                      const title = row.name.trim() || "Untitled line";
                      const notePrev = row.notes?.trim()
                        ? row.notes.length > 56
                          ? `${row.notes.slice(0, 56)}…`
                          : row.notes
                        : null;
                      return (
                        <li key={row.line_id ?? `idx-${i}`}>
                          <div
                            className={`flex w-full items-start gap-2 px-3 py-3 text-left transition sm:py-2.5 ${pricingRowSurfaceClass(row)}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div
                                role="button"
                                tabIndex={0}
                                aria-label={`Edit line: ${title}`}
                                className="cursor-pointer rounded-md text-left outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setEditIndex(i)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setEditIndex(i);
                                  }
                                }}
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <p className="line-clamp-2 text-sm font-medium leading-snug">{title}</p>
                                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                    {fmt.format(row.extended_usd)}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                  <span className="tabular-nums">
                                    {row.quantity} {row.unit}
                                  </span>
                                  {row.unit_cost_usd !== undefined && row.unit_cost_usd > 0 ? (
                                    <span>
                                      Est. {fmt.format(row.unit_cost_usd)}/{row.unit}
                                    </span>
                                  ) : null}
                                </div>
                                {notePrev ? (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{notePrev}</p>
                                ) : null}
                              </div>
                              {hdRetailEnabled && row.line_id ? (
                                <div
                                  className="mt-2 space-y-3 rounded-2xl border border-border/50 bg-muted/20 p-3 shadow-sm ring-1 ring-border/10 sm:p-3.5"
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  {lineHasDualRetailShelfImagesForMockup(row) ? (
                                    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-background/70 px-2 py-1.5">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Mockup shelf photo
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        <Button
                                          type="button"
                                          variant={
                                            effectiveMockupShelfRetailerForLine(row) === "hd"
                                              ? "default"
                                              : "outline"
                                          }
                                          size="sm"
                                          className="h-7 px-2 text-[11px]"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateRow(i, { mockup_shelf_retailer: "hd" });
                                          }}
                                        >
                                          Home Depot
                                        </Button>
                                        <Button
                                          type="button"
                                          variant={
                                            effectiveMockupShelfRetailerForLine(row) === "lw"
                                              ? "default"
                                              : "outline"
                                          }
                                          size="sm"
                                          className="h-7 px-2 text-[11px]"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateRow(i, { mockup_shelf_retailer: "lw" });
                                          }}
                                        >
                                          Lowe&apos;s
                                        </Button>
                                        {row.mockup_shelf_retailer ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-[11px] text-muted-foreground"
                                            title="Use the same store as the primary shelf price (lowest unit)"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              updateRow(i, { mockup_shelf_retailer: undefined });
                                            }}
                                          >
                                            Auto
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                  ) : null}
                                  {(() => {
                                    const tab = winningRetailTabForLine(row);
                                    if (!tab) {
                                      return (
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                          No store link on this line yet. Run bulk fetch above or paste a product URL
                                          when you edit this line.
                                        </p>
                                      );
                                    }
                                    const mockPick = catalogRetailImageUrlForMockup(row);
                                    if (tab === "hd") {
                                      const hdTrim = row.hd_image_url?.trim();
                                      const mockUsesHd = Boolean(
                                        mockPick && hdTrim && mockPick === hdTrim,
                                      );
                                      return (
                                        <div className="rounded-xl border border-border/60 bg-background/90 p-3 shadow-sm">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            Home Depot
                                            {mockUsesHd ? (
                                              <span className="ml-1 font-normal normal-case text-emerald-700 dark:text-emerald-400">
                                                — mockup uses this shelf photo
                                              </span>
                                            ) : null}
                                          </p>
                                          <div className="mt-2 flex max-w-full items-start gap-3">
                                            {row.hd_image_url ? (
                                              <button
                                                type="button"
                                                className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted shadow-sm ring-offset-background transition active:scale-[0.98] hover:opacity-95 hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setLightboxSrc(
                                                    retailImageUrlForLightbox(row.hd_image_url!),
                                                  );
                                                }}
                                                aria-label="View Home Depot product image larger"
                                              >
                                                <img
                                                  src={row.hd_image_url}
                                                  alt=""
                                                  className="h-full w-full object-cover"
                                                />
                                              </button>
                                            ) : null}
                                            <div className="min-w-0 flex-1">
                                              <a
                                                href={normalizeHomedepotProductUrl(row.hd_product_url!)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex min-h-11 min-w-0 max-w-full items-start gap-2 rounded-lg text-left text-sm font-semibold text-primary active:bg-primary/10"
                                              >
                                                <ExternalLink className="mt-0.5 size-4 shrink-0" aria-hidden />
                                                <span className="min-w-0 break-words leading-snug">
                                                  <span className="tabular-nums">
                                                    {row.hd_unit_price_usd != null
                                                      ? fmt.format(row.hd_unit_price_usd)
                                                      : "View listing"}
                                                  </span>
                                                  {row.hd_title
                                                    ? ` — ${row.hd_title.length > 56 ? `${row.hd_title.slice(0, 56)}…` : row.hd_title}`
                                                    : ""}
                                                </span>
                                              </a>
                                              {row.hd_price_raw ? (
                                                <p
                                                  className={
                                                    row.hd_price_was_usd != null &&
                                                    row.hd_price_was_usd > (row.hd_unit_price_usd ?? 0)
                                                      ? "mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                                                      : "mt-1 text-xs text-muted-foreground"
                                                  }
                                                >
                                                  {row.hd_price_raw}
                                                </p>
                                              ) : null}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }
                                    const lwTrim = row.lw_image_url?.trim();
                                    const mockUsesLw = Boolean(mockPick && lwTrim && mockPick === lwTrim);
                                    return (
                                      <div className="rounded-xl border border-border/60 bg-background/90 p-3 shadow-sm">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                          Lowe&apos;s
                                          {mockUsesLw ? (
                                            <span className="ml-1 font-normal normal-case text-emerald-700 dark:text-emerald-400">
                                              — mockup uses this shelf photo
                                            </span>
                                          ) : null}
                                        </p>
                                        <div className="mt-2 flex max-w-full items-start gap-3">
                                          {row.lw_image_url ? (
                                            <button
                                              type="button"
                                              className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted shadow-sm ring-offset-background transition active:scale-[0.98] hover:opacity-95 hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setLightboxSrc(
                                                  retailImageUrlForLightbox(row.lw_image_url!),
                                                );
                                              }}
                                              aria-label="View Lowe's product image larger"
                                            >
                                              <img
                                                src={row.lw_image_url}
                                                alt=""
                                                className="h-full w-full object-cover"
                                              />
                                            </button>
                                          ) : null}
                                          <div className="min-w-0 flex-1">
                                            <a
                                              href={normalizeLowesProductUrl(row.lw_product_url!)}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex min-h-11 min-w-0 max-w-full items-start gap-2 rounded-lg text-left text-sm font-semibold text-primary active:bg-primary/10"
                                            >
                                              <ExternalLink className="mt-0.5 size-4 shrink-0" aria-hidden />
                                              <span className="min-w-0 break-words leading-snug">
                                                <span className="tabular-nums">
                                                  {row.lw_unit_price_usd != null
                                                    ? fmt.format(row.lw_unit_price_usd)
                                                    : "View listing"}
                                                </span>
                                                {row.lw_title
                                                  ? ` — ${row.lw_title.length > 56 ? `${row.lw_title.slice(0, 56)}…` : row.lw_title}`
                                                  : ""}
                                              </span>
                                            </a>
                                            {row.lw_price_raw ? (
                                              <p
                                                className={
                                                  row.lw_price_was_usd != null &&
                                                  row.lw_price_was_usd > (row.lw_unit_price_usd ?? 0)
                                                    ? "mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                                                    : "mt-1 text-xs text-muted-foreground"
                                                }
                                              >
                                                {row.lw_price_raw}
                                              </p>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  {retailTab && row.line_id
                                    ? renderRetailReplacementTools(row, retailTab)
                                    : null}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-start gap-1.5 pt-0.5">
                              <div className="flex items-center gap-1.5">
                                <label
                                  className={
                                    canMockup
                                      ? "flex cursor-pointer items-center gap-1 rounded-md border border-border/70 bg-muted/30 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/55"
                                      : "flex cursor-not-allowed items-center gap-1 rounded-md border border-border/50 bg-muted/20 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground opacity-70"
                                  }
                                  title={
                                    canMockup
                                      ? "Include this line in the AI mockup (needs a reference photo or retail product image)"
                                      : "Add a reference photo or a Home Depot / Lowe's product image to enable mockup for this line"
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    className="size-3.5 shrink-0 rounded border-input"
                                    disabled={!canMockup}
                                    checked={canMockup && row.mockup_include !== false}
                                    onChange={(e) =>
                                      updateRow(i, {
                                        mockup_include: e.target.checked ? true : false,
                                      })
                                    }
                                    aria-label="Include in AI mockup"
                                  />
                                  <span className="max-sm:sr-only">Mockup</span>
                                </label>
                                {lineHasPricing(row) ? (
                                  <label
                                    className={`flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                      row.pricing_approved === true
                                        ? "border-emerald-500/60 bg-emerald-600/15 text-emerald-900 dark:text-emerald-100"
                                        : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/55"
                                    }`}
                                    title="Mark this line’s pricing as reviewed for this estimate"
                                  >
                                    <input
                                      type="checkbox"
                                      className="size-3.5 shrink-0 rounded border-input accent-emerald-600"
                                      checked={row.pricing_approved === true}
                                      onChange={(e) =>
                                        updateRow(i, {
                                          pricing_approved: e.target.checked ? true : false,
                                        })
                                      }
                                      aria-label="Approve line pricing"
                                    />
                                    <span className="max-sm:sr-only">OK</span>
                                  </label>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground outline-none transition hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`Edit line: ${title}`}
                                onClick={() => setEditIndex(i)}
                              >
                                <ChevronRight className="size-4" aria-hidden />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-gradient-to-r from-muted/45 to-muted/25 px-4 py-3.5 text-sm shadow-sm">
            <span className="font-medium text-foreground">Quote subtotal</span>
            <span className="text-base font-semibold tabular-nums tracking-tight">
              {fmt.format(subtotal)}
            </span>
          </div>

          {editIndex !== null && lines[editIndex] ? (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="full-line-edit-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
                aria-label="Close"
                onClick={() => setEditIndex(null)}
              />
              <div
                className="relative z-10 max-h-[min(92vh,900px)] w-full max-w-lg overflow-y-auto rounded-t-[1.25rem] border border-border/60 bg-background px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-xl sm:rounded-2xl sm:p-5 sm:pb-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden"
                  aria-hidden
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-10 shrink-0 touch-manipulation sm:size-9"
                    disabled={editIndex <= 0}
                    aria-label="Previous line"
                    title="Previous line (Alt+←)"
                    onClick={() => goToAdjacentLine(-1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div className="min-w-0 flex-1 text-center">
                    <h4 id="full-line-edit-title" className="text-base font-semibold tracking-tight">
                      Line item &amp; pricing
                    </h4>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {editIndex + 1} of {lines.length}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-10 shrink-0 touch-manipulation sm:size-9"
                    disabled={editIndex >= lines.length - 1}
                    aria-label="Next line"
                    title="Next line (Alt+→)"
                    onClick={() => goToAdjacentLine(1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <div className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={lines[editIndex].name}
                      onChange={(e) => updateRow(editIndex, { name: e.target.value })}
                      placeholder="What’s included"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Trade</Label>
                    <select
                      className="flex min-h-11 w-full touch-manipulation rounded-md border border-input bg-background px-3 text-sm sm:min-h-10"
                      value={lines[editIndex].trade ?? "general"}
                      onChange={(e) =>
                        updateRow(editIndex, { trade: e.target.value as BidMaterialTrade })
                      }
                    >
                      {TRADE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={String(lines[editIndex].quantity)}
                        onChange={(e) =>
                          updateRow(editIndex, { quantity: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Unit</Label>
                      <Input
                        value={lines[editIndex].unit}
                        onChange={(e) => updateRow(editIndex, { unit: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Est. price / unit ($)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(lines[editIndex].unit_price_usd)}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        updateRow(editIndex, {
                          unit_price_usd: v,
                          unit_cost_usd: v,
                          markup_pct: 0,
                        });
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      One number for your ballpark—same value used for line total.
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    Extended: {fmt.format(lines[editIndex].extended_usd)}
                  </p>
                  <div
                    className={`rounded-lg border px-3 py-2.5 text-sm ${
                      lines[editIndex].pricing_approved === true
                        ? "border-emerald-500/45 bg-emerald-500/10"
                        : lineHasPricing(lines[editIndex])
                          ? "border-amber-500/45 bg-amber-500/10"
                          : "border-border bg-muted/30"
                    }`}
                  >
                    <p className="text-xs leading-relaxed text-foreground">
                      {lines[editIndex].pricing_approved === true
                        ? "This line’s pricing is marked approved (change numbers above to require a new review)."
                        : lineHasPricing(lines[editIndex])
                          ? "Review the est. price per unit, then use the OK toggle on the row or below."
                          : "Enter a price above, or use “Re-estimate line pricing” in the list header."}
                    </p>
                    {lineHasPricing(lines[editIndex]) ? (
                      <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-muted/25 px-2.5 py-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 rounded border-input accent-emerald-600"
                          checked={lines[editIndex].pricing_approved === true}
                          onChange={(e) =>
                            updateRow(editIndex, {
                              pricing_approved: e.target.checked ? true : false,
                            })
                          }
                        />
                        <span>Approve line pricing (same as the OK toggle in the list)</span>
                      </label>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      value={lines[editIndex].notes ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateRow(editIndex, { notes: v.length ? v : undefined });
                      }}
                      rows={3}
                      className="text-sm"
                      placeholder="SKU, color, or “Covers: …” from AI"
                    />
                  </div>
                  <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-2 py-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Reference photo
                    </span>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      For anything physical you want reflected in the mockup—vanities, cabinets, tile or
                      flooring samples, fixtures, hardware, or showroom photos. One image per line.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {refPreviewUrl(lines[editIndex]) ? (
                        <button
                          type="button"
                          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted ring-offset-background transition hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxSrc(refPreviewUrl(lines[editIndex])!);
                          }}
                          aria-label="View reference photo larger"
                        >
                          <Image
                            src={refPreviewUrl(lines[editIndex])!}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized
                          />
                        </button>
                      ) : null}
                      <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <ImagePlus className="size-3.5" />
                        <span>
                          {uploadingLineId === lines[editIndex].line_id
                            ? "…"
                            : refPreviewUrl(lines[editIndex])
                              ? "Replace"
                              : "Add photo"}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          capture="environment"
                          className="sr-only"
                          disabled={!lines[editIndex].line_id || uploadingLineId === lines[editIndex].line_id}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            const lid = lines[editIndex].line_id;
                            if (f && lid) void handleRefFile(lid, f);
                          }}
                        />
                      </label>
                      {refPreviewUrl(lines[editIndex]) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1.5 text-xs text-muted-foreground"
                          disabled={uploadingLineId === lines[editIndex].line_id}
                          onClick={() => {
                            const lid = lines[editIndex].line_id;
                            if (lid) void handleClearRef(lid);
                          }}
                        >
                          <X className="mr-0.5 size-3" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      On a phone, “Add photo” usually opens the camera or gallery. Used when you
                      regenerate the mockup on the overview so the AI can match finishes and products
                      where the prompt allows.
                    </p>
                  </div>
                  {!scopeOnly && hdRetailEnabled && lines[editIndex].line_id ? (
                    <div className="space-y-3 rounded-2xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10 p-3 text-sm shadow-sm ring-1 ring-border/15 sm:p-4">
                      {lineHasDualRetailShelfImagesForMockup(lines[editIndex]) ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-background/70 px-2 py-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Mockup shelf photo
                          </span>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant={
                                effectiveMockupShelfRetailerForLine(lines[editIndex]) === "hd"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => updateRow(editIndex, { mockup_shelf_retailer: "hd" })}
                            >
                              Home Depot
                            </Button>
                            <Button
                              type="button"
                              variant={
                                effectiveMockupShelfRetailerForLine(lines[editIndex]) === "lw"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => updateRow(editIndex, { mockup_shelf_retailer: "lw" })}
                            >
                              Lowe&apos;s
                            </Button>
                            {lines[editIndex].mockup_shelf_retailer ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-muted-foreground"
                                title="Use the same store as the primary shelf price (lowest unit)"
                                onClick={() => updateRow(editIndex, { mockup_shelf_retailer: undefined })}
                              >
                                Auto
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {(() => {
                        const er = lines[editIndex];
                        const tab = winningRetailTabForLine(er);
                        if (!tab) {
                          return (
                            <div className="rounded-xl border border-dashed border-border/60 bg-background/80 p-3.5 text-xs leading-relaxed text-muted-foreground">
                              No store link on this line yet. Paste a product URL below or run bulk fetch from the
                              quote header.
                            </div>
                          );
                        }
                        const mockPick = catalogRetailImageUrlForMockup(er);
                        if (tab === "hd") {
                          const hdTrim = er.hd_image_url?.trim();
                          const mockUsesHd = Boolean(mockPick && hdTrim && mockPick === hdTrim);
                          return (
                            <div className="space-y-3 rounded-xl border border-border/60 bg-background/95 p-3 shadow-sm sm:p-3.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Home Depot
                                {mockUsesHd ? (
                                  <span className="ml-1 font-normal normal-case text-emerald-700 dark:text-emerald-400">
                                    — mockup uses this shelf photo
                                  </span>
                                ) : null}
                              </p>
                              {er.hd_image_url ? (
                                <button
                                  type="button"
                                  className="block max-h-[min(48vh,360px)] w-full overflow-hidden rounded-xl border border-border/60 bg-muted text-left shadow-inner ring-offset-background transition active:opacity-95 hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxSrc(retailImageUrlForLightbox(er.hd_image_url!));
                                  }}
                                  aria-label="View Home Depot product image larger"
                                >
                                  <img
                                    src={er.hd_image_url}
                                    alt=""
                                    className="max-h-[min(48vh,360px)] w-full object-contain object-left"
                                  />
                                </button>
                              ) : null}
                              <a
                                href={normalizeHomedepotProductUrl(er.hd_product_url!)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 text-base font-semibold text-primary touch-manipulation active:bg-primary/10 sm:text-sm"
                              >
                                <ExternalLink className="size-4 shrink-0" aria-hidden />
                                <span className="tabular-nums">
                                  {er.hd_unit_price_usd != null
                                    ? fmt.format(er.hd_unit_price_usd)
                                    : "Open listing"}
                                </span>
                              </a>
                              {er.hd_title ? (
                                <p className="text-xs leading-relaxed text-muted-foreground">{er.hd_title}</p>
                              ) : null}
                              {er.hd_price_raw ? (
                                <p
                                  className={
                                    er.hd_price_was_usd != null &&
                                    er.hd_price_was_usd > (er.hd_unit_price_usd ?? 0)
                                      ? "mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                                      : "mt-1 text-xs text-muted-foreground"
                                  }
                                >
                                  {er.hd_price_raw}
                                </p>
                              ) : null}
                            </div>
                          );
                        }
                        const lwTrim = er.lw_image_url?.trim();
                        const mockUsesLw = Boolean(mockPick && lwTrim && mockPick === lwTrim);
                        return (
                          <div className="space-y-3 rounded-xl border border-border/60 bg-background/95 p-3 shadow-sm sm:p-3.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Lowe&apos;s
                              {mockUsesLw ? (
                                <span className="ml-1 font-normal normal-case text-emerald-700 dark:text-emerald-400">
                                  — mockup uses this shelf photo
                                </span>
                              ) : null}
                            </p>
                            {er.lw_image_url ? (
                              <button
                                type="button"
                                className="block max-h-[min(48vh,360px)] w-full overflow-hidden rounded-xl border border-border/60 bg-muted text-left shadow-inner ring-offset-background transition active:opacity-95 hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxSrc(retailImageUrlForLightbox(er.lw_image_url!));
                                }}
                                aria-label="View Lowe's product image larger"
                              >
                                <img
                                  src={er.lw_image_url}
                                  alt=""
                                  className="max-h-[min(48vh,360px)] w-full object-contain object-left"
                                />
                              </button>
                            ) : null}
                            <a
                              href={normalizeLowesProductUrl(er.lw_product_url!)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 text-base font-semibold text-primary touch-manipulation active:bg-primary/10 sm:text-sm"
                            >
                              <ExternalLink className="size-4 shrink-0" aria-hidden />
                              <span className="tabular-nums">
                                {er.lw_unit_price_usd != null
                                  ? fmt.format(er.lw_unit_price_usd)
                                  : "Open listing"}
                              </span>
                            </a>
                            {er.lw_title ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">{er.lw_title}</p>
                            ) : null}
                            {er.lw_price_raw ? (
                              <p
                                className={
                                  er.lw_price_was_usd != null &&
                                  er.lw_price_was_usd > (er.lw_unit_price_usd ?? 0)
                                    ? "mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                                    : "mt-1 text-xs text-muted-foreground"
                                }
                              >
                                {er.lw_price_raw}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()}
                      {(() => {
                        const er = lines[editIndex];
                        const t = winningRetailTabForLine(er);
                        if (!t || !er.line_id) return null;
                        return renderRetailReplacementTools(er, t);
                      })()}
                      <div className="rounded-xl border border-dashed border-border/50 bg-muted/15 p-3.5">
                        <Label className="text-xs font-semibold text-foreground">Paste a product link</Label>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                          homedepot.com or lowes.com product page
                        </p>
                        <Input
                          className="mt-2 min-h-12 text-base sm:min-h-10 sm:text-sm"
                          placeholder="https://www.homedepot.com/p/… or https://www.lowes.com/pd/…"
                          value={hdModalPaste}
                          onChange={(e) => setHdModalPaste(e.target.value)}
                        />
                        <div className="mt-3">
                          <Button
                            type="button"
                            className="min-h-12 w-full touch-manipulation rounded-xl text-base font-semibold sm:min-h-11 sm:text-sm"
                            disabled={
                              !hdModalPaste.trim() ||
                              hdActionBusyId === lines[editIndex].line_id
                            }
                            onClick={() =>
                              void handleRetailApplyProductUrl(
                                lines[editIndex].line_id!,
                                hdModalPaste,
                              )
                            }
                          >
                            Apply URL
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={libraryBusy || !lines[editIndex].name.trim()}
                    onClick={() => void handleSaveRowToLibrary(editIndex)}
                  >
                    <Bookmark className="mr-1.5 size-4" />
                    Remember for future estimates
                  </Button>
                </div>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="min-h-11 touch-manipulation sm:min-h-9"
                    onClick={() => {
                      removeRow(editIndex);
                      setEditIndex(null);
                    }}
                  >
                    Remove line
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 touch-manipulation sm:min-h-9"
                    onClick={() => setEditIndex(null)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 w-full touch-manipulation sm:min-h-9 sm:w-auto"
          onClick={scopeOnly ? addScopeLine : addRow}
        >
          <Plus className="mr-1 size-4" />
          Add line
        </Button>
        {undoRemoveStack.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 w-full touch-manipulation sm:min-h-9 sm:w-auto"
            onClick={undoLastRemove}
            title="Undo last line removal (⌘Z / Ctrl+Z)"
            aria-label="Undo last line removal"
          >
            <Undo2 className="mr-1 size-4" />
            Undo remove
          </Button>
        ) : null}
        <Button
          type="button"
          variant="default"
          size="sm"
          className="min-h-11 w-full touch-manipulation sm:min-h-9 sm:w-auto"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? "Saving…" : scopeOnly ? "Save scope" : "Save quote"}
        </Button>
      </div>
      </div>
    </BidCollapsibleSection>

    {showBlockingLoader ? (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-background/92 px-6 backdrop-blur-[2px]"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="size-11 shrink-0 animate-spin text-primary" aria-hidden />
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold tracking-tight">
            {hdFetchPending
              ? retailHomeDepot && retailLowes
                ? "Searching Home Depot & Lowe's…"
                : retailHomeDepot
                  ? "Searching Home Depot…"
                  : retailLowes
                    ? "Searching Lowe's…"
                    : "Fetching retail prices…"
              : pricedPending
                  ? "Building AI priced breakdown…"
                  : libraryBusy
                    ? "Updating library…"
                    : "Saving…"}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {hdFetchPending
              ? retailHomeDepot && retailLowes
                ? "Matching products at Home Depot and Lowe's to your line items (SerpApi). May take up to a minute — safe to keep this tab open."
                : retailHomeDepot
                  ? "Searching Home Depot's catalog for each line (SerpApi). May take up to a minute."
                  : retailLowes
                    ? "Searching Lowe's via Google (site:lowes.com) for each line. May take up to a minute — verify results on lowes.com."
                    : "Select at least one store above to fetch prices."
              : pricedPending
                  ? "Generating scope lines and prices. Please keep this tab open."
                  : libraryBusy
                    ? "Saving your company line template."
                    : "Saving your quote to this estimate."}
          </p>
        </div>
      </div>
    ) : null}

    {lightboxSrc ? (
      <div
        className="fixed inset-0 z-[420] flex items-center justify-center bg-black/90 p-3 backdrop-blur-[2px] sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Enlarged image"
        onClick={() => setLightboxSrc(null)}
      >
        <button
          type="button"
          className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full border border-white/25 bg-background/95 text-foreground shadow-md transition hover:bg-background sm:right-5 sm:top-5"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxSrc(null);
          }}
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- lightbox */}
        <img
          src={retailImageUrlForLightbox(lightboxSrc)}
          alt=""
          className="max-h-[min(96vh,1600px)] max-w-[min(98vw,1400px)] object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ) : null}
    </>
  );
}
