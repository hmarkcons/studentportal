"use client";

import { getWeekDays, parseYMD, toYMD, MONTH_LABELS, WEEKDAY_LABELS } from "@/lib/calendarDates";
import { colorDotClass } from "./eventColors";
import type { CalendarEvent, CalendarTone } from "./types";

const DOT_CLASS: Record<CalendarTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  primary: "bg-primary",
  neutral: "bg-muted",
};

function dotClassFor(e: CalendarEvent) {
  return colorDotClass(e.color) ?? DOT_CLASS[e.tone];
}

export function WeekGrid({
  referenceDate,
  todayStr,
  eventsByDate,
  selectedDay,
  onSelectDay,
}: {
  referenceDate: string;
  todayStr: string;
  eventsByDate: Record<string, CalendarEvent[]>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const refDate = parseYMD(referenceDate);
  const days = getWeekDays(refDate);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((d, i) => {
        const dayStr = toYMD(d);
        const isToday = dayStr === todayStr;
        const isSelected = dayStr === selectedDay;
        const dayEvents = eventsByDate[dayStr] ?? [];

        return (
          <button
            key={dayStr}
            type="button"
            onClick={() => onSelectDay(dayStr)}
            className={`flex min-h-[220px] flex-col items-stretch gap-1.5 rounded-lg border border-border bg-card p-2 text-left hover:bg-bg ${
              isSelected ? "ring-2 ring-primary" : ""
            }`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">{WEEKDAY_LABELS[i]}</span>
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday ? "bg-primary text-primary-ink font-semibold" : "text-ink"
                }`}
              >
                {d.getUTCDate()}
              </span>
            </div>
            <span className="text-[10px] text-muted">{MONTH_LABELS[d.getUTCMonth()].slice(0, 3)}</span>
            <div className="flex flex-col gap-1">
              {dayEvents.map((e) => (
                <span key={e.id} className={`flex items-start gap-1 text-[11px] ${e.done ? "text-muted line-through" : "text-ink"}`}>
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotClassFor(e)}`} />
                  <span>{e.time ? `${e.time} ` : ""}{e.label}</span>
                </span>
              ))}
              {dayEvents.length === 0 && <span className="text-[11px] text-muted">Nothing scheduled</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
