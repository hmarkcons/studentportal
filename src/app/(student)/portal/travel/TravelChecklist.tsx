"use client";

import { useOptimistic, useState, startTransition } from "react";
import { setTravelItemDone } from "@/lib/actions/travelGuide";
import { ActionStatus } from "@/components/ActionStatus";

export type TravelItem = {
  id: string;
  label: string;
  detail: string | null;
  daysAfterArrival: number | null;
  done: boolean;
};

export type TravelSection = {
  id: string;
  title: string;
  intro: string | null;
  items: TravelItem[];
};

/**
 * The arrival checklist, tickable.
 *
 * Optimistic, because a tick that waits for a round trip before moving feels
 * broken — and this gets used standing in a queue at Poste Italiane on a phone
 * with one bar of signal. A failed write puts the tick back and says so, rather
 * than leaving the student believing a step is recorded.
 */
export function TravelChecklist({ sections }: { sections: TravelSection[] }) {
  const allItems = sections.flatMap((s) => s.items);
  const [error, setError] = useState<string | null>(null);
  // The tick that last saved, said beside that item. One object per save, so
  // ActionStatus can tell this result from the next by identity.
  const [saved, setSaved] = useState<{ id: string; result: { success: true } } | null>(null);
  const [doneIds, setDoneIds] = useOptimistic(
    new Set(allItems.filter((i) => i.done).map((i) => i.id)),
    (current: Set<string>, change: { id: string; done: boolean }) => {
      const next = new Set(current);
      if (change.done) next.add(change.id);
      else next.delete(change.id);
      return next;
    }
  );

  const total = allItems.length;
  const doneCount = allItems.filter((i) => doneIds.has(i.id)).length;

  function toggle(item: TravelItem, next: boolean) {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      setDoneIds({ id: item.id, done: next });
      const result = await setTravelItemDone(item.id, next);
      // The optimistic value is discarded when the transition ends, so the
      // server's answer is what remains either way; this only explains it.
      if (result?.error) setError(`“${item.label}” did not save: ${result.error}`);
      else setSaved({ id: item.id, result: { success: true } });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: total ? `${Math.round((doneCount / total) * 100)}%` : "0%" }}
          />
        </div>
        <span className="text-xs text-muted">
          {doneCount} of {total} done
        </span>
      </div>

      {error && <p className="rounded-md border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}

      {sections.map((section) => {
        const sectionDone = section.items.filter((i) => doneIds.has(i.id)).length;
        return (
          <div key={section.id} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] px-3 py-2">
              <h3 className="text-sm font-semibold text-ink">{section.title}</h3>
              <span className="text-xs text-muted">
                {sectionDone}/{section.items.length}
              </span>
            </div>
            {section.intro && <p className="border-b border-border px-3 py-2 text-xs text-muted">{section.intro}</p>}
            <ul className="flex flex-col divide-y divide-border">
              {section.items.map((item) => {
                const checked = doneIds.has(item.id);
                return (
                  <li key={item.id} className="px-3 py-2">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggle(item, e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className={`text-sm ${checked ? "text-muted line-through" : "text-ink"}`}>
                            {item.label}
                          </span>
                          {saved?.id === item.id && <ActionStatus state={saved.result} label="Saved." />}
                        </span>
                        {item.detail && <span className="mt-0.5 block text-xs text-muted">{item.detail}</span>}
                        {/* Counted from the day they land, because that is how
                            every one of these rules is actually written. */}
                        {item.daysAfterArrival != null && !checked && (
                          <span className="mt-0.5 block text-xs font-medium text-warning">
                            Within {item.daysAfterArrival} {item.daysAfterArrival === 1 ? "day" : "days"} of arriving
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
