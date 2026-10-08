"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlignLeft, Bell, Flag, GraduationCap, MapPin, Palette, Repeat, Users, X } from "lucide-react";
import { dayDelta, minutesOf, shiftDate, timeOf } from "@/lib/calendarLayout";
import { NOTIFY_CHOICES, RECURRENCE_KINDS, recurrenceLabel } from "@/lib/calendarRecurrence";
import type { CalendarEvent } from "@/lib/calendarItems";
import { Button } from "@/components/ui/Button";
import { ColorPicker } from "../ColorPicker";
import { TimeSelect } from "../TimeSelect";
import type { ActionResult, Draft } from "../types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EditorMode = { kind: "create"; draft: Draft } | { kind: "edit"; event: CalendarEvent };

type State = {
  title: string;
  type: "personal" | "task";
  applicationId: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  recurrence: string;
  recurrenceEnd: string;
  location: string;
  notify: string;
  color: string;
  priority: string;
  notes: string;
  guests: string[];
};

function initialState(mode: EditorMode): State {
  if (mode.kind === "create") {
    const d = mode.draft;
    const start = d.start ?? 9 * 60;
    return {
      title: d.title ?? "",
      type: d.type ?? "personal",
      applicationId: d.applicationId ?? "",
      startDate: d.date,
      endDate: d.date,
      allDay: d.start === null,
      startTime: timeOf(start),
      endTime: timeOf(d.end ?? Math.min(start + 60, 1439)),
      recurrence: "none",
      recurrenceEnd: "",
      location: "",
      notify: d.notifyMinutes === null || d.notifyMinutes === undefined ? "" : String(d.notifyMinutes),
      color: "",
      priority: "medium",
      notes: "",
      guests: [],
    };
  }
  const e = mode.event;
  const start = minutesOf(e.time);
  const startDate = e.startDate ?? e.date;
  return {
    title: e.rawTitle ?? e.title,
    type: e.source?.table === "application_tasks" ? "task" : "personal",
    applicationId: "",
    startDate,
    endDate: e.endDate && e.endDate > startDate ? e.endDate : startDate,
    allDay: start === null,
    startTime: timeOf(start ?? 9 * 60),
    endTime: e.endTime ?? timeOf(Math.min((start ?? 9 * 60) + 60, 1439)),
    recurrence: e.recurrence ?? "none",
    recurrenceEnd: e.recurrenceEndDate ?? "",
    location: e.location ?? "",
    notify: e.notifyMinutes === null || e.notifyMinutes === undefined ? "" : String(e.notifyMinutes),
    color: e.color ?? "",
    priority: e.priority ?? "medium",
    notes: e.notes ?? "",
    guests: e.guestEmails ?? [],
  };
}

const inputClass = "rounded-md border border-border bg-bg px-2.5 py-2 text-sm text-ink outline-none focus:border-primary";

/**
 * The full editor, laid out as Google's: the title across the top with Save
 * beside it; start date and time, "to", end time and end date; All day and
 * the repeat under them; then the details down the left and the guests on the
 * right. A repeating item is edited as a whole series.
 */
