"use client";

import { startTransition, useActionState, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { ImportReportPanel } from "@/components/ImportReportPanel";
import type { CatalogueImportResult } from "@/lib/importMerge";

type ImportAction = (prev: CatalogueImportResult | undefined, formData: FormData) => Promise<CatalogueImportResult>;

/**
 * Upload, preview, then apply — the shape every catalogue import takes.
 *
 * The first submit sends `intent=preview`, and the server does all of its
 * matching and writes nothing. Only once that preview is on screen does Apply
 * appear, and it sends the same file again with `intent=apply` and the
 * preview's fingerprint, which the server checks before writing.
 *
 * The file is held in state and the action dispatched by hand rather than
 * through `<form action>`, because React resets a form after its action runs —
 * which would empty the file input between the preview and the apply, and
 * leave nothing to apply.
 *
 * Any change to the form after a preview (another file, another destination)
 * withdraws the Apply button until it is previewed again. The server enforces
 * the same thing through the fingerprint; this just says so before the click.
 */
export function PreviewedImport({
  action,
  fields,
  extras,
}: {
  action: ImportAction;
  /** Inputs that travel with the file, such as a destination picker. */
  fields?: ReactNode;
  /** Links shown beside the buttons: templates, exports. */
  extras?: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const [file, setFile] = useState<File | null>(null);
  const [intent, setIntent] = useState<"preview" | "apply">("preview");
  const [stale, setStale] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // A new answer from the server is by definition about the form as it now
  // stands. Adjusted during render rather than in an effect, as React advises
  // for state derived from a change.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setStale(false);
  }

  const previewed = state?.success && state.mode === "preview" ? state : null;
  const hasWork =
    previewed !== null &&
    previewed.universities.added + previewed.universities.updated + previewed.programs.added + previewed.programs.updated > 0;
  const canApply = hasWork && !stale && file !== null;

  function send(next: "preview" | "apply") {
    const form = formRef.current;
    if (!form || !file) return;
    const formData = new FormData(form);
    formData.set("file", file);
    formData.set("intent", next);
    if (next === "apply" && previewed) formData.set("fingerprint", previewed.fingerprint);
    setIntent(next);
    startTransition(() => dispatch(formData));
  }

  return (
    <>
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          send("preview");
        }}
        onChange={() => setStale(true)}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        {fields}
        <FileField
          accept=".xlsx,.csv"
          required
          hint="Excel or CSV"
          inputClassName="text-sm"
          onChange={(s) => {
            setFile(s.file);
            setStale(true);
          }}
        />
        <Button type="submit" variant={canApply ? "outline" : "primary"} pending={pending && intent === "preview"} disabled={!file || pending}>
          Preview
        </Button>
        {canApply && (
          <Button type="button" variant="primary" pending={pending && intent === "apply"} disabled={pending} onClick={() => send("apply")}>
            Apply these changes
          </Button>
        )}
        {extras}
      </form>

      {previewed && stale && (
        <p className="mt-2 text-xs text-warning">The form has changed since this preview — preview again before applying.</p>
      )}
      <ImportReportPanel state={state} />
    </>
  );
}
