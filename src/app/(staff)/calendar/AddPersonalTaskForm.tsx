"use client";

import { useActionState } from "react";
import { createPersonalTask } from "@/lib/actions/personalTasks";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function AddPersonalTaskForm({ day, revalidateTo }: { day: string; revalidateTo: string }) {
  const action = createPersonalTask.bind(null, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="due_date" value={day} />
      <Input name="title" placeholder="Personal reminder / task" required className="min-w-[200px] flex-1" />
      <Input name="due_time" type="time" title="Time (optional)" />
      <Select name="priority" defaultValue="medium">
        <option value="urgent">Urgent</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </Select>
      <Button type="submit" variant="outline-primary" size="sm" pending={pending}>
        + Add personal reminder
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
