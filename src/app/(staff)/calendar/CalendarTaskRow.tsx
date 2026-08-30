"use client";

import { useActionState, useState } from "react";
import { toggleApplicationTask, deleteApplicationTask } from "@/lib/actions/applications";
import { updateCalendarTask } from "@/lib/actions/calendarEvents";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EventFieldsFieldset } from "./EventFieldsFieldset";
import type { CalendarRecurrence } from "./types";

const PRIORITY_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  medium: "warning",
  low: "neutral",
};

const RECURRENCE_LABEL: Record<string, string> = {
  daily: "Repeats daily",
  weekly: "Repeats weekly",
  monthly: "Repeats monthly",
};

export function CalendarTaskRow({
  taskId,
  label,
  description,
  dueDate,
  priority,
  tone,
  notes,
  allDay = true,
  time,
  endDate,
  color,
  guestEmails = [],
  recurrence = "none",
  recurrenceEndDate,
  isRecurrenceInstance,
  done: initialDone = false,
}: {
  taskId: string;
  label: string;
  description: string;
  dueDate: string;
  priority: string;
  tone: "warning" | "danger" | "info";
  notes?: string | null;
  allDay?: boolean;
  time?: string | null;
  endDate?: string | null;
  color?: string | null;
  guestEmails?: string[];
  recurrence?: CalendarRecurrence;
  recurrenceEndDate?: string | null;
  isRecurrenceInstance?: boolean;
  done?: boolean;
}) {
  const [done, setDone] = useState(initialDone);
  const [editing, setEditing] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = updateCalendarTask.bind(null, taskId, "/calendar");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-2 rounded-md border border-border p-2">
        {isRecurrenceInstance && (
          <p className="text-xs text-muted">This task repeats — changes here apply to the whole series.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Input name="title" defaultValue={description} required className="min-w-[160px] flex-1" />
          <Input name="due_date" type="date" defaultValue={dueDate.slice(0, 10)} required />
          <Select name="priority" defaultValue={priority}>
            <option value="urgent">Urgent</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        <EventFieldsFieldset
          allDayDefault={allDay}
          timeDefault={time}
          endDateDefault={endDate}
          notesDefault={notes}
          colorDefault={color}
          guestEmailsDefault={guestEmails}
          recurrenceDefault={recurrence}
          recurrenceEndDateDefault={recurrenceEndDate}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" pending={pending}>
            Save
          </Button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
            Cancel
          </button>
        </div>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  async function handleDelete() {
    setDeleteError(null);
    const result = await deleteApplicationTask(taskId, "/calendar");
    if (result?.error) setDeleteError(result.error);
  }

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={done}
            onChange={async (e) => {
              const checked = e.target.checked;
              const previous = done;
              setDone(checked);
              setToggleError(null);
              const result = await toggleApplicationTask(taskId, "/calendar", checked);
              if (result?.error) {
                setToggleError(result.error);
                setDone(previous);
              }
            }}
          />
          <span className={done ? "text-muted line-through" : "text-ink"}>
            {!allDay && time && <span className="mr-1 font-mono text-xs text-muted">{time}</span>}
            {label}
          </span>
          {recurrence !== "none" && (
            <span title={RECURRENCE_LABEL[recurrence]} className="text-xs text-muted">
              🔁
            </span>
          )}
          {guestEmails.length > 0 && (
            <span title={`Guests: ${guestEmails.join(", ")}`} className="text-xs text-muted">
              👥
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>
          <Badge tone={tone}>Task</Badge>
          <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
            ✏️
          </button>
          <button onClick={handleDelete} className="text-xs text-muted hover:text-danger">
            🗑️
          </button>
        </div>
      </div>
      {toggleError && <p className="text-xs text-danger">{toggleError}</p>}
      {deleteError && <p className="text-xs text-danger">{deleteError}</p>}
    </div>
  );
}
