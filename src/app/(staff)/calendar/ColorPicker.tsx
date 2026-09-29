"use client";

import { Check } from "lucide-react";
import { PICKABLE_COLORS, eventColor } from "./eventColors";

/**
 * The colour of one item: its kind's own, or one of Google's named colours.
 * Radio buttons underneath, so it is one tab stop and the arrow keys move
 * between swatches.
 */
export function ColorPicker({
  value,
  onChange,
  defaultColor,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The kind's colour, shown as the "default" swatch. */
  defaultColor: string;
}) {
  const options = [{ key: "", label: "Default for its calendar", swatch: eventColor(defaultColor).swatch }, ...PICKABLE_COLORS];
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap items-center gap-1.5">
      {options.map((c) => (
        <label key={c.key || "default"} className="relative cursor-pointer" title={c.label}>
          <input
            type="radio"
            name="event-colour"
            value={c.key}
            checked={value === c.key}
            onChange={() => onChange(c.key)}
            className="peer sr-only"
            aria-label={c.label}
          />
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${c.swatch} ring-offset-2 ring-offset-card peer-focus-visible:ring-2 peer-focus-visible:ring-ink ${
              c.key === "" ? "ring-1 ring-border" : ""
            }`}
          >
            {value === c.key && <Check aria-hidden className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
          </span>
        </label>
      ))}
    </div>
  );
}
