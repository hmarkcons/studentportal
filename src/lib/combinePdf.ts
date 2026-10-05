"use client";

import { formatFileSize } from "./fileSize.ts";

/**
 * Several files chosen for one document — a passport's two sides, a
 * transcript photographed page by page, a signed agreement scanned in parts —
 * joined into one PDF in the browser, in the order given, before it is
 * uploaded. Whatever receives it gets one PDF, exactly as if one had been
 * chosen: the checklist, review, versions and "Download all" are unchanged.
 *
 * PDFs are joined page for page. A photo becomes an A4 page of its own —
 * upright or on its side to suit it, turned the way the camera held it, on
 * white — re-encoded as a JPEG small enough to keep the whole within the
 * upload limit. When the result is still too big, the photos are made smaller
 * again, in steps, before giving up; a PDF is never re-encoded.
 *
 * A Word file cannot be joined to anything, and an iPhone's HEIC photo can be
 * opened only by Safari; either is refused with what to do instead.
 */

export type CombineResult = { ok: true; file: File; pages: number } | { ok: false; error: string };

/** A4 in points, and the white border around a photo. */
const A4 = { short: 595.28, long: 841.89 };
const MARGIN = 24;
/** The photo sizes tried, largest first, until the whole fits. */
const PHOTO_STEPS = [
  { longest: 2000, quality: 0.82 },
  { longest: 1600, quality: 0.72 },
  { longest: 1200, quality: 0.62 },
];

type Kind = "pdf" | "picture" | "word" | "other";

function kindOf(file: File): Kind {
  const type = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return "picture";
  if (type.includes("word") || ["doc", "docx"].includes(ext)) return "word";
  return "other";
}

/** A picture, decoded and turned the way the camera held it; null when this browser cannot open it. */
async function openPicture(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

async function pictureJpeg(bitmap: ImageBitmap, longest: number, quality: number): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const shrink = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * shrink));
  const height = Math.max(1, Math.round(bitmap.height * shrink));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the photo.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This browser could not prepare the photo.");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/** The combined file's name: the first file's, marked as joined. */
export function combinedName(files: File[]): string {
  const first = files[0]?.name ?? "document";
  const base = first.replace(/\.[^.]+$/, "") || "document";
  return `${base} (+${files.length - 1} joined).pdf`;
}

/** Why a file cannot be joined, or null when it can. Checked before anything is read. */
export function cannotJoin(file: File): string | null {
  const kind = kindOf(file);
  if (kind === "word") return `${file.name} is a Word file, which cannot be joined to other files. Save it as a PDF first, or upload it on its own.`;
  if (kind === "other") return `${file.name} is not a PDF or a photo, so it cannot be joined to other files.`;
  return null;
}

export async function combineIntoPdf(files: File[], { limitBytes }: { limitBytes: number }): Promise<CombineResult> {
  for (const f of files) {
    const why = cannotJoin(f);
    if (why) return { ok: false, error: why };
  }
  const { PDFDocument } = await import("pdf-lib");

  // Opened once, whatever the number of attempts at a size.
  const opened: ({ kind: "pdf"; bytes: ArrayBuffer } | { kind: "picture"; bitmap: ImageBitmap })[] = [];
  try {
    for (const f of files) {
      if (kindOf(f) === "pdf") {
        opened.push({ kind: "pdf", bytes: await f.arrayBuffer() });
      } else {
        const bitmap = await openPicture(f);
        if (!bitmap) {
          const heic = /\.(heic|heif)$/i.test(f.name) || /heic|heif/i.test(f.type);
          return {
            ok: false,
            error: heic
              ? `${f.name} is an iPhone HEIC photo, which this browser cannot open. Choose it as a JPG instead (on the iPhone: Settings → Camera → Formats → Most Compatible), or upload it on its own.`
              : `${f.name} could not be opened as a photo. Choose another copy of it.`,
          };
        }
        opened.push({ kind: "picture", bitmap });
      }
    }

    const hasPictures = opened.some((o) => o.kind === "picture");
    let last: { bytes: Uint8Array; pages: number } | null = null;
    for (const step of hasPictures ? PHOTO_STEPS : PHOTO_STEPS.slice(0, 1)) {
      const out = await PDFDocument.create();
      for (let i = 0; i < opened.length; i++) {
        const o = opened[i];
        if (o.kind === "pdf") {
          let source;
          try {
            source = await PDFDocument.load(o.bytes);
          } catch (e) {
            const locked = /encrypt/i.test(String((e as Error)?.message ?? e));
            return {
              ok: false,
              error: locked
                ? `${files[i].name} is password-protected, so it cannot be joined. Remove the password, or upload it on its own.`
                : `${files[i].name} could not be read as a PDF. Choose another copy of it.`,
            };
          }
          const pages = await out.copyPages(source, source.getPageIndices());
          for (const p of pages) out.addPage(p);
        } else {
          const jpeg = await pictureJpeg(o.bitmap, step.longest, step.quality);
          const image = await out.embedJpg(jpeg.bytes);
          const landscape = jpeg.width > jpeg.height;
          const pageW = landscape ? A4.long : A4.short;
          const pageH = landscape ? A4.short : A4.long;
          const scale = Math.min((pageW - 2 * MARGIN) / jpeg.width, (pageH - 2 * MARGIN) / jpeg.height);
          const w = jpeg.width * scale;
          const h = jpeg.height * scale;
          out.addPage([pageW, pageH]).drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
        }
      }
      const bytes = await out.save();
      last = { bytes, pages: out.getPageCount() };
      if (bytes.length <= limitBytes) break;
    }

    if (!last || last.bytes.length > limitBytes) {
      return {
        ok: false,
        error: `Joined, these come to ${formatFileSize(last?.bytes.length ?? 0)}, over the ${formatFileSize(limitBytes)} limit${hasPictures ? " even with the photos made smaller" : ""}. Leave a file out, or upload the largest on its own.`,
      };
    }
    return { ok: true, file: new File([last.bytes as BlobPart], combinedName(files), { type: "application/pdf" }), pages: last.pages };
  } finally {
    for (const o of opened) if (o.kind === "picture") o.bitmap.close();
  }
}
