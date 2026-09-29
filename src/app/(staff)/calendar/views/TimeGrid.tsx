"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Repeat } from "lucide-react";
import { parseYMD, WEEKDAY_LABELS } from "@/lib/calendarDates";
import {
  blockBox,
  dayDelta,
  displaySpan,
  formatClock,
  formatTimeRange,
  hourLabel,
  karachiClock,
  layoutOverlaps,
  layoutWeekRow,
  minutesAt,
  minutesOf,
  moveTimed,
  resizeEnd,
  shiftDate,
  slotFor,
  timeOf,
} from "@/lib/calendarLayout";
import { compareForDay, coversDate, isGridTimed, type CalendarEvent } from "@/lib/calendarItems";
import { anchorAt, anchorFor, type Anchor, type CalendarDrop, type Draft } from "../types";
import type { EventColor } from "../eventColors";

/** Pixels per hour on the grid, and per lane of the all-day row. */
const HOUR = 48;
const LANE = 24;
/** Lanes the all-day row shows before it offers "+N more". */
const ALL_DAY_LANES = 3;
/** A block is never drawn shorter than this, so a five-minute item can still be clicked. */
const MIN_BLOCK_PX = 20;

type Span = { start: number; end: number };

type Gesture =
  | { kind: "create"; pointerId: number; date: string; y: number; anchorMin: number; currentMin: number | null }
  | { kind: "move"; pointerId: number; event: CalendarEvent; x: number; y: number; moved: boolean; grab: number; grabDay: string; span: Span | null }
  | { kind: "resize"; pointerId: number; event: CalendarEvent; span: Span; end: number };

type Target = { date: string; allDay: boolean; start: number; end: number };

type Preview =
  | { kind: "create"; date: string; start: number; end: number }
  | { kind: "move"; event: CalendarEvent; target: Target | null }
  | { kind: "resize"; eventId: string; end: number };

/** How a timed item is drawn: a reminder is a moment, so a short block; the rest an hour unless they say. */
function spanOf(e: CalendarEvent): Span | null {
  return displaySpan(e.time, e.endTime, e.kind === "reminder" ? 30 : 60);
}

