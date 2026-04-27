"use client";

import {
  type ComponentPropsWithoutRef,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
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
              detailedBreakdown: regenState.detailedBreakdown,
              reasoning: regenState.reasoning,
              assumptions: regenState.assumptions,
              confidence: regenState.confidence,
              saveMoneySuggestions: regenState.saveMoneySuggestions,
              improveDesignSuggestions: regenState.improveDesignSuggestions,
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
                    <p className="text-base font-semibold">{style.name}</p>
                    <p className="text-sm text-muted-foreground">{style.subtitle}</p>
                    <p className="text-sm font-medium">
                      ${Math.round(style.estimateMin / 1000)}K-${Math.round(style.estimateMax / 1000)}K
                    </p>
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
            <div className="space-y-2">
              <Label htmlFor="bathroom_photo">Bathroom image</Label>
              <Input
                id="bathroom_photo"
                name="bathroom_photo"
                type="file"
                accept="image/*"
                required
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFirstUploadPreviewUrl(file ? URL.createObjectURL(file) : null);
                }}
              />
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

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">{generation.styleName}</p>
              <p className="mt-1 text-xs text-muted-foreground">Active prompt profile: {activePromptProfile}</p>
              <p className="mt-1 text-lg font-semibold">
                Estimated remodel range: {usd.format(generation.estimateRange.min)}-{usd.format(generation.estimateRange.max)}
              </p>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <p>
                  Materials: {usd.format(generation.breakdown.materials.min)}-{usd.format(generation.breakdown.materials.max)}
                </p>
                <p>
                  Labor: {usd.format(generation.breakdown.labor.min)}-{usd.format(generation.breakdown.labor.max)}
                </p>
                <p>
                  Fixtures / finishes: {usd.format(generation.breakdown.fixtures.min)}-{usd.format(generation.breakdown.fixtures.max)}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Estimator confidence: {generation.confidence}</p>
              <div className="mt-4 space-y-2">
                <p className="text-sm font-semibold">Detailed line-item estimate</p>
                <div className="space-y-2 text-sm">
                  {generation.detailedBreakdown.map((item) => (
                    <div key={`${item.category}-${item.min}-${item.max}`} className="rounded-lg border border-border/70 p-3">
                      <p className="font-medium">
                        {item.category}: {usd.format(item.min)}-{usd.format(item.max)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
              {generation.reasoning.length > 0 ? (
                <div className="mt-4 space-y-1">
                  <p className="text-sm font-semibold">Why this price</p>
                  {generation.reasoning.map((point, idx) => (
                    <p key={`${idx}-${point}`} className="text-sm text-muted-foreground">
                      • {point}
                    </p>
                  ))}
                </div>
              ) : null}
              {generation.assumptions.length > 0 ? (
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-semibold">Assumptions / risk factors</p>
                  {generation.assumptions.map((point, idx) => (
                    <p key={`${idx}-${point}`} className="text-sm text-muted-foreground">
                      • {point}
                    </p>
                  ))}
                </div>
              ) : null}
              <form action={regenAction} className="mt-4">
                <input type="hidden" name="generation_id" value={generation.generationId} />
                <input type="hidden" name="project_id" value={generation.projectId} />
                <input type="hidden" name="selected_style" value={generation.selectedStyle} />
                <input type="hidden" name="image_source" value="original" />
                <Button type="submit" variant="outline" disabled={regenPending}>
                  {regenPending ? "Regenerating..." : "Regenerate from photo"}
                </Button>
              </form>
              {regenState && "error" in regenState ? (
                <p className="mt-2 text-sm text-destructive">{regenState.error}</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <p className="text-lg font-semibold">Want to tweak the design?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Suggestions come from the same before/after analysis as your estimate.{" "}
                <span className="font-medium text-foreground">
                  Update preview runs a new render from your current after image
                </span>{" "}
                (the version shown on the right), keeping the same room layout — not by restarting from the original
                upload alone.
              </p>
              <form action={regenAction} className="mt-4 space-y-4">
                <input type="hidden" name="generation_id" value={generation.generationId} />
                <input type="hidden" name="project_id" value={generation.projectId} />
                <input type="hidden" name="selected_style" value={generation.selectedStyle} />
                <input type="hidden" name="image_source" value="current_mockup" />
                <input type="hidden" name="source_mockup_id" value={generation.activeMockupId} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="text-sm font-semibold text-foreground">Lower cost</p>
                    <p className="text-xs text-muted-foreground">
                      Check any ideas to bake in, add custom notes below, or both. Edits stay finish-only: same walls,
                      openings, and fixture positions. Dollar tags are AI estimates vs your current range midpoint, not a
                      bid.
                    </p>
                    <div className="space-y-2">
                      {generation.saveMoneySuggestions.map((row, idx) => {
                        const impact = formatTweakImpactBand(row);
                        return (
                        <label
                          key={`save-${idx}-${row.text.slice(0, 24)}`}
                          className="flex cursor-pointer gap-2 rounded-lg border border-transparent px-1 py-2 text-left hover:border-border/80 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                        >
                          <input
                            type="checkbox"
                            name="save_money_option"
                            value={row.text}
                            disabled={regenPending}
                            className="mt-0.5 size-4 shrink-0 rounded border-input"
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                            <span className="text-sm leading-snug">
                              <span className="font-medium text-renovision-navy">{idx + 1}. </span>
                              {row.text}
                            </span>
                            {impact ? (
                              <span className="shrink-0 text-xs font-medium tabular-nums text-emerald-800 dark:text-emerald-400">
                                {impact}
                              </span>
                            ) : null}
                          </div>
                        </label>
                      );
                      })}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="text-sm font-semibold text-foreground">Improve design</p>
                    <p className="text-xs text-muted-foreground">
                      Check finish and styling upgrades. All checked items are applied together in one pass. Dollar tags
                      are rough add-on estimates vs midpoint, not a bid.
                    </p>
                    <div className="space-y-2">
                      {generation.improveDesignSuggestions.map((row, idx) => {
                        const impact = formatTweakImpactBand(row);
                        return (
                        <label
                          key={`design-${idx}-${row.text.slice(0, 24)}`}
                          className="flex cursor-pointer gap-2 rounded-lg border border-transparent px-1 py-2 text-left hover:border-border/80 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                        >
                          <input
                            type="checkbox"
                            name="improve_design_option"
                            value={row.text}
                            disabled={regenPending}
                            className="mt-0.5 size-4 shrink-0 rounded border-input"
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                            <span className="text-sm leading-snug">
                              <span className="font-medium text-renovision-navy">{idx + 1}. </span>
                              {row.text}
                            </span>
                            {impact ? (
                              <span className="shrink-0 text-xs font-medium tabular-nums text-amber-900 dark:text-amber-400">
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
                <div className="space-y-2">
                  <Label htmlFor="try-custom-tweak" className="text-sm font-semibold text-foreground">
                    Custom directions (optional)
                  </Label>
                  <Textarea
                    id="try-custom-tweak"
                    name="custom_tweak"
                    rows={3}
                    maxLength={1200}
                    disabled={regenPending}
                    placeholder="Example: warmer wall paint only, satin nickel hardware everywhere, slightly larger format floor tile look — no layout changes."
                    className="min-h-[5.5rem] resize-y text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Same guardrails as the checkboxes: finishes and styling on what is already in the scene. Layout,
                    fixture positions, and room shape stay fixed; the model is instructed to ignore incompatible asks.
                    Custom text is not auto-priced per line.
                  </p>
                </div>
                <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="submit" disabled={regenPending}>
                    {regenPending ? "Updating preview…" : "Update preview"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Pick suggestions and/or custom text (at least one), then submit.
                  </p>
                </div>
              </form>
              {regenState && "error" in regenState ? (
                <p className="mt-3 text-sm text-destructive">{regenState.error}</p>
              ) : null}
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
