"use client";

import { useMemo, useState } from "react";

export type FieldGroupOption = {
  slug: string;
  name: string;
  /** Distinct core_field values in this group, across the student's countries. */
  specifics: string[];
};

/**
 * A student's course of interest, chosen rather than typed.
 *
 * Two levels, because one would not work. The specific level is the
 * programme catalogue's own core_field, which is per-programme free text —
 * 1,297 distinct values, 279 of them in Italy alone, including entries like
 * "Astrophysics, cosmology and space physics (degree class LM-58)". A flat
 * dropdown of those is not a picker. So the broad field narrows it first, and
 * the specifics under it are a short list.
 *
 * Both levels are limited to what the student's OWN registered countries
 * teach: offering Italian programmes to a student going to Sweden would be
 * offering something they cannot apply for.
 *
 * Selecting only broad fields is fine and expected — "Engineering" is a
 * complete answer at enquiry stage. The specifics are there for when the
 * student has decided.
 */
export function CourseInterestPicker({
  options,
  selectedGroups,
  selectedSpecifics,
  legacyText,
}: {
  options: FieldGroupOption[];
  selectedGroups: string[];
  selectedSpecifics: string[];
  /**
   * Whatever was typed into the old free-text box. Shown so staff can see what
   * they are translating; it stays on the record until a selection replaces it.
   */
  legacyText?: string | null;
}) {
  const [groups, setGroups] = useState<Set<string>>(new Set(selectedGroups));
  const [specifics, setSpecifics] = useState<Set<string>>(new Set(selectedSpecifics));
  const [expanded, setExpanded] = useState<Set<string>>(new Set(selectedGroups));

  const byGroup = useMemo(() => new Map(options.map((o) => [o.slug, o])), [options]);
  const knownSpecifics = useMemo(() => new Set(options.flatMap((o) => o.specifics)), [options]);

  // Selections the student's current countries no longer offer — a country was
  // removed, or the catalogue changed. Kept rather than silently dropped: it is
  // what somebody chose, and losing it on an unrelated profile save would be a
  // quiet edit of their record.
  const orphanGroups = selectedGroups.filter((s) => !byGroup.has(s) && groups.has(s));
  const orphanSpecifics = selectedSpecifics.filter((s) => !knownSpecifics.has(s) && specifics.has(s));

  function toggleGroup(slug: string) {
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
        // Its specifics go with it: a specific field only means something
        // under its parent, and leaving them behind would submit a specific
        // whose group is unticked.
        const owned = byGroup.get(slug)?.specifics ?? [];
        setSpecifics((s) => {
          const kept = new Set(s);
          for (const o of owned) kept.delete(o);
          return kept;
        });
      } else {
        next.add(slug);
        setExpanded((e) => new Set(e).add(slug));
      }
      return next;
    });
  }

  function toggleSpecific(value: string) {
    setSpecifics((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const totalChosen = groups.size + specifics.size;

  if (options.length === 0) {
    return (
      <div className="rounded-md border border-border bg-bg p-3">
        <p className="text-xs text-warning">
          No fields to choose from yet — this student&rsquo;s countries have no programmes on file. Add programmes under
          Setup &rsaquo; Universities, or set the student&rsquo;s country first.
        </p>
        {legacyText && <p className="mt-1 text-xs text-muted">Currently recorded: {legacyText}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-bg p-3">
      {/* What was typed before, so staff can see what they are replacing
          rather than having to open another tab to find it. */}
      {legacyText && totalChosen === 0 && (
        <p className="mb-2 rounded border border-border bg-card px-2 py-1.5 text-xs text-muted">
          Currently recorded as free text: <span className="font-medium text-ink">{legacyText}</span>
          <br />
          Tick the matching fields below to replace it.
        </p>
      )}

      <p className="mb-2 text-[11px] text-muted">
        Only fields this student&rsquo;s countries actually teach. Tick a broad field to see the specific programmes
        within it — broad alone is a complete answer.
      </p>

      <div className="max-h-80 overflow-y-auto">
        {options.map((option) => {
          const on = groups.has(option.slug);
          const open = on && expanded.has(option.slug);
          const chosenHere = option.specifics.filter((s) => specifics.has(s)).length;
          return (
            <div key={option.slug} className="border-b border-border py-1.5 last:border-0">
              <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 text-sm text-ink">
                  {/* Named explicitly: the label also carries the "17
                      programme fields" counter, so its text content reads as
                      "Medicine17 programme fields" to anything that takes the
                      accessible name from the label as a whole. */}
                  <input
                    type="checkbox"
                    aria-label={option.name}
                    checked={on}
                    onChange={() => toggleGroup(option.slug)}
                  />
                  <span className={on ? "font-medium" : ""}>{option.name}</span>
                  <span className="text-[11px] text-muted">
                    {option.specifics.length} programme field{option.specifics.length === 1 ? "" : "s"}
                    {chosenHere > 0 ? ` · ${chosenHere} chosen` : ""}
                  </span>
                </label>
                {on && option.specifics.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((e) => {
                        const next = new Set(e);
                        if (next.has(option.slug)) next.delete(option.slug);
                        else next.add(option.slug);
                        return next;
                      })
                    }
                    className="text-[11px] text-primary hover:underline"
                  >
                    {open ? "hide" : "narrow down"}
                  </button>
                )}
              </div>

              {open && (
                <div className="mt-1 flex flex-col gap-0.5 pl-6">
                  {option.specifics.map((value) => (
                    <label key={value} className="flex items-start gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        aria-label={value}
                        className="mt-0.5"
                        checked={specifics.has(value)}
                        onChange={() => toggleSpecific(value)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(orphanGroups.length > 0 || orphanSpecifics.length > 0) && (
        <div className="mt-2 rounded border border-border bg-card px-2 py-1.5">
          <p className="text-[11px] text-warning">
            Chosen previously, but not taught in this student&rsquo;s current countries. Kept unless you untick it.
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {orphanGroups.map((slug) => (
              <label key={slug} className="flex items-center gap-2 text-xs text-ink">
                <input type="checkbox" checked onChange={() => toggleGroup(slug)} />
                <span>{slug}</span>
              </label>
            ))}
            {orphanSpecifics.map((value) => (
              <label key={value} className="flex items-center gap-2 text-xs text-ink">
                <input type="checkbox" checked onChange={() => toggleSpecific(value)} />
                <span>{value}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted">
        {totalChosen === 0
          ? "Nothing selected — the existing text is left as it is."
          : `${groups.size} broad field${groups.size === 1 ? "" : "s"}${
              specifics.size > 0 ? ` · ${specifics.size} specific field${specifics.size === 1 ? "" : "s"}` : ""
            } selected.`}
      </p>

      {/* Submitted as hidden inputs, one per selection. The action reads them
          with getAll(). A marker goes out too, so an action can tell "the
          picker was on this form and everything was unticked" from "this form
          has no picker" — clearing a student's interests must be possible
          without every other form that touches leads wiping them. */}
      <input type="hidden" name="course_interest_present" value="1" />
      {[...groups].map((slug) => (
        <input key={slug} type="hidden" name="interest_field_groups" value={slug} />
      ))}
      {[...specifics].map((value) => (
        <input key={value} type="hidden" name="interest_core_fields" value={value} />
      ))}
    </div>
  );
}
