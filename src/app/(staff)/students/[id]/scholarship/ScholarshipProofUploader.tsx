"use client";

import { useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Upload, X } from "lucide-react";
import { stageFile } from "@/lib/stageFile";
import { MAX_UPLOAD_BYTES, fileSizeError, formatFileSize, isShrinkableImage, limitHint, reduceHint } from "@/lib/fileSize";
import { ACCEPTED_DOCUMENT_ACCEPT } from "@/lib/documentUpload";
import { shrinkImageToFit } from "@/components/shrinkImage";
import { toast } from "@/lib/toast";

/** How many staged files one call to the server carries (uploadScholarshipProof). */
const PER_CALL = 8;

type Item = {
  key: number;
  file: File;
  state: "uploading" | "sending" | "error" | "too_large";
  error?: string;
};

export type ProofSender = (
  formData: FormData
) => Promise<{ error?: string | null; success?: boolean; attached?: number; refused?: { name: string; reason: string }[] } | undefined>;

type Staged = { key: number; ref: string; name: string };

/**
 * Several proof files at once: choose them together, or drop them on the box.
 *
 * Each file goes from the browser straight into staging as soon as it is
 * picked (src/lib/stageFile.ts — a Vercel Function refuses any request over
 * 4.5 MB), and the moment a pick has finished staging it is attached, with no
 * second button to find. Files still uploading, and any that were refused, are
 * listed under the box with what happened to them; attached files leave the
 * list and appear in the proof list above it, which is the record.
 *
 * An oversized photo is not shrunk behind anyone's back: it is listed with
 * "Shrink to fit", the same choice the single-file picker offers.
 */
export function ScholarshipProofUploader({ send, disabled = false }: { send: ProofSender; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const nextKey = useRef(0);

  const patch = (key: number, next: Partial<Item> | null) =>
    setItems((all) => (next === null ? all.filter((i) => i.key !== key) : all.map((i) => (i.key === key ? { ...i, ...next } : i))));

  /** Stages one pick's files, then attaches every one that staged. */
  async function take(files: File[]) {
    if (files.length === 0) return;
    const picked: Item[] = files.map((file) => ({ key: nextKey.current++, file, state: "uploading" }));
    setItems((all) => [...all, ...picked]);

    const staged: Staged[] = [];
    await Promise.all(
      picked.map(async (item) => {
        const tooLarge = fileSizeError(item.file.size, MAX_UPLOAD_BYTES, "file");
        if (tooLarge) {
          const shrinkable = isShrinkableImage(item.file.type, item.file.name);
          patch(item.key, {
            state: shrinkable ? "too_large" : "error",
            error: shrinkable ? tooLarge : [tooLarge, reduceHint(item.file.type, item.file.name)].filter(Boolean).join(" "),
          });
          return;
        }
        const result = await stageFile(item.file);
        if (result.ok) staged.push({ key: item.key, ref: result.ref, name: item.file.name });
        else patch(item.key, { state: "error", error: result.error });
      })
    );
    await attach(staged);
  }

  async function attach(staged: Staged[]) {
    for (let at = 0; at < staged.length; at += PER_CALL) {
      const batch = staged.slice(at, at + PER_CALL);
      for (const b of batch) patch(b.key, { state: "sending" });
      const form = new FormData();
      batch.forEach((b, i) => form.set(i === 0 ? "file" : `file_${i}`, b.ref));
      const result = await send(form);
      const attached = result?.attached ?? (result?.success ? batch.length : 0);
      if (result?.error && !result.refused) {
        // Refused before any file was looked at — the whole batch stays, with why.
        for (const b of batch) patch(b.key, { state: "error", error: result.error ?? undefined });
      } else {
        // The server names each file it turned away; the rest went in.
        const reasons = new Map((result?.refused ?? []).map((r) => [r.name, r.reason]));
        for (const b of batch) {
          const reason = reasons.get(b.name);
          patch(b.key, reason ? { state: "error", error: reason } : null);
        }
      }
      if (attached > 0) toast(`${attached} file${attached === 1 ? "" : "s"} attached.`);
    }
  }

  async function shrink(item: Item) {
    patch(item.key, { state: "uploading", error: undefined });
    const result = await shrinkImageToFit(item.file, MAX_UPLOAD_BYTES);
    if (!result.ok) {
      patch(item.key, {
        state: "error",
        error:
          result.reason === "still_too_large"
            ? `Even fully compressed it is ${formatFileSize(result.smallest)}. Crop it, or photograph one page at a time.`
            : "It couldn't be shrunk. Choose a smaller file.",
      });
      return;
    }
    const staged = await stageFile(result.file);
    if (!staged.ok) {
      patch(item.key, { state: "error", error: staged.error });
      return;
    }
    await attach([{ key: item.key, ref: staged.ref, name: result.file.name }]);
  }

  const busy = items.some((i) => i.state === "uploading" || i.state === "sending");

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) void take(Array.from(e.dataTransfer.files ?? []));
        }}
        className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
          over ? "border-primary bg-primary/5" : "border-border bg-bg"
        }`}
        data-proof-dropzone
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-card px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
          data-proof-choose
        >
          <Upload aria-hidden className="h-4 w-4 shrink-0" />
          Upload files
        </button>
        <span className="text-xs text-muted">
          or drop them here — choose several at once. PDF, Word or photo · <span className="font-semibold text-ink">{limitHint(MAX_UPLOAD_BYTES)}</span>
        </span>
        {busy && (
          <span className="inline-flex items-center gap-1 text-xs text-muted" aria-live="polite">
            <LoaderCircle aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin" />
            Uploading…
          </span>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED_DOCUMENT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose proof files"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            // Cleared so choosing the same file again still counts as a pick.
            e.target.value = "";
            void take(files);
          }}
          data-proof-input
        />
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1" data-proof-queue>
          {items.map((item) => (
            <li
              key={item.key}
              className={`flex flex-wrap items-center gap-2 rounded-md px-2 py-1 text-xs ${
                item.state === "error" || item.state === "too_large" ? "bg-danger-bg text-danger" : "bg-bg text-muted"
              }`}
            >
              {item.state === "error" || item.state === "too_large" ? (
                <CircleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <LoaderCircle aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin" />
              )}
              <span className="min-w-0 font-medium">{item.file.name}</span>
              <span>
                {item.state === "uploading" && `Uploading ${formatFileSize(item.file.size)}…`}
                {item.state === "sending" && "Attaching…"}
                {(item.state === "error" || item.state === "too_large") && item.error}
              </span>
              {item.state === "too_large" && (
                <button
                  type="button"
                  onClick={() => void shrink(item)}
                  className="rounded-md border border-danger bg-card px-2 py-0.5 font-medium text-danger hover:bg-danger-bg"
                >
                  Shrink to fit
                </button>
              )}
              {(item.state === "error" || item.state === "too_large") && (
                <button
                  type="button"
                  onClick={() => patch(item.key, null)}
                  aria-label={`Dismiss ${item.file.name}`}
                  className="ml-auto flex h-5 w-5 items-center justify-center rounded text-danger hover:bg-card"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
