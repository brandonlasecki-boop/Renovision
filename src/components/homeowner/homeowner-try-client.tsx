"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Camera, ChevronDown, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  generateBathroomMockupAction,
  pollTryEstimateRefinementAction,
  regenerateBathroomMockupAction,
  selectTryMockupVersionAction,
  submitBathroomLeadAction,
  trackConnectClickedAction,
  type HomeownerTryPageState,
  type TryGenerationViewState,
  type TryTweakSuggestion,
} from "@/lib/actions/homeowner-try";
import type { BathroomStyleId } from "@/lib/homeowner-try/bathroom-styles";
import { LANDING_DEMO_BEFORE, LANDING_DEMO_STYLE_OPTIONS } from "@/components/landing/landing-demo-style-options";
import {
  compressTryPhotoForUpload,
  isLikelyHeicUpload,
  MAX_TRY_SERVER_ACTION_UPLOAD_BYTES,
} from "@/lib/homeowner-try/compress-client-upload";
import { BeforeAfterCompareSlider } from "@/components/homeowner/before-after-compare-slider";
import { RenovisionGeneratingLoader } from "@/components/homeowner/renovision-generating-loader";
import { getStoredAttribution, type RenovisionAttribution } from "@/lib/renovision/attribution";
import { trackEvent, trackGoogleAdsLeadConversion } from "@/lib/analytics/google-ads";
import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const MAX_SAFE_PREVIEW_BYTES = 8 * 1024 * 1024;
/** Matches server `generateBathroomMockupAction` limit; server normalizes/resizes large photos. */
const MAX_TRY_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Post-preview style switches (original upload + new style). Order: Spa default first elsewhere. */
const UPLOAD_TEASER_AFTER =
  LANDING_DEMO_STYLE_OPTIONS.find((o) => o.id === "spa_retreat")?.after ?? LANDING_DEMO_STYLE_OPTIONS[0].after;

const POST_RESULT_STYLE_PRESETS: { id: BathroomStyleId; label: string }[] = [
  { id: "spa_retreat", label: "Spa" },
  { id: "clean_refresh", label: "Clean" },
  { id: "luxury_escape", label: "Luxury" },
  { id: "bold_modern", label: "Bold" },
  { id: "warm_minimalist", label: "Warm" },
];

/** Approximate shift to total job midpoint vs current estimate; from estimator JSON. */
function formatTweakImpactBand(s: TryTweakSuggestion): string {
  const lo = Math.round(Math.min(s.deltaMin, s.deltaMax));
  const hi = Math.round(Math.max(s.deltaMin, s.deltaMax));
  if (lo === 0 && hi === 0) return "";
  if (hi <= 0) {
    return lo === hi
      ? `Save ~${usd.format(Math.abs(lo))}`
      : `Save ~${usd.format(Math.abs(hi))}–${usd.format(Math.abs(lo))}`;
  }
  if (lo >= 0) {
    return lo === hi ? `+${usd.format(lo)}` : `+${usd.format(lo)}–${usd.format(hi)}`;
  }
  return `${usd.format(lo)}–${usd.format(hi)}`;
}

function formatUsdBand(low: number, high: number): string {
  const a = Math.min(low, high);
  const b = Math.max(low, high);
  if (a === b) return usd.format(a);
  return `${usd.format(a)}–${usd.format(b)}`;
}

/** Whole-USD savings when both deltas imply lower cost (non-positive band). */
function tweakSavingsBandUsd(row: TryTweakSuggestion): { low: number; high: number } | null {
  const lo = Math.round(Math.min(row.deltaMin, row.deltaMax));
  const hi = Math.round(Math.max(row.deltaMin, row.deltaMax));
  if (lo === 0 && hi === 0) return null;
  if (hi > 0) return null;
  const x = Math.abs(hi);
  const y = Math.abs(lo);
  return { low: Math.min(x, y), high: Math.max(x, y) };
}

/** Whole-USD add when band does not go negative. */
function tweakUpgradeBandUsd(row: TryTweakSuggestion): { low: number; high: number } | null {
  const lo = Math.round(Math.min(row.deltaMin, row.deltaMax));
  const hi = Math.round(Math.max(row.deltaMin, row.deltaMax));
  if (lo === 0 && hi === 0) return null;
  if (lo < 0) return null;
  return { low: lo, high: hi };
}

function sumTweakBands(
  rows: TryTweakSuggestion[],
  picker: (r: TryTweakSuggestion) => { low: number; high: number } | null,
  options?: { onlyChecked?: (idx: number) => boolean },
): { low: number; high: number } | null {
  let low = 0;
  let high = 0;
  let counted = 0;
  for (let idx = 0; idx < rows.length; idx++) {
    if (options?.onlyChecked && !options.onlyChecked(idx)) continue;
    const b = picker(rows[idx]!);
    if (!b) continue;
    low += b.low;
    high += b.high;
    counted += 1;
  }
  if (counted === 0) return null;
  return { low, high };
}

function shortTweakLine(text: string, maxChars = 78): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = (lastSpace > 36 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return `${base}…`;
}

