"use client";

import { useState } from "react";

export function DestinationMultiSelect({
  destinations,
  defaultSelected = [],
}: {
  destinations: { id: string; display_name: string }[];
  defaultSelected?: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
      {destinations.map((d) => (
        <label key={d.id} className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
          {d.display_name}
          {selected.has(d.id) && (
            <>
              <input type="hidden" name="destination_ids" value={d.id} />
              <input type="hidden" name="destination_names" value={d.display_name} />
            </>
          )}
        </label>
      ))}
      {destinations.length === 0 && <p className="text-sm text-muted">No destinations configured yet.</p>}
    </div>
  );
}
