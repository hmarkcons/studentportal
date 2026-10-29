"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { combineIntoPdf } from "@/lib/combinePdf";
import { safeName, extensionForType } from "@/lib/documentZip";
import { documentDownloadLinks } from "@/lib/actions/documentDownload";
import { studentDocumentDownloadLinks } from "@/lib/actions/studentDocumentDownload";

export type SectionDoc = { id: string; name: string; files?: number };

/** Types that can become a page of a merged PDF (pdf as-is, pictures rasterized). */
const MERGEABLE = ["pdf", "jpg", "jpeg", "png", "webp"];
/** A generous ceiling — well above any plausible section, so size never fails the merge. */
const LIMIT_BYTES = 150 * 1024 * 1024;

/**
 * Per-section "Download as PDF": a button that opens the section's uploaded
 * documents as a checklist (all ticked), and combines the chosen ones into a
 * single PDF in the browser — photos become pages, PDFs are joined page for
 * page. Word and HEIC files cannot go into a PDF, so they are listed as left
 * out rather than failing the whole download.
 *
 * `mode` picks the server action that mints the fresh links: the staff one
 * (studentId + processing-team gate) or the student one (their own record).
 * The merge itself reuses combineIntoPdf, as the upload path does.
 */
export function DownloadSectionPdf({
  studentId,
  label,
  docs,
  fileName,
  mode,
}: {
  studentId: string;
  label: string;
  docs: SectionDoc[];
  fileName: string;
  mode: "staff" | "student";
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(docs.map((d) => d.id)));
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (docs.length === 0) return null;

  const openDialog = () => {
    setSelected(new Set(docs.map((d) => d.id)));
    setMessage(null);
    setOpen(true);
  };

  const closeDialog = () => {
    if (!busy) setOpen(false);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function download() {
    const ids = docs.filter((d) => selected.has(d.id)).map((d) => d.id);
    if (busy || ids.length === 0) return;
    setMessage(null);
    setBusy({ done: 0, total: ids.length });
    try {
      const links = mode === "staff" ? await documentDownloadLinks(studentId, ids) : await studentDocumentDownloadLinks(ids);
      if ("error" in links) {
        setMessage({ tone: "error", text: links.error });
        return;
      }

      // Group the fetched files by requirement (a requirement may hold several,
      // 0328), keeping the section's own document order.
      const byDoc = new Map<string, typeof links.files>();
      for (const f of links.files) byDoc.set(f.id, [...(byDoc.get(f.id) ?? []), f]);
      const nameById = new Map(docs.map((d) => [d.id, d.name]));
      const ordered = ids.flatMap((id) => (byDoc.get(id) ?? []).map((link) => ({ link, docName: nameById.get(id) ?? "Document" })));

      setBusy({ done: 0, total: ordered.length });
      const mergeFiles: File[] = [];
      const excluded: string[] = [];
      let done = 0;
      for (const { link, docName } of ordered) {
        try {
          const res = await fetch(link.url);
          if (!res.ok) throw new Error(`could not be fetched (${res.status})`);
          const blob = await res.blob();
          const ext = (link.ext || extensionForType(blob.type)).toLowerCase();
          if (MERGEABLE.includes(ext)) {
            mergeFiles.push(new File([blob], `${safeName(docName)}.${ext}`, { type: blob.type || undefined }));
          } else {
            excluded.push(`${docName}${ext ? ` (.${ext})` : ""}`);
          }
        } catch (e) {
          excluded.push(`${docName}: ${e instanceof Error ? e.message : "could not be fetched"}`);
        }
        done += 1;
        setBusy({ done, total: ordered.length });
      }

      if (mergeFiles.length === 0) {
        setMessage({
          tone: "error",
          text: excluded.length
            ? `None of the selected documents can be put into a PDF (Word and HEIC files can't be merged): ${excluded.join("; ")}.`
            : "Nothing could be downloaded.",
        });
        return;
      }

      const result = await combineIntoPdf(mergeFiles, { limitBytes: LIMIT_BYTES });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }

      const url = URL.createObjectURL(result.file);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage({
        tone: excluded.length ? "error" : "ok",
        text: excluded.length
          ? `Downloaded ${mergeFiles.length} document${mergeFiles.length === 1 ? "" : "s"} as one PDF. Left out (can't go in a PDF): ${excluded.join("; ")}.`
          : `Downloaded ${mergeFiles.length} document${mergeFiles.length === 1 ? "" : "s"} as one PDF.`,
      });
    } catch (e) {
      setMessage({ tone: "error", text: `The download stopped: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-ink hover:border-primary"
        title="Combine this section's documents into one PDF"
        data-section-download
      >
        <FileDown aria-hidden className="h-3.5 w-3.5" />
        Download as PDF
      </button>

      <Modal open={open} onClose={closeDialog} title={`Download — ${label}`}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            Choose the documents to include — they&rsquo;ll be combined into a single PDF (photos become pages). Word and
            HEIC files can&rsquo;t be merged into a PDF and will be left out.
          </p>

          <div className="flex items-center justify-between">
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setSelected(new Set(docs.map((d) => d.id)))}>
              Select all
            </button>
            <button type="button" className="text-xs font-medium text-muted hover:underline" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>

          <ul className="flex max-h-[45vh] flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 px-3 py-2">
                <input
                  id={`dl-${d.id}`}
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                  disabled={Boolean(busy)}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <label htmlFor={`dl-${d.id}`} className="min-w-0 flex-1 truncate text-sm text-ink">
                  {d.name}
                </label>
                {d.files && d.files > 1 ? <span className="shrink-0 text-xs text-muted">{d.files} files</span> : null}
              </li>
            ))}
          </ul>

          {message && (
            <p role="status" className={`text-xs ${message.tone === "ok" ? "text-success" : "text-danger"}`} data-section-download-message>
              {message.text}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={download} disabled={Boolean(busy) || selected.size === 0}>
              {busy ? `Preparing ${busy.done}/${busy.total}…` : `Download PDF${selected.size ? ` (${selected.size})` : ""}`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
