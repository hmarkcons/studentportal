"use client";

import { useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, fileSizeError, formatFileSize, limitHint, reduceHint, shrunkNote } from "@/lib/fileSize";
import { shrinkImageToFit } from "./shrinkImage";

export type FileFieldState = {
  /** The chosen file, after any shrinking. Null when nothing valid is chosen. */
  file: File | null;
  error: string | null;
  note: string | null;
  busy: boolean;
};

/**
 * A file input that says the limit up front and refuses an oversized file
 * before it is sent.
 *
 * The limit used to be checked only on the server — which meant a student on
 * a phone uploaded six megabytes over a mobile connection and was then told it
 * was too big. Here the answer is immediate, and a photo is shrunk to fit
 * rather than refused.
 *
 * The shrunk file is put back into the input through a DataTransfer, so the
 * form that contains this posts the smaller file without knowing anything
 * about it. The server still enforces the same limit — a client check is a
 * courtesy, not a control.
 */
export function FileField({
  name = "file",
  accept,
  capture,
  required,
  limitBytes = MAX_UPLOAD_BYTES,
  noun = "document",
  hint,
  className = "",
  inputClassName = "text-xs",
  onChange,
  disabled,
}: {
  name?: string;
  accept?: string;
  capture?: "environment" | "user";
  required?: boolean;
  limitBytes?: number;
  /** What this is, for the error wording: "document", "photo", "file". */
  noun?: string;
  /** What is accepted, said in words — shown before the limit. */
  hint?: string;
  className?: string;
  inputClassName?: string;
  /** Told whenever the usable file changes, so a parent can gate its submit. */
  onChange?: (state: FileFieldState) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function report(state: FileFieldState) {
    setError(state.error);
    setNote(state.note);
    setBusy(state.busy);
    onChange?.(state);
  }

  /** Puts a replacement file back into the input so the form posts that one. */
  function swapIn(file: File) {
    const input = inputRef.current;
    if (!input || typeof DataTransfer === "undefined") return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      return input.files[0]?.size === file.size;
    } catch {
      return false;
    }
  }

  async function handle(chosen: File | null) {
    if (!chosen) {
      report({ file: null, error: null, note: null, busy: false });
      return;
    }

    const tooLarge = fileSizeError(chosen.size, limitBytes, noun);
    if (!tooLarge) {
      report({ file: chosen, error: null, note: null, busy: false });
      return;
    }

    report({ file: null, error: null, note: `Reducing ${formatFileSize(chosen.size)}…`, busy: true });
    const result = await shrinkImageToFit(chosen, limitBytes);

    if (result.ok && swapIn(result.file)) {
      report({ file: result.file, error: null, note: shrunkNote(result.from, result.to, limitBytes), busy: false });
      return;
    }

    // Either it is not an image, the browser could not decode it, or it would
    // not come under the limit however hard it was squeezed. In every case the
    // file stays in the input so the person can see what they picked, and the
    // parent is told there is nothing usable.
    const advice = result.ok
      ? null
      : result.reason === "still_too_large"
        ? `Even fully compressed it is ${formatFileSize(result.smallest)}. Crop it, or photograph one page at a time.`
        : reduceHint(chosen.type, chosen.name);
    report({
      file: null,
      error: [tooLarge, advice].filter(Boolean).join(" "),
      note: null,
      busy: false,
    });
  }

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        capture={capture}
        required={required}
        disabled={disabled || busy}
        onChange={(e) => void handle(e.target.files?.[0] ?? null)}
        className={`max-w-full ${inputClassName}`}
      />
      {/* Said before a file is chosen, not only after one is refused. */}
      <p className="text-[11px] text-muted">{hint ? `${hint} · ${limitHint(limitBytes)}` : limitHint(limitBytes)}</p>
      {note && <p className="text-[11px] text-muted">{note}</p>}
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-bg px-2 py-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
