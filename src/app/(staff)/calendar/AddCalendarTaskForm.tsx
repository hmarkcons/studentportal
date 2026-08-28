"use client";

import { useActionState, useState } from "react";
import { addApplicationTask } from "@/lib/actions/applications";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export function AddCalendarTaskForm({
  applications,
  defaultDate,
}: {
  applications: { id: string; label: string }[];
  defaultDate?: string;
}) {
  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? "");
  const action = addApplicationTask.bind(null, applicationId, "", "/calendar");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (applications.length === 0) {
    return <EmptyState>No applications yet — add a student application before scheduling a task.</EmptyState>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
        {applications.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </Select>
      <Input name="description" placeholder="Task" required className="min-w-[200px] flex-1" />
      <Input name="due_date" type="date" defaultValue={defaultDate} required />
      <Select name="priority" defaultValue="medium">
        <option value="urgent">Urgent</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </Select>
      <Button type="submit" variant="primary" pending={pending}>
        Add task
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
