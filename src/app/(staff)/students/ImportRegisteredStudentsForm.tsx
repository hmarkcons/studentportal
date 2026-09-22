"use client";

import { useActionState, useState } from "react";
import { importRegisteredStudents } from "@/lib/actions/leads";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";

export function ImportRegisteredStudentsForm() {
  const [state, formAction, pending] = useActionState(importRegisteredStudents, undefined);
  const [ready, setReady] = useState(false);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import registered students from a spreadsheet</summary>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <FileField
          accept=".xlsx,.csv"
          required
          hint="Excel or CSV"
          inputClassName="text-sm"
          onChange={(s) => setReady(Boolean(s.file))}
        />
        <Button type="submit" variant="primary" pending={pending} disabled={!ready}>
          Import
        </Button>
        {/* A plain link, not the CSV sample button the other imports use: the
            template is built on the server because its dropdowns are filled
            from live data — the counsellors on it are whoever is active right
            now, so a template downloaded today cannot offer somebody who has
            since left. */}
        <a
          href="/api/samples/registered-students"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-bg"
        >
          Download Excel template
        </a>
      </form>

      <p className="mt-2 text-xs text-muted">
        The template has dropdowns for <strong className="text-ink">assigned_counselor</strong> (only counsellors
        currently active on payroll), <strong className="text-ink">country_of_interest</strong>,{" "}
        <strong className="text-ink">backup_country</strong> and <strong className="text-ink">level_applying_for</strong>,
        so those cannot be mistyped. <code>full_name</code> and <code>country_of_interest</code> are required; everything
        else is optional.
      </p>
      <p className="mt-1 text-xs text-muted">
        <strong className="text-ink">registration_date</strong> is the day the student actually registered, written as{" "}
        <code>YYYY-MM-DD</code> (or a real date cell in Excel). It is what puts them in the right place in their
        intake&rsquo;s running order and fixes the Month they appear under — so a previous intake imports with the dates
        it happened on. Leave it blank only for students registering today. A date that cannot be read stops that row
        rather than being guessed, because the <strong className="text-ink">Student ID</strong> built from it is never
        renumbered afterwards.
      </p>
      <p className="mt-1 text-xs text-muted">
        Country names do not need the track suffix — <code>Italy</code> is matched to{" "}
        <strong className="text-ink">Italy (Public)</strong>, <code>UK</code> to{" "}
        <strong className="text-ink">United Kingdom (Private)</strong>, and so on. Each student is registered for their
        country on import, which is what issues their <strong className="text-ink">Student ID</strong> and lets
        applications be created for them.
      </p>

      {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}

      {state?.success && (
        <div className="mt-2 flex flex-col gap-1 text-xs">
          <p className="text-success">
            Imported {state.count} student{state.count === 1 ? "" : "s"}
            {typeof state.coded === "number" && ` · ${state.coded} Student ID${state.coded === 1 ? "" : "s"} issued`}.
            {state.skipped ? ` Skipped ${state.skipped} whose email already matches an existing student.` : ""}
            {state.exampleRows ? " The template's example row was ignored." : ""}
          </p>

          {/* Not a footnote. These students are registered and hold their place
              in the running order, but their portal stays shut and no ID can
              name a cycle until somebody records their intake. */}
          {(state.awaitingIntake ?? 0) > 0 && (
            <p className="text-warning">
              {state.awaitingIntake} of them have no intake recorded, so they have no Student ID yet and their portal
              stays closed. They keep their place in the running order — set the intake on each student&rsquo;s profile
              and the ID they were always going to have is issued then.
            </p>
          )}

          {(state.datedToday ?? 0) > 0 && (
            <p className="text-muted">
              {state.datedToday} row{state.datedToday === 1 ? "" : "s"} left <code>registration_date</code> blank and{" "}
              {state.datedToday === 1 ? "was" : "were"} registered as of today.
            </p>
          )}

          {(state.badDate?.length ?? 0) > 0 && (
            <p className="text-warning">
              Not imported — registration date could not be read: {state.badDate!.join("; ")}.
            </p>
          )}

          {state.destinationWarning && <p className="text-danger">Note: {state.destinationWarning}.</p>}

          {/* Every row that did not make it, named. A count alone would leave
              staff diffing the spreadsheet against the students list to find
              out who is missing. */}
          {(state.noCountry?.length ?? 0) > 0 && (
            <p className="text-warning">
              Not imported — no country given: {state.noCountry!.join(", ")}.
            </p>
          )}
          {(state.badCountry?.length ?? 0) > 0 && (
            <p className="text-warning">
              Not imported — country not recognised: {state.badCountry!.join("; ")}. Use the dropdown, or the country&rsquo;s
              plain name.
            </p>
          )}
          {/* Separate from "not recognised": the country is spelled fine and
              we simply aren't sending students there at the moment, so the fix
              is to pick a different destination, not to correct the spelling. */}
          {(state.pausedCountry?.length ?? 0) > 0 && (
            <p className="text-warning">
              Not imported — we have paused this country and aren&rsquo;t taking new students for it:{" "}
              {state.pausedCountry!.join("; ")}. Pick another destination, or ask a Super Admin to reopen it under
              Setup &rsaquo; Destinations.
            </p>
          )}
          {(state.unknownCounselor?.length ?? 0) > 0 && (
            <p className="text-warning">
              Imported unassigned — not an active counsellor: {state.unknownCounselor!.join("; ")}.
            </p>
          )}
          {(state.ambiguousCounselor?.length ?? 0) > 0 && (
            <p className="text-warning">
              Imported unassigned — more than one active counsellor has this name:{" "}
              {state.ambiguousCounselor!.join(", ")}.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
