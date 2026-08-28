"use client";

import { useActionState, useState } from "react";
import { createCalendarEvent } from "@/lib/actions/calendarEvents";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TimeSelect } from "./TimeSelect";

export function AddEventForm({
  day,
  applicationOptions,
  revalidateTo,
}: {
  day: string;
  applicationOptions: { id: string; label: string }[];
  revalidateTo: string;
}) {
  const action = createCalendarEvent.bind(null, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = useState<"personal" | "task">("personal");

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-border pt-3">
      <input type="hidden" name="due_date" value={day} />
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="type" value="personal" checked={type === "personal"} onChange={() => setType("personal")} />
          Personal reminder
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="type" value="task" checked={type === "task"} onChange={() => setType("task")} />
          Student/application task
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input name="title" placeholder="Title" required className="min-w-[220px] flex-1" />
        {type === "task" ? (
          <Select name="application_id" required className="w-56">
            <option value="">Choose student…</option>
            {applicationOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        ) : (
          <TimeSelect name="due_time" className="w-40" />
        )}
        <Select name="priority" defaultValue="medium" className="w-28">
          <option value="urgent">Urgent</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          + Add
        </Button>
      </div>
      {type === "task" && applicationOptions.length === 0 && (
        <p className="text-xs text-muted">No applications yet — add a student application before scheduling a task.</p>
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
