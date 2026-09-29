"use client";

import Link from "next/link";
import { useState } from "react";
import { AlignLeft, ArrowRight, Bell, Clock, Info, MapPin, Pencil, Tag, Trash2, UserRound, Users, X } from "lucide-react";
import { displaySpan, formatClock, formatTimeRange, longDate, minutesOf, shortDate } from "@/lib/calendarLayout";
import { notifyLabel, recurrenceLabel } from "@/lib/calendarRecurrence";
import type { CalendarEvent } from "@/lib/calendarItems";
import { Button } from "@/components/ui/Button";
import type { EventColor } from "../eventColors";
import type { ActionResult } from "../types";
import { IconButton } from "./Popover";

const PRIORITY: Record<string, string> = { urgent: "Urgent", medium: "Medium priority", low: "Low priority" };

/** "Tuesday, September 22 · 6 – 7pm", "Sep 22 – 25", "Tuesday, September 22". */
export function whenLine(e: CalendarEvent): string {
  const start = minutesOf(e.time);
  const end = minutesOf(e.endTime);
  if (e.spanEnd) {
    const year = e.date.slice(0, 4) !== e.spanEnd.slice(0, 4);
    const a = shortDate(e.date, year);
    const b = shortDate(e.spanEnd, year);
    return start !== null ? `${a}, ${formatClock(start)} – ${b}${end !== null ? `, ${formatClock(end)}` : ""}` : `${a} – ${b}`;
  }
  const day = longDate(e.date);
  if (start === null) return day;
  if (e.kind === "reminder" || end === null) return `${day} · ${formatClock(start)}`;
  const span = displaySpan(e.time, e.endTime)!;
  return `${day} · ${formatTimeRange(span.start, span.end)}`;
}

function Row({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * What an item is, when and where — Google's event card. Edit and Delete for
 * what the calendar owns; for a record kept elsewhere, where to change it.
 */
export function EventDetails({
  event,
  noun,
  color,
  readOnly,
  onClose,
  onEdit,
  onDelete,
  onToggle,
  onSaveReminder,
}: {
  event: CalendarEvent;
  noun: string;
  color: EventColor;
  readOnly: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (done: boolean) => void;
  onSaveReminder: (form: FormData) => Promise<ActionResult>;
}) {
  const [editingReminder, setEditingReminder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const can = readOnly ? { edit: false, remove: false, tick: false } : event.can;
  const recurring = event.recurrence && event.recurrence !== "none";

  async function saveReminder(form: FormData) {
    setSaving(true);
    setError(null);
    const result = await onSaveReminder(form);
    setSaving(false);
    if (result && typeof result === "object" && result.error) setError(result.error);
    else setEditingReminder(false);
  }

  return (
    <div className="flex flex-col" data-event-details data-event-id={event.id}>
      <div className="flex items-center justify-end gap-0.5 px-2 pt-2">
        {can.edit && (
          <IconButton label={event.kind === "reminder" ? "Edit reminder" : "Edit event"} onClick={event.kind === "reminder" ? () => setEditingReminder(true) : onEdit}>
            <Pencil aria-hidden className="h-4 w-4" />
          </IconButton>
        )}
        {can.remove && (
          <IconButton label="Delete" tone="danger" onClick={onDelete}>
            <Trash2 aria-hidden className="h-4 w-4" />
          </IconButton>
        )}
        <IconButton label="Close" onClick={onClose}>
          <X aria-hidden className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex flex-col gap-3 px-5 pb-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded ${color.swatch}`} />
          <div className="min-w-0">
            <p className={`text-lg font-semibold leading-snug text-ink ${event.done ? "line-through opacity-70" : ""}`} data-event-heading>
              {event.title}
            </p>
            <p className="text-sm text-muted">{whenLine(event)}</p>
            {recurring && <p className="text-sm text-muted">{recurrenceLabel(event.recurrence, event.startDate ?? event.date)}</p>}
          </div>
        </div>

        {editingReminder ? (
          <form
            className="flex flex-col gap-2 rounded-xl border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveReminder(new FormData(e.currentTarget));
            }}
          >
            <div className="flex flex-wrap gap-2">
              <input
                name="due_date"
                type="date"
                required
                defaultValue={event.date}
                aria-label="Date"
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-ink"
              />
              <input
                name="due_time"
                type="time"
                defaultValue={event.time ?? ""}
                aria-label="Time"
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-ink"
              />
            </div>
            <input
              name="note"
              defaultValue={event.notes ?? ""}
              placeholder="Remark"
              aria-label="Remark"
              className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-ink"
            />
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" pending={saving}>
                Save
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingReminder(false)}>
                Cancel
              </Button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </form>
        ) : (
          <>
            {event.location && <Row icon={MapPin}>{event.location}</Row>}
            {event.notifyMinutes !== null && event.notifyMinutes !== undefined && <Row icon={Bell}>{notifyLabel(event.notifyMinutes)}</Row>}
            {event.guestEmails && event.guestEmails.length > 0 && (
              <Row icon={Users}>
                <p className="text-ink">
                  {event.guestEmails.length} guest{event.guestEmails.length === 1 ? "" : "s"}
                </p>
                <ul className="text-xs text-muted">
                  {event.guestEmails.map((g) => (
                    <li key={g} className="truncate">
                      {g}
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            {event.notes && (
              <Row icon={AlignLeft}>
                <p className="whitespace-pre-line break-words text-ink">{event.notes}</p>
              </Row>
            )}
            <Row icon={Tag}>
              <span className="text-ink">{noun}</span>
              {event.priority && event.kind !== "reminder" && <span className="text-muted"> · {PRIORITY[event.priority] ?? event.priority}</span>}
            </Row>
            {event.subtitle && event.kind !== "task" && event.kind !== "reminder" && event.kind !== "personal" && (
              <Row icon={UserRound}>{event.subtitle}</Row>
            )}
            {event.origin && (
              <Row icon={Info}>
                <p className="text-muted">{event.origin}</p>
              </Row>
            )}
            {event.href && (
              <Link
                href={event.href}
                prefetch={false}
                className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                data-event-link
              >
                {event.hrefLabel ?? "Open"}
                <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
              </Link>
            )}
            {can.tick && (
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-bg">
                <input
                  type="checkbox"
                  checked={event.done}
                  onChange={(e) => onToggle(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                  data-done-toggle
                />
                {event.kind === "reminder" ? "Resolved" : "Mark as done"}
              </label>
            )}
          </>
        )}
      </div>
    </div>
  );
}
