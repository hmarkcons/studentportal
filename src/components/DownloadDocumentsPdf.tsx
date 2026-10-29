"use client";

import { useState } from "react";
import { Download, FileDown } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { combineIntoPdf } from "@/lib/combinePdf";
import { safeName, extensionForType } from "@/lib/documentZip";
import { documentDownloadLinks } from "@/lib/actions/documentDownload";
import { studentDocumentDownloadLinks } from "@/lib/actions/studentDocumentDownload";

export type PdfDoc = { id: string; name: string; files?: number };
export type PdfSection = { label: string; docs: PdfDoc[] };

/** Types that can become a page of a merged PDF (pdf as-is, pictures rasterized). */
const MERGEABLE = ["pdf", "jpg", "jpeg", "png", "webp"];
/** A generous ceiling — well above any plausible student, so size never fails the merge. */
const LIMIT_BYTES = 200 * 1024 * 1024;

const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-ink hover:border-primary disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Two ways to take a student's documents away as one PDF, side by side:
 * "Download all" merges every uploaded document, and "Download selected" opens
 * them as a checklist grouped by section so a subset can be chosen. Both
 * combine in the browser — photos become pages, PDFs are joined page for page —
 * reusing combineIntoPdf, as the upload path does. Word and HEIC files cannot
 * go into a PDF, so they are listed as left out rather than failing the whole
 * download. Links are minted fresh at click time (documentDownloadLinks for
 * staff, studentDocumentDownloadLinks for a student's own), so a file replaced
 * since the page loaded is the one saved.
 */
export function DownloadDocumentsPdf({
  studentId,
  sections,
  fileNameBase,
  mode,
}: {
  studentId: string;
  sections: PdfSection[];
  /** Prefixes the file name ("<base> - All documents.pdf"); omitted → just "All documents.pdf". */
  fileNameBase?: string;
  mode: "staff" | "student";
}) {
  const allDocs = sections.flatMap((s) => s.docs);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allDocs.map((d) => d.id)));
  const [busy, setBusy] = useState<{ what: "all" | "selected"; done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (allDocs.length === 0) return null;

  const nameFor = new Map(allDocs.map((d) => [d.id, d.name]));
  const orderedIds = allDocs.map((d) => d.id); // section order, then document order
  const outName = (kind: string) => `${fileNameBase ? `${safeName(fileNameBase)} - ` : ""}${kind} documents.pdf`;

  async function run(what: "all" | "selected", ids: string[], name: string) {
    if (busy || ids.length === 0) return;
    setMessage(null);
    setBusy({ what, done: 0, total: ids.length });
    try {
      const links = mode === "staff" ? await documentDownloadLinks(studentId, ids) : await studentDocumentDownloadLinks(ids);
      if ("error" in links) {
        setMessage({ tone: "error", text: links.error });
        return;
      }

      // Group fetched files by requirement (a requirement may hold several,
      // 0328), keeping the requested order.
      const byDoc = new Map<string, typeof links.files>();
      for (const f of links.files) byDoc.set(f.id, [...(byDoc.get(f.id) ?? []), f]);
      const ordered = ids.flatMap((id) => (byDoc.get(id) ?? []).map((link) => ({ link, docName: nameFor.get(id) ?? "Document" })));

      setBusy({ what, done: 0, total: ordered.length });
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
        setBusy({ what, done, total: ordered.length });
      }

      if (mergeFiles.length === 0) {
        setMessage({
          tone: "error",
          text: excluded.length
            ? `None of these can be put into a PDF (Word and HEIC files can't be merged): ${excluded.join("; ")}.`
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
      a.download = name;
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
      if (what === "selected" && !excluded.length) setOpen(false);
    } catch (e) {
      setMessage({ tone: "error", text: `The download stopped: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }

  const openDialog = () => {
    setSelected(new Set(allDocs.map((d) => d.id)));
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
  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <div className="flex flex-col items-start gap-1" data-download-pdf>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run("all", orderedIds, outName("All"))}
          disabled={Boolean(busy)}
          title="Combine every uploaded document into one PDF"
          className={BTN}
          data-download-all-button
        >
          <Download aria-hidden className="h-3.5 w-3.5" />
          {busy?.what === "all" ? `Preparing ${busy.done}/${busy.total}…` : `Download all (${allDocs.length})`}
        </button>
        <button
          type="button"
          onClick={openDialog}
          disabled={Boolean(busy)}
          title="Choose which documents to combine into one PDF"
          className={BTN}
          data-download-selected-button
        >
          <FileDown aria-hidden className="h-3.5 w-3.5" />
          Download selected…
        </button>
      </div>
      {message && !open && (
        <p role="status" className={`text-xs ${message.tone === "ok" ? "text-success" : "text-danger"}`} data-download-pdf-message>
          {message.text}
        </p>
      )}

      <Modal open={open} onClose={closeDialog} title="Download selected documents">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            Tick the documents to include — they&rsquo;ll be combined into a single PDF (photos become pages). Word and
            HEIC files can&rsquo;t be merged into a PDF and will be left out.
          </p>

          <div className="flex items-center justify-between">
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMany(orderedIds, true)}>
              Select all
            </button>
            <button type="button" className="text-xs font-medium text-muted hover:underline" onClick={() => setMany(orderedIds, false)}>
              Clear
            </button>
          </div>

          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
            {sections.map((section) => {
              const ids = section.docs.map((d) => d.id);
              const allOn = ids.every((id) => selected.has(id));
              return (
                <div key={section.label} className="rounded-md border border-border">
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-bg px-3 py-1.5">
                    <span className="min-w-0 truncate text-xs font-semibold text-ink">{section.label}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                      onClick={() => setMany(ids, !allOn)}
                    >
                      {allOn ? "Clear section" : "Select section"}
                    </button>
                  </div>
                  <ul className="flex flex-col divide-y divide-border">
                    {section.docs.map((d) => (
                      <li key={d.id} className="flex items-center gap-2.5 px-3 py-2">
                        <input
                          id={`dlp-${d.id}`}
                          type="checkbox"
                          checked={selected.has(d.id)}
                          onChange={() => toggle(d.id)}
                          disabled={Boolean(busy)}
                          className="h-4 w-4 shrink-0 accent-primary"
                        />
                        <label htmlFor={`dlp-${d.id}`} className="min-w-0 flex-1 truncate text-sm text-ink">
                          {d.name}
                        </label>
                        {d.files && d.files > 1 ? <span className="shrink-0 text-xs text-muted">{d.files} files</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {message && (
            <p role="status" className={`text-xs ${message.tone === "ok" ? "text-success" : "text-danger"}`}>
              {message.text}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => run("selected", orderedIds.filter((id) => selected.has(id)), outName("Selected"))}
              disabled={Boolean(busy) || selected.size === 0}
            >
              {busy?.what === "selected" ? `Preparing ${busy.done}/${busy.total}…` : `Download PDF${selected.size ? ` (${selected.size})` : ""}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
