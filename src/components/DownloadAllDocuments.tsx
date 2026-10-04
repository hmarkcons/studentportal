"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { documentDownloadLinks } from "@/lib/actions/documentDownload";
import { PICTURE_EXTENSIONS, extensionForType, zipPaths, type ZipEntry } from "@/lib/documentZip";
import { jpegToPdf } from "@/lib/jpegPdf";

export type DownloadSection = { number: number; label: string; docs: { id: string; name: string }[] };

/** Files fetched at once: enough to keep the line busy, few enough not to queue behind each other. */
const AT_ONCE = 4;
/** A picture's longest side once on its page: A4 at 300 dpi, plenty for a scan and a fraction of a phone photo's bytes. */
const LONGEST_SIDE = 3508;

/**
 * A picture as a JPEG, through a canvas: any type the browser can open, turned
 * the way the camera held it, on white where it was transparent. Null for one
 * the browser cannot open — an iPhone's HEIC outside Safari — which then goes
 * into the ZIP as it was uploaded.
 */
async function pictureAsJpeg(blob: Blob): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const shrink = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * shrink));
  const height = Math.max(1, Math.round(bitmap.height * shrink));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!jpeg) return null;
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width, height };
}

/**
 * "Download all": every uploaded document in the sections shown, as one ZIP —
 * a folder per section, numbered as on the page, and each file named after its
 * checklist item rather than whatever it was called when uploaded. Pictures
 * become one-page PDFs; a PDF stays as it is; a Word file or a HEIC photo goes
 * in as uploaded, under the item's name.
 *
 * Built here in the browser from fresh links (documentDownloadLinks): a ZIP of
 * a student's whole file is tens of megabytes, more than a server function may
 * send in one answer. A file that cannot be fetched is named in
 * "Not included.txt" inside the ZIP, and here.
 */
export function DownloadAllDocuments({
  studentId,
  zipName,
  sections,
}: {
  studentId: string;
  zipName: string;
  sections: DownloadSection[];
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const items = sections.flatMap((s) => s.docs.map((d) => ({ ...d, section: s })));

  async function download() {
    if (progress || items.length === 0) return;
    setMessage(null);
    setProgress({ done: 0, total: items.length });
    try {
      const links = await documentDownloadLinks(
        studentId,
        items.map((i) => i.id)
      );
      if ("error" in links) {
        setMessage({ tone: "error", text: links.error });
        return;
      }
      const byId = new Map(links.files.map((f) => [f.id, f]));

      const got: ({ entry: ZipEntry; bytes: Uint8Array } | null)[] = new Array(items.length).fill(null);
      const missed: string[] = [];
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (next < items.length) {
          const i = next++;
          const item = items[i];
          const where = `${item.section.label} — ${item.name}`;
          const link = byId.get(item.id);
          try {
            if (!link) throw new Error("the file is no longer on record");
            const res = await fetch(link.url);
            if (!res.ok) throw new Error(`the file could not be fetched (${res.status})`);
            const blob = await res.blob();
            let ext = link.ext || extensionForType(blob.type);
            let bytes: Uint8Array | null = null;
            if (PICTURE_EXTENSIONS.includes(ext)) {
              const jpeg = await pictureAsJpeg(blob);
              if (jpeg) {
                bytes = jpegToPdf(jpeg.bytes, jpeg.width, jpeg.height);
                ext = "pdf";
              }
            }
            bytes ??= new Uint8Array(await blob.arrayBuffer());
            got[i] = { entry: { sectionNumber: item.section.number, sectionLabel: item.section.label, name: item.name, ext }, bytes };
          } catch (e) {
            missed.push(`${where}: ${e instanceof Error ? e.message : "it could not be fetched"}`);
          }
          done += 1;
          setProgress({ done, total: items.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker));

      const kept = got.filter((g): g is { entry: ZipEntry; bytes: Uint8Array } => g !== null);
      if (kept.length === 0) {
        setMessage({ tone: "error", text: `Nothing could be downloaded. ${missed.join(" ")}` });
        return;
      }
      const { zipSync, strToU8 } = await import("fflate");
      const paths = zipPaths(kept.map((k) => k.entry));
      // Stored, not compressed: PDFs and pictures are compressed already, and
      // squeezing them again would take time for nothing.
      const files: Record<string, [Uint8Array, { level: 0 }]> = {};
      kept.forEach((k, i) => {
        files[paths[i]] = [k.bytes, { level: 0 }];
      });
      if (missed.length > 0) {
        files["Not included.txt"] = [strToU8(`These documents could not be downloaded:\r\n\r\n${missed.join("\r\n")}\r\n`), { level: 0 }];
      }
      const zip = zipSync(files);
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(
        missed.length > 0
          ? { tone: "error", text: `Downloaded ${kept.length} of ${items.length}. Not included: ${missed.join("; ")}.` }
          : { tone: "ok", text: `Downloaded ${kept.length} document${kept.length === 1 ? "" : "s"}.` }
      );
    } catch (e) {
      setMessage({ tone: "error", text: `The download stopped: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1" data-download-all>
      <button
        type="button"
        onClick={download}
        disabled={Boolean(progress) || items.length === 0}
        title={items.length === 0 ? "Nothing has been uploaded yet." : "Every uploaded document, a folder per section, as one ZIP"}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-ink hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        data-download-all-button
      >
        <Download aria-hidden className="h-3.5 w-3.5" />
        {progress
          ? `Preparing ${progress.done} of ${progress.total}…`
          : `Download all${items.length > 0 ? ` (${items.length})` : ""}`}
      </button>
      {message && (
        <p role="status" className={`text-xs ${message.tone === "ok" ? "text-success" : "text-danger"}`} data-download-all-message>
          {message.text}
        </p>
      )}
    </div>
  );
}