export function TimeGrid({
  days,
  todayStr,
  now,
  events,
  colorOf,
  editable,
  draft,
  onCreate,
  onOpenEvent,
  onOpenDay,
  onDrop,
}: {
  days: string[];
  todayStr: string;
  now: { date: string; minutes: number } | null;
  events: CalendarEvent[];
  colorOf: (e: CalendarEvent) => EventColor;
  editable: boolean;
  /** The quick-add card's item, drawn as "(No title)" where it will go. */
  draft: Draft | null;
  onCreate: (draft: Draft, anchor: Anchor) => void;
  onOpenEvent: (e: CalendarEvent, anchor: Anchor) => void;
  onOpenDay: (date: string) => void;
  onDrop: (e: CalendarEvent, to: CalendarDrop) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const allDayRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // The click that ends a drag is the drag, not a click on what was dragged.
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [expanded, setExpanded] = useState(false);
  const cols = days.length;
  const colStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };

  // ------------------------------------------------------------ layout
  const allDayItems = useMemo(
    () => events.filter((e) => !isGridTimed(e) && days.some((d) => coversDate(e, d))).sort(compareForDay),
    [events, days]
  );
  const allDay = useMemo(
    () =>
      layoutWeekRow(
        allDayItems.map((e) => ({ id: e.id, start: e.date, end: e.spanEnd ?? e.date })),
        days,
        expanded ? Infinity : ALL_DAY_LANES
      ),
    [allDayItems, days, expanded]
  );
  const allDayById = useMemo(() => new Map(allDayItems.map((e) => [e.id, e])), [allDayItems]);
  const anyHidden = allDay.hidden.some((n) => n > 0);
  const draftAllDay = draft && draft.start === null && days.includes(draft.date) ? draft : null;
  // Room for every lane in use, for "+N more", and for the quick-add card's own chip.
  const allDayLanes = Math.max(allDay.lanes + (draftAllDay ? 1 : 0), anyHidden ? ALL_DAY_LANES : 0, 1);

  const timedByDay = useMemo(() => {
    const minMinutes = (MIN_BLOCK_PX / HOUR) * 60;
    return days.map((d) => {
      const list = events.filter((e) => e.date === d && isGridTimed(e));
      const spans = new Map(list.map((e) => [e.id, spanOf(e)!]));
      const placed = layoutOverlaps(
        list.map((e) => ({ id: e.id, ...spans.get(e.id)! })),
        minMinutes
      );
      return { list: new Map(list.map((e) => [e.id, e])), placed };
    });
  }, [events, days]);

  // ------------------------------------------------ scroll to the morning
  const periodKey = `${days[0]}:${cols}`;
  const firstStartRef = useRef<number | null>(null);
  useEffect(() => {
    let first: number | null = null;
    for (const day of timedByDay) for (const p of day.placed) first = first === null ? p.start : Math.min(first, p.start);
    firstStartRef.current = first;
  }, [timedByDay]);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const clock = karachiClock(Date.now());
    const target = days.includes(clock.date) ? clock.minutes - 120 : Math.min(firstStartRef.current ?? 8 * 60, 8 * 60) - 30;
    body.scrollTop = (Math.max(0, target) / 60) * HOUR;
    // Only when the period changes: a save that moves the earliest item must
    // not yank the grid away from where the person has scrolled to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey]);

  // ----------------------------------------------------------- hit tests
  function timeColumnAt(x: number, y: number): { date: string; minutes: number } | null {
    const body = bodyRef.current;
    if (!body) return null;
    const box = body.getBoundingClientRect();
    if (y < box.top || y > box.bottom) return null;
    for (const col of body.querySelectorAll<HTMLElement>("[data-time-date]")) {
      const r = col.getBoundingClientRect();
      if (x >= r.left && x < r.right) return { date: col.dataset.timeDate!, minutes: minutesAt(y - r.top, HOUR) };
    }
    return null;
  }

  function allDayCellAt(x: number, y: number): string | null {
    const row = allDayRef.current;
    if (!row) return null;
    const box = row.getBoundingClientRect();
    if (y < box.top - 4 || y > box.bottom + 4) return null;
    for (const cell of row.querySelectorAll<HTMLElement>("[data-allday-date]")) {
      const r = cell.getBoundingClientRect();
      if (x >= r.left && x < r.right) return cell.dataset.alldayDate!;
    }
    return null;
  }

  function targetFor(g: Extract<Gesture, { kind: "move" }>, x: number, y: number): Target | null {
    const col = g.event.spanEnd ? null : timeColumnAt(x, y);
    if (col) {
      const base = g.span ?? { start: 0, end: 60 };
      const moved = moveTimed(base, col.minutes - g.grab - base.start);
      return { date: col.date, allDay: false, ...moved };
    }
    const day = allDayCellAt(x, y);
    return day ? { date: day, allDay: true, start: 0, end: 0 } : null;
  }

  function dropFor(g: Extract<Gesture, { kind: "move" }>, t: Target): CalendarDrop {
    const e = g.event;
    if (t.allDay) {
      // A bar keeps its length and its times; it moves by as many days as
      // the day under the pointer is from the day it was picked up by.
      if (e.spanEnd) return { date: shiftDate(e.date, dayDelta(g.grabDay, t.date)), time: e.time, endTime: e.endTime };
      return { date: t.date, time: null, endTime: null };
    }
    // An explicit end moves with it; one drawn at the default length stays default.
    return { date: t.date, time: timeOf(t.start), endTime: e.kind !== "reminder" && e.endTime ? timeOf(t.end) : null };
  }

  // ------------------------------------------------------ create by drag
  function onColumnPointerDown(e: React.PointerEvent<HTMLDivElement>, date: string) {
    suppressClick.current = false;
    if (!editable || e.button !== 0 || e.pointerType === "touch") return;
    if ((e.target as HTMLElement).closest("[data-event]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const m = minutesAt(e.clientY - r.top, HOUR);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    gesture.current = { kind: "create", pointerId: e.pointerId, date, y: e.clientY, anchorMin: m, currentMin: null };
    setPreview({ kind: "create", date, ...slotFor(m, null) });
  }

  function onColumnPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.kind !== "create" || g.pointerId !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    g.currentMin = Math.abs(e.clientY - g.y) > 4 ? minutesAt(e.clientY - r.top, HOUR) : null;
    setPreview({ kind: "create", date: g.date, ...slotFor(g.anchorMin, g.currentMin) });
  }

  function onColumnPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.kind !== "create" || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    setPreview(null);
    suppressClick.current = true;
    const slot = slotFor(g.anchorMin, g.currentMin);
    onCreate({ date: g.date, start: slot.start, end: slot.end }, anchorAt(e.clientX, e.clientY));
  }

  /** A tap on a touch screen, where dragging scrolls: the half hour it landed in. */
  function onColumnClick(e: React.MouseEvent<HTMLDivElement>, date: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!editable || (e.target as HTMLElement).closest("[data-event]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const slot = slotFor(minutesAt(e.clientY - r.top, HOUR), null);
    onCreate({ date, start: slot.start, end: slot.end }, anchorAt(e.clientX, e.clientY));
  }

  function cancelGesture() {
    gesture.current = null;
    setPreview(null);
  }

  // ------------------------------------------------------ move an item
  function onItemPointerDown(e: React.PointerEvent<HTMLElement>, ev: CalendarEvent) {
    suppressClick.current = false;
    if (!editable || !ev.can.move || e.button !== 0 || e.pointerType === "touch") return;
    e.stopPropagation();
    const span = isGridTimed(ev) ? spanOf(ev) : null;
    const col = timeColumnAt(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      kind: "move",
      pointerId: e.pointerId,
      event: ev,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      grab: span && col ? col.minutes - span.start : 0,
      grabDay: allDayCellAt(e.clientX, e.clientY) ?? ev.date,
      span,
    };
  }

  function onItemPointerMove(e: React.PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || g.kind !== "move" || g.pointerId !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
    g.moved = true;
    setPreview({ kind: "move", event: g.event, target: targetFor(g, e.clientX, e.clientY) });
  }

  function onItemPointerUp(e: React.PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || g.kind !== "move" || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    setPreview(null);
    if (!g.moved) return;
    suppressClick.current = true;
    const t = targetFor(g, e.clientX, e.clientY);
    if (!t) return;
    const drop = dropFor(g, t);
    const ev = g.event;
    if (drop.date === ev.date && drop.time === ev.time && drop.endTime === ev.endTime) return;
    onDrop(ev, drop);
  }

  function onItemClick(e: React.MouseEvent<HTMLElement>, ev: CalendarEvent) {
    e.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpenEvent(ev, anchorFor(e.currentTarget));
  }

  // ----------------------------------------------------- resize an item
  function onResizePointerDown(e: React.PointerEvent<HTMLElement>, ev: CalendarEvent, span: Span) {
    suppressClick.current = false;
    if (!editable || !ev.can.resize || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind: "resize", pointerId: e.pointerId, event: ev, span, end: span.end };
    setPreview({ kind: "resize", eventId: ev.id, end: span.end });
  }

  function onResizePointerMove(e: React.PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || g.kind !== "resize" || g.pointerId !== e.pointerId) return;
    const col = bodyRef.current?.querySelector<HTMLElement>(`[data-time-date="${g.event.date}"]`);
    if (!col) return;
    g.end = resizeEnd(g.span.start, minutesAt(e.clientY - col.getBoundingClientRect().top, HOUR));
    setPreview({ kind: "resize", eventId: g.event.id, end: g.end });
  }

  function onResizePointerUp(e: React.PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || g.kind !== "resize" || g.pointerId !== e.pointerId) return;
    e.stopPropagation();
    gesture.current = null;
    setPreview(null);
    suppressClick.current = true;
    if (g.end !== g.span.end) onDrop(g.event, { date: g.event.date, time: g.event.time, endTime: timeOf(g.end) });
  }

  const moving = preview?.kind === "move" ? preview : null;
  const draggable = (ev: CalendarEvent) => editable && ev.can.move;

  // ---------------------------------------------------------------- view
  return (
    <div className="flex h-full min-h-0 flex-col select-none" data-full-width data-time-grid>
      {/* Day headings. The same scrollbar gutter as the body below, so the columns line up. */}
      <div className="flex shrink-0 overflow-y-hidden border-b border-border [scrollbar-gutter:stable]">
        <div className="w-14 shrink-0" />
        <div className="grid flex-1" style={colStyle}>
          {days.map((d) => {
            const date = parseYMD(d);
            const isToday = d === todayStr;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onOpenDay(d)}
                aria-label={`Open ${d} in the day view`}
                className={`flex flex-col gap-0.5 border-l border-transparent py-2 ${cols === 1 ? "items-start pl-3" : "items-center"}`}
              >
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? "text-primary" : "text-muted"}`}>
                  {WEEKDAY_LABELS[date.getUTCDay()]}
                </span>
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none transition-colors ${
                    isToday ? "bg-primary font-semibold text-primary-ink" : "text-ink hover:bg-bg"
                  }`}
                >
                  {date.getUTCDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* All-day row: all-day items, items with no time, and spans of several days. */}
      <div className="flex shrink-0 overflow-y-hidden border-b border-border [scrollbar-gutter:stable]">
        <div className="flex w-14 shrink-0 flex-col items-end justify-between py-1 pr-2">
          <span className="text-[10px] text-muted">GMT+05</span>
          {(anyHidden || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Show fewer all-day items" : "Show every all-day item"}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
            >
              {expanded ? <ChevronUp aria-hidden className="h-4 w-4" /> : <ChevronDown aria-hidden className="h-4 w-4" />}
            </button>
          )}
        </div>
        <div ref={allDayRef} className="relative grid flex-1" style={{ ...colStyle, height: allDayLanes * LANE + 6 }} data-allday-row>
          {days.map((d) => (
            <div
              key={d}
              data-allday-date={d}
              onClick={(e) => {
                if (!editable || (e.target as HTMLElement).closest("[data-event]")) return;
                onCreate({ date: d, start: null, end: null }, anchorAt(e.clientX, e.clientY));
              }}
              className={`border-l border-border ${
                moving?.target?.allDay && moving.target.date === d ? "bg-primary/10" : ""
              } ${editable ? "cursor-pointer" : ""}`}
            />
          ))}
          {allDay.placed.map((p) => {
            const ev = allDayById.get(p.id)!;
            const color = colorOf(ev);
            return (
              <button
                key={p.id}
                type="button"
                data-event
                data-event-id={ev.id}
                data-event-title={ev.rawTitle ?? ev.title}
                data-kind={ev.kind}
                data-draggable={draggable(ev) ? "true" : "false"}
                aria-label={`${ev.title}${ev.time ? `, ${formatClock(minutesOf(ev.time) ?? 0)}` : ", all day"}`}
                onPointerDown={(e) => onItemPointerDown(e, ev)}
                onPointerMove={onItemPointerMove}
                onPointerUp={onItemPointerUp}
                onPointerCancel={cancelGesture}
                onClick={(e) => onItemClick(e, ev)}
                className={`absolute flex items-center gap-1 overflow-hidden px-2 text-left text-xs font-medium ${color.solid} ${
                  p.continuesBefore ? "rounded-l-none" : "rounded-l-md"
                } ${p.continuesAfter ? "rounded-r-none" : "rounded-r-md"} ${ev.done ? "opacity-60" : ""} ${
                  moving?.event.id === ev.id ? "opacity-40" : ""
                } ${draggable(ev) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                style={{
                  top: p.lane * LANE + 3,
                  height: LANE - 3,
                  left: `calc(${(p.startCol * 100) / cols}% + 2px)`,
                  width: `calc(${((p.endCol - p.startCol + 1) * 100) / cols}% - 4px)`,
                }}
              >
                {ev.recurrence && ev.recurrence !== "none" && <Repeat aria-hidden className="h-3 w-3 shrink-0 opacity-80" />}
                <span className={`truncate ${ev.done ? "line-through" : ""}`}>
                  {ev.time ? `${formatClock(minutesOf(ev.time) ?? 0)} ` : ""}
                  {ev.title}
                </span>
              </button>
            );
          })}
          {allDay.hidden.map((n, c) =>
            n > 0 ? (
              <button
                key={`more-${days[c]}`}
                type="button"
                onClick={() => setExpanded(true)}
                className="absolute rounded-md px-2 text-left text-xs font-semibold text-ink hover:bg-bg"
                style={{
                  top: (ALL_DAY_LANES - 1) * LANE + 3,
                  height: LANE - 3,
                  left: `calc(${(c * 100) / cols}% + 2px)`,
                  width: `calc(${100 / cols}% - 4px)`,
                }}
              >
                {n} more
              </button>
            ) : null
          )}
          {draftAllDay && (
            <div
              data-draft
              className="pointer-events-none absolute flex items-center rounded-md bg-primary px-2 text-xs font-medium text-primary-ink shadow-lg"
              style={{
                top: Math.min(allDay.lanes, allDayLanes - 1) * LANE + 3,
                height: LANE - 3,
                left: `calc(${(days.indexOf(draftAllDay.date) * 100) / cols}% + 2px)`,
                width: `calc(${100 / cols}% - 4px)`,
              }}
            >
              {draftAllDay.title || "(No title)"}
            </div>
          )}
        </div>
      </div>

      {/* The hours. */}
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]" data-time-body>
        <div className="relative flex" style={{ height: 24 * HOUR }}>
          <div className="relative w-14 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted" style={{ top: h * HOUR }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          <div
            className="relative grid flex-1"
            style={{
              ...colStyle,
              backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
              backgroundSize: `100% ${HOUR}px`,
            }}
          >
            {days.map((d, i) => {
              const day = timedByDay[i];
              return (
                <div
                  key={d}
                  data-time-date={d}
                  onPointerDown={(e) => onColumnPointerDown(e, d)}
                  onPointerMove={onColumnPointerMove}
                  onPointerUp={onColumnPointerUp}
                  onPointerCancel={cancelGesture}
                  onClick={(e) => onColumnClick(e, d)}
                  className={`relative border-l border-border ${editable ? "cursor-pointer" : ""}`}
                >
                  {day.placed.map((p) => {
                    const ev = day.list.get(p.id)!;
                    const color = colorOf(ev);
                    const end = preview?.kind === "resize" && preview.eventId === ev.id ? preview.end : p.end;
                    const box = blockBox(p.start, end, HOUR, MIN_BLOCK_PX);
                    const short = box.height < 34;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        data-event
                        data-event-id={ev.id}
                        data-event-title={ev.rawTitle ?? ev.title}
                        data-kind={ev.kind}
                        data-draggable={draggable(ev) ? "true" : "false"}
                        data-start={timeOf(p.start)}
                        data-end={timeOf(end)}
                        aria-label={`${ev.title}, ${formatTimeRange(p.start, end)}`}
                        onPointerDown={(e) => onItemPointerDown(e, ev)}
                        onPointerMove={onItemPointerMove}
                        onPointerUp={onItemPointerUp}
                        onPointerCancel={cancelGesture}
                        onClick={(e) => onItemClick(e, ev)}
                        className={`absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm ring-1 ring-card ${color.solid} ${
                          ev.done ? "opacity-60" : ""
                        } ${moving?.event.id === ev.id ? "opacity-40" : ""} ${draggable(ev) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                        style={{
                          top: box.top + 1,
                          height: box.height - 2,
                          left: `calc(${(p.column * 100) / p.columns}% + 2px)`,
                          width: `calc(${100 / p.columns}% - 4px)`,
                        }}
                      >
                        {short ? (
                          <span className={`block truncate font-semibold ${ev.done ? "line-through" : ""}`}>
                            {ev.title}
                            <span className="font-normal">, {formatClock(p.start)}</span>
                          </span>
                        ) : (
                          <>
                            <span className={`block truncate font-semibold ${ev.done ? "line-through" : ""}`}>{ev.title}</span>
                            <span className="block truncate opacity-90">{formatTimeRange(p.start, end)}</span>
                            {box.height >= 56 && ev.location && <span className="block truncate opacity-90">{ev.location}</span>}
                          </>
                        )}
                        {editable && ev.can.resize && (
                          <span
                            aria-hidden
                            data-resize-handle
                            onPointerDown={(e) => onResizePointerDown(e, ev, { start: p.start, end: p.end })}
                            onPointerMove={onResizePointerMove}
                            onPointerUp={onResizePointerUp}
                            onPointerCancel={cancelGesture}
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                          />
                        )}
                      </button>
                    );
                  })}

                  {/* Where the dragged item will land. */}
                  {moving?.target && !moving.target.allDay && moving.target.date === d && (
                    <div
                      className={`pointer-events-none absolute inset-x-0.5 z-30 overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight shadow-xl ring-2 ring-card ${colorOf(moving.event).solid}`}
                      style={(() => {
                        const box = blockBox(moving.target.start, moving.target.end, HOUR, MIN_BLOCK_PX);
                        return { top: box.top + 1, height: box.height - 2 };
                      })()}
                    >
                      <span className="block truncate font-semibold">{moving.event.title}</span>
                      <span className="block truncate">{formatTimeRange(moving.target.start, moving.target.end)}</span>
                    </div>
                  )}

                  {/* The stretch being dragged out, or the quick-add card's slot. */}
                  {(() => {
                    const slot =
                      preview?.kind === "create" && preview.date === d
                        ? preview
                        : !preview && draft && draft.start !== null && draft.end !== null && draft.date === d
                          ? { start: draft.start, end: draft.end }
                          : null;
                    if (!slot) return null;
                    const box = blockBox(slot.start, slot.end, HOUR, MIN_BLOCK_PX);
                    return (
                      <div
                        data-draft
                        className="pointer-events-none absolute inset-x-0.5 z-30 overflow-hidden rounded-md bg-primary px-1.5 py-0.5 text-[11px] leading-tight text-primary-ink shadow-xl"
                        style={{ top: box.top + 1, height: box.height - 2 }}
                      >
                        <span className="block truncate font-semibold">{draft?.title || "(No title)"}</span>
                        <span className="block truncate">{formatTimeRange(slot.start, slot.end)}</span>
                      </div>
                    );
                  })()}

                  {now && now.date === d && (
                    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (now.minutes / 60) * HOUR - 1 }} data-now-line>
                      <span className="-ml-1.5 h-3 w-3 shrink-0 rounded-full bg-red-500" />
                      <span className="h-0.5 flex-1 bg-red-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
