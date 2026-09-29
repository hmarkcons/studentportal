"use client";

import { useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PreviewedImport } from "@/components/PreviewedImport";
import { importScholarshipBodies } from "@/lib/actions/scholarshipBodyImport";

/**
 * The directory's heading, its actions, and the import they open.
 *
 * The import sits behind a button beside "+ Scholarship body" rather than in a
 * <details> of its own further down the page, because it is the other way to
 * add a body — but its panel needs the page's full width for the preview, so
 * it opens under the heading. It is hidden rather than unmounted when closed,
 * so a preview survives closing and reopening it.
 *
 * The flow is the catalogue's own (PreviewedImport): upload, preview with
 * every change listed, then apply exactly that.
 */
export function ScholarshipBodiesHeader({
  children,
  addButton,
  canImport,
}: {
  /** The heading and the line under it. */
  children: ReactNode;
  /** "+ Scholarship body", for those who may add one. */
  addButton?: ReactNode;
  canImport: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {children}
        {(canImport || addButton) && (
          <div className="flex flex-wrap items-center gap-2">
            {canImport && (
              <Button
                type="button"
                variant="outline"
                aria-expanded={open}
                aria-controls="scholarship-body-import"
                onClick={() => setOpen((was) => !was)}
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                Import
              </Button>
            )}
            {addButton}
          </div>
        )}
      </div>

      {canImport && (
        <section
          id="scholarship-body-import"
          data-scholarship-import
          aria-label="Import scholarship bodies"
          hidden={!open}
          className="mt-3 rounded-md border border-border p-3"
        >
          <p className="text-sm font-medium text-ink">Import scholarship bodies from a spreadsheet</p>

          <PreviewedImport
            action={importScholarshipBodies}
            extras={
              <>
                {/* The usual starting point for editing: the directory comes
                    back in the same sheet, so the names match to the character
                    and every edit is an update rather than a guess. */}
                <a
                  href="/api/export/scholarship-bodies"
                  className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-bg"
                >
                  Download current bodies
                </a>
                <a
                  href="/api/samples/scholarship-bodies"
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-bg"
                >
                  Blank template
                </a>
              </>
            }
          />

          <p className="mt-3 text-xs text-muted">
            <strong className="text-ink">Nothing is saved until you apply.</strong> Preview shows every body that will be
            added, every field that will change with its old and new value, and every row matched by a similar rather
            than identical name. Apply writes exactly that. The workbook&rsquo;s <em>How to fill</em> sheet says what
            each column takes.
          </p>
          <p className="mt-1 text-xs text-muted">
            One row per body, matched by <code>Name</code>. A name already on file <strong className="text-ink">updates</strong>{" "}
            that body; one close to it — a typo, <code>ERGO</code> for <code>ER.GO</code> — updates it too and keeps the
            stored name; one close to two bodies is held back. A new name is <strong className="text-ink">added</strong>,
            and needs an <code>Academic year</code> and at least one country.{" "}
            <strong className="text-ink">An empty cell changes nothing</strong>, so the import can never blank a field —
            to clear one, use the body&rsquo;s edit form.
          </p>
          <p className="mt-1 text-xs text-muted">
            <code>Countries</code> takes one or more destinations separated by semicolons, named as on the workbook&rsquo;s
            Lists sheet (<code>Italy (Public); Italy (Private)</code>); a country&rsquo;s own name (<code>Italy</code>)
            means every destination of it. Filled in, the body serves <strong className="text-ink">exactly</strong> those
            countries; left blank, they stay as they are. A name that is not a destination is reported and changes
            nothing. <code>Universities covered</code> is semicolon-separated too (or one per line), and replaces the stored list.
          </p>
          <p className="mt-1 text-xs text-muted">
            The guide is <code>Guide 1 title</code> / <code>Guide 1 text</code> pairs. Fill in any of them and the guide
            becomes <strong className="text-ink">exactly</strong> the sections filled in, in order — a section left off
            the row is removed, and the preview names each one. Leave every guide cell blank and the guide is kept. A title
            with no text, or text with no title, is reported and the guide left alone. Up to 40 sections; add{" "}
            <code>Guide 13 title</code> and <code>Guide 13 text</code> columns and so on past twelve.
          </p>
          <p className="mt-1 text-xs text-muted">
            <code>Call status</code> is <code>published</code> or <code>awaiting</code>; <code>Call expected on</code>{" "}
            counts only for an awaited call, and a call set to published loses its expected date, as in the edit form.
            Links must be full addresses starting <code>https://</code>. Text is stored as written: unlike the edit form,
            the import does not translate, so write it in English.
          </p>
        </section>
      )}
    </div>
  );
}
