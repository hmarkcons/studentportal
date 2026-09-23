"use client";

import { useActionState, useState } from "react";
import { importCatalogue } from "@/lib/actions/universities";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { Select } from "@/components/ui/Input";
import { ImportReportPanel } from "@/components/ImportReportPanel";

/**
 * A whole destination's catalogue in one upload.
 *
 * The other two importers are still here and still work: universities for a
 * destination, programmes for one university at a time. This one exists
 * because rebuilding a country's catalogue through them means opening every
 * university in turn — thirty uploads for thirty universities — and the
 * spreadsheets the offices actually keep are already one row per programme
 * with the university repeated down the side.
 */
export function ImportCatalogueForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(importCatalogue, undefined);
  const [ready, setReady] = useState(false);
  // Controlled only so the export link knows which destination to ask for.
  const [destinationId, setDestinationId] = useState("");

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Import a whole destination&rsquo;s catalogue — universities and programmes in one sheet
      </summary>

      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <Select
          name="destination_id"
          required
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
        >
          <option value="">Destination…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
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
        {/* The usual starting point for a destination that already has a
            catalogue: the stored rows come back in the same sheet, so the
            names match to the character and nothing is held back as a
            near-miss. Retyping them is what creates near-misses. */}
        <a
          href={destinationId ? `/api/export/catalogue?destination=${destinationId}` : undefined}
          aria-disabled={!destinationId}
          title={destinationId ? undefined : "Choose a destination first"}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
            destinationId
              ? "border-primary text-primary hover:bg-bg"
              : "pointer-events-none border-border text-muted opacity-60"
          }`}
        >
          Download current catalogue
        </a>
        {/* Links rather than the CSV sample button the other two use: these
            carry dropdowns for level, type and the yes/no columns, which a CSV
            cannot hold. */}
        <a
          href="/api/samples/catalogue"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-bg"
        >
          Blank template
        </a>
      </form>

      <p className="mt-2 text-xs text-muted">
        <strong className="text-ink">To edit a catalogue that already exists, start from Download current
        catalogue.</strong>{" "}
        It hands back everything stored for that destination in this same sheet, so the names match exactly, your edits
        update rather than duplicate, and every cell you leave alone stays as it is. Uploading it back untouched does
        nothing at all. Retyping the names is what produces the held-back rows below.
      </p>
      <p className="mt-1 text-xs text-muted">
        One row per programme. The university columns —{" "}
        <code>university_name</code>, <code>city</code>, <code>region</code>, <code>type</code>,{" "}
        <code>levels_offered</code>, <code>fields_offered</code>, <code>contact_email</code> — repeat on every row that
        belongs to that university, and it is created or updated once. Leave the programme columns blank to import a
        university on its own.
      </p>
      <p className="mt-1 text-xs text-muted">
        A university is matched by <code>university_name</code> within the destination you pick; a programme by{" "}
        <code>program_name</code> and <code>level</code> within its university. Anything already on file is{" "}
        <strong className="text-ink">updated</strong>, anything new is added, and{" "}
        <strong className="text-ink">an empty cell changes nothing</strong> — the import can never blank a field.
      </p>
      <p className="mt-1 text-xs text-muted">
        A name that is nearly but not exactly one already stored — <code>Sapienza Univ. of Rome</code> against a stored{" "}
        <code>Sapienza University of Rome</code> — is <strong className="text-ink">held back and listed</strong> rather
        than guessed at, so it neither overwrites the wrong record nor quietly creates a duplicate. Only a Super Admin
        may overwrite; anyone else can still add.
      </p>

      <ImportReportPanel state={state} />
    </details>
  );
}
