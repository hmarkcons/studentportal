"use client";

import { X } from "lucide-react";
import { parseYMD, WEEKDAY_LABELS } from "@/lib/calendarDates";
import { formatClock, minutesOf } from "@/lib/calendarLayout";
import type { CalendarEvent } from "@/lib/calendarItems";
import type { EventColor } from "../eventColors";
import { anchorFor, type Anchor } from "../types";
import { IconButton } from "./Popover";

/** Everything on one day, for a month cell's "N more". */
export function DayList({
  date,
  events,
  colorOf,
  onClose,
  onOpenDay,
  onOpenEvent,
}: {
  date: string;
  events: CalendarEvent[];
  colorOf: (e: CalendarEvent) => EventColor;
  onClose: () => void;
  onOpenDay: (date: string) => void;
  onOpenEvent: (e: CalendarEvent, anchor: Anchor) => void;
}) {
  const d = parseYMD(date);
  return (
    <div className="flex flex-col px-3 pb-4 pt-2" data-day-list>
      <div className="flex justify-end">
        <IconButton label="Close" onClick={onClose}>
          <X aria-hidden className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="mb-3 flex flex-col items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{WEEKDAY_LABELS[d.getUTCDay()]}</span>
        <button
          type="button"
          onClick={() => onOpenDay(date)}
          aria-label={`Open ${date} in the day view`}
          className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-ink hover:bg-bg"
        >
          {d.getUTCDate()}
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {events.map((e) => {
          const color = colorOf(e);
          const bar = Boolean(e.spanEnd) || e.time === null;
          return (
            <li key={e.id}>
              <button
                type="button"
                data-event-id={e.id}
                onClick={(ev) => onOpenEvent(e, anchorFor(ev.currentTarget))}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${bar ? `${color.solid} font-medium` : "text-ink hover:bg-bg"} ${
                  e.done ? "opacity-60" : ""
                }`}
              >
                {!bar && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />}
                <span className={`truncate ${e.done ? "line-through" : ""}`}>
                  {!bar && e.time && <span className="text-muted">{formatClock(minutesOf(e.time) ?? 0)} </span>}
                  {e.title}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
