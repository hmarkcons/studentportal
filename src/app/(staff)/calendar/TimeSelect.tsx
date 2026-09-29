"use client";

import { durationLabel, formatClockLong, minutesOf, timeOf } from "@/lib/calendarLayout";

const STEP = 15;
const ALL_TIMES = Array.from({ length: (24 * 60) / STEP }, (_, i) => i * STEP);

/**
 * A time from a list, every quarter hour, the way Google offers one. An end
 * time lists only what comes after the start, each with how long that makes
 * it; a time that is not on the quarter hour is kept as an entry of its own
 * rather than silently rounded.
 */
export function TimeSelect({
  value,
  onChange,
  after,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  /** For an end time on the same day: the start, in "HH:MM". */
  after?: string | null;
  label: string;
  className?: string;
}) {
  const start = after ? minutesOf(after) : null;
  const current = minutesOf(value);
  const options = ALL_TIMES.filter((m) => start === null || m > start);
  if (start !== null && start + STEP >= 24 * 60) options.push(24 * 60 - 1);
  if (current !== null && !options.includes(current)) options.push(current);
  options.sort((a, b) => a - b);

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none focus:border-primary ${className}`}
    >
      {options.map((m) => (
        <option key={m} value={timeOf(m)}>
          {formatClockLong(m)}
          {start !== null ? ` (${durationLabel(m - start)})` : ""}
        </option>
      ))}
    </select>
  );
}
