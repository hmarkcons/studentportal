"use client";

import type { CatalogueImportResult } from "@/lib/importMerge";

/**
 * What a catalogue import did, said in full.
 *
 * The imports overwrite now, so "Imported 41" is no longer an honest summary —
 * it does not say what was replaced, and replacing the wrong thing is the one
 * way this feature can hurt. Every changed field is named with its old value
 * beside the new one, and every row that was deliberately not touched says why
 * it was not.
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
  note,
}: {
  tone: "warning" | "danger" | "muted";
  title: string;
  lines: string[];
  note?: string;
}) {
  if (lines.length === 0) return null;
  const colour = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-muted";
  return (
    <div className={`mt-2 ${colour}`}>
      <p className="font-medium">
        {title} ({lines.length})
      </p>
      {note && <p className="opacity-80">{note}</p>}
      <ul className="mt-0.5 list-disc pl-4">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function ImportReportPanel({ state }: { state: CatalogueImportResult | undefined }) {
  if (!state) return null;
  if (state.error) return <p className="mt-2 text-xs text-danger">{state.error}</p>;
  if (!state.success) return null;

  const { universities, programs } = state;
  const added = countLine(universities.added, programs.added);
  const updated = countLine(universities.updated, programs.updated);
  const unchanged = countLine(universities.unchanged, programs.unchanged);
  const nothingHappened = !added && !updated;

  return (
    <div className="mt-2 flex flex-col gap-1 text-xs">
      <p className={nothingHappened ? "text-muted" : "text-success"}>
        {added && <>Added {added}. </>}
        {updated && <>Updated {updated}. </>}
        {nothingHappened && <>Nothing to add or change. </>}
        {unchanged && <span className="text-muted">{unchanged} already matched the sheet.</span>}
      </p>

      {/* Every field that was overwritten, old value beside new. This is the
          only record of it the person who ran the import will see. */}
      {state.changes.length > 0 && (
        <details className="mt-1 rounded border border-border bg-bg p-2" open={state.changes.length <= 12}>
          <summary className="cursor-pointer font-medium text-ink">
            What changed ({state.changes.length + state.changeOverflow})
          </summary>
          <ul className="mt-1 list-disc pl-4 text-muted">
            {state.changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {state.changeOverflow > 0 && (
            <p className="mt-1 text-muted">…and {state.changeOverflow} more, not listed.</p>
          )}
        </details>
      )}

      <Section
        tone="warning"
        title="Held back — these look like something already on file"
        note="Nothing was created or overwritten for these. Correct the name in the sheet so it matches exactly, or rename the stored one if they really are different."
        lines={state.heldBack}
      />

      <Section
        tone="warning"
        title="Not changed — only a Super Admin may overwrite"
        note="These rows already exist and your sheet would have changed them. They were left exactly as they are."
        lines={state.needsSuperAdmin}
      />

      <Section tone="warning" title="Rows with something wrong in them" lines={state.problems} />

      <Section tone="danger" title="Failed" lines={state.failures} />
    </div>
  );
}
