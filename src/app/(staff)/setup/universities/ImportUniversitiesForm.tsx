"use client";

import { importUniversities } from "@/lib/actions/universities";
import { SampleCsvButton } from "@/components/ui/SampleCsvButton";
import { Select } from "@/components/ui/Input";
import { PreviewedImport } from "@/components/PreviewedImport";

const HEADERS = [
  "destination",
  "name",
  "city",
  "region",
  "type",
  "levels_offered",
  "fields_offered",
  "contact_email",
  "application_fee",
  "application_fee_currency",
  "dsu_body",
];
const EXAMPLE = [
  "Italy (Public)",
  "Sapienza University of Rome",
  "Rome",
  "Lazio",
  "public",
  "bachelors;masters",
  "Engineering;IT/CS",
  "admissions@example.edu",
  "30",
  "EUR",
  "DiSCo Lazio",
];

export function ImportUniversitiesForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import universities from a spreadsheet</summary>

      <PreviewedImport
        action={importUniversities}
        fields={
          <Select name="destination_id" aria-label="Destination for rows that leave the destination column blank">
            <option value="">Destination from the sheet</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}, where the sheet leaves it blank
              </option>
            ))}
          </Select>
        }
        extras={<SampleCsvButton filename="universities-sample.csv" headers={HEADERS} exampleRow={EXAMPLE} />}
      />

      <p className="mt-3 text-xs text-muted">
        Columns: <code>destination</code> (blank uses the one chosen above), <code>name</code> (required),{" "}
        <code>city</code>, <code>region</code>, <code>type</code> (public/private — a new university defaults to the
        destination&rsquo;s own track), <code>levels_offered</code>, <code>fields_offered</code>,{" "}
        <code>contact_email</code>, <code>application_fee</code> (what applying costs, for every programme without a fee
        of its own), <code>application_fee_currency</code> (blank follows the destination), <code>dsu_body</code> (a
        body from Setup → Scholarship bodies that serves the destination, by name). The list columns are
        semicolon-separated within one cell. A university that is new needs a <code>city</code>.
      </p>
      <p className="mt-1 text-xs text-muted">
        <strong className="text-ink">Nothing is saved until you apply</strong> the preview. A name already on file — or
        close to one — is <strong className="text-ink">updated</strong>, not skipped.{" "}
        <strong className="text-ink">An empty cell changes nothing</strong>, so a sheet of just names and cities leaves
        every other column alone. To clear a field, use the university&rsquo;s own edit form.
      </p>
    </details>
  );
}
