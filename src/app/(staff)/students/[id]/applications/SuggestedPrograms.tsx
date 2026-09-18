"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { addSuggestedApplication } from "@/lib/actions/suggestedApplications";
import { Button } from "@/components/ui/Button";

export type Suggested = {
  program_id: string;
  program_name: string;
  level: string;
  core_field: string | null;
  field_group_name: string;
  university_name: string;
  destination_name: string;
  is_backup: boolean;
  matched_specific: boolean;
};

/** How many to show before "show the rest". */
const VISIBLE = 8;

/**
 * Whether the panel is minimised, remembered across pages and visits.
 *
 * Not per student: somebody who has folded this away is telling us how they
 * want to work, not something about one student, and having it spring open
 * again on the next record would be ignoring that. Read in an effect rather
 * than during render — the server has no localStorage, and seeding state from
 * it directly makes the first client render disagree with the HTML.
 */
const MINIMISED_KEY = "hmark.suggestedPrograms.minimised";

/**
 * Programmes this student's course of interest points at, with a way to apply.
 *
 * The Applications tab is where staff decide what to apply for, and until now
 * that meant leaving it, picking a country, picking a university, then reading
 * down a list of every programme it offers — Germany has 421 — while holding
 * the student's interests in their head. The interests are recorded; the
 * catalogue is grouped by field; so the list can simply be filtered for them.
 *
 * Suggestions are not a decision. Each one says why it is here — the field it
 * matched, and whether that was a field the student named specifically or just
 * a broad area they ticked — so staff can disagree with it knowingly.
 */
export function SuggestedPrograms({
  studentId,
  revalidateTo,
  suggestions,
  interestSummary,
  hasInterests,
}: {
  studentId: string;
  revalidateTo: string;
  suggestions: Suggested[];
  /** What the student asked for, said back to the reader. */
  interestSummary: string;
  hasInterests: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(MINIMISED_KEY) === "1") setMinimised(true);
    } catch {
      // A browser with site data blocked still gets a working panel, just
      // without the preference being remembered.
    }
  }, []);

  function setMinimisedRemembered(value: boolean) {
    setMinimised(value);
    // Collapsing it also drops back to the short list, so restoring it does
    // not reopen onto twenty-five rows somebody expanded a week ago.
    if (value) setExpanded(false);
    try {
      window.localStorage.setItem(MINIMISED_KEY, value ? "1" : "0");
    } catch {}
  }

  // No course of interest recorded: say what to do about it rather than
  // rendering an empty box, and link to the one screen that fixes it.
  if (!hasInterests) {
    return (
      <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3">
        <p className="text-sm font-medium text-ink">No suggested programmes yet</p>
        <p className="mt-1 text-xs text-muted">
          Set this student&rsquo;s course of interest on the{" "}
          <Link href={`/students/${studentId}/profile`} className="font-medium text-primary hover:underline">
            Profile tab
          </Link>{" "}
          and matching programmes from their own countries will be suggested here.
        </p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3">
        <p className="text-sm font-medium text-ink">Nothing left to suggest</p>
        <p className="mt-1 text-xs text-muted">
          Every programme matching {interestSummary} at this student&rsquo;s universities is already applied for, or
          their countries have no programmes on file in those fields yet.
        </p>
      </div>
    );
  }

  const shown = expanded ? suggestions : suggestions.slice(0, VISIBLE);

  // Minimised: one line that still carries the count, so it says what is
  // behind it rather than becoming a blank bar nobody reopens.
  if (minimised) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-4 py-2">
        <p className="truncate text-xs text-muted">
          <span className="font-medium text-ink">Suggested programmes</span> · {suggestions.length} match
          {suggestions.length === 1 ? "" : "es"} for {interestSummary}
        </p>
        <button
          type="button"
          onClick={() => setMinimisedRemembered(false)}
          aria-expanded={false}
          aria-label="Maximise suggested programmes"
          title="Maximise"
          className="shrink-0 rounded border border-border px-2 py-0.5 text-xs font-medium text-primary hover:bg-bg"
        >
          Maximise
        </button>
      </div>
    );
  }

  function add(programId: string) {
    setError(null);
    setBusy(programId);
    startTransition(async () => {
      const result = await addSuggestedApplication(studentId, programId, revalidateTo);
      setBusy(null);
      if (result?.error) setError(result.error);
      // Marked locally as well as revalidated: the row stays visible with an
      // "Added" state for a moment, so it is obvious which one was clicked
      // rather than the row simply vanishing from under the cursor.
      else setAdded((prev) => new Set(prev).add(programId));
    });
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          Suggested programmes{" "}
          <span className="text-xs font-normal text-muted">
            · {suggestions.length} match{suggestions.length === 1 ? "" : "es"} for {interestSummary}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <Link
            href={`/students/${studentId}/applications/new`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Search all programmes →
          </Link>
          <button
            type="button"
            onClick={() => setMinimisedRemembered(true)}
            aria-expanded={true}
            aria-label="Minimise suggested programmes"
            title="Minimise"
            className="rounded border border-border px-2 py-0.5 text-xs font-medium text-muted hover:text-ink"
          >
            Minimise
          </button>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border">
        {shown.map((s) => {
          const isAdded = added.has(s.program_id);
          return (
            <div key={s.program_id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">
                  {s.university_name} <span className="text-muted">·</span> {s.program_name}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {s.level} · {s.destination_name}
                  {s.is_backup && <span className="text-muted"> (backup)</span>}
                  {" · "}
                  {/* Why this is being suggested. A specific match is a
                      stronger reason than a broad one and is labelled as such. */}
                  {s.matched_specific ? (
                    <span className="font-medium text-primary">exactly the field they asked for</span>
                  ) : (
                    <>in {s.field_group_name}</>
                  )}
                  {s.core_field && <span className="text-muted"> — {s.core_field}</span>}
                </p>
              </div>
              {isAdded ? (
                <span className="shrink-0 text-xs font-medium text-success">Added</span>
              ) : (
                <Button
                  type="button"
                  variant="outline-primary"
                  size="sm"
                  onClick={() => add(s.program_id)}
                  pending={pending && busy === s.program_id}
                  disabled={pending}
                >
                  + Add
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {suggestions.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show fewer" : `Show all ${suggestions.length}`}
        </button>
      )}
    </div>
  );
}
