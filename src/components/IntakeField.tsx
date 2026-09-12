"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/Input";
import { formatIntake, intakeYearChoices, parseIntake, type IntakeMode } from "@/lib/intake";

export type IntakeConfig = {
  /** The destination this intake belongs to, for the caption. */
  destinationName: string | null;
  mode: IntakeMode;
  options: string[];
};

/**
 * The intake, shaped by the destination it is for.
 *
 * One text box everywhere is how the database ended up holding "Fall 27" and
 * "Fall 2027" — the same intake, ungroupable by any filter or report. Italy,
 * France and Finland run one intake a year, so there is nothing to choose but
 * the year; Austria, Germany and Turkey run two and a student is sometimes
 * offered both; the UK runs several and the office writes those out.
 *
 * Whatever is chosen is written into one hidden `intake` field, so every form
 * and server action that already handled a text box keeps working untouched.
 */
export function IntakeField({
  config,
  defaultValue = "",
  name = "intake",
  label = "Intake",
  required = false,
}: {
  /** Null when no destination is chosen yet — falls back to a plain box. */
  config: IntakeConfig | null;
  defaultValue?: string | null;
  name?: string;
  label?: string;
  required?: boolean;
}) {
  const mode: IntakeMode = config?.mode ?? "free_text";
  const options = config?.options ?? [];
  const initial = parseIntake(defaultValue, options);

  const [seasons, setSeasons] = useState<string[]>(
    // A single-intake destination has exactly one answer, so it is already
    // chosen — the year is the only thing left to say.
    initial.seasons.length > 0 ? initial.seasons : mode === "single" ? options.slice(0, 1) : []
  );
  const [year, setYear] = useState(initial.year);
  const [freeText, setFreeText] = useState(initial.seasons.length > 0 ? "" : initial.freeText);

  const years = intakeYearChoices();
  // A stored year outside the offered window still has to be selectable, or
  // opening an old record and saving it would quietly move the intake.
  const yearChoices = year && !years.includes(year) ? [year, ...years] : years;

  const value = formatIntake(mode, options, seasons, year, freeText);

  function toggle(season: string) {
    setSeasons((prev) => (prev.includes(season) ? prev.filter((s) => s !== season) : [...prev, season]));
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {/* Always submitted, whatever the shape above it — the server actions
          and every report still read one plain `intake` string. */}
      <input type="hidden" name={name} value={value} />

      {mode === "free_text" && (
        <Input
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder={config ? `e.g. September ${years[1]}` : "e.g. Fall 2027"}
          required={required}
        />
      )}

      {mode === "single" && (
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-ink">
            {options[0]}
          </span>
          <Select value={year} onChange={(e) => setYear(e.target.value)} required={required} className="w-28">
            <option value="">Year…</option>
            {yearChoices.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      )}

      {mode === "multi" && (
        <div className="flex flex-wrap items-center gap-3">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm text-ink">
              {/* Checkboxes, not a dropdown: the office sometimes offers a
                  student both halves of a cycle, and both are the intake. */}
              <input type="checkbox" checked={seasons.includes(o)} onChange={() => toggle(o)} className="h-4 w-4" />
              {o}
            </label>
          ))}
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-28">
            <option value="">Year…</option>
            {yearChoices.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      )}

      {mode !== "free_text" && (
        <span className="text-[11px] text-muted">
          {value ? (
            <>Saves as “{value}”</>
          ) : mode === "single" ? (
            `${config?.destinationName ?? "This destination"} has one intake a year — choose the year.`
          ) : (
            `${config?.destinationName ?? "This destination"} has ${options.length} intakes — tick one or both, then the year.`
          )}
        </span>
      )}

      {/* Something already on file that this destination's picker cannot
          represent. Shown rather than dropped: an unusual spelling is not a
          reason to lose a student's intake. */}
      {mode !== "free_text" && initial.seasons.length === 0 && initial.freeText && !value && (
        <span className="text-[11px] text-warning">Currently recorded as “{initial.freeText}” — choose again to replace it.</span>
      )}
    </label>
  );
}
