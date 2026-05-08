"use client";

import { useActionState, useMemo, useState } from "react";

type ContractorOption = {
  id: string;
  name: string;
  active: boolean;
  serviceZipCodes: string[];
};

type ShareState =
  | { ok: false; message: string }
  | { ok: true; message: string; summary: string; contractorName: string; sharedAtIso: string }
  | null;

export function ShareWithContractorModal({
  leadId,
  leadZip,
  summaryText,
  contractors,
  action,
}: {
  leadId: string;
  leadZip: string;
  summaryText: string;
  contractors: ContractorOption[];
  action: (state: ShareState, formData: FormData) => Promise<ShareState>;
}) {
  const activeContractors = useMemo(() => contractors.filter((c) => c.active), [contractors]);
  const leadZipNorm = leadZip.trim().toLowerCase();
  const matchingContractors = useMemo(
    () =>
      activeContractors.filter((c) =>
        c.serviceZipCodes.map((z) => z.toLowerCase()).includes(leadZipNorm),
      ),
    [activeContractors, leadZipNorm],
  );
  const nonMatchingContractors = useMemo(
    () =>
      activeContractors.filter(
        (c) => !c.serviceZipCodes.map((z) => z.toLowerCase()).includes(leadZipNorm),
      ),
    [activeContractors, leadZipNorm],
  );
  const sortedContractors = useMemo(
    () => [...matchingContractors, ...nonMatchingContractors],
    [matchingContractors, nonMatchingContractors],
  );
  const [open, setOpen] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState(sortedContractors[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);

  const selectedContractor = activeContractors.find((c) => c.id === selectedContractorId) ?? null;
  const zipInServiceArea =
    !leadZipNorm ||
    !selectedContractor ||
    selectedContractor.serviceZipCodes.map((z) => z.toLowerCase()).includes(leadZipNorm);

  const summaryToCopy = state && state.ok ? state.summary : summaryText;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setCopied(false);
        }}
        className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40"
      >
        Share with Contractor
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-background p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Share lead with contractor</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>

            <form action={formAction} className="mt-4 space-y-3">
              <input type="hidden" name="lead_id" value={leadId} />
              <input type="hidden" name="summary_text" value={summaryText} />
              <label className="block text-xs text-muted-foreground">
                Select active contractor
                <select
                  name="contractor_id"
                  value={selectedContractorId}
                  onChange={(e) => setSelectedContractorId(e.target.value)}
                  className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {matchingContractors.length ? (
                    <optgroup label="Matching ZIP">
                      {matchingContractors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {nonMatchingContractors.length ? (
                    <optgroup label="Non-matching ZIP (warning)">
                      {nonMatchingContractors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>

              <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Contractor service ZIP codes</p>
                <p className="mt-1">
                  {selectedContractor?.serviceZipCodes.length
                    ? selectedContractor.serviceZipCodes.join(", ")
                    : "No ZIP codes configured"}
                </p>
              </div>

              {!zipInServiceArea ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
                  Lead ZIP `{leadZip || "—"}` is not in this contractor's service area.
                </div>
              ) : null}

              <label className="block text-xs text-muted-foreground">
                Optional internal note
                <textarea
                  name="assignment_note"
                  rows={3}
                  placeholder="Anything this contractor should know before follow-up"
                  className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                />
              </label>

              {state && !state.ok ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                  {state.message}
                </div>
              ) : null}
              {state && state.ok ? (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-900 dark:text-emerald-100">
                  {state.message}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={pending || !selectedContractorId} className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40 disabled:opacity-50">
                  {pending ? "Sharing..." : "Share Lead"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(summaryToCopy);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/40"
                >
                  {copied ? "Copied" : "Copy share summary"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
