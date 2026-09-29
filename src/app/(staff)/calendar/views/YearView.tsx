"use client";

import { useMemo } from "react";
import { parseYMD } from "@/lib/calendarDates";
import { shiftDate } from "@/lib/calendarLayout";
import type { CalendarEvent } from "@/lib/calendarItems";
import { MiniMonth } from "./MiniMonth";

/** Twelve months at once. A day with something on it is marked; clicking a day opens it. */
export function YearView({
  referenceDate,
  todayStr,
  events,
  onOpenDay,
}: {
  referenceDate: string;
  todayStr: string;
  events: CalendarEvent[];
  onOpenDay: (date: string) => void;
}) {
  const year = parseYMD(referenceDate).getUTCFullYear();
  const marked = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      set.add(e.date);
      if (e.spanEnd) {
        // A span marks every day it covers, capped so a year-long placement
        // cannot turn into a loop of thousands.
        for (let d = e.date, i = 0; d < e.spanEnd && i < 400; i++) {
          d = shiftDate(d, 1);
          set.add(d);
        }
      }
    }
    return set;
  }, [events]);

  return (
    <div className="h-full min-h-0 overflow-y-auto p-4" data-full-width data-year-grid>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MiniMonth key={m} year={year} month={m} todayStr={todayStr} marked={marked} onPick={onOpenDay} heading="title" />
        ))}
      </div>
    </div>
  );
}
