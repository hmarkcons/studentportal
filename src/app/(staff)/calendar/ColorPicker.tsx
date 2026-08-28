"use client";

import { EVENT_COLORS } from "./eventColors";

export function ColorPicker({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="radio" name={name} value="" defaultChecked={!defaultValue} className="sr-only peer/none" />
        <span className="h-5 w-5 rounded-full border-2 border-dashed border-border peer-checked/none:border-ink" title="Default color" />
      </label>
      {EVENT_COLORS.map((c) => (
        <label key={c.key} className="cursor-pointer">
          <input type="radio" name={name} value={c.key} defaultChecked={defaultValue === c.key} className="peer sr-only" />
          <span
            className={`block h-5 w-5 rounded-full ${c.swatch} ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink`}
            title={c.label}
          />
        </label>
      ))}
    </div>
  );
}
