"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, ImageUp, PenLine, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cleanSignature, cropDrawnSignature, type Rgba } from "@/lib/signatureCleanup";

/** A signature ready to go into the agreement: a transparent PNG, and its size in pixels. */
export type CapturedSignature = { file: File; url: string; width: number; height: number };

/** The longest side a photo is read at: plenty for a signature, quick to clean. */
const READ_AT = 1600;
/** The widest a finished signature is kept: sharp in the PDF, small to send. */
const KEEP_AT = 1200;
const INK = "#111827";

/** The pixels as a PNG, shrunk to KEEP_AT wide if it is wider. */
async function toPng(image: Rgba): Promise<CapturedSignature> {
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  source.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  const scale = Math.min(1, KEEP_AT / image.width);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(image.width * scale));
  out.height = Math.max(1, Math.round(image.height * scale));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The signature could not be saved.");
  const file = new File([blob], "signature.png", { type: "image/png" });
  return { file, url: URL.createObjectURL(file), width: out.width, height: out.height };
}

/** A chosen photo's pixels, read at READ_AT on its longest side. */
async function readPhoto(file: File): Promise<Rgba> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("unreadable"));
      el.src = url;
    });
    const scale = Math.min(1, READ_AT / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data: data.data, width: data.width, height: data.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The pad: a signature drawn with a finger, a pen or the mouse. */
function DrawPad({ onDrawn, disabled }: { onDrawn: (image: Rgba | null) => void; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Sized to its box at the screen's own resolution, so the line is crisp.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    const rect = el.getBoundingClientRect();
    el.width = Math.round(rect.width * ratio);
    el.height = Math.round(rect.height * ratio);
    const ctx = el.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const finish = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const el = canvas.current;
    if (!el) return;
    const data = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
    onDrawn({ data: data.data, width: data.width, height: data.height });
  }, [onDrawn]);

  function clear() {
    const el = canvas.current;
    if (!el) return;
    el.getContext("2d")!.clearRect(0, 0, el.width, el.height);
    setEmpty(true);
    onDrawn(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-lg border-2 border-dashed border-border bg-white">
        <canvas
          ref={canvas}
          className="block h-44 w-full touch-none cursor-crosshair rounded-lg"
          aria-label="Draw your signature here"
          data-signature-pad
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = point(e);
            setEmpty(false);
            const ctx = canvas.current!.getContext("2d")!;
            const p = last.current;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
            ctx.fillStyle = INK;
            ctx.fill();
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const ctx = canvas.current!.getContext("2d")!;
            const p = point(e);
            // A pen pressing harder draws a little thicker; a mouse a steady line.
            ctx.lineWidth = e.pointerType === "pen" && e.pressure > 0 ? 1.4 + e.pressure * 2.4 : 2.6;
            const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={finish}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">Sign here</span>
        )}
        <span aria-hidden className="pointer-events-none absolute bottom-9 left-6 right-6 border-b border-gray-300" />
      </div>
      <button type="button" onClick={clear} disabled={disabled || empty} className="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-40">
        <Eraser aria-hidden className="h-3.5 w-3.5" />
        Clear and start again
      </button>
    </div>
  );
}

/**
 * The student's signature, given in the portal: drawn on the pad, or a photo
 * of it signed on paper, with the paper taken out automatically
 * (src/lib/signatureCleanup.ts) and a slider for how strongly. Whichever it
 * is comes out as a transparent PNG, shown on a checked background so the
 * student sees exactly what will be placed in the agreement.
 */
