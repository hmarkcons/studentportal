"use client";

import { useMemo, useRef, useState } from "react";
import { Repeat } from "lucide-react";
import { parseYMD, WEEKDAY_LABELS, MONTH_LABELS } from "@/lib/calendarDates";
import { dayDelta, formatClock, layoutWeekRow, minutesOf, periodDays, shiftDate, weeksOf } from "@/lib/calendarLayout";
import { compareForDay, coversDate, type CalendarEvent } from "@/lib/calendarItems";
import { anchorAt, anchorFor, type Anchor, type CalendarDrop, type Draft } from "../types";
import type { EventColor } from "../eventColors";

/** Lanes a day shows; a busier day gives the last one to "N more". */
const MAX_LANES = 4;
const LANE = 22;
const HEAD = 28;

type Drag = { pointerId: number; event: CalendarEvent; x: number; y: number; moved: boolean; grabDay: string };

export function MonthView({
  referenceDate,
  todayStr,
  events,
  colorOf,
  editable,
  draft,
  onCreate,
  onOpenEvent,
  onOpenDay,
  onMoreOnDay,
  onDrop,
}: {
  referenceDate: string;
  todayStr: string;
  events: CalendarEvent[];
  colorOf: (e: CalendarEvent) => EventColor;
  editable: boolean;
  draft: Draft | null;
  onCreate: (draft: Draft, anchor: Anchor) => void;
  onOpenEvent: (e: CalendarEvent, anchor: Anchor) => void;
  onOpenDay: (date: string) => void;
  onMoreOnDay: (date: string, anchor: Anchor) => void;
  onDrop: (e: CalendarEvent, to: CalendarDrop) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [over, setOver] = useState<{ eventId: string; date: string | null } | null>(null);

  const month = parseYMD(referenceDate).getUTCMonth();
  const weeks = useMemo(() => weeksOf(periodDays("month", referenceDate)), [referenceDate]);
  const rows = useMemo(
    () =>
      weeks.map((row) => {
        const items = events.filter((e) => row.some((d) => coversDate(e, d))).sort(compareForDay);
        const layout = layoutWeekRow(
          items.map((e) => ({ id: e.id, start: e.date, end: e.spanEnd ?? e.date })),
          row,
          MAX_LANES
        );
        return { row, byId: new Map(items.map((e) => [e.id, e])), ...layout };
      }),
    [weeks, events]
  );

  function cellAt(x: number, y: number): string | null {
    for (const cell of gridRef.current?.querySelectorAll<HTMLElement>("[data-month-date]") ?? []) {
      const r = cell.getBoundingClientRect();
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return cell.dataset.monthDate!;
    }
    return null;
  }

  function onChipPointerDown(e: React.PointerEvent<HTMLElement>, ev: CalendarEvent) {
    suppressClick.current = false;
    if (!editable || !ev.can.move || e.button !== 0 || e.pointerType === "touch") return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, event: ev, x: e.clientX, y: e.clientY, moved: false, grabDay: cellAt(e.clientX, e.clientY) ?? ev.date };
  }

  function onChipPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    setOver({ eventId: d.event.id, date: cellAt(e.clientX, e.clientY) });
  }

  function onChipPointerUp(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setOver(null);
    if (!d.moved) return;
    suppressClick.current = true;
    const target = cellAt(e.clientX, e.clientY);
    if (!target) return;
    // A bar moves by the days between where it was picked up and where it
    // was put down, so grabbing its third day and dropping on Friday puts
    // that third day on Friday.
    const date = shiftDate(d.event.date, dayDelta(d.grabDay, target));
    if (date === d.event.date) return;
    onDrop(d.event, { date, time: d.event.time, endTime: d.event.endTime });
  }

  function onChipClick(e: React.MouseEvent<HTMLElement>, ev: CalendarEvent) {
    e.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpenEvent(ev, anchorFor(e.currentTarget));
  }

  return (
    <div className="flex h-full min-h-0 flex-col select-none" data-full-width data-month-grid>
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
            {label}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 overflow-y-auto"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(7.25rem, 1fr))` }}
      >
        {rows.map(({ row, byId, placed, hidden }) => (
          <div key={row[0]} className="relative grid grid-cols-7 border-b border-border last:border-b-0">
            {row.map((d) => {
              const date = parseYMD(d);
              const inMonth = date.getUTCMonth() === month;
              const isToday = d === todayStr;
              const first = date.getUTCDate() === 1;
              return (
                <div
                  key={d}
                  data-month-date={d}
                  onClick={(e) => {
                    if (!editable || (e.target as HTMLElement).closest("[data-event], button")) return;
                    onCreate({ date: d, start: null, end: null }, anchorAt(e.clientX, e.clientY));
                  }}
                  className={`relative border-l border-border first:border-l-0 ${over?.date === d ? "bg-primary/10" : ""} ${
                    !inMonth ? "bg-bg/60" : ""
                  } ${editable ? "cursor-pointer" : ""}`}
                >
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenDay(d)}
                      aria-label={`Open ${d} in the day view`}
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium ${
                        isToday ? "bg-primary text-primary-ink" : inMonth ? "text-ink hover:bg-bg" : "text-muted hover:bg-bg"
                      }`}
                    >
                      {first ? `${MONTH_LABELS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}` : date.getUTCDate()}
                    </button>
                  </div>
                  {draft && draft.start === null && draft.date === d && (
                    <div
                      data-draft
                      className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-ink shadow-lg"
                    >
                      {draft.title || "(No title)"}
                    </div>
                  )}
                </div>
              );
            })}

            {placed.map((p) => {
              const ev = byId.get(p.id)!;
              const color = colorOf(ev);
              const bar = Boolean(ev.spanEnd) || ev.time === null;
              const canDrag = editable && ev.can.move;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-event
                  data-event-id={ev.id}
                  data-event-title={ev.rawTitle ?? ev.title}
                  data-kind={ev.kind}
                  data-draggable={canDrag ? "true" : "false"}
                  aria-label={`${ev.title}${ev.time ? `, ${formatClock(minutesOf(ev.time) ?? 0)}` : ""}`}
                  onPointerDown={(e) => onChipPointerDown(e, ev)}
                  onPointerMove={onChipPointerMove}
                  onPointerUp={onChipPointerUp}
                  onPointerCancel={() => {
                    drag.current = null;
                    setOver(null);
                  }}
                  onClick={(e) => onChipClick(e, ev)}
                  className={`absolute flex items-center gap-1.5 overflow-hidden px-1.5 text-left text-xs ${
                    bar ? `${color.solid} font-medium` : "text-ink hover:bg-bg"
                  } ${p.continuesBefore ? "rounded-l-none" : "rounded-l-md"} ${p.continuesAfter ? "rounded-r-none" : "rounded-r-md"} ${
                    ev.done ? "opacity-60" : ""
                  } ${over?.eventId === ev.id ? "opacity-40" : ""} ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                  style={{
                    top: HEAD + p.lane * LANE,
                    height: LANE - 2,
                    left: `calc(${(p.startCol * 100) / 7}% + 3px)`,
                    width: `calc(${((p.endCol - p.startCol + 1) * 100) / 7}% - 6px)`,
                  }}
                >
                  {!bar && <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />}
                  {bar && ev.recurrence && ev.recurrence !== "none" && <Repeat aria-hidden className="h-3 w-3 shrink-0 opacity-80" />}
                  <span className={`truncate ${ev.done ? "line-through" : ""}`}>
                    {!bar && ev.time && <span className="text-muted">{formatClock(minutesOf(ev.time) ?? 0)} </span>}
                    {ev.title}
                  </span>
                </button>
              );
            })}

            {hidden.map((n, c) =>
              n > 0 ? (
                <button
                  key={`more-${row[c]}`}
                  type="button"
                  onClick={(e) => onMoreOnDay(row[c], anchorFor(e.currentTarget))}
                  className="absolute rounded-md px-1.5 text-left text-xs font-semibold text-ink hover:bg-bg"
                  style={{
                    top: HEAD + (MAX_LANES - 1) * LANE,
                    height: LANE - 2,
                    left: `calc(${(c * 100) / 7}% + 3px)`,
                    width: `calc(${100 / 7}% - 6px)`,
                  }}
                >
                  {n} more
                </button>
              ) : null
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
