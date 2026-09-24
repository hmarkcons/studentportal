"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, fileSizeError, formatFileSize, isShrinkableImage, limitHint, reduceHint, shrunkNote } from "@/lib/fileSize";
import { stageFile } from "@/lib/stageFile";
import { shrinkImageToFit } from "./shrinkImage";

export type FileFieldState = {
  /** The chosen file once it is uploaded and ready to submit. Null otherwise. */
  file: File | null;
  error: string | null;
  note: string | null;
  /** Uploading or shrinking — the form should not be submitted yet. */
  busy: boolean;
};

/**
 * A file input that says the limit up front, refuses an oversized file before
 * it is sent, and sends the file straight to storage.
 *
 * The file goes from the browser into a staging bucket the moment it is
 * chosen, and the form posts only a reference to it (src/lib/stagedUpload.ts).
 * A Vercel Function refuses any request over 4.5 MB, so this is the only way a
 * 5 MB document can arrive at all — and it means a slow connection uploads
 * while the person carries on filling the form, not after they press Submit.
 *
 * An oversized photo is not shrunk behind anyone's back: the person is told
 * its size and offered "Shrink to fit", and chooses. A PDF or Word file cannot
 * be made smaller here, so they are told how to reduce it themselves.
 *
 * The server still enforces the same limit, and the staging bucket enforces
 * it again in Storage — a client check is a courtesy, not a control.
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
  /** What the form posts under `name`: the staged file's reference. */
  const [staged, setStaged] = useState<string | null>(null);
  /** An oversized photo the person may choose to shrink. */
  const [shrinkable, setShrinkable] = useState<File | null>(null);
  /** A file whose upload failed, for "Try again". */
  const [retry, setRetry] = useState<File | null>(null);
  const busyRef = useRef(false);
  // Which pick is current: a slow upload finishing after a newer pick must not
  // overwrite it.
  const pickRef = useRef(0);
  // A submit pressed mid-upload, sent as soon as the upload lands. Undefined
  // when none is waiting; null when it came from something other than a button.
  const heldSubmit = useRef<HTMLElement | null | undefined>(undefined);

  function report(state: FileFieldState) {
    setError(state.error);
    setNote(state.note);
    setBusy(state.busy);
    busyRef.current = state.busy;
    onChange?.(state);
  }

  // A form submitted mid-upload would post no file. Hold the submit, and send
  // it the moment the upload lands, so pressing Submit early is not a click
  // lost. Registered on the form itself, so it runs before React's own
  // handler for the form's action.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    function hold(e: Event) {
      if (!busyRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      heldSubmit.current = (e as SubmitEvent).submitter ?? null;
      setNote("Uploading — it will be sent as soon as the upload finishes.");
    }
    // A reset form must not keep posting the file it has already sent.
    function cleared() {
      heldSubmit.current = undefined;
      setStaged(null);
      setShrinkable(null);
      setRetry(null);
      report({ file: null, error: null, note: null, busy: false });
    }
    form.addEventListener("submit", hold);
    form.addEventListener("reset", cleared);
    return () => {
      form.removeEventListener("submit", hold);
      form.removeEventListener("reset", cleared);
    };
    // report and onChange are read at call time; the form is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(file: File, pick: number, doneNote: string | null = null) {
    setShrinkable(null);
    setRetry(null);
    report({ file: null, error: null, note: `Uploading ${formatFileSize(file.size)}…`, busy: true });
    const result = await stageFile(file);
    if (pick !== pickRef.current) return;
    if (!result.ok) {
      // A held submit is dropped: sending the form now would post no file.
      heldSubmit.current = undefined;
      setStaged(null);
      setRetry(file);
      report({ file: null, error: result.error, note: null, busy: false });
      return;
    }
    setStaged(result.ref);
    report({ file, error: null, note: doneNote ?? `Uploaded · ${formatFileSize(file.size)}`, busy: false });
  }

  // Sends a submit that was held for the upload — here, after the commit, so
  // the hidden field already carries the reference when the form is read.
  useEffect(() => {
    const submitter = heldSubmit.current;
    if (!staged || submitter === undefined) return;
    heldSubmit.current = undefined;
    const form = inputRef.current?.form;
    if (!form) return;
    if (submitter && form.contains(submitter)) form.requestSubmit(submitter as HTMLButtonElement);
    else form.requestSubmit();
  }, [staged]);

  async function handle(chosen: File | null) {
    const pick = ++pickRef.current;
    setStaged(null);
    setShrinkable(null);
    setRetry(null);
    if (!chosen) {
      report({ file: null, error: null, note: null, busy: false });
      return;
    }

    const tooLarge = fileSizeError(chosen.size, limitBytes, noun);
    if (!tooLarge) {
      await upload(chosen, pick);
      return;
    }

    if (isShrinkableImage(chosen.type, chosen.name)) {
      setShrinkable(chosen);
      report({ file: null, error: tooLarge, note: null, busy: false });
      return;
    }
    report({ file: null, error: [tooLarge, reduceHint(chosen.type, chosen.name)].filter(Boolean).join(" "), note: null, busy: false });
  }

  async function shrink() {
    const original = shrinkable;
    if (!original) return;
    const pick = pickRef.current;
    setShrinkable(null);
    report({ file: null, error: null, note: `Shrinking ${formatFileSize(original.size)}…`, busy: true });
    const result = await shrinkImageToFit(original, limitBytes);
    if (pick !== pickRef.current) return;
    if (result.ok) {
      await upload(result.file, pick, shrunkNote(result.from, result.to, limitBytes));
      return;
    }
    const advice =
      result.reason === "still_too_large"
        ? `Even fully compressed it is ${formatFileSize(result.smallest)}. Crop it, or photograph one page at a time.`
        : reduceHint(original.type, original.name);
    report({ file: null, error: [fileSizeError(original.size, limitBytes, noun), advice].filter(Boolean).join(" "), note: null, busy: false });
  }

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      {/* No name: the bytes are never posted. What the form sends is the
          reference below, once the file is in storage. */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        required={required}
        disabled={disabled || busy}
        onChange={(e) => void handle(e.target.files?.[0] ?? null)}
        className={`max-w-full ${inputClassName}`}
        data-staged={staged ? "" : undefined}
      />
      <input type="hidden" name={name} value={staged ?? ""} />
      {/* Said before a file is chosen, not only after one is refused. */}
      <p className="text-[11px] text-muted">{hint ? `${hint} · ${limitHint(limitBytes)}` : limitHint(limitBytes)}</p>
      {note && (
        <p className="text-[11px] text-muted" aria-live="polite">
          {note}
        </p>
      )}
      {error && (
        <div role="alert" className="flex flex-col gap-1.5 rounded-md border border-danger bg-danger-bg px-2 py-1.5 text-xs font-medium text-danger">
          <span>{error}</span>
          {shrinkable && (
            <span className="flex flex-wrap items-center gap-2 font-normal">
              <button
                type="button"
                onClick={() => void shrink()}
                className="w-fit rounded-md border border-danger bg-card px-2 py-0.5 font-medium text-danger hover:bg-danger-bg"
              >
                Shrink to fit
              </button>
              <span>makes the photo smaller so it fits, keeping it readable. Or choose a smaller file.</span>
            </span>
          )}
          {retry && (
            <button
              type="button"
              onClick={() => void upload(retry, pickRef.current)}
              className="w-fit rounded-md border border-danger bg-card px-2 py-0.5 font-medium text-danger hover:bg-danger-bg"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
