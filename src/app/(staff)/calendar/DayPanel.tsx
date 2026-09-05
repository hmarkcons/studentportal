"use client";

import { useEffect } from "react";
import { parseYMD, MONTH_LABELS, WEEKDAY_FULL_LABELS } from "@/lib/calendarDates";
import { DayEventList } from "./DayEventList";
import { AddEventForm } from "./AddEventForm";
import type { CalendarEvent } from "./types";

export function DayPanel({
  day,
  events,
  applicationOptions,
  revalidateTo,
  onClose,
}: {
  day: string;
  events: CalendarEvent[];
  applicationOptions: { id: string; label: string }[];
  revalidateTo: string;
  onClose: () => void;
}) {
  const d = parseYMD(day);
  const heading = `${WEEKDAY_FULL_LABELS[d.getUTCDay()]}, ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16 sm:pt-24" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">{heading}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mb-4 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
          <DayEventList day={day} events={events} revalidateTo={revalidateTo} />
        </div>

        <AddEventForm day={day} applicationOptions={applicationOptions} revalidateTo={revalidateTo} />
      </div>
    </div>
  );
}