/** Short label for compare slider badges / range hints. */
function compareBadgeLabel(text: string, maxChars = 26): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1)}…`;
}

type TryMockupVersionRow = {
  id: string;
  label: string;
  imageUrl: string;
  storagePath: string;
  caption?: string | null;
};

/** Very large phone photos can crash mobile Chrome when decoded for client-side preview. */
function previewAllowed(file: File | undefined | null): file is File {
  return Boolean(file && file.size <= MAX_SAFE_PREVIEW_BYTES);
}

function isLikelyMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function HomeownerTryClient({
  initial,
  restoredGeneration = null,
  autoSavedProject = false,
  startNewProject = false,
  startNewToken = "",
}: {
  initial: Exclude<HomeownerTryPageState, { ok: false }>;
  restoredGeneration?: TryGenerationViewState | null;
  autoSavedProject?: boolean;
  startNewProject?: boolean;
  startNewToken?: string;
}) {
  const [selectedStyle, setSelectedStyle] = useState<BathroomStyleId>("spa_retreat");
  const [userDescription] = useState("");
  const [step, setStep] = useState<"upload" | "result">(() => (restoredGeneration ? "result" : "upload"));
  const [generation, setGeneration] = useState<{
    generationId: string;
    projectId: string;
    selectedStyle: string;
    styleName: string;
    uploadedImageUrl: string;
    generatedImageUrl: string;
    estimateRange: { min: number; max: number };
    breakdown: {
      materials: { min: number; max: number };
      labor: { min: number; max: number };
      fixtures: { min: number; max: number };
    };
    detailedBreakdown: Array<{
      category: string;
      min: number;
      max: number;
      reason: string;
    }>;
    reasoning: string[];
    assumptions: string[];
    confidence: "low" | "medium" | "high";
    saveMoneySuggestions: TryTweakSuggestion[];
    improveDesignSuggestions: TryTweakSuggestion[];
    mockupVersions: TryMockupVersionRow[];
    activeMockupId: string;
    estimateRefinementPending?: boolean;
  } | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  /** Local `blob:` preview of the file picked on the upload step — used behind the loader on first generate. */
  const [firstUploadPreviewUrl, setFirstUploadPreviewUrl] = useState<string | null>(null);
  /**
   * Blob URL for the “before” photo behind the generating loader. Kept separate from React state so a spurious
   * empty `change` on the file input after submit (common in browsers) does not revoke the URL mid-load.
   * Also used on mobile / large files when we skip the inline preview grid.
   */
  const loaderBeforeBlobUrlRef = useRef<string | null>(null);
  const setLoaderBeforeBlob = useCallback((next: string | null) => {
    if (loaderBeforeBlobUrlRef.current && loaderBeforeBlobUrlRef.current !== next) {
      URL.revokeObjectURL(loaderBeforeBlobUrlRef.current);
      loaderBeforeBlobUrlRef.current = null;
    }
    if (next) {
      loaderBeforeBlobUrlRef.current = next;
    }
  }, []);
  const [storedAttribution, setStoredAttribution] = useState<RenovisionAttribution | null>(null);
  /** File attached to the form (`name="bathroom_photo"`). Camera flow copies into this input via DataTransfer. */
  const bathroomPhotoLibraryInputRef = useRef<HTMLInputElement>(null);
  const bathroomPhotoCameraInputRef = useRef<HTMLInputElement>(null);
  const uploadFormRef = useRef<HTMLFormElement>(null);
  /** Result step: show minimal “wow” first; reveal style, AI tweaks, cost, etc. after user opts in. */
  const [tryResultCustomizeOpen, setTryResultCustomizeOpen] = useState(false);
  const [compareDesignsOpen, setCompareDesignsOpen] = useState(false);
  const [compareLeftKey, setCompareLeftKey] = useState<string>("original");
  const [compareRightKey, setCompareRightKey] = useState<string>("");
  const [saveTweakChecked, setSaveTweakChecked] = useState<Record<number, boolean>>({});
  const [designTweakChecked, setDesignTweakChecked] = useState<Record<number, boolean>>({});

  async function compressThenGenerate(
    prev: Awaited<ReturnType<typeof generateBathroomMockupAction>> | undefined,
    formData: FormData,
  ) {
    const raw = formData.get("bathroom_photo");
    if (
      raw instanceof File &&
      raw.size > MAX_TRY_SERVER_ACTION_UPLOAD_BYTES &&
      !isLikelyHeicUpload(raw)
    ) {
      try {
        formData.set("bathroom_photo", await compressTryPhotoForUpload(raw));
      } catch {
        return {
          error:
            "Could not prepare your photo for upload. Try a smaller JPG or PNG, or retake at lower resolution.",
        };
      }
    }
    return generateBathroomMockupAction(prev, formData);
  }

  const [generateState, generateAction, generatePending] = useActionState(compressThenGenerate, undefined);
  const [regenState, regenAction, regenPending] = useActionState(regenerateBathroomMockupAction, undefined);
  const [versionState, , versionPending] = useActionState(selectTryMockupVersionAction, undefined);
  const [connectState, connectAction] = useActionState(trackConnectClickedAction, undefined);
  const [leadState, leadAction, leadPending] = useActionState(submitBathroomLeadAction, undefined);

  useEffect(() => {
    setStoredAttribution(getStoredAttribution());
  }, []);

  useEffect(() => {
    if (!restoredGeneration) return;
    setGeneration(restoredGeneration);
    setTryResultCustomizeOpen(false);
    setStep("result");
  }, [restoredGeneration]);

  useEffect(() => {
    if (autoSavedProject) {
      toast.success("Project saved");
    }
  }, [autoSavedProject]);

  useEffect(() => {
    if (!startNewProject) return;
    setGeneration(null);
    setSelectedStyle("spa_retreat");
    setLeadSubmitted(false);
    setLeadOpen(false);
    setFirstUploadPreviewUrl(null);
    setLoaderBeforeBlob(null);
    setTryResultCustomizeOpen(false);
    setStep("upload");
  }, [startNewProject, startNewToken, setLoaderBeforeBlob]);

  useEffect(() => {
    if (generateState && "success" in generateState && generateState.success) {
      setGeneration(generateState);
      setStep("result");
      setFirstUploadPreviewUrl(null);
      setLoaderBeforeBlob(null);
      setTryResultCustomizeOpen(false);
      trackEvent("remodel_generated");
      trackEvent("upload_completed", { style: generateState.selectedStyle });
    }
  }, [generateState, setLoaderBeforeBlob]);

  useEffect(() => {
    if (!generateState || !("error" in generateState)) return;
    const lib = bathroomPhotoLibraryInputRef.current;
    const cam = bathroomPhotoCameraInputRef.current;
    if (lib) lib.value = "";
    if (cam) cam.value = "";
  }, [generateState]);

  const slowGenerationToastMs = 120_000;

  useEffect(() => {
    if (!generatePending && !regenPending) return;
    const timeoutId = window.setTimeout(() => {
      toast.message("Still generating...", {
        description:
          "Complex renders often need 1–2 mins. You can keep this tab open. If it fails, try a smaller JPG/PNG photo.",
      });
    }, slowGenerationToastMs);
    return () => window.clearTimeout(timeoutId);
  }, [generatePending, regenPending]);

  useEffect(() => {
    if (!generation?.estimateRefinementPending) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 45;
    const intervalMs = 3000;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const r = await pollTryEstimateRefinementAction(generation.generationId, generation.projectId);
        if (!r.ready) {
          if (attempts >= maxAttempts) {
            setGeneration((prev) => (prev ? { ...prev, estimateRefinementPending: false } : null));
          }
          return;
        }
        setGeneration((prev) =>
          prev
            ? {
                ...prev,
                estimateRange: r.estimateRange,
                breakdown: r.breakdown,
                detailedBreakdown: r.detailedBreakdown,
                reasoning: r.reasoning,
                assumptions: r.assumptions,
                confidence: r.confidence,
                saveMoneySuggestions: r.saveMoneySuggestions,
                improveDesignSuggestions: r.improveDesignSuggestions,
                estimateRefinementPending: false,
              }
            : null,
        );
        toast.message("Cost estimate updated", { description: "Based on your before and after photos." });
      } catch {
        if (attempts >= maxAttempts) {
          setGeneration((prev) => (prev ? { ...prev, estimateRefinementPending: false } : null));
        }
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, intervalMs);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [generation?.estimateRefinementPending, generation?.generationId, generation?.projectId]);

  useEffect(() => {
    if (regenState && "success" in regenState && regenState.success) {
      setGeneration((prev) =>
        prev
          ? {
              ...prev,
              uploadedImageUrl: regenState.uploadedImageUrl || prev.uploadedImageUrl,
              generatedImageUrl: regenState.generatedImageUrl,
              selectedStyle: regenState.selectedStyle,
              styleName: regenState.styleName,
              estimateRange: regenState.estimateRange,
              breakdown: regenState.breakdown,
              detailedBreakdown: regenState.detailedBreakdown ?? prev.detailedBreakdown ?? [],
              reasoning: regenState.reasoning ?? prev.reasoning ?? [],
              assumptions: regenState.assumptions ?? prev.assumptions ?? [],
              confidence: regenState.confidence,
              saveMoneySuggestions: regenState.saveMoneySuggestions ?? prev.saveMoneySuggestions ?? [],
              improveDesignSuggestions:
                regenState.improveDesignSuggestions ?? prev.improveDesignSuggestions ?? [],
              mockupVersions: regenState.mockupVersions,
              activeMockupId: regenState.activeMockupId,
              estimateRefinementPending: false,
            }
          : prev,
      );
      setStep("result");
    }
  }, [regenState]);

  useEffect(() => {
    if (regenState && "error" in regenState && regenState.error) {
      toast.error("Could not update preview", { description: regenState.error.slice(0, 400) });
    }
  }, [regenState]);

  useEffect(() => {
    if (versionState && "success" in versionState && versionState.success) {
      const hasNewEstimate = "estimateRange" in versionState && versionState.estimateRange;
      setGeneration((prev) =>
        prev
          ? {
              ...prev,
              generatedImageUrl: versionState.generatedImageUrl,
              activeMockupId: versionState.activeMockupId,
              mockupVersions: versionState.mockupVersions,
              ...(hasNewEstimate
                ? {
                    estimateRange: versionState.estimateRange!,
                    breakdown: versionState.breakdown!,
                    detailedBreakdown: versionState.detailedBreakdown!,
                    reasoning: versionState.reasoning!,
                    assumptions: versionState.assumptions!,
                    confidence: versionState.confidence!,
                    saveMoneySuggestions: versionState.saveMoneySuggestions!,
                    improveDesignSuggestions: versionState.improveDesignSuggestions!,
                  }
                : {}),
              estimateRefinementPending: false,
            }
          : prev,
      );
    }
  }, [versionState]);

  useEffect(() => {
    if (connectState && "success" in connectState && connectState.success) {
      setLeadOpen(true);
    }
  }, [connectState]);

  useEffect(() => {
    if (leadState && "success" in leadState && leadState.success) {
      if (leadSubmitted) return;
      setLeadSubmitted(true);
      trackEvent("connect_me_submitted");
      trackGoogleAdsLeadConversion();
    }
  }, [leadState, leadSubmitted]);

  const tweakPanelResetKey = useMemo(() => {
    if (!generation) return "";
    const enc = (rows: TryTweakSuggestion[]) =>
      rows.map((r) => `${r.text}\t${r.deltaMin}\t${r.deltaMax}`).join("\n");
    return `${generation.generationId}\n${enc(generation.saveMoneySuggestions ?? [])}\n${enc(generation.improveDesignSuggestions ?? [])}`;
  }, [generation]);

  useEffect(() => {
    if (!tweakPanelResetKey) return;
    setSaveTweakChecked({});
    setDesignTweakChecked({});
  }, [tweakPanelResetKey]);

  const saveMoneyAggregate = useMemo(
    () =>
      generation
        ? sumTweakBands(generation.saveMoneySuggestions ?? [], tweakSavingsBandUsd)
        : null,
    [generation],
  );
  const improveDesignAggregate = useMemo(
    () =>
      generation
        ? sumTweakBands(generation.improveDesignSuggestions ?? [], tweakUpgradeBandUsd)
        : null,
    [generation],
  );
  const selectedSaveTotal = useMemo(
    () =>
      generation
        ? sumTweakBands(generation.saveMoneySuggestions ?? [], tweakSavingsBandUsd, {
            onlyChecked: (i) => Boolean(saveTweakChecked[i]),
          })
        : null,
    [generation, saveTweakChecked],
  );
  const selectedUpgradeTotal = useMemo(
    () =>
      generation
        ? sumTweakBands(generation.improveDesignSuggestions ?? [], tweakUpgradeBandUsd, {
            onlyChecked: (i) => Boolean(designTweakChecked[i]),
          })
        : null,
    [generation, designTweakChecked],
  );

  const progressText = useMemo(() => {
    if (step === "upload") return "Upload → Preview → Connect";
    return "Upload ✓ → Preview → Connect";
  }, [step]);

  const loading = generatePending || regenPending || versionPending;
  const loadingProgressSteps = useMemo(() => {
    if (generatePending) {
      return [
        "Analyzing your bathroom layout...",
        "Detecting walls, fixtures, and space...",
        "Applying your remodel design...",
        "Generating your new bathroom preview...",
      ];
    }
    if (regenPending) {
      return [
        "Reviewing your requested updates...",
        "Reworking your bathroom design...",
        "Applying materials and finishes...",
        "Finalizing your refreshed mockup...",
      ];
    }
    if (versionPending) {
      return [
        "Loading your selected version...",
        "Syncing design details...",
        "Preparing the comparison view...",
        "Finalizing your mockup display...",
      ];
    }
    return undefined;
  }, [generatePending, regenPending, versionPending]);

  const loadingCopy = useMemo(() => {
    if (generatePending) {
      return {
        title: "Designing your bathroom...",
        hint: "Usually 1–2 mins for your preview. Cost details may update right after it appears.",
      };
    }
    if (regenPending) {
      return {
        title: "Applying your tweak…",
        hint: "Usually 1–2 mins",
      };
    }
    if (versionPending) {
      return {
        title: "Switching mockup version…",
        hint: "Usually under a minute.",
      };
    }
    return {
      title: "Creating your bathroom remodel…",
      hint: "Usually 1–2 mins",
    };
  }, [generatePending, regenPending, versionPending]);

  const [loadingElapsedSec, setLoadingElapsedSec] = useState(0);
  useEffect(() => {
    if (!loading) {
      setLoadingElapsedSec(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setLoadingElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading]);
  const afterImageForDisplay = useMemo(() => {
    if (!generation) return "";
    const match = generation.mockupVersions.find((v) => v.id === generation.activeMockupId);
    return match?.imageUrl ?? generation.generatedImageUrl;
  }, [generation]);

  const beforeImageForCompare = useMemo(() => {
    if (!generation) return "";
    return generation.uploadedImageUrl;
  }, [generation]);

  useEffect(() => {
    if (!generation) return;
    if (!compareDesignsOpen) {
      setCompareLeftKey("original");
      setCompareRightKey(generation.activeMockupId);
    }
  }, [generation, compareDesignsOpen]);

  useEffect(() => {
    if (!generation || !compareDesignsOpen) return;
    const leftOk =
      compareLeftKey === "original" || generation.mockupVersions.some((v) => v.id === compareLeftKey);
    const rightOk =
      compareRightKey === "original" || generation.mockupVersions.some((v) => v.id === compareRightKey);
    if (!leftOk) setCompareLeftKey("original");
    if (!rightOk) setCompareRightKey(generation.activeMockupId);
  }, [generation, compareDesignsOpen, compareLeftKey, compareRightKey]);

  const effectiveCompareLeftKey = useMemo(() => {
    if (!generation) return "original";
    if (compareLeftKey === "original") return "original";
    return generation.mockupVersions.some((v) => v.id === compareLeftKey) ? compareLeftKey : "original";
  }, [generation, compareLeftKey]);

  const effectiveCompareRightKey = useMemo(() => {
    if (!generation) return "";
    if (compareRightKey === "original") return "original";
    if (compareRightKey && generation.mockupVersions.some((v) => v.id === compareRightKey)) return compareRightKey;
    if (generation.mockupVersions.some((v) => v.id === generation.activeMockupId)) return generation.activeMockupId;
    return generation.mockupVersions[0]?.id ?? generation.activeMockupId;
  }, [generation, compareRightKey]);

  const trySliderBeforeUrl = useMemo(() => {
    if (!generation) return "";
    if (!compareDesignsOpen) return beforeImageForCompare;
    if (effectiveCompareLeftKey === "original") return generation.uploadedImageUrl;
    return (
      generation.mockupVersions.find((v) => v.id === effectiveCompareLeftKey)?.imageUrl ?? beforeImageForCompare
    );
  }, [generation, compareDesignsOpen, effectiveCompareLeftKey, beforeImageForCompare]);

  const trySliderAfterUrl = useMemo(() => {
    if (!generation) return "";
    if (!compareDesignsOpen) return afterImageForDisplay;
    if (effectiveCompareRightKey === "original") return generation.uploadedImageUrl;
    return (
      generation.mockupVersions.find((v) => v.id === effectiveCompareRightKey)?.imageUrl ?? afterImageForDisplay
    );
  }, [generation, compareDesignsOpen, effectiveCompareRightKey, afterImageForDisplay]);

  const trySliderSideALabel = useMemo(() => {
    if (!generation || !compareDesignsOpen) return "Before";
    if (effectiveCompareLeftKey === "original") return "Original";
    const row = generation.mockupVersions.find((v) => v.id === effectiveCompareLeftKey);
    return compareBadgeLabel(row?.label ?? "Left");
  }, [generation, compareDesignsOpen, effectiveCompareLeftKey]);

  const trySliderSideBLabel = useMemo(() => {
    if (!generation || !compareDesignsOpen) return "After";
    if (effectiveCompareRightKey === "original") return "Original";
    const row = generation.mockupVersions.find((v) => v.id === effectiveCompareRightKey);
    return compareBadgeLabel(row?.label ?? "Right");
  }, [generation, compareDesignsOpen, effectiveCompareRightKey]);

  const styleCardLabelById: Partial<Record<BathroomStyleId, string>> = {
    luxury_escape: "Modern Luxury",
  };
  const displayStyleName = (styleId: BathroomStyleId, fallback: string) =>
    styleCardLabelById[styleId] ?? fallback;
  const attributionJson = storedAttribution ? JSON.stringify(storedAttribution) : "";

  function handleBathroomPhotoFileChosen(file: File, via: "camera" | "library") {
    if (file.size > MAX_TRY_UPLOAD_BYTES) {
      setFirstUploadPreviewUrl(null);
      setLoaderBeforeBlob(null);
      toast.error("Photo is too large.", {
        description: "Please choose an image under 20 MB or retake at a lower resolution.",
      });
      const lib = bathroomPhotoLibraryInputRef.current;
      const cam = bathroomPhotoCameraInputRef.current;
      if (lib) lib.value = "";
      if (cam) cam.value = "";
      return;
    }
    trackEvent("photo_upload_success", {
      file_type: file.type || "unknown",
      source: isLikelyMobileBrowser() ? "mobile" : "desktop",
      via,
    });
    const objectUrl = URL.createObjectURL(file);
    setLoaderBeforeBlob(objectUrl);
    if (isLikelyHeicUpload(file)) {
      setFirstUploadPreviewUrl(null);
      toast.message("Photo added", {
        description:
          file.size > MAX_TRY_SERVER_ACTION_UPLOAD_BYTES
            ? "HEIC selected — if upload fails, try a smaller JPEG."
            : "HEIC ok — preview may appear after generate.",
      });
    } else if (previewAllowed(file)) {
      setFirstUploadPreviewUrl(objectUrl);
      toast.success("Photo added");
    } else {
      setFirstUploadPreviewUrl(null);
      toast.message("Photo added", {
        description: "Large file — thumbnail hidden until your preview is ready.",
      });
    }
    queueMicrotask(() => {
      uploadFormRef.current?.requestSubmit();
    });
  }

  return (
    <div className="relative min-h-[70vh]">
      {loading ? (
        <RenovisionGeneratingLoader
          title={loadingCopy.title}
          hint={loadingCopy.hint}
          elapsedSec={loadingElapsedSec}
          progressSteps={loadingProgressSteps}
          beforeImageUrl={
            generation?.uploadedImageUrl ?? firstUploadPreviewUrl ?? loaderBeforeBlobUrlRef.current ?? undefined
          }
        />
      ) : null}

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <header className="space-y-2">
          {step === "result" && tryResultCustomizeOpen ? (
            <p className="text-xs font-medium text-renovision-navy">{progressText}</p>
          ) : step === "upload" ? (
            <>
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Let&apos;s transform your bathroom</h1>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
                Upload a photo to see your bathroom transformed in seconds.
              </p>
              <p className="text-xs font-medium text-muted-foreground sm:text-sm">No signup • Takes 2 min • Private</p>
            </>
          ) : null}
        </header>

        {step === "upload" ? (
          <>
            <div className="mx-auto max-w-lg space-y-1.5">
              <div className="relative mx-auto flex h-[9.5rem] w-full max-w-md gap-1 overflow-hidden rounded-2xl border border-border/70 bg-muted/40 shadow-sm ring-1 ring-black/[0.04] sm:h-40">
                <div className="relative min-w-0 flex-1">
                  <Image
                    src={LANDING_DEMO_BEFORE}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 42vw, 200px"
                    priority
                  />
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Before
                  </span>
                </div>
                <div className="relative min-w-0 flex-1">
                  <Image
                    src={UPLOAD_TEASER_AFTER}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 42vw, 200px"
                    priority
                  />
                  <span className="absolute bottom-2 right-2 rounded-md bg-renovision-orange px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    After
                  </span>
                </div>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">Example — yours will use your real photo.</p>
            </div>

            <form
              ref={uploadFormRef}
              action={generateAction}
              className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6"
              onSubmit={() => {
                trackEvent("upload_started", { style: selectedStyle });
              }}
            >
            <input type="hidden" name="selected_style" value={selectedStyle} />
            <input type="hidden" name="user_description" value={userDescription} />
            <input type="hidden" name="attribution_json" value={attributionJson} />
            <input type="hidden" name="start_new_project" value={startNewProject ? "1" : "0"} />
            <div className="space-y-4">
              <Label htmlFor="bathroom_photo_camera" className="sr-only">
                Take bathroom photo with camera
              </Label>
              <input
                ref={bathroomPhotoCameraInputRef}
                id="bathroom_photo_camera"
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Take bathroom photo with camera"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const lib = bathroomPhotoLibraryInputRef.current;
                  if (!lib) return;
                  try {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    lib.files = dt.files;
                  } catch {
                    toast.error("Could not attach the photo from your camera.", {
                      description: "Try “Use existing photo” with a photo you already took.",
                    });
                    e.currentTarget.value = "";
                    return;
                  }
                  e.currentTarget.value = "";
                  handleBathroomPhotoFileChosen(file, "camera");
                }}
              />
              <Label htmlFor="bathroom_photo" className="sr-only">
                Choose bathroom photo from your library
              </Label>
              <input
                ref={bathroomPhotoLibraryInputRef}
                id="bathroom_photo"
                name="bathroom_photo"
                type="file"
                accept="image/*"
                required
                aria-label="Choose bathroom photo from library"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    // Browsers often fire `change` with an empty value after form submit. Do not clear blob URLs
                    // here or the generating loader loses the “before” image mid-request.
                    return;
                  }
                  handleBathroomPhotoFileChosen(file, "library");
                }}
              />
              <p className="text-center text-xs font-semibold text-renovision-navy sm:text-sm">
                Get your remodel preview in under 60 seconds
              </p>
              <p className="text-center text-xs text-muted-foreground sm:text-sm">Start by taking a photo</p>
              <div className="grid grid-cols-1 gap-3">
                <Button
                  type="button"
                  className="h-14 w-full justify-center gap-2.5 rounded-2xl bg-renovision-navy text-base font-semibold text-white shadow-lg shadow-renovision-navy/25 hover:bg-renovision-navy/90 disabled:opacity-60 sm:h-16 sm:text-lg"
                  disabled={generatePending}
                  onClick={() => bathroomPhotoCameraInputRef.current?.click()}
                >
                  <Camera className="size-5 shrink-0 sm:size-6" aria-hidden />
                  Take a Photo of Your Bathroom
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full justify-center gap-2 rounded-2xl border border-border/80 bg-background text-sm font-medium text-muted-foreground shadow-none hover:bg-muted/40 hover:text-foreground disabled:opacity-60 sm:h-14 sm:text-base"
                  disabled={generatePending}
                  onClick={() => bathroomPhotoLibraryInputRef.current?.click()}
                >
                  <Upload className="size-4 shrink-0 sm:size-5" aria-hidden />
                  Use existing photo
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground sm:text-xs">
                Works best with a full view of your bathroom
              </p>
              {firstUploadPreviewUrl ? (
                <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-border bg-muted">
                  <Image
                    src={firstUploadPreviewUrl}
                    alt="Your selected bathroom photo"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : null}
            </div>
            {generateState && "error" in generateState ? (
              <p className="text-sm text-destructive">{generateState.error}</p>
            ) : null}
            <div className="flex justify-center pt-1">
              <Link
                href="/"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setFirstUploadPreviewUrl(null);
                  setLoaderBeforeBlob(null);
                }}
              >
                ← Home
              </Link>
            </div>
          </form>
          </>
        ) : null}

        {step === "result" && generation ? (
          <section className="space-y-6">
            <div className="space-y-4 text-center sm:space-y-5">
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Here&apos;s your remodeled bathroom
              </h2>
              {versionState && "error" in versionState ? (
                <p className="text-sm text-destructive">{versionState.error}</p>
              ) : null}
              <BeforeAfterCompareSlider
                beforeUrl={trySliderBeforeUrl}
                afterUrl={trySliderAfterUrl}
                sideALabel={trySliderSideALabel}
                sideBLabel={trySliderSideBLabel}
              />
              <div className="mx-auto w-full max-w-md space-y-3 pt-1">
                {(generation.mockupVersions?.length ?? 0) === 0 ? null : !compareDesignsOpen ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 w-full rounded-xl text-sm font-semibold shadow-sm"
                    onClick={() => {
                      if (!generation) return;
                      setCompareDesignsOpen(true);
                      setCompareLeftKey("original");
                      setCompareRightKey(generation.activeMockupId);
                      trackEvent("try_compare_designs_open");
                    }}
                  >
                    Compare Designs
                  </Button>
                ) : (
                  <div className="rounded-xl border border-border/70 bg-muted/25 px-3 py-3 text-left shadow-sm sm:px-4">
                    <p className="text-xs font-medium text-foreground">Comparison</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Choose what appears on the left and right of the slider. Default is your original photo vs your
                      latest preview.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="try-compare-left" className="text-xs font-medium text-foreground">
                          Left image
                        </Label>
                        <select
                          id="try-compare-left"
                          value={effectiveCompareLeftKey}
                          onChange={(e) => setCompareLeftKey(e.target.value)}
                          disabled={versionPending}
                          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-sm"
                        >
                          <option value="original">Original photo</option>
                          {(generation.mockupVersions ?? []).map((v) => (
                            <option key={`cmp-l-${v.id}`} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="try-compare-right" className="text-xs font-medium text-foreground">
                          Right image
                        </Label>
                        <select
                          id="try-compare-right"
                          value={effectiveCompareRightKey}
                          onChange={(e) => setCompareRightKey(e.target.value)}
                          disabled={versionPending}
                          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-sm"
                        >
                          <option value="original">Original photo</option>
                          {(generation.mockupVersions ?? []).map((v) => (
                            <option key={`cmp-r-${v.id}`} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-3 h-9 w-full text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => setCompareDesignsOpen(false)}
                    >
                      Hide controls
                    </Button>
                  </div>
                )}
              </div>
              {!tryResultCustomizeOpen ? (
                <div className="w-full space-y-3 pt-2">
                  <p className="text-balance text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Want to tweak the design or lower the cost?
                  </p>
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full rounded-xl text-base font-semibold shadow-lg sm:h-14 sm:text-lg"
                    onClick={() => setTryResultCustomizeOpen(true)}
                  >
                    Customize This Design
                  </Button>
                </div>
              ) : null}
            </div>
            {tryResultCustomizeOpen ? (
            <>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Try a different style</p>
              <p className="text-xs text-muted-foreground">Uses your original photo. Usually 1–2 minutes per style.</p>
              <div className="-mx-1 flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {POST_RESULT_STYLE_PRESETS.map(({ id, label }) => {
                  const active = generation.selectedStyle === id;
                  if (active) {
                    return (
                      <span
                        key={id}
                        className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border-2 border-renovision-orange bg-renovision-orange/10 px-2.5 text-xs font-semibold text-renovision-navy sm:px-3.5 sm:text-sm"
                      >
                        {label}
                      </span>
                    );
                  }
                  return (
                    <form key={id} action={regenAction} className="inline shrink-0">
                      <input type="hidden" name="generation_id" value={generation.generationId} />
                      <input type="hidden" name="project_id" value={generation.projectId} />
                      <input type="hidden" name="selected_style" value={id} />
                      <input type="hidden" name="user_description" value={userDescription} />
                      <input type="hidden" name="image_source" value="original" />
                      <input type="hidden" name="attribution_json" value={attributionJson} />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        disabled={regenPending}
                        className="h-9 shrink-0 whitespace-nowrap rounded-full border-border/80 px-2.5 text-xs font-semibold hover:border-renovision-orange/50 sm:px-3.5 sm:text-sm"
                        onClick={() => trackEvent("style_selected", { style: id })}
                      >
                        {label}
                      </Button>
                    </form>
                  );
                })}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.04]">
              <div className="p-4 sm:p-6">
                <form action={regenAction} className="space-y-5">
                  <input type="hidden" name="generation_id" value={generation.generationId} />
                  <input type="hidden" name="project_id" value={generation.projectId} />
                  <input type="hidden" name="selected_style" value={generation.selectedStyle} />
                  <input type="hidden" name="image_source" value="current_mockup" />
                  <input type="hidden" name="source_mockup_id" value={generation.activeMockupId} />
                  <input type="hidden" name="attribution_json" value={attributionJson} />

                  {(generation.saveMoneySuggestions?.length ?? 0) > 0 ||
                  (generation.improveDesignSuggestions?.length ?? 0) > 0 ? (
                    <div className="space-y-4">
                      {(generation.saveMoneySuggestions?.length ?? 0) > 0 ? (
                        <details className="group overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.07] to-muted/15">
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-2 px-3 py-3 outline-offset-2 marker:content-none transition-colors hover:bg-emerald-500/[0.06] sm:px-4 [&::-webkit-details-marker]:hidden">
                            <div className="min-w-0 flex-1 text-left">
                              <p className="text-sm font-semibold text-foreground">Lower your cost</p>
                              {saveMoneyAggregate ? (
                                <p className="mt-1 text-xs font-medium leading-relaxed text-emerald-950 dark:text-emerald-200/95">
                                  You could save up to {formatUsdBand(saveMoneyAggregate.low, saveMoneyAggregate.high)}
                                </p>
                              ) : (
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                  Tap swaps below to trim typical job cost.
                                </p>
                              )}
                            </div>
                            <ChevronDown
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                              aria-hidden
                            />
                          </summary>
                          <div className="space-y-3 border-t border-emerald-500/15 p-3 sm:p-4">
                            {(generation.saveMoneySuggestions ?? []).map((row, idx) => {
                              const impact = formatTweakImpactBand(row);
                              return (
                                <label
                                  key={`save-${idx}-${row.text.slice(0, 24)}`}
                                  title={row.text}
                                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background px-3 py-3.5 text-left transition-colors hover:border-emerald-500/35 has-[:checked]:border-emerald-500/45 has-[:checked]:bg-emerald-500/[0.06] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 sm:px-3.5 sm:py-3"
                                >
                                  <input
                                    type="checkbox"
                                    name="save_money_option"
                                    value={row.text}
                                    checked={Boolean(saveTweakChecked[idx])}
                                    disabled={regenPending}
                                    onChange={(e) =>
                                      setSaveTweakChecked((prev) => ({ ...prev, [idx]: e.target.checked }))
                                    }
                                    className="mt-1 h-[1.125rem] w-[1.125rem] shrink-0 rounded border-input accent-emerald-600 sm:mt-0.5"
                                  />
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <span className="block text-sm leading-relaxed text-foreground">
                                      {shortTweakLine(row.text)}
                                    </span>
                                    {impact ? (
                                      <span className="inline-flex max-w-full rounded-full bg-emerald-600/12 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-900 dark:text-emerald-300">
                                        {impact}
                                      </span>
                                    ) : null}
                                  </div>
                                </label>
                              );
                            })}
                            {selectedSaveTotal ? (
                              <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.09] px-3 py-2.5 text-sm font-semibold tabular-nums text-emerald-950 dark:text-emerald-100">
                                Total savings: {formatUsdBand(selectedSaveTotal.low, selectedSaveTotal.high)}
                              </p>
                            ) : null}
                          </div>
                        </details>
                      ) : null}

                      {(generation.improveDesignSuggestions?.length ?? 0) > 0 ? (
                        <details className="group overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.07] to-muted/15">
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-2 px-3 py-3 outline-offset-2 marker:content-none transition-colors hover:bg-amber-500/[0.06] sm:px-4 [&::-webkit-details-marker]:hidden">
                            <div className="min-w-0 flex-1 text-left">
                              <p className="text-sm font-semibold text-foreground">Upgrade your design</p>
                              <p className="mt-1 text-xs font-medium leading-relaxed text-amber-950 dark:text-amber-200/95">
                                Upgrade options available
                                {improveDesignAggregate
                                  ? ` — about +${formatUsdBand(improveDesignAggregate.low, improveDesignAggregate.high)} if you picked every idea below`
                                  : ""}
                                .
                              </p>
                            </div>
                            <ChevronDown
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                              aria-hidden
                            />
                          </summary>
                          <div className="space-y-3 border-t border-amber-500/15 p-3 sm:p-4">
                            {(generation.improveDesignSuggestions ?? []).map((row, idx) => {
                              const impact = formatTweakImpactBand(row);
                              return (
                                <label
                                  key={`design-${idx}-${row.text.slice(0, 24)}`}
                                  title={row.text}
                                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background px-3 py-3.5 text-left transition-colors hover:border-amber-500/35 has-[:checked]:border-amber-500/45 has-[:checked]:bg-amber-500/[0.06] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 sm:px-3.5 sm:py-3"
                                >
                                  <input
                                    type="checkbox"
                                    name="improve_design_option"
                                    value={row.text}
                                    checked={Boolean(designTweakChecked[idx])}
                                    disabled={regenPending}
                                    onChange={(e) =>
                                      setDesignTweakChecked((prev) => ({ ...prev, [idx]: e.target.checked }))
                                    }
                                    className="mt-1 h-[1.125rem] w-[1.125rem] shrink-0 rounded border-input accent-amber-600 sm:mt-0.5"
                                  />
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <span className="block text-sm leading-relaxed text-foreground">
                                      {shortTweakLine(row.text)}
                                    </span>
                                    {impact ? (
                                      <span className="inline-flex max-w-full rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-950 dark:text-amber-300">
                                        {impact}
                                      </span>
                                    ) : null}
                                  </div>
                                </label>
                              );
                            })}
                            {selectedUpgradeTotal ? (
                              <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.09] px-3 py-2.5 text-sm font-semibold tabular-nums text-amber-950 dark:text-amber-100">
                                Total upgrades: +{formatUsdBand(selectedUpgradeTotal.low, selectedUpgradeTotal.high)}
                              </p>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
                    <Label htmlFor="try-custom-tweak" className="text-sm font-semibold text-foreground">
                      Advanced: Describe your own changes
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">Optional — materials, colors, fixtures, or layout.</p>
                    <Textarea
                      id="try-custom-tweak"
                      name="custom_tweak"
                      rows={3}
                      maxLength={1200}
                      disabled={regenPending}
                      placeholder="Example: Warmer wood vanity, matte black fixtures, larger mirror."
                      className="mt-2 min-h-[4.5rem] resize-y rounded-lg border-border/80 bg-background text-sm leading-relaxed"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={regenPending}
                    className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm sm:min-w-[11rem]"
                  >
                    {regenPending ? "Applying…" : "Apply changes"}
                  </Button>
                </form>
                {regenState && "error" in regenState ? (
                  <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {regenState.error}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.04]">
              <div className="relative bg-gradient-to-br from-renovision-navy-muted/35 via-card to-card px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
                <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-renovision-orange/[0.06] blur-2xl" aria-hidden />
                <p
                  className="font-bold tabular-nums tracking-tight text-renovision-navy"
                  style={{ fontSize: "clamp(1.65rem, 5.5vw, 2.15rem)", lineHeight: 1.12 }}
                >
                  {usd.format(generation.estimateRange.min)}
                  <span className="mx-1.5 font-semibold text-muted-foreground/80">–</span>
                  {usd.format(generation.estimateRange.max)}
                </p>
                {generation.estimateRefinementPending ? (
                  <p className="mt-2 max-w-xl text-xs font-medium text-muted-foreground">
                    Narrowing this range from your photos… (usually under a minute)
                  </p>
                ) : null}
              </div>

              <details className="group border-t border-border/70 bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 outline-offset-2 marker:content-none transition-colors hover:bg-muted/35 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-foreground">Breakdown</p>
                  </div>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="space-y-5 border-t border-border/60 bg-background/60 px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Split</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 text-center shadow-sm">
                        <p className="text-[11px] font-medium text-muted-foreground">Materials</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                          {usd.format(generation.breakdown.materials.min)}–{usd.format(generation.breakdown.materials.max)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 text-center shadow-sm">
                        <p className="text-[11px] font-medium text-muted-foreground">Labor</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                          {usd.format(generation.breakdown.labor.min)}–{usd.format(generation.breakdown.labor.max)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 text-center shadow-sm">
                        <p className="text-[11px] font-medium text-muted-foreground">Fixtures &amp; finishes</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                          {usd.format(generation.breakdown.fixtures.min)}–{usd.format(generation.breakdown.fixtures.max)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Confidence:</span> {generation.confidence}
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">Line items</p>
                    <div className="space-y-2 text-sm">
                      {(generation.detailedBreakdown ?? []).map((item) => (
                        <div
                          key={`${item.category}-${item.min}-${item.max}`}
                          className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm"
                        >
                          <p className="font-medium text-foreground">
                            {item.category}{" "}
                            <span className="tabular-nums text-renovision-navy">
                              {usd.format(item.min)}–{usd.format(item.max)}
                            </span>
                          </p>
                          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(generation.reasoning?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-foreground">Why this price</p>
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        {(generation.reasoning ?? []).map((point, idx) => (
                          <li key={`${idx}-${point}`} className="flex gap-2 leading-snug">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-renovision-orange/70" aria-hidden />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {(generation.assumptions?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-foreground">Assumptions &amp; risks</p>
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        {(generation.assumptions ?? []).map((point, idx) => (
                          <li key={`${idx}-${point}`} className="flex gap-2 leading-snug">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-renovision-teal/70" aria-hidden />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </details>
            </div>

            <div className="rounded-2xl border border-renovision-navy/20 bg-gradient-to-b from-background to-renovision-navy-muted/25 p-4 shadow-lg sm:p-5">
              <p className="text-lg font-semibold">Like this direction? Pick what to do next.</p>
              <p className="mt-1 text-xs text-muted-foreground">Quick actions</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <form action={connectAction} className="w-full">
                  <input type="hidden" name="generation_id" value={generation.generationId} />
                  <input type="hidden" name="project_id" value={generation.projectId} />
                  <input type="hidden" name="attribution_json" value={attributionJson} />
                  <Button
                    type="submit"
                    className="h-11 w-full rounded-xl text-sm font-semibold"
                    onClick={() => trackEvent("connect_me_clicked")}
                  >
                    Connect Me With a Remodeler
                  </Button>
                </form>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl text-sm font-semibold"
                  onClick={() => {
                    setGeneration(null);
                    setSelectedStyle("spa_retreat");
                    setLeadSubmitted(false);
                    setLeadOpen(false);
                    setFirstUploadPreviewUrl(null);
                    setLoaderBeforeBlob(null);
                    setTryResultCustomizeOpen(false);
                    setStep("upload");
                  }}
                >
                  Start New Project
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Sign up or sign in to save your project and keep every preview version in one place.
                </p>
                    {!initial.userEmail ? (
                  <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Link
                        href={`/signup?next=${encodeURIComponent(
                          `/try?restore_generation_id=${encodeURIComponent(generation.generationId)}&restore_project_id=${encodeURIComponent(generation.projectId)}`,
                        )}`}
                        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-renovision-navy px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-renovision-navy/90 sm:w-auto sm:min-w-[12rem]"
                      >
                        Create free account
                      </Link>
                      <Link
                        href={`/login?next=${encodeURIComponent(
                          `/try?restore_generation_id=${encodeURIComponent(generation.generationId)}&restore_project_id=${encodeURIComponent(generation.projectId)}`,
                        )}`}
                        className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:w-auto sm:min-w-[10rem]"
                      >
                        Log in
                      </Link>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your previews also appear in{" "}
                      <Link href="/projects" className="font-medium text-renovision-navy underline-offset-4 hover:underline">
                        My Projects
                      </Link>{" "}
                      on this device.
                    </p>
                  </>
                ) : null}
                <p className="text-xs text-muted-foreground">No contractor contact unless you request it.</p>
              </div>
            </div>
            </>
            ) : null}
          </section>
        ) : null}

        {leadOpen && generation ? (
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-4 sm:items-center">
            <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border/80 bg-card p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xl font-semibold">Project details</p>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => setLeadOpen(false)}
                >
                  Close
                </button>
              </div>
              {!leadSubmitted ? (
                <form action={leadAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="generation_id" value={generation.generationId} />
                <input type="hidden" name="project_id" value={generation.projectId} />
                <input type="hidden" name="selected_style" value={generation.styleName} />
                <input type="hidden" name="estimate_min" value={String(generation.estimateRange.min)} />
                <input type="hidden" name="estimate_max" value={String(generation.estimateRange.max)} />
                <input type="hidden" name="estimate_breakdown_json" value={JSON.stringify(generation.breakdown)} />
                <input
                  type="hidden"
                  name="estimate_detailed_breakdown_json"
                  value={JSON.stringify(generation.detailedBreakdown)}
                />
                <input type="hidden" name="estimate_reasoning_json" value={JSON.stringify(generation.reasoning)} />
                <input type="hidden" name="estimate_assumptions_json" value={JSON.stringify(generation.assumptions)} />
                <input type="hidden" name="estimate_confidence" value={generation.confidence} />
                <input type="hidden" name="attribution_json" value={attributionJson} />
                <div className="space-y-1">
                  <Label htmlFor="lead_first_name">First name</Label>
                  <Input id="lead_first_name" name="first_name" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_last_name">Last name (optional)</Label>
                  <Input id="lead_last_name" name="last_name" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_email">Email</Label>
                  <Input id="lead_email" name="email" type="email" required defaultValue={initial.userEmail ?? ""} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_phone">Phone</Label>
                  <Input id="lead_phone" name="phone" required autoComplete="tel" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_zip">ZIP code</Label>
                  <Input
                    id="lead_zip"
                    name="zip_code"
                    required
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="12345"
                    maxLength={10}
                    className="font-mono tabular-nums"
                    title="US ZIP: 5 digits or ZIP+4"
                    pattern="\d{5}(-\d{4})?"
                  />
                  <p className="text-xs text-muted-foreground">Required — we use this to match you with local remodelers.</p>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="lead_street">Street address (optional)</Label>
                  <Input
                    id="lead_street"
                    name="street_address"
                    autoComplete="street-address"
                    placeholder="Street, unit, city (optional)"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_timeline">Timeline</Label>
                  <select id="lead_timeline" name="timeline" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                    <option value="">Select timeline</option>
                    <option>ASAP</option>
                    <option>1–3 months</option>
                    <option>3–6 months</option>
                    <option>Just exploring</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_budget">Budget range</Label>
                  <select id="lead_budget" name="budget_range" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                    <option value="">Select budget</option>
                    <option>Under $10K</option>
                    <option>$10K–$20K</option>
                    <option>$20K–$35K</option>
                    <option>$35K+</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_contact_method">Preferred contact method</Label>
                  <select
                    id="lead_contact_method"
                    name="preferred_contact_method"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    required
                  >
                    <option value="">Select preference</option>
                    <option>Text</option>
                    <option>Phone call</option>
                    <option>Email</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_contact_time">Best time to reach you (optional)</Label>
                  <select
                    id="lead_contact_time"
                    name="best_contact_time"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Anytime</option>
                    <option>Morning</option>
                    <option>Afternoon</option>
                    <option>Evening</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="lead_notes">Project notes</Label>
                  <textarea
                    id="lead_notes"
                    name="project_notes"
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Any extra details for your remodel goals"
                  />
                </div>
                {leadState && "error" in leadState ? <p className="text-sm text-destructive sm:col-span-2">{leadState.error}</p> : null}
                <div className="sm:col-span-2">
                  <Button type="submit" className="rounded-xl" disabled={leadPending}>
                    {leadPending ? "Submitting…" : "Submit"}
                  </Button>
                </div>
                </form>
              ) : (
                <div className="mt-2 space-y-3">
                  <p className="text-sm font-medium text-renovision-teal">
                    Thanks. Your details were submitted and we&apos;ll connect you with remodelers.
                  </p>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setLeadOpen(false)}>
                    Done
                  </Button>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>

    </div>
  );
}
