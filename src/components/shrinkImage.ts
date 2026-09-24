"use client";

import { isShrinkableImage } from "@/lib/fileSize";

/**
 * Makes an oversized photo fit, in the browser, before it is sent.
 *
 * A phone photo of a document can be 3-8 MB off the camera, over the 5 MB
 * limit. Refusing it outright would be technically correct and practically a
 * support queue, and shrinking it unasked would change someone's file behind
 * their back. So the person is told its size and offered "Shrink to fit"
 * (FileField, SubmitSignedAgreementForm), and this runs only when they choose
 * it.
 *
 * Only photos. A PDF cannot be made smaller without rewriting its contents,
 * and silently re-encoding a legal document is not something to do behind
 * someone's back — those are refused with a red error, which is what the
 * office asked for.
 *
 * Quality before dimensions: a 4000px photo re-encoded at 70% is still a
 * perfectly readable passport page, whereas halving the dimensions is what
 * makes small print unreadable. Dimensions only come down once quality alone
 * has not been enough.
 */

const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5, 0.4];
/** Below this, a scan of printed text starts losing small print. */
const MIN_EDGE = 1400;

async function loadBitmap(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource } | null> {
  // createImageBitmap is the cheap path and handles EXIF orientation on every
  // browser that has it; <img> is the fallback for those that do not.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { width: bitmap.width, height: bitmap.height, draw: bitmap };
    } catch {
      // Falls through — an unreadable format lands here (HEIC, mostly).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || !img.naturalWidth) return null;
    return { width: img.naturalWidth, height: img.naturalHeight, draw: img };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/** The filename it should carry once it is a JPEG. */
function jpegName(name: string): string {
  return name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
}

export type ShrinkResult =
  | { ok: true; file: File; from: number; to: number }
  /** Not an image, or an image this browser cannot decode. */
  | { ok: false; reason: "unsupported" }
  /** An image, decoded, but it would not come under the limit. */
  | { ok: false; reason: "still_too_large"; smallest: number };

export async function shrinkImageToFit(file: File, limitBytes: number): Promise<ShrinkResult> {
  if (!isShrinkableImage(file.type, file.name)) return { ok: false, reason: "unsupported" };

  const source = await loadBitmap(file);
  if (!source) return { ok: false, reason: "unsupported" };

  let width = source.width;
  let height = source.height;
  let smallest = Number.POSITIVE_INFINITY;

  // Up to four passes: the same quality ladder at progressively smaller
  // dimensions. In practice a phone photo is done on the first or second try.
  for (let pass = 0; pass < 4; pass++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "unsupported" };
    // White behind it, or a transparent PNG becomes black once it is a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source.draw, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITY_STEPS) {
      const blob = await encode(canvas, quality);
      if (!blob) return { ok: false, reason: "unsupported" };
      smallest = Math.min(smallest, blob.size);
      if (blob.size <= limitBytes) {
        return {
          ok: true,
          file: new File([blob], jpegName(file.name), { type: "image/jpeg", lastModified: Date.now() }),
          from: file.size,
          to: blob.size,
        };
      }
    }

    if (Math.min(width, height) <= MIN_EDGE) break;
    width *= 0.75;
    height *= 0.75;
    if (Math.min(width, height) < MIN_EDGE) {
      const scale = MIN_EDGE / Math.min(width, height);
      width *= scale;
      height *= scale;
    }
  }

  return { ok: false, reason: "still_too_large", smallest: Number.isFinite(smallest) ? smallest : file.size };
}
