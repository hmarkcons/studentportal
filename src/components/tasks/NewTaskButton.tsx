"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";
import { createTask } from "@/lib/actions/staffTasks";
import { NOTES_MAX, STEP_MAX, TASK_FILE_ACCEPT, TITLE_MAX } from "@/lib/staffTasks";
import type { TaskPerson } from "@/lib/staffTasksLoad";
import { toast } from "@/lib/toast";
import { PeoplePicker } from "./PeoplePicker";
import { StudentPicker, type PickedStudent } from "./StudentPicker";

type Created = { success?: boolean; error?: string; id?: string; taskId?: string } | undefined;

function NewTaskForm({
  people,
  me,
  today,
  student,
  revalidateTo,
  onDone,
}: {
  people: readonly TaskPerson[];
  me: string;
  today: string;
  student: PickedStudent | null;
  revalidateTo: string;
  onDone: (created: Created) => void;
}) {
  const [state, action, pending] = useActionState(createTask.bind(null, revalidateTo), undefined as Created);
  const [assignees, setAssignees] = useState<string[]>([me]);
  const [linked, setLinked] = useState<PickedStudent | null>(student);
  const [fileBusy, setFileBusy] = useState(false);
  const handled = useRef<Created>(undefined);

  useEffect(() => {
    if (state?.success && handled.current !== state) {
      handled.current = state;
      onDone(state);
    }
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-3" data-new-task-form>
      <FormField label="Task" htmlFor="task-title">
        <Input id="task-title" name="title" required maxLength={TITLE_MAX} placeholder="What needs doing?" autoFocus />
      </FormField>
      <FormField label="For" hint="Pick yourself, a colleague, or several — each gets their own copy to tick off.">
        <PeoplePicker people={people} me={me} value={assignees} onChange={setAssignees} />
      </FormField>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormField label="Due" htmlFor="task-due">
          <Input id="task-due" name="due_date" type="date" required defaultValue={today} />
        </FormField>
        <FormField label="Time (optional)" htmlFor="task-time">
          <Input id="task-time" name="due_time" type="time" step={900} />
        </FormField>
        <FormField label="Priority" htmlFor="task-priority">
          <Select id="task-priority" name="priority" defaultValue="medium">
            <option value="urgent">Urgent</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </FormField>
      </div>
      <FormField label="About a student or lead">
        <StudentPicker value={linked} onChange={setLinked} />
      </FormField>
      <FormField label="Notes" htmlFor="task-notes">
        <Textarea id="task-notes" name="notes" rows={3} maxLength={NOTES_MAX} placeholder="Anything the person doing it should know" />
      </FormField>
      <FormField label="Checklist (optional)" htmlFor="task-steps" hint={`One step to a line, up to ${STEP_MAX} characters each.`}>
        <Textarea id="task-steps" name="steps" rows={3} placeholder={"Scan the passport\nEmail it to the university"} />
      </FormField>
      <FormField label="Attach a file (optional)" hint="More can be added once the task is made.">
        <FileField name="file" accept={TASK_FILE_ACCEPT} noun="file" hint="PDF, picture, Word, Excel, CSV or text" onChange={(s) => setFileBusy(s.busy)} />
      </FormField>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" pending={pending} disabled={fileBusy || assignees.length === 0} data-create-task>
          {assignees.length > 1 ? `Give to ${assignees.length} people` : assignees[0] && assignees[0] !== me ? "Assign task" : "Add task"}
        </Button>
      </div>
    </form>
  );
}

/**
 * "New task", anywhere: the Tasks page, the dashboard, a student's or a lead's
 * page — linked to them already when it is one of theirs.
 */
export function NewTaskButton({
  people,
  me,
  today,
  student = null,
  revalidateTo,
  label = "New task",
  size = "sm",
  variant = "primary",
  onCreated,
}: {
  people: readonly TaskPerson[];
  me: string;
  today: string;
  student?: PickedStudent | null;
  revalidateTo: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "outline-primary" | "outline";
  onCreated?: (copyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // A fresh form each time it opens, so the last task's words are not still in it.
  const [round, setRound] = useState(0);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
        data-new-task
      >
        <Plus aria-hidden className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={student ? `New task about ${student.label}` : "New task"} className="max-w-xl">
        {open && (
          <NewTaskForm
            key={round}
            people={people}
            me={me}
            today={today}
            student={student}
            revalidateTo={revalidateTo}
            onDone={(created) => {
              setOpen(false);
              toast("Task added.");
              if (created?.id) onCreated?.(created.id);
            }}
          />
        )}
      </Modal>
    </>
  );
}
