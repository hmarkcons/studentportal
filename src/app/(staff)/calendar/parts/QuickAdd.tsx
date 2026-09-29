"use client";

import { useState } from "react";
import { Bell, Clock, GraduationCap, X } from "lucide-react";
import { formatClockLong, longDate, timeOf } from "@/lib/calendarLayout";
import { NOTIFY_CHOICES } from "@/lib/calendarRecurrence";
import { Button } from "@/components/ui/Button";
import type { ActionResult, Draft } from "../types";
import { IconButton } from "./Popover";

/** The editor's form fields for a draft, as the create action reads them. */
export function draftForm(d: Draft): FormData {
  const form = new FormData();
  form.set("type", d.type ?? "personal");
  form.set("title", d.title ?? "");
  form.set("due_date", d.date);
  if (d.start === null) {
    form.set("all_day", "on");
  } else {
    form.set("due_time", timeOf(d.start));
    if (d.end !== null) form.set("end_time", timeOf(d.end));
  }
  form.set("priority", "medium");
  form.set("recurrence", "none");
  if (d.notifyMinutes !== null && d.notifyMinutes !== undefined) form.set("notify_minutes", String(d.notifyMinutes));
  if (d.type === "task" && d.applicationId) form.set("application_id", d.applicationId);
  return form;
}

/**
 * The small card a click on an empty slot opens: a title, what kind of item,
 * when (already chosen by where you clicked), a notification, and Save — or
 * More options for the full editor, carrying what was typed.
 */
export function QuickAdd({
  draft,
  applicationOptions,
  onChange,
  onClose,
  onSave,
  onMore,
}: {
  draft: Draft;
  applicationOptions: { id: string; label: string }[];
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: (form: FormData) => Promise<ActionResult>;
  onMore: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = draft.type ?? "personal";

  async function save() {
    if (type === "task" && !draft.applicationId) {
      setError("Choose the student and application this task is for.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await onSave(draftForm({ ...draft, title: draft.title?.trim() || "(No title)" }));
    setPending(false);
    if (result && typeof result === "object" && result.error) setError(result.error);
  }

  const when =
    draft.start === null || draft.end === null
      ? `${longDate(draft.date)} · All day`
      : `${longDate(draft.date)}  ${formatClockLong(draft.start)} – ${formatClockLong(draft.end)}`;

  return (
    <form
      className="flex flex-col"
      data-quick-add
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center justify-end px-2 pt-2">
        <IconButton label="Close" onClick={onClose}>
          <X aria-hidden className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="flex flex-col gap-4 px-5 pb-5">
        <input
          data-autofocus
          name="title"
          value={draft.title ?? ""}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="Add title"
          aria-label="Title"
          autoComplete="off"
          className="w-full border-b-2 border-border bg-transparent pb-1.5 text-xl text-ink outline-none placeholder:text-muted focus:border-primary"
        />

        <div role="radiogroup" aria-label="What kind of item" className="flex flex-wrap gap-1.5">
          {(
            [
              ["personal", "Personal"],
              ["task", "Student task"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              onClick={() => onChange({ ...draft, type: value })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                type === value ? "bg-primary text-primary-ink" : "text-ink hover:bg-bg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {type === "task" && (
          <div className="flex items-start gap-3">
            <GraduationCap aria-hidden className="mt-2 h-4 w-4 shrink-0 text-muted" />
            <select
              value={draft.applicationId ?? ""}
              onChange={(e) => onChange({ ...draft, applicationId: e.target.value })}
              aria-label="Student and application"
              className="w-full min-w-0 rounded-md border border-border bg-bg px-2.5 py-2 text-sm text-ink"
            >
              <option value="">Choose the student…</option>
              {applicationOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-start gap-3 text-sm">
          <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <div>
            <p className="text-ink" data-quick-when>
              {when}
            </p>
            <p className="text-xs text-muted">Karachi time · Does not repeat</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Bell aria-hidden className="h-4 w-4 shrink-0 text-muted" />
          <select
            value={draft.notifyMinutes === null || draft.notifyMinutes === undefined ? "" : String(draft.notifyMinutes)}
            onChange={(e) => onChange({ ...draft, notifyMinutes: e.target.value === "" ? null : Number(e.target.value) })}
            aria-label="Notification"
            className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-ink"
          >
            {NOTIFY_CHOICES.map((c) => (
              <option key={c.label} value={c.minutes === null ? "" : String(c.minutes)}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onMore} className="text-primary">
            More options
          </Button>
          <Button type="submit" variant="primary" pending={pending} className="rounded-full px-5">
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
