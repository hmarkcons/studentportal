"use client";

import { LoaderCircle, Search } from "lucide-react";
import { parseYMD, WEEKDAY_LABELS, MONTH_LABELS } from "@/lib/calendarDates";
import { displaySpan, formatClock, formatTimeRange, minutesOf } from "@/lib/calendarLayout";
import type { CalendarEvent } from "@/lib/calendarItems";
import type { EventColor } from "../eventColors";
import { anchorFor, type Anchor } from "../types";

/** What a search found, by date, as Google lists it. */
export function SearchResults({
  query,
  results,
  pending,
  error,
  colorOf,
  todayStr,
  onOpenEvent,
  onOpenDay,
}: {
  query: string;
  results: CalendarEvent[];
  pending: boolean;
  error: string | null;
  colorOf: (e: CalendarEvent) => EventColor;
  todayStr: string;
  onOpenEvent: (e: CalendarEvent, anchor: Anchor) => void;
  onOpenDay: (date: string) => void;
}) {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of results) (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);

  return (
    <div className="h-full min-h-0 overflow-y-auto p-4" data-full-width data-search-results>
      <p className="mb-4 flex items-center gap-2 text-sm text-muted">
        {pending ? <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" /> : <Search aria-hidden className="h-4 w-4" />}
        {pending ? `Searching for “${query}”…` : `${results.length} result${results.length === 1 ? "" : "s"} for “${query}”`}
      </p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!pending && results.length === 0 && <p className="text-sm text-muted">Nothing on the calendar has that in its title.</p>}
      <ol className="flex flex-col divide-y divide-border">
        {[...byDate.entries()].map(([date, list]) => {
          const d = parseYMD(date);
          return (
            <li key={date} className="flex gap-4 py-3">
              <button
                type="button"
                onClick={() => onOpenDay(date)}
                aria-label={`Open ${date} in the day view`}
                className="flex w-28 shrink-0 items-baseline gap-2 rounded-md px-1 text-left hover:bg-bg"
              >
                <span className={`text-2xl leading-none ${date === todayStr ? "font-semibold text-primary" : "text-ink"}`}>{d.getUTCDate()}</span>
                <span className="text-[11px] font-semibold uppercase text-muted">
                  {MONTH_LABELS[d.getUTCMonth()].slice(0, 3)} {d.getUTCFullYear()}, {WEEKDAY_LABELS[d.getUTCDay()]}
                </span>
              </button>
              <ul className="flex min-w-0 flex-1 flex-col gap-1">
                {list.map((e) => {
                  const span = displaySpan(e.time, e.endTime);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        data-event-id={e.id}
                        onClick={(ev) => onOpenEvent(e, anchorFor(ev.currentTarget))}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg"
                      >
                        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorOf(e).dot}`} />
                        <span className="w-28 shrink-0 text-xs text-muted">
                          {span ? (e.endTime ? formatTimeRange(span.start, span.end) : formatClock(minutesOf(e.time) ?? 0)) : "All day"}
                        </span>
                        <span className={`min-w-0 truncate text-ink ${e.done ? "line-through opacity-60" : ""}`}>{e.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
