"use client";

import type { CatalogueImportResult } from "@/lib/importMerge";

/**
 * What a catalogue import will do, or did, said in full.
 *
 * The imports overwrite, so "Imported 41" is not an honest summary — it does
 * not say what was replaced, and replacing the wrong thing is the one way this
 * feature can hurt. So every new record is named, every changed field is shown
 * with its old value beside the new, every row matched by a similar rather
 * than identical name is listed on its own, and every row deliberately not
 * touched says why.
 *
 * The same panel renders the preview and the result. The preview is the one
 * that matters: it is read before anything is written, and the similar-name
 * matches are the lines to check.
 *
 * Shared by all three sheets so the wording cannot drift between them.
 */

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 universities, 41 programmes", skipping whichever is zero. */
function countLine(universities: number, programs: number) {
  const parts = [
    universities > 0 ? plural(universities, "university", "universities") : "",
    programs > 0 ? plural(programs, "programme") : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function Section({
  tone,
  title,
  lines,
  overflow = 0,
  note,
  open,
}: {
  tone: "warning" | "danger" | "muted" | "ink";
  title: string;
  lines: string[];
  overflow?: number;
  note?: string;
  open?: boolean;
}) {
  if (lines.length === 0) return null;
  const colour =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "ink" ? "text-ink" : "text-muted";
  return (
    <details className="mt-1 rounded border border-border bg-bg p-2" open={open ?? lines.length <= 12}>
      <summary className={`cursor-pointer font-medium ${colour}`}>
        {title} ({lines.length + overflow})
      </summary>
      {note && <p className="mt-0.5 text-muted">{note}</p>}
      <ul className="mt-1 list-disc pl-4 text-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {overflow > 0 && <p className="mt-1 text-muted">…and {overflow} more, not listed.</p>}
    </details>
  );
}

export function ImportReportPanel({ state }: { state: CatalogueImportResult | undefined }) {
  if (!state) return null;
  // data-import-report marks the one element that only exists once the action
  // has answered, and says which answer: "preview", "applied" or "error".
  // check:catalogue waits on it rather than on wording, because the help text
  // above this panel already contains the words the report uses.
  if (state.error) return <p data-import-report="error" className="mt-2 text-xs text-danger">{state.error}</p>;
  if (!state.success) return null;

  const preview = state.mode === "preview";
  const { universities, programs } = state;
  const added = countLine(universities.added, programs.added);
  const updated = countLine(universities.updated, programs.updated);
  const unchanged = countLine(universities.unchanged, programs.unchanged);
  const nothingHappens = !added && !updated;

  return (
    <div data-import-report={state.mode} className="mt-3 flex flex-col gap-1 text-xs">
      {preview && (
        <p className="font-medium text-ink">
          Preview — nothing has been saved yet.{" "}
          {!nothingHappens && <span className="font-normal text-muted">Read it through, then apply.</span>}
        </p>
      )}
      <p className={nothingHappens ? "text-muted" : "text-success"}>
        {added && <>{preview ? "Will add" : "Added"} {added}. </>}
        {updated && <>{preview ? "Will update" : "Updated"} {updated}. </>}
        {nothingHappens && <>Nothing to add or change. </>}
        {unchanged && (
          <span className="text-muted">
            {unchanged} already {preview ? "match" : "matched"} the sheet{preview ? " and will be left alone" : ""}.
          </span>
        )}
      </p>

      {/* First, because these are the lines a person has to check: each one
          is a guess that two spellings are the same record. */}
      <Section
        tone="warning"
        title={preview ? "Matched by a similar name — check these" : "Matched by a similar name"}
        note={
          preview
            ? "Each of these will update the record on the right, which keeps its stored name. If a pairing is wrong, correct the name in the sheet and preview again."
            : undefined
        }
        lines={state.similarMatches}
        overflow={state.overflow.similarMatches}
        open
      />

      <Section
        tone="ink"
        title={preview ? "New — will be added" : "Added"}
        lines={state.additions}
        overflow={state.overflow.additions}
      />

      {/* Every field that is overwritten, old value beside new. This is the
          only record of it the person who ran the import will see. */}
      <Section
        tone="ink"
        title={preview ? "Changes — old → new" : "What changed"}
        lines={state.changes}
        overflow={state.overflow.changes}
      />

      <Section
        tone="warning"
        title="Held back — could be more than one record"
        note="Nothing was created or overwritten for these, since there is no telling which record was meant. Each line says what to fix."
        lines={state.heldBack}
        open
      />

      <Section tone="warning" title="Rows with something wrong in them" lines={state.problems} open />

      <Section tone="danger" title="Failed" lines={state.failures} open />
    </div>
  );
}
