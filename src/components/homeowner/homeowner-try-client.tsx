"use client";

import {
  type ComponentPropsWithoutRef,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Camera, ChevronDown, Images, PiggyBank, Sparkles } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  generateBathroomMockupAction,
  regenerateBathroomMockupAction,
  selectTryMockupVersionAction,
  submitBathroomLeadAction,
  trackConnectClickedAction,
  type HomeownerTryPageState,
  type TryTweakSuggestion,
} from "@/lib/actions/homeowner-try";
import { BATHROOM_STYLES } from "@/lib/homeowner-try/bathroom-styles";
import { BeforeAfterCompareSlider } from "@/components/homeowner/before-after-compare-slider";
import { RenovisionGeneratingLoader } from "@/components/homeowner/renovision-generating-loader";
import afterBoldImage from "../../../Images/after_bold.png";
import afterCleanImage from "../../../Images/after_clean.png";
import afterLuxuryImage from "../../../Images/after_luxury.png";
import afterSpaImage from "../../../Images/after_spa.png";
import afterWarmImage from "../../../Images/after_warm.png";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Approximate shift to total job midpoint vs current estimate; from estimator JSON. */
function formatTweakImpactBand(s: TryTweakSuggestion): string {
  const lo = Math.round(Math.min(s.deltaMin, s.deltaMax));
  const hi = Math.round(Math.max(s.deltaMin, s.deltaMax));
  if (lo === 0 && hi === 0) return "";
  if (hi <= 0) {
    return lo === hi
      ? `Est. save ~${usd.format(Math.abs(lo))}`
      : `Est. save ~${usd.format(Math.abs(hi))}–${usd.format(Math.abs(lo))}`;
  }
  if (lo >= 0) {
    return lo === hi ? `Est. +${usd.format(lo)}` : `Est. +${usd.format(lo)}–${usd.format(hi)}`;
  }
  return `${usd.format(lo)}–${usd.format(hi)}`;
}

type TryMockupVersionRow = { id: string; label: string; imageUrl: string; storagePath: string };

/** Copy a picked `File` onto the real form `<input name="bathroom_photo">` (camera vs library use separate pickers). */
function assignImageToFileInput(target: HTMLInputElement, file: File | undefined | null) {
  if (!file) return;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    target.files = dt.files;
  } catch {
    return;
  }
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Left side of compare — display only; does not change which mockup edits/regen use. */
function CompareBeforePicker({
  idSuffix,
  mockupVersions,
  value,
  onChange,
  disabled,
}: {
  idSuffix: string;
  mockupVersions: TryMockupVersionRow[];
  value: string;
  onChange: (mockupIdOrOriginal: string) => void;
  disabled: boolean;
}) {
  if (mockupVersions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={`compare-before-${idSuffix}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Left (before)
      </Label>
      <select
        id={`compare-before-${idSuffix}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-[8rem] rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="original">Original photo</option>
        {mockupVersions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label} mockup
          </option>
        ))}
      </select>
    </div>
  );
}

