"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { defaultRoundLabel, sortRounds, type ProgramRound } from "@/lib/programRounds";

type Row = ProgramRound & { key: string };

let sequence = 0;

function blankRow(index: number): Row {
  return {
    key: `added-${sequence++}`,
    id: null,
    label: defaultRoundLabel(index),
    start_date: null,
    application_deadline: null,
  };
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
 * The inputs are controlled rather than defaultValue'd. React clears a form
 * once its server action resolves, which on an uncontrolled field means
 * reverting to the value the row had *before* the save — so a staff member who
 * changed a deadline, saved it and then looked at the row would see the old
 * date and reasonably conclude it had not saved. Holding the values in state
 * means the form survives its own submit.
 *
 * Rows with neither date are dropped server-side, so an empty row left behind
 * costs nothing.
 */
export function ProgramRoundsFields({
  rounds = [],
  className = "",
}: {
  rounds?: readonly ProgramRound[];
  className?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = sortRounds(rounds).map((r, i) => ({ ...r, key: r.id ?? `existing-${i}` }));
    return existing.length > 0 ? existing : [blankRow(0)];
  });

  function update(key: string, patch: Partial<ProgramRound>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <div className={`w-full ${className}`}>
      <p className="mb-1 text-[11px] font-medium text-muted">
        Intake rounds
        <span className="ml-1 font-normal">
          — a programme can run several. Each round has its own course start and its own last date to apply.
        </span>
      </p>

      <div className="flex flex-col gap-1.5">
        {rows.map((row, index) => (
          <div key={row.key} className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg p-2">
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
            <label className="flex flex-col gap-0.5 text-[10px] text-muted">
              Course starts
              <Input
                name="round_start_date"
                type="date"
                value={row.start_date ?? ""}
                onChange={(e) => update(row.key, { start_date: e.target.value || null })}
                className="px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-muted">
              Apply by
              <Input
                name="round_application_deadline"
                type="date"
                value={row.application_deadline ?? ""}
                onChange={(e) => update(row.key, { application_deadline: e.target.value || null })}
                className="px-2 py-1 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              title="Remove this round"
              aria-label="Remove this round"
              className="rounded p-1 text-xs text-muted hover:bg-danger-bg hover:text-danger"
            >
              ✕
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
