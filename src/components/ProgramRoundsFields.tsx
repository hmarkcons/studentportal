"use client";

import { useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { parseDayOrWords } from "@/lib/catalogueRows";
import {
  ROUNDS_PRESENT_FIELD,
  defaultRoundLabel,
  roundDateForInput,
  roundFieldValue,
  sortRounds,
  type ProgramRound,
} from "@/lib/programRounds";

/** A row as the form edits it: each date field as the text in its box. */
type Row = { key: string; id: string | null; label: string; start: string; deadline: string };

let sequence = 0;

function blankRow(index: number): Row {
  return { key: `added-${sequence++}`, id: null, label: defaultRoundLabel(index), start: "", deadline: "" };
}

/**
 * One date field: a date or words (0304). Typed — "15 Mar 2027", "Rolling",
 * "TBA March 2027" — or picked from the calendar, which writes the date out.
 * Underneath it says how what is in the box will be read, because only a
 * date reminds anyone: "Rolling" is shown as written and closes nothing.
 */
function DateOrWords({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const read = parseDayOrWords(value);
  const hint = !value.trim()
    ? null
    : read.date && !read.text
      ? `= ${roundDateForInput(read.date)}`
      : read.date
        ? `date ${roundDateForInput(read.date)}, shown as written`
        : "words — shown as written, no reminder";

  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-muted">
      {label}
      <span className="flex items-center gap-1">
        <Input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="15 Mar 2027, or Rolling"
          maxLength={200}
          className="w-40 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => {
            const el = picker.current;
            if (!el) return;
            el.value = read.date ?? "";
            try {
              el.showPicker();
            } catch {
              el.focus();
            }
          }}
          title={`Pick the ${label.toLowerCase()} date`}
          aria-label={`Pick the ${label.toLowerCase()} date`}
          className="rounded p-1 text-muted hover:text-primary"
        >
          <CalendarDays aria-hidden className="h-3.5 w-3.5" />
        </button>
        {/* Out of sight and out of the form: only the box above is posted. */}
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          onChange={(e) => e.target.value && onChange(roundDateForInput(e.target.value))}
        />
      </span>
      {hint && <span className={read.date ? "text-muted" : "text-warning"}>{hint}</span>}
    </label>
  );
}

/**
 * The repeated "intake round" rows on a programme form.
 *
 * Each row emits round_id / round_label / round_start_date /
 * round_application_deadline, and the server reads the four lists back by
 * index — see parseRoundsFromFormData. The hidden id goes out on every row,
 * including new ones, so those lists stay the same length and cannot slip out
 * of alignment.
 *
 * The two date fields take a date or words (0304) and post them as typed;
 * the server reads each with parseDayOrWords, the same rule the hint uses.
 *
 * The inputs are controlled rather than defaultValue'd. React clears a form
 * once its server action resolves, which on an uncontrolled field means
 * reverting to the value the row had *before* the save — so a staff member who
 * changed a deadline, saved it and then looked at the row would see the old
 * date and reasonably conclude it had not saved. Holding the values in state
 * means the form survives its own submit.
 *
 * Rows with nothing in either date field are dropped server-side, so an empty
 * row left behind costs nothing.
 */
export function ProgramRoundsFields({
  rounds = [],
  className = "",
}: {
  rounds?: readonly ProgramRound[];
  className?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = sortRounds(rounds).map((r, i) => ({
      key: r.id ?? `existing-${i}`,
      id: r.id ?? null,
      label: r.label,
      start: roundFieldValue(r.start_text, r.start_date),
      deadline: roundFieldValue(r.deadline_text, r.application_deadline),
    }));
    return existing.length > 0 ? existing : [blankRow(0)];
  });

  function update(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Says "this form carried the rounds widget", so removing every row
          clears the programme's rounds while a form that simply has no widget
          leaves them untouched. See roundsWereSubmitted. */}
      <input type="hidden" name={ROUNDS_PRESENT_FIELD} value="1" />
      <p className="mb-1 text-[11px] font-medium text-muted">
        Intake rounds
        <span className="ml-1 font-normal">
          — a programme can run several. Each round has its own course start and its own last date to apply: a date,
          or words such as &ldquo;Rolling&rdquo;.
        </span>
      </p>

      <div className="flex flex-col gap-1.5">
        {rows.map((row, index) => (
          <div key={row.key} className="relative flex flex-wrap items-start gap-2 rounded-md border border-border bg-bg p-2">
            <input type="hidden" name="round_id" value={row.id ?? ""} />
            <label className="flex flex-col gap-0.5 text-[10px] text-muted">
              Round
              <Input
                name="round_label"
                value={row.label}
                onChange={(e) => update(row.key, { label: e.target.value })}
                placeholder={defaultRoundLabel(index)}
                className="w-32 px-2 py-1 text-xs"
              />
            </label>
            <DateOrWords
              name="round_start_date"
              label="Course starts"
              value={row.start}
              onChange={(start) => update(row.key, { start })}
            />
            <DateOrWords
              name="round_application_deadline"
              label="Apply by"
              value={row.deadline}
              onChange={(deadline) => update(row.key, { deadline })}
            />
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              title="Remove this round"
              aria-label="Remove this round"
              className="mt-4 rounded p-1 text-muted hover:bg-danger-bg hover:text-danger"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Shown even with no rows, so clearing every round is recoverable
          without reloading the page. */}
      <button
        type="button"
        onClick={() => setRows((current) => [...current, blankRow(current.length)])}
        className="mt-1 text-xs text-primary hover:underline"
      >
        + Add round
      </button>
    </div>
  );
}
