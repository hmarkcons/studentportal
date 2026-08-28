"use client";

import { getMonthGridDays, parseYMD, toYMD, WEEKDAY_LABELS } from "@/lib/calendarDates";
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

const MAX_VISIBLE = 3;

export function MonthGrid({
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
  const currentMonth = refDate.getUTCMonth();
  const days = getMonthGridDays(refDate);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-bg">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dayStr = toYMD(d);
          const inMonth = d.getUTCMonth() === currentMonth;
          const isToday = dayStr === todayStr;
          const isSelected = dayStr === selectedDay;
          const dayEvents = eventsByDate[dayStr] ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;

          return (
            <button
              key={dayStr}
              type="button"
              onClick={() => onSelectDay(dayStr)}
              className={`flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-border p-1.5 text-left last:border-r-0 hover:bg-bg ${
                isSelected ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" : ""
              } ${!inMonth ? "opacity-40" : ""}`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday ? "bg-primary text-primary-ink font-semibold" : "text-ink"
                }`}
              >
                {d.getUTCDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {visible.map((e) => (
                  <span key={e.id} className={`flex items-center gap-1 truncate text-[11px] ${e.done ? "text-muted line-through" : "text-ink"}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClassFor(e)}`} />
                    <span className="truncate">{e.time ? `${e.time} ` : ""}{e.label}</span>
                  </span>
                ))}
                {overflow > 0 && <span className="text-[11px] text-muted">+{overflow} more</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
