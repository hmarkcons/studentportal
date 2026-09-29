import type { CalendarEvent } from "@/lib/calendarItems";

export type { CalendarEvent, CalendarEventKind } from "@/lib/calendarItems";
export type { CalendarView } from "@/lib/calendarLayout";
export type { Recurrence as CalendarRecurrence } from "@/lib/calendarRecurrence";

export type ActionResult = { success?: boolean; error?: string; id?: string } | undefined | null | void;

/** Where a popover opens from: a point on screen, and whether there is more room above it. */
export type Anchor = { x: number; y: number; above: boolean };

export function anchorAt(x: number, y: number): Anchor {
  const h = typeof window === "undefined" ? 800 : window.innerHeight;
  return { x, y, above: y > h * 0.6 };
}

export function anchorFor(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return anchorAt(r.left + r.width / 2, r.bottom);
}

/** Where a dragged item was dropped. `time` null is the all-day row. */
export type CalendarDrop = { date: string; time: string | null; endTime: string | null };

/**
 * What the calendar can do to its items. Absent, the calendar is read-only —
 * the student's — and offers no Create, no quick add, no dragging.
 */
export type CalendarHandlers = {
  create(form: FormData): Promise<ActionResult>;
  update(event: CalendarEvent, form: FormData): Promise<ActionResult>;
  move(event: CalendarEvent, to: CalendarDrop): Promise<ActionResult>;
  toggleDone(event: CalendarEvent, done: boolean): Promise<ActionResult>;
  remove(event: CalendarEvent): Promise<ActionResult>;
  updateReminder(event: CalendarEvent, form: FormData): Promise<ActionResult>;
  /** Finds items on any date; the calendar also searches what it has loaded. */
  search?(query: string): Promise<{ events: CalendarEvent[]; error?: string }>;
};

/** A new item as the quick-add card or Create starts it. */
export type Draft = {
  date: string;
  /** Minutes; null for an all-day item. */
  start: number | null;
  end: number | null;
  title?: string;
  type?: "personal" | "task";
  applicationId?: string;
  notifyMinutes?: number | null;
};
