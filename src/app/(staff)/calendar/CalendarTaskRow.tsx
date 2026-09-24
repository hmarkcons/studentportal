"use client";

import { useActionState, useState } from "react";
import { toggleApplicationTask, deleteApplicationTask } from "@/lib/actions/applications";
import { updateCalendarTask } from "@/lib/actions/calendarEvents";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EventFieldsFieldset } from "./EventFieldsFieldset";
import type { CalendarRecurrence } from "./types";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";

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
  const del = useButtonAction();
  // The done box saves as it is ticked; this says so beside it.
  const toggle = useButtonAction();
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
          <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
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

  // The row goes when the delete works, so success is a toast; a failure is
  // said beside the bin, which is still there.
  function handleDelete() {
    void del.run(() => deleteApplicationTask(taskId, "/calendar"), { toast: "Task deleted." });
  }

  return (
    <div>
      {/* Stacked on a phone: badges and actions holding the right-hand side
          squeezed a long task title into a narrow column of wrapped text. */}
      <div className="flex flex-col gap-1 text-sm lg:flex-row lg:items-center lg:justify-between lg:gap-2">
        <div className="flex flex-wrap items-center gap-x-2">
        <label className="flex items-start gap-2 lg:items-center">
          <input
            type="checkbox"
            checked={done}
            disabled={toggle.pending}
            onChange={async (e) => {
              const checked = e.target.checked;
              const previous = done;
              setDone(checked);
              setToggleError(null);
              // Pending tasks only are listed, so a task ticked done leaves the list
              // on refresh, and its note with it: said as a toast instead.
              const result = await toggle.run(() => toggleApplicationTask(taskId, "/calendar", checked), checked ? { toast: "Marked done." } : {});
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
          <ActionStatus state={toggle.state} pending={toggle.pending} label={done ? "Marked done." : "Marked not done."} />
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-6 lg:pl-0">
          <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>
          <Badge tone={tone}>Task</Badge>
          <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
            ✏️
          </button>
          <button onClick={handleDelete} disabled={del.pending} className="w-fit text-xs text-muted hover:text-danger disabled:opacity-50">
            🗑️
          </button>
          <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
        </div>
      </div>
      {toggleError && <p className="text-xs text-danger">{toggleError}</p>}
    </div>
  );
}
