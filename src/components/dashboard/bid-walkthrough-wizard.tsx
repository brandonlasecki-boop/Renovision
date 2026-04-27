"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  generateBidProjectQuestionsAction,
  saveBidWalkthrough,
  saveBidWalkthroughCapture,
} from "@/lib/actions/bids";
import type {
  Bid,
  BidPhotoWithUrl,
  ProjectQuestionDraft,
  ProjectQuestionnaireItem,
  ProjectQuestionOption,
  RoomMeasurementRow,
} from "@/types/bid";
import {
  ANYTHING_ELSE_QUESTION_ID,
  JOB_SITE_ZIP_QUESTION_ID,
  VANITY_CABINET_SUPPLY_QUESTION_ID,
} from "@/lib/ai/bid-questions";
import { applyRoomMeasurementPatch, ROOM_MEASUREMENTS_AI_DISCLAIMER } from "@/lib/bid-scope";
import { MCQ_OTHER_OPTION_ID, optionsWithOther } from "@/lib/questionnaire-mcq";
import { cn } from "@/lib/utils";
import { BidBeforeUpload } from "@/components/dashboard/bid-before-upload";
import { BidPhotoGrid } from "@/components/dashboard/bid-photo-grid";
import { EstimateRoomsFromPhotosButton } from "@/components/dashboard/estimate-rooms-from-photos-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Mic, MicOff, Plus, Trash2 } from "lucide-react";

