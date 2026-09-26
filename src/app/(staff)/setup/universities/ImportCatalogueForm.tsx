"use client";

import { useState } from "react";
import { importCatalogue } from "@/lib/actions/universities";
import { Select } from "@/components/ui/Input";
import { PreviewedImport } from "@/components/PreviewedImport";

/**
 * Universities and their programmes, for any number of destinations, in one
 * upload.
 *
 * The other two importers are still here and still work: universities alone,
 * and programmes for one university at a time. This one exists because
 * rebuilding a catalogue through them means opening every university in turn,
 * and the spreadsheets the offices actually keep are already one row per
 * programme with the university repeated down the side.
 */
export function ImportCatalogueForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  // Controlled only so the export link knows which destination to ask for.
  const [destinationId, setDestinationId] = useState("");
  const chosen = destinations.find((d) => d.id === destinationId);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Import a catalogue — universities and programmes, one or many destinations, in one sheet
      </summary>

      <PreviewedImport
        action={importCatalogue}
        fields={
          <Select
            name="destination_id"
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            aria-label="Destination for rows that leave the destination column blank"
          >
            <option value="">Destination from the sheet</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}, where the sheet leaves it blank
              </option>
            ))}
          </Select>
        }
        extras={
          <>
            {/* The usual starting point for editing: the stored rows come back
                in the same sheet, so the names match to the character and
                every edit is an update rather than a guess. */}
            <a
              href={`/api/export/catalogue?destination=${destinationId || "all"}`}
              className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-bg"
            >
              Download current catalogue{chosen ? ` (${chosen.display_name})` : " (all destinations)"}
            </a>
            {/* A link rather than a CSV sample: the workbook carries dropdowns
                for destination, level, type and the yes/no columns. */}
            <a
              href="/api/samples/catalogue"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-bg"
            >
              Blank template
            </a>
          </>
        }
      />

      <p className="mt-3 text-xs text-muted">
        <strong className="text-ink">Nothing is saved until you apply.</strong> Preview shows every university and
        programme that will be added, every field that will change with its old and new value, and every row matched by
        a similar rather than identical name. Apply writes exactly that.
      </p>
      <p className="mt-1 text-xs text-muted">
        One row per programme. The university columns — <code>destination</code>, <code>university_name</code>,{" "}
        <code>city</code>, <code>region</code>, <code>type</code>, <code>levels_offered</code>,{" "}
        <code>fields_offered</code>, <code>contact_email</code>, <code>university_application_fee</code>,{" "}
        <code>university_application_fee_currency</code>, <code>dsu_body</code> — repeat on every row of that
        university, which is created or updated once. Leave the programme columns blank to import a university on its
        own. Put as many universities and destinations in one sheet as you like.
      </p>
      <p className="mt-1 text-xs text-muted">
        <strong className="text-ink">Application fee:</strong> <code>university_application_fee</code> is what every
        programme there costs to apply to; <code>program_application_fee</code> only where a programme charges
        something else. A currency left blank follows the destination (<code>€50</code> in the fee cell also says EUR).{" "}
        <code>dsu_body</code> is a body from Setup → Scholarship bodies, by name — one that serves that destination;
        any other name is reported and left unchanged. <code>coordinator_email</code> is the programme&rsquo;s
        coordinator.
      </p>
      <p className="mt-1 text-xs text-muted">
        <code>destination</code> takes the name as the export writes it (<code>Italy (Public)</code>), the country (
        <code>Italy</code>) or its code (<code>IT</code>). Where it is blank, the destination chosen above is used.
      </p>
      <p className="mt-1 text-xs text-muted">
        A university is matched by name within its destination; a programme by name and level within its university.
        A row that matches exactly is <strong className="text-ink">left alone</strong>; one with different details{" "}
        <strong className="text-ink">overwrites</strong> them; details not yet on file are{" "}
        <strong className="text-ink">added</strong>; anything new is <strong className="text-ink">created</strong>.{" "}
        <strong className="text-ink">An empty cell changes nothing</strong>, so the import can never blank a field — to
        clear one, use the edit form.
      </p>
      <p className="mt-1 text-xs text-muted">
        A name that is close to one on file — <code>Sapienza Univ. of Rome</code> against{" "}
        <code>Sapienza University of Rome</code> — updates that record and keeps its stored name. Names that are genuinely
        different, like <code>University of Padua</code> and <code>University of Pavia</code>, are not confused. A name
        close to two records is held back, since there is no telling which was meant.
      </p>

      <p className="mt-3 text-xs font-medium text-ink">Admission rounds — the Rounds sheet</p>
      <p className="mt-1 text-xs text-muted">
        One row per round: <code>destination</code>, <code>university_name</code>, <code>level</code>,{" "}
        <code>program_name</code>, <code>round</code>, <code>start_date</code>, <code>application_deadline</code>. Leave{" "}
        <code>program_name</code> blank and the round reaches <strong className="text-ink">every programme the university
        has</strong> — or every one at a level, if <code>level</code> is filled in — which is how calls like Italy&rsquo;s{" "}
        <code>1st call</code>, <code>2nd call</code> are announced. Fill in <code>program_name</code> for a round of one
        programme only. A university can appear on the Rounds sheet without being on the Catalogue sheet.
      </p>
      <p className="mt-1 text-xs text-muted">
        Rounds are matched by name: one already on file has its dates updated (an empty date cell leaves that date
        alone), a new name is added, and <strong className="text-ink">rounds not on the sheet are kept</strong> — to
        remove one, use the programme&rsquo;s edit form. A blank <code>round</code> is numbered Round 1, Round 2… in date
        order. Dates can be Excel dates, <code>2027-03-15</code> or <code>15 Mar 2027</code>; <code>15/03/2027</code> is
        refused, since it reads differently in different countries. When a programme&rsquo;s rounds change, they are put in
        order automatically — open rounds first, soonest deadline first — so the first is always the next deadline, which
        is the one reminders and the staff queue use.
      </p>
    </details>
  );
}
