"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { addSuggestedApplication } from "@/lib/actions/suggestedApplications";
import { Button } from "@/components/ui/Button";
import {
  countSuggested,
  groupSuggestedProgrammes,
  type RegisteredCountry,
  type SuggestedProgramme,
} from "@/lib/suggestedGrouping";

export type Suggested = SuggestedProgramme;

/**
 * Whether the panel is minimised, remembered across pages and visits.
 *
 * Not per student: somebody who has folded this away is telling us how they
 * want to work, not something about one student. It lives in localStorage,
 * which the server cannot read, so it is exposed as an external store rather
 * than component state; useSyncExternalStore renders the server snapshot
 * (never minimised) for SSR and the first client render, so the HTML always
 * agrees, then re-renders with the stored value.
 */
const MINIMISED_KEY = "hmark.suggestedPrograms.minimised";
const minimisedListeners = new Set<() => void>();

function subscribeMinimised(onChange: () => void) {
  minimisedListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    minimisedListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readMinimised() {
  try {
    return window.localStorage.getItem(MINIMISED_KEY) === "1";
  } catch {
    return false;
  }
}
function readMinimisedOnServer() {
  return false;
}
function writeMinimised(value: boolean) {
  try {
    window.localStorage.setItem(MINIMISED_KEY, value ? "1" : "0");
  } catch {
    /* site data blocked: the panel still works, the preference just isn't kept */
  }
  minimisedListeners.forEach((l) => l());
}

/**
 * Programmes this student's course of interest points at, separated by country
 * and, inside each country, by university — with a way to apply to any of them.
 *
 * The Applications tab is where staff decide what to apply for. The interests
 * are recorded and the catalogue is grouped by field, so the list can be
 * filtered for them; here it is split the way staff actually work, one country
 * at a time, so a student going to Italy and Germany sees each country's
 * universities and their matching programmes on their own rather than one
 * interleaved list.
 *
 * Suggestions are not a decision: each says why it is here — the field it
 * matched, and whether that was one the student named specifically or a broad
 * area — so staff can disagree with it knowingly.
 */
export function SuggestedPrograms({
  studentId,
  revalidateTo,
  suggestions,
  registered,
  interestSummary,
  hasInterests,
}: {
  studentId: string;
  revalidateTo: string;
  suggestions: Suggested[];
  /** The student's countries, primary first then backups — for the section order and the empty notes. */
  registered: RegisteredCountry[];
  interestSummary: string;
  hasInterests: boolean;
}) {
  const minimised = useSyncExternalStore(subscribeMinimised, readMinimised, readMinimisedOnServer);
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => groupSuggestedProgrammes(suggestions, registered), [suggestions, registered]);
  const total = countSuggested(groups);

  // No course of interest recorded: say what to do about it rather than an empty box.
  if (!hasInterests) {
    return (
      <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3">
        <p className="text-sm font-medium text-ink">No suggested programmes yet</p>
        <p className="mt-1 text-xs text-muted">
          Set this student&rsquo;s course of interest on the{" "}
          <Link prefetch={false} href={`/students/${studentId}/profile`} className="font-medium text-primary hover:underline">
            Profile tab
          </Link>{" "}
          and matching programmes from each of their countries will be suggested here.
        </p>
      </div>
    );
  }

  function toggleCountry(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function add(programId: string) {
    setError(null);
    setBusy(programId);
    startTransition(async () => {
      const result = await addSuggestedApplication(studentId, programId, revalidateTo);
      setBusy(null);
      if (result?.error) setError(result.error);
      else setAdded((prev) => new Set(prev).add(programId));
    });
  }

  // Minimised: one line that still carries the count.
  if (minimised) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-4 py-2">
        <p className="truncate text-xs text-muted">
          <span className="font-medium text-ink">Suggested programmes</span> · {total} match{total === 1 ? "" : "es"} for{" "}
          {interestSummary}
        </p>
        <button
          type="button"
          data-collapsible-toggle
          onClick={() => writeMinimised(false)}
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

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3" data-suggested-programmes>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          Suggested programmes{" "}
          <span className="text-xs font-normal text-muted">
            · {total} match{total === 1 ? "" : "es"} for {interestSummary}, by country
          </span>
        </p>
        <div className="flex items-center gap-3">
          <Link
            prefetch={false}
            href={`/students/${studentId}/applications/new`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Search all programmes →
          </Link>
          <button
            type="button"
            onClick={() => writeMinimised(true)}
            aria-expanded={true}
            aria-label="Minimise suggested programmes"
            title="Minimise"
            className="rounded border border-border px-2 py-0.5 text-xs font-medium text-muted hover:text-ink"
          >
            Minimise
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {groups.map((country) => {
          const isOpen = !collapsed.has(country.name);
          return (
            <section key={country.name} className="rounded-md border border-border bg-card" data-country={country.name}>
              <button
                type="button"
                onClick={() => country.count > 0 && toggleCountry(country.name)}
                aria-expanded={country.count > 0 ? isOpen : undefined}
                disabled={country.count === 0}
                className="flex w-full items-center gap-2 px-3 py-2 text-left disabled:cursor-default"
                data-country-toggle
              >
                {country.count > 0 && (
                  <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`} />
                )}
                <span className={`text-sm font-semibold text-ink ${country.count === 0 ? "pl-6" : ""}`}>{country.name}</span>
                {country.isBackup && <span className="text-xs font-medium text-muted">(backup)</span>}
                <span className="ml-auto text-xs text-muted">
                  {country.count > 0
                    ? `${country.count} programme${country.count === 1 ? "" : "s"} · ${country.universities.length} ${country.universities.length === 1 ? "university" : "universities"}`
                    : "Nothing to suggest yet"}
                </span>
              </button>

              {country.count === 0 && (
                <p className="px-3 pb-2 pl-11 text-xs text-muted">
                  No programme at this student&rsquo;s {country.name} universities matches {interestSummary} yet.
                </p>
              )}

              {country.count > 0 && isOpen && (
                <div className="flex flex-col gap-3 border-t border-border px-3 py-2.5">
                  {country.universities.map((uni) => (
                    <div key={uni.id} data-university={uni.id}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{uni.name}</p>
                      <div className="flex flex-col divide-y divide-border">
                        {uni.programmes.map((s) => {
                          const isAdded = added.has(s.program_id);
                          return (
                            <div key={s.program_id} className="flex items-start justify-between gap-3 py-1.5" data-programme={s.program_id}>
                              <div className="min-w-0">
                                <p className="truncate text-sm text-ink">{s.program_name}</p>
                                <p className="mt-0.5 text-xs text-muted">
                                  {s.level}
                                  {" · "}
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
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