const PROJECT_KINDS = [
  { value: "", label: "Optional — project type" },
  { value: "bathroom", label: "Bathroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "basement", label: "Basement / finish-out" },
  { value: "whole_home", label: "Whole home / multiple rooms" },
  { value: "exterior", label: "Exterior / siding / deck" },
  { value: "other", label: "Other" },
] as const;

function newRoom(): RoomMeasurementRow {
  return {
    id: crypto.randomUUID(),
    label: "",
    length_ft: 0,
    width_ft: 0,
    ceiling_ft: 8,
  };
}

function draftsFromQuestionnaire(pq: ProjectQuestionnaireItem[] | undefined): ProjectQuestionDraft[] {
  return (pq ?? [])
    .filter(
      (q) =>
        (q.options && q.options.length > 0) ||
        q.question_id === JOB_SITE_ZIP_QUESTION_ID ||
        q.question_id === VANITY_CABINET_SUPPLY_QUESTION_ID,
    )
    .map((q) => ({
      question_id: q.question_id,
      question: q.question,
      options: q.options ?? [],
      ...(q.question_id === JOB_SITE_ZIP_QUESTION_ID ? { ui_variant: "zip_input" as const } : {}),
    }));
}

function initialAnswersFromQuestionnaire(pq: ProjectQuestionnaireItem[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const q of pq ?? []) {
    if (q.question_id === JOB_SITE_ZIP_QUESTION_ID && q.selected_option_id) {
      m[q.question_id] = q.selected_option_id;
      continue;
    }
    if (q.selected_option_id) {
      m[q.question_id] = q.selected_option_id;
      continue;
    }
    if (q.options && q.answer) {
      const hit = q.options.find((o) => o.label === q.answer);
      if (hit) m[q.question_id] = hit.option_id;
    }
  }
  return m;
}

function initialOtherTextFromQuestionnaire(pq: ProjectQuestionnaireItem[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const q of pq ?? []) {
    if (q.question_id === JOB_SITE_ZIP_QUESTION_ID) {
      const z = (q.other_text ?? q.answer ?? "").replace(/\D/g, "").slice(0, 5);
      if (z) m[q.question_id] = z;
      continue;
    }
    if (q.selected_option_id === MCQ_OTHER_OPTION_ID) {
      m[q.question_id] = q.other_text?.trim() || q.answer || "";
    }
  }
  return m;
}

function zipQuestionnaireRow(
  q: ProjectQuestionDraft,
  bid: Bid,
  answers: Record<string, string>,
  otherText: Record<string, string>,
): ProjectQuestionnaireItem {
  const zipOpts: ProjectQuestionOption[] = [
    { option_id: "zip_use_estimate", label: "Use ZIP on estimate" },
    { option_id: "zip_manual", label: "Entered ZIP" },
  ];
  const sid = (answers[q.question_id] ?? "").trim();
  const digits = (otherText[q.question_id] ?? "").replace(/\D/g, "").slice(0, 5);
  if (sid === "zip_use_estimate") {
    const z = (bid.site_postal_code ?? "").replace(/\D/g, "").slice(0, 5);
    return {
      question_id: q.question_id,
      question: q.question,
      options: zipOpts,
      selected_option_id: "zip_use_estimate",
      answer: z.length === 5 ? z : "",
    };
  }
  return {
    question_id: q.question_id,
    question: q.question,
    options: zipOpts,
    selected_option_id: "zip_manual",
    answer: digits,
    ...(digits.length === 5 ? { other_text: digits } : {}),
  };
}

function walkthroughQuestionComplete(
  q: ProjectQuestionDraft,
  answers: Record<string, string>,
  otherText: Record<string, string>,
  bid: Bid,
): boolean {
  if (q.question_id === JOB_SITE_ZIP_QUESTION_ID) {
    const s = (answers[q.question_id] ?? "").trim();
    if (s === "zip_use_estimate") {
      return (bid.site_postal_code ?? "").replace(/\D/g, "").length >= 5;
    }
    const z = (otherText[q.question_id] ?? "").replace(/\D/g, "");
    return z.length === 5;
  }
  const sel = (answers[q.question_id] ?? "").trim();
  if (!sel) return false;
  if (sel === MCQ_OTHER_OPTION_ID) {
    return (otherText[q.question_id] ?? "").trim().length > 0;
  }
  return true;
}

export function BidWalkthroughWizard({
  bid,
  beforePhotos,
}: {
  bid: Bid;
  beforePhotos: BidPhotoWithUrl[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [scopeDescription, setScopeDescription] = useState(bid.scope_description || "");
  const [projectKind, setProjectKind] = useState(bid.project_kind || "");
  const [rooms, setRooms] = useState<RoomMeasurementRow[]>(
    bid.room_measurements?.length ? bid.room_measurements : [newRoom()],
  );
  const [transcript, setTranscript] = useState(bid.walkthrough_transcript || "");
  const [questions, setQuestions] = useState<ProjectQuestionDraft[]>(() =>
    draftsFromQuestionnaire(bid.project_questionnaire),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    initialAnswersFromQuestionnaire(bid.project_questionnaire),
  );
  const [otherText, setOtherText] = useState<Record<string, string>>(() =>
    initialOtherTextFromQuestionnaire(bid.project_questionnaire),
  );
  const [qError, setQError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [pending, startTransition] = useTransition();
  const [capturePending, startCapture] = useTransition();
  const [saveState, saveAction, savePending] = useActionState(saveBidWalkthrough, undefined);

  useEffect(() => {
    setScopeDescription(bid.scope_description || "");
    setProjectKind(bid.project_kind || "");
  }, [bid.scope_description, bid.project_kind]);

  const roomsFromServerRef = useRef("");
  useEffect(() => {
    const s = JSON.stringify(bid.room_measurements ?? []);
    if (s === roomsFromServerRef.current) return;
    roomsFromServerRef.current = s;
    setRooms(bid.room_measurements?.length ? bid.room_measurements.map((x) => ({ ...x })) : [newRoom()]);
  }, [bid.room_measurements]);

  function updateRoom(i: number, patch: Partial<RoomMeasurementRow>) {
    setRooms((prev) => {
      const next = [...prev];
      next[i] = applyRoomMeasurementPatch(next[i], patch);
      return next;
    });
  }

  const startDictation = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: ((ev: {
          resultIndex: number;
          results: { length: number; [i: number]: { 0: { transcript: string } } };
        }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        onresult: ((ev: {
          resultIndex: number;
          results: { length: number; [i: number]: { 0: { transcript: string } } };
        }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let chunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        chunk += ev.results[i][0]?.transcript ?? "";
      }
      if (chunk.trim()) {
        setTranscript((t) => (t ? `${t} ${chunk.trim()}` : chunk.trim()));
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
    (window as unknown as { __bidRec?: { stop: () => void } }).__bidRec = rec;
  }, []);

  const stopDictation = useCallback(() => {
    const rec = (window as unknown as { __bidRec?: { stop: () => void } }).__bidRec;
    if (rec) {
      rec.stop();
      (window as unknown as { __bidRec?: { stop: () => void } }).__bidRec = undefined;
    }
    setListening(false);
  }, []);

  function buildCaptureFormData(): FormData {
    const fd = new FormData();
    fd.set("bid_id", bid.id);
    fd.set("scope_description", scopeDescription);
    fd.set("project_kind", projectKind);
    fd.set("walkthrough_transcript", transcript);
    fd.set(
      "room_measurements_json",
      JSON.stringify(
        rooms.filter(
          (r) => r.label.trim() || r.length_ft || r.width_ft || r.needs_user_measurements === true,
        ),
      ),
    );
    return fd;
  }

  function continueFromCapture() {
    setCaptureError(null);
    if (beforePhotos.length === 0) {
      setCaptureError("Add at least one site photo before continuing.");
      return;
    }
    startCapture(async () => {
      const res = await saveBidWalkthroughCapture(undefined, buildCaptureFormData());
      if ("error" in res) {
        setCaptureError(res.error);
        return;
      }
      router.refresh();
      setStep(1);
    });
  }

  function loadQuestions() {
    setQError(null);
    if (beforePhotos.length === 0) {
      setQError("Add at least one site photo first—questions use your pictures.");
      return;
    }
    startTransition(async () => {
      const cap = await saveBidWalkthroughCapture(undefined, buildCaptureFormData());
      if ("error" in cap) {
        setQError(cap.error);
        return;
      }
      router.refresh();
      const res = await generateBidProjectQuestionsAction(bid.id);
      if ("error" in res) {
        setQError(res.error);
        return;
      }
      setQuestions(res.questions);
      setAnswers((prev) => {
        const next: Record<string, string> = {};
        for (const q of res.questions) {
          next[q.question_id] = prev[q.question_id] ?? "";
        }
        return next;
      });
      if (res.questions.length > 0) {
        setOtherText((prev) => {
          const next = { ...prev };
          for (const q of res.questions) {
            if (next[q.question_id] === undefined) next[q.question_id] = "";
          }
          return next;
        });
        setStep(2);
      }
    });
  }

  function buildQuestionnairePayload(): ProjectQuestionnaireItem[] {
    if (questions.length === 0) {
      return bid.project_questionnaire ?? [];
    }
    return questions.map((q) => {
      if (q.question_id === JOB_SITE_ZIP_QUESTION_ID || q.ui_variant === "zip_input") {
        return zipQuestionnaireRow(q, bid, answers, otherText);
      }
      const selectedId = answers[q.question_id]?.trim() ?? "";
      const opt = q.options.find((o) => o.option_id === selectedId);
      const detail = otherText[q.question_id]?.trim() ?? "";
      const isOther = selectedId === MCQ_OTHER_OPTION_ID;
      return {
        question_id: q.question_id,
        question: q.question,
        options: q.options,
        selected_option_id: selectedId || null,
        answer: isOther ? detail : opt?.label ?? "",
        ...(isOther ? { other_text: detail || null } : {}),
      };
    });
  }

  const answeredCount = questions.filter((q) =>
    walkthroughQuestionComplete(q, answers, otherText, bid),
  ).length;

  const steps = ["Job site", "Voice & AI", "Additional info", "Save"];

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/dashboard/bids/${bid.id}`}
          className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to overview
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
              step === i
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <section className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold">Describe &amp; document the job</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add what you want done and at least one clear photo—AI uses both with your measurements to build
              multiple-choice questions so scope and pricing match what you have in mind.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope">Describe the project</Label>
            <Textarea
              id="scope"
              value={scopeDescription}
              onChange={(e) => setScopeDescription(e.target.value)}
              rows={6}
              placeholder="What are you estimating? Scope, goals, known constraints, priorities…"
              className="min-h-[140px] text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pk">Project type</Label>
            <select
              id="pk"
              value={projectKind}
              onChange={(e) => setProjectKind(e.target.value)}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              {PROJECT_KINDS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Room scan &amp; measurements</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rough dimensions (feet). We prefill from your before photos when you have not entered
                  measurements yet; use the button to re-run after adding photos.
                </p>
                <p className="text-xs text-amber-950/90 dark:text-amber-100/85">
                  {ROOM_MEASUREMENTS_AI_DISCLAIMER}
                </p>
              </div>
              <EstimateRoomsFromPhotosButton
                bidId={bid.id}
                disabled={beforePhotos.length === 0}
                className="shrink-0"
                onRoomsApplied={(next) => {
                  roomsFromServerRef.current = JSON.stringify(next);
                  setRooms(next.map((r) => ({ ...r })));
                }}
              />
            </div>
            <div className="mt-4 space-y-4">
              {rooms.map((r, i) => (
                <div key={r.id} className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      {r.label.trim() ? r.label : `Measurement ${i + 1}`}
                    </Label>
                    {rooms.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive"
                        onClick={() => setRooms((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    placeholder="Label (e.g. Main bath)"
                    value={r.label}
                    onChange={(e) => updateRoom(i, { label: e.target.value })}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Length (ft)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={r.length_ft || ""}
                        onChange={(e) =>
                          updateRoom(i, { length_ft: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Width (ft)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={r.width_ft || ""}
                        onChange={(e) =>
                          updateRoom(i, { width_ft: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Ceiling (ft)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={r.ceiling_ft ?? ""}
                        onChange={(e) =>
                          updateRoom(i, {
                            ceiling_ft:
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value) || undefined,
                          })
                        }
                      />
                    </div>
                  </div>
                  {r.needs_user_measurements ? (
                    <p className="text-[11px] font-medium text-amber-900 dark:text-amber-100/90">
                      Add length and width above when you have measurements (not estimated from photos).
                    </p>
                  ) : null}
                  {r.notes?.trim() ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">{r.notes.trim()}</p>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRooms((p) => [...p, newRoom()])}
              >
                <Plus className="mr-1 size-4" />
                Add room
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Site photos</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Required: at least one photo of the room. These feed questions, scope lines, pricing, and mockups.
            </p>
            <div className="mt-4 space-y-6">
              <BidBeforeUpload bidId={bid.id} onUploaded={() => router.refresh()} />
              <BidPhotoGrid
                bidId={bid.id}
                photos={beforePhotos}
                allowDeleteKinds={["before"]}
                downloadableKinds={["before"]}
              />
            </div>
          </div>

          {captureError ? <p className="text-sm text-destructive">{captureError}</p> : null}

          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={capturePending || beforePhotos.length === 0}
            onClick={continueFromCapture}
          >
            {capturePending ? "Saving…" : "Continue"}
          </Button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Voice &amp; extra notes</h2>
          <p className="text-sm text-muted-foreground">
            Add on-site narration (Chrome / Edge). Then load AI additional info—scope, measurements, voice notes,
            and up to 6 site photos are analyzed together.
          </p>
          <div className="flex flex-wrap gap-2">
            {listening ? (
              <Button type="button" variant="secondary" onClick={stopDictation}>
                <MicOff className="mr-2 size-4" />
                Stop dictation
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={startDictation}>
                <Mic className="mr-2 size-4" />
                Start dictation
              </Button>
            )}
          </div>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={10}
            placeholder="Additional walkthrough notes…"
            className="min-h-[200px] text-base"
          />
          {qError ? <p className="text-sm text-destructive">{qError}</p> : null}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={loadQuestions}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Generating…
              </>
            ) : (
              "Load AI additional info"
            )}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep(3)}>
              Skip to save
            </Button>
            <Button
              type="button"
              onClick={() => setStep(questions.length > 0 ? 2 : 1)}
              disabled={questions.length === 0}
            >
              Next: additional info
            </Button>
          </div>
          {questions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Load additional info above, or skip to save with describe + measurements + photos only.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {questions.length} prompt{questions.length === 1 ? "" : "s"} ready.
            </p>
          )}
        </section>
      ) : null}

      {step === 2 && questions.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Project-specific details</h2>
            <p className="text-xs text-muted-foreground">
              {answeredCount}/{questions.length} answered
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Tap one option per item. This tightens the estimate (trades, permits, rough-in).
          </p>
          <div className="space-y-6">
            {questions.map((q, qi) => (
              <fieldset key={q.question_id} className="space-y-2 rounded-xl border border-border/80 bg-muted/15 p-3 sm:p-4">
                <legend className="mb-1 w-full px-0.5 text-left text-sm font-medium leading-snug text-foreground">
                  <span className="text-muted-foreground">{qi + 1}. </span>
                  {q.question}
                </legend>
                <div className="flex flex-col gap-2">
                  {q.ui_variant === "zip_input" || q.question_id === JOB_SITE_ZIP_QUESTION_ID ? (
                    <div className="space-y-3 rounded-lg border border-border bg-card px-3 py-3">
                      <Label htmlFor={`walk-zip-${q.question_id}`} className="text-sm font-medium">
                        ZIP code (5 digits)
                      </Label>
                      <Input
                        id={`walk-zip-${q.question_id}`}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={5}
                        placeholder="e.g. 90210"
                        className="text-base font-medium tracking-widest"
                        value={otherText[q.question_id] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                          setOtherText((prev) => ({ ...prev, [q.question_id]: v }));
                          setAnswers((prev) => ({
                            ...prev,
                            [q.question_id]: v.length === 5 ? "zip_manual" : "",
                          }));
                        }}
                      />
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {(bid.site_postal_code ?? "").replace(/\D/g, "").length >= 5 ? (
                          <Button
                            type="button"
                            variant={
                              (answers[q.question_id] ?? "") === "zip_use_estimate"
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            className="justify-start text-left"
                            disabled={pending}
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [q.question_id]: "zip_use_estimate" }))
                            }
                          >
                            Use ZIP on this estimate (
                            {(bid.site_postal_code ?? "").replace(/\D/g, "").slice(0, 5)})
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Used for local Home Depot / Lowe&apos;s shelf pricing.
                      </p>
                    </div>
                  ) : (
                    (q.question_id === ANYTHING_ELSE_QUESTION_ID
                      ? optionsWithOther(
                          q.options,
                          "Yes — I have more to add (describe below)",
                        )
                      : optionsWithOther(q.options)
                    ).map((opt) => {
                      const selected = (answers[q.question_id] ?? "") === opt.option_id;
                      return (
                        <label
                          key={opt.option_id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-transparent bg-background hover:bg-muted/50",
                          )}
                        >
                          <input
                            type="radio"
                            name={q.question_id}
                            className="mt-0.5 size-4 shrink-0 accent-primary"
                            checked={selected}
                            onChange={() =>
                              setAnswers((prev) => ({ ...prev, [q.question_id]: opt.option_id }))
                            }
                          />
                          <span className="leading-snug">{opt.label}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                {q.question_id !== JOB_SITE_ZIP_QUESTION_ID &&
                (answers[q.question_id] ?? "") === MCQ_OTHER_OPTION_ID ? (
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Your answer</Label>
                    <Textarea
                      value={otherText[q.question_id] ?? ""}
                      onChange={(e) =>
                        setOtherText((prev) => ({ ...prev, [q.question_id]: e.target.value }))
                      }
                      rows={3}
                      placeholder="Describe…"
                      className="text-sm"
                    />
                  </div>
                ) : null}
              </fieldset>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={loadQuestions}>
              Regenerate
            </Button>
            <Button type="button" onClick={() => setStep(3)}>
              Review &amp; save
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Save walkthrough</h2>
          <p className="text-sm text-muted-foreground">
            On the estimate overview, run the AI estimator when you&apos;re ready—everything here is merged into
            scope for estimating.
          </p>
          <form action={saveAction} className="space-y-4">
            <input type="hidden" name="bid_id" value={bid.id} />
            <input type="hidden" name="scope_description" value={scopeDescription} />
            <input type="hidden" name="project_kind" value={projectKind} />
            <input type="hidden" name="walkthrough_transcript" value={transcript} />
            <input
              type="hidden"
              name="room_measurements_json"
              value={JSON.stringify(
                rooms.filter(
                  (r) =>
                    r.label.trim() || r.length_ft || r.width_ft || r.needs_user_measurements === true,
                ),
              )}
            />
            <input
              type="hidden"
              name="project_questionnaire_json"
              value={JSON.stringify(buildQuestionnairePayload())}
            />
            {saveState && "error" in saveState && saveState.error ? (
              <p className="text-sm text-destructive">{saveState.error}</p>
            ) : null}
            {saveState && "success" in saveState && saveState.success ? (
              <p className="text-sm text-muted-foreground">Saved.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(questions.length ? 2 : 1)}>
                Back
              </Button>
              <Button type="submit" disabled={savePending}>
                {savePending ? "Saving…" : "Save walkthrough"}
              </Button>
            </div>
          </form>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => router.push(`/dashboard/bids/${bid.id}`)}
          >
            Go to overview — run AI
          </Button>
        </section>
      ) : null}
    </div>
  );
}
