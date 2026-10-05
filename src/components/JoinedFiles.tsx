"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { combineIntoPdf } from "@/lib/combinePdf";
import { formatFileSize } from "@/lib/fileSize";

export type JoinedResult =
  /** Nothing chosen. */
  | { kind: "none" }
  /** One file: used as it is, as before — a Word file, a HEIC photo and an oversized photo's "Shrink to fit" all still apply. */
  | { kind: "single"; file: File }
  /** Several, joined into one PDF. */
  | { kind: "joined"; file: File; note: string }
  | { kind: "error"; error: string };

/**
 * The files chosen for one document, in the order they will be joined, and
 * the joining itself: done again whenever the list changes, the latest
 * answer winning over a slower earlier one. `onResult` hears each outcome;
 * `onBusy` whether joining is under way, so a form can hold its submit.
 */
export function useJoinedFiles({
  limitBytes,
  onResult,
  onBusy,
}: {
  limitBytes: number;
  onResult: (result: JoinedResult) => void;
  onBusy?: (busy: boolean, note: string | null) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const round = useRef(0);

  async function settle(next: File[]) {
    setFiles(next);
    const mine = ++round.current;
    // A joining overtaken by this change never reports its end, so it is said here.
    if (next.length < 2) onBusy?.(false, null);
    if (next.length === 0) return onResult({ kind: "none" });
    if (next.length === 1) return onResult({ kind: "single", file: next[0] });
    onBusy?.(true, `Joining ${next.length} files into one PDF…`);
    const joined = await combineIntoPdf(next, { limitBytes });
    if (mine !== round.current) return;
    onBusy?.(false, null);
    onResult(
      joined.ok
        ? {
            kind: "joined",
            file: joined.file,
            note: `${next.length} files joined into one PDF · ${joined.pages} page${joined.pages === 1 ? "" : "s"} · ${formatFileSize(joined.file.size)}`,
          }
        : { kind: "error", error: joined.error }
    );
  }

  return {
    files,
    /** A new pick: replaces what was chosen, or adds to it. */
    choose: (picked: File[], { add = false }: { add?: boolean } = {}) => void settle(add ? [...files, ...picked] : picked),
    move: (i: number, by: -1 | 1) => {
      const j = i + by;
      if (j < 0 || j >= files.length) return;
      const next = [...files];
      [next[i], next[j]] = [next[j], next[i]];
      void settle(next);
    },
    remove: (i: number) => void settle(files.filter((_, k) => k !== i)),
    clear: () => void settle([]),
  };
}

/**
 * The files to be joined, one to a line in the order they will appear, with
 * buttons to move one up or down, take one out, or add more. With one chosen,
 * only the way to add another.
 */
export function JoinedFilesList({
  joined,
  onAddMore,
  disabled,
}: {
  joined: ReturnType<typeof useJoinedFiles>;
  onAddMore: () => void;
  disabled?: boolean;
}) {
  if (joined.files.length === 0) return null;
  // One chosen: the way to add the other side, or the next page, to it.
  if (joined.files.length === 1) {
    return (
      <button
        type="button"
        onClick={onAddMore}
        disabled={disabled}
        className="w-fit text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
        data-join-another
      >
        + Add another file to join to it
      </button>
    );
  }
  const button = "rounded p-0.5 text-muted hover:bg-bg hover:text-ink disabled:opacity-30";
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2" data-joined-files>
      <p className="text-[11px] text-muted">Joined into one PDF in this order:</p>
      <ol className="flex flex-col gap-0.5">
        {joined.files.map((f, i) => (
          <li key={`${i}-${f.name}-${f.size}`} className="flex items-center gap-1 text-xs text-ink" data-joined-file={i + 1}>
            <span className="w-4 shrink-0 text-right tabular-nums text-muted">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate" title={f.name}>
              {f.name}
            </span>
            <span className="shrink-0 text-[11px] text-muted">{formatFileSize(f.size)}</span>
            <button type="button" className={button} onClick={() => joined.move(i, -1)} disabled={disabled || i === 0} aria-label={`Move ${f.name} up`}>
              <ArrowUp aria-hidden className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={button}
              onClick={() => joined.move(i, 1)}
              disabled={disabled || i === joined.files.length - 1}
              aria-label={`Move ${f.name} down`}
            >
              <ArrowDown aria-hidden className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={button} onClick={() => joined.remove(i)} disabled={disabled} aria-label={`Take ${f.name} out`}>
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onAddMore} disabled={disabled} className="w-fit text-[11px] font-medium text-primary hover:underline disabled:opacity-50">
        + Add more files
      </button>
    </div>
  );
}
