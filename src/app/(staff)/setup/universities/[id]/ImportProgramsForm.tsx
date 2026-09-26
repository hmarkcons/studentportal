"use client";

import { importPrograms } from "@/lib/actions/universities";
import { SampleCsvButton } from "@/components/ui/SampleCsvButton";
import { PreviewedImport } from "@/components/PreviewedImport";

const HEADERS = [
  "level",
  "name",
  "core_field",
  "sub_field",
  "page_link",
  "interview_required",
  "interview_details",
  "admission_test_required",
  "admission_test_type",
  "application_portal_name",
  "application_portal_link",
  "intake_dates",
  "rounds",
  "start_date",
  "application_deadline",
  "tuition_fee",
  "duration",
  "language_requirement",
  "application_fee",
  "application_fee_currency",
  "coordinator_email",
];

// One value per header, in the same order. It was one short — nothing sat
// under application_deadline, so every value from there on was shifted up a
// column and the sample people downloaded carried application_deadline=3000,
// tuition_fee="3 years" and duration="B2 English". A date of "3000" does not
// parse, so an import built by filling in the sample was rejected outright.
//
// start_date and application_deadline are shown empty beside a filled-in
// `rounds` cell, which is what makes the precedence between them readable.
const EXAMPLE = [
  "bachelors",
  "Computer Science",
  "IT/CS",
  "Software Engineering",
  "https://example.edu/cs",
  "no",
  "",
  "yes",
  "TOLC",
  "Universitaly",
  "https://universitaly.it",
  "Fall;Spring",
  "Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15",
  "",
  "",
  "3000",
  "3 years",
  "B2 English",
  // Blank: the programme charges the university's fee.
  "",
  "",
  "cs.coordinator@example.edu",
];

export function ImportProgramsForm({ universityId }: { universityId: string }) {
  const action = importPrograms.bind(null, universityId);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import programmes from a spreadsheet</summary>
      <PreviewedImport
        action={action}
        extras={<SampleCsvButton filename="programs-sample.csv" headers={HEADERS} exampleRow={EXAMPLE} />}
      />
      <p className="mt-3 text-xs text-muted">
        CSV columns: <code>level</code> (bachelors/masters/phd, required), <code>name</code> (required),{" "}
        <code>core_field</code>, <code>sub_field</code>, <code>page_link</code>, <code>interview_required</code> (yes/no),{" "}
        <code>interview_details</code>, <code>admission_test_required</code> (yes/no), <code>admission_test_type</code>,{" "}
        <code>application_portal_name</code>, <code>application_portal_link</code>,{" "}
        <code>intake_dates</code> (semicolon-separated), <code>rounds</code>, <code>start_date</code> (YYYY-MM-DD,
        when the course begins), <code>application_deadline</code> (YYYY-MM-DD, when applications close),{" "}
        <code>tuition_fee</code>, <code>duration</code>, <code>language_requirement</code>,{" "}
        <code>application_fee</code> (only where it differs from the university&rsquo;s — blank charges the
        university&rsquo;s), <code>application_fee_currency</code> (blank follows the university, then the destination),{" "}
        <code>coordinator_email</code>.
      </p>
      <p className="mt-1 text-xs text-muted">
        A programme can run several intake rounds. Put them in <code>rounds</code> as{" "}
        <code>label|course start|apply by</code>, semicolons between rounds — e.g.{" "}
        <code>Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15</code>. For a single intake,{" "}
        <code>start_date</code> and <code>application_deadline</code> still work on their own and become Round 1.{" "}
        <code>rounds</code> wins if both are filled in.
      </p>
      <p className="mt-1 text-xs text-muted">
        <strong className="text-ink">Nothing is saved until you apply</strong> the preview.{" "}
        <code>name</code> and <code>level</code> together decide whether a row updates or creates: a programme already
        on file at that level — or with a close spelling of its name — is <strong className="text-ink">updated</strong>,
        not skipped.{" "}
        <strong className="text-ink">An empty cell changes nothing</strong>, so a sheet of just names, levels and fees
        leaves everything else alone and the import can never blank a field. An empty <code>rounds</code> leaves the
        stored rounds alone; a filled one is merged by round name — a round on file has its dates updated, a new
        name is added, and rounds the sheet does not mention are kept.
      </p>
    </details>
  );
}