function MockupVersionPicker({
  idSuffix,
  generation,
  versionAction,
  disabled,
  label = "After version",
}: {
  idSuffix: string;
  generation: {
    generationId: string;
    projectId: string;
    mockupVersions: TryMockupVersionRow[];
    activeMockupId: string;
  };
  versionAction: NonNullable<ComponentPropsWithoutRef<"form">["action"]>;
  disabled: boolean;
  /** Shown next to the dropdown (e.g. "Right (after)" when comparing two mockups). */
  label?: string;
}) {
  if (generation.mockupVersions.length === 0) return null;
  return (
    <form action={versionAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="generation_id" value={generation.generationId} />
      <input type="hidden" name="project_id" value={generation.projectId} />
      <Label htmlFor={`mockup-ver-${idSuffix}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <select
        id={`mockup-ver-${idSuffix}`}
        name="mockup_id"
        defaultValue={generation.activeMockupId}
        key={`${generation.activeMockupId}-${generation.mockupVersions.length}`}
        disabled={disabled}
        className="h-9 min-w-[5.5rem] rounded-md border border-input bg-background px-2 text-sm"
        onChange={(e) => {
          e.currentTarget.form?.requestSubmit();
        }}
      >
        {generation.mockupVersions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </form>
  );
}

export function HomeownerTryClient({ initial }: { initial: Exclude<HomeownerTryPageState, { ok: false }> }) {
  const [selectedStyle, setSelectedStyle] = useState<(typeof BATHROOM_STYLES)[number]["id"] | null>(null);
  const [userDescription, setUserDescription] = useState("");
  const [step, setStep] = useState<"style" | "upload" | "result" | "connect">("style");
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
  } | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  /** Compare slider / split left side: original upload or a saved mockup id (display-only). */
  const [compareBeforeSelection, setCompareBeforeSelection] = useState<string>("original");
  /** Local `blob:` preview of the file picked on the upload step — used behind the loader on first generate. */
  const [firstUploadPreviewUrl, setFirstUploadPreviewUrl] = useState<string | null>(null);
  const bathroomPhotoInputRef = useRef<HTMLInputElement>(null);
  const bathroomCameraInputRef = useRef<HTMLInputElement>(null);
  const bathroomLibraryInputRef = useRef<HTMLInputElement>(null);

  const [generateState, generateAction, generatePending] = useActionState(generateBathroomMockupAction, undefined);
  const [regenState, regenAction, regenPending] = useActionState(regenerateBathroomMockupAction, undefined);
  const [versionState, versionAction, versionPending] = useActionState(selectTryMockupVersionAction, undefined);
  const [connectState, connectAction] = useActionState(trackConnectClickedAction, undefined);
  const [leadState, leadAction, leadPending] = useActionState(submitBathroomLeadAction, undefined);

  useEffect(() => {
    if (generateState && "success" in generateState && generateState.success) {
      setGeneration(generateState);
      setCompareBeforeSelection("original");
      setStep("result");
      setFirstUploadPreviewUrl(null);
    }
  }, [generateState]);

  useEffect(() => {
    if (!firstUploadPreviewUrl) return;
    return () => URL.revokeObjectURL(firstUploadPreviewUrl);
  }, [firstUploadPreviewUrl]);

  useEffect(() => {
    if (regenState && "success" in regenState && regenState.success) {
      setGeneration((prev) =>
        prev
          ? {
              ...prev,
              generatedImageUrl: regenState.generatedImageUrl,
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
            }
          : prev,
      );
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
      setLeadSubmitted(true);
    }
  }, [leadState]);

  const selectedStyleConfig = useMemo(
    () => BATHROOM_STYLES.find((s) => s.id === selectedStyle) ?? null,
    [selectedStyle],
  );

  const progressText = useMemo(() => {
    if (step === "style") return "Style → Upload → Result → Connect";
    if (step === "upload") return "Style ✓ → Upload → Result → Connect";
    if (step === "result") return "Style ✓ → Upload ✓ → Result → Connect";
    return "Style ✓ → Upload ✓ → Result ✓ → Connect";
  }, [step]);

  const loading = generatePending || regenPending || versionPending;

  const loadingCopy = useMemo(() => {
    if (generatePending) {
      return {
        title: "Generating your first mockup…",
        hint: "Typical wait: about 1–2 minutes.",
      };
    }
    if (regenPending) {
      return {
        title: "Applying your tweak…",
        hint: "Typical wait: about 1–2 minutes.",
      };
    }
    if (versionPending) {
      return {
        title: "Switching mockup version…",
        hint: "Usually under a minute.",
      };
    }
    return {
      title: "Creating your bathroom remodel with Vertex AI…",
      hint: "Typical wait: about 1–2 minutes.",
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
  const activePromptProfile = useMemo(() => {
    if (!generation) return "Master";
    if (generation.selectedStyle === "spa_retreat") return "Master + Spa Retreat";
    if (generation.selectedStyle === "bold_modern") return "Master + Bold Modern";
    if (generation.selectedStyle === "luxury_escape") return "Master + Luxury Escape";
    return `Master + ${generation.styleName}`;
  }, [generation]);

  const afterImageForDisplay = useMemo(() => {
    if (!generation) return "";
    const match = generation.mockupVersions.find((v) => v.id === generation.activeMockupId);
    return match?.imageUrl ?? generation.generatedImageUrl;
  }, [generation]);

  const beforeImageForCompare = useMemo(() => {
    if (!generation) return "";
    if (compareBeforeSelection === "original") return generation.uploadedImageUrl;
    const row = generation.mockupVersions.find((v) => v.id === compareBeforeSelection);
    return row?.imageUrl ?? generation.uploadedImageUrl;
  }, [generation, compareBeforeSelection]);

  useEffect(() => {
    if (!generation || compareBeforeSelection === "original") return;
    const ok = generation.mockupVersions.some((v) => v.id === compareBeforeSelection);
    if (!ok) setCompareBeforeSelection("original");
  }, [generation, compareBeforeSelection]);

  return (
    <div className="relative min-h-[70vh]">
      {loading ? (
        <RenovisionGeneratingLoader
          title={loadingCopy.title}
          hint={loadingCopy.hint}
          elapsedSec={loadingElapsedSec}
          beforeImageUrl={generation?.uploadedImageUrl ?? firstUploadPreviewUrl}
        />
      ) : null}

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-renovision-orange">Renovision MVP</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight">See your future bathroom instantly</h1>
          <p className="text-sm text-muted-foreground">Choose a vibe, upload your bathroom, and get an AI mockup fast.</p>
          <p className="text-xs font-medium text-renovision-navy">{progressText}</p>
        </header>

        {step === "style" ? (
          <section className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BATHROOM_STYLES.map((style) => (
                <article key={style.id} className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
                  <div className="relative aspect-[4/3] bg-muted">
                    {style.id === "spa_retreat" ? (
                      <Image
                        src={afterSpaImage}
                        alt="Spa Retreat bathroom inspiration"
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 33vw"
                      />
                    ) : style.id === "bold_modern" ? (
                      <Image
                        src={afterBoldImage}
                        alt="Bold Modern bathroom inspiration"
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 33vw"
                      />
                    ) : style.id === "luxury_escape" ? (
                      <Image
                        src={afterLuxuryImage}
                        alt="Luxury Escape bathroom inspiration"
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 33vw"
                      />
                    ) : style.id === "clean_refresh" ? (
                      <Image
                        src={afterCleanImage}
                        alt="Clean Refresh bathroom inspiration"
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 33vw"
                      />
                    ) : style.id === "warm_minimalist" ? (
                      <Image
                        src={afterWarmImage}
                        alt="Warm Minimalist bathroom inspiration"
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Bathroom inspiration
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex min-w-0 items-baseline justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-base font-semibold leading-tight">{style.name}</p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-renovision-navy">
                        ${Math.round(style.estimateMin / 1000)}K–${Math.round(style.estimateMax / 1000)}K
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{style.subtitle}</p>
                    <Button
                      type="button"
                      className="w-full rounded-xl"
                      onClick={() => {
                        setSelectedStyle(style.id);
                        setStep("upload");
                      }}
                    >
                      Use this style
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
              <Label htmlFor="user_vision" className="text-sm font-semibold">
                Have your own vision?
              </Label>
              <textarea
                id="user_vision"
                value={userDescription}
                onChange={(e) => setUserDescription(e.target.value)}
                rows={4}
                className="mt-2 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Example: bright spa bathroom with white tile, wood vanity, black fixtures…"
              />
            </div>
          </section>
        ) : null}

        {step === "upload" ? (
          <form action={generateAction} className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
            <input type="hidden" name="selected_style" value={selectedStyle ?? ""} />
            <input type="hidden" name="user_description" value={userDescription} />
            <div>
              <p className="text-xl font-semibold">Upload your bathroom</p>
              <p className="text-sm text-muted-foreground">We&apos;ll turn it into your selected remodel style.</p>
              {selectedStyleConfig ? (
                <p className="mt-1 text-xs font-medium text-renovision-navy">Selected style: {selectedStyleConfig.name}</p>
              ) : null}
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="bathroom_photo" className="text-sm font-medium">
                  Bathroom photo
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Take a new picture with your camera, or choose one from your photo library.
                </p>
              </div>
              <input
                ref={bathroomPhotoInputRef}
                id="bathroom_photo"
                name="bathroom_photo"
                type="file"
                accept="image/*"
                required
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFirstUploadPreviewUrl(file ? URL.createObjectURL(file) : null);
                }}
              />
              <input
                ref={bathroomCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const main = bathroomPhotoInputRef.current;
                  if (main && file) assignImageToFileInput(main, file);
                  e.target.value = "";
                }}
              />
              <input
                ref={bathroomLibraryInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const main = bathroomPhotoInputRef.current;
                  if (main && file) assignImageToFileInput(main, file);
                  e.target.value = "";
                }}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full justify-center gap-2 rounded-xl border-dashed text-base sm:h-11"
                  onClick={() => bathroomCameraInputRef.current?.click()}
                >
                  <Camera className="size-5 shrink-0" aria-hidden />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full justify-center gap-2 rounded-xl border-dashed text-base sm:h-11"
                  onClick={() => bathroomLibraryInputRef.current?.click()}
                >
                  <Images className="size-5 shrink-0" aria-hidden />
                  Photo library
                </Button>
              </div>
              {firstUploadPreviewUrl ? (
                <div className="relative mx-auto mt-3 aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-border bg-muted">
                  <Image
                    src={firstUploadPreviewUrl}
                    alt="Selected bathroom preview"
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
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFirstUploadPreviewUrl(null);
                  setStep("style");
                }}
              >
                Back
              </Button>
              <Button type="submit" className="rounded-xl">
                {generatePending ? "Creating your bathroom remodel…" : "Generate my first mockup"}
              </Button>
            </div>
          </form>
        ) : null}

        {step === "result" && generation ? (
          <section className="space-y-6">
            <div className="space-y-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compare</p>
                  <p className="text-sm text-muted-foreground">
                    Pick what is on the left (original or any mockup) and on the right (active mockup). Drag the slider
                    to cross-fade.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
                  <CompareBeforePicker
                    idSuffix="slider"
                    mockupVersions={generation.mockupVersions}
                    value={compareBeforeSelection}
                    onChange={setCompareBeforeSelection}
                    disabled={versionPending}
                  />
                  <MockupVersionPicker
                    idSuffix="compare"
                    generation={generation}
                    versionAction={versionAction}
                    disabled={versionPending}
                    label="Right (after)"
                  />
                </div>
              </div>
              {versionState && "error" in versionState ? (
                <p className="text-sm text-destructive">{versionState.error}</p>
              ) : null}
              <BeforeAfterCompareSlider beforeUrl={beforeImageForCompare} afterUrl={afterImageForDisplay} />
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Side by side</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
                  <CompareBeforePicker
                    idSuffix="split-left"
                    mockupVersions={generation.mockupVersions}
                    value={compareBeforeSelection}
                    onChange={setCompareBeforeSelection}
                    disabled={versionPending}
                  />
                  <MockupVersionPicker
                    idSuffix="split"
                    generation={generation}
                    versionAction={versionAction}
                    disabled={versionPending}
                    label="Right (after)"
                  />
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Left</p>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/80 bg-muted">
                    <Image src={beforeImageForCompare} alt="" fill className="object-cover" unoptimized />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Right</p>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/80 bg-muted">
                    <Image src={afterImageForDisplay} alt="" fill className="object-cover" unoptimized />
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.04]">
              <div className="border-b border-border/60 bg-gradient-to-br from-renovision-navy-muted/45 via-card to-card px-4 py-5 sm:px-6 sm:py-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-renovision-orange">
                  Refine your mockup
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Tweak the design</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Pick ideas below (and/or add your own notes).{" "}
                  <span className="font-medium text-foreground">Update preview</span> reruns from your{" "}
                  <strong className="font-semibold text-foreground">current after</strong> image — same room layout,
                  finish-only edits. Dollar hints are AI ballparks, not a bid.
                </p>
              </div>

              <div className="p-4 sm:p-6">
                <form action={regenAction} className="space-y-5 sm:space-y-6">
                  <input type="hidden" name="generation_id" value={generation.generationId} />
                  <input type="hidden" name="project_id" value={generation.projectId} />
                  <input type="hidden" name="selected_style" value={generation.selectedStyle} />
                  <input type="hidden" name="image_source" value="current_mockup" />
                  <input type="hidden" name="source_mockup_id" value={generation.activeMockupId} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    <div
                      className="space-y-3 rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.07] to-card p-4 shadow-sm sm:p-5"
                      role="group"
                      aria-label="Lower cost suggestions"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-800 dark:text-emerald-400">
                          <PiggyBank className="size-5" strokeWidth={2} aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-foreground">Lower cost</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Finish swaps that lean cheaper. Same walls, openings, and fixture positions.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {(generation.saveMoneySuggestions ?? []).map((row, idx) => {
                          const impact = formatTweakImpactBand(row);
                          return (
                            <label
                              key={`save-${idx}-${row.text.slice(0, 24)}`}
                              className="flex cursor-pointer gap-3 rounded-xl border border-border/70 bg-background px-3 py-3 shadow-sm transition-colors hover:border-emerald-500/35 has-[:checked]:border-emerald-500/50 has-[:checked]:bg-emerald-500/[0.08] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                            >
                              <input
                                type="checkbox"
                                name="save_money_option"
                                value={row.text}
                                disabled={regenPending}
                                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-input accent-emerald-600"
                              />
                              <div className="min-w-0 flex-1 space-y-1.5 text-left">
                                <span className="text-[15px] leading-snug text-foreground sm:text-sm">
                                  <span className="font-semibold text-renovision-navy">{idx + 1}.</span> {row.text}
                                </span>
                                {impact ? (
                                  <span className="inline-flex max-w-full rounded-full bg-emerald-600/12 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-900 dark:text-emerald-300">
                                    {impact}
                                  </span>
                                ) : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      className="space-y-3 rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.07] to-card p-4 shadow-sm sm:p-5"
                      role="group"
                      aria-label="Improve design suggestions"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-900 dark:text-amber-400">
                          <Sparkles className="size-5" strokeWidth={2} aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-foreground">Improve design</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Styling upgrades applied together in one pass. Same layout guardrails as above.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {(generation.improveDesignSuggestions ?? []).map((row, idx) => {
                          const impact = formatTweakImpactBand(row);
                          return (
                            <label
                              key={`design-${idx}-${row.text.slice(0, 24)}`}
                              className="flex cursor-pointer gap-3 rounded-xl border border-border/70 bg-background px-3 py-3 shadow-sm transition-colors hover:border-amber-500/35 has-[:checked]:border-amber-500/50 has-[:checked]:bg-amber-500/[0.08] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                            >
                              <input
                                type="checkbox"
                                name="improve_design_option"
                                value={row.text}
                                disabled={regenPending}
                                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-input accent-amber-600"
                              />
                              <div className="min-w-0 flex-1 space-y-1.5 text-left">
                                <span className="text-[15px] leading-snug text-foreground sm:text-sm">
                                  <span className="font-semibold text-renovision-navy">{idx + 1}.</span> {row.text}
                                </span>
                                {impact ? (
                                  <span className="inline-flex max-w-full rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-950 dark:text-amber-300">
                                    {impact}
                                  </span>
                                ) : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/25 p-4 sm:p-5">
                    <Label htmlFor="try-custom-tweak" className="text-base font-semibold text-foreground sm:text-sm">
                      Custom directions <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="try-custom-tweak"
                      name="custom_tweak"
                      rows={4}
                      maxLength={1200}
                      disabled={regenPending}
                      placeholder="e.g. Warmer paint, satin nickel hardware, larger floor tile look — no layout changes."
                      className="mt-3 min-h-[6.5rem] resize-y rounded-xl border-border/80 bg-background text-[15px] leading-relaxed sm:min-h-[5.5rem] sm:text-sm"
                    />
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Finishes only on what&apos;s already in the scene. Layout and fixture positions stay fixed. Custom
                      text isn&apos;t auto-priced per line.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-border/60 pt-5">
                    <Button
                      type="submit"
                      disabled={regenPending}
                      className="h-12 w-full rounded-xl text-base font-semibold shadow-md sm:h-11 sm:max-w-xs"
                    >
                      {regenPending ? "Updating preview…" : "Update preview"}
                    </Button>
                    <p className="text-center text-xs leading-relaxed text-muted-foreground sm:text-left">
                      Choose at least one checkbox and/or add custom directions, then submit.
                    </p>
                  </div>
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-renovision-orange">
                  Remodel estimate
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">{generation.styleName}</p>
                <p
                  className="mt-3 font-bold tabular-nums tracking-tight text-renovision-navy"
                  style={{ fontSize: "clamp(1.65rem, 5.5vw, 2.15rem)", lineHeight: 1.12 }}
                >
                  {usd.format(generation.estimateRange.min)}
                  <span className="mx-1.5 font-semibold text-muted-foreground/80">–</span>
                  {usd.format(generation.estimateRange.max)}
                </p>
                <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
                  Planning-range ballpark from your photo and style — not a contractor bid.
                </p>
              </div>

              <details className="group border-t border-border/70 bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 outline-offset-2 marker:content-none transition-colors hover:bg-muted/35 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-foreground">Breakdown &amp; details</p>
                    <p className="text-xs text-muted-foreground">Materials, line items, notes, regenerate</p>
                  </div>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="space-y-5 border-t border-border/60 bg-background/60 px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
                  <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Prompt profile:</span> {activePromptProfile}
                  </p>
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
                  <form action={regenAction} className="flex flex-col gap-2 border-t border-border/50 pt-4">
                    <input type="hidden" name="generation_id" value={generation.generationId} />
                    <input type="hidden" name="project_id" value={generation.projectId} />
                    <input type="hidden" name="selected_style" value={generation.selectedStyle} />
                    <input type="hidden" name="image_source" value="original" />
                    <Button type="submit" variant="outline" className="w-full rounded-xl sm:w-auto" disabled={regenPending}>
                      {regenPending ? "Regenerating..." : "Regenerate from photo"}
                    </Button>
                    {regenState && "error" in regenState ? (
                      <p className="text-sm text-destructive">{regenState.error}</p>
                    ) : null}
                  </form>
                </div>
              </details>
            </div>

            <div className="sticky bottom-3 rounded-2xl border border-renovision-navy/20 bg-background p-4 shadow-lg">
              <p className="text-lg font-semibold">Want a contractor to quote this remodel?</p>
              <p className="text-sm text-muted-foreground">
                Share your project details and we&apos;ll help connect you with remodelers who can bring this design to life.
              </p>
              <form action={connectAction} className="mt-3">
                <input type="hidden" name="generation_id" value={generation.generationId} />
                <input type="hidden" name="project_id" value={generation.projectId} />
                <Button type="submit" className="w-full rounded-xl sm:w-auto">
                  Connect me with a contractor
                </Button>
              </form>
            </div>
          </section>
        ) : null}

        {leadOpen && generation ? (
          <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
            <p className="text-xl font-semibold">Project details</p>
            {!leadSubmitted ? (
              <form action={leadAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="generation_id" value={generation.generationId} />
                <input type="hidden" name="project_id" value={generation.projectId} />
                <input type="hidden" name="selected_style" value={generation.styleName} />
                <input type="hidden" name="estimate_min" value={String(generation.estimateRange.min)} />
                <input type="hidden" name="estimate_max" value={String(generation.estimateRange.max)} />
                <div className="space-y-1">
                  <Label htmlFor="lead_name">Name</Label>
                  <Input id="lead_name" name="name" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_email">Email</Label>
                  <Input id="lead_email" name="email" type="email" required defaultValue={initial.userEmail ?? ""} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_phone">Phone</Label>
                  <Input id="lead_phone" name="phone" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lead_zip">Zip code</Label>
                  <Input id="lead_zip" name="zip_code" required />
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
              <p className="mt-2 text-sm font-medium text-renovision-teal">
                Thanks. Your details were submitted and we&apos;ll connect you with remodelers.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
