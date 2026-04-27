"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  generateBidProjectQuestionsAction,
  saveBidQuestionnaireOnly,
} from "@/lib/actions/bids";
import {
  ANYTHING_ELSE_QUESTION_ID,
  JOB_SITE_ZIP_QUESTION_ID,
  VANITY_CABINET_SUPPLY_QUESTION_ID,
} from "@/lib/ai/bid-questions";
import type { Bid, ProjectQuestionDraft, ProjectQuestionnaireItem } from "@/types/bid";
import { MCQ_OTHER_OPTION_ID, optionsWithOther } from "@/lib/questionnaire-mcq";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";
import { QuestionsBootLoading } from "@/components/dashboard/questions-boot-loading";

/** Saved rows before `allow_multiple` existed may still be mirror-style multi questions. */
function inferAllowMultipleFromSaved(q: ProjectQuestionnaireItem): boolean {
  if (q.allow_multiple) return true;
  const t = `${q.question}`.toLowerCase();
  return t.includes("mirror") && /\bfeatures?\b/.test(t);
}

function draftsFromSaved(pq: ProjectQuestionnaireItem[] | undefined): ProjectQuestionDraft[] {
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
      ...(inferAllowMultipleFromSaved(q) ? { allow_multiple: true } : {}),
    }));
}

function initialAnswers(pq: ProjectQuestionnaireItem[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const q of pq ?? []) {
    if (inferAllowMultipleFromSaved(q)) continue;
    if (q.question_id === JOB_SITE_ZIP_QUESTION_ID && q.selected_option_id) {
      m[q.question_id] = q.selected_option_id;
      continue;
    }
    if (q.selected_option_id) {
      m[q.question_id] = q.selected_option_id;
    } else if (q.options && q.answer) {
      const hit = q.options.find((o) => o.label === q.answer);
      if (hit) m[q.question_id] = hit.option_id;
    }
  }
  return m;
}

function initialAnswersMulti(pq: ProjectQuestionnaireItem[] | undefined): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const q of pq ?? []) {
    if (!inferAllowMultipleFromSaved(q)) continue;
    if (q.selected_option_ids && q.selected_option_ids.length > 0) {
      m[q.question_id] = [...q.selected_option_ids];
    } else if (q.selected_option_id) {
      m[q.question_id] = [q.selected_option_id];
    }
  }
  return m;
}