export function SignatureCapture({ onSignature, disabled }: { onSignature: (sig: CapturedSignature) => void; disabled?: boolean }) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [drawn, setDrawn] = useState<Rgba | null>(null);
  const [photo, setPhoto] = useState<Rgba | null>(null);
  const [strength, setStrength] = useState(0.5);
  const [ownError, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The photo, cleaned — again whenever the slider moves.
  const cleaning = useMemo(() => {
    if (!photo) return null;
    const result = cleanSignature(photo, { strength });
    if (!result.ok) return { error: result.error };
    const canvas = document.createElement("canvas");
    canvas.width = result.image.width;
    canvas.height = result.image.height;
    canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(result.image.data), result.image.width, result.image.height), 0, 0);
    return { url: canvas.toDataURL("image/png"), image: result.image };
  }, [photo, strength]);
  const cleaned = cleaning && "image" in cleaning ? cleaning : null;
  const error = ownError ?? (mode === "upload" && cleaning && "error" in cleaning ? cleaning.error : null);

  async function choosePhoto(file: File | null) {
    setError(null);
    setPhoto(null);
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      setError("Choose a photo of your signature — a JPG or PNG.");
      return;
    }
    setBusy(true);
    try {
      setPhoto(await readPhoto(file));
    } catch {
      setError("That photo could not be opened here. Take it again as a JPG (or screenshot it) and choose that.");
    } finally {
      setBusy(false);
    }
  }

  async function use() {
    setError(null);
    const source = mode === "draw" ? (drawn ? cropDrawnSignature(drawn) : null) : (cleaned?.image ?? null);
    if (!source) {
      setError(mode === "draw" ? "Draw your signature in the box first." : "Choose a photo of your signature first.");
      return;
    }
    setBusy(true);
    try {
      onSignature(await toPng(source));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The signature could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const ready = mode === "draw" ? Boolean(drawn) : Boolean(cleaned);

  return (
    <div className="flex flex-col gap-3" data-signature-capture>
      <div role="tablist" aria-label="How to give your signature" className="inline-flex w-fit rounded-lg border border-border bg-bg p-0.5">
        {(
          [
            ["draw", "Draw it", PenLine],
            ["upload", "Upload a photo", ImageUp],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => {
              setMode(key);
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
            data-signature-mode={key}
          >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {mode === "draw" ? (
        <>
          <p className="text-xs text-muted">Sign in the box with your finger, a stylus or the mouse — as you sign on paper.</p>
          <DrawPad onDrawn={setDrawn} disabled={disabled} />
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            Sign on plain white paper in dark ink, take a close-up photo in good light, and choose it here. The paper is taken
            out automatically, so only your signature goes into the agreement.
          </p>
          <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink hover:border-primary">
            <ImageUp aria-hidden className="h-3.5 w-3.5" />
            {photo ? "Choose another photo" : "Choose a photo"}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={disabled || busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void choosePhoto(f);
              }}
              data-signature-photo-input
            />
          </label>
          {cleaned && (
            <div className="flex flex-col gap-2">
              <div
                className="flex h-36 items-center justify-center rounded-lg border border-border p-3"
                // A checked background: what is clear shows as clear.
                style={{ backgroundImage: "repeating-conic-gradient(#f1f1f1 0% 25%, #ffffff 0% 50%)", backgroundSize: "16px 16px" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a page image */}
                <img src={cleaned.url} alt="Your signature, with the background removed" className="max-h-full max-w-full object-contain" data-signature-cleaned />
              </div>
              <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
                Clean-up
                <span>lighter</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  className="w-40 accent-[var(--primary)]"
                  aria-label="How strongly the background is removed"
                />
                <span>stronger</span>
                <button type="button" onClick={() => setStrength(0.5)} className="inline-flex items-center gap-1 hover:text-ink" title="Back to the usual">
                  <RotateCcw aria-hidden className="h-3 w-3" />
                </button>
              </label>
              <p className="text-[11px] text-muted">Move it towards stronger if shadows or specks show, towards lighter if parts of your signature fade.</p>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-bg px-2 py-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <Button type="button" variant="primary" size="sm" onClick={() => void use()} disabled={disabled || busy || !ready} pending={busy} data-signature-use>
        Use this signature
      </Button>
    </div>
  );
}