export function EventEditor({
  mode,
  applicationOptions,
  kindColor,
  onClose,
  onSave,
}: {
  mode: EditorMode;
  applicationOptions: { id: string; label: string }[];
  /** The default colour of personal items and of tasks, for the swatch that means "default". */
  kindColor: (type: "personal" | "task") => string;
  onClose: () => void;
  onSave: (form: FormData) => Promise<ActionResult>;
}) {
  const [s, setS] = useState<State>(() => initialState(mode));
  const [guestDraft, setGuestDraft] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    titleRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const set = <K extends keyof State>(key: K, value: State[K]) => setS((prev) => ({ ...prev, [key]: value }));
  const sameDay = s.endDate <= s.startDate;
  const editing = mode.kind === "edit";
  const event = mode.kind === "edit" ? mode.event : null;
  const series = event && event.recurrence && event.recurrence !== "none";

  function changeStartDate(value: string) {
    if (!value) return;
    setS((prev) => {
      const moved = dayDelta(prev.startDate, value);
      const endDate = prev.endDate > prev.startDate ? shiftDate(prev.endDate, moved) : value;
      return { ...prev, startDate: value, endDate };
    });
  }

  function changeStartTime(value: string) {
    setS((prev) => {
      const oldStart = minutesOf(prev.startTime) ?? 0;
      const oldEnd = minutesOf(prev.endTime) ?? oldStart + 60;
      const start = minutesOf(value) ?? 0;
      // Keep the length, as Google does, when it all happens on one day.
      const endTime = prev.endDate <= prev.startDate ? timeOf(Math.min(start + Math.max(oldEnd - oldStart, 15), 1439)) : prev.endTime;
      return { ...prev, startTime: value, endTime };
    });
  }

  function addGuests(raw: string) {
    const parts = raw
      .split(/[,;\s]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return true;
    const bad = parts.filter((p) => !EMAIL.test(p));
    if (bad.length) {
      setGuestError(`${bad.join(", ")} ${bad.length === 1 ? "is" : "are"} not an email address.`);
      return false;
    }
    setGuestError(null);
    setS((prev) => ({ ...prev, guests: [...new Set([...prev.guests, ...parts])] }));
    setGuestDraft("");
    return true;
  }

  async function save() {
    if (guestDraft.trim() && !addGuests(guestDraft)) return;
    if (!editing && s.type === "task" && !s.applicationId) {
      setError("Choose the student and application this task is for.");
      return;
    }
    const form = new FormData();
    form.set("type", s.type);
    form.set("title", s.title.trim() || "(No title)");
    form.set("due_date", s.startDate);
    if (s.endDate > s.startDate) form.set("end_date", s.endDate);
    if (s.allDay) form.set("all_day", "on");
    else {
      form.set("due_time", s.startTime);
      form.set("end_time", s.endTime);
    }
    form.set("recurrence", s.recurrence);
    if (s.recurrence !== "none" && s.recurrenceEnd) form.set("recurrence_end_date", s.recurrenceEnd);
    form.set("location", s.location);
    form.set("notify_minutes", s.notify);
    form.set("color", s.color);
    form.set("priority", s.priority);
    form.set("notes", s.notes);
    form.set("guest_emails", [...s.guests, ...(guestDraft.trim() ? [guestDraft.trim().toLowerCase()] : [])].join(", "));
    if (s.type === "task" && s.applicationId) form.set("application_id", s.applicationId);

    setPending(true);
    setError(null);
    const result = await onSave(form);
    setPending(false);
    if (result && typeof result === "object" && result.error) setError(result.error);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 sm:p-6" data-event-editor data-full-width role="dialog" aria-modal="true" aria-label={editing ? "Edit event" : "New event"}>
      <form
        className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-5 bg-card p-4 text-ink shadow-2xl sm:min-h-0 sm:rounded-2xl sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {/* Title and Save */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close without saving"
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
          <input
            ref={titleRef}
            name="title"
            value={s.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Add title"
            aria-label="Title"
            autoComplete="off"
            className="min-w-0 flex-1 border-b-2 border-border bg-transparent pb-1.5 text-2xl text-ink outline-none placeholder:text-muted focus:border-primary"
          />
          <Button type="submit" variant="primary" size="lg" pending={pending} className="rounded-full px-6">
            Save
          </Button>
        </div>

        {/* When */}
        <div className="flex flex-col gap-3 sm:pl-[3.25rem]">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              required
              value={s.startDate}
              onChange={(e) => changeStartDate(e.target.value)}
              aria-label="Start date"
              className={inputClass}
            />
            {!s.allDay && <TimeSelect label="Start time" value={s.startTime} onChange={changeStartTime} />}
            <span className="text-sm text-muted">to</span>
            {!s.allDay && <TimeSelect label="End time" value={s.endTime} onChange={(v) => set("endTime", v)} after={sameDay ? s.startTime : null} />}
            <input
              type="date"
              value={s.endDate}
              min={s.startDate}
              onChange={(e) => set("endDate", e.target.value && e.target.value >= s.startDate ? e.target.value : s.startDate)}
              aria-label="End date"
              className={inputClass}
            />
            <span className="text-xs text-muted">Karachi time</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={s.allDay} onChange={(e) => set("allDay", e.target.checked)} className="h-4 w-4 accent-primary" />
              All day
            </label>
            <div className="flex items-center gap-2">
              <Repeat aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <select value={s.recurrence} onChange={(e) => set("recurrence", e.target.value)} aria-label="Repeat" className={inputClass}>
                {RECURRENCE_KINDS.map((r) => (
                  <option key={r} value={r}>
                    {recurrenceLabel(r, s.startDate)}
                  </option>
                ))}
              </select>
            </div>
            {s.recurrence !== "none" && (
              <label className="flex items-center gap-2 text-sm text-muted">
                Until
                <input
                  type="date"
                  value={s.recurrenceEnd}
                  min={s.startDate}
                  onChange={(e) => set("recurrenceEnd", e.target.value)}
                  aria-label="Repeat until"
                  className={inputClass}
                />
              </label>
            )}
          </div>
          {series && <p className="text-xs text-muted">This repeats — what you change here applies to every occurrence.</p>}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Event details */}
          <section className="flex flex-col gap-4 rounded-2xl border border-border p-4" aria-label="Event details">
            <h3 className="border-b-2 border-primary pb-1 text-sm font-semibold text-primary w-fit">Event details</h3>

            <div className="flex items-start gap-3">
              <GraduationCap aria-hidden className="mt-2.5 h-4 w-4 shrink-0 text-muted" />
              {editing ? (
                <p className="py-2 text-sm text-ink">
                  {s.type === "task" ? `Student task${event?.studentName ? ` — ${event.studentName}` : ""}` : "Personal"}
                </p>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div role="radiogroup" aria-label="What kind of item" className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["personal", "Personal"],
                        ["task", "Student/application task"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={s.type === value}
                        onClick={() => set("type", value)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${s.type === value ? "bg-primary text-primary-ink" : "border border-border text-ink hover:bg-bg"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {s.type === "task" && (
                    <select
                      value={s.applicationId}
                      onChange={(e) => set("applicationId", e.target.value)}
                      aria-label="Student and application"
                      className={`${inputClass} w-full`}
                    >
                      <option value="">Choose the student…</option>
                      {applicationOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <MapPin aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <input
                name="location"
                value={s.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Add location"
                aria-label="Location"
                maxLength={500}
                className={`${inputClass} w-full`}
              />
            </div>

            <div className="flex items-center gap-3">
              <Bell aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <select value={s.notify} onChange={(e) => set("notify", e.target.value)} aria-label="Notification" className={inputClass}>
                {NOTIFY_CHOICES.map((c) => (
                  <option key={c.label} value={c.minutes === null ? "" : String(c.minutes)}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <Palette aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <ColorPicker value={s.color} onChange={(v) => set("color", v)} defaultColor={kindColor(s.type)} />
            </div>

            <div className="flex items-center gap-3">
              <Flag aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <select value={s.priority} onChange={(e) => set("priority", e.target.value)} aria-label="Priority" className={inputClass}>
                <option value="urgent">Urgent</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
            </div>

            <div className="flex items-start gap-3">
              <AlignLeft aria-hidden className="mt-2.5 h-4 w-4 shrink-0 text-muted" />
              <textarea
                name="notes"
                value={s.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Add description"
                aria-label="Description"
                rows={5}
                className={`${inputClass} w-full`}
              />
            </div>
          </section>

          {/* Guests */}
          <section className="flex flex-col gap-3" aria-label="Guests">
            <h3 className="border-b-2 border-primary pb-1 text-sm font-semibold text-primary w-fit">Guests</h3>
            <div className="flex items-center gap-2">
              <Users aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <input
                value={guestDraft}
                onChange={(e) => setGuestDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addGuests(guestDraft);
                  }
                }}
                onBlur={() => guestDraft.trim() && addGuests(guestDraft)}
                placeholder="Add guests by email"
                aria-label="Add guests"
                // Text, not type=email: the browser's own check on a half-typed
                // address would silently stop the whole form from saving.
                type="text"
                inputMode="email"
                className={`${inputClass} w-full`}
              />
            </div>
            {guestError && <p className="text-xs text-danger">{guestError}</p>}
            {s.guests.length > 0 && (
              <ul className="flex flex-col gap-1" data-guest-list>
                {s.guests.map((g) => (
                  <li key={g} className="flex items-center justify-between gap-2 rounded-md bg-bg px-2.5 py-1.5 text-sm text-ink">
                    <span className="truncate">{g}</span>
                    <button
                      type="button"
                      onClick={() => set("guests", s.guests.filter((x) => x !== g))}
                      aria-label={`Remove ${g}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-card hover:text-danger"
                    >
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">Guests are emailed an invitation that adds it to their own calendar, an update when it changes, a cancellation if it is deleted, and a reminder the day before and an hour before.</p>
          </section>
        </div>

        {error && (
          <p className="rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>,
    document.body
  );
}