function initialOtherText(pq: ProjectQuestionnaireItem[] | undefined): Record<string, string> {
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
    if (
      inferAllowMultipleFromSaved(q) &&
      q.selected_option_ids?.includes(MCQ_OTHER_OPTION_ID)
    ) {
      m[q.question_id] = q.other_text?.trim() || "";
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
  const zipOpts: import("@/types/bid").ProjectQuestionOption[] = [
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

function buildPayload(
  bid: Bid,
  questions: ProjectQuestionDraft[],
  answers: Record<string, string>,
  answersMulti: Record<string, string[]>,
  otherText: Record<string, string>,
): ProjectQuestionnaireItem[] {
  return questions.map((q) => {
    if (q.question_id === JOB_SITE_ZIP_QUESTION_ID || q.ui_variant === "zip_input") {
      return zipQuestionnaireRow(q, bid, answers, otherText);
    }
    const detail = otherText[q.question_id]?.trim() ?? "";
    if (q.allow_multiple) {
      const ids = answersMulti[q.question_id] ?? [];
      const hasOther = ids.includes(MCQ_OTHER_OPTION_ID);
      const parts: string[] = [];
      for (const oid of ids) {
        if (oid === MCQ_OTHER_OPTION_ID) {
          if (detail) parts.push(detail);
        } else {
          const lab = q.options.find((o) => o.option_id === oid)?.label;
          if (lab) parts.push(lab);
        }
      }
      return {
        question_id: q.question_id,
        question: q.question,
        options: q.options,
        allow_multiple: true,
        selected_option_ids: ids.length > 0 ? ids : null,
        selected_option_id: null,
        answer: parts.join("; "),
        ...(hasOther ? { other_text: detail || "" } : {}),
      };
    }
    const selectedId = answers[q.question_id]?.trim() ?? "";
    const opt = q.options.find((o) => o.option_id === selectedId);
    const isOther = selectedId === MCQ_OTHER_OPTION_ID;
    return {
      question_id: q.question_id,
      question: q.question,
      options: q.options,
      selected_option_id: selectedId || null,
      answer: isOther ? detail : opt?.label ?? "",
      ...(isOther && detail ? { other_text: detail } : isOther ? { other_text: "" } : {}),
    };
  });
}

function isSelectionComplete(
  questionId: string,
  allowMultiple: boolean,
  selected: string,
  selectedMulti: string[],
  otherText: Record<string, string>,
  bid: Bid,
): boolean {
  if (questionId === JOB_SITE_ZIP_QUESTION_ID) {
    const s = selected.trim();
    if (s === "zip_use_estimate") {
      return (bid.site_postal_code ?? "").replace(/\D/g, "").length >= 5;
    }
    const z = (otherText[questionId] ?? "").replace(/\D/g, "");
    return z.length === 5;
  }
  if (allowMultiple) {
    if (selectedMulti.length === 0) return false;
    if (selectedMulti.includes(MCQ_OTHER_OPTION_ID)) {
      return (otherText[questionId] ?? "").trim().length > 0;
    }
    return true;
  }
  if (!selected) return false;
  if (selected === MCQ_OTHER_OPTION_ID) {
    return (otherText[questionId] ?? "").trim().length > 0;
  }
  return true;
}

export function BidQuestionsQuiz({ bid }: { bid: Bid }) {
  const router = useRouter();
  const savedDrafts = draftsFromSaved(bid.project_questionnaire);
  const [questions, setQuestions] = useState<ProjectQuestionDraft[]>(() => savedDrafts);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    initialAnswers(bid.project_questionnaire),
  );
  const [answersMulti, setAnswersMulti] = useState<Record<string, string[]>>(() =>
    initialAnswersMulti(bid.project_questionnaire),
  );
  const [otherText, setOtherText] = useState<Record<string, string>>(() =>
    initialOtherText(bid.project_questionnaire),
  );
  const [index, setIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [bootPending, setBootPending] = useState(() => savedDrafts.length === 0);
  const fetchOnce = useRef(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    const saved = draftsFromSaved(bid.project_questionnaire);
    if (saved.length > 0) {
      setQuestions(saved);
      setAnswers(initialAnswers(bid.project_questionnaire));
      setAnswersMulti(initialAnswersMulti(bid.project_questionnaire));
      setOtherText(initialOtherText(bid.project_questionnaire));
      setBootPending(false);
      return;
    }
    if (fetchOnce.current) return;
    fetchOnce.current = true;
    setLoadError(null);
    startTransition(async () => {
      const res = await generateBidProjectQuestionsAction(bid.id);
      if ("error" in res) {
        setLoadError(res.error);
        setBootPending(false);
        fetchOnce.current = false;
        return;
      }
      setQuestions(res.questions);
      setAnswers((prev) => {
        const next: Record<string, string> = {};
        for (const q of res.questions) {
          if (q.allow_multiple) continue;
          next[q.question_id] = prev[q.question_id] ?? "";
        }
        return next;
      });
      setAnswersMulti((prev) => {
        const next: Record<string, string[]> = { ...prev };
        for (const q of res.questions) {
          if (!q.allow_multiple) continue;
          next[q.question_id] = next[q.question_id] ?? [];
        }
        return next;
      });
      setBootPending(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- questionnaire comes from server on navigation
  }, [bid.id]);

  const total = questions.length;
  const q = total > 0 ? questions[Math.min(index, total - 1)] : null;
  const progress = total > 0 ? Math.round(((index + 1) / total) * 100) : 0;

  const finish = useCallback(
    (answersOverride?: Record<string, string>) => {
      const payloadAnswers = answersOverride ?? answers;
      if (finishingRef.current) return;
      finishingRef.current = true;
      startTransition(async () => {
        const res = await saveBidQuestionnaireOnly(
          bid.id,
          buildPayload(bid, questions, payloadAnswers, answersMulti, otherText),
        );
        finishingRef.current = false;
        if ("error" in res) {
          setLoadError(res.error);
          return;
        }
        router.push(`/dashboard/bids/${bid.id}/setup/breakdown`);
        router.refresh();
      });
    },
    [bid.id, questions, answers, answersMulti, otherText, router],
  );

  const advanceOrFinish = useCallback(
    (nextAnswers: Record<string, string>) => {
      const atLast = index >= total - 1;
      if (!atLast) {
        setIndex((i) => i + 1);
        return;
      }
      finish(nextAnswers);
    },
    [index, total, finish],
  );

  if (bootPending) {
    return <QuestionsBootLoading />;
  }

  if (loadError && questions.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => router.refresh()}>
          Try again
        </Button>
        <Link
          href={`/dashboard/bids/${bid.id}/setup`}
          className={cn(buttonVariants({ variant: "ghost" }), "inline-flex justify-center")}
        >
          Back
        </Link>
      </div>
    );
  }

  if (!q) {
    return <p className="text-sm text-muted-foreground">No additional info yet.</p>;
  }

  const selected = (answers[q.question_id] ?? "").trim();
  const selectedMulti = answersMulti[q.question_id] ?? [];
  const atEnd = index >= total - 1;
  const opts =
    q.question_id === ANYTHING_ELSE_QUESTION_ID
      ? optionsWithOther(q.options, "Yes — I have more to add (describe below)")
      : optionsWithOther(q.options);
  const selectionComplete = isSelectionComplete(
    q.question_id,
    !!q.allow_multiple,
    selected,
    selectedMulti,
    otherText,
    bid,
  );

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col pb-24">
      <div className="sticky top-0 z-20 -mx-4 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-t-lg">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wide text-foreground/80">Additional info</span>
          <span>
            {index + 1} / {total}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-1 flex-col">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Question {index + 1}
        </p>
        <h2 className="mt-2 text-lg font-semibold leading-snug sm:text-xl">{q.question}</h2>

        <div className="mt-6 flex flex-col gap-2">
          {q.ui_variant === "zip_input" || q.question_id === JOB_SITE_ZIP_QUESTION_ID ? (
            <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
              <Label htmlFor={`zip-${q.question_id}`} className="text-sm font-medium">
                ZIP code (5 digits)
              </Label>
              <Input
                id={`zip-${q.question_id}`}
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                placeholder="e.g. 90210"
                className="text-lg font-medium tracking-widest"
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
                    variant={selected === "zip_use_estimate" ? "default" : "outline"}
                    className="justify-start text-left"
                    disabled={pending}
                    onClick={() => {
                      setAnswers((prev) => ({ ...prev, [q.question_id]: "zip_use_estimate" }));
                    }}
                  >
                    Use ZIP on this estimate (
                    {(bid.site_postal_code ?? "").replace(/\D/g, "").slice(0, 5)}
                    )
                  </Button>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Used for local Home Depot / Lowe&apos;s shelf pricing. You can change it anytime on the
                estimate.
              </p>
            </div>
          ) : q.allow_multiple
            ? opts.map((opt) => {
                const isSel = selectedMulti.includes(opt.option_id);
                return (
                  <label
                    key={opt.option_id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-left text-sm leading-snug transition",
                      isSel
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-[18px] shrink-0 rounded border-input"
                      checked={isSel}
                      disabled={pending}
                      onChange={() => {
                        setAnswersMulti((prev) => {
                          const cur = new Set(prev[q.question_id] ?? []);
                          if (cur.has(opt.option_id)) cur.delete(opt.option_id);
                          else cur.add(opt.option_id);
                          return { ...prev, [q.question_id]: [...cur] };
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1">{opt.label}</span>
                  </label>
                );
              })
            : opts.map((opt) => {
                const isSel = selected === opt.option_id;
                return (
                  <button
                    key={opt.option_id}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const nextAnswers = { ...answers, [q.question_id]: opt.option_id };
                      setAnswers(nextAnswers);
                      if (opt.option_id === MCQ_OTHER_OPTION_ID) return;
                      if (
                        !isSelectionComplete(
                          q.question_id,
                          false,
                          opt.option_id,
                          [],
                          otherText,
                          bid,
                        )
                      )
                        return;
                      advanceOrFinish(nextAnswers);
                    }}
                    className={cn(
                      "rounded-xl border px-4 py-3.5 text-left text-sm leading-snug transition",
                      isSel
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
        </div>
        {q.question_id !== JOB_SITE_ZIP_QUESTION_ID &&
        ((!q.allow_multiple && selected === MCQ_OTHER_OPTION_ID) ||
          (q.allow_multiple && selectedMulti.includes(MCQ_OTHER_OPTION_ID))) ? (
          <div className="mt-4 space-y-2">
            <label htmlFor={`other-${q.question_id}`} className="text-xs font-medium text-muted-foreground">
              Your answer
            </label>
            <Textarea
              id={`other-${q.question_id}`}
              value={otherText[q.question_id] ?? ""}
              onChange={(e) =>
                setOtherText((prev) => ({ ...prev, [q.question_id]: e.target.value }))
              }
              placeholder="Type details…"
              rows={4}
              className="min-h-[100px] text-base"
            />
          </div>
        ) : null}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 p-4 backdrop-blur sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={index === 0 || pending}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Button>
          {!atEnd ? (
            <Button
              type="button"
              className="flex-1"
              disabled={!selectionComplete || pending}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              className="flex-1"
              disabled={!selectionComplete || pending}
              onClick={() => finish()}
            >
              {pending ? "Saving…" : "Continue"}
            </Button>
          )}
        </div>
      </div>

      {loadError ? <p className="mt-4 text-sm text-destructive">{loadError}</p> : null}
    </div>
  );
}
