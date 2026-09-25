"use client";

import { useEffect, useRef, useState } from "react";
import { importDocxTemplate } from "@/lib/extractDocxText";
import { type Theme } from "@/lib/pdf/agreementTheme";
import { previewAgreementTemplate, previewStaffAgreementTemplate } from "@/lib/actions/agreementPreview";
import { RichTextEditor } from "@/components/RichTextEditor";
import { FileField } from "@/components/FileField";
import { DesignPanel } from "@/components/agreement-builder/DesignPanel";

/**
 * The agreement template builder, shared by the student and staff template
 * forms: import from Word, the wording in the editor, the Page & theme panel,
 * and a preview of the PDF. Puts `wording` and `design` into the enclosing
 * form for its server action; the form keeps its own name, signatory and
 * destination fields, which the preview reads from it.
 */
export function TemplateBuilder({
  kind,
  initialWording,
  initialDesign,
  mergeFields,
  onBlockedChange,
  importHint,
}: {
  kind: "student" | "staff";
  initialWording: string;
  initialDesign: Theme | null;
  mergeFields: { key: string; label: string }[];
  /** Whether the chosen .docx cannot be submitted (too large, still uploading). */
  onBlockedChange?: (blocked: boolean) => void;
  importHint?: string;
}) {
  const [wording, setWording] = useState(initialWording);
  const [design, setDesign] = useState<Theme | null>(initialDesign);
  const [tab, setTab] = useState<"write" | "design">("write");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [installments, setInstallments] = useState("2");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Let go of the last preview's PDF when another replaces it or the page goes.
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  useEffect(() => {
    if (!previewUrl) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setPreviewUrl(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [previewUrl]);

  async function handleFile(file: File | null) {
    if (!file || !file.name.toLowerCase().endsWith(".docx")) return;
    setImporting(true);
    setImportError(null);
    setNotes([]);
    try {
      const result = await importDocxTemplate(file, { feeTable: kind === "student" });
      if (kind === "staff") result.theme.header.title = "";
      setWording(result.html);
      setDesign(result.theme);
      setNotes(result.notes);
    } catch {
      setImportError("Couldn't read that .docx file — you can still type or paste the wording below.");
    } finally {
      setImporting(false);
    }
  }

  async function preview() {
    const form = root.current?.closest("form");
    const data = form ? new FormData(form) : new FormData();
    setPreviewing(true);
    setPreviewError(null);
    try {
      const designJson = design ? JSON.stringify(design) : "";
      const result =
        kind === "student"
          ? await previewAgreementTemplate({
              wording,
              design: designJson,
              destinationId: String(data.get("destination_id") ?? ""),
              serviceType: String(data.get("service_type") ?? "full"),
              signatoryName: String(data.get("signatory_name") ?? ""),
              installments: Number(installments),
            })
          : await previewStaffAgreementTemplate({
              wording,
              design: designJson,
              name: String(data.get("name") ?? ""),
              signatoryName: String(data.get("signatory_name") ?? ""),
            });
      if (result.error !== undefined) {
        setPreviewError(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0));
      setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch {
      setPreviewError("The preview could not be made. Try again in a moment.");
    } finally {
      setPreviewing(false);
    }
  }

  const tabClass = (on: boolean) =>
    `rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${on ? "border-border bg-card font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`;

  return (
    <div ref={root} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">
          {importHint ??
            "Import a Word document (.docx): its wording comes across with its fonts, colours, headings, bullets and tables, and Page & theme is set to match it. Or type and format the wording below."}
        </label>
        {/* Only a file within the limit is read — extracting the wording from
            an oversized .docx would work and then be refused on submit, which
            reads as the upload having succeeded. */}
        <FileField
          accept=".docx"
          noun="template"
          hint="Word .docx"
          inputClassName="text-sm"
          onChange={(s) => {
            onBlockedChange?.(Boolean(s.error) || s.busy);
            void handleFile(s.error ? null : s.file);
          }}
        />
        {importing && <p className="text-xs text-muted">Reading document…</p>}
        {importError && <p className="text-xs text-danger">{importError}</p>}
        {notes.length > 0 && (
          <div role="status" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-ink">
            <p className="font-medium">Imported. Check it with Preview PDF, then save.</p>
            <ul className="mt-1 list-disc pl-5">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border">
        <div className="flex gap-1" role="tablist" aria-label="Template builder">
          <button type="button" role="tab" aria-selected={tab === "write"} className={tabClass(tab === "write")} onClick={() => setTab("write")}>
            Wording
          </button>
          <button type="button" role="tab" aria-selected={tab === "design"} className={tabClass(tab === "design")} onClick={() => setTab("design")}>
            Page &amp; theme{design ? "" : " (Classic)"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1">
          {kind === "student" && (
            <select
              aria-label="Payment chart in the preview"
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs text-ink"
            >
              <option value="1">Preview: fee in one go</option>
              <option value="2">Preview: two installments</option>
              <option value="3">Preview: three installments</option>
            </select>
          )}
          <button
            type="button"
            onClick={preview}
            disabled={previewing}
            aria-busy={previewing || undefined}
            className="h-8 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {previewing ? "Making the PDF…" : "Preview PDF"}
          </button>
        </div>
      </div>
      {previewError && <p className="text-xs text-danger">{previewError}</p>}

      {/* Both stay mounted, so switching tabs keeps the editor's undo history
          and both hidden fields stay in the form. */}
      <div role="tabpanel" hidden={tab !== "write"}>
        <p className="mb-2 text-xs text-muted">
          {kind === "student" ? (
            <>
              Wherever the fee, installments and discount should appear, click <strong>+ Payment Chart</strong> — don&apos;t type your own
              table of sample numbers, since only the chart fills in each student&apos;s actual figures.{" "}
            </>
          ) : null}
          Use <strong>+ Insert field</strong> for anything that differs per person; it is filled in when the agreement is generated.
        </p>
        <RichTextEditor
          name="wording"
          content={wording}
          onChangeHtml={setWording}
          paymentChart={kind === "student"}
          theme={design}
          mergeFields={mergeFields}
          headerTitle={kind === "student" ? "Retainer Agreement" : "Staff Agreement"}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "design"}>
        <DesignPanel value={design} onChange={setDesign} kind={kind} />
      </div>
      {kind === "student" && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Available merge fields</summary>
          <ul className="mt-1 list-disc pl-5">
            {mergeFields.map((f) => (
              <li key={f.key}>
                <code>{`{{${f.key}}}`}</code> — {f.label}
              </li>
            ))}
          </ul>
        </details>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Preview of the agreement PDF">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-t-md bg-card px-3 py-2">
            <p className="text-sm font-medium text-ink">Preview — a sample {kind === "student" ? "student" : "staff member"}; nothing is saved</p>
            <div className="flex items-center gap-2">
              <a href={previewUrl} download="agreement-preview.pdf" className="rounded-md border border-border px-3 py-1 text-sm text-ink hover:bg-bg">
                Download
              </a>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-ink"
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
          <iframe title="Agreement preview" src={previewUrl} className="mx-auto h-full w-full max-w-5xl rounded-b-md bg-white" />
        </div>
      )}
    </div>
  );
}
