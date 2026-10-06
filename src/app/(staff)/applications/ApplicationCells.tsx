"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ChevronDown, ChevronUp, LoaderCircle, Pencil } from "lucide-react";
import { useHoverPreview } from "@/components/ui/useHoverPreview";
import { stageHue, stageLabel, stageOptions, stageProgress } from "@/lib/applicationTable";

// The applications table's cells (ApplicationsTable). Each shows its value
// as text until it is clicked, and only then becomes a control: a thousand
// rows of open <select>s, each with every programme of its university, took
// longer to draw than to fetch — the leads list learnt the same.

/** What a cell is given to save with: false when it was refused, and the table has said why. */
export type SaveFn = (value: string) => Promise<boolean>;

/**
 * A choice from a list, shown as its label until clicked, and then as the
 * browser's own list, opened at once where the browser allows it.
 */
export function ChoiceCell({
  value,
  options,
  emptyLabel,
  display,
  onSave,
  disabled = false,
  title,
  label,
  className = "",
  buttonClassName = "",
}: {
  value: string;
  options: { value: string; label: string }[];
  /** What the empty choice is called — "No programme" — or absent when one must be chosen. */
  emptyLabel?: string;
  /** The value as shown, when not the option's label. */
  display?: React.ReactNode;
  onSave: SaveFn;
  disabled?: boolean;
  title?: string;
  /** The column, for a screen reader. */
  label: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    el?.focus();
    // Opens the list straight away, rather than asking for a second click.
    try {
      (el as HTMLSelectElement & { showPicker?: () => void })?.showPicker?.();
    } catch {
      // Not allowed here (Safari, or no user gesture left): focused is enough.
    }
  }, [editing]);

  const current = options.find((o) => o.value === value);
  const shown = display ?? current?.label ?? (value ? value : emptyLabel ?? "—");

  if (!editing || disabled) {
    return (
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => setEditing(true)}
        title={title ?? (disabled ? undefined : `Change — ${typeof shown === "string" ? shown : label}`)}
        aria-label={`${label}: ${typeof shown === "string" ? shown : current?.label ?? "none"} — change`}
        className={`group inline-flex max-w-full items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-left text-sm text-ink hover:border-border hover:bg-card disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent ${buttonClassName}`}
        data-choice-cell={label}
      >
        <span className="truncate">{shown}</span>
        {saving ? (
          <LoaderCircle aria-hidden className="h-3 w-3 shrink-0 animate-spin text-muted" />
        ) : (
          !disabled && <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        )}
      </button>
    );
  }

  return (
    <select
      ref={ref}
      defaultValue={value}
      aria-label={label}
      className={`max-w-full rounded-md border border-primary bg-card px-1 py-0.5 text-sm text-ink ${className}`}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
      }}
      onChange={async (e) => {
        const next = e.target.value;
        setEditing(false);
        if (next === value) return;
        setSaving(true);
        await onSave(next);
        setSaving(false);
      }}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {/* What is on file stays choosable even when the list no longer offers it. */}
      {value && !current && <option value={value}>{typeof shown === "string" ? shown : value}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * The stage, as a pill in its own colour (globals.css, data-hue) with a thin
 * bar beneath for how far along the country's stages it is. A click offers the
 * country's stages and the closing results — Rejected, Not eligible,
 * Withdrawn — which any application can be given.
 */
export function StageCell({
  stage,
  pipeline,
  onSave,
  disabled = false,
}: {
  stage: string;
  pipeline: string[];
  onSave: SaveFn;
  disabled?: boolean;
}) {
  const hue = stageHue(stage);
  const progress = stageProgress(stage, pipeline);
  return (
    <div className="flex min-w-[9.5rem] max-w-[14rem] flex-col gap-0.5" data-hue={hue} data-stage-cell={stage}>
      <ChoiceCell
        value={stage}
        options={stageOptions(pipeline, stage).map((o) => ({ value: o.key, label: o.label }))}
        display={stageLabel(stage)}
        onSave={onSave}
        disabled={disabled}
        label="Stage"
        buttonClassName="stage-pill !rounded-full !px-2.5 text-xs font-semibold"
        className="text-xs"
      />
      {progress && (
        <div className="stage-meter mx-1 h-1 overflow-hidden rounded-full" title={`Step ${progress.step} of ${progress.of}`} aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${Math.round((progress.step / progress.of) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * A value typed in: shown on one line, whole on hover when cut short, and a
 * box to change it on a click. Enter or leaving the box saves; Escape puts it
 * back. A date is a date box, and Clear empties it.
 */
export function TextCell({
  value,
  display,
  onSave,
  disabled = false,
  label,
  type = "text",
  multiline = false,
  maxLength,
  placeholder,
  widthClassName = "max-w-[12rem]",
  emptyText = "—",
}: {
  value: string | null;
  /**
   * The value as shown, when not the text itself — a link, a formatted fee, a
   * deadline that comes from the round. Null or absent shows the value.
   */
  display?: React.ReactNode;
  onSave: SaveFn;
  disabled?: boolean;
  label: string;
  type?: "text" | "date";
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  widthClassName?: string;
  emptyText?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  const hover = useHoverPreview(value, cut && !editing);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCut(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, editing]);

  async function commit(next: string) {
    setEditing(false);
    if (next.trim() === (value ?? "").trim()) return;
    setSaving(true);
    await onSave(next);
    setSaving(false);
  }

  if (editing) {
    const common = {
      value: draft,
      autoFocus: true,
      maxLength,
      placeholder,
      "aria-label": label,
      className: "w-full min-w-[9rem] rounded-md border border-primary bg-card px-1.5 py-0.5 text-sm text-ink",
      onBlur: () => void commit(draft),
    };
    return multiline ? (
      <div className={`${widthClassName} min-w-[14rem]`}>
        <textarea
          {...common}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void commit(draft);
          }}
        />
        <p className="text-[10px] text-muted">Ctrl+Enter or click away to save · Esc to cancel</p>
      </div>
    ) : (
      <div className="flex items-center gap-1">
        <input
          {...common}
          type={type}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter") void commit(draft);
          }}
        />
        {type === "date" && value && (
          <button
            type="button"
            // Before the box loses focus, so the blur does not save the date first.
            onMouseDown={(e) => {
              e.preventDefault();
              void commit("");
            }}
            className="text-xs text-muted hover:text-danger"
          >
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-1 ${widthClassName}`}>
      <span ref={textRef} className="min-w-0 flex-1 truncate" {...hover.bind} data-text-cell={label}>
        {display ?? (value || <span className="text-muted">{emptyText}</span>)}
      </span>
      {saving ? (
        <LoaderCircle aria-hidden className="h-3 w-3 shrink-0 animate-spin text-muted" />
      ) : (
        !disabled && (
          <button
            type="button"
            onClick={() => {
              hover.close();
              setDraft(value ?? "");
              setEditing(true);
            }}
            className="shrink-0 rounded p-0.5 text-muted opacity-40 hover:bg-bg hover:text-primary hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Edit ${label.toLowerCase()}`}
            title={`Edit ${label.toLowerCase()}`}
            data-edit-cell={label}
          >
            <Pencil aria-hidden className="h-3 w-3" />
          </button>
        )
      )}
      {hover.preview}
    </div>
  );
}

/**
 * Finalised for the visa: a badge with its undo, or the country's own word
 * for the act — "Pre-Enroll University" — or, while another university of the
 * intake holds it, a dash saying so. Both ways ask first: finalising moves the
 * student's stages along.
 */
export function FinalizeCell({
  finalized,
  blocked,
  ended = false,
  actionLabel,
  badgeLabel,
  universityName,
  onSave,
  disabled = false,
}: {
  finalized: boolean;
  blocked: boolean;
  /** Rejected, withdrawn or not eligible: nothing to build a visa on. */
  ended?: boolean;
  actionLabel: string;
  badgeLabel: string;
  universityName: string;
  onSave: (finalize: boolean) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  async function toggle() {
    const ask = finalized
      ? `Undo "${badgeLabel}" for ${universityName}? The student's ${badgeLabel} step comes off with it.`
      : `${actionLabel}: ${universityName}? This is the university the visa will be built on, and the student's stages move on with it.`;
    if (!confirm(ask)) return;
    setSaving(true);
    await onSave(!finalized);
    setSaving(false);
  }

  if (finalized) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" data-finalized>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success">
          <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
          {badgeLabel}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={toggle}
            disabled={saving}
            aria-label={`Undo ${badgeLabel.toLowerCase()}`}
            className="text-[11px] text-muted hover:text-danger hover:underline disabled:opacity-50"
          >
            {saving ? "…" : "Undo"}
          </button>
        )}
      </span>
    );
  }
  if (disabled || ended) return <span className="text-muted">—</span>;
  if (blocked) {
    return (
      <span className="text-xs text-muted" title={`Another university of this intake is already ${badgeLabel.toLowerCase()} — undo that first.`}>
        —
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs font-medium text-ink hover:border-success hover:text-success disabled:opacity-50"
      data-finalize
    >
      {saving ? "Saving…" : actionLabel}
    </button>
  );
}

/** A student's priority: their number, and arrows to move it past the next one. */
export function PriorityCell({
  number,
  canUp,
  canDown,
  onMove,
  disabled = false,
  universityName,
}: {
  number: number;
  canUp: boolean;
  canDown: boolean;
  onMove: (direction: "up" | "down") => Promise<void>;
  disabled?: boolean;
  universityName: string;
}) {
  const [saving, setSaving] = useState(false);
  const move = async (d: "up" | "down") => {
    setSaving(true);
    await onMove(d);
    setSaving(false);
  };
  return (
    <span className="inline-flex items-center gap-1" data-priority={number}>
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-ink">{number}</span>
      {!disabled && (
        <>
          <button
            type="button"
            onClick={() => move("up")}
            disabled={!canUp || saving}
            className="rounded p-0.5 text-muted hover:bg-bg hover:text-ink disabled:opacity-25"
            aria-label={`Move ${universityName} up`}
          >
            <ChevronUp aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => move("down")}
            disabled={!canDown || saving}
            className="rounded p-0.5 text-muted hover:bg-bg hover:text-ink disabled:opacity-25"
            aria-label={`Move ${universityName} down`}
          >
            <ChevronDown aria-hidden className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </span>
  );
}
